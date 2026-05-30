import { apiJson } from '@/lib/api/response';
/**
 * ML Options P&L Attribution API
 * GET /api/ml/options/attribution - Get P&L attribution analysis
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import {
  calculatePnLAttribution,
  calculatePortfolioPnLAttribution,
  getAttributionByStrategy,
} from '@/lib/ml/options';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  type: z.enum(['portfolio', 'trade', 'by-strategy']).optional(),
  tradeId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options attribution is currently disabled' },
      { status: 503 }
    );
  }

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      type: searchParams.get('type') ?? undefined,
      tradeId: searchParams.get('tradeId') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }
    const {
      type = 'portfolio',
      tradeId,
      startDate: startDateStr,
      endDate: endDateStr,
    } = parsedQuery.data;

    if (type === 'trade' && tradeId) {
      const attribution = await calculatePnLAttribution(userId, tradeId);
      return apiJson({ data: attribution });
    }

    if (type === 'trade' && !tradeId) {
      return apiJson(
        { error: 'Bad Request', message: 'tradeId is required when type=trade' },
        { status: 400 }
      );
    }

    if (type === 'by-strategy') {
      const attributionMap = await getAttributionByStrategy(userId);
      // Convert Map to object for JSON serialization
      const attributionObj: Record<string, unknown> = {};
      for (const [strategy, attr] of attributionMap) {
        attributionObj[strategy] = attr;
      }
      return apiJson({ data: attributionObj });
    }

    // Default: portfolio attribution
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;
    if (
      (startDate && Number.isNaN(startDate.getTime())) ||
      (endDate && Number.isNaN(endDate.getTime()))
    ) {
      return apiJson(
        { error: 'Bad Request', message: 'startDate/endDate must be valid ISO date strings' },
        { status: 400 }
      );
    }
    if (startDate && endDate && startDate > endDate) {
      return apiJson(
        { error: 'Bad Request', message: 'startDate must be before endDate' },
        { status: 400 }
      );
    }
    const attribution = await calculatePortfolioPnLAttribution(userId, startDate, endDate);

    return apiJson({ data: attribution });
  } catch (error) {
    log.error({ error }, 'Failed to get P&L attribution');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get attribution' },
      { status: 500 }
    );
  }
}

