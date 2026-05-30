import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Sync Activity Logs API
 *
 * GET /api/sync/logs - Get sync activity logs for the current user
 *
 * Query params:
 * - limit: number of logs to return (default 100, max 500)
 * - broker: filter by broker
 * - brokerageAccountId: filter by specific account
 * - eventType: filter by event type (comma-separated)
 * - errorsOnly: only show errors
 * - correlationId: filter by correlation ID (for tracking a single sync flow)
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  getSyncActivityLogs,
  type SyncActivityEventType,
} from '@/lib/services/sync-activity-log';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  broker: z.string().optional(),
  brokerageAccountId: z.string().uuid().optional(),
  eventTypes: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') as SyncActivityEventType[] : undefined)),
  errorsOnly: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  correlationId: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query params
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const parsed = querySchema.safeParse(queryParams);

    if (!parsed.success) {
      return apiJson(
        { error: 'Validation Error', message: parsed.error.issues[0]?.message || 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { limit, broker, brokerageAccountId, eventTypes, errorsOnly, correlationId: filterCorrelationId } = parsed.data;

    log.info({ userId, limit, broker, brokerageAccountId, eventTypes, errorsOnly, filterCorrelationId }, 'Fetching sync activity logs');

    const logs = await getSyncActivityLogs(prisma, userId, {
      limit,
      broker,
      brokerageAccountId,
      eventTypes,
      errorsOnly,
      correlationId: filterCorrelationId,
    });

    // Get summary stats
    const stats = await prisma.syncActivityLog.groupBy({
      by: ['eventType'],
      where: { userId },
      _count: { eventType: true },
    });

    const errorCount = await prisma.syncActivityLog.count({
      where: { userId, isError: true },
    });

    const lastSyncLog = await prisma.syncActivityLog.findFirst({
      where: {
        userId,
        eventType: { in: ['sync_completed', 'sync_failed'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        eventType: true,
        broker: true,
        accountName: true,
        createdAt: true,
        isError: true,
      },
    });

    return apiJson({
      data: {
        logs,
        stats: {
          totalLogs: stats.reduce((sum, s) => sum + s._count.eventType, 0),
          errorCount,
          byEventType: Object.fromEntries(stats.map((s) => [s.eventType, s._count.eventType])),
          lastSync: lastSyncLog,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch sync activity logs');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch sync logs' },
      { status: 500 }
    );
  }
}

