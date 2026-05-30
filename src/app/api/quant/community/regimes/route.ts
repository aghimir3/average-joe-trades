import { apiJson } from '@/lib/api/response';

import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { getCommunityRegimeInsights } from '@/lib/quant/services';

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`quant-community-regime:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const insights = await getCommunityRegimeInsights();

    // Only expose meaningful buckets by default.
    const filtered = insights.filter((insight) => insight.significance !== 'low');

    return apiJson({
      data: {
        insights: filtered,
        asOf: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch community regime insights');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch community regime insights' },
      { status: 500 }
    );
  }
}


