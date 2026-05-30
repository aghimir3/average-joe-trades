import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Calendar API route handler.
 *
 * Returns daily data formatted for calendar view.
 * Supports multiple calendar types:
 * - trading (default): P&L by day with open positions
 * - wheel: Premium collected from covered calls and cash-secured puts
 * - ticker: P&L filtered to a specific symbol
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardCalendar } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  year: z.coerce.number().min(2000).max(2100).optional(),
  month: z.coerce.number().min(1).max(12).optional(),
  type: z.enum(['trading', 'wheel']).optional().default('trading'),
  symbol: z.string().optional(), // Optional filter for wheel calendar (specific ticker)
});

/**
 * GET /api/dashboard/calendar
 *
 * Query params:
 * - type: 'trading' | 'wheel' | 'ticker' (default: trading)
 * - symbol: required when type=ticker
 * - year, month: defaults to current month
 * - brokerageAccountId: optional account filter
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId, type, symbol } = validated.data;

    // Default to current month
    const now = new Date();
    const year = validated.data.year ?? now.getFullYear();
    const month = validated.data.month ?? (now.getMonth() + 1);

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId, type, year, month, symbol }, 'Returning sample dashboard calendar data');
      return apiJson({
        data: sampleDashboardCalendar(type, year, month, symbol),
      });
    }

    log.info({ userId, type, symbol, year, month }, 'Fetching calendar data');

    // Route to appropriate handler
    switch (type) {
      case 'wheel':
        // Wheel calendar supports optional symbol filter for per-ticker view
        return await getWheelCalendarData(userId, year, month, brokerageAccountId, symbol, log);
      default:
        return await getTradingCalendarData(userId, year, month, brokerageAccountId, log);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch calendar');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch calendar' },
      { status: 500 }
    );
  }
}

// ============================================================
// Trading Calendar (existing functionality)
// ============================================================

async function getTradingCalendarData(
  userId: string,
  year: number,
  month: number,
  brokerageAccountId: string | undefined,
  log: ReturnType<typeof createRequestLogger>
) {
  // Calculate date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const dailyWhere: Prisma.DailyAggregateWhereInput = {
    userId,
    date: {
      gte: startDate,
      lte: endDate,
    },
  };

  // Position where clause for open positions opened in this month
  const positionWhere: Prisma.DerivedPositionWhereInput = {
    userId,
    quantity: { gt: 0 },
    firstEntryDate: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (brokerageAccountId) {
    dailyWhere.brokerageAccountId = brokerageAccountId;
    positionWhere.brokerageAccountId = brokerageAccountId;
  } else {
    // Use all-accounts rollup for daily aggregate
    dailyWhere.brokerageAccountId = null;
  }

  // Fetch daily aggregates and open positions in parallel
  const [dailyData, openPositions] = await Promise.all([
    prisma.dailyAggregate.findMany({
      where: dailyWhere,
      orderBy: { date: 'asc' },
      select: {
        date: true,
        realizedPnL: true,
        tradeCount: true,
        winCount: true,
        lossCount: true,
        stockPnL: true,
        optionPnL: true,
      },
    }),
    prisma.derivedPosition.findMany({
      where: positionWhere,
      select: {
        id: true,
        symbol: true,
        positionType: true,
        side: true,
        quantity: true,
        avgPrice: true,
        costBasis: true,
        optionType: true,
        strike: true,
        expiration: true,
        strategy: true,
        firstEntryDate: true,
        ledgerLinks: {
          where: { openEventId: { not: null } },
          select: { openEventId: true },
          take: 1,
        },
      },
      orderBy: { firstEntryDate: 'asc' },
    }),
  ]);

  // Group open positions by date (YYYY-MM-DD)
  const openPositionsByDate = new Map<string, typeof openPositions>();
  for (const pos of openPositions) {
    const dateKey = pos.firstEntryDate.toISOString().split('T')[0];
    if (!openPositionsByDate.has(dateKey)) {
      openPositionsByDate.set(dateKey, []);
    }
    openPositionsByDate.get(dateKey)!.push(pos);
  }

  // Format for calendar display
  const calendarDays = dailyData.map(d => {
    const dateStr = d.date.toISOString().split('T')[0];
    const dayOpenPositions = openPositionsByDate.get(dateStr) || [];
    const winRate = d.tradeCount > 0 ? (d.winCount / d.tradeCount) * 100 : 0;

    return {
      date: dateStr,
      day: d.date.getUTCDate(),
      realizedPnL: d.realizedPnL.toNumber(),
      tradeCount: d.tradeCount,
      winCount: d.winCount,
      lossCount: d.lossCount,
      winRate: Math.round(winRate),
      stockPnL: d.stockPnL.toNumber(),
      optionPnL: d.optionPnL.toNumber(),
      isProfit: d.realizedPnL.toNumber() > 0,
      isLoss: d.realizedPnL.toNumber() < 0,
      hasActivity: d.tradeCount > 0 || dayOpenPositions.length > 0,
      openPositionCount: dayOpenPositions.length,
      openPositions: dayOpenPositions.map(p => ({
        id: p.id,
        ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
        symbol: p.symbol,
        type: p.positionType,
        side: p.side,
        quantity: p.quantity.toNumber(),
        avgPrice: p.avgPrice.toNumber(),
        costBasis: p.costBasis.toNumber(),
        optionType: p.optionType,
        strike: p.strike?.toNumber() ?? null,
        expiration: p.expiration?.toISOString().split('T')[0] ?? null,
        strategy: p.strategy,
      })),
    };
  });

  // Add days with only open positions (no closed trades)
  for (const [dateStr, positions] of openPositionsByDate) {
    const existingDay = calendarDays.find(d => d.date === dateStr);
    if (!existingDay && positions.length > 0) {
      const dayNum = parseInt(dateStr.split('-')[2], 10);
      calendarDays.push({
        date: dateStr,
        day: dayNum,
        realizedPnL: 0,
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        stockPnL: 0,
        optionPnL: 0,
        isProfit: false,
        isLoss: false,
        hasActivity: true,
        openPositionCount: positions.length,
        openPositions: positions.map(p => ({
          id: p.id,
          ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
          symbol: p.symbol,
          type: p.positionType,
          side: p.side,
          quantity: p.quantity.toNumber(),
          avgPrice: p.avgPrice.toNumber(),
          costBasis: p.costBasis.toNumber(),
          optionType: p.optionType,
          strike: p.strike?.toNumber() ?? null,
          expiration: p.expiration?.toISOString().split('T')[0] ?? null,
          strategy: p.strategy,
        })),
      });
    }
  }

  calendarDays.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate monthly summary
  const monthSummary = {
    totalPnL: calendarDays.reduce((sum, d) => sum + d.realizedPnL, 0),
    tradingDays: calendarDays.filter(d => d.tradeCount > 0).length,
    profitDays: calendarDays.filter(d => d.realizedPnL > 0).length,
    lossDays: calendarDays.filter(d => d.realizedPnL < 0).length,
    totalTrades: calendarDays.reduce((sum, d) => sum + d.tradeCount, 0),
    totalWins: calendarDays.reduce((sum, d) => sum + d.winCount, 0),
    totalLosses: calendarDays.reduce((sum, d) => sum + d.lossCount, 0),
    totalOpenPositions: openPositions.length,
  };

  const winRate = monthSummary.totalTrades > 0
    ? (monthSummary.totalWins / monthSummary.totalTrades) * 100
    : 0;

  log.info({ userId, year, month, days: calendarDays.length }, 'Trading calendar fetched');

  return apiJson({
    data: {
      type: 'trading',
      year,
      month,
      days: calendarDays,
      summary: {
        ...monthSummary,
        totalPnL: Math.round(monthSummary.totalPnL * 100) / 100,
        winRate: Math.round(winRate),
      },
    },
  });
}

// ============================================================
// Wheel Calendar (Covered Calls & Cash-Secured Puts)
// ============================================================

async function getWheelCalendarData(
  userId: string,
  year: number,
  month: number,
  brokerageAccountId: string | undefined,
  symbol: string | undefined,
  log: ReturnType<typeof createRequestLogger>
) {
  // Calculate date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Build where clause for wheel trades
  const closeWhere: Prisma.RealizedCloseWhereInput = {
    userId,
    closeDate: {
      gte: startDate,
      lte: endDate,
    },
    strategy: {
      in: ['covered_call', 'cash_secured_put'],
    },
  };

  if (brokerageAccountId) {
    closeWhere.brokerageAccountId = brokerageAccountId;
  }

  // Optional symbol filter for per-ticker view
  if (symbol) {
    closeWhere.symbol = symbol.toUpperCase();
  }

  // Fetch wheel trades closed in this month
  const wheelTrades = await prisma.realizedClose.findMany({
    where: closeWhere,
    orderBy: { closeDate: 'asc' },
    select: {
      id: true,
      symbol: true,
      strategy: true,
      strike: true,
      expiration: true,
      openDate: true,
      closeDate: true,
      openPrice: true,
      closePrice: true,
      realizedPnL: true,
      closeReason: true,
      quantity: true,
    },
  });

  // Group trades by close date
  const tradesByDate = new Map<string, typeof wheelTrades>();
  for (const trade of wheelTrades) {
    const dateKey = trade.closeDate.toISOString().split('T')[0];
    if (!tradesByDate.has(dateKey)) {
      tradesByDate.set(dateKey, []);
    }
    tradesByDate.get(dateKey)!.push(trade);
  }

  // Build calendar days
  const calendarDays = [];
  for (const [dateStr, trades] of tradesByDate) {
    const dayNum = parseInt(dateStr.split('-')[2], 10);

    // Calculate premium - for short options, premium = openPrice (credit received)
    // When closing, realizedPnL = openPrice - closePrice for short positions
    let totalPremium = 0;
    let ccPremium = 0;
    let cspPremium = 0;
    let ccCount = 0;
    let cspCount = 0;
    let assignmentCount = 0;
    let expirationCount = 0;
    let earlyCloseCount = 0;

    for (const trade of trades) {
      // Premium is the realized P&L from the short option
      const premium = trade.realizedPnL?.toNumber() ?? 0;
      totalPremium += premium;

      if (trade.strategy === 'covered_call') {
        ccPremium += premium;
        ccCount++;
      } else if (trade.strategy === 'cash_secured_put') {
        cspPremium += premium;
        cspCount++;
      }

      if (trade.closeReason === 'assigned') {
        assignmentCount++;
      } else if (trade.closeReason === 'expired') {
        expirationCount++;
      } else {
        earlyCloseCount++;
      }
    }

    calendarDays.push({
      date: dateStr,
      day: dayNum,
      hasActivity: trades.length > 0,
      premiumCollected: Math.round(totalPremium * 100) / 100,
      ccPremium: Math.round(ccPremium * 100) / 100,
      cspPremium: Math.round(cspPremium * 100) / 100,
      tradeCount: trades.length,
      ccCount,
      cspCount,
      assignmentCount,
      expirationCount,
      earlyCloseCount,
      trades: trades.map(t => ({
        id: t.id,
        symbol: t.symbol,
        strategy: t.strategy as 'covered_call' | 'cash_secured_put',
        strike: t.strike?.toNumber() ?? 0,
        expiration: t.expiration?.toISOString().split('T')[0] ?? '',
        premium: t.realizedPnL?.toNumber() ?? 0,
        closeReason: t.closeReason as 'expired' | 'assigned' | 'normal',
        openDate: t.openDate.toISOString().split('T')[0],
        closeDate: t.closeDate.toISOString().split('T')[0],
      })),
    });
  }

  calendarDays.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate monthly summary
  const summary = {
    totalPremium: Math.round(calendarDays.reduce((sum, d) => sum + d.premiumCollected, 0) * 100) / 100,
    ccPremium: Math.round(calendarDays.reduce((sum, d) => sum + d.ccPremium, 0) * 100) / 100,
    cspPremium: Math.round(calendarDays.reduce((sum, d) => sum + d.cspPremium, 0) * 100) / 100,
    totalTrades: calendarDays.reduce((sum, d) => sum + d.tradeCount, 0),
    ccCount: calendarDays.reduce((sum, d) => sum + d.ccCount, 0),
    cspCount: calendarDays.reduce((sum, d) => sum + d.cspCount, 0),
    assignments: calendarDays.reduce((sum, d) => sum + d.assignmentCount, 0),
    expirations: calendarDays.reduce((sum, d) => sum + d.expirationCount, 0),
    tradingDays: calendarDays.length,
    premiumDays: calendarDays.filter(d => d.premiumCollected > 0).length,
  };

  log.info({ userId, year, month, symbol, days: calendarDays.length }, 'Wheel calendar fetched');

  return apiJson({
    data: {
      type: 'wheel',
      year,
      month,
      symbol: symbol?.toUpperCase() ?? null,
      days: calendarDays,
      summary,
    },
  });
}

