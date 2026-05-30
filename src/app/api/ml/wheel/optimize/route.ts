import { apiJson } from '@/lib/api/response';
/**
 * GET /api/ml/wheel/optimize
 * Returns AI-optimized strike and DTE recommendation for a symbol
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getStrikeRecommendation } from '@/lib/ml/wheel';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  direction: z.enum(['csp', 'covered_call']),
  currentPrice: z.string().optional(),
  dte: z.string().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      symbol: searchParams.get('symbol') ?? undefined,
      direction: searchParams.get('direction') ?? undefined,
      currentPrice: searchParams.get('currentPrice') ?? undefined,
      dte: searchParams.get('dte') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }
    const { symbol, direction, currentPrice: currentPriceParam, dte: dteParam } = parsedQuery.data;
    let currentPrice: number | undefined;
    if (currentPriceParam !== undefined) {
      const parsedCurrentPrice = Number(currentPriceParam);
      if (
        !Number.isFinite(parsedCurrentPrice) ||
        parsedCurrentPrice <= 0 ||
        parsedCurrentPrice > 1_000_000
      ) {
        return apiJson(
          { error: 'Bad Request', message: 'currentPrice must be a positive number up to 1000000' },
          { status: 400 }
        );
      }
      currentPrice = parsedCurrentPrice;
    }

    let targetDte: number | undefined;
    if (dteParam !== undefined) {
      const parsedDte = Number(dteParam);
      if (
        !Number.isInteger(parsedDte) ||
        !Number.isFinite(parsedDte) ||
        parsedDte < 0 ||
        parsedDte > 3650
      ) {
        return apiJson(
          { error: 'Bad Request', message: 'dte must be an integer between 0 and 3650' },
          { status: 400 }
        );
      }
      targetDte = parsedDte;
    }

    log.info({ userId, symbol, direction, currentPrice, targetDte }, 'Getting strike optimization');

    const recommendation = await getStrikeRecommendation(userId, symbol, direction, currentPrice, targetDte);

    if (!recommendation) {
      return apiJson(
        { error: 'Not Found', message: 'Not enough data to generate recommendation' },
        { status: 404 }
      );
    }

    return apiJson({ recommendation });
  } catch (error) {
    log.error({ error }, 'Failed to get strike optimization');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get strike optimization' },
      { status: 500 }
    );
  }
}

