import { apiJson } from '@/lib/api/response';

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { getPortfolioRiskDashboard } from '@/lib/quant/services';

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`quant-risk:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      accountId: url.searchParams.get('accountId') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Validation Error', message: parsedQuery.error.issues[0]?.message ?? 'Invalid query' },
        { status: 400 }
      );
    }

    const dashboard = await getPortfolioRiskDashboard(userId, parsedQuery.data.accountId ?? null);
    return apiJson({ data: dashboard });
  } catch (error) {
    log.error({ error }, 'Failed to fetch quant risk dashboard');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch risk dashboard' },
      { status: 500 }
    );
  }
}


