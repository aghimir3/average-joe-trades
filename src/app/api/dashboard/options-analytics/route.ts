import { apiJson } from '@/lib/api/response';
/**
 * Options Analytics API Route
 *
 * Comprehensive analytics for options traders including:
 * - DTE (Days to Expiration) performance analysis with sweet spot detection
 * - Strategy performance breakdown (18 strategies)
 * - Win/Loss deep dive with recovery analysis
 * - Exit type analysis (expired/assigned/early close)
 * - Premium capture analysis for option sellers
 * - Position sizing and ticker concentration
 * - Expiration cycle analysis (weekly vs monthly, opex week)
 * - Trade timing analysis (day of week, seasonality)
 * - Rolling analysis (roll detection and effectiveness)
 *
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardOptionsAnalytics } from '@/lib/dashboard/sample-data';

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
// Types
// ============================================================================

interface DTEBucket {
  label: string;
  min: number;
  max: number;
  tradeCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
  totalVolume: number;
}

interface StrategyStats {
  strategy: string;
  displayName: string;
  tradeCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
  avgDTE: number;
}

interface WinLossStats {
  totalPnL: number;
  tradeCount: number;
  avgPnL: number;
  medianPnL: number;
  largestTrade: number;
  avgHoldTime: number;
  avgDTE: number;
  totalVolume: number;
  maxConsecutive: number;
  cumulativeDaily: Array<{ date: string; cumPnL: number; count: number }>;
}

interface ExitStats {
  exitType: string;
  count: number;
  totalPnL: number;
  avgPnL: number;
  winRate: number;
  avgHoldTime: number;
}

interface PremiumStats {
  totalReceived: number;
  totalKept: number;
  captureRate: number;
  tradeCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const DTE_BUCKETS = [
  { label: 'Same day', min: 0, max: 0 },
  { label: '1 day', min: 1, max: 1 },
  { label: '2 days', min: 2, max: 2 },
  { label: '3 days', min: 3, max: 3 },
  { label: '4 days', min: 4, max: 4 },
  { label: '5 days', min: 5, max: 5 },
  { label: '6 days', min: 6, max: 6 },
  { label: '7 days', min: 7, max: 7 },
  { label: '8 days', min: 8, max: 8 },
  { label: '9 days', min: 9, max: 9 },
  { label: '10+ days', min: 10, max: Infinity },
];

const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  long_call: 'Long Call',
  long_put: 'Long Put',
  covered_call: 'Covered Call',
  cash_secured_put: 'Cash Secured Put',
  call_debit_spread: 'Call Debit Spread',
  put_debit_spread: 'Put Debit Spread',
  call_credit_spread: 'Call Credit Spread',
  put_credit_spread: 'Put Credit Spread',
  iron_condor: 'Iron Condor',
  iron_butterfly: 'Iron Butterfly',
  long_straddle: 'Long Straddle',
  long_strangle: 'Long Strangle',
  short_straddle: 'Short Straddle',
  short_strangle: 'Short Strangle',
  jade_lizard: 'Jade Lizard',
  calendar_spread: 'Calendar Spread',
  diagonal_spread: 'Diagonal Spread',
  custom: 'Custom',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate DTE at entry (days from open date to expiration)
 */
function calculateDTEAtEntry(openDate: Date, expiration: Date): number {
  const diffMs = expiration.getTime() - openDate.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate hold time in days
 */
function calculateHoldTime(openDate: Date, closeDate: Date): number {
  const diffMs = closeDate.getTime() - openDate.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Categorize exit type
 */
function getExitType(
  closeReason: string,
  closeDate: Date,
  expiration: Date | null
): string {
  if (closeReason === 'expired') return 'expired';
  if (closeReason === 'assigned') return 'assigned';

  // Normal close - check if early or at expiry
  if (expiration) {
    const daysBeforeExpiry = Math.ceil(
      (expiration.getTime() - closeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysBeforeExpiry > 0) return 'closed_early';
    return 'closed_at_expiry';
  }

  return 'closed_early';
}

/**
 * Calculate median of an array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
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
 * Calculate max consecutive streak
 */
function maxConsecutive(trades: Array<{ pnl: number; date: Date }>, isWin: boolean): number {
  const sorted = [...trades].sort((a, b) => a.date.getTime() - b.date.getTime());
  let max = 0;
  let current = 0;

  for (const trade of sorted) {
    const matchesType = isWin ? trade.pnl > 0 : trade.pnl < 0;
    if (matchesType) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }

  return max;
}

/**
 * Calculate cumulative P&L by day
 */
function calculateCumulativeDaily(
  trades: Array<{ pnl: number; closeDate: Date }>
): Array<{ date: string; cumPnL: number; count: number }> {
  // Group by date
  const byDate = new Map<string, { pnl: number; count: number }>();

  for (const trade of trades) {
    const dateKey = trade.closeDate.toISOString().split('T')[0];
    const existing = byDate.get(dateKey) || { pnl: 0, count: 0 };
    byDate.set(dateKey, {
      pnl: existing.pnl + trade.pnl,
      count: existing.count + 1,
    });
  }

  // Sort by date and calculate cumulative
  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let cumPnL = 0;

  return sorted.map(([date, data]) => {
    cumPnL += data.pnl;
    return { date, cumPnL: Math.round(cumPnL * 100) / 100, count: data.count };
  });
}

/**
 * Calculate sweet spot recommendation
 */
function calculateSweetSpot(
  buckets: DTEBucket[]
): { range: string; winRate: number; avgPnL: number; reason: string } | null {
  // Filter buckets with at least 5 trades and positive avgPnL
  const qualified = buckets.filter(b => b.tradeCount >= 5 && b.avgPnL > 0);

  if (qualified.length === 0) {
    // Fallback: just find highest win rate with at least 3 trades
    const fallback = buckets
      .filter(b => b.tradeCount >= 3)
      .sort((a, b) => b.winRate - a.winRate)[0];

    if (!fallback) return null;

    return {
      range: fallback.label,
      winRate: Math.round(fallback.winRate),
      avgPnL: Math.round(fallback.avgPnL * 100) / 100,
      reason: `Highest win rate with ${fallback.tradeCount} trades`,
    };
  }

  // Score: winRate * avgPnL * log(tradeCount + 1)
  const scored = qualified.map(b => ({
    ...b,
    score: b.winRate * b.avgPnL * Math.log(b.tradeCount + 1),
  }));

  const best = scored.sort((a, b) => b.score - a.score)[0];

  return {
    range: best.label,
    winRate: Math.round(best.winRate),
    avgPnL: Math.round(best.avgPnL * 100) / 100,
    reason: `${Math.round(best.winRate)}% win rate with avg $${Math.abs(best.avgPnL).toFixed(0)} P&L across ${best.tradeCount} trades`,
  };
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
    log.info({ userId }, 'Fetching options analytics');

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
      log.info({ userId }, 'Returning sample options analytics');
      return apiJson({ data: sampleDashboardOptionsAnalytics() });
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
        underlyingPriceAtOpen: true,
        underlyingPriceAtClose: true,
      },
      orderBy: { closeDate: 'desc' },
    });

    log.info({ tradeCount: closes.length }, 'Found option trades');

    if (closes.length === 0) {
      return apiJson({
        data: {
          summary: { totalTrades: 0, totalPnL: 0, winRate: 0, avgDTE: 0 },
          dte: { buckets: [], sweetSpot: null },
          strategy: { byStrategy: [], comparison: null },
          winLoss: {
            wins: null,
            losses: null,
            streaks: { currentType: 'none', currentCount: 0, longestWin: 0, longestLoss: 0 },
            recovery: null,
          },
          exitType: { breakdown: [], recommendations: [] },
          premium: { credit: null, debit: null },
          positionSizing: { buckets: [], optimalRange: null, concentration: [], avgPositionSize: 0, medianPositionSize: 0 },
        },
      });
    }

    // Process trades
    const processedTrades = closes.map(c => {
      const pnl = c.realizedPnL.toNumber();
      const openDate = new Date(c.openDate);
      const closeDate = new Date(c.closeDate);
      const expiration = c.expiration ? new Date(c.expiration) : null;
      const strike = c.strike?.toNumber() || 0;
      const openPrice = c.openPrice.toNumber();
      const closePrice = c.closePrice?.toNumber() || 0;
      const quantity = Math.abs(c.quantity.toNumber());

      return {
        id: c.id,
        symbol: c.symbol,
        optionType: c.optionType || 'unknown',
        strike,
        expiration,
        strategy: c.strategy || 'unknown',
        side: c.side || 'unknown',
        closeReason: c.closeReason || 'normal',
        openDate,
        closeDate,
        pnl,
        isWin: pnl > 0,
        isLoss: pnl < 0,
        dte: expiration ? calculateDTEAtEntry(openDate, expiration) : 0,
        holdTime: calculateHoldTime(openDate, closeDate),
        exitType: getExitType(c.closeReason || 'normal', closeDate, expiration),
        openPrice,
        closePrice,
        quantity,
        volume: Math.abs(openPrice * quantity * 100),
        // For premium analysis
        isCredit: c.side === 'short',
        premiumReceived: c.side === 'short' ? Math.abs(openPrice * quantity * 100) : 0,
        premiumKept: c.side === 'short' ? Math.abs(pnl) : 0,
      };
    });

    // ========================================================================
    // Summary
    // ========================================================================
    const totalPnL = processedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = processedTrades.filter(t => t.isWin).length;
    const losses = processedTrades.filter(t => t.isLoss).length;
    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    const avgDTE = processedTrades.length > 0
      ? processedTrades.reduce((sum, t) => sum + t.dte, 0) / processedTrades.length
      : 0;

    // ========================================================================
    // DTE Analysis
    // ========================================================================
    const dteBuckets: DTEBucket[] = DTE_BUCKETS.map(bucket => {
      const tradesInBucket = processedTrades.filter(
        t => t.dte >= bucket.min && t.dte <= bucket.max
      );

      const bucketWins = tradesInBucket.filter(t => t.isWin).length;
      const bucketLosses = tradesInBucket.filter(t => t.isLoss).length;
      const bucketPnL = tradesInBucket.reduce((sum, t) => sum + t.pnl, 0);
      const bucketVolume = tradesInBucket.reduce((sum, t) => sum + t.volume, 0);
      const avgHold = tradesInBucket.length > 0
        ? tradesInBucket.reduce((sum, t) => sum + t.holdTime, 0) / tradesInBucket.length
        : 0;

      return {
        label: bucket.label,
        min: bucket.min,
        max: bucket.max,
        tradeCount: tradesInBucket.length,
        totalPnL: Math.round(bucketPnL * 100) / 100,
        wins: bucketWins,
        losses: bucketLosses,
        winRate: bucketWins + bucketLosses > 0
          ? Math.round((bucketWins / (bucketWins + bucketLosses)) * 100)
          : 0,
        avgPnL: tradesInBucket.length > 0
          ? Math.round((bucketPnL / tradesInBucket.length) * 100) / 100
          : 0,
        avgHoldTime: Math.round(avgHold * 10) / 10,
        totalVolume: Math.round(bucketVolume * 100) / 100,
      };
    });

    const sweetSpot = calculateSweetSpot(dteBuckets);

    // ========================================================================
    // Strategy Analysis
    // ========================================================================
    const strategyMap = new Map<string, typeof processedTrades>();
    for (const trade of processedTrades) {
      const key = trade.strategy || 'unknown';
      const existing = strategyMap.get(key) || [];
      existing.push(trade);
      strategyMap.set(key, existing);
    }

    const strategyStats: StrategyStats[] = Array.from(strategyMap.entries())
      .map(([strategy, trades]) => {
        const stratWins = trades.filter(t => t.isWin).length;
        const stratLosses = trades.filter(t => t.isLoss).length;
        const stratPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        const avgDte = trades.reduce((sum, t) => sum + t.dte, 0) / trades.length;
        const avgHold = trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length;

        return {
          strategy,
          displayName: STRATEGY_DISPLAY_NAMES[strategy] || strategy,
          tradeCount: trades.length,
          totalPnL: Math.round(stratPnL * 100) / 100,
          wins: stratWins,
          losses: stratLosses,
          winRate: stratWins + stratLosses > 0
            ? Math.round((stratWins / (stratWins + stratLosses)) * 100)
            : 0,
          avgPnL: Math.round((stratPnL / trades.length) * 100) / 100,
          avgHoldTime: Math.round(avgHold * 10) / 10,
          avgDTE: Math.round(avgDte * 10) / 10,
        };
      })
      .sort((a, b) => b.totalPnL - a.totalPnL);

    const strategyComparison = strategyStats.length > 0
      ? {
          mostProfitable: strategyStats[0].displayName,
          mostProfitablePnL: strategyStats[0].totalPnL,
          highestWinRate: [...strategyStats]
            .filter(s => s.tradeCount >= 3)
            .sort((a, b) => b.winRate - a.winRate)[0]?.displayName || null,
          highestWinRatePct: [...strategyStats]
            .filter(s => s.tradeCount >= 3)
            .sort((a, b) => b.winRate - a.winRate)[0]?.winRate || 0,
          mostActive: [...strategyStats].sort((a, b) => b.tradeCount - a.tradeCount)[0]?.displayName || null,
          mostActiveCount: [...strategyStats].sort((a, b) => b.tradeCount - a.tradeCount)[0]?.tradeCount || 0,
        }
      : null;

    // ========================================================================
    // Win/Loss Analysis
    // ========================================================================
    const winningTrades = processedTrades.filter(t => t.isWin);
    const losingTrades = processedTrades.filter(t => t.isLoss);

    const buildWinLossStats = (trades: typeof processedTrades, isWins: boolean): WinLossStats | null => {
      if (trades.length === 0) return null;

      const pnls = trades.map(t => t.pnl);
      const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
      const totalVol = trades.reduce((sum, t) => sum + t.volume, 0);
      const avgHold = trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length;
      const avgDte = trades.reduce((sum, t) => sum + t.dte, 0) / trades.length;

      return {
        totalPnL: Math.round(totalPnl * 100) / 100,
        tradeCount: trades.length,
        avgPnL: Math.round((totalPnl / trades.length) * 100) / 100,
        medianPnL: Math.round(median(pnls) * 100) / 100,
        largestTrade: isWins ? Math.max(...pnls) : Math.min(...pnls),
        avgHoldTime: Math.round(avgHold * 10) / 10,
        avgDTE: Math.round(avgDte * 10) / 10,
        totalVolume: Math.round(totalVol * 100) / 100,
        maxConsecutive: maxConsecutive(
          processedTrades.map(t => ({ pnl: t.pnl, date: t.closeDate })),
          isWins
        ),
        cumulativeDaily: calculateCumulativeDaily(
          trades.map(t => ({ pnl: t.pnl, closeDate: t.closeDate }))
        ),
      };
    };

    const winsStats = buildWinLossStats(winningTrades, true);
    const lossesStats = buildWinLossStats(losingTrades, false);

    // Streak analysis
    const sortedByDate = [...processedTrades].sort(
      (a, b) => b.closeDate.getTime() - a.closeDate.getTime()
    );
    let currentStreakType: 'win' | 'loss' | 'none' = 'none';
    let currentStreakCount = 0;

    if (sortedByDate.length > 0) {
      currentStreakType = sortedByDate[0].isWin ? 'win' : sortedByDate[0].isLoss ? 'loss' : 'none';
      currentStreakCount = 1;

      for (let i = 1; i < sortedByDate.length; i++) {
        const trade = sortedByDate[i];
        const tradeType = trade.isWin ? 'win' : trade.isLoss ? 'loss' : 'none';
        if (tradeType === currentStreakType && tradeType !== 'none') {
          currentStreakCount++;
        } else {
          break;
        }
      }
    }

    // Recovery analysis
    let recoveryCount = 0;
    let totalRecoveryDays = 0;
    let totalRecoveryAmount = 0;

    const chronological = [...processedTrades].sort(
      (a, b) => a.closeDate.getTime() - b.closeDate.getTime()
    );

    for (let i = 0; i < chronological.length - 1; i++) {
      if (chronological[i].isLoss && chronological[i + 1].isWin) {
        recoveryCount++;
        const daysBetween = calculateHoldTime(
          chronological[i].closeDate,
          chronological[i + 1].closeDate
        );
        totalRecoveryDays += daysBetween;
        totalRecoveryAmount += chronological[i + 1].pnl;
      }
    }

    const recoveryStats = losingTrades.length > 0
      ? {
          recoveryRate: Math.round((recoveryCount / losingTrades.length) * 100),
          avgRecoveryDays: recoveryCount > 0
            ? Math.round((totalRecoveryDays / recoveryCount) * 10) / 10
            : 0,
          avgRecoveryAmount: recoveryCount > 0
            ? Math.round((totalRecoveryAmount / recoveryCount) * 100) / 100
            : 0,
          bounceBackRatio: lossesStats && winsStats
            ? Math.round((Math.abs(winsStats.avgPnL) / Math.abs(lossesStats.avgPnL)) * 100) / 100
            : 0,
        }
      : null;

    // ========================================================================
    // Exit Type Analysis
    // ========================================================================
    const exitTypes = ['expired', 'assigned', 'closed_early', 'closed_at_expiry'];
    const exitStats: ExitStats[] = exitTypes.map(exitType => {
      const trades = processedTrades.filter(t => t.exitType === exitType);
      const exitWins = trades.filter(t => t.isWin).length;
      const exitLosses = trades.filter(t => t.isLoss).length;
      const exitPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      const avgHold = trades.length > 0
        ? trades.reduce((sum, t) => sum + t.holdTime, 0) / trades.length
        : 0;

      return {
        exitType,
        count: trades.length,
        totalPnL: Math.round(exitPnL * 100) / 100,
        avgPnL: trades.length > 0
          ? Math.round((exitPnL / trades.length) * 100) / 100
          : 0,
        winRate: exitWins + exitLosses > 0
          ? Math.round((exitWins / (exitWins + exitLosses)) * 100)
          : 0,
        avgHoldTime: Math.round(avgHold * 10) / 10,
      };
    }).filter(s => s.count > 0);

    // Exit recommendations
    const exitRecommendations: Array<{ type: string; message: string }> = [];
    const earlyClose = exitStats.find(e => e.exitType === 'closed_early');
    const expired = exitStats.find(e => e.exitType === 'expired');

    if (earlyClose && expired && earlyClose.count > 0 && expired.count > 0) {
      if (expired.winRate > earlyClose.winRate + 10) {
        exitRecommendations.push({
          type: 'hold_longer',
          message: `Expired trades have ${expired.winRate}% win rate vs ${earlyClose.winRate}% for early closes. Consider holding longer.`,
        });
      }
    }

    // ========================================================================
    // Premium Analysis
    // ========================================================================
    const creditTrades = processedTrades.filter(t => t.isCredit);
    const debitTrades = processedTrades.filter(t => !t.isCredit);

    const creditStats: PremiumStats | null = creditTrades.length > 0
      ? {
          totalReceived: Math.round(creditTrades.reduce((sum, t) => sum + t.premiumReceived, 0) * 100) / 100,
          totalKept: Math.round(creditTrades.reduce((sum, t) => sum + t.premiumKept, 0) * 100) / 100,
          captureRate: (() => {
            const received = creditTrades.reduce((sum, t) => sum + t.premiumReceived, 0);
            const kept = creditTrades.reduce((sum, t) => sum + t.premiumKept, 0);
            return received > 0 ? Math.round((kept / received) * 100) : 0;
          })(),
          tradeCount: creditTrades.length,
        }
      : null;

    const debitStats = debitTrades.length > 0
      ? {
          totalPaid: Math.round(debitTrades.reduce((sum, t) => sum + t.volume, 0) * 100) / 100,
          totalPnL: Math.round(debitTrades.reduce((sum, t) => sum + t.pnl, 0) * 100) / 100,
          avgReturn: (() => {
            const paid = debitTrades.reduce((sum, t) => sum + t.volume, 0);
            const pnl = debitTrades.reduce((sum, t) => sum + t.pnl, 0);
            return paid > 0 ? Math.round((pnl / paid) * 100 * 100) / 100 : 0;
          })(),
          tradeCount: debitTrades.length,
        }
      : null;

    // ========================================================================
    // Position Sizing Analysis
    // ========================================================================
    const SIZE_BUCKETS = [
      { label: 'Micro ($0-500)', min: 0, max: 500 },
      { label: 'Small ($501-2K)', min: 501, max: 2000 },
      { label: 'Medium ($2K-5K)', min: 2001, max: 5000 },
      { label: 'Large ($5K-10K)', min: 5001, max: 10000 },
      { label: 'XL ($10K+)', min: 10001, max: Infinity },
    ];

    const sizeBuckets = SIZE_BUCKETS.map(bucket => {
      const tradesInBucket = processedTrades.filter(
        t => t.volume >= bucket.min && t.volume <= bucket.max
      );

      const bucketWins = tradesInBucket.filter(t => t.isWin).length;
      const bucketLosses = tradesInBucket.filter(t => t.isLoss).length;
      const bucketPnL = tradesInBucket.reduce((sum, t) => sum + t.pnl, 0);
      const avgSize = tradesInBucket.length > 0
        ? tradesInBucket.reduce((sum, t) => sum + t.volume, 0) / tradesInBucket.length
        : 0;

      return {
        label: bucket.label,
        tradeCount: tradesInBucket.length,
        totalPnL: Math.round(bucketPnL * 100) / 100,
        wins: bucketWins,
        losses: bucketLosses,
        winRate: bucketWins + bucketLosses > 0
          ? Math.round((bucketWins / (bucketWins + bucketLosses)) * 100)
          : 0,
        avgPnL: tradesInBucket.length > 0
          ? Math.round((bucketPnL / tradesInBucket.length) * 100) / 100
          : 0,
        avgSize: Math.round(avgSize * 100) / 100,
      };
    }).filter(b => b.tradeCount > 0);

    // Calculate optimal position size range
    const qualifiedSizeBuckets = sizeBuckets.filter(b => b.tradeCount >= 5 && b.avgPnL > 0);
    const optimalSizeRange = qualifiedSizeBuckets.length > 0
      ? (() => {
          const scored = qualifiedSizeBuckets.map(b => ({
            ...b,
            score: b.winRate * b.avgPnL * Math.log(b.tradeCount + 1),
          }));
          const best = scored.sort((a, b) => b.score - a.score)[0];
          return {
            label: best.label,
            winRate: best.winRate,
            avgPnL: best.avgPnL,
            reason: `${best.winRate}% win rate with avg $${Math.abs(best.avgPnL).toFixed(0)} P&L across ${best.tradeCount} trades`,
          };
        })()
      : null;

    // Ticker concentration
    const tickerMap = new Map<string, { count: number; pnl: number; wins: number; losses: number }>();
    for (const trade of processedTrades) {
      const existing = tickerMap.get(trade.symbol) || { count: 0, pnl: 0, wins: 0, losses: 0 };
      tickerMap.set(trade.symbol, {
        count: existing.count + 1,
        pnl: existing.pnl + trade.pnl,
        wins: existing.wins + (trade.isWin ? 1 : 0),
        losses: existing.losses + (trade.isLoss ? 1 : 0),
      });
    }

    const tickerConcentration = Array.from(tickerMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        tradeCount: data.count,
        totalPnL: Math.round(data.pnl * 100) / 100,
        percentage: Math.round((data.count / processedTrades.length) * 100),
        winRate: data.wins + data.losses > 0
          ? Math.round((data.wins / (data.wins + data.losses)) * 100)
          : 0,
      }))
      .sort((a, b) => b.tradeCount - a.tradeCount);

    // Average and median position size
    const volumes = processedTrades.map(t => t.volume);
    const avgPositionSize = volumes.length > 0
      ? volumes.reduce((sum, v) => sum + v, 0) / volumes.length
      : 0;
    const medianPositionSize = median(volumes);

    // ========================================================================
    // Build Response
    // ========================================================================
    return apiJson({
      data: {
        summary: {
          totalTrades: processedTrades.length,
          totalPnL: Math.round(totalPnL * 100) / 100,
          winRate: Math.round(winRate),
          avgDTE: Math.round(avgDTE * 10) / 10,
          wins,
          losses,
        },
        dte: {
          buckets: dteBuckets,
          sweetSpot,
        },
        strategy: {
          byStrategy: strategyStats,
          comparison: strategyComparison,
        },
        winLoss: {
          wins: winsStats,
          losses: lossesStats,
          streaks: {
            currentType: currentStreakType,
            currentCount: currentStreakCount,
            longestWin: winsStats?.maxConsecutive || 0,
            longestLoss: lossesStats?.maxConsecutive || 0,
          },
          recovery: recoveryStats,
        },
        exitType: {
          breakdown: exitStats,
          recommendations: exitRecommendations,
        },
        premium: {
          credit: creditStats,
          debit: debitStats,
        },
        positionSizing: {
          buckets: sizeBuckets,
          optimalRange: optimalSizeRange,
          concentration: tickerConcentration,
          avgPositionSize: Math.round(avgPositionSize * 100) / 100,
          medianPositionSize: Math.round(medianPositionSize * 100) / 100,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Options analytics failed');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch options analytics',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

