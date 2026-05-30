import { apiJson } from '@/lib/api/response';
/**
 * ML Options Ensemble API
 * GET /api/ml/options/ensemble - Get ensemble predictions
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import {
  getEnsemblePrediction,
  getPositionEnsemblePrediction,
  getPortfolioEnsemblePredictions,
} from '@/lib/ml/options';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  type: z.enum(['symbol', 'position', 'portfolio']).optional(),
  symbol: z.string().trim().min(1).max(20).optional(),
  positionId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  strategy: z.string().trim().min(1).max(50).optional(),
  strike: z.string().optional(),
  dte: z.string().optional(),
  premium: z.string().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options ensemble is currently disabled' },
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
      symbol: searchParams.get('symbol') ?? undefined,
      positionId: searchParams.get('positionId') ?? undefined,
      accountId: searchParams.get('accountId') ?? undefined,
      strategy: searchParams.get('strategy') ?? undefined,
      strike: searchParams.get('strike') ?? undefined,
      dte: searchParams.get('dte') ?? undefined,
      premium: searchParams.get('premium') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }

    const {
      type = 'symbol',
      symbol,
      positionId,
      accountId,
      strategy,
      strike: strikeParam,
      dte: dteParam,
      premium: premiumParam,
    } = parsedQuery.data;

    log.info({ userId, type, symbol, positionId }, 'Getting ensemble prediction');

    switch (type) {
      case 'symbol': {
        if (!symbol) {
          return apiJson(
            { error: 'Bad Request', message: 'Symbol required for symbol prediction' },
            { status: 400 }
          );
        }

        // Parse optional trade setup
        let strike: number | undefined;
        if (strikeParam !== undefined) {
          const parsedStrike = Number(strikeParam);
          if (!Number.isFinite(parsedStrike) || parsedStrike <= 0) {
            return apiJson(
              { error: 'Bad Request', message: 'strike must be a positive number' },
              { status: 400 }
            );
          }
          strike = parsedStrike;
        }

        let dte: number | undefined;
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
          dte = parsedDte;
        }

        let premium: number | undefined;
        if (premiumParam !== undefined) {
          const parsedPremium = Number(premiumParam);
          if (!Number.isFinite(parsedPremium) || parsedPremium < 0 || parsedPremium > 1_000_000) {
            return apiJson(
              { error: 'Bad Request', message: 'premium must be a number between 0 and 1000000' },
              { status: 400 }
            );
          }
          premium = parsedPremium;
        }

        const hasTradeSetup =
          strategy !== undefined ||
          strike !== undefined ||
          dte !== undefined ||
          premium !== undefined;
        const tradeSetup = hasTradeSetup
          ? { strategy, strike, dte, premium }
          : undefined;

        const prediction = await getEnsemblePrediction(userId, symbol, tradeSetup);
        return apiJson({ data: prediction });
      }

      case 'position': {
        if (!positionId) {
          return apiJson(
            { error: 'Bad Request', message: 'Position ID required for position prediction' },
            { status: 400 }
          );
        }

        const prediction = await getPositionEnsemblePrediction(userId, positionId);
        return apiJson({ data: prediction });
      }

      case 'portfolio': {
        // Optional account filter - null/undefined means all accounts
        const result = await getPortfolioEnsemblePredictions(userId, accountId ?? null);
        return apiJson({ data: result });
      }

      default:
        return apiJson(
          { error: 'Bad Request', message: 'Invalid type. Use: symbol, position, or portfolio' },
          { status: 400 }
        );
    }
  } catch (error) {
    log.error({ error }, 'Ensemble prediction failed');
    return apiJson(
      { error: 'Internal Server Error', message: 'Ensemble prediction failed' },
      { status: 500 }
    );
  }
}

