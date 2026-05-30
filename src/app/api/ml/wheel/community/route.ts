import { apiJson } from '@/lib/api/response';
/**
 * GET /api/ml/wheel/community
 * Returns community insights based on aggregated wheel trade data across all users.
 *
 * Query params:
 * - symbol: Optional - get insight for specific ticker
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import {
  getAllCommunityInsights,
  getCommunityInsight,
  getAggregatedModelStatus,
} from '@/lib/ml/wheel/aggregated-model';
import {
  mlInferenceRateLimiter,
  rateLimitResponse,
} from '@/lib/security/rate-limit';

const querySchema = z.object({
  symbol: z.string().trim().regex(/^[A-Za-z.\-]{1,15}$/).optional(),
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
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid symbol parameter' },
        { status: 400 }
      );
    }
    const symbol = parsedQuery.data.symbol?.toUpperCase() ?? null;

    log.info({ userId, symbol }, 'Getting community insights');

    // Get model status (wrapped in try-catch for better error reporting)
    let status;
    try {
      status = await getAggregatedModelStatus();
    } catch (statusError) {
      log.error({ statusError }, 'Failed to get aggregated model status');
      // Return minimal status on error
      status = {
        hasModel: false,
        lastTrainedAt: null,
        totalTickers: 0,
        totalTrades: 0,
        uniqueUsers: 0,
      };
    }

    if (symbol) {
      // Get insight for specific ticker
      const insight = await getCommunityInsight(symbol);

      if (!insight) {
        return apiJson({
          insight: null,
          message: `No community data available for ${symbol.toUpperCase()}`,
          status,
        });
      }

      return apiJson({
        insight,
        status,
      });
    }

    // Get all community insights
    let insights: Awaited<ReturnType<typeof getAllCommunityInsights>> = [];
    try {
      insights = await getAllCommunityInsights();
    } catch (insightsError) {
      log.error({ insightsError }, 'Failed to get all community insights');
      // Return empty array on error
      insights = [];
    }

    return apiJson({
      insights,
      status,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get community insights');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get community insights' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return apiJson(
    {
      error: 'Method Not Allowed',
      message: 'Community model training is not available in the public self-hosted build.',
    },
    { status: 405 }
  );
}


