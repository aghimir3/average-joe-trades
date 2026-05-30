import { apiJson } from '@/lib/api/response';
/**
 * GET /api/ml/wheel/roll-alerts
 * Returns positions needing roll decisions with AI recommendations
 *
 * Query params:
 * - accountId: Optional brokerage account ID filter
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getRollAlerts } from '@/lib/ml/wheel';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    // Parse optional account filter
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      accountId: searchParams.get('accountId') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }
    const { accountId } = parsedQuery.data;

    log.info({ userId, accountId }, 'Getting roll alerts');

    const alerts = await getRollAlerts(userId, accountId);

    return apiJson({ alerts });
  } catch (error) {
    log.error({ error }, 'Failed to get roll alerts');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get roll alerts' },
      { status: 500 }
    );
  }
}

