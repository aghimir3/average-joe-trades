/**
 * Derivation Runner - Account-Aware Derivation Orchestration
 *
 * This service runs the derivation pipeline per-account and computes:
 * - Per-account DerivedPositions and RealizedCloses
 * - Per-account DailyAggregates
 * - All-accounts rollup (brokerageAccountId = NULL)
 *
 * The runner fetches ledger events per-account, runs FIFO matching,
 * and persists results with proper account attribution.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import { TRANS_CODE_MAPPING } from '@/db/constants';

const logger = createChildLogger({ module: 'derivation-runner' });

// ============================================================================
// Types
// ============================================================================

interface TradingEvent {
  id: string;
  brokerageAccountId: string;
  activityDate: Date;
  activityTime?: string | null;
  processDate?: Date | null;
  createdAt: Date;
  transCode: string;
  symbol: string;
  quantity: number;
  price: number | null;
  amount: number | null;
  isOption: boolean;
  optionType: string | null;
  strike: number | null;
  expiration: Date | null;
  action: string | null;
  eventType: string;
  strategy?: string | null;
  underlyingPrice?: number | null;
}

interface OpenLot {
  eventId: string;
  brokerageAccountId: string;
  date: Date;
  time: string | null;
  quantity: number;
  originalQuantity: number;
  price: number;
  amount: number;
  side: 'long' | 'short';
}

interface LotConsumption {
  eventId: string;
  quantity: number;
  amount: number;
  price: number;
  date: Date;
  time: string | null;
  underlyingPrice: number | null;
}

interface MatchedClose {
  openEventIds: string[];
  openLotConsumptions: LotConsumption[];
  closeEventId: string;
  brokerageAccountId: string;
  symbol: string;
  isOption: boolean;
  isFuture: boolean;
  optionType: string | null;
  strike: number | null;
  expiration: Date | null;
  openDate: Date;
  openTime: string | null;
  closeDate: Date;
  closeTime: string | null;
  quantity: number;
  openPrice: number;
  closePrice: number;
  openAmount: number;
  closeAmount: number;
  realizedPnL: number;
  closeReason: 'normal' | 'expired' | 'assigned';
  side: 'long' | 'short';
  strategy: string | null;
  isAssignment: boolean;
  isWheelTrade: boolean;
  hasUnknownBasis: boolean;
  underlyingPriceAtOpen: number | null;
  underlyingPriceAtClose: number | null;
}

interface OpenPosition {
  eventIds: string[];
  lotDetails: Array<{ eventId: string; quantity: number; amount: number }>;
  brokerageAccountId: string;
  symbol: string;
  positionType: 'stock' | 'option' | 'future';
  side: 'long' | 'short';
  optionType: string | null;
  strike: number | null;
  expiration: Date | null;
  quantity: number;
  costBasis: number;
  avgPrice: number;
  firstEntryDate: Date;
  lastEntryDate: Date;
  strategy: string | null;
}

interface ImportIssueRecord {
  userId: string;
  importBatchId: string | null;
  issueType: string;
  severity: 'error' | 'warning' | 'info';
  ledgerEventId: string | null;
  symbol: string | null;
  message: string;
  details: string | null;
}

export interface DerivationResult {
  positions: OpenPosition[];
  closes: MatchedClose[];
  unmatchedCloses: Array<{
    eventId: string;
    brokerageAccountId: string;
    symbol: string;
    quantity: number;
    reason: string;
  }>;
  issues: ImportIssueRecord[];
}

export interface AccountDerivationSummary {
  accountId: string;
  accountName: string;
  broker: string;
  positionCount: number;
  closeCount: number;
  totalPnL: number;
  winCount: number;
  lossCount: number;
}

export interface FullDerivationResult {
  accountResults: Map<string, DerivationResult>;
  accountSummaries: AccountDerivationSummary[];
  allAccountsSummary: {
    totalPositions: number;
    totalCloses: number;
    totalPnL: number;
    totalWins: number;
    totalLosses: number;
  };
  issues: ImportIssueRecord[];
}

// ============================================================================
// Transaction Classification
// ============================================================================

function isOpeningTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  const mapping = TRANS_CODE_MAPPING[code];
  return mapping?.isOpening ?? false;
}

function isClosingTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  const mapping = TRANS_CODE_MAPPING[code];
  return mapping?.isClosing ?? false;
}

function getPositionSide(transCode: string): 'long' | 'short' {
  const code = transCode.toUpperCase().trim();
  if (code === 'STO' || code === 'SELL') {
    return 'short';
  }
  return 'long';
}

function getClosingSide(transCode: string): 'long' | 'short' | 'either' {
  const code = transCode.toUpperCase().trim();
  if (code === 'STC' || code === 'SELL') {
    return 'long';
  }
  if (code === 'BTC') {
    return 'short';
  }
  return 'either';
}

function getCloseReason(transCode: string): 'normal' | 'expired' | 'assigned' {
  const code = transCode.toUpperCase().trim();
  if (code === 'OEXP') return 'expired';
  if (code === 'OASGN') return 'assigned';
  return 'normal';
}

function detectStrategy(
  side: 'long' | 'short',
  optionType: string | null,
  eventStrategy?: string | null
): string | null {
  // If user specified strategy in manual entry, use that
  if (eventStrategy) return eventStrategy;

  if (!optionType) return null;

  if (side === 'short') {
    return optionType === 'call' ? 'covered_call' : 'cash_secured_put';
  } else {
    return optionType === 'call' ? 'long_call' : 'long_put';
  }
}

function isFutureEvent(event: TradingEvent): boolean {
  return event.eventType === 'FUTURES';
}

function getPositionType(event: TradingEvent): 'stock' | 'option' | 'future' {
  if (event.isOption) return 'option';
  if (isFutureEvent(event)) return 'future';
  return 'stock';
}

function getInstrumentKey(event: TradingEvent): string {
  if (event.isOption && event.optionType && event.strike !== null && event.expiration) {
    const expStr = event.expiration.toISOString().split('T')[0];
    return `${event.symbol}|${event.optionType}|${event.strike}|${expStr}`;
  }
  if (isFutureEvent(event)) {
    return `${event.symbol}|future`;
  }
  return `${event.symbol}|stock`;
}

function sortEvents(events: TradingEvent[]): TradingEvent[] {
  return [...events].sort((a, b) => {
    // Primary sort: by activity date
    const dateCompare = a.activityDate.getTime() - b.activityDate.getTime();
    if (dateCompare !== 0) return dateCompare;

    // Secondary sort: by activity time (HH:MM format)
    // This ensures same-day trades are ordered by their actual execution time
    const aTime = a.activityTime || '00:00';
    const bTime = b.activityTime || '00:00';
    const timeCompare = aTime.localeCompare(bTime);
    if (timeCompare !== 0) return timeCompare;

    // Tertiary sort: opening transactions before closing transactions
    // This ensures BTO/BUY/STO comes before STC/SELL/BTC when dates and times are equal
    const aIsOpening = isOpeningTransaction(a.transCode);
    const bIsOpening = isOpeningTransaction(b.transCode);
    if (aIsOpening && !bIsOpening) return -1;
    if (!aIsOpening && bIsOpening) return 1;

    // Quaternary sort: by creation time (database insertion order)
    // This preserves the order trades were entered when times are equal
    const createdCompare = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdCompare !== 0) return createdCompare;

    // Final fallback: by ID for deterministic ordering
    return a.id.localeCompare(b.id);
  });
}

// ============================================================================
// FIFO Matching (Account-Scoped)
// ============================================================================

function matchInstrumentFifo(
  events: TradingEvent[],
  instrumentKey: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _brokerageAccountId: string
): {
  closes: MatchedClose[];
  openLots: Array<OpenLot & { event: TradingEvent }>;
  unmatchedCloses: Array<{ eventId: string; brokerageAccountId: string; symbol: string; quantity: number; reason: string }>;
  issues: ImportIssueRecord[];
} {
  const sorted = sortEvents(events);
  const openLots: Array<OpenLot & { event: TradingEvent }> = [];
  const closes: MatchedClose[] = [];
  const unmatchedCloses: Array<{ eventId: string; brokerageAccountId: string; symbol: string; quantity: number; reason: string }> = [];
  const issues: ImportIssueRecord[] = [];

  for (const event of sorted) {
    const code = event.transCode.toUpperCase().trim();

    if (isOpeningTransaction(code)) {
      const side = getPositionSide(code);
      openLots.push({
        eventId: event.id,
        brokerageAccountId: event.brokerageAccountId,
        date: event.activityDate,
        time: event.activityTime || null,
        quantity: Math.abs(event.quantity),
        originalQuantity: Math.abs(event.quantity),
        price: Math.abs(event.price || 0),
        amount: Math.abs(event.amount || 0),
        side,
        event,
      });
    } else if (isClosingTransaction(code)) {
      let closeQty = Math.abs(event.quantity);
      const closeDate = event.activityDate;
      const closePrice = Math.abs(event.price || 0);
      const closeReason = getCloseReason(code);
      const closingSide = getClosingSide(code);

      const effectiveClosePrice = (code === 'OEXP' || code === 'OASGN') ? 0 : closePrice;
      const effectiveCloseAmount = (code === 'OEXP' || code === 'OASGN') ? 0 : Math.abs(event.amount || 0);

      const lotConsumptions: LotConsumption[] = [];
      let totalOpenAmount = 0;
      let totalMatchedQty = 0;
      let firstOpenDate: Date | null = null;
      let firstOpenTime: string | null = null;
      let matchedSide: 'long' | 'short' | null = null;
      let matchedStrategy: string | null = null;

      for (const lot of openLots) {
        if (closeQty <= 0) break;
        if (lot.quantity <= 0) continue;
        if (closingSide !== 'either' && lot.side !== closingSide) continue;
        if (closeDate < lot.date) continue;

        const matchQty = Math.min(lot.quantity, closeQty);
        const openProration = matchQty / lot.originalQuantity;

        lotConsumptions.push({
          eventId: lot.eventId,
          quantity: matchQty,
          amount: lot.amount * openProration,
          price: lot.price,
          date: lot.date,
          time: lot.time,
          underlyingPrice: lot.event.underlyingPrice ?? null,
        });

        totalOpenAmount += lot.amount * openProration;
        totalMatchedQty += matchQty;

        if (!firstOpenDate || lot.date < firstOpenDate) {
          firstOpenDate = lot.date;
          firstOpenTime = lot.time;
        }

        if (matchedSide === null) {
          matchedSide = lot.side;
        }

        // Capture strategy from first matched lot if available
        if (!matchedStrategy && lot.event.strategy) {
          matchedStrategy = lot.event.strategy;
        }

        lot.quantity -= matchQty;
        closeQty -= matchQty;
      }

      if (lotConsumptions.length > 0 && totalMatchedQty > 0) {
        const avgOpenPrice = lotConsumptions.reduce(
          (sum, lc) => sum + lc.price * lc.quantity,
          0
        ) / totalMatchedQty;

        const closeAmountProration = totalMatchedQty / Math.abs(event.quantity);
        const proratedCloseAmount = effectiveCloseAmount * closeAmountProration;

        const side = matchedSide || 'long';

        let realizedPnL: number;
        if (side === 'short') {
          realizedPnL = totalOpenAmount - proratedCloseAmount;
        } else {
          realizedPnL = proratedCloseAmount - totalOpenAmount;
        }

        const strategy = matchedStrategy || detectStrategy(side, event.optionType, event.strategy);
        const isWheelTrade = strategy === 'covered_call' || strategy === 'cash_secured_put';

        // Calculate weighted average underlying price at open (only if we have values)
        const lotsWithUnderlyingPrice = lotConsumptions.filter(lc => lc.underlyingPrice !== null);
        const avgUnderlyingPriceAtOpen = lotsWithUnderlyingPrice.length > 0
          ? lotsWithUnderlyingPrice.reduce((sum, lc) => sum + (lc.underlyingPrice! * lc.quantity), 0) /
            lotsWithUnderlyingPrice.reduce((sum, lc) => sum + lc.quantity, 0)
          : null;

        closes.push({
          openEventIds: lotConsumptions.map(lc => lc.eventId),
          openLotConsumptions: lotConsumptions,
          closeEventId: event.id,
          brokerageAccountId: event.brokerageAccountId,
          symbol: event.symbol,
          isOption: event.isOption,
          isFuture: isFutureEvent(event),
          optionType: event.optionType,
          strike: event.strike,
          expiration: event.expiration,
          openDate: firstOpenDate!,
          openTime: firstOpenTime,
          closeDate,
          closeTime: event.activityTime || null,
          quantity: totalMatchedQty,
          openPrice: avgOpenPrice,
          closePrice: effectiveClosePrice,
          openAmount: totalOpenAmount,
          closeAmount: proratedCloseAmount,
          realizedPnL,
          closeReason,
          side,
          strategy,
          isAssignment: closeReason === 'assigned',
          isWheelTrade,
          hasUnknownBasis: false,
          underlyingPriceAtOpen: avgUnderlyingPriceAtOpen,
          underlyingPriceAtClose: event.underlyingPrice ?? null,
        });
      }

      if (closeQty > 0) {
        const unknownBasisClose: MatchedClose = {
          openEventIds: [],
          openLotConsumptions: [],
          closeEventId: event.id,
          brokerageAccountId: event.brokerageAccountId,
          symbol: event.symbol,
          isOption: event.isOption,
          isFuture: isFutureEvent(event),
          optionType: event.optionType,
          strike: event.strike,
          expiration: event.expiration,
          openDate: closeDate,
          openTime: null,
          closeDate,
          closeTime: event.activityTime || null,
          quantity: closeQty,
          openPrice: 0,
          closePrice: effectiveClosePrice,
          openAmount: 0,
          closeAmount: effectiveCloseAmount * (closeQty / Math.abs(event.quantity)),
          realizedPnL: 0,
          closeReason,
          side: closingSide === 'either' ? 'long' : closingSide,
          strategy: null,
          isAssignment: closeReason === 'assigned',
          isWheelTrade: false,
          hasUnknownBasis: true,
          underlyingPriceAtOpen: null,
          underlyingPriceAtClose: event.underlyingPrice ?? null,
        };

        closes.push(unknownBasisClose);
        unmatchedCloses.push({
          eventId: event.id,
          brokerageAccountId: event.brokerageAccountId,
          symbol: event.symbol,
          quantity: closeQty,
          reason: 'No matching open position found',
        });

        issues.push({
          userId,
          importBatchId: null,
          issueType: 'unknown_basis',
          severity: 'warning',
          ledgerEventId: event.id,
          symbol: event.symbol,
          message: `Close without matching open: ${event.transCode} ${closeQty} ${event.symbol}`,
          details: JSON.stringify({ transCode: event.transCode, quantity: closeQty, instrumentKey }),
        });
      }
    }
  }

  return { closes, openLots, unmatchedCloses, issues };
}

// ============================================================================
// Main Derivation Functions
// ============================================================================

/**
 * Derive positions and closes for a single brokerage account.
 */
export async function deriveForAccount(
  prisma: PrismaClient,
  userId: string,
  brokerageAccountId: string
): Promise<DerivationResult> {
  const log = logger.child({ userId, brokerageAccountId, operation: 'deriveForAccount' });
  log.info('Starting account derivation');

  // Fetch ledger events for this account
  const events = await prisma.ledgerEvent.findMany({
    where: {
      userId,
      brokerageAccountId,
      deletedAt: null,
      eventType: { in: ['EQUITY_STOCK', 'EQUITY_OPTION', 'FUTURES'] },
    },
    orderBy: { activityDate: 'asc' },
  });

  if (events.length === 0) {
    return { positions: [], closes: [], unmatchedCloses: [], issues: [] };
  }

  // Convert to TradingEvent format
  const tradingEvents: TradingEvent[] = events.map(e => ({
    id: e.id,
    brokerageAccountId: e.brokerageAccountId,
    activityDate: e.activityDate,
    activityTime: e.activityTime,
    processDate: e.processDate,
    createdAt: e.createdAt,
    transCode: e.transCode,
    symbol: e.symbol,
    quantity: Number(e.quantity),
    price: e.price ? Number(e.price) : null,
    amount: e.amount ? Number(e.amount) : null,
    isOption: e.isOption,
    optionType: e.optionType,
    strike: e.strike ? Number(e.strike) : null,
    expiration: e.expiration,
    action: e.action,
    eventType: e.eventType,
    strategy: e.strategy,
    underlyingPrice: e.underlyingPrice ? Number(e.underlyingPrice) : null,
  }));

  log.info({ eventCount: tradingEvents.length }, 'Loaded trading events');

  // Group by instrument
  const groupedEvents = new Map<string, TradingEvent[]>();
  for (const event of tradingEvents) {
    const key = getInstrumentKey(event);
    const group = groupedEvents.get(key) || [];
    group.push(event);
    groupedEvents.set(key, group);
  }

  // Process each instrument
  const allCloses: MatchedClose[] = [];
  const allOpenLots: Array<OpenLot & { instrumentKey: string; event: TradingEvent }> = [];
  const allUnmatchedCloses: DerivationResult['unmatchedCloses'] = [];
  const allIssues: ImportIssueRecord[] = [];

  for (const [instrumentKey, instrumentEvents] of groupedEvents) {
    const result = matchInstrumentFifo(instrumentEvents, instrumentKey, userId, brokerageAccountId);
    allCloses.push(...result.closes);
    allUnmatchedCloses.push(...result.unmatchedCloses);
    allIssues.push(...result.issues);

    for (const lot of result.openLots) {
      if (lot.quantity > 0) {
        allOpenLots.push({ ...lot, instrumentKey });
      }
    }
  }

  // Aggregate open lots into positions
  const positionMap = new Map<string, OpenPosition>();

  for (const lot of allOpenLots) {
    const event = lot.event;
    const key = lot.instrumentKey + '|' + lot.side;

    const existing = positionMap.get(key);
    if (existing) {
      existing.eventIds.push(lot.eventId);
      existing.lotDetails.push({
        eventId: lot.eventId,
        quantity: lot.quantity,
        amount: lot.amount * (lot.quantity / lot.originalQuantity),
      });
      existing.quantity += lot.quantity;
      existing.costBasis += lot.amount * (lot.quantity / lot.originalQuantity);
      existing.avgPrice = existing.costBasis / existing.quantity;
      if (lot.date < existing.firstEntryDate) existing.firstEntryDate = lot.date;
      if (lot.date > existing.lastEntryDate) existing.lastEntryDate = lot.date;
    } else {
      const lotAmount = lot.amount * (lot.quantity / lot.originalQuantity);
      positionMap.set(key, {
        eventIds: [lot.eventId],
        lotDetails: [{ eventId: lot.eventId, quantity: lot.quantity, amount: lotAmount }],
        brokerageAccountId: lot.brokerageAccountId,
        symbol: event.symbol,
        positionType: getPositionType(event),
        side: lot.side,
        optionType: event.optionType,
        strike: event.strike,
        expiration: event.expiration,
        quantity: lot.quantity,
        costBasis: lotAmount,
        avgPrice: lot.price,
        firstEntryDate: lot.date,
        lastEntryDate: lot.date,
        strategy: event.strategy || detectStrategy(lot.side, event.optionType),
      });
    }
  }

  const positions = Array.from(positionMap.values());

  log.info({
    positions: positions.length,
    closes: allCloses.length,
    unmatched: allUnmatchedCloses.length,
  }, 'Account derivation complete');

  return {
    positions,
    closes: allCloses,
    unmatchedCloses: allUnmatchedCloses,
    issues: allIssues,
  };
}

/**
 * Run derivation for all accounts of a user and persist results.
 * Also computes all-accounts rollup for DailyAggregates.
 */
export async function runFullDerivation(
  prisma: PrismaClient,
  userId: string
): Promise<FullDerivationResult> {
  const log = logger.child({ userId, operation: 'runFullDerivation' });
  log.info('Starting full derivation for all accounts');

  // Get all active brokerage accounts
  const accounts = await prisma.brokerageAccount.findMany({
    where: { userId, isActive: true },
    orderBy: { isDefault: 'desc' },
  });

  if (accounts.length === 0) {
    log.warn('No brokerage accounts found');
    return {
      accountResults: new Map(),
      accountSummaries: [],
      allAccountsSummary: {
        totalPositions: 0,
        totalCloses: 0,
        totalPnL: 0,
        totalWins: 0,
        totalLosses: 0,
      },
      issues: [],
    };
  }

  // Derive for each account
  const accountResults = new Map<string, DerivationResult>();
  const accountSummaries: AccountDerivationSummary[] = [];
  const allIssues: ImportIssueRecord[] = [];

  let totalPositions = 0;
  let totalCloses = 0;
  let totalPnL = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (const account of accounts) {
    const result = await deriveForAccount(prisma, userId, account.id);
    accountResults.set(account.id, result);
    allIssues.push(...result.issues);

    // Calculate account summary
    const accountPnL = result.closes
      .filter(c => !c.hasUnknownBasis)
      .reduce((sum, c) => sum + c.realizedPnL, 0);
    const winCount = result.closes.filter(c => !c.hasUnknownBasis && c.realizedPnL > 0).length;
    const lossCount = result.closes.filter(c => !c.hasUnknownBasis && c.realizedPnL < 0).length;

    accountSummaries.push({
      accountId: account.id,
      accountName: account.name,
      broker: account.broker,
      positionCount: result.positions.length,
      closeCount: result.closes.length,
      totalPnL: accountPnL,
      winCount,
      lossCount,
    });

    totalPositions += result.positions.length;
    totalCloses += result.closes.length;
    totalPnL += accountPnL;
    totalWins += winCount;
    totalLosses += lossCount;
  }

  log.info({
    accountCount: accounts.length,
    totalPositions,
    totalCloses,
    totalPnL,
  }, 'Full derivation complete');

  return {
    accountResults,
    accountSummaries,
    allAccountsSummary: {
      totalPositions,
      totalCloses,
      totalPnL,
      totalWins,
      totalLosses,
    },
    issues: allIssues,
  };
}

// ============================================================================
// Persistence
// ============================================================================

const SQL_SERVER_PARAM_LIMIT = 2000;

function getMaxRowsPerBatch(totalColumns: number): number {
  return Math.floor(SQL_SERVER_PARAM_LIMIT / totalColumns);
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Persist derivation results to the database.
 * Replaces all existing derived data for the user.
 */
export async function persistDerivation(
  prisma: PrismaClient,
  userId: string,
  fullResult: FullDerivationResult
): Promise<void> {
  const log = logger.child({ userId, operation: 'persistDerivation' });
  log.info({
    accountCount: fullResult.accountSummaries.length,
    totalPositions: fullResult.allAccountsSummary.totalPositions,
    totalCloses: fullResult.allAccountsSummary.totalCloses,
  }, 'Persisting derivation results');

  const derivationVersion = Math.floor(Date.now() / 1000) % 1000000;

  // Prepare all data in memory
  const positionRecords: Array<Prisma.DerivedPositionCreateManyInput & { _lotDetails: Array<{ eventId: string; quantity: number; amount: number }> }> = [];
  const closeRecords: Array<Prisma.RealizedCloseCreateManyInput & { _openLotConsumptions: LotConsumption[]; _closeEventId: string }> = [];

  for (const [accountId, result] of fullResult.accountResults) {
    for (const position of result.positions) {
      positionRecords.push({
        id: crypto.randomUUID(),
        userId,
        brokerageAccountId: accountId,
        symbol: position.symbol,
        positionType: position.positionType,
        side: position.side,
        optionType: position.optionType,
        strike: position.strike !== null ? new Prisma.Decimal(position.strike) : null,
        expiration: position.expiration,
        quantity: new Prisma.Decimal(position.quantity),
        costBasis: new Prisma.Decimal(position.costBasis),
        avgPrice: new Prisma.Decimal(position.avgPrice),
        firstEntryDate: position.firstEntryDate,
        lastEntryDate: position.lastEntryDate,
        strategy: position.strategy,
        derivationVersion,
        _lotDetails: position.lotDetails,
      });
    }

    for (const close of result.closes) {
      closeRecords.push({
        id: crypto.randomUUID(),
        userId,
        brokerageAccountId: accountId,
        symbol: close.symbol,
        closeType: close.isOption ? 'option' : close.isFuture ? 'future' : 'stock',
        side: close.side,
        optionType: close.optionType,
        strike: close.strike !== null ? new Prisma.Decimal(close.strike) : null,
        expiration: close.expiration,
        strategy: close.strategy,
        openDate: close.openDate,
        openTime: close.openTime,
        closeDate: close.closeDate,
        closeTime: close.closeTime,
        quantity: new Prisma.Decimal(close.quantity),
        openPrice: new Prisma.Decimal(close.openPrice),
        closePrice: new Prisma.Decimal(close.closePrice),
        openAmount: new Prisma.Decimal(close.openAmount),
        closeAmount: new Prisma.Decimal(close.closeAmount),
        realizedPnL: new Prisma.Decimal(close.realizedPnL),
        closeReason: close.closeReason,
        underlyingPriceAtOpen: close.underlyingPriceAtOpen !== null ? new Prisma.Decimal(close.underlyingPriceAtOpen) : null,
        underlyingPriceAtClose: close.underlyingPriceAtClose !== null ? new Prisma.Decimal(close.underlyingPriceAtClose) : null,
        isAssignment: close.isAssignment,
        isWheelTrade: close.isWheelTrade,
        hasUnknownBasis: close.hasUnknownBasis,
        derivationVersion,
        _openLotConsumptions: close.openLotConsumptions,
        _closeEventId: close.closeEventId,
      });
    }
  }

  // Build position ledger links
  const links: Prisma.PositionLedgerLinkCreateManyInput[] = [];

  for (const posRecord of positionRecords) {
    for (const lot of posRecord._lotDetails) {
      links.push({
        id: crypto.randomUUID(),
        positionId: posRecord.id,
        realizedCloseId: null,
        openEventId: lot.eventId,
        closeEventId: null,
        quantity: new Prisma.Decimal(lot.quantity),
        linkType: 'open',
      });
    }
  }

  for (const closeRecord of closeRecords) {
    links.push({
      id: crypto.randomUUID(),
      positionId: null,
      realizedCloseId: closeRecord.id,
      openEventId: null,
      closeEventId: closeRecord._closeEventId,
      quantity: closeRecord.quantity,
      linkType: 'close',
    });

    for (const consumption of closeRecord._openLotConsumptions) {
      links.push({
        id: crypto.randomUUID(),
        positionId: null,
        realizedCloseId: closeRecord.id,
        openEventId: consumption.eventId,
        closeEventId: null,
        quantity: new Prisma.Decimal(consumption.quantity),
        linkType: 'partial_open',
      });
    }
  }

  // Compute daily aggregates per account + all-accounts rollup
  const dailyMap = new Map<string, {
    brokerageAccountId: string | null;
    date: Date;
    pnl: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    stockPnL: number;
    optionPnL: number;
    wheelPremiums: number;
  }>();

  for (const closeRecord of closeRecords) {
    if (closeRecord.hasUnknownBasis) continue;

    const pnl = Number(closeRecord.realizedPnL);
    // Ensure closeDate is a Date object (Prisma types allow string | Date for datetime fields)
    const closeDate = closeRecord.closeDate instanceof Date
      ? closeRecord.closeDate
      : new Date(closeRecord.closeDate);
    const dateKey = closeDate.toISOString().split('T')[0];

    // Per-account aggregate
    const accountKey = `${closeRecord.brokerageAccountId}|${dateKey}`;
    const accountExisting = dailyMap.get(accountKey) || {
      brokerageAccountId: closeRecord.brokerageAccountId,
      date: new Date(Date.UTC(
        closeDate.getUTCFullYear(),
        closeDate.getUTCMonth(),
        closeDate.getUTCDate()
      )),
      pnl: 0, tradeCount: 0, winCount: 0, lossCount: 0,
      stockPnL: 0, optionPnL: 0, wheelPremiums: 0,
    };
    accountExisting.pnl += pnl;
    accountExisting.tradeCount += 1;
    if (pnl > 0) accountExisting.winCount += 1;
    if (pnl < 0) accountExisting.lossCount += 1;
    if (closeRecord.closeType === 'option') {
      accountExisting.optionPnL += pnl;
    } else {
      accountExisting.stockPnL += pnl;
    }
    if (closeRecord.isWheelTrade) accountExisting.wheelPremiums += pnl;
    dailyMap.set(accountKey, accountExisting);

    // All-accounts rollup (brokerageAccountId = null)
    const allAccountsKey = `null|${dateKey}`;
    const allExisting = dailyMap.get(allAccountsKey) || {
      brokerageAccountId: null,
      date: new Date(Date.UTC(
        closeDate.getUTCFullYear(),
        closeDate.getUTCMonth(),
        closeDate.getUTCDate()
      )),
      pnl: 0, tradeCount: 0, winCount: 0, lossCount: 0,
      stockPnL: 0, optionPnL: 0, wheelPremiums: 0,
    };
    allExisting.pnl += pnl;
    allExisting.tradeCount += 1;
    if (pnl > 0) allExisting.winCount += 1;
    if (pnl < 0) allExisting.lossCount += 1;
    if (closeRecord.closeType === 'option') {
      allExisting.optionPnL += pnl;
    } else {
      allExisting.stockPnL += pnl;
    }
    if (closeRecord.isWheelTrade) allExisting.wheelPremiums += pnl;
    dailyMap.set(allAccountsKey, allExisting);
  }

  const dailyData: Prisma.DailyAggregateCreateManyInput[] = Array.from(dailyMap.values()).map(daily => ({
    id: crypto.randomUUID(),
    userId,
    brokerageAccountId: daily.brokerageAccountId,
    date: daily.date,
    realizedPnL: new Prisma.Decimal(daily.pnl),
    tradeCount: daily.tradeCount,
    winCount: daily.winCount,
    lossCount: daily.lossCount,
    stockPnL: new Prisma.Decimal(daily.stockPnL),
    optionPnL: new Prisma.Decimal(daily.optionPnL),
    wheelPremiums: new Prisma.Decimal(daily.wheelPremiums),
  }));

  // Prepare import issues
  const issueData: Prisma.ImportIssueCreateManyInput[] = fullResult.issues.map(issue => ({
    id: crypto.randomUUID(),
    userId: issue.userId,
    importBatchId: issue.importBatchId,
    issueType: issue.issueType,
    severity: issue.severity,
    ledgerEventId: issue.ledgerEventId,
    symbol: issue.symbol,
    message: issue.message,
    details: issue.details,
    isResolved: false,
  }));

  // Persist in single transaction
  await prisma.$transaction(async (tx) => {
    // Clear existing derived data
    await tx.positionLedgerLink.deleteMany({
      where: {
        OR: [
          { position: { userId } },
          { realizedClose: { userId } },
        ],
      },
    });
    await tx.derivedPosition.deleteMany({ where: { userId } });
    await tx.realizedClose.deleteMany({ where: { userId } });
    await tx.dailyAggregate.deleteMany({ where: { userId } });

    // Insert positions
    if (positionRecords.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const positionData = positionRecords.map(({ _lotDetails, ...data }) => data);
      const chunks = chunkArray(positionData, getMaxRowsPerBatch(15));
      for (const chunk of chunks) {
        await tx.derivedPosition.createMany({ data: chunk });
      }
    }

    // Insert closes
    if (closeRecords.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const closeData = closeRecords.map(({ _openLotConsumptions, _closeEventId, ...data }) => data);
      const chunks = chunkArray(closeData, getMaxRowsPerBatch(22));
      for (const chunk of chunks) {
        await tx.realizedClose.createMany({ data: chunk });
      }
    }

    // Insert links
    if (links.length > 0) {
      const chunks = chunkArray(links, getMaxRowsPerBatch(7));
      for (const chunk of chunks) {
        await tx.positionLedgerLink.createMany({ data: chunk });
      }
    }

    // Insert daily aggregates
    if (dailyData.length > 0) {
      const chunks = chunkArray(dailyData, getMaxRowsPerBatch(11));
      for (const chunk of chunks) {
        await tx.dailyAggregate.createMany({ data: chunk });
      }
    }

    // Insert issues
    if (issueData.length > 0) {
      const chunks = chunkArray(issueData, getMaxRowsPerBatch(12));
      for (const chunk of chunks) {
        await tx.importIssue.createMany({ data: chunk });
      }
    }
  }, {
    timeout: 300000, // 5 minutes for large accounts
    maxWait: 60000,  // 1 minute max wait to acquire lock
  });

  log.info({
    positions: positionRecords.length,
    closes: closeRecords.length,
    links: links.length,
    dailyAggregates: dailyData.length,
    issues: issueData.length,
  }, 'Derivation persisted successfully');
}

/**
 * Run full derivation and persist results.
 * This is the main entry point for re-deriving all data.
 * Also validates ML predictions against actual outcomes.
 */
export async function fullRederivation(
  prisma: PrismaClient,
  userId: string
): Promise<FullDerivationResult> {
  const result = await runFullDerivation(prisma, userId);
  await persistDerivation(prisma, userId, result);

  // Validate ML predictions against actual outcomes (async, don't block).
  // Import dynamically to avoid circular dependencies.
  Promise.all([
    import('@/lib/ml/wheel/model-storage'),
    import('@/lib/ml/options/model-storage'),
  ])
    .then(([wheelModule, optionsModule]) =>
      Promise.all([
        wheelModule.validatePredictionsAfterDerivation(userId),
        optionsModule.validateOptionsPredictionsAfterDerivation(userId),
      ])
    )
    .catch((err) => {
      logger.warn({ err, userId }, 'Failed to validate ML predictions');
    });

  return result;
}

/**
 * Clear all derived data for a user.
 */
export async function clearDerivedData(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.positionLedgerLink.deleteMany({
      where: {
        OR: [
          { position: { userId } },
          { realizedClose: { userId } },
        ],
      },
    });
    await tx.derivedPosition.deleteMany({ where: { userId } });
    await tx.realizedClose.deleteMany({ where: { userId } });
    await tx.dailyAggregate.deleteMany({ where: { userId } });
  }, {
    timeout: 120000, // 2 minutes for clearing derived data
  });
}
