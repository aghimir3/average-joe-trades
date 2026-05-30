import { apiJson } from '@/lib/api/response';
/**
 * Time Analytics API Route
 *
 * Provides time-based analytics for trading:
 * - Average hold time for winners vs losers
 * - P&L by hour of day (entry/exit time)
 * - Time-based performance patterns
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardTimeAnalytics } from '@/lib/dashboard/sample-data';

interface HourlyStats {
  hour: number; // 0-23
  label: string; // "9 AM", "2 PM", etc.
  entryCount: number;
  exitCount: number;
  entryPnL: number;
  exitPnL: number;
  avgEntryPnL: number;
  avgExitPnL: number;
}

interface HoldTimeStats {
  avgHoldDaysWinners: number;
  avgHoldDaysLosers: number;
  avgHoldDaysAll: number;
  medianHoldDaysWinners: number;
  medianHoldDaysLosers: number;
  holdTimeDistribution: Array<{
    range: string;
    winCount: number;
    lossCount: number;
    totalPnL: number;
  }>;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function parseTimeToHour(time: string | null): number | null {
  if (!time) return null;
  const parts = time.split(':');
  if (parts.length < 2) return null;
  const hour = parseInt(parts[0], 10);
  return isNaN(hour) ? null : hour;
}

function calculateDaysBetween(openDate: Date, closeDate: Date): number {
  const diffMs = closeDate.getTime() - openDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getHoldTimeRange(days: number): string {
  if (days === 0) return 'Same day';
  if (days === 1) return '1 day';
  if (days <= 3) return '2-3 days';
  if (days <= 7) return '4-7 days';
  if (days <= 14) return '1-2 weeks';
  if (days <= 30) return '2-4 weeks';
  if (days <= 60) return '1-2 months';
  if (days <= 90) return '2-3 months';
  return '3+ months';
}

export async function GET(request: Request) {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const brokerageAccountId = searchParams.get('brokerageAccountId');

    if (await isDashboardSampleModeEnabled(userId)) {
      return apiJson({ data: sampleDashboardTimeAnalytics() });
    }

    // Build where clause
    const whereClause: {
      userId: string;
      brokerageAccountId?: string;
      hasUnknownBasis: boolean;
    } = {
      userId,
      hasUnknownBasis: false,
    };

    if (brokerageAccountId) {
      whereClause.brokerageAccountId = brokerageAccountId;
    }

    // Fetch realized closes with time data
    const closes = await prisma.realizedClose.findMany({
      where: whereClause,
      select: {
        id: true,
        openDate: true,
        openTime: true,
        closeDate: true,
        closeTime: true,
        realizedPnL: true,
        closeType: true,
        symbol: true,
      },
      orderBy: { closeDate: 'desc' },
    });

    // Initialize hourly stats (0-23 hours)
    const hourlyStats: Map<number, {
      entryCount: number;
      exitCount: number;
      entryPnL: number;
      exitPnL: number;
    }> = new Map();

    for (let h = 0; h < 24; h++) {
      hourlyStats.set(h, {
        entryCount: 0,
        exitCount: 0,
        entryPnL: 0,
        exitPnL: 0,
      });
    }

    // Calculate hold time stats
    const holdTimesWinners: number[] = [];
    const holdTimesLosers: number[] = [];
    const holdTimeDistMap = new Map<string, { winCount: number; lossCount: number; totalPnL: number }>();

    let tradesWithTime = 0;
    let tradesWithEntryTime = 0;
    let tradesWithExitTime = 0;

    for (const close of closes) {
      const pnl = close.realizedPnL.toNumber();
      const isWin = pnl > 0;
      const holdDays = calculateDaysBetween(close.openDate, close.closeDate);
      const holdRange = getHoldTimeRange(holdDays);

      // Track hold times
      if (isWin) {
        holdTimesWinners.push(holdDays);
      } else if (pnl < 0) {
        holdTimesLosers.push(holdDays);
      }

      // Update hold time distribution
      const distEntry = holdTimeDistMap.get(holdRange) || { winCount: 0, lossCount: 0, totalPnL: 0 };
      if (isWin) {
        distEntry.winCount++;
      } else if (pnl < 0) {
        distEntry.lossCount++;
      }
      distEntry.totalPnL += pnl;
      holdTimeDistMap.set(holdRange, distEntry);

      // Process entry time (openTime)
      const entryHour = parseTimeToHour(close.openTime);
      if (entryHour !== null) {
        tradesWithEntryTime++;
        const stats = hourlyStats.get(entryHour)!;
        stats.entryCount++;
        stats.entryPnL += pnl;
      }

      // Process exit time (closeTime)
      const exitHour = parseTimeToHour(close.closeTime);
      if (exitHour !== null) {
        tradesWithExitTime++;
        const stats = hourlyStats.get(exitHour)!;
        stats.exitCount++;
        stats.exitPnL += pnl;
      }

      if (close.openTime || close.closeTime) {
        tradesWithTime++;
      }
    }

    // Calculate averages and format hourly data
    const hourlyData: HourlyStats[] = [];
    for (let h = 0; h < 24; h++) {
      const stats = hourlyStats.get(h)!;
      hourlyData.push({
        hour: h,
        label: formatHourLabel(h),
        entryCount: stats.entryCount,
        exitCount: stats.exitCount,
        entryPnL: Math.round(stats.entryPnL * 100) / 100,
        exitPnL: Math.round(stats.exitPnL * 100) / 100,
        avgEntryPnL: stats.entryCount > 0
          ? Math.round((stats.entryPnL / stats.entryCount) * 100) / 100
          : 0,
        avgExitPnL: stats.exitCount > 0
          ? Math.round((stats.exitPnL / stats.exitCount) * 100) / 100
          : 0,
      });
    }

    // Calculate median helper
    const calculateMedian = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // Calculate average helper
    const calculateAverage = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    // Build hold time distribution in order
    const holdTimeRangeOrder = [
      'Same day', '1 day', '2-3 days', '4-7 days', '1-2 weeks',
      '2-4 weeks', '1-2 months', '2-3 months', '3+ months'
    ];

    const holdTimeDistribution = holdTimeRangeOrder
      .map(range => {
        const entry = holdTimeDistMap.get(range);
        if (!entry) return { range, winCount: 0, lossCount: 0, totalPnL: 0 };
        return {
          range,
          winCount: entry.winCount,
          lossCount: entry.lossCount,
          totalPnL: Math.round(entry.totalPnL * 100) / 100,
        };
      })
      .filter(d => d.winCount > 0 || d.lossCount > 0);

    const allHoldTimes = [...holdTimesWinners, ...holdTimesLosers];

    const holdTimeStats: HoldTimeStats = {
      avgHoldDaysWinners: Math.round(calculateAverage(holdTimesWinners) * 10) / 10,
      avgHoldDaysLosers: Math.round(calculateAverage(holdTimesLosers) * 10) / 10,
      avgHoldDaysAll: Math.round(calculateAverage(allHoldTimes) * 10) / 10,
      medianHoldDaysWinners: calculateMedian(holdTimesWinners),
      medianHoldDaysLosers: calculateMedian(holdTimesLosers),
      holdTimeDistribution,
    };

    return apiJson({
      data: {
        hourlyStats: hourlyData,
        holdTimeStats,
        meta: {
          totalTrades: closes.length,
          tradesWithTime,
          tradesWithEntryTime,
          tradesWithExitTime,
          percentWithTime: closes.length > 0
            ? Math.round((tradesWithTime / closes.length) * 100)
            : 0,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch time analytics:', error);
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch time analytics' },
      { status: 500 }
    );
  }
}

