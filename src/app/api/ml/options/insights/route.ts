import { apiJson } from '@/lib/api/response';
/**
 * ML Options Insights API
 * GET /api/ml/options/insights - Get daily insights and alerts
 * POST /api/ml/options/insights - Generate new insights
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import {
  generateDailyInsights,
  getDailyInsights,
  getInsightsHistory,
  refreshDailyInsights,
  checkPositionHealth,
  getActiveAlerts,
  dismissAlert,
  actionAlert,
} from '@/lib/ml/options';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const insightsQuerySchema = z.object({
  type: z.enum(['daily', 'alerts', 'history']).optional(),
  limit: z.string().optional(),
  date: z.string().optional(),
});

const insightsActionSchema = z.object({
  action: z
    .enum(['generate', 'refresh', 'check-health', 'dismiss-alert', 'action-alert'])
    .optional(),
  alertId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options insights are currently disabled' },
      { status: 503 }
    );
  }

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const { searchParams } = new URL(request.url);
    const parsedQuery = insightsQuerySchema.safeParse({
      type: searchParams.get('type') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      date: searchParams.get('date') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }
    const { type = 'daily', limit: limitParam, date: dateParam } = parsedQuery.data;

    if (type === 'alerts') {
      const alerts = await getActiveAlerts(userId);
      return apiJson({ data: { alerts } });
    }

    if (type === 'history') {
      const limit = limitParam === undefined ? 7 : Number(limitParam);
      if (!Number.isInteger(limit) || limit < 1 || limit > 90) {
        return apiJson(
          { error: 'Bad Request', message: 'limit must be an integer between 1 and 90' },
          { status: 400 }
        );
      }
      const history = await getInsightsHistory(userId, limit);
      return apiJson({ data: { history } });
    }

    // Default: get today's insights
    let date: Date | undefined;
    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (Number.isNaN(parsedDate.getTime())) {
        return apiJson(
          { error: 'Bad Request', message: 'date must be a valid ISO date string' },
          { status: 400 }
        );
      }
      date = parsedDate;
    }
    const insights = await getDailyInsights(userId, date);

    return apiJson({ data: { insights } });
  } catch (error) {
    log.error({ error }, 'Failed to get ML insights');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get insights' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options insights are currently disabled' },
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
    const parsedBody = insightsActionSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid action payload', details: parsedBody.error.issues },
        { status: 400 }
      );
    }
    const action = parsedBody.data.action ?? 'generate';

    if (action === 'generate') {
      log.info({ userId }, 'Generating daily insights');
      const insights = await generateDailyInsights(userId);
      return apiJson({ data: { insights } });
    }

    if (action === 'refresh') {
      log.info({ userId }, 'Refreshing daily insights (force regenerate)');
      const insights = await refreshDailyInsights(userId);
      return apiJson({ data: { insights } });
    }

    if (action === 'check-health') {
      log.info({ userId }, 'Checking position health');
      const alerts = await checkPositionHealth(userId);
      return apiJson({ data: { alerts } });
    }

    if (action === 'dismiss-alert') {
      const alertId = parsedBody.data.alertId;
      if (!alertId) {
        return apiJson(
          { error: 'Bad Request', message: 'Alert ID required' },
          { status: 400 }
        );
      }
      const success = await dismissAlert(alertId, userId);
      return apiJson({ data: { success } });
    }

    if (action === 'action-alert') {
      const alertId = parsedBody.data.alertId;
      if (!alertId) {
        return apiJson(
          { error: 'Bad Request', message: 'Alert ID required' },
          { status: 400 }
        );
      }
      const success = await actionAlert(alertId, userId);
      return apiJson({ data: { success } });
    }

    return apiJson(
      { error: 'Bad Request', message: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    log.error({ error }, 'Failed to process ML insights action');
    return apiJson(
      { error: 'Internal Server Error', message: 'Action failed' },
      { status: 500 }
    );
  }
}

