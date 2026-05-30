import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Connection API
 *
 * Handles user registration and brokerage connection flow.
 *
 * POST /api/sync/connect - Get connection link for a broker
 * GET /api/sync/connect - Get connection status
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { isSnapTradeConfigured } from '@/lib/services/snaptrade';
import {
  registerSnapTradeUserLogged,
  getConnectionLinkLogged,
  getConnectedAccountsLogged,
  getBrokerageAuthorizationsLogged,
  SNAPTRADE_SERVICE,
} from '@/lib/services/snaptrade-logged';
import {
  logSyncActivity,
  createSyncCorrelationId,
} from '@/lib/services/sync-activity-log';
import { z } from 'zod';

const connectSchema = z.object({
  // Use nullish() to accept both null and undefined from client
  broker: z.enum(['robinhood', 'schwab', 'fidelity', 'interactive_brokers']).nullish().transform(val => val ?? undefined),
  redirectUri: z.string().url().nullish().transform(val => val ?? undefined),
});

// Map our broker names to SnapTrade broker codes (slugs from SnapTrade's brokerage support page)
const BROKER_MAP: Record<string, string> = {
  robinhood: 'ROBINHOOD',
  schwab: 'SCHWAB',
  fidelity: 'FIDELITY',
  interactive_brokers: 'INTERACTIVE-BROKERS-FLEX',
};

/**
 * POST /api/sync/connect
 * Generate a connection link for the user to authorize their brokerage
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Check if SnapTrade is configured
    if (!isSnapTradeConfigured()) {
      return apiJson(
        {
          error: 'Not Configured',
          message: 'SnapTrade integration is not configured. Contact support.',
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { broker, redirectUri } = connectSchema.parse(body);

    log.info({ userId, broker }, 'Generating connection link');

    // Create sync correlation ID for tracking this connection flow
    const syncCorrelationId = createSyncCorrelationId();

    // Log connection initiation
    await logSyncActivity(prisma, {
      userId,
      eventType: 'connection_initiated',
      broker: broker || 'any',
      message: `User initiated ${broker || 'brokerage'} connection`,
      details: { redirectUri: redirectUri ? 'custom' : 'default' },
      correlationId: syncCorrelationId,
    });

    // Get or create SnapTrade credentials for this user
    let snaptradeUserId: string;
    let snaptradeUserSecret: string;

    // Check if user already has ACTIVE SnapTrade credentials in ServiceCredential table
    const existingCredential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    // Create logging context
    const logCtx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: 'connect_brokerage',
    };

    if (existingCredential) {
      snaptradeUserId = existingCredential.serviceUserId;
      snaptradeUserSecret = existingCredential.serviceUserSecret;
      log.debug({ snaptradeUserId }, 'Using existing SnapTrade credentials');
    } else {
      // Register new SnapTrade user
      const credentials = await registerSnapTradeUserLogged(logCtx, userId);
      snaptradeUserId = credentials.userId;
      snaptradeUserSecret = credentials.userSecret;

      // Save credentials to ServiceCredential table (upsert to handle inactive credentials)
      await prisma.serviceCredential.upsert({
        where: {
          userId_service: {
            userId,
            service: SNAPTRADE_SERVICE,
          },
        },
        update: {
          serviceUserId: snaptradeUserId,
          serviceUserSecret: snaptradeUserSecret,
          isActive: true,
          syncError: null,
        },
        create: {
          userId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: snaptradeUserId,
          serviceUserSecret: snaptradeUserSecret,
          isActive: true,
        },
      });

      log.info({ snaptradeUserId }, 'Registered new SnapTrade user');
    }

    // Generate connection link
    // Redirect to accounts page with broker parameter so user can select accounts
    const brokerParam = broker ? `&broker=${broker}` : '';
    const defaultRedirect =
      redirectUri || `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/accounts?connected=true${brokerParam}`;

    const connectionLink = await getConnectionLinkLogged(
      logCtx,
      { userId: snaptradeUserId, userSecret: snaptradeUserSecret },
      defaultRedirect,
      broker ? BROKER_MAP[broker] : undefined
    );

    return apiJson({
      data: {
        connectionLink,
        broker: broker || 'any',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    log.error(
      {
        errorName,
        errorMessage,
        errorStack,
        errorDetails: error,
        correlationId,
      },
      'Failed to generate connection link'
    );

    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      return apiJson(
        { error: 'Validation Error', message: zodError.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    // Return more detailed error in development
    return apiJson(
      {
        error: 'Connection Failed',
        message: process.env.NODE_ENV === 'development'
          ? `SnapTrade error: ${errorMessage}`
          : 'Failed to connect to brokerage. Please try again.',
        details: process.env.NODE_ENV === 'development' ? { errorName, errorMessage } : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/connect
 * Get connected accounts status with sync information
 */
export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const shouldRefresh = searchParams.get('refresh') === 'true';

    // Check if SnapTrade is configured
    if (!isSnapTradeConfigured()) {
      return apiJson({
        data: {
          configured: false,
          isConnected: false,
          hasCredentials: false,
          recentConnectionAttempts: {},
          connections: [],
          accounts: [],
          syncedAccounts: [],
        },
      });
    }

    // Get user's ACTIVE SnapTrade credentials from ServiceCredential table
    const credential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    if (!credential) {
      const recentConnectionAttempts = await getRecentConnectionAttempts(userId);
      return apiJson({
        data: {
          configured: true,
          isConnected: false,
          hasCredentials: false,
          recentConnectionAttempts,
          connections: [],
          accounts: [],
          syncedAccounts: [],
        },
      });
    }

    // Create logging context
    const logCtx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: shouldRefresh ? 'refresh_accounts' : 'get_connection_status',
    };

    const credentials = {
      userId: credential.serviceUserId,
      userSecret: credential.serviceUserSecret,
    };

    if (shouldRefresh) {
      log.info({ userId }, 'Account status refresh requested; SnapTrade realtime plan returns live account data on read');
    }

    // Get connected accounts from SnapTrade
    const accounts = await getConnectedAccountsLogged(logCtx, credentials);

    let connections: Awaited<ReturnType<typeof getBrokerageAuthorizationsLogged>> = [];
    let connectionsLookupFailed = false;
    try {
      connections = await getBrokerageAuthorizationsLogged(logCtx, {
        userId: credential.serviceUserId,
        userSecret: credential.serviceUserSecret,
      });
    } catch (connectionError) {
      connectionsLookupFailed = true;
      log.warn({ error: connectionError }, 'Failed to fetch SnapTrade connections, continuing with accounts only');
    }

    const recentConnectionAttempts = await getRecentConnectionAttempts(userId);

    // Get linked BrokerageAccounts to determine sync status (only active accounts)
    const linkedAccounts = await prisma.brokerageAccount.findMany({
      where: {
        userId,
        externalAccountId: { not: null },
        isActive: true, // Only consider active accounts as "linked"
      },
      select: {
        id: true,
        name: true,
        broker: true,
        externalAccountId: true,
        brokerageAuthorizationId: true,
        _count: {
          select: {
            ledgerEvents: true,
          },
        },
      },
    });

    // Create a map of external account ID to linked account info
    const linkedAccountMap = new Map(
      linkedAccounts.map((acc) => [
        acc.externalAccountId,
        {
          brokerageAccountId: acc.id,
          brokerageAccountName: acc.name,
          broker: acc.broker,
          transactionCount: acc._count.ledgerEvents,
        },
      ])
    );

    // Log detailed sync status for each account
    for (const acc of accounts) {
      const transactionSyncStatus = acc.sync_status?.transactions;
      log.info(
        {
          accountId: acc.id,
          accountName: acc.name,
          institutionName: acc.institutionName,
          syncStatus: {
            transactions: transactionSyncStatus,
            holdings: acc.sync_status?.holdings,
          },
          isInitialSyncComplete: transactionSyncStatus?.initial_sync_completed ?? false,
          firstTransactionDate: transactionSyncStatus?.first_transaction_date ?? null,
          lastSuccessfulSync: transactionSyncStatus?.last_successful_sync ?? null,
        },
        'Account sync status from SnapTrade'
      );
    }

    const activeConnections = connections.filter((connection) => !connection.disabled);
    const connectedAccountIds = new Set(accounts.map((account) => account.id));
    const activeConnectionIds = new Set(activeConnections.map((connection) => connection.id));

    const orphanedLinkedAccounts = linkedAccounts
      .filter((account) => account.externalAccountId && !connectedAccountIds.has(account.externalAccountId))
      .map((account) => {
        const missingConnection =
          !connectionsLookupFailed
          && account.brokerageAuthorizationId
          && !activeConnectionIds.has(account.brokerageAuthorizationId);

        return {
          brokerageAccountId: account.id,
          brokerageAccountName: account.name,
          broker: account.broker,
          externalAccountId: account.externalAccountId,
          brokerageAuthorizationId: account.brokerageAuthorizationId,
          transactionCount: account._count.ledgerEvents,
          reason: missingConnection ? 'missing_connection' : 'missing_remote_account',
        };
      });

    if (orphanedLinkedAccounts.length > 0) {
      log.warn(
        {
          userId,
          orphanedCount: orphanedLinkedAccounts.length,
          orphanedLinkedAccounts,
        },
        'Found active linked accounts not currently returned by SnapTrade'
      );
    }

    log.info(
      {
        userId,
        connectedCount: accounts.length,
        connectionCount: connections.length,
        activeConnectionCount: activeConnections.length,
        syncedCount: linkedAccounts.length,
        orphanedCount: orphanedLinkedAccounts.length,
      },
      'Retrieved connected accounts with sync status'
    );

    // Log accounts discovered (if any accounts exist)
    if (accounts.length > 0) {
      const uniqueBrokers = [...new Set(accounts.map((a) => a.institutionName))];
      await logSyncActivity(prisma, {
        userId,
        eventType: 'accounts_discovered',
        broker: uniqueBrokers[0] || 'unknown',
        message: `Found ${accounts.length} account(s) from ${uniqueBrokers.join(', ')}`,
        details: {
          accountCount: accounts.length,
          brokers: uniqueBrokers,
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            institution: a.institutionName,
            syncStatus: a.sync_status?.transactions?.initial_sync_completed ? 'ready' : 'syncing',
          })),
        },
        correlationId,
      });
    }

    return apiJson({
      data: {
        configured: true,
        isConnected: accounts.length > 0 || activeConnections.length > 0,
        hasCredentials: true,
        lastSyncAt: credential.lastSyncAt,
        syncStatus: credential.syncStatus,
        recentConnectionAttempts,
        connections,
        accounts: accounts.map((acc) => {
          const linked = linkedAccountMap.get(acc.id);
          // Check if SnapTrade has completed initial transaction sync
          const transactionSyncStatus = acc.sync_status?.transactions;
          const isInitialSyncComplete = transactionSyncStatus?.initial_sync_completed ?? false;
          const firstTransactionDate = transactionSyncStatus?.first_transaction_date ?? null;
          const lastSuccessfulSync = transactionSyncStatus?.last_successful_sync ?? null;

          // Determine sync status:
          // - 'ready': initial sync completed, transaction data available
          // - 'syncing': still fetching from broker (< 10 minutes)
          // - 'limited': been "syncing" for > 10 minutes, likely limited/unavailable data
          let syncStatus: 'ready' | 'syncing' | 'limited' = 'syncing';
          if (isInitialSyncComplete) {
            syncStatus = 'ready';
          } else if (lastSuccessfulSync) {
            // If we have a lastSuccessfulSync but initial_sync_completed is false,
            // and it's been more than 10 minutes, the account likely has limited data
            const syncTime = new Date(lastSuccessfulSync).getTime();
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            if (syncTime < tenMinutesAgo) {
              syncStatus = 'limited';
            }
          }

          return {
            id: acc.id,
            name: acc.name,
            number: acc.number,
            institutionName: acc.institutionName,
            brokerageAuthorizationId: acc.brokerageAuthorization,
            // Local sync status (whether we've imported to our DB)
            isSynced: !!linked,
            brokerageAccountId: linked?.brokerageAccountId || null,
            brokerageAccountName: linked?.brokerageAccountName || null,
            transactionCount: linked?.transactionCount || 0,
            // SnapTrade sync status (whether SnapTrade has fetched from the broker)
            snaptradeSync: {
              isInitialSyncComplete,
              firstTransactionDate,
              lastSuccessfulSync,
              // Provide a user-friendly status
              status: syncStatus,
            },
          };
        }),
        // Also return the list of synced accounts for easy access
        syncedAccounts: linkedAccounts.map((acc) => ({
          brokerageAccountId: acc.id,
          brokerageAccountName: acc.name,
          broker: acc.broker,
          externalAccountId: acc.externalAccountId,
          transactionCount: acc._count.ledgerEvents,
        })),
        orphanedAccounts: orphanedLinkedAccounts,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    log.error({ error }, 'Failed to get connection status');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to get connection status',
        details: process.env.NODE_ENV === 'development'
          ? { errorName, errorMessage, errorStack }
          : undefined,
      },
      { status: 500 }
    );
  }
}

async function getRecentConnectionAttempts(userId: string): Promise<Record<string, { lastAttemptAt: string; count: number }>> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const attempts = await prisma.syncActivityLog.findMany({
    where: {
      userId,
      eventType: 'connection_initiated',
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: { broker: true, createdAt: true },
  });

  const map: Record<string, { lastAttemptAt: string; count: number }> = {};
  for (const attempt of attempts) {
    const key = attempt.broker || 'unknown';
    if (!map[key]) {
      map[key] = { lastAttemptAt: attempt.createdAt.toISOString(), count: 1 };
    } else {
      map[key].count += 1;
    }
  }

  return map;
}

