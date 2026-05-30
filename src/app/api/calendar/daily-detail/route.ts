/**
 * GET /api/calendar/daily-detail
 *
 * Returns per-ticker daily P&L breakdown and weekly summaries
 * for the monthly calendar grid view.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiBadRequest, apiInternalError } from '@/lib/api/response';

const querySchema = z.object({
  year: z.coerce.number().min(2000).max(2100),
  month: z.coerce.number().min(1).max(12),
  brokerageAccountId: z.string().uuid().optional(),
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Get the Sunday that starts the week containing the given date */
function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;
    const userId = session.user.id;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) return apiBadRequest('Invalid query parameters', parsed.error.flatten());

    const { year, month, brokerageAccountId } = parsed.data;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Fetch all closed trades for the month + overrides
    const [trades, overrides] = await Promise.all([
      prisma.realizedClose.findMany({
        where: {
          userId,
          closeDate: { gte: startDate, lte: endDate },
          ...(brokerageAccountId ? { brokerageAccountId } : {}),
        },
        orderBy: { closeDate: 'asc' },
        select: {
          symbol: true,
          openDate: true,
          closeDate: true,
          closeType: true,
          optionType: true,
          strike: true,
          expiration: true,
          realizedPnL: true,
        },
      }),
      prisma.tradeClassification.findMany({
        where: { userId },
        select: {
          symbol: true,
          openDate: true,
          closeDate: true,
          closeType: true,
          optionType: true,
          strike: true,
          expiration: true,
          tradeType: true,
        },
      }),
    ]);

    // Build override lookup
    const overrideMap = new Map<string, string>();
    for (const o of overrides) {
      const key = [
        o.symbol,
        o.openDate.toISOString(),
        o.closeDate.toISOString(),
        o.closeType,
        o.optionType ?? '',
        o.strike?.toString() ?? '',
        o.expiration?.toISOString() ?? '',
      ].join('|');
      overrideMap.set(key, o.tradeType);
    }

    // Group trades by close date
    const dayMap = new Map<string, {
      tickers: { symbol: string; pnl: number; tradeType: 'daytrade' | 'swingtrade' }[];
      dailyTotal: number;
      tradeCount: number;
      winCount: number;
      lossCount: number;
      daytradePnL: number;
      swingtradePnL: number;
    }>();

    for (const t of trades) {
      const dateKey = t.closeDate.toISOString().split('T')[0];
      const pnl = Number(t.realizedPnL);

      // Resolve trade type
      const overrideKey = [
        t.symbol,
        t.openDate.toISOString(),
        t.closeDate.toISOString(),
        t.closeType,
        t.optionType ?? '',
        t.strike?.toString() ?? '',
        t.expiration?.toISOString() ?? '',
      ].join('|');
      const override = overrideMap.get(overrideKey);
      const autoType = isSameDay(t.openDate, t.closeDate) ? 'daytrade' : 'swingtrade';
      const tradeType = (override ?? autoType) as 'daytrade' | 'swingtrade';

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          tickers: [],
          dailyTotal: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
          daytradePnL: 0,
          swingtradePnL: 0,
        });
      }

      const day = dayMap.get(dateKey)!;
      day.tickers.push({ symbol: t.symbol, pnl: Math.round(pnl * 100) / 100, tradeType });
      day.dailyTotal += pnl;
      day.tradeCount++;
      if (pnl > 0) day.winCount++;
      else if (pnl < 0) day.lossCount++;
      if (tradeType === 'daytrade') day.daytradePnL += pnl;
      else day.swingtradePnL += pnl;
    }

    // Build days array
    const days = Array.from(dayMap.entries())
      .map(([dateKey, d]) => ({
        date: dateKey,
        day: parseInt(dateKey.split('-')[2], 10),
        tickers: d.tickers,
        dailyTotal: Math.round(d.dailyTotal * 100) / 100,
        tradeCount: d.tradeCount,
        winCount: d.winCount,
        lossCount: d.lossCount,
        daytradePnL: Math.round(d.daytradePnL * 100) / 100,
        swingtradePnL: Math.round(d.swingtradePnL * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Compute weekly summaries
    // Get all weeks that overlap with this month (Sun-Sat)
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const lastOfMonth = new Date(Date.UTC(year, month, 0));
    const weekStartOfFirst = getWeekStart(firstOfMonth);

    const weekSummaries: {
      weekNumber: number;
      weekStart: string;
      weekEnd: string;
      totalPnL: number;
      runningTotal: number;
      daytradePnL: number;
      swingtradePnL: number;
      tradeCount: number;
      winCount: number;
      lossCount: number;
      winRate: number;
    }[] = [];

    let weekNum = 1;
    let runningTotal = 0;
    const current = new Date(weekStartOfFirst);

    while (current <= lastOfMonth) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

      let totalPnL = 0;
      let daytradePnL = 0;
      let swingtradePnL = 0;
      let tradeCount = 0;
      let winCount = 0;
      let lossCount = 0;

      for (const day of days) {
        const dayDate = new Date(day.date + 'T00:00:00Z');
        if (dayDate >= weekStart && dayDate <= weekEnd) {
          totalPnL += day.dailyTotal;
          daytradePnL += day.daytradePnL;
          swingtradePnL += day.swingtradePnL;
          tradeCount += day.tradeCount;
          winCount += day.winCount;
          lossCount += day.lossCount;
        }
      }

      runningTotal += totalPnL;

      weekSummaries.push({
        weekNumber: weekNum,
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        totalPnL: Math.round(totalPnL * 100) / 100,
        runningTotal: Math.round(runningTotal * 100) / 100,
        daytradePnL: Math.round(daytradePnL * 100) / 100,
        swingtradePnL: Math.round(swingtradePnL * 100) / 100,
        tradeCount,
        winCount,
        lossCount,
        winRate: tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0,
      });

      weekNum++;
      current.setUTCDate(current.getUTCDate() + 7);
    }

    log.info({ userId, year, month, days: days.length }, 'Calendar daily detail fetched');

    return apiJson({ data: { days, weekSummaries } });
  } catch (error) {
    log.error({ error, correlationId }, 'Failed to fetch calendar daily detail');
    return apiInternalError('Failed to fetch calendar daily detail');
  }
}
