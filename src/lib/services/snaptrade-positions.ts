/**
 * SnapTrade Position Sync Service
 *
 * Handles syncing position, balance, and return rate data from SnapTrade API
 * and provides a unified view merging API data with manually-derived positions.
 *
 * This service:
 * 1. Syncs positions from SnapTrade to BrokerPosition table (cached API data)
 * 2. Syncs balances to BrokerBalance table
 * 3. Syncs return rates to BrokerReturnRate table
 * 4. Provides unified position view combining API + derived positions
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import {
  getAccountPositionsLogged,
  getOptionPositionsLogged,
  getAccountBalanceLogged,
  getAccountReturnRatesLogged,
  getConnectedAccountsLogged,
  SNAPTRADE_SERVICE,
  type SnapTradeUserCredentials,
  type SnapTradePosition,
  type SnapTradeOptionPosition,
  type SnapTradeBalance,
  type SnapTradeReturnRate,
} from './snaptrade-logged';
import type { LoggedOperationContext } from './snaptrade-logged';

const log = createChildLogger({ module: 'snaptrade-positions' });

function safeDecimal(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return new Prisma.Decimal(value);
}

async function runBatched<T>(
  items: T[],
  batchSize: number,
  runner: (item: T) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item) => runner(item)));
  }
}

// Common crypto symbols - used to identify crypto vs stock positions
// This list covers major cryptocurrencies available on Robinhood and other exchanges
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'DOGE', 'SHIB', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC',
  'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL', 'THETA',
  'ETC', 'XMR', 'AAVE', 'EOS', 'MKR', 'XTZ', 'NEO', 'COMP', 'SUSHI', 'YFI',
  'SNX', 'CRV', 'BAT', 'ZRX', 'ENJ', 'MANA', 'SAND', 'APE', 'PEPE', 'BONK',
  'WIF', 'FLOKI', 'NEAR', 'FTM', 'INJ', 'SEI', 'TIA', 'SUI', 'APT', 'ARB',
  'OP', 'BLUR', 'PYTH', 'JTO', 'JUP', 'HBAR', 'TON', 'HNT', 'RNDR', 'FET',
  'AGIX', 'GRT', 'OCEAN', 'ROSE', 'EGLD', 'QNT', 'BNB', 'HYPE',
]);

// Cash/stablecoin symbols to skip (not actual tradeable positions)
const CASH_SYMBOLS = new Set(['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD']);

// Futures detection helpers (SnapTrade does not expose a stable type field in all responses)
type SnapTradeSymbolLike = {
  symbol?: {
    symbol?: string;
    raw_symbol?: string;
    description?: string;
    type?: { code?: string; description?: string };
    security_type?: { code?: string; description?: string };
  } | string;
  description?: string;
  type?: { code?: string; description?: string };
  security_type?: { code?: string; description?: string };
  raw_symbol?: string;
};

function extractSnapTradeSymbolInfo(raw: unknown): {
  symbol: string | null;
  description: string | null;
  typeHint: string | null;
} {
  const data = raw as SnapTradeSymbolLike | null | undefined;
  const symbolObj = typeof data?.symbol === 'string' ? null : data?.symbol;
  const symbol = symbolObj?.symbol
    || symbolObj?.raw_symbol
    || (typeof data?.symbol === 'string' ? data?.symbol : null)
    || data?.raw_symbol
    || null;
  const description = symbolObj?.description || data?.description || null;
  const typeHint = symbolObj?.type?.code
    || symbolObj?.type?.description
    || symbolObj?.security_type?.code
    || symbolObj?.security_type?.description
    || data?.type?.code
    || data?.type?.description
    || data?.security_type?.code
    || data?.security_type?.description
    || null;

  return {
    symbol: symbol ? String(symbol) : null,
    description: description ? String(description) : null,
    typeHint: typeHint ? String(typeHint) : null,
  };
}

function isFutureInstrument(info: { description: string | null; typeHint: string | null }): boolean {
  const { description, typeHint } = info;
  const type = typeHint?.toLowerCase().trim();
  if (type && (type === 'fut' || type === 'future' || type === 'futures')) return true;

  const haystack = `${description ?? ''} ${typeHint ?? ''}`.toLowerCase();
  return /\bfuture(s)?\b/.test(haystack);
}

// ============================================================================
// Types
// ============================================================================

export interface SyncPositionsResult {
  stockPositions: number;
  optionPositions: number;
  futurePositions: number;
  cryptoPositions: number;
  stablecoinPositions: number;
  balances: number;
  returnRates: number;
}

export interface StablecoinHolding {
  symbol: string;
  quantity: number;
  marketValue: number;
  brokerageAccountId: string;
  brokerageAccountName: string;
  lastSyncAt?: Date;
}

export interface UnifiedPosition {
  // Common fields
  id: string;
  symbol: string;
  positionType: 'stock' | 'option' | 'future' | 'crypto';
  quantity: number;
  avgCostBasis: number | null;

  // Option details
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: Date;

  // Market data (from API or null for manual)
  marketPrice?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;

  // Price change tracking (since last sync)
  previousPrice?: number;
  priceChangeAbs?: number;
  priceChangePct?: number;

  // Source tracking
  dataSource: 'snaptrade' | 'derived';
  brokerageAccountId: string;
  brokerageAccountName: string;
  broker: string;
  lastSyncAt?: Date;
  isStale: boolean;
}

export interface UnifiedBalance {
  brokerageAccountId: string;
  brokerageAccountName: string;
  currency: string;
  cash: number | null;
  buyingPower: number | null;
  lastSyncAt: Date;
}

export interface UnifiedReturnRate {
  brokerageAccountId: string;
  brokerageAccountName: string;
  timeframe: string;
  returnPercent: number;
  lastSyncAt: Date;
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Sync all position data for a single SnapTrade account
 *
 * OPTIMIZED: Uses batch operations instead of N+1 queries
 * - Fetches all existing positions in ONE query
 * - Builds lookup maps for O(1) access
 * - Uses Prisma transactions with batched creates/updates
 */
export async function syncPositionsForAccount(
  ctx: LoggedOperationContext,
  credentials: SnapTradeUserCredentials,
  snaptradeAccountId: string,
  brokerageAccountId: string
): Promise<SyncPositionsResult> {
  const syncId = ctx.correlationId || crypto.randomUUID();
  const now = new Date();

  log.info({ snaptradeAccountId, brokerageAccountId, syncId }, 'Starting position sync for account');

  const result: SyncPositionsResult = {
    stockPositions: 0,
    optionPositions: 0,
    futurePositions: 0,
    cryptoPositions: 0,
    stablecoinPositions: 0,
    balances: 0,
    returnRates: 0,
  };

  // Fetch all data from SnapTrade API in parallel
  const [stockPositions, optionPositions, balances, returnRates] = await Promise.all([
    getAccountPositionsLogged(ctx, credentials, snaptradeAccountId).catch(err => {
      log.warn({ err, snaptradeAccountId }, 'Failed to fetch stock positions');
      return [] as SnapTradePosition[];
    }),
    getOptionPositionsLogged(ctx, credentials, snaptradeAccountId).catch(err => {
      log.warn({ err, snaptradeAccountId }, 'Failed to fetch option positions');
      return [] as SnapTradeOptionPosition[];
    }),
    getAccountBalanceLogged(ctx, credentials, snaptradeAccountId).catch(err => {
      log.warn({ err, snaptradeAccountId }, 'Failed to fetch balances');
      return [] as SnapTradeBalance[];
    }),
    getAccountReturnRatesLogged(ctx, credentials, snaptradeAccountId).catch(err => {
      log.warn({ err, snaptradeAccountId }, 'Failed to fetch return rates');
      return [] as SnapTradeReturnRate[];
    }),
  ]);

  log.info({
    snaptradeAccountId,
    stockPositionsCount: stockPositions.length,
    optionPositionsCount: optionPositions.length,
    balancesCount: balances.length,
    returnRatesCount: returnRates.length,
  }, 'Fetched data from SnapTrade API');

  // OPTIMIZATION: Fetch ALL existing positions for this account in ONE query
  const existingPositions = await ctx.prisma.brokerPosition.findMany({
    where: { brokerageAccountId },
  });

  // Build lookup maps for O(1) access
  // Stock positions: keyed by symbol
  // Option positions: keyed by symbol|optionType|strike|expiration
  // Crypto positions: keyed by symbol
  // Stablecoin positions: keyed by symbol
  const stockPositionMap = new Map<string, typeof existingPositions[0]>();
  const optionPositionMap = new Map<string, typeof existingPositions[0]>();
  const futurePositionMap = new Map<string, typeof existingPositions[0]>();
  const cryptoPositionMap = new Map<string, typeof existingPositions[0]>();
  const stablecoinPositionMap = new Map<string, typeof existingPositions[0]>();

  for (const pos of existingPositions) {
    if (pos.positionType === 'stock') {
      stockPositionMap.set(pos.symbol, pos);
    } else if (pos.positionType === 'option') {
      const key = `${pos.symbol}|${pos.optionType}|${pos.strike?.toString()}|${pos.expiration?.toISOString()}`;
      optionPositionMap.set(key, pos);
    } else if (pos.positionType === 'future') {
      futurePositionMap.set(pos.symbol, pos);
    } else if (pos.positionType === 'crypto') {
      cryptoPositionMap.set(pos.symbol, pos);
    } else if (pos.positionType === 'stablecoin') {
      stablecoinPositionMap.set(pos.symbol, pos);
    }
  }

  log.debug({
    brokerageAccountId,
    existingStocks: stockPositionMap.size,
    existingOptions: optionPositionMap.size,
    existingFutures: futurePositionMap.size,
    existingCrypto: cryptoPositionMap.size,
    existingStablecoins: stablecoinPositionMap.size,
  }, 'Built position lookup maps');

  // Prepare batched operations using Prisma's createMany input type
  type PositionUpdate = { id: string; data: Parameters<typeof ctx.prisma.brokerPosition.update>[0]['data'] };

  const stockCreates: Prisma.BrokerPositionCreateManyInput[] = [];
  const stockUpdates: PositionUpdate[] = [];
  const optionCreates: Prisma.BrokerPositionCreateManyInput[] = [];
  const optionUpdates: PositionUpdate[] = [];
  const futureCreates: Prisma.BrokerPositionCreateManyInput[] = [];
  const futureUpdates: PositionUpdate[] = [];
  const cryptoCreates: Prisma.BrokerPositionCreateManyInput[] = [];
  const cryptoUpdates: PositionUpdate[] = [];
  const stablecoinCreates: Prisma.BrokerPositionCreateManyInput[] = [];
  const stablecoinUpdates: PositionUpdate[] = [];

  // Process stock/crypto positions - build create/update batches
  // SnapTrade returns both stocks and crypto in the same positions endpoint
  for (const pos of stockPositions) {
    const symbolData = extractSnapTradeSymbolInfo(pos.symbol);
    const symbolStr = symbolData.symbol;
    if (!symbolStr) continue;

    const symbol = symbolStr.toUpperCase();

    // Skip USD cash (not a tradeable position) but keep stablecoins
    if (symbol === 'USD') {
      log.debug({ symbol }, 'Skipping USD cash position');
      continue;
    }

    // Determine position type
    const isStablecoin = CASH_SYMBOLS.has(symbol) && symbol !== 'USD'; // USDC, USDT, etc.
    const isCrypto = !isStablecoin && CRYPTO_SYMBOLS.has(symbol);
    const isFuture = !isStablecoin && !isCrypto && isFutureInstrument({
      description: symbolData.description,
      typeHint: symbolData.typeHint,
    });

    // O(1) lookup instead of database query
    const existing = isFuture
      ? futurePositionMap.get(symbol)
      : isCrypto
        ? cryptoPositionMap.get(symbol)
        : stockPositionMap.get(symbol);

    if (pos.units === null || pos.units === undefined || pos.units === 0) {
      log.debug({ symbol, units: pos.units }, 'Skipping position with zero units');
      continue;
    }

    // Calculate price change from previous sync
    const currentPrice = pos.price;
    const previousPrice = existing?.marketPrice ? Number(existing.marketPrice) : null;
    let priceChangeAbs: number | null = null;
    let priceChangePct: number | null = null;

    if (currentPrice !== null && previousPrice !== null && previousPrice !== 0) {
      const abs = currentPrice - previousPrice;
      const pct = (abs / previousPrice) * 100;
      priceChangeAbs = Number.isFinite(abs) ? abs : null;
      priceChangePct = Number.isFinite(pct) ? pct : null;
    }

    const marketValueRaw = pos.price !== null && pos.units !== null
      ? pos.price * pos.units
      : null;
    const unrealizedPnLPctRaw = pos.open_pnl !== null && pos.average_purchase_price !== null && pos.units !== null
      ? (pos.open_pnl / (pos.average_purchase_price * pos.units)) * 100
      : null;

    const positionData = {
      quantity: safeDecimal(pos.units) ?? new Prisma.Decimal(0),
      marketPrice: safeDecimal(pos.price),
      marketValue: safeDecimal(marketValueRaw),
      avgCostBasis: safeDecimal(pos.average_purchase_price),
      unrealizedPnL: safeDecimal(pos.open_pnl),
      unrealizedPnLPct: safeDecimal(unrealizedPnLPctRaw),
      previousPrice: safeDecimal(previousPrice),
      priceChangeAbs: safeDecimal(priceChangeAbs),
      priceChangePct: safeDecimal(priceChangePct),
      currency: pos.currency?.code || 'USD',
      snaptradeSyncId: syncId,
      lastSyncAt: now,
      isStale: false,
    };

    if (isStablecoin) {
      // Stablecoin positions (USDC, USDT, etc.)
      const existingStablecoin = stablecoinPositionMap.get(symbol);
      if (existingStablecoin) {
        stablecoinUpdates.push({ id: existingStablecoin.id, data: positionData });
      } else {
        stablecoinCreates.push({
          userId: ctx.internalUserId,
          brokerageAccountId,
          symbol,
          positionType: 'stablecoin',
          dataSource: 'snaptrade',
          ...positionData,
        });
      }
      result.stablecoinPositions++;
    } else if (isFuture) {
      if (existing) {
        futureUpdates.push({ id: existing.id, data: positionData });
      } else {
        futureCreates.push({
          userId: ctx.internalUserId,
          brokerageAccountId,
          symbol,
          positionType: 'future',
          dataSource: 'snaptrade',
          ...positionData,
        });
      }
      result.futurePositions++;
    } else if (isCrypto) {
      if (existing) {
        cryptoUpdates.push({ id: existing.id, data: positionData });
      } else {
        cryptoCreates.push({
          userId: ctx.internalUserId,
          brokerageAccountId,
          symbol,
          positionType: 'crypto',
          dataSource: 'snaptrade',
          ...positionData,
        });
      }
      result.cryptoPositions++;
    } else {
      if (existing) {
        stockUpdates.push({ id: existing.id, data: positionData });
      } else {
        stockCreates.push({
          userId: ctx.internalUserId,
          brokerageAccountId,
          symbol,
          positionType: 'stock',
          dataSource: 'snaptrade',
          ...positionData,
        });
      }
      result.stockPositions++;
    }
  }

  // Process option positions - build create/update batches
  for (const pos of optionPositions) {
    const symbolData = pos.symbol as unknown as { option_symbol?: typeof pos.option_symbol };
    const optionSymbol = pos.option_symbol || symbolData?.option_symbol;
    if (!optionSymbol) {
      log.warn({ snaptradeAccountId, rawSymbol: pos.symbol }, 'Skipping option position missing option symbol');
      continue;
    }

    const underlying = optionSymbol.underlying_symbol?.symbol
      || (optionSymbol.ticker ? optionSymbol.ticker.split(' ')[0] : '')
      || '';
    const symbol = underlying.toUpperCase();
    const optionTypeRaw = optionSymbol.option_type;
    const optionType = optionTypeRaw ? optionTypeRaw.toLowerCase() as 'call' | 'put' : undefined;
    const strike = optionSymbol.strike_price;
    const expirationRaw = optionSymbol.expiration_date;
    const expiration = expirationRaw ? new Date(expirationRaw) : null;

    if (!symbol) {
      log.warn({ snaptradeAccountId, optionSymbol }, 'Skipping option position with missing underlying symbol');
      continue;
    }
    if (!optionType || (optionType !== 'call' && optionType !== 'put')) {
      log.warn({ snaptradeAccountId, optionSymbol }, 'Skipping option position with invalid option type');
      continue;
    }
    if (strike === null || strike === undefined) {
      log.warn({ snaptradeAccountId, optionSymbol }, 'Skipping option position with missing strike');
      continue;
    }
    if (!expiration || Number.isNaN(expiration.getTime())) {
      log.warn({ snaptradeAccountId, optionSymbol }, 'Skipping option position with invalid expiration');
      continue;
    }
    if (pos.units === null || pos.units === undefined || pos.units === 0) {
      log.warn({ snaptradeAccountId, optionSymbol }, 'Skipping option position with missing units');
      continue;
    }

    // O(1) lookup instead of database query
    const key = `${symbol}|${optionType}|${new Prisma.Decimal(strike).toString()}|${expiration.toISOString()}`;
    const existing = optionPositionMap.get(key);

    // Calculate price change from previous sync
    const currentPrice = pos.price;
    const previousPrice = existing?.marketPrice ? Number(existing.marketPrice) : null;
    let priceChangeAbs: number | null = null;
    let priceChangePct: number | null = null;

    if (currentPrice !== null && previousPrice !== null && previousPrice !== 0) {
      const abs = currentPrice - previousPrice;
      const pct = (abs / previousPrice) * 100;
      priceChangeAbs = Number.isFinite(abs) ? abs : null;
      priceChangePct = Number.isFinite(pct) ? pct : null;
    }

    // Calculate unrealized P&L for options
    // SnapTrade API fields for options:
    //   - price: per-SHARE premium (e.g., $5.00)
    //   - average_purchase_price: per-CONTRACT cost (e.g., $500 = $5 * 100 shares)
    //   - units: number of contracts
    let unrealizedPnL: number | null = null;
    let unrealizedPnLPct: number | null = null;

    if (pos.open_pnl !== null && pos.open_pnl !== undefined) {
      // Use API-provided P&L if available (total P&L for all contracts).
      // SnapTrade reports open_pnl from a long perspective — for short
      // positions (units < 0) we negate to get the correct direction.
      const isShort = pos.units !== null && pos.units < 0;
      unrealizedPnL = isShort ? -pos.open_pnl : pos.open_pnl;
      if (pos.average_purchase_price !== null && pos.units !== null && pos.average_purchase_price !== 0) {
        const totalCost = pos.average_purchase_price * Math.abs(pos.units);
        unrealizedPnLPct = totalCost !== 0 ? (unrealizedPnL / totalCost) * 100 : null;
      }
    } else if (pos.price !== null && pos.average_purchase_price !== null && pos.units !== null) {
      // Calculate P&L from price difference:
      //   - Current value per contract = price (per share) * 100
      //   - Cost per contract = average_purchase_price (already per-contract)
      //   - P&L = (current - cost) * units (units is negative for shorts,
      //     which naturally flips the P&L sign)
      const currentValuePerContract = pos.price * 100;
      const pnlPerContract = currentValuePerContract - pos.average_purchase_price;
      unrealizedPnL = pnlPerContract * pos.units;
      const costBasis = pos.average_purchase_price * Math.abs(pos.units);
      if (costBasis !== 0) {
        unrealizedPnLPct = (unrealizedPnL / costBasis) * 100;
      }
    }

    const marketValueRaw = pos.price !== null
      ? pos.price * Math.abs(pos.units) * 100
      : null;

    const positionData = {
      quantity: safeDecimal(pos.units) ?? new Prisma.Decimal(0),
      marketPrice: safeDecimal(pos.price),
      marketValue: safeDecimal(marketValueRaw),
      avgCostBasis: safeDecimal(pos.average_purchase_price),
      unrealizedPnL: safeDecimal(unrealizedPnL),
      unrealizedPnLPct: safeDecimal(unrealizedPnLPct),
      previousPrice: safeDecimal(previousPrice),
      priceChangeAbs: safeDecimal(priceChangeAbs),
      priceChangePct: safeDecimal(priceChangePct),
      currency: pos.currency?.code || 'USD',
      snaptradeSyncId: syncId,
      lastSyncAt: now,
      isStale: false,
    };

    if (existing) {
      optionUpdates.push({ id: existing.id, data: positionData });
    } else {
      optionCreates.push({
        userId: ctx.internalUserId,
        brokerageAccountId,
        symbol,
        positionType: 'option',
        optionType,
        strike: new Prisma.Decimal(strike),
        expiration,
        dataSource: 'snaptrade',
        ...positionData,
      });
    }
    result.optionPositions++;
  }

  log.debug({
    brokerageAccountId,
    stockCreates: stockCreates.length,
    stockUpdates: stockUpdates.length,
    optionCreates: optionCreates.length,
    optionUpdates: optionUpdates.length,
    futureCreates: futureCreates.length,
    futureUpdates: futureUpdates.length,
    cryptoCreates: cryptoCreates.length,
    cryptoUpdates: cryptoUpdates.length,
    stablecoinCreates: stablecoinCreates.length,
    stablecoinUpdates: stablecoinUpdates.length,
  }, 'Prepared batched position operations');

  // Persist position creates and updates without an interactive transaction.
  // The MSSQL adapter + Azure SQL suffers from severe latency inside interactive
  // transactions (each sequential operation is a round-trip). Position sync is
  // idempotent — a partial failure is corrected by the next sync — so atomicity
  // is not required here.

  // Create new positions
  const allCreates = [
    ...stockCreates,
    ...optionCreates,
    ...futureCreates,
    ...cryptoCreates,
    ...stablecoinCreates,
  ];
  if (allCreates.length > 0) {
    await ctx.prisma.brokerPosition.createMany({ data: allCreates });
  }

  // Update existing positions in small parallel batches
  const allUpdates = [
    ...stockUpdates,
    ...optionUpdates,
    ...futureUpdates,
    ...cryptoUpdates,
    ...stablecoinUpdates,
  ];
  if (allUpdates.length > 0) {
    await runBatched(allUpdates, 5, (u) =>
      ctx.prisma.brokerPosition.update({ where: { id: u.id }, data: u.data })
    );
  }

  // Batch upsert balances (parallel)
  const balanceInputs = balances
    .filter(bal => bal.currency?.code)
    .map(bal => ({
      currency: bal.currency!.code,
      cash: bal.cash,
      buyingPower: bal.buying_power,
    }));

  if (balanceInputs.length > 0) {
    await runBatched(balanceInputs, 3, (bal) => ctx.prisma.brokerBalance.upsert({
      where: {
        brokerageAccountId_currency: {
          brokerageAccountId,
          currency: bal.currency,
        },
      },
      create: {
        userId: ctx.internalUserId,
        brokerageAccountId,
        currency: bal.currency,
        cash: safeDecimal(bal.cash),
        buyingPower: safeDecimal(bal.buyingPower),
        lastSyncAt: now,
      },
      update: {
        cash: safeDecimal(bal.cash),
        buyingPower: safeDecimal(bal.buyingPower),
        lastSyncAt: now,
      },
    }));
    result.balances = balanceInputs.length;
  }

  // Batch upsert return rates (parallel)
  const rateInputs = returnRates
    .filter(rate => rate.timeframe)
    .map(rate => ({
      timeframe: rate.timeframe,
      returnPercent: rate.return_percent,
    }));

  if (rateInputs.length > 0) {
    await runBatched(rateInputs, 3, (rate) => ctx.prisma.brokerReturnRate.upsert({
      where: {
        brokerageAccountId_timeframe: {
          brokerageAccountId,
          timeframe: rate.timeframe,
        },
      },
      create: {
        userId: ctx.internalUserId,
        brokerageAccountId,
        timeframe: rate.timeframe,
        returnPercent: safeDecimal(rate.returnPercent) ?? new Prisma.Decimal(0),
        lastSyncAt: now,
      },
      update: {
        returnPercent: safeDecimal(rate.returnPercent) ?? new Prisma.Decimal(0),
        lastSyncAt: now,
      },
    }));
    result.returnRates = rateInputs.length;
  }

  // Mark positions not in this sync as stale (they may have been closed)
  await ctx.prisma.brokerPosition.updateMany({
    where: {
      brokerageAccountId,
      snaptradeSyncId: { not: syncId },
      isStale: false,
    },
    data: {
      isStale: true,
    },
  });

  log.info({ brokerageAccountId, result }, 'Position sync complete for account');

  return result;
}

/**
 * Sync positions for all connected SnapTrade accounts
 */
export async function syncAllPositions(
  ctx: LoggedOperationContext,
  userId: string
): Promise<Map<string, SyncPositionsResult>> {
  log.info({ userId }, 'Starting position sync for all accounts');

  const results = new Map<string, SyncPositionsResult>();

  // Get user's ACTIVE SnapTrade credentials
  const credential = await ctx.prisma.serviceCredential.findFirst({
    where: {
      userId,
      service: SNAPTRADE_SERVICE,
      isActive: true,
    },
  });

  if (!credential) {
    log.info({ userId }, 'No SnapTrade credentials found');
    return results;
  }

  const credentials: SnapTradeUserCredentials = {
    userId: credential.serviceUserId,
    userSecret: credential.serviceUserSecret,
  };

  // Get connected SnapTrade accounts
  const connectedAccounts = await getConnectedAccountsLogged(ctx, credentials);

  if (connectedAccounts.length === 0) {
    log.info({ userId }, 'No connected accounts found');
    return results;
  }

  // Get linked BrokerageAccounts - only sync to ACTIVE accounts
  const linkedAccounts = await ctx.prisma.brokerageAccount.findMany({
    where: {
      userId,
      isActive: true,
      externalAccountId: { in: connectedAccounts.map(a => a.id) },
    },
  });

  const accountMap = new Map(linkedAccounts.map(a => [a.externalAccountId, a]));

  // Sync each account
  for (const snapAccount of connectedAccounts) {
    const brokerageAccount = accountMap.get(snapAccount.id);
    if (!brokerageAccount) {
      log.debug({ snaptradeAccountId: snapAccount.id }, 'No linked brokerage account found, skipping');
      continue;
    }

    try {
      const result = await syncPositionsForAccount(
        ctx,
        credentials,
        snapAccount.id,
        brokerageAccount.id
      );
      results.set(brokerageAccount.id, result);
    } catch (err) {
      log.error({ err, brokerageAccountId: brokerageAccount.id }, 'Failed to sync positions for account');
    }
  }

  // Update sync status on credential
  await ctx.prisma.serviceCredential.update({
    where: { id: credential.id },
    data: {
      lastSyncAt: new Date(),
      syncStatus: 'success',
      syncError: null,
    },
  });

  log.info({ userId, accountCount: results.size }, 'Position sync complete for all accounts');

  return results;
}

// ============================================================================
// Unified View Functions
// ============================================================================

/**
 * Get unified position view combining API positions and derived positions
 *
 * IMPORTANT: For SnapTrade-connected accounts (those with externalAccountId):
 *   - ONLY show BrokerPosition data (synced from SnapTrade API)
 *   - NEVER show DerivedPosition data (even if it exists from transaction sync)
 * For manual accounts (no externalAccountId):
 *   - Show DerivedPosition data (computed from ledger via FIFO)
 *
 * This ensures no duplicates between API-synced and ledger-derived positions.
 */
export async function getUnifiedPositions(
  prisma: PrismaClient,
  userId: string,
  options?: {
    accountId?: string;
    includeStale?: boolean;
    includeClosed?: boolean;
  }
): Promise<UnifiedPosition[]> {
  const positions: UnifiedPosition[] = [];

  // Get all brokerage accounts
  const accountWhere = {
    userId,
    isActive: true,
    ...(options?.accountId ? { id: options.accountId } : {}),
  };

  const accounts = await prisma.brokerageAccount.findMany({
    where: accountWhere,
    select: {
      id: true,
      name: true,
      broker: true,
      externalAccountId: true,
    },
  });

  // Separate accounts by whether they have SnapTrade connection
  // externalAccountId being set means this account is linked to SnapTrade
  const snaptradeAccountIds = accounts
    .filter(a => a.externalAccountId != null && a.externalAccountId !== '')
    .map(a => a.id);
  const manualAccountIds = accounts
    .filter(a => a.externalAccountId == null || a.externalAccountId === '')
    .map(a => a.id);

  log.debug({
    userId,
    totalAccounts: accounts.length,
    snaptradeAccounts: snaptradeAccountIds.length,
    manualAccounts: manualAccountIds.length,
  }, 'Unified positions: separating accounts by type');

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  // Get BrokerPositions for SnapTrade-connected accounts
  if (snaptradeAccountIds.length > 0) {
    const brokerPositions = await prisma.brokerPosition.findMany({
      where: {
        userId,
        brokerageAccountId: { in: snaptradeAccountIds },
        ...(options?.includeStale ? {} : { isStale: false }),
        ...(options?.includeClosed ? {} : { quantity: { not: new Prisma.Decimal(0) } }),
      },
    });

    for (const pos of brokerPositions) {
      const account = accountMap.get(pos.brokerageAccountId);
      if (!account) continue;

      positions.push({
        id: pos.id,
        symbol: pos.symbol,
        positionType: pos.positionType as 'stock' | 'option' | 'future' | 'crypto',
        quantity: Number(pos.quantity),
        avgCostBasis: pos.avgCostBasis ? Number(pos.avgCostBasis) : null,
        optionType: pos.optionType as 'call' | 'put' | undefined,
        strike: pos.strike ? Number(pos.strike) : undefined,
        expiration: pos.expiration || undefined,
        marketPrice: pos.marketPrice ? Number(pos.marketPrice) : undefined,
        marketValue: pos.marketValue ? Number(pos.marketValue) : undefined,
        unrealizedPnL: pos.unrealizedPnL ? Number(pos.unrealizedPnL) : undefined,
        unrealizedPnLPct: pos.unrealizedPnLPct ? Number(pos.unrealizedPnLPct) : undefined,
        // Price change tracking
        previousPrice: pos.previousPrice ? Number(pos.previousPrice) : undefined,
        priceChangeAbs: pos.priceChangeAbs ? Number(pos.priceChangeAbs) : undefined,
        priceChangePct: pos.priceChangePct ? Number(pos.priceChangePct) : undefined,
        dataSource: 'snaptrade',
        brokerageAccountId: pos.brokerageAccountId,
        brokerageAccountName: account.name,
        broker: account.broker,
        lastSyncAt: pos.lastSyncAt,
        isStale: pos.isStale,
      });
    }
  }

  // Get DerivedPositions for manual accounts
  if (manualAccountIds.length > 0) {
    const derivedPositions = await prisma.derivedPosition.findMany({
      where: {
        userId,
        brokerageAccountId: { in: manualAccountIds },
        ...(options?.includeClosed ? {} : { quantity: { not: new Prisma.Decimal(0) } }),
      },
    });

    for (const pos of derivedPositions) {
      const account = accountMap.get(pos.brokerageAccountId);
      if (!account) continue;

      positions.push({
        id: pos.id,
        symbol: pos.symbol,
        positionType: pos.positionType as 'stock' | 'option' | 'future' | 'crypto',
        quantity: Number(pos.quantity),
        avgCostBasis: Number(pos.avgPrice),
        optionType: pos.optionType as 'call' | 'put' | undefined,
        strike: pos.strike ? Number(pos.strike) : undefined,
        expiration: pos.expiration || undefined,
        // No market data for derived positions
        marketPrice: undefined,
        marketValue: undefined,
        unrealizedPnL: undefined,
        unrealizedPnLPct: undefined,
        dataSource: 'derived',
        brokerageAccountId: pos.brokerageAccountId,
        brokerageAccountName: account.name,
        broker: account.broker,
        lastSyncAt: pos.derivedAt,
        isStale: false, // Derived positions are always "current" based on ledger
      });
    }
  }

  // Deduplicate by creating a unique key for each position
  // This prevents any edge cases where the same position might appear twice
  const seen = new Set<string>();
  const deduped = positions.filter(p => {
    // Create a unique key: account + symbol + type + option details
    const key = [
      p.brokerageAccountId,
      p.symbol,
      p.positionType,
      p.optionType || '',
      p.strike?.toString() || '',
      p.expiration?.toISOString() || '',
    ].join('|');

    if (seen.has(key)) {
      log.warn({ key, dataSource: p.dataSource }, 'Duplicate position detected and removed');
      return false;
    }
    seen.add(key);
    return true;
  });

  // Sort by symbol then position type
  deduped.sort((a, b) => {
    const symbolCompare = a.symbol.localeCompare(b.symbol);
    if (symbolCompare !== 0) return symbolCompare;
    return a.positionType.localeCompare(b.positionType);
  });

  log.debug({
    userId,
    originalCount: positions.length,
    dedupedCount: deduped.length,
    duplicatesRemoved: positions.length - deduped.length,
  }, 'Unified positions: final count');

  return deduped;
}

/**
 * Get unified balances for all accounts
 */
export async function getUnifiedBalances(
  prisma: PrismaClient,
  userId: string,
  options?: { accountId?: string }
): Promise<UnifiedBalance[]> {
  const balances: UnifiedBalance[] = [];

  // Get broker balances for SnapTrade accounts
  const brokerBalances = await prisma.brokerBalance.findMany({
    where: {
      userId,
      ...(options?.accountId ? { brokerageAccountId: options.accountId } : {}),
    },
    include: {
      brokerageAccount: {
        select: { name: true },
      },
    },
  });

  for (const bal of brokerBalances) {
    balances.push({
      brokerageAccountId: bal.brokerageAccountId,
      brokerageAccountName: bal.brokerageAccount.name,
      currency: bal.currency,
      cash: bal.cash ? Number(bal.cash) : null,
      buyingPower: bal.buyingPower ? Number(bal.buyingPower) : null,
      lastSyncAt: bal.lastSyncAt,
    });
  }

  return balances;
}

/**
 * Get unified return rates for all accounts
 */
export async function getUnifiedReturnRates(
  prisma: PrismaClient,
  userId: string,
  options?: { accountId?: string }
): Promise<UnifiedReturnRate[]> {
  const rates: UnifiedReturnRate[] = [];

  const brokerRates = await prisma.brokerReturnRate.findMany({
    where: {
      userId,
      ...(options?.accountId ? { brokerageAccountId: options.accountId } : {}),
    },
    include: {
      brokerageAccount: {
        select: { name: true },
      },
    },
    orderBy: [
      { brokerageAccountId: 'asc' },
      { timeframe: 'asc' },
    ],
  });

  for (const rate of brokerRates) {
    rates.push({
      brokerageAccountId: rate.brokerageAccountId,
      brokerageAccountName: rate.brokerageAccount.name,
      timeframe: rate.timeframe,
      returnPercent: Number(rate.returnPercent),
      lastSyncAt: rate.lastSyncAt,
    });
  }

  return rates;
}

/**
 * Get stablecoin holdings for all accounts
 * Only returns holdings with quantity > 0
 */
export async function getStablecoinHoldings(
  prisma: PrismaClient,
  userId: string,
  options?: { accountId?: string }
): Promise<StablecoinHolding[]> {
  const holdings: StablecoinHolding[] = [];

  const stablecoinPositions = await prisma.brokerPosition.findMany({
    where: {
      userId,
      positionType: 'stablecoin',
      isStale: false,
      quantity: { not: new Prisma.Decimal(0) },
      ...(options?.accountId ? { brokerageAccountId: options.accountId } : {}),
    },
    include: {
      brokerageAccount: {
        select: { name: true },
      },
    },
    orderBy: { symbol: 'asc' },
  });

  for (const pos of stablecoinPositions) {
    const quantity = Number(pos.quantity);
    // Skip zero or near-zero balances
    if (Math.abs(quantity) < 0.01) continue;

    holdings.push({
      symbol: pos.symbol,
      quantity,
      marketValue: pos.marketValue ? Number(pos.marketValue) : quantity, // Stablecoins are ~$1
      brokerageAccountId: pos.brokerageAccountId,
      brokerageAccountName: pos.brokerageAccount.name,
      lastSyncAt: pos.lastSyncAt,
    });
  }

  return holdings;
}

/**
 * Check if positions need refresh (older than specified minutes)
 */
export async function positionsNeedRefresh(
  prisma: PrismaClient,
  userId: string,
  maxAgeMinutes: number = 5
): Promise<boolean> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  // Check if any SnapTrade-connected account has stale data
  const staleCount = await prisma.brokerPosition.count({
    where: {
      userId,
      OR: [
        { lastSyncAt: { lt: cutoff } },
        { isStale: true },
      ],
    },
  });

  return staleCount > 0;
}

/**
 * Mark all positions for a user as stale
 */
export async function markPositionsStale(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.brokerPosition.updateMany({
    where: { userId },
    data: { isStale: true },
  });
}
