/**
 * SnapTrade Logged Operations
 *
 * Wrapper around SnapTrade service that logs all API calls to the database.
 * Use these functions in API routes to enable debugging and auditing.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import { logApiRequest, logApiError } from './api-logger';
import {
  getConnectedAccounts as getConnectedAccountsBase,
  getBrokerageAuthorizations as getBrokerageAuthorizationsBase,
  getTransactions as getTransactionsBase,
  syncBrokerageAuthorizationTransactions as syncBrokerageAuthorizationTransactionsBase,
  registerSnapTradeUser as registerSnapTradeUserBase,
  getConnectionLink as getConnectionLinkBase,
  fetchTransactionsForImport as fetchTransactionsForImportBase,
  getAccountPositions as getAccountPositionsBase,
  getOptionPositions as getOptionPositionsBase,
  getAccountBalance as getAccountBalanceBase,
  getAccountReturnRates as getAccountReturnRatesBase,
  getAccountOrders as getAccountOrdersBase,
  deleteSnapTradeUser as deleteSnapTradeUserBase,
  removeBrokerageAuthorization as removeBrokerageAuthorizationBase,
  type SnapTradeUserCredentials,
  type SnapTradeAccount,
  type SnapTradeConnection,
  type SnapTradeTransaction,
  type SnapTradePosition,
  type SnapTradeOptionPosition,
  type SnapTradeBalance,
  type SnapTradeReturnRate,
  type SnapTradeOrder,
  type SnapTradeTransactionSyncConfirmation,
  SNAPTRADE_SERVICE,
} from './snaptrade';
import type { NormalizedTransaction } from '@/lib/importers/types';

const log = createChildLogger({ module: 'snaptrade-logged' });

export interface LoggedOperationContext {
  prisma: PrismaClient;
  internalUserId: string;
  correlationId?: string;
  triggeredBy?: string;
}

/**
 * Register a new SnapTrade user with logging
 */
export async function registerSnapTradeUserLogged(
  ctx: LoggedOperationContext,
  internalUserId: string
): Promise<SnapTradeUserCredentials> {
  const startTime = Date.now();
  const request = {
    endpoint: 'authentication/registerSnapTradeUser',
    method: 'POST',
    params: { userId: internalUserId },
  };

  try {
    const result = await registerSnapTradeUserBase(internalUserId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'registerSnapTradeUser',
      },
      request,
      {
        statusCode: 200,
        body: { userId: result.userId, userSecret: '[REDACTED]' },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'registerSnapTradeUser',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get connection link with logging
 */
export async function getConnectionLinkLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  redirectUri: string,
  broker?: string
): Promise<string> {
  const startTime = Date.now();
  const request = {
    endpoint: 'authentication/loginSnapTradeUser',
    method: 'POST',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      customRedirect: redirectUri,
      broker,
    },
  };

  try {
    const result = await getConnectionLinkBase(credentials, redirectUri, broker);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getConnectionLink',
      },
      request,
      {
        statusCode: 200,
        body: { redirectURI: result },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getConnectionLink',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get connected accounts with logging
 */
export async function getConnectedAccountsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials
): Promise<SnapTradeAccount[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'accountInformation/listUserAccounts',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
    },
  };

  try {
    const result = await getConnectedAccountsBase(credentials);
    const durationMs = Date.now() - startTime;

    // Log detailed sync status for debugging
    log.info(
      {
        correlationId: ctx.correlationId,
        accountCount: result.length,
        accounts: result.map(acc => ({
          id: acc.id,
          name: acc.name,
          institutionName: acc.institutionName,
          sync_status: acc.sync_status,
        })),
        durationMs,
      },
      'SnapTrade getConnectedAccounts response'
    );

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getConnectedAccounts',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getConnectedAccounts',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get brokerage authorizations with logging
 */
export async function getBrokerageAuthorizationsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials
): Promise<SnapTradeConnection[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'connections/listBrokerageAuthorizations',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
    },
  };

  try {
    const result = await getBrokerageAuthorizationsBase(credentials);
    const durationMs = Date.now() - startTime;

    log.info(
      {
        correlationId: ctx.correlationId,
        connectionCount: result.length,
        connections: result.map(conn => ({
          id: conn.id,
          brokerage: conn.brokerageName,
          disabled: conn.disabled,
          type: conn.type,
        })),
        durationMs,
      },
      'SnapTrade getBrokerageAuthorizations response'
    );

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getBrokerageAuthorizations',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getBrokerageAuthorizations',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Schedule transaction sync with logging
 */
export async function syncBrokerageAuthorizationTransactionsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  brokerageAuthorizationId: string
): Promise<SnapTradeTransactionSyncConfirmation> {
  const startTime = Date.now();
  const request = {
    endpoint: 'authorizations/{authorizationId}/transactions/sync',
    method: 'POST',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      authorizationId: brokerageAuthorizationId,
    },
  };

  try {
    const result = await syncBrokerageAuthorizationTransactionsBase(credentials, brokerageAuthorizationId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'syncBrokerageAuthorizationTransactions',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'syncBrokerageAuthorizationTransactions',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get transactions with logging
 */
export async function getTransactionsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  options: {
    startDate?: string;
    endDate?: string;
    accountIds?: string[];
    types?: string[];
  } = {}
): Promise<SnapTradeTransaction[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'transactionsAndReporting/getActivities',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      ...options,
    },
  };

  try {
    const result = await getTransactionsBase(credentials, options);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getTransactions',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getTransactions',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Fetch and transform transactions for import with logging
 */
export async function fetchTransactionsForImportLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  options: {
    startDate?: string;
    endDate?: string;
    accountIds?: string[];
  } = {}
): Promise<{
  transactions: NormalizedTransaction[];
  skipped: number;
  total: number;
}> {
  const startTime = Date.now();
  const request = {
    endpoint: 'transactionsAndReporting/getActivities (with transform)',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      ...options,
    },
  };

  try {
    const result = await fetchTransactionsForImportBase(credentials, options);
    const durationMs = Date.now() - startTime;

    // Log transaction fetch summary
    log.info(
      {
        correlationId: ctx.correlationId,
        total: result.total,
        transformed: result.transactions.length,
        skipped: result.skipped,
        dateRange: { startDate: options.startDate, endDate: options.endDate },
        accountIds: options.accountIds,
        durationMs,
      },
      'SnapTrade fetchTransactionsForImport completed'
    );

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'fetchTransactionsForImport',
      },
      request,
      {
        statusCode: 200,
        body: {
          total: result.total,
          transformed: result.transactions.length,
          skipped: result.skipped,
          // Include sample of transformed transactions for debugging
          sampleTransactions: result.transactions.slice(0, 5).map(tx => ({
            symbol: tx.symbol,
            transCode: tx.transCode,
            quantity: tx.quantity,
            price: tx.price,
            isOption: tx.isOption,
            optionType: tx.optionType,
            strike: tx.strike,
            expiration: tx.expiration,
            activityDate: tx.activityDate,
          })),
        },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'fetchTransactionsForImport',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get stock/ETF positions for an account with logging
 */
export async function getAccountPositionsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradePosition[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'accountInformation/getUserAccountPositions',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      accountId,
    },
  };

  try {
    const result = await getAccountPositionsBase(credentials, accountId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountPositions',
      },
      request,
      {
        statusCode: 200,
        body: {
          positionCount: result.length,
          positions: result.slice(0, 5).map(p => ({
            // SnapTrade API returns nested structure: p.symbol.symbol.symbol
            symbol: p.symbol?.symbol?.symbol || p.symbol?.symbol?.raw_symbol,
            units: p.units,
            price: p.price,
            open_pnl: p.open_pnl,
            average_purchase_price: p.average_purchase_price,
          })),
        },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountPositions',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get option positions for an account with logging
 */
export async function getOptionPositionsLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeOptionPosition[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'options/listOptionHoldings',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      accountId,
    },
  };

  try {
    const result = await getOptionPositionsBase(credentials, accountId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getOptionPositions',
      },
      request,
      {
        statusCode: 200,
        body: {
          positionCount: result.length,
          positions: result.slice(0, 5).map(p => ({
            ticker: p.option_symbol?.ticker,
            option_type: p.option_symbol?.option_type,
            strike: p.option_symbol?.strike_price,
            expiration: p.option_symbol?.expiration_date,
            units: p.units,
            price: p.price,
            average_purchase_price: p.average_purchase_price,
          })),
        },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getOptionPositions',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get account balance with logging
 */
export async function getAccountBalanceLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeBalance[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'accountInformation/getUserAccountBalance',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      accountId,
    },
  };

  try {
    const result = await getAccountBalanceBase(credentials, accountId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountBalance',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountBalance',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get account return rates with logging
 */
export async function getAccountReturnRatesLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeReturnRate[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'accountInformation/getUserAccountReturnRates',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      accountId,
    },
  };

  try {
    const result = await getAccountReturnRatesBase(credentials, accountId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountReturnRates',
      },
      request,
      {
        statusCode: 200,
        body: result,
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountReturnRates',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Remove a brokerage authorization (disconnect specific broker) with logging
 */
export async function removeBrokerageAuthorizationLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  brokerageAuthorizationId: string
): Promise<void> {
  const startTime = Date.now();
  const request = {
    endpoint: 'connections/removeBrokerageAuthorization',
    method: 'DELETE',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      authorizationId: brokerageAuthorizationId,
    },
  };

  try {
    await removeBrokerageAuthorizationBase(credentials, brokerageAuthorizationId);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'removeBrokerageAuthorization',
      },
      request,
      {
        statusCode: 204,
        body: { success: true },
        durationMs,
      }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'removeBrokerageAuthorization',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Delete SnapTrade user (full deregistration) with logging
 */
export async function deleteSnapTradeUserLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials
): Promise<void> {
  const startTime = Date.now();
  const request = {
    endpoint: 'authentication/deleteSnapTradeUser',
    method: 'DELETE',
    params: {
      userId: credentials.userId,
    },
  };

  try {
    await deleteSnapTradeUserBase(credentials);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'deleteSnapTradeUser',
      },
      request,
      {
        statusCode: 200,
        body: { success: true },
        durationMs,
      }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'deleteSnapTradeUser',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

/**
 * Get orders for an account with logging
 */
export async function getAccountOrdersLogged(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  accountId: string,
  options?: {
    state?: 'all' | 'open' | 'executed';
    days?: number;
  }
): Promise<SnapTradeOrder[]> {
  const startTime = Date.now();
  const request = {
    endpoint: 'accountInformation/getUserAccountOrders',
    method: 'GET',
    params: {
      userId: credentials.userId,
      userSecret: '[REDACTED]',
      accountId,
      state: options?.state || 'all',
      days: options?.days || 30,
    },
  };

  try {
    const result = await getAccountOrdersBase(credentials, accountId, options);
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountOrders',
      },
      request,
      {
        statusCode: 200,
        body: { orderCount: result.length },
        durationMs,
      }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiError(
      ctx.prisma,
      {
        userId: ctx.internalUserId,
        service: SNAPTRADE_SERVICE,
        correlationId: ctx.correlationId,
        triggeredBy: ctx.triggeredBy || 'getAccountOrders',
      },
      request,
      {
        message: errorMessage,
        durationMs,
      }
    );

    throw error;
  }
}

// Re-export types and constants
export { SNAPTRADE_SERVICE };
export type {
  SnapTradeUserCredentials,
  SnapTradeAccount,
  SnapTradeConnection,
  SnapTradeTransaction,
  SnapTradePosition,
  SnapTradeOptionPosition,
  SnapTradeBalance,
  SnapTradeReturnRate,
  SnapTradeOrder,
};
