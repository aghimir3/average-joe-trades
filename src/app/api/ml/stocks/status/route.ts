import { apiJson } from '@/lib/api/response';
/**
 * ML Stocks Status API
 * GET /api/ml/stocks/status
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getStockModelStatus } from '@/lib/ml/stocks';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const status = await getStockModelStatus(userId);

    return apiJson({ data: status });
  } catch (error) {
    log.error({ error }, 'Failed to get stock model status');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get stock model status' },
      { status: 500 }
    );
  }
}

