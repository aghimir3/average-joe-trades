/**
 * GET /api/calendar/trades
 *
 * Returns closed trades for a given month, enriched with trade-type
 * classification (auto-computed daytrade/swingtrade with user overrides)
 * and computed fields (holding days, return %).
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiBadRequest, apiInternalError } from '@/lib/api/response';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const querySchema = z.object({
  year: z.coerce.number().min(2000).max(2100),
  month: z.coerce.number().min(1).max(12),
  brokerageAccountId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/** Format options symbol: "PLTR Mar 130 Call" */
function formatDisplaySymbol(
  symbol: string,
  closeType: string,
  optionType: string | null,
  strike: number | null,
  expiration: string | null,
): string {
  if (closeType !== 'option' || !optionType || strike == null) return symbol;
  const expMonth = expiration ? MONTHS_SHORT[new Date(expiration).getUTCMonth()] : '';
  const strikeStr = strike % 1 === 0 ? String(strike) : strike.toFixed(1);
  const typeStr = optionType === 'call' ? 'Call' : 'Put';
  return `${symbol} ${expMonth} ${strikeStr} ${typeStr}`.trim();
}

/** Check if two dates fall on the same calendar day (UTC) */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Days between two dates */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / msPerDay));
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

    const { year, month, brokerageAccountId, limit, offset } = parsed.data;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Fetch trades + overrides in parallel
    const whereClause = {
      userId,
      closeDate: { gte: startDate, lte: endDate },
      ...(brokerageAccountId ? { brokerageAccountId } : {}),
    };

    const [trades, total, overrides] = await Promise.all([
      prisma.realizedClose.findMany({
        where: whereClause,
        orderBy: { closeDate: 'asc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          symbol: true,
          closeType: true,
          side: true,
          optionType: true,
          strike: true,
          expiration: true,
          openDate: true,
          closeDate: true,
          quantity: true,
          openAmount: true,
          closeAmount: true,
          realizedPnL: true,
        },
      }),
      prisma.realizedClose.count({ where: whereClause }),
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

    // Build override lookup map
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

    // Aggregate stats
    let wins = 0;
    let losses = 0;
    let daytradeCount = 0;
    let swingtradeCount = 0;
    let totalPnL = 0;

    const calendarTrades = trades.map((t, idx) => {
      const pnl = Number(t.realizedPnL);
      const entryTotal = Math.abs(Number(t.openAmount));
      const exitTotal = Math.abs(Number(t.closeAmount));
      const holdingDays = daysBetween(t.openDate, t.closeDate);
      const returnPercent = entryTotal > 0 ? (pnl / entryTotal) * 100 : 0;
      const isWin = pnl > 0;

      // Determine trade type
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

      if (isWin) wins++;
      else if (pnl < 0) losses++;
      totalPnL += pnl;
      if (tradeType === 'daytrade') daytradeCount++;
      else swingtradeCount++;

      return {
        id: t.id,
        tradeNumber: offset + idx + 1,
        closeDate: t.closeDate.toISOString().split('T')[0],
        openDate: t.openDate.toISOString().split('T')[0],
        symbol: t.symbol,
        displaySymbol: formatDisplaySymbol(
          t.symbol,
          t.closeType,
          t.optionType,
          t.strike ? Number(t.strike) : null,
          t.expiration?.toISOString().split('T')[0] ?? null,
        ),
        tradeType,
        isOverridden: !!override,
        quantity: Number(t.quantity),
        entryTotal: Math.round(entryTotal * 100) / 100,
        exitTotal: Math.round(exitTotal * 100) / 100,
        holdingDays,
        returnDollars: Math.round(pnl * 100) / 100,
        returnPercent: Math.round(returnPercent * 100) / 100,
        isWin,
        closeType: t.closeType,
        optionType: t.optionType,
        strike: t.strike ? Number(t.strike) : null,
        expiration: t.expiration?.toISOString().split('T')[0] ?? null,
      };
    });

    log.info({ userId, year, month, count: calendarTrades.length }, 'Calendar trades fetched');

    return apiJson({
      data: {
        trades: calendarTrades,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
        monthSummary: {
          totalPnL: Math.round(totalPnL * 100) / 100,
          totalTrades: total,
          wins,
          losses,
          winRate: total > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0,
          daytradeCount,
          swingtradeCount,
        },
      },
    });
  } catch (error) {
    log.error({ error, correlationId }, 'Failed to fetch calendar trades');
    return apiInternalError('Failed to fetch calendar trades');
  }
}
