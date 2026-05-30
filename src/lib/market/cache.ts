import YahooFinance from 'yahoo-finance2';
import { createChildLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { withRetry, withTimeout } from '@/lib/quant/data/provider';
import type { BarInterval, OHLCVBar } from '@/lib/quant/data';

const log = createChildLogger({ module: 'market-cache' });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const PRICE_CHUNK_SIZE = 150; // SQL Server parameter cap guard
const DAILY_BAR_MAX_STALE_MS = 12 * 60 * 60 * 1000;
const QUOTE_MAX_STALE_MS = 90 * 1000;

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const maybeMessage = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  if (maybeCode === 'P2021') return true;
  return maybeMessage.includes('does not exist in the current database');
}

function normalizeTickerSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().split(' ')[0];
}

function toUtcNoonDate(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 12, 0, 0, 0));
}

function intervalDefaultStaleMs(interval: BarInterval): number {
  if (interval === '1wk') return 3 * 24 * 60 * 60 * 1000;
  if (interval === '1mo') return 7 * 24 * 60 * 60 * 1000;
  return DAILY_BAR_MAX_STALE_MS;
}

function intervalCoverageBufferDays(interval: BarInterval): number {
  if (interval === '1wk') return 10;
  if (interval === '1mo') return 35;
  return 3;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function toOhlcvBars(rows: Array<{
  symbol: string;
  barDate: Date;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
}>): OHLCVBar[] {
  return rows
    .map((row) => ({
      symbol: row.symbol,
      timestamp: toUtcNoonDate(row.barDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }))
    .filter((bar) =>
      Number.isFinite(bar.open)
      && Number.isFinite(bar.high)
      && Number.isFinite(bar.low)
      && Number.isFinite(bar.close)
      && Number.isFinite(bar.volume)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function getCoverageStatus(
  bars: OHLCVBar[],
  start: Date,
  end: Date,
  interval: BarInterval
): { hasCoverage: boolean } {
  if (bars.length === 0) return { hasCoverage: false };
  const first = bars[0].timestamp.getTime();
  const last = bars[bars.length - 1].timestamp.getTime();
  const bufferMs = intervalCoverageBufferDays(interval) * 24 * 60 * 60 * 1000;
  const hasCoverage = first <= start.getTime() + bufferMs && last >= end.getTime() - bufferMs;
  return { hasCoverage };
}

async function loadCachedBars(
  symbol: string,
  interval: BarInterval,
  start: Date,
  end: Date
): Promise<{
  bars: OHLCVBar[];
  latestFetchedAt: Date | null;
}> {
  let rows: Array<{
    symbol: string;
    barDate: Date;
    open: unknown;
    high: unknown;
    low: unknown;
    close: unknown;
    volume: unknown;
    fetchedAt: Date;
  }> = [];
  try {
    rows = await prisma.marketPriceBar.findMany({
      where: {
        symbol,
        interval,
        barDate: {
          gte: toUtcNoonDate(start),
          lte: toUtcNoonDate(end),
        },
      },
      select: {
        symbol: true,
        barDate: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        fetchedAt: true,
      },
      orderBy: { barDate: 'asc' },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      log.warn({ symbol, interval }, 'marketPriceBars table missing; skipping cache read');
      return { bars: [], latestFetchedAt: null };
    }
    throw error;
  }

  const bars = toOhlcvBars(rows);
  const latestFetchedAt = rows.reduce<Date | null>(
    (latest, row) => (!latest || row.fetchedAt > latest ? row.fetchedAt : latest),
    null
  );

  return { bars, latestFetchedAt };
}

async function fetchYahooHistory(
  symbol: string,
  interval: BarInterval,
  start: Date,
  end: Date
): Promise<OHLCVBar[]> {
  const rows = await withRetry(
    async () =>
      withTimeout(
        yahooFinance.historical(symbol, {
          period1: start,
          period2: end,
          interval,
        }) as Promise<Array<{
          date?: Date;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume?: number;
        }>>,
        9_000,
        `Yahoo historical ${symbol}`
      ),
    { retries: 2, baseDelayMs: 300 }
  );

  return rows
    .map((row) => {
      if (!(row.date instanceof Date)) return null;
      if (
        row.open === undefined
        || row.high === undefined
        || row.low === undefined
        || row.close === undefined
      ) {
        return null;
      }
      return {
        symbol,
        timestamp: toUtcNoonDate(row.date),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
      } as OHLCVBar;
    })
    .filter((bar): bar is OHLCVBar => Boolean(bar))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function persistHistoryBars(
  symbol: string,
  interval: BarInterval,
  bars: OHLCVBar[]
): Promise<void> {
  if (bars.length === 0) return;
  const sorted = [...bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const minDate = toUtcNoonDate(sorted[0].timestamp);
  const maxDate = toUtcNoonDate(sorted[sorted.length - 1].timestamp);

  try {
    await prisma.marketPriceBar.deleteMany({
      where: {
        symbol,
        interval,
        barDate: {
          gte: minDate,
          lte: maxDate,
        },
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      log.warn({ symbol, interval }, 'marketPriceBars table missing; skipping cache write');
      return;
    }
    throw error;
  }

  const now = new Date();
  const payload = sorted.map((bar) => ({
    symbol,
    interval,
    barDate: toUtcNoonDate(bar.timestamp),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    source: 'yahoo-finance2',
    fetchedAt: now,
  }));

  try {
    for (const batch of chunk(payload, PRICE_CHUNK_SIZE)) {
      await prisma.marketPriceBar.createMany({ data: batch });
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      log.warn({ symbol, interval }, 'marketPriceBars table missing; skipping cache write');
      return;
    }
    throw error;
  }
}

export interface EnsurePriceHistoryInput {
  symbol: string;
  start: Date;
  end: Date;
  interval?: BarInterval;
  maxStaleMs?: number;
  allowStaleOnError?: boolean;
  triggerSource?: string;
}

export interface EnsurePriceHistoryResult {
  symbol: string;
  interval: BarInterval;
  bars: OHLCVBar[];
  stale: boolean;
  source: 'cache' | 'network' | 'stale_cache';
  dataAsOf: string | null;
}

export async function ensurePriceHistoryCached(
  input: EnsurePriceHistoryInput
): Promise<EnsurePriceHistoryResult> {
  const symbol = normalizeTickerSymbol(input.symbol);
  const interval = input.interval ?? '1d';
  const start = toUtcNoonDate(input.start);
  const end = toUtcNoonDate(input.end);
  const maxStaleMs = input.maxStaleMs ?? intervalDefaultStaleMs(interval);
  const allowStaleOnError = input.allowStaleOnError ?? true;
  const triggerSource = input.triggerSource ?? 'unknown';

  const cached = await loadCachedBars(symbol, interval, start, end);
  const coverage = getCoverageStatus(cached.bars, start, end, interval);
  const stale = !cached.latestFetchedAt || Date.now() - cached.latestFetchedAt.getTime() > maxStaleMs;

  if (coverage.hasCoverage && !stale) {
    return {
      symbol,
      interval,
      bars: cached.bars,
      stale: false,
      source: 'cache',
      dataAsOf: cached.latestFetchedAt?.toISOString() ?? null,
    };
  }

  try {
    const fetchedBars = await fetchYahooHistory(symbol, interval, start, end);
    if (fetchedBars.length > 0) {
      await persistHistoryBars(symbol, interval, fetchedBars);
    }

    // Return network bars directly so requests succeed even if cache tables are not created yet.
    const fetchedAtIso = new Date().toISOString();
    return {
      symbol,
      interval,
      bars: fetchedBars,
      stale: false,
      source: 'network',
      dataAsOf: fetchedAtIso,
    };
  } catch (error) {
    log.warn(
      { symbol, interval, triggerSource, error },
      'Historical fetch failed; attempting stale cache fallback'
    );
    if (allowStaleOnError && cached.bars.length > 0) {
      return {
        symbol,
        interval,
        bars: cached.bars,
        stale: true,
        source: 'stale_cache',
        dataAsOf: cached.latestFetchedAt?.toISOString() ?? null,
      };
    }
    throw error;
  }
}

export interface CachedQuoteSnapshot {
  symbol: string;
  price: number;
  dayChangePercent: number;
  previousClose: number | null;
  fetchedAt: string;
  stale: boolean;
  source: string;
  isDelayed: boolean;
}

async function loadCachedQuote(symbol: string) {
  try {
    return await prisma.marketQuoteSnapshot.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        price: true,
        dayChangePct: true,
        previousClose: true,
        fetchedAt: true,
        source: true,
        isDelayed: true,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      log.warn({ symbol }, 'marketQuoteSnapshots table missing; skipping quote cache read');
      return null;
    }
    throw error;
  }
}

async function fetchYahooQuote(symbol: string): Promise<{
  price: number;
  dayChangePct: number;
  previousClose: number | null;
}> {
  const quote = await withRetry(
    async () =>
      withTimeout(
        yahooFinance.quote(symbol) as Promise<{
          regularMarketPrice?: number;
          regularMarketChangePercent?: number;
          regularMarketPreviousClose?: number;
        }>,
        6_000,
        `Yahoo quote ${symbol}`
      ),
    { retries: 2, baseDelayMs: 250 }
  );

  const price = Number(quote.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid quote for ${symbol}`);
  }

  return {
    price,
    dayChangePct: Number(quote.regularMarketChangePercent ?? 0),
    previousClose:
      quote.regularMarketPreviousClose === undefined
        ? null
        : Number(quote.regularMarketPreviousClose),
  };
}

export async function ensureQuoteCached(
  symbolInput: string,
  options?: { maxStaleMs?: number; allowStaleOnError?: boolean; triggerSource?: string }
): Promise<CachedQuoteSnapshot> {
  const symbol = normalizeTickerSymbol(symbolInput);
  const maxStaleMs = options?.maxStaleMs ?? QUOTE_MAX_STALE_MS;
  const allowStaleOnError = options?.allowStaleOnError ?? true;
  const triggerSource = options?.triggerSource ?? 'unknown';

  const cached = await loadCachedQuote(symbol);
  const isFresh = cached && Date.now() - cached.fetchedAt.getTime() <= maxStaleMs;
  if (cached && isFresh) {
    return {
      symbol,
      price: Number(cached.price),
      dayChangePercent: Number(cached.dayChangePct),
      previousClose: cached.previousClose === null ? null : Number(cached.previousClose),
      fetchedAt: cached.fetchedAt.toISOString(),
      stale: false,
      source: cached.source,
      isDelayed: cached.isDelayed,
    };
  }

  try {
    const network = await fetchYahooQuote(symbol);
    const now = new Date();
    try {
      await prisma.marketQuoteSnapshot.upsert({
        where: { symbol },
        update: {
          price: network.price,
          dayChangePct: network.dayChangePct,
          previousClose: network.previousClose,
          quoteAsOf: now,
          source: 'yahoo-finance2',
          isDelayed: true,
          fetchedAt: now,
        },
        create: {
          symbol,
          price: network.price,
          dayChangePct: network.dayChangePct,
          previousClose: network.previousClose,
          quoteAsOf: now,
          source: 'yahoo-finance2',
          isDelayed: true,
          fetchedAt: now,
        },
      });
    } catch (persistError) {
      if (!isMissingTableError(persistError)) {
        throw persistError;
      }
      log.warn({ symbol }, 'marketQuoteSnapshots table missing; skipping quote cache write');
    }
    return {
      symbol,
      price: network.price,
      dayChangePercent: network.dayChangePct,
      previousClose: network.previousClose,
      fetchedAt: now.toISOString(),
      stale: false,
      source: 'yahoo-finance2',
      isDelayed: true,
    };
  } catch (error) {
    log.warn({ symbol, triggerSource, error }, 'Quote fetch failed; attempting stale quote fallback');
    if (allowStaleOnError && cached) {
      return {
        symbol,
        price: Number(cached.price),
        dayChangePercent: Number(cached.dayChangePct),
        previousClose: cached.previousClose === null ? null : Number(cached.previousClose),
        fetchedAt: cached.fetchedAt.toISOString(),
        stale: true,
        source: cached.source,
        isDelayed: cached.isDelayed,
      };
    }
    throw error;
  }
}

export async function ensureQuotesCached(
  symbols: string[],
  options?: { maxStaleMs?: number; allowStaleOnError?: boolean; triggerSource?: string }
): Promise<Map<string, CachedQuoteSnapshot>> {
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => normalizeTickerSymbol(symbol))));
  const map = new Map<string, CachedQuoteSnapshot>();

  const snapshots = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        return await ensureQuoteCached(symbol, options);
      } catch (error) {
        log.debug({ symbol, error }, 'Unable to ensure quote snapshot');
        return null;
      }
    })
  );

  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    map.set(snapshot.symbol, snapshot);
  }

  return map;
}
