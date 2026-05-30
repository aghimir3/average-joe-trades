import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Streaks API
 *
 * Calculates win/loss streaks from closed trades.
 * GET /api/dashboard/streaks
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardStreaks } from '@/lib/dashboard/sample-data';

interface StreakInfo {
  type: 'win' | 'loss' | 'none';
  count: number;
  startDate: string | null;
  trades: Array<{
    id: string;
    symbol: string;
    pnl: number;
    date: string;
  }>;
}

interface StreaksResponse {
  currentStreak: StreakInfo;
  longestWinStreak: StreakInfo;
  longestLossStreak: StreakInfo;
  totalStreaks: {
    winStreaks: number;
    lossStreaks: number;
    avgWinStreakLength: number;
    avgLossStreakLength: number;
  };
  recentTrades: Array<{
    id: string;
    symbol: string;
    pnl: number;
    date: string;
    isWin: boolean;
  }>;
  streakMetrics: {
    currentStreakPnL: number;
    recoveryRate: number;
    maxConsecutiveGreenDays: number;
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query params for account filtering
    const { searchParams } = new URL(request.url);
    const brokerageAccountId = searchParams.get('brokerageAccountId');

    if (await isDashboardSampleModeEnabled(userId)) {
      return apiJson({ data: sampleDashboardStreaks() });
    }

    // Build where clause with optional account filter
    const whereClause: {
      userId: string;
      hasUnknownBasis: boolean;
      brokerageAccountId?: string;
    } = {
      userId,
      hasUnknownBasis: false,
    };

    if (brokerageAccountId) {
      whereClause.brokerageAccountId = brokerageAccountId;
    }

    // Get all closed trades ordered by close date descending
    const closedTrades = await prisma.realizedClose.findMany({
      where: whereClause,
      orderBy: {
        closeDate: 'desc',
      },
      select: {
        id: true,
        symbol: true,
        realizedPnL: true,
        closeDate: true,
      },
    });

    if (closedTrades.length === 0) {
      const emptyStreak: StreakInfo = {
        type: 'none',
        count: 0,
        startDate: null,
        trades: [],
      };

      return apiJson({
        data: {
          currentStreak: emptyStreak,
          longestWinStreak: emptyStreak,
          longestLossStreak: emptyStreak,
          totalStreaks: {
            winStreaks: 0,
            lossStreaks: 0,
            avgWinStreakLength: 0,
            avgLossStreakLength: 0,
          },
          recentTrades: [],
          streakMetrics: {
            currentStreakPnL: 0,
            recoveryRate: 0,
            maxConsecutiveGreenDays: 0,
          },
        } satisfies StreaksResponse,
      });
    }

    // Convert to simple format
    const trades = closedTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      pnl: t.realizedPnL.toNumber(),
      date: t.closeDate.toISOString().split('T')[0],
      isWin: t.realizedPnL.toNumber() > 0,
    }));

    // Calculate current streak (from most recent)
    const currentStreak = calculateCurrentStreak(trades);

    // Calculate all streaks for statistics
    const allStreaks = calculateAllStreaks(trades);

    // Find longest win and loss streaks
    const winStreaks = allStreaks.filter((s) => s.type === 'win');
    const lossStreaks = allStreaks.filter((s) => s.type === 'loss');

    const longestWinStreak =
      winStreaks.length > 0
        ? winStreaks.reduce((max, s) => (s.count > max.count ? s : max), winStreaks[0])
        : { type: 'win' as const, count: 0, startDate: null, trades: [] };

    const longestLossStreak =
      lossStreaks.length > 0
        ? lossStreaks.reduce((max, s) => (s.count > max.count ? s : max), lossStreaks[0])
        : { type: 'loss' as const, count: 0, startDate: null, trades: [] };

    // Calculate averages
    const avgWinStreakLength =
      winStreaks.length > 0
        ? winStreaks.reduce((sum, s) => sum + s.count, 0) / winStreaks.length
        : 0;
    const avgLossStreakLength =
      lossStreaks.length > 0
        ? lossStreaks.reduce((sum, s) => sum + s.count, 0) / lossStreaks.length
        : 0;

    // Calculate additional streak metrics
    const streakMetrics = calculateStreakMetrics(trades, currentStreak);

    return apiJson({
      data: {
        currentStreak,
        longestWinStreak,
        longestLossStreak,
        totalStreaks: {
          winStreaks: winStreaks.length,
          lossStreaks: lossStreaks.length,
          avgWinStreakLength: Math.round(avgWinStreakLength * 10) / 10,
          avgLossStreakLength: Math.round(avgLossStreakLength * 10) / 10,
        },
        recentTrades: trades.slice(0, 10),
        streakMetrics,
      } satisfies StreaksResponse,
    });
  } catch (error) {
    console.error('Error fetching streaks:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Calculate additional streak metrics
 */
function calculateStreakMetrics(
  trades: Array<{ id: string; symbol: string; pnl: number; date: string; isWin: boolean }>,
  currentStreak: StreakInfo
): { currentStreakPnL: number; recoveryRate: number; maxConsecutiveGreenDays: number } {
  // Current streak P&L
  const currentStreakPnL = currentStreak.trades.reduce((sum, t) => sum + t.pnl, 0);

  // Recovery rate: % of times a loss is immediately followed by a win
  // Process in chronological order (oldest first)
  const chronological = [...trades].reverse();
  let lossCount = 0;
  let recoveryCount = 0;

  for (let i = 0; i < chronological.length - 1; i++) {
    if (!chronological[i].isWin) {
      lossCount++;
      if (chronological[i + 1].isWin) {
        recoveryCount++;
      }
    }
  }
  const recoveryRate = lossCount > 0 ? Math.round((recoveryCount / lossCount) * 100) : 0;

  // Max consecutive green days (days with positive total P&L)
  // Group trades by date and calculate daily P&L
  const dailyPnL = new Map<string, number>();
  for (const trade of trades) {
    dailyPnL.set(trade.date, (dailyPnL.get(trade.date) || 0) + trade.pnl);
  }

  // Sort dates chronologically
  const sortedDates = Array.from(dailyPnL.keys()).sort();
  let maxGreenDays = 0;
  let currentGreenDays = 0;

  for (const date of sortedDates) {
    const pnl = dailyPnL.get(date) || 0;
    if (pnl > 0) {
      currentGreenDays++;
      maxGreenDays = Math.max(maxGreenDays, currentGreenDays);
    } else {
      currentGreenDays = 0;
    }
  }

  return {
    currentStreakPnL,
    recoveryRate,
    maxConsecutiveGreenDays: maxGreenDays,
  };
}

/**
 * Calculate the current streak from most recent trades
 */
function calculateCurrentStreak(
  trades: Array<{ id: string; symbol: string; pnl: number; date: string; isWin: boolean }>
): StreakInfo {
  if (trades.length === 0) {
    return { type: 'none', count: 0, startDate: null, trades: [] };
  }

  const firstTrade = trades[0];
  const streakType = firstTrade.isWin ? 'win' : 'loss';
  const streakTrades: typeof trades = [];

  for (const trade of trades) {
    const isCurrentTypeMatch = streakType === 'win' ? trade.isWin : !trade.isWin;
    if (isCurrentTypeMatch) {
      streakTrades.push(trade);
    } else {
      break;
    }
  }

  return {
    type: streakType,
    count: streakTrades.length,
    startDate: streakTrades.length > 0 ? streakTrades[streakTrades.length - 1].date : null,
    trades: streakTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      pnl: t.pnl,
      date: t.date,
    })),
  };
}

/**
 * Calculate all streaks in the trade history
 */
function calculateAllStreaks(
  trades: Array<{ id: string; symbol: string; pnl: number; date: string; isWin: boolean }>
): StreakInfo[] {
  if (trades.length === 0) return [];

  // Reverse to process from oldest to newest
  const chronological = [...trades].reverse();
  const streaks: StreakInfo[] = [];

  let currentType: 'win' | 'loss' = chronological[0].isWin ? 'win' : 'loss';
  let currentTrades: typeof trades = [];

  for (const trade of chronological) {
    const tradeType = trade.isWin ? 'win' : 'loss';

    if (tradeType === currentType) {
      currentTrades.push(trade);
    } else {
      // Save current streak
      if (currentTrades.length > 0) {
        streaks.push({
          type: currentType,
          count: currentTrades.length,
          startDate: currentTrades[0].date,
          trades: currentTrades.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            pnl: t.pnl,
            date: t.date,
          })),
        });
      }
      // Start new streak
      currentType = tradeType;
      currentTrades = [trade];
    }
  }

  // Don't forget the last streak
  if (currentTrades.length > 0) {
    streaks.push({
      type: currentType,
      count: currentTrades.length,
      startDate: currentTrades[0].date,
      trades: currentTrades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        pnl: t.pnl,
        date: t.date,
      })),
    });
  }

  return streaks;
}

