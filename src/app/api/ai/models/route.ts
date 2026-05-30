import { apiJson } from '@/lib/api/response';

import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getMLStatus } from '@/lib/ml/wheel';
import { getOptionsMLStatus } from '@/lib/ml/options';
import { getCommunityModelStatus } from '@/lib/ml/community';
import { getStockModelStatus } from '@/lib/ml/stocks';
import { getModelHealthSummary } from '@/lib/quant/governance';
import { aiInsightsRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;
    const rate = aiInsightsRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const [wheelStatus, optionsStatus, communityStatus, stockStatus, modelHealth] = await Promise.all([
      getMLStatus(userId),
      getOptionsMLStatus(userId),
      getCommunityModelStatus(),
      getStockModelStatus(userId),
      getModelHealthSummary(userId),
    ]);

    return apiJson({
      data: {
        wheelStatus,
        optionsStatus,
        communityStatus,
        stockStatus,
        modelHealth,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch AI model summary');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch model summary' },
      { status: 500 }
    );
  }
}

