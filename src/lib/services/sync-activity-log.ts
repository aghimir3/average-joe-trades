/**
 * Sync Activity Logging Service
 *
 * Tracks user-facing sync workflow events for debugging and visibility.
 * Events are logged to the syncActivityLogs table.
 */

import { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'sync-activity-log' });

/**
 * Sync activity event types
 */
export type SyncActivityEventType =
  | 'connection_initiated'    // User started OAuth flow
  | 'oauth_completed'         // OAuth callback received
  | 'accounts_discovered'     // Accounts found after OAuth
  | 'account_selected'        // User selected account(s) to sync
  | 'sync_started'            // Sync process began
  | 'sync_progress'           // Intermediate sync progress
  | 'sync_completed'          // Sync finished successfully
  | 'sync_failed'             // Sync failed with error
  | 'account_created'         // BrokerageAccount created in DB
  | 'transactions_fetched'    // Transactions retrieved from API
  | 'positions_synced'        // Positions synced from API
  | 'derivation_completed'    // FIFO derivation finished
  | 'account_disconnected';   // Account removed/disconnected

/**
 * Log entry for sync activity
 */
export interface SyncActivityLogEntry {
  userId: string;
  eventType: SyncActivityEventType;
  broker: string;
  brokerageAccountId?: string;
  accountName?: string;
  message: string;
  details?: Record<string, unknown>;
  isError?: boolean;
  errorCode?: string;
  correlationId?: string;
}

/**
 * Log a sync activity event
 */
export async function logSyncActivity(
  prisma: PrismaClient,
  entry: SyncActivityLogEntry
): Promise<void> {
  try {
    await prisma.syncActivityLog.create({
      data: {
        userId: entry.userId,
        eventType: entry.eventType,
        broker: entry.broker,
        brokerageAccountId: entry.brokerageAccountId,
        accountName: entry.accountName,
        message: entry.message,
        details: entry.details ? JSON.stringify(entry.details) : null,
        isError: entry.isError ?? false,
        errorCode: entry.errorCode,
        correlationId: entry.correlationId,
      },
    });

    // Also log to Pino for immediate visibility
    const logFn = entry.isError ? log.error : log.info;
    logFn(
      {
        eventType: entry.eventType,
        broker: entry.broker,
        accountName: entry.accountName,
        correlationId: entry.correlationId,
        ...(entry.details || {}),
      },
      `[SYNC] ${entry.message}`
    );
  } catch (error) {
    // Don't let logging failures break the main flow
    log.error({ error, entry }, 'Failed to log sync activity');
  }
}

/**
 * Helper to create a correlation ID for tracking related events
 */
export function createSyncCorrelationId(): string {
  return `sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Get recent sync activity logs for a user
 */
export async function getSyncActivityLogs(
  prisma: PrismaClient,
  userId: string,
  options?: {
    limit?: number;
    broker?: string;
    brokerageAccountId?: string;
    eventTypes?: SyncActivityEventType[];
    errorsOnly?: boolean;
    correlationId?: string;
  }
): Promise<Array<{
  id: string;
  eventType: string;
  broker: string;
  accountName: string | null;
  message: string;
  details: Record<string, unknown> | null;
  isError: boolean;
  errorCode: string | null;
  correlationId: string | null;
  createdAt: Date;
}>> {
  const logs = await prisma.syncActivityLog.findMany({
    where: {
      userId,
      ...(options?.broker && { broker: options.broker }),
      ...(options?.brokerageAccountId && { brokerageAccountId: options.brokerageAccountId }),
      ...(options?.eventTypes && { eventType: { in: options.eventTypes } }),
      ...(options?.errorsOnly && { isError: true }),
      ...(options?.correlationId && { correlationId: options.correlationId }),
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
    select: {
      id: true,
      eventType: true,
      broker: true,
      accountName: true,
      message: true,
      details: true,
      isError: true,
      errorCode: true,
      correlationId: true,
      createdAt: true,
    },
  });

  return logs.map((l) => ({
    ...l,
    details: l.details ? JSON.parse(l.details) : null,
  }));
}

/**
 * Convenience function for logging connection initiation
 */
export async function logConnectionInitiated(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  correlationId: string,
  details?: Record<string, unknown>
): Promise<void> {
  await logSyncActivity(prisma, {
    userId,
    eventType: 'connection_initiated',
    broker,
    message: `User initiated ${broker} connection`,
    details,
    correlationId,
  });
}

/**
 * Convenience function for logging OAuth completion
 */
export async function logOAuthCompleted(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  correlationId: string,
  accountCount: number
): Promise<void> {
  await logSyncActivity(prisma, {
    userId,
    eventType: 'oauth_completed',
    broker,
    message: `OAuth completed, ${accountCount} account(s) available`,
    details: { accountCount },
    correlationId,
  });
}

/**
 * Convenience function for logging account discovery
 */
export async function logAccountsDiscovered(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  correlationId: string,
  accounts: Array<{ id: string; name: string; number?: string }>
): Promise<void> {
  await logSyncActivity(prisma, {
    userId,
    eventType: 'accounts_discovered',
    broker,
    message: `Discovered ${accounts.length} account(s): ${accounts.map((a) => a.name).join(', ')}`,
    details: {
      accountCount: accounts.length,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    },
    correlationId,
  });
}

/**
 * Convenience function for logging sync start
 */
export async function logSyncStarted(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  brokerageAccountId: string,
  accountName: string,
  correlationId: string
): Promise<void> {
  await logSyncActivity(prisma, {
    userId,
    eventType: 'sync_started',
    broker,
    brokerageAccountId,
    accountName,
    message: `Starting sync for ${accountName}`,
    correlationId,
  });
}

/**
 * Convenience function for logging sync completion
 */
export async function logSyncCompleted(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  brokerageAccountId: string,
  accountName: string,
  correlationId: string,
  stats: { transactionsImported: number; positionsSynced?: number }
): Promise<void> {
  await logSyncActivity(prisma, {
    userId,
    eventType: 'sync_completed',
    broker,
    brokerageAccountId,
    accountName,
    message: `Sync completed: ${stats.transactionsImported} transactions imported`,
    details: stats,
    correlationId,
  });
}

/**
 * Convenience function for logging sync failure
 */
export async function logSyncFailed(
  prisma: PrismaClient,
  userId: string,
  broker: string,
  brokerageAccountId: string | undefined,
  accountName: string | undefined,
  correlationId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  await logSyncActivity(prisma, {
    userId,
    eventType: 'sync_failed',
    broker,
    brokerageAccountId,
    accountName,
    message: `Sync failed: ${errorMessage}`,
    details: { errorMessage },
    isError: true,
    errorCode,
    correlationId,
  });
}
