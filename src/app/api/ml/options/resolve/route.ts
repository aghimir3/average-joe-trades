import { apiJson } from '@/lib/api/response';
/**
 * ML Options Prediction Resolution API
 * POST /api/ml/options/resolve
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { resolvePrediction } from '@/lib/ml/options';
import { prisma } from '@/lib/prisma';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const resolveSchema = z.object({
  predictionId: z.string().min(1),
  wasAccurate: z.boolean(),
  actualOutcome: z.unknown(),
  errorMagnitude: z.number().min(0).optional(),
});

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const body = await request.json();
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid resolution payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const prediction = await prisma.mLPredictionLog.findFirst({
      where: {
        id: parsed.data.predictionId,
        userId,
      },
      select: { id: true, resolvedAt: true },
    });

    if (!prediction) {
      return apiJson(
        { error: 'Not Found', message: 'Prediction not found' },
        { status: 404 }
      );
    }

    if (prediction.resolvedAt) {
      return apiJson({
        data: { resolved: true, alreadyResolved: true },
      });
    }

    await resolvePrediction(
      parsed.data.predictionId,
      parsed.data.actualOutcome,
      parsed.data.wasAccurate,
      parsed.data.errorMagnitude
    );

    return apiJson({
      data: { resolved: true },
    });
  } catch (error) {
    log.error({ error }, 'Failed to resolve options prediction');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to resolve prediction' },
      { status: 500 }
    );
  }
}

