import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Trade Metrics API route handler.
 *
 * Returns average trade size and volume metrics across different timeframes:
 * - Daily, Weekly, Monthly, Quarterly averages
 * - Custom date range support
 * - Stocks vs Options breakdown
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardTradeMetrics } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

interface PeriodMetrics {
  avgTradeSize: {
    stock: number;
    option: number;
    total: number;
  };
  volume: {
    capitalDeployed: {
      stock: number;
      option: number;
      total: number;
    };
    capitalReturned: {
      stock: number;
      option: number;
      total: number;
    };
    totalTraded: number;
  };
  tradeCount: {
    stock: number;
    option: number;
    total: number;
  };
}

interface TimeframeData {
  daily: PeriodMetrics;
  weekly: PeriodMetrics;
  monthly: PeriodMetrics;
  quarterly: PeriodMetrics;
  ytd: PeriodMetrics;
  last12m: PeriodMetrics;
  lastyear: PeriodMetrics;
  customRange: PeriodMetrics | null;
}

/**
 * Calculate metrics for a set of closes
 */
function calculateMetrics(closes: Array<{
  openAmount: number;
  closeAmount: number;
  closeType: string;
  hasUnknownBasis: boolean;
}>): PeriodMetrics {
  let stockDeployed = 0;
  let stockReturned = 0;
  let stockCount = 0;
  let optionDeployed = 0;
  let optionReturned = 0;
  let optionCount = 0;

  for (const close of closes) {
    if (close.hasUnknownBasis) continue;

    const deployed = Math.abs(close.openAmount);
    const returned = Math.abs(close.closeAmount);

    if (close.closeType !== 'option') {
      stockDeployed += deployed;
      stockReturned += returned;
      stockCount += 1;
    } else {
      optionDeployed += deployed;
      optionReturned += returned;
      optionCount += 1;
    }
  }

  const totalCount = stockCount + optionCount;
  const totalDeployed = stockDeployed + optionDeployed;
  const totalReturned = stockReturned + optionReturned;

  return {
    avgTradeSize: {
      stock: stockCount > 0 ? Math.round((stockDeployed / stockCount) * 100) / 100 : 0,
      option: optionCount > 0 ? Math.round((optionDeployed / optionCount) * 100) / 100 : 0,
      total: totalCount > 0 ? Math.round((totalDeployed / totalCount) * 100) / 100 : 0,
    },
    volume: {
      capitalDeployed: {
        stock: Math.round(stockDeployed * 100) / 100,
        option: Math.round(optionDeployed * 100) / 100,
        total: Math.round(totalDeployed * 100) / 100,
      },
      capitalReturned: {
        stock: Math.round(stockReturned * 100) / 100,
        option: Math.round(optionReturned * 100) / 100,
        total: Math.round(totalReturned * 100) / 100,
      },
      totalTraded: Math.round((totalDeployed + totalReturned) * 100) / 100,
    },
    tradeCount: {
      stock: stockCount,
      option: optionCount,
      total: totalCount,
    },
  };
}

/**
 * Get the start of a period
 */
function getPeriodStart(periodType: 'day' | 'week' | 'month' | 'quarter' | 'ytd' | 'last12m'): Date {
  const now = new Date();

  switch (periodType) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diff);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterMonth, 1);
    }
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    case 'last12m':
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

/**
 * Get the date range for the previous calendar year
 */
function getLastYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  return {
    start: new Date(lastYear, 0, 1), // Jan 1
    end: new Date(lastYear, 11, 31, 23, 59, 59, 999), // Dec 31
  };
}

/**
 * GET /api/dashboard/trade-metrics
 *
 * Returns trade size and volume analytics.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching trade metrics');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard trade metrics');
      return apiJson({ data: sampleDashboardTradeMetrics() });
    }

    // Base where clause
    const where: Prisma.RealizedCloseWhereInput = { userId };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    // Fetch all closes for the user (we'll filter by date in memory for different periods)
    const allCloses = await prisma.realizedClose.findMany({
      where,
      select: {
        id: true,
        closeType: true,
        openAmount: true,
        closeAmount: true,
        closeDate: true,
        hasUnknownBasis: true,
      },
      orderBy: { closeDate: 'desc' },
    });

    // Convert Decimals
    const closesData = allCloses.map(c => ({
      ...c,
      openAmount: c.openAmount.toNumber(),
      closeAmount: c.closeAmount.toNumber(),
    }));

    const now = new Date();

    // Filter closes for each timeframe
    const dayStart = getPeriodStart('day');
    const weekStart = getPeriodStart('week');
    const monthStart = getPeriodStart('month');
    const quarterStart = getPeriodStart('quarter');
    const ytdStart = getPeriodStart('ytd');
    const last12mStart = getPeriodStart('last12m');
    const lastYearRange = getLastYearRange();

    const dailyCloses = closesData.filter(c => c.closeDate >= dayStart);
    const weeklyCloses = closesData.filter(c => c.closeDate >= weekStart);
    const monthlyCloses = closesData.filter(c => c.closeDate >= monthStart);
    const quarterlyCloses = closesData.filter(c => c.closeDate >= quarterStart);
    const ytdCloses = closesData.filter(c => c.closeDate >= ytdStart);
    const last12mCloses = closesData.filter(c => c.closeDate >= last12mStart);
    const lastyearCloses = closesData.filter(
      c => c.closeDate >= lastYearRange.start && c.closeDate <= lastYearRange.end
    );

    // Calculate metrics for each timeframe
    const timeframeData: TimeframeData = {
      daily: calculateMetrics(dailyCloses),
      weekly: calculateMetrics(weeklyCloses),
      monthly: calculateMetrics(monthlyCloses),
      quarterly: calculateMetrics(quarterlyCloses),
      ytd: calculateMetrics(ytdCloses),
      last12m: calculateMetrics(last12mCloses),
      lastyear: calculateMetrics(lastyearCloses),
      customRange: null,
    };

    // Calculate custom range if provided
    if (startDate && endDate) {
      const customStart = new Date(startDate);
      const customEnd = new Date(endDate);
      customEnd.setHours(23, 59, 59, 999);

      const customCloses = closesData.filter(
        c => c.closeDate >= customStart && c.closeDate <= customEnd
      );
      timeframeData.customRange = calculateMetrics(customCloses);
    }

    // Also calculate all-time metrics for comparison
    const allTimeMetrics = calculateMetrics(closesData);

    // Calculate period labels
    const periodLabels = {
      daily: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      weekly: `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      monthly: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      quarterly: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      ytd: `${now.getFullYear()} Year to Date`,
      last12m: 'Last 12 Months',
      lastyear: `${now.getFullYear() - 1}`,
    };

    log.info({ userId }, 'Trade metrics fetched');

    return apiJson({
      data: {
        timeframes: timeframeData,
        allTime: allTimeMetrics,
        periodLabels,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch trade metrics');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch trade metrics' },
      { status: 500 }
    );
  }
}

