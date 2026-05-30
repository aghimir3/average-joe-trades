/**
 * SnapTrade Integration Service
 *
 * Handles connection to SnapTrade API for real-time brokerage data sync.
 * Supports Robinhood and other brokers through a unified API.
 *
 * @see https://docs.snaptrade.com/
 */

import { createHmac } from 'node:crypto';
import { Snaptrade } from 'snaptrade-typescript-sdk';
import { createChildLogger } from '@/lib/logger';
import type { NormalizedTransaction, TransCode, EventType } from '@/lib/importers/types';

const log = createChildLogger({ module: 'snaptrade' });

// Initialize SnapTrade client
let snaptradeClient: Snaptrade | null = null;

// Default timeout for SnapTrade API calls (5 minutes for large accounts)
const SNAPTRADE_TIMEOUT_MS = 5 * 60 * 1000;
const SNAPTRADE_BASE_PATH = 'https://api.snaptrade.com/api/v1';

function getSnaptradeApiConfig(): { consumerKey: string; clientId: string } {
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const clientId = process.env.SNAPTRADE_CLIENT_ID;

  if (!consumerKey || !clientId) {
    throw new Error(
      'SnapTrade credentials not configured. Set SNAPTRADE_CONSUMER_KEY and SNAPTRADE_CLIENT_ID environment variables.'
    );
  }

  return { consumerKey, clientId };
}

function stringifyWithSortedKeys(value: unknown): string {
  const allKeys: string[] = [];
  const seen: Record<string, null> = {};

  JSON.stringify(value, (key, nestedValue) => {
    if (!(key in seen)) {
      allKeys.push(key);
      seen[key] = null;
    }
    return nestedValue;
  });

  allKeys.sort();
  return JSON.stringify(value, allKeys);
}

function createSnaptradeSignature(
  consumerKey: string,
  path: string,
  query: string,
  content: unknown = null
): string {
  const signaturePayload = stringifyWithSortedKeys({
    content,
    path: `/api/v1${path}`,
    query,
  });

  return createHmac('sha256', encodeURI(consumerKey))
    .update(signaturePayload)
    .digest('base64');
}

function getSnaptradeClient(): Snaptrade {
  if (!snaptradeClient) {
    const { consumerKey, clientId } = getSnaptradeApiConfig();

    snaptradeClient = new Snaptrade({
      consumerKey,
      clientId,
      // Axios base options for timeout configuration
      baseOptions: {
        timeout: SNAPTRADE_TIMEOUT_MS,
      },
    });

    log.info({ timeoutMs: SNAPTRADE_TIMEOUT_MS }, 'SnapTrade client initialized with custom timeout');
  }

  return snaptradeClient;
}

/**
 * SnapTrade user credentials stored per user
 */
export interface SnapTradeUserCredentials {
  userId: string; // SnapTrade user ID
  userSecret: string; // SnapTrade user secret
}

/**
 * Service name constant for database lookups
 */
export const SNAPTRADE_SERVICE = 'snaptrade' as const;

/**
 * SnapTrade account from the API
 */
export interface SnapTradeAccount {
  id: string;
  brokerageAuthorization: string;
  name: string;
  number: string;
  institutionName: string;
  balance?: {
    total?: { amount: number; currency: string };
  };
  sync_status?: {
    holdings?: {
      last_successful_sync?: string | null;
      initial_sync_completed?: boolean;
    };
    transactions?: {
      last_successful_sync?: string | null;
      first_transaction_date?: string | null;
      initial_sync_completed?: boolean;
    };
  };
}

/**
 * SnapTrade connection (brokerage authorization)
 */
export interface SnapTradeConnection {
  id: string;
  brokerageName: string;
  brokerageSlug?: string;
  brokerageDisplayName?: string;
  connectionName?: string;
  createdDate?: string | null;
  disabled?: boolean;
  type?: string;
}

export interface SnapTradeTransactionSyncConfirmation {
  detail?: string;
}

/**
 * Stock/ETF position from SnapTrade API
 * Note: The API returns a deeply nested symbol structure
 */
export interface SnapTradePosition {
  symbol: {
    id: string;
    description?: string;
    // The actual symbol info is nested one level deeper
    symbol: {
      id: string;
      symbol: string;
      raw_symbol?: string;
      description?: string;
      currency?: { id: string; code: string; name: string };
    };
  };
  units: number | null;
  price: number | null;
  open_pnl: number | null;
  average_purchase_price: number | null;
  currency?: { id: string; code: string };
}

/**
 * Option position from SnapTrade API
 */
export interface SnapTradeOptionPosition {
  symbol?: {
    id: string;
    symbol: string;
  };
  option_symbol: {
    id: string;
    ticker: string;
    option_type: 'CALL' | 'PUT';
    strike_price: number;
    expiration_date: string;
    is_mini_option?: boolean;
    underlying_symbol?: {
      id: string;
      symbol: string;
    };
  };
  units: number; // positive = long, negative = short
  price: number | null; // market price per share
  average_purchase_price: number | null; // cost basis per contract
  open_pnl?: number | null; // unrealized P&L (may be provided by API)
  currency?: { id: string; code: string };
}

/**
 * Account balance from SnapTrade API
 */
export interface SnapTradeBalance {
  currency: { id: string; code: string; name: string };
  cash: number | null;
  buying_power: number | null;
}

/**
 * Return rate from SnapTrade API
 */
export interface SnapTradeReturnRate {
  timeframe: string; // ALL, 1Y, 6M, 3M, 1M
  return_percent: number;
  created_date?: string;
}

/**
 * SnapTrade transaction from the API
 * Note: SnapTrade API uses snake_case field names
 */
export interface SnapTradeTransaction {
  id: string;
  account: { id: string; name: string };
  symbol?: { id: string; symbol: string; description?: string };
  // API uses snake_case: option_symbol
  option_symbol?: {
    id: string;
    ticker: string;
    option_type: 'CALL' | 'PUT';
    strike_price: number;
    expiration_date: string;
  };
  type: string; // BUY, SELL, DIVIDEND, OPTIONEXPIRATION, OPTIONASSIGNMENT, etc.
  // API provides option_type for BUY/SELL: BUY_TO_OPEN, BUY_TO_CLOSE, SELL_TO_OPEN, SELL_TO_CLOSE
  option_type?: string;
  units: number;
  price: number;
  amount: number;
  fee?: number;
  currency: { id: string; code: string };
  // API uses snake_case: trade_date, settlement_date
  trade_date: string;
  settlement_date?: string;
  description?: string;
}

/**
 * Register a new SnapTrade user (call once per user)
 *
 * If the user already exists on SnapTrade's side (e.g., from a previous registration
 * where we deleted local credentials), this will automatically delete and re-register.
 */
export async function registerSnapTradeUser(
  internalUserId: string
): Promise<SnapTradeUserCredentials> {
  const client = getSnaptradeClient();

  log.info({ internalUserId }, 'Registering new SnapTrade user');

  try {
    const response = await client.authentication.registerSnapTradeUser({
      userId: internalUserId,
    });

    // Only log non-sensitive fields from registration response (never log userSecret)
    log.debug({ hasUserId: !!response.data?.userId, hasSecret: !!response.data?.userSecret }, 'SnapTrade register response');

    if (!response.data?.userId || !response.data?.userSecret) {
      log.error({ responseData: response.data }, 'SnapTrade registration missing credentials');
      throw new Error('Failed to register SnapTrade user - missing credentials in response');
    }

    log.info({ internalUserId, snaptradeUserId: response.data.userId }, 'SnapTrade user registered');

    return {
      userId: response.data.userId,
      userSecret: response.data.userSecret,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if the error is because user already exists (HTTP 400 with specific error codes)
    // SnapTrade returns error code 1062 for duplicate user
    const errorStr = JSON.stringify(error);
    const isUserAlreadyExists =
      errorMessage.includes('400') ||
      errorStr.includes('1062') ||
      errorStr.includes('already registered') ||
      errorStr.includes('already exists');

    if (isUserAlreadyExists) {
      log.warn({ internalUserId }, 'SnapTrade user already exists, attempting to delete and re-register');

      try {
        // Delete the existing user on SnapTrade's side
        await client.authentication.deleteSnapTradeUser({
          userId: internalUserId,
        });
        log.info({ internalUserId }, 'Deleted existing SnapTrade user');

        // Try registration again
        const retryResponse = await client.authentication.registerSnapTradeUser({
          userId: internalUserId,
        });

        if (!retryResponse.data?.userId || !retryResponse.data?.userSecret) {
          throw new Error('Failed to register SnapTrade user after delete - missing credentials');
        }

        log.info({ internalUserId, snaptradeUserId: retryResponse.data.userId }, 'SnapTrade user re-registered after delete');

        return {
          userId: retryResponse.data.userId,
          userSecret: retryResponse.data.userSecret,
        };
      } catch (retryError) {
        const retryErrorMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
        log.error(
          {
            internalUserId,
            errorMessage: retryErrorMessage,
            error: retryError,
          },
          'Failed to re-register SnapTrade user after delete'
        );
        throw retryError;
      }
    }

    log.error(
      {
        internalUserId,
        errorMessage,
        error,
      },
      'Failed to register SnapTrade user'
    );
    throw error;
  }
}

/**
 * Generate a connection link for user to authorize their brokerage
 */
export async function getConnectionLink(
  credentials: SnapTradeUserCredentials,
  redirectUri: string,
  broker?: string
): Promise<string> {
  const client = getSnaptradeClient();

  log.info({ userId: credentials.userId, broker, redirectUri }, 'Generating SnapTrade connection link');

  try {
    const response = await client.authentication.loginSnapTradeUser({
      userId: credentials.userId,
      userSecret: credentials.userSecret,
      customRedirect: redirectUri,
      broker: broker, // 'ROBINHOOD', 'SCHWAB', etc.
    });

    // Only log non-sensitive fields (never log tokens or secrets)
    const hasRedirectURI = response.data && 'redirectURI' in response.data && !!response.data.redirectURI;
    log.debug({ hasRedirectURI }, 'SnapTrade login response');

    const data = response.data;
    if (!data || !('redirectURI' in data) || !data.redirectURI) {
      log.error({ responseData: data }, 'SnapTrade login missing redirectURI');
      throw new Error('Failed to generate connection link - no redirect URL in response');
    }

    log.info({ userId: credentials.userId, hasLink: true }, 'SnapTrade connection link generated');

    return data.redirectURI;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(
      {
        userId: credentials.userId,
        broker,
        errorMessage,
        error,
      },
      'Failed to generate SnapTrade connection link'
    );
    throw error;
  }
}

/**
 * Get all connected brokerage accounts for a user
 */
export async function getConnectedAccounts(
  credentials: SnapTradeUserCredentials
): Promise<SnapTradeAccount[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId }, 'Fetching connected accounts');

  const response = await client.accountInformation.listUserAccounts({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
  });

  // Log raw response for debugging
  log.debug(
    {
      userId: credentials.userId,
      rawAccountCount: response.data?.length,
      rawAccounts: response.data?.map(acc => ({
        id: acc.id,
        name: acc.name,
        sync_status: (acc as Record<string, unknown>).sync_status,
      })),
    },
    'Raw SnapTrade listUserAccounts response'
  );

  // Map API response to our interface - SDK Account type doesn't fully match our interface
  const accounts = response.data || [];
  return accounts.map((account) => {
    // Cast to access snake_case fields that TypeScript doesn't know about
    const rawAccount = account as unknown as Record<string, unknown>;

    return {
      id: account.id || '',
      brokerageAuthorization: (rawAccount.brokerage_authorization as string) || '',
      name: account.name || '',
      number: account.number || '',
      institutionName: (rawAccount.institution_name as string) || '',
      balance: account.balance as SnapTradeAccount['balance'],
      // Include sync_status from API response
      sync_status: rawAccount.sync_status as SnapTradeAccount['sync_status'],
    };
  });
}

/**
 * Get brokerage connections (authorizations) for a user
 */
export async function getBrokerageAuthorizations(
  credentials: SnapTradeUserCredentials
): Promise<SnapTradeConnection[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId }, 'Fetching SnapTrade connections');

  const response = await client.connections.listBrokerageAuthorizations({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
  });

  const connections = response.data || [];

  return connections.map((connection) => ({
    id: connection.id || '',
    brokerageName:
      connection.brokerage?.name ||
      connection.brokerage?.display_name ||
      connection.brokerage?.slug ||
      '',
    brokerageSlug: connection.brokerage?.slug,
    brokerageDisplayName: connection.brokerage?.display_name || connection.brokerage?.name,
    connectionName: connection.name,
    createdDate: connection.created_date || null,
    disabled: connection.disabled ?? false,
    type: connection.type,
  }));
}

/**
 * Schedule a transaction sync for a brokerage connection.
 */
export async function syncBrokerageAuthorizationTransactions(
  credentials: SnapTradeUserCredentials,
  brokerageAuthorizationId: string
): Promise<SnapTradeTransactionSyncConfirmation> {
  const { consumerKey, clientId } = getSnaptradeApiConfig();
  const path = `/authorizations/${encodeURIComponent(brokerageAuthorizationId)}/transactions/sync`;
  const queryParams = new URLSearchParams();
  queryParams.set('clientId', clientId);
  queryParams.set('timestamp', Math.round(Date.now() / 1000).toString());
  queryParams.set('userId', credentials.userId);
  queryParams.set('userSecret', credentials.userSecret);

  const query = queryParams.toString();
  const signature = createSnaptradeSignature(consumerKey, path, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPTRADE_TIMEOUT_MS);

  log.info({ userId: credentials.userId, brokerageAuthorizationId }, 'Scheduling SnapTrade transaction sync');

  try {
    const response = await fetch(`${SNAPTRADE_BASE_PATH}${path}?${query}`, {
      method: 'POST',
      headers: { Signature: signature },
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`SnapTrade transaction sync failed with status ${response.status}`);
    }

    if (!responseText) {
      log.info({ brokerageAuthorizationId }, 'SnapTrade transaction sync scheduled');
      return {};
    }

    try {
      const confirmation = JSON.parse(responseText) as SnapTradeTransactionSyncConfirmation;
      log.info({ brokerageAuthorizationId, detail: confirmation.detail }, 'SnapTrade transaction sync scheduled');
      return confirmation;
    } catch {
      log.info({ brokerageAuthorizationId }, 'SnapTrade transaction sync scheduled');
      return { detail: responseText };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('SnapTrade transaction sync timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Remove a brokerage connection (deregister broker account)
 * This deletes the connection from SnapTrade and removes all associated data
 */
export async function removeBrokerageAuthorization(
  credentials: SnapTradeUserCredentials,
  brokerageAuthorizationId: string
): Promise<void> {
  const client = getSnaptradeClient();

  log.info({ userId: credentials.userId, brokerageAuthorizationId }, 'Removing brokerage authorization');

  await client.connections.removeBrokerageAuthorization({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    authorizationId: brokerageAuthorizationId,
  });

  log.info({ brokerageAuthorizationId }, 'Brokerage authorization removed');
}

/**
 * Get transaction history for a user
 */
export async function getTransactions(
  credentials: SnapTradeUserCredentials,
  options: {
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    accountIds?: string[];
    types?: string[]; // BUY, SELL, etc.
  } = {}
): Promise<SnapTradeTransaction[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, options }, 'Fetching transactions');

  const response = await client.transactionsAndReporting.getActivities({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    startDate: options.startDate,
    endDate: options.endDate,
    accounts: options.accountIds?.join(','),
    type: options.types?.join(','),
  });

  const rawData = response.data || [];

  // Cast to our interface - but first log raw structure for debugging
  if (rawData.length > 0) {
    const sample = rawData[0] as Record<string, unknown>;
    log.info({
      rawKeys: Object.keys(sample),
      sampleRaw: JSON.stringify(sample, null, 2).slice(0, 2000),
    }, 'Raw SnapTrade API response structure');
  }

  const transactions = rawData as SnapTradeTransaction[];

  // Log first few transactions with the expected snake_case field names
  if (transactions.length > 0) {
    log.info({
      sampleTransactions: transactions.slice(0, 3).map(tx => ({
        id: tx.id,
        type: tx.type,
        option_type: tx.option_type,
        units: tx.units,
        price: tx.price,
        amount: tx.amount,
        fee: tx.fee,
        trade_date: tx.trade_date,
        settlement_date: tx.settlement_date,
        symbol: tx.symbol,
        option_symbol: tx.option_symbol,
        description: tx.description,
      }))
    }, 'Sample transactions from SnapTrade API (snake_case fields)');
  } else {
    log.info('No transactions returned from SnapTrade API');
  }

  return transactions;
}

/**
 * Get holdings/positions for a user
 */
export async function getHoldings(
  credentials: SnapTradeUserCredentials,
  accountId?: string
): Promise<unknown[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId }, 'Fetching holdings');

  if (accountId) {
    const response = await client.accountInformation.getUserHoldings({
      userId: credentials.userId,
      userSecret: credentials.userSecret,
      accountId,
    });
    // Response data may be a single account object or array - normalize to array
    const data = response.data;
    return data ? [data] : [];
  }

  const response = await client.accountInformation.getAllUserHoldings({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
  });

  return response.data || [];
}

/**
 * Get stock/ETF positions for a specific account
 * Returns brokerage-provided position data including unrealized P&L and cost basis
 */
export async function getAccountPositions(
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradePosition[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId }, 'Fetching account positions');

  const response = await client.accountInformation.getUserAccountPositions({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    accountId,
  });

  const rawData = response.data || [];

  // Log raw structure for debugging on first call
  if (rawData.length > 0) {
    const sample = rawData[0] as Record<string, unknown>;
    log.debug({
      rawKeys: Object.keys(sample),
      sampleRaw: JSON.stringify(sample, null, 2).slice(0, 1000),
    }, 'Raw SnapTrade position structure');
  }

  // Cast to our interface - SnapTrade SDK types may not fully match API response
  return rawData as unknown as SnapTradePosition[];
}

/**
 * Get option positions for a specific account
 * Returns detailed option data including strike, expiration, and cost basis
 */
export async function getOptionPositions(
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeOptionPosition[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId }, 'Fetching option positions');

  const response = await client.options.listOptionHoldings({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    accountId,
  });

  const rawData = response.data || [];

  // Log raw structure for debugging on first call
  if (rawData.length > 0) {
    const sample = rawData[0] as Record<string, unknown>;
    log.debug({
      rawKeys: Object.keys(sample),
      sampleRaw: JSON.stringify(sample, null, 2).slice(0, 1000),
    }, 'Raw SnapTrade option position structure');
  }

  // Cast to our interface
  return rawData as unknown as SnapTradeOptionPosition[];
}

/**
 * Get account balances (cash and buying power) for a specific account
 * Returns one balance entry per currency held in the account
 */
export async function getAccountBalance(
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeBalance[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId }, 'Fetching account balance');

  const response = await client.accountInformation.getUserAccountBalance({
    userId: credentials.userId,
    userSecret: credentials.userSecret,
    accountId,
  });

  const rawData = response.data || [];

  // Log raw structure for debugging
  if (rawData.length > 0) {
    const sample = rawData[0] as Record<string, unknown>;
    log.debug({
      rawKeys: Object.keys(sample),
      sampleRaw: JSON.stringify(sample, null, 2).slice(0, 500),
    }, 'Raw SnapTrade balance structure');
  }

  // Cast to our interface
  return rawData as unknown as SnapTradeBalance[];
}

/**
 * Get return rates for a specific account
 * Returns performance percentages for various timeframes (ALL, 1Y, 6M, 3M, 1M)
 */
export async function getAccountReturnRates(
  credentials: SnapTradeUserCredentials,
  accountId: string
): Promise<SnapTradeReturnRate[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId }, 'Fetching account return rates');

  try {
    const response = await client.accountInformation.getUserAccountReturnRates({
      userId: credentials.userId,
      userSecret: credentials.userSecret,
      accountId,
    });

    const rawData = response.data || [];

    // Log raw structure for debugging
    if (rawData.length > 0) {
      const sample = rawData[0] as Record<string, unknown>;
      log.debug({
        rawKeys: Object.keys(sample),
        sampleRaw: JSON.stringify(sample, null, 2).slice(0, 500),
      }, 'Raw SnapTrade return rate structure');
    }

    // Cast to our interface
    return rawData as unknown as SnapTradeReturnRate[];
  } catch (error) {
    // Some brokerages may not support return rates
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.warn({ accountId, errorMessage }, 'Failed to fetch return rates (may not be supported)');
    return [];
  }
}

/**
 * Transform SnapTrade transaction to NormalizedTransaction format
 */
export function transformToNormalizedTransaction(
  tx: SnapTradeTransaction
): NormalizedTransaction | null {
  // Skip non-trade transactions
  // Include BUY, SELL for stocks and options
  // Include OPTIONEXPIRATION and OPTIONASSIGNMENT for option lifecycle events
  const tradeTypes = ['BUY', 'SELL', 'OPTIONEXPIRATION', 'OPTIONASSIGNMENT'];
  if (!tradeTypes.includes(tx.type)) {
    log.trace({ type: tx.type, id: tx.id }, 'Skipping non-trade transaction');
    return null;
  }

  // SnapTrade uses snake_case: option_symbol
  const isOption = !!tx.option_symbol;
  const symbol = isOption ? tx.option_symbol?.ticker : tx.symbol?.symbol;

  if (!symbol) {
    log.warn({ tx }, 'Transaction missing symbol');
    return null;
  }

  // Determine transaction code
  // SnapTrade provides option_type for options: BUY_TO_OPEN, BUY_TO_CLOSE, SELL_TO_OPEN, SELL_TO_CLOSE
  // For OPTIONEXPIRATION and OPTIONASSIGNMENT, handle separately
  let transCode: TransCode;
  if (tx.type === 'OPTIONEXPIRATION') {
    transCode = 'OEXP';
  } else if (tx.type === 'OPTIONASSIGNMENT') {
    transCode = 'OASGN';
  } else if (isOption) {
    // Use the explicit option_type if provided
    const optionAction = tx.option_type?.toUpperCase();
    switch (optionAction) {
      case 'BUY_TO_OPEN':
        transCode = 'BTO';
        break;
      case 'BUY_TO_CLOSE':
        transCode = 'BTC';
        break;
      case 'SELL_TO_OPEN':
        transCode = 'STO';
        break;
      case 'SELL_TO_CLOSE':
        transCode = 'STC';
        break;
      default:
        // Fallback: infer from BUY/SELL
        transCode = tx.type === 'BUY' ? 'BTO' : 'STC';
    }
  } else {
    transCode = tx.type as TransCode; // BUY or SELL
  }

  // Determine event type
  const eventType: EventType = isOption ? 'EQUITY_OPTION' : 'EQUITY_STOCK';

  // Skip zero-quantity transactions
  const quantity = Math.abs(tx.units);
  if (quantity === 0) {
    log.warn({ tx }, 'Skipping zero-quantity transaction');
    return null;
  }

  // Extract underlying symbol from option ticker (e.g., "AAPL 240119C00190000" -> "AAPL")
  const underlyingSymbol = isOption
    ? (tx.option_symbol?.ticker?.split(' ')[0] || symbol)
    : symbol;

  // Extract time from trade_date if available (format: "2024-03-22T16:27:55.000Z")
  const tradeDate = new Date(tx.trade_date);
  let activityTime: string | undefined;
  if (tx.trade_date && tx.trade_date.includes('T')) {
    const hours = tradeDate.getUTCHours().toString().padStart(2, '0');
    const minutes = tradeDate.getUTCMinutes().toString().padStart(2, '0');
    // Only set time if it's not midnight (00:00 often means no time data)
    if (hours !== '00' || minutes !== '00') {
      activityTime = `${hours}:${minutes}`;
    }
  }

  const normalized: NormalizedTransaction = {
    // SnapTrade uses snake_case: trade_date, settlement_date
    activityDate: tradeDate,
    activityTime,
    settleDate: tx.settlement_date ? new Date(tx.settlement_date) : undefined,
    symbol: underlyingSymbol.toUpperCase(),
    rawInstrument: tx.symbol?.symbol || tx.option_symbol?.ticker || symbol,
    rawDescription: tx.description || tx.symbol?.description || '',
    transCode,
    quantity,
    price: Math.abs(tx.price),
    amount: tx.amount,
    fees: tx.fee || 0,
    eventType,

    // Option details - use snake_case fields
    isOption,
    optionType: tx.option_symbol?.option_type?.toLowerCase() as 'call' | 'put' | undefined,
    strike: tx.option_symbol?.strike_price,
    expiration: tx.option_symbol?.expiration_date
      ? new Date(tx.option_symbol.expiration_date)
      : undefined,

    // Source tracking
    sourceTransactionId: tx.id,
  };

  // Log a sample of transformed transactions for debugging
  if (Math.random() < 0.05) {  // Log 5% of transactions
    log.debug(
      {
        original: {
          id: tx.id,
          type: tx.type,
          option_type: tx.option_type,
          units: tx.units,
          symbol: tx.symbol?.symbol,
          option_symbol: tx.option_symbol,
        },
        normalized: {
          symbol: normalized.symbol,
          transCode: normalized.transCode,
          quantity: normalized.quantity,
          isOption: normalized.isOption,
          optionType: normalized.optionType,
          strike: normalized.strike,
          expiration: normalized.expiration,
        },
      },
      'Sample transformed transaction'
    );
  }

  return normalized;
}

/**
 * Fetch and transform all transactions for import
 */
export async function fetchTransactionsForImport(
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
  // First fetch ALL transactions to see what's available (no type filter)
  const rawTransactions = await getTransactions(credentials, {
    ...options,
    // Don't filter by type - let's see all transaction types available
  });

  // Log unique transaction types for debugging
  const uniqueTypes = [...new Set(rawTransactions.map(tx => tx.type))];
  log.info({ count: rawTransactions.length, uniqueTypes }, 'Fetched transactions from SnapTrade');

  const transactions: NormalizedTransaction[] = [];
  let skipped = 0;

  for (const tx of rawTransactions) {
    const normalized = transformToNormalizedTransaction(tx);
    if (normalized) {
      transactions.push(normalized);
    } else {
      skipped++;
    }
  }

  log.info(
    { transformed: transactions.length, skipped, total: rawTransactions.length },
    'Transformed transactions for import'
  );

  return {
    transactions,
    skipped,
    total: rawTransactions.length,
  };
}

/**
 * Order from SnapTrade API
 */
export interface SnapTradeOrder {
  brokerage_order_id: string;
  status: 'PENDING' | 'EXECUTED' | 'CANCELED' | 'REJECTED' | 'OPEN' | 'FILLED' | 'EXPIRED' | 'PARTIALLY_FILLED' | string;
  action: 'BUY' | 'SELL' | 'BUY_COVER' | 'SELL_SHORT';
  order_type: 'Market' | 'Limit' | 'Stop' | 'StopLimit' | string;
  time_in_force: 'Day' | 'GTC' | 'FOK' | 'IOC' | 'GTD' | string;
  total_quantity: number;
  filled_quantity: number | null;
  open_quantity: number | null;
  canceled_quantity: number | null;
  execution_price: number | null;
  limit_price: number | null;
  stop_price: number | null;
  time_placed: string;
  time_updated: string | null;
  time_executed: string | null;
  expiry_date: string | null;
  universal_symbol?: {
    id: string;
    symbol: string;
    raw_symbol?: string;
    description?: string;
    currency?: { id: string; code: string };
  };
  option_symbol?: {
    id: string;
    ticker: string;
    option_type: 'CALL' | 'PUT';
    strike_price: number;
    expiration_date: string;
  };
}

/**
 * Get orders for a specific account
 * Returns pending and recent orders
 */
export async function getAccountOrders(
  credentials: SnapTradeUserCredentials,
  accountId: string,
  options?: {
    state?: 'all' | 'open' | 'executed';
    days?: number;
  }
): Promise<SnapTradeOrder[]> {
  const client = getSnaptradeClient();

  log.debug({ userId: credentials.userId, accountId, options }, 'Fetching account orders');

  try {
    const response = await client.accountInformation.getUserAccountOrders({
      userId: credentials.userId,
      userSecret: credentials.userSecret,
      accountId,
      state: options?.state || 'all',
      days: options?.days || 30,
    });

    const rawData = response.data || [];

    // Log raw structure for debugging on first call
    if (rawData.length > 0) {
      const sample = rawData[0] as Record<string, unknown>;
      log.debug({
        rawKeys: Object.keys(sample),
        sampleRaw: JSON.stringify(sample, null, 2).slice(0, 1000),
      }, 'Raw SnapTrade order structure');
    }

    // Cast to our interface
    return rawData as unknown as SnapTradeOrder[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.warn({ accountId, errorMessage }, 'Failed to fetch orders (may not be supported)');
    return [];
  }
}

/**
 * Delete a SnapTrade user (cleanup)
 */
export async function deleteSnapTradeUser(credentials: SnapTradeUserCredentials): Promise<void> {
  const client = getSnaptradeClient();

  log.info({ userId: credentials.userId }, 'Deleting SnapTrade user');

  await client.authentication.deleteSnapTradeUser({
    userId: credentials.userId,
  });
}

/**
 * Check if SnapTrade is configured
 */
export function isSnapTradeConfigured(): boolean {
  return !!(process.env.SNAPTRADE_CONSUMER_KEY && process.env.SNAPTRADE_CLIENT_ID);
}
