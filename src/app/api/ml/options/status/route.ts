import { apiJson } from '@/lib/api/response';
/**
 * ML Options Status API
 * GET /api/ml/options/status
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import { getOptionsMLStatus, checkOptionsTrainingReadiness } from '@/lib/ml/options';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { data: { enabled: false, message: 'ML options features are currently disabled' } }
    );
  }

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const [status, readiness] = await Promise.all([
      getOptionsMLStatus(userId),
      checkOptionsTrainingReadiness(userId),
    ]);

    return apiJson({
      data: {
        ...status,
        readiness,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get ML options status');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get status' },
      { status: 500 }
    );
  }
}

