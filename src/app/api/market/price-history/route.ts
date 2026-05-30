/**
 * Price History API Route
 * GET /api/market/price-history?symbol=AAPL&start=2025-09-01&end=2026-02-20&interval=1d
 *
 * Returns cached OHLCV bars from Yahoo Finance via the existing market cache layer.
 */

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiBadRequest, apiInternalError } from '@/lib/api/response';
import { ensurePriceHistoryCached } from '@/lib/market/cache';

const MAX_RANGE_DAYS = 730;

const querySchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start must be YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end must be YYYY-MM-DD'),
  interval: z.enum(['1d', '1wk', '1mo']).default('1d'),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiBadRequest('Invalid query parameters', parsed.error.flatten());
    }

    const { symbol, start, end, interval } = parsed.data;
    const startDate = new Date(start);
    const endDate = new Date(end);

    const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays < 0) {
      return apiBadRequest('start must be before end');
    }
    if (rangeDays > MAX_RANGE_DAYS) {
      return apiBadRequest(`Date range exceeds maximum of ${MAX_RANGE_DAYS} days`);
    }

    log.info({ symbol, start, end, interval, userId: session.user.id }, 'Price history request');

    const result = await ensurePriceHistoryCached({
      symbol,
      start: startDate,
      end: endDate,
      interval,
      triggerSource: 'price-history-api',
    });

    return apiJson({
      symbol: result.symbol,
      interval: result.interval,
      bars: result.bars.map((bar) => ({
        timestamp: bar.timestamp.toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
      stale: result.stale,
      source: result.source,
      dataAsOf: result.dataAsOf,
    });
  } catch (error) {
    log.error({ error }, 'Price history request failed');
    return apiInternalError('Failed to fetch price history');
  }
}
