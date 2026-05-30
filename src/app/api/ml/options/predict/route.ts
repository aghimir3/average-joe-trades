import { apiJson } from '@/lib/api/response';
/**
 * ML Options Predictions API
 * POST /api/ml/options/predict
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import { prisma } from '@/lib/prisma';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import {
  predictVolatilityRegime,
  predictEntryTiming,
  predictStrategy,
  predictExitStrategy,
  analyzePortfolioRisk,
  findSimilarTrades,
} from '@/lib/ml/options';

const predictSchema = z.object({
  type: z.enum([
    'volatility-regime',
    'entry-timing',
    'strategy',
    'exit-strategy',
    'portfolio-risk',
    'similar-trades',
  ]),
  symbol: z.string().optional(),
  positionId: z.string().optional(),
  tradeSetup: z
    .object({
      symbol: z.string(),
      strategy: z.string().nullable(),
      strike: z.number(),
      dte: z.number(),
      premium: z.number(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options predictions are currently disabled' },
      { status: 503 }
    );
  }

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const body = await request.json();
    const parsed = predictSchema.safeParse(body);

    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid prediction request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { type, symbol, positionId, tradeSetup } = parsed.data;

    log.info({ userId, predictionType: type, symbol }, 'Processing ML prediction');

    let prediction;
    let loggedPredictionType: string | null = null;
    const requestStartedAt = new Date();

    switch (type) {
      case 'volatility-regime':
        if (!symbol) {
          return apiJson(
            { error: 'Bad Request', message: 'Symbol required for volatility regime prediction' },
            { status: 400 }
          );
        }
        prediction = await predictVolatilityRegime(userId, symbol);
        loggedPredictionType = 'regime';
        break;

      case 'entry-timing':
        if (!symbol) {
          return apiJson(
            { error: 'Bad Request', message: 'Symbol required for entry timing prediction' },
            { status: 400 }
          );
        }
        prediction = await predictEntryTiming(userId, symbol);
        loggedPredictionType = 'entry_score';
        break;

      case 'strategy':
        if (!symbol) {
          return apiJson(
            { error: 'Bad Request', message: 'Symbol required for strategy prediction' },
            { status: 400 }
          );
        }
        prediction = await predictStrategy(userId, symbol);
        loggedPredictionType = 'strategy';
        break;

      case 'exit-strategy':
        if (!positionId) {
          return apiJson(
            { error: 'Bad Request', message: 'Position ID required for exit strategy prediction' },
            { status: 400 }
          );
        }
        prediction = await predictExitStrategy(userId, positionId);
        loggedPredictionType = 'exit_strategy';
        break;

      case 'portfolio-risk':
        prediction = await analyzePortfolioRisk(userId);
        loggedPredictionType = 'risk_score';
        break;

      case 'similar-trades':
        if (!tradeSetup) {
          return apiJson(
            { error: 'Bad Request', message: 'Trade setup required for similar trades search' },
            { status: 400 }
          );
        }
        prediction = await findSimilarTrades(userId, tradeSetup);
        break;

      default:
        return apiJson(
          { error: 'Bad Request', message: 'Unknown prediction type' },
          { status: 400 }
        );
    }

    let predictionLogId: string | null = null;
    if (loggedPredictionType) {
      const createdAfter = new Date(requestStartedAt.getTime() - 2 * 60 * 1000);
      const latestLog = await prisma.mLPredictionLog.findFirst({
        where: {
          userId,
          predictionType: loggedPredictionType,
          createdAt: { gte: createdAfter },
          ...(symbol ? { symbol } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      predictionLogId = latestLog?.id ?? null;
    }

    return apiJson({ data: prediction, predictionLogId });
  } catch (error) {
    log.error({ error }, 'ML prediction failed');
    return apiJson(
      { error: 'Internal Server Error', message: 'Prediction failed' },
      { status: 500 }
    );
  }
}

