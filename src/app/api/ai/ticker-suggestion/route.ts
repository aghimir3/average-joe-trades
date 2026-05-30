import { apiJson } from '@/lib/api/response';

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { getTickerAdvisorRecommendation } from '@/lib/quant/services';

const querySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  accountId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`ai-ticker-suggestion:get:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      symbol: url.searchParams.get('symbol') ?? '',
      accountId: url.searchParams.get('accountId') ?? undefined,
    });

    if (!parsed.success) {
      return apiJson(
        { error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid query' },
        { status: 400 }
      );
    }

    const data = await getTickerAdvisorRecommendation({
      userId,
      symbol: parsed.data.symbol,
      accountId: parsed.data.accountId ?? null,
    });

    return apiJson({ data });
  } catch (error) {
    log.error({ error }, 'Failed to generate ticker suggestion');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to generate ticker suggestion' },
      { status: 500 }
    );
  }
}

