import { apiJson } from '@/lib/api/response';

import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { getModelHealthSummary } from '@/lib/quant/governance';

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`quant-model-health:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const models = await getModelHealthSummary(userId);
    const retrainCandidates = models.filter((model) => {
      const driftScore = model.latestEvaluation?.driftScore ?? null;
      if (driftScore === null) return false;
      return driftScore >= 0.35;
    });

    return apiJson({
      data: {
        models,
        summary: {
          totalModels: models.length,
          stableModels: models.filter((model) => model.isStable).length,
          retrainRecommended: retrainCandidates.length,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch quant model health');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch model health' },
      { status: 500 }
    );
  }
}


