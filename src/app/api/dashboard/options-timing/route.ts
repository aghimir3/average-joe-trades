import { apiJson } from '@/lib/api/response';
/**
 * Options Timing & Patterns API Route
 *
 * Advanced timing analytics for options traders including:
 * - Expiration cycle analysis (weekly vs monthly, opex week performance)
 * - Day of week analysis (best days to enter/exit trades)
 * - Seasonality patterns (monthly and quarterly performance)
 * - Roll analysis (detecting and measuring roll effectiveness)
 *
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardOptionsTiming } from '@/lib/dashboard/sample-data';

// ============================================================================
// Query Schema
// ============================================================================

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
  timeframe: z.enum(['7d', '30d', '90d', 'ytd', '1y', 'all']).optional(),
});

// ============================================================================
// Constants
// ============================================================================

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if expiration is weekly (Friday that's not 3rd Friday of month)
 */
function isWeeklyExpiration(expiration: Date): boolean {
  // Get the 3rd Friday of the month
  const year = expiration.getFullYear();
  const month = expiration.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstFriday = new Date(year, month, 1 + ((5 - firstDay.getDay() + 7) % 7));
  const thirdFriday = new Date(firstFriday);
  thirdFriday.setDate(firstFriday.getDate() + 14);

  // If it's not the 3rd Friday, it's a weekly
  return expiration.getDate() !== thirdFriday.getDate();
}

/**
 * Check if a date falls in options expiration week (week of 3rd Friday)
 */
function isOpexWeek(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstFriday = new Date(year, month, 1 + ((5 - firstDay.getDay() + 7) % 7));
  const thirdFriday = new Date(firstFriday);
  thirdFriday.setDate(firstFriday.getDate() + 14);

  // Opex week is Monday through Friday of the 3rd Friday week
  const opexMonday = new Date(thirdFriday);
  opexMonday.setDate(thirdFriday.getDate() - 4);
  const opexSaturday = new Date(thirdFriday);
  opexSaturday.setDate(thirdFriday.getDate() + 1);

  return date >= opexMonday && date < opexSaturday;
}

/**
 * Get date range from timeframe preset
 */
function getDateRangeFromTimeframe(timeframe: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start: Date;

  switch (timeframe) {
    case '7d':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start = new Date(now);
      start.setDate(start.getDate() - 90);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case '1y':
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
    default:
      start = new Date(2000, 0, 1);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Calculate hold time in days
 */
function calculateHoldTime(openDate: Date, closeDate: Date): number {
  const diffMs = closeDate.getTime() - openDate.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Fetching options timing analytics');

    // Parse query params
    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse({
      brokerageAccountId: searchParams.get('brokerageAccountId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      timeframe: searchParams.get('timeframe') || undefined,
    });

    if (!parseResult.success) {
      return apiJson(
        { error: 'Invalid query parameters', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate, timeframe } = parseResult.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample options timing analytics');
      return apiJson({ data: sampleDashboardOptionsTiming() });
    }

    // Build date filter
    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    if (timeframe && timeframe !== 'all') {
      const range = getDateRangeFromTimeframe(timeframe);
      dateFilter = { gte: range.start, lte: range.end };
    } else if (startDate || endDate) {
      dateFilter = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
    }

    // Fetch all option closes
    const closes = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeType: 'option',
        hasUnknownBasis: false,
        ...(brokerageAccountId && { brokerageAccountId }),
        ...(dateFilter && { closeDate: dateFilter }),
      },
      select: {
        id: true,
        symbol: true,
        optionType: true,
        strike: true,
        expiration: true,
        strategy: true,
        side: true,
        closeReason: true,
        openDate: true,
        closeDate: true,
        openPrice: true,
        closePrice: true,
        quantity: true,
        realizedPnL: true,
      },
      orderBy: { closeDate: 'desc' },
    });

    log.info({ tradeCount: closes.length }, 'Found option trades for timing analysis');

    if (closes.length === 0) {
      return apiJson({
        data: {
          summary: { totalTrades: 0, totalPnL: 0, winRate: 0 },
          expiryCycles: { weekly: null, monthly: null, insight: null },
          opexWeek: { opex: null, nonOpex: null, insight: null },
          dayOfWeek: { byDay: [], bestEntryDay: null, bestExitDay: null },
          seasonality: { byMonth: [], bestMonth: null, worstMonth: null, byQuarter: [] },
          rolls: { stats: null, bySymbol: [], insight: null },
        },
      });
    }

    // Process trades
    const processedTrades = closes.map(c => {
      const pnl = c.realizedPnL.toNumber();
      const openDate = new Date(c.openDate);
      const closeDate = new Date(c.closeDate);
      const expiration = c.expiration ? new Date(c.expiration) : null;
      const openPrice = c.openPrice.toNumber();
      const closePrice = c.closePrice?.toNumber() || 0;
      const quantity = Math.abs(c.quantity.toNumber());

      return {
        id: c.id,
        symbol: c.symbol,
        optionType: c.optionType,
        strike: c.strike?.toNumber() || 0,
        expiration,
        strategy: c.strategy,
        side: c.side,
        closeReason: c.closeReason,
        openDate,
        closeDate,
        openPrice,
        closePrice,
        quantity,
        pnl,
        isWin: pnl > 0,
        isLoss: pnl < 0,
        isWeekly: expiration ? isWeeklyExpiration(expiration) : false,
        openDayOfWeek: openDate.getDay(),
        closeDayOfWeek: closeDate.getDay(),
        openMonth: openDate.getMonth(),
        closeMonth: closeDate.getMonth(),
        openQuarter: Math.floor(openDate.getMonth() / 3) + 1,
        isOpexWeekOpen: isOpexWeek(openDate),
        isOpexWeekClose: isOpexWeek(closeDate),
        holdTime: calculateHoldTime(openDate, closeDate),
      };
    });

    // ========================================================================
    // Summary
    // ========================================================================
    const totalPnL = processedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = processedTrades.filter(t => t.isWin).length;
    const losses = processedTrades.filter(t => t.isLoss).length;
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    // ========================================================================
    // Expiration Cycle Analysis
    // ========================================================================
    const weeklyTrades = processedTrades.filter(t => t.isWeekly);
    const monthlyTrades = processedTrades.filter(t => !t.isWeekly);

    const buildCycleStats = (trades: typeof processedTrades) => {
      if (trades.length === 0) return null;
      const w = trades.filter(t => t.isWin).length;
      const l = trades.filter(t => t.isLoss).length;
      const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);
      return {
        tradeCount: trades.length,
        totalPnL: Math.round(pnl * 100) / 100,
        winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
        avgPnL: Math.round((pnl / trades.length) * 100) / 100,
        avgHoldTime: Math.round(trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length * 10) / 10,
      };
    };

    const weeklyStats = buildCycleStats(weeklyTrades);
    const monthlyStats = buildCycleStats(monthlyTrades);

    let cycleInsight: string | null = null;
    if (weeklyStats && monthlyStats && weeklyStats.tradeCount >= 5 && monthlyStats.tradeCount >= 5) {
      const diff = weeklyStats.winRate - monthlyStats.winRate;
      if (Math.abs(diff) >= 10) {
        cycleInsight = diff > 0
          ? `Weekly expirations outperform monthlies by ${diff}% win rate`
          : `Monthly expirations outperform weeklies by ${Math.abs(diff)}% win rate`;
      }
    }

    // ========================================================================
    // Opex Week Analysis
    // ========================================================================
    const opexTrades = processedTrades.filter(t => t.isOpexWeekClose);
    const nonOpexTrades = processedTrades.filter(t => !t.isOpexWeekClose);

    const opexStats = buildCycleStats(opexTrades);
    const nonOpexStats = buildCycleStats(nonOpexTrades);

    let opexInsight: string | null = null;
    if (opexStats && nonOpexStats && opexStats.tradeCount >= 3 && nonOpexStats.tradeCount >= 3) {
      const diff = opexStats.winRate - nonOpexStats.winRate;
      if (Math.abs(diff) >= 10) {
        opexInsight = diff > 0
          ? `You perform ${diff}% better during OpEx week`
          : `You perform ${Math.abs(diff)}% better outside OpEx week`;
      }
    }

    // ========================================================================
    // Day of Week Analysis
    // ========================================================================
    const dayOfWeekStats = DAY_NAMES.map((day, dayNum) => {
      const entries = processedTrades.filter(t => t.openDayOfWeek === dayNum);
      const exits = processedTrades.filter(t => t.closeDayOfWeek === dayNum);

      const entryWins = entries.filter(t => t.isWin).length;
      const entryLosses = entries.filter(t => t.isLoss).length;
      const entryPnL = entries.reduce((sum, t) => sum + t.pnl, 0);

      const exitWins = exits.filter(t => t.isWin).length;
      const exitLosses = exits.filter(t => t.isLoss).length;
      const exitPnL = exits.reduce((sum, t) => sum + t.pnl, 0);

      return {
        day,
        dayNum,
        entryCount: entries.length,
        exitCount: exits.length,
        entryPnL: Math.round(entryPnL * 100) / 100,
        exitPnL: Math.round(exitPnL * 100) / 100,
        entryWinRate: entryWins + entryLosses > 0 ? Math.round((entryWins / (entryWins + entryLosses)) * 100) : 0,
        exitWinRate: exitWins + exitLosses > 0 ? Math.round((exitWins / (exitWins + exitLosses)) * 100) : 0,
      };
    }).filter(d => d.entryCount > 0 || d.exitCount > 0);

    // Best days (need at least 5 trades to qualify)
    const bestEntryDay = [...dayOfWeekStats]
      .filter(d => d.entryCount >= 5)
      .sort((a, b) => b.entryWinRate - a.entryWinRate)[0] || null;

    const bestExitDay = [...dayOfWeekStats]
      .filter(d => d.exitCount >= 5)
      .sort((a, b) => b.exitWinRate - a.exitWinRate)[0] || null;

    // ========================================================================
    // Seasonality Analysis (by month)
    // ========================================================================
    const monthStats = MONTH_NAMES.map((month, monthNum) => {
      const trades = processedTrades.filter(t => t.closeMonth === monthNum);
      const w = trades.filter(t => t.isWin).length;
      const l = trades.filter(t => t.isLoss).length;
      const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);

      return {
        month,
        monthNum,
        tradeCount: trades.length,
        totalPnL: Math.round(pnl * 100) / 100,
        winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
        avgPnL: trades.length > 0 ? Math.round((pnl / trades.length) * 100) / 100 : 0,
      };
    }).filter(m => m.tradeCount > 0);

    const bestMonth = [...monthStats]
      .filter(m => m.tradeCount >= 3)
      .sort((a, b) => b.totalPnL - a.totalPnL)[0] || null;

    const worstMonth = [...monthStats]
      .filter(m => m.tradeCount >= 3)
      .sort((a, b) => a.totalPnL - b.totalPnL)[0] || null;

    // Quarterly stats
    const quarterStats = [1, 2, 3, 4].map(q => {
      const trades = processedTrades.filter(t => t.openQuarter === q);
      const w = trades.filter(t => t.isWin).length;
      const l = trades.filter(t => t.isLoss).length;
      const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);

      return {
        quarter: `Q${q}`,
        quarterNum: q,
        tradeCount: trades.length,
        totalPnL: Math.round(pnl * 100) / 100,
        winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
      };
    }).filter(q => q.tradeCount > 0);

    // ========================================================================
    // Roll Analysis
    // ========================================================================
    // Detect rolls: same symbol, same optionType, closed within 2 days of new open
    // Group trades by symbol and optionType for roll detection
    const tradesBySymbolType = new Map<string, typeof processedTrades>();
    for (const trade of processedTrades) {
      const key = `${trade.symbol}|${trade.optionType}`;
      const existing = tradesBySymbolType.get(key) || [];
      existing.push(trade);
      tradesBySymbolType.set(key, existing);
    }

    const rolls: Array<{
      symbol: string;
      fromStrike: number;
      toStrike: number;
      fromExpiry: Date | null;
      toExpiry: Date | null;
      credit: number;
      daysExtended: number;
      wasSuccessful: boolean;
    }> = [];

    // Look for roll patterns
    for (const [, trades] of tradesBySymbolType) {
      // Sort by close date
      const sorted = [...trades].sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime());

      for (let i = 0; i < sorted.length - 1; i++) {
        const closedTrade = sorted[i];
        const nextTrade = sorted[i + 1];

        // Check if this looks like a roll (opened within 2 days of close)
        const daysBetween = Math.abs(
          Math.ceil((nextTrade.openDate.getTime() - closedTrade.closeDate.getTime()) / (1000 * 60 * 60 * 24))
        );

        if (daysBetween <= 2 && closedTrade.side === nextTrade.side) {
          // This looks like a roll
          const credit = closedTrade.pnl; // P&L from closed position
          const daysExtended = closedTrade.expiration && nextTrade.expiration
            ? Math.ceil((nextTrade.expiration.getTime() - closedTrade.expiration.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          rolls.push({
            symbol: closedTrade.symbol,
            fromStrike: closedTrade.strike,
            toStrike: nextTrade.strike,
            fromExpiry: closedTrade.expiration,
            toExpiry: nextTrade.expiration,
            credit,
            daysExtended,
            wasSuccessful: nextTrade.pnl > 0,
          });
        }
      }
    }

    const rollStats = rolls.length > 0
      ? {
          totalRolls: rolls.length,
          successfulRolls: rolls.filter(r => r.wasSuccessful).length,
          successRate: Math.round((rolls.filter(r => r.wasSuccessful).length / rolls.length) * 100),
          avgRollCredit: Math.round((rolls.reduce((sum, r) => sum + r.credit, 0) / rolls.length) * 100) / 100,
          totalRollPnL: Math.round(rolls.reduce((sum, r) => sum + r.credit, 0) * 100) / 100,
          avgDaysExtended: Math.round((rolls.reduce((sum, r) => sum + r.daysExtended, 0) / rolls.length) * 10) / 10,
        }
      : null;

    // Roll stats by symbol
    const rollsBySymbol = new Map<string, typeof rolls>();
    for (const roll of rolls) {
      const existing = rollsBySymbol.get(roll.symbol) || [];
      existing.push(roll);
      rollsBySymbol.set(roll.symbol, existing);
    }

    const rollsBySymbolStats = Array.from(rollsBySymbol.entries())
      .map(([symbol, symbolRolls]) => ({
        symbol,
        rollCount: symbolRolls.length,
        successRate: Math.round((symbolRolls.filter(r => r.wasSuccessful).length / symbolRolls.length) * 100),
        totalCredit: Math.round(symbolRolls.reduce((sum, r) => sum + r.credit, 0) * 100) / 100,
      }))
      .sort((a, b) => b.rollCount - a.rollCount)
      .slice(0, 5);

    let rollInsight: string | null = null;
    if (rollStats && rollStats.totalRolls >= 3) {
      if (rollStats.successRate >= 70) {
        rollInsight = `Your rolls are effective with ${rollStats.successRate}% success rate`;
      } else if (rollStats.successRate < 50) {
        rollInsight = `Consider your roll strategy - only ${rollStats.successRate}% succeed`;
      }
    }

    // ========================================================================
    // Build Response
    // ========================================================================
    return apiJson({
      data: {
        summary: {
          totalTrades: processedTrades.length,
          totalPnL: Math.round(totalPnL * 100) / 100,
          winRate,
        },
        expiryCycles: {
          weekly: weeklyStats,
          monthly: monthlyStats,
          insight: cycleInsight,
        },
        opexWeek: {
          opex: opexStats,
          nonOpex: nonOpexStats,
          insight: opexInsight,
        },
        dayOfWeek: {
          byDay: dayOfWeekStats,
          bestEntryDay: bestEntryDay ? { day: bestEntryDay.day, winRate: bestEntryDay.entryWinRate, count: bestEntryDay.entryCount } : null,
          bestExitDay: bestExitDay ? { day: bestExitDay.day, winRate: bestExitDay.exitWinRate, count: bestExitDay.exitCount } : null,
        },
        seasonality: {
          byMonth: monthStats,
          bestMonth: bestMonth ? { month: bestMonth.month, pnl: bestMonth.totalPnL, winRate: bestMonth.winRate } : null,
          worstMonth: worstMonth ? { month: worstMonth.month, pnl: worstMonth.totalPnL, winRate: worstMonth.winRate } : null,
          byQuarter: quarterStats,
        },
        rolls: {
          stats: rollStats,
          bySymbol: rollsBySymbolStats,
          insight: rollInsight,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Options timing analytics failed');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch options timing analytics',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

