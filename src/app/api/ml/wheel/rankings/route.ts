import { apiJson } from '@/lib/api/response';
/**
 * GET /api/ml/wheel/rankings
 * Returns AI-ranked wheel candidates based on user's trading history
 *
 * Query params:
 * - filter: 'current' (only current holdings) or 'history' (all wheeled symbols)
 *   Defaults to 'current'
 * - accountId: Optional brokerage account ID filter
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getWheelRankings, getMLStatus } from '@/lib/ml/wheel';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  filter: z.enum(['current', 'history']).optional(),
  accountId: z.string().uuid().optional(),
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

    // Parse filter param - default to 'current' (current holdings focused)
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      filter: searchParams.get('filter') ?? undefined,
      accountId: searchParams.get('accountId') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }
    const { filter = 'current', accountId } = parsedQuery.data;
    const currentHoldingsOnly = filter === 'current';

    log.info({ userId, filter, accountId }, 'Getting wheel rankings');

    // Get ML status
    const status = await getMLStatus(userId);

    // Get rankings with filter and optional account
    const rankings = await getWheelRankings(userId, {
      currentHoldingsOnly,
      brokerageAccountId: accountId,
    });

    return apiJson({
      rankings,
      filter,
      hasEnoughData: status.hasEnoughData,
      dataStats: status.dataStats,
      modelInfo: status.modelInfo,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get wheel rankings');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get wheel rankings' },
      { status: 500 }
    );
  }
}

