import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Stats API route handler.
 *
 * Handles:
 * - GET /api/dashboard/stats - Get dashboard statistics from derived tables
 *
 * Stats are derived from DerivedPosition, RealizedClose, and DailyAggregate.
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardStats } from '@/lib/dashboard/sample-data';

/**
 * Schema for stats query params.
 */
const statsQuerySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
});

/**
 * GET /api/dashboard/stats
 *
 * Get dashboard statistics for the authenticated user.
 *
 * Query parameters:
 * - brokerageAccountId: Filter by account (optional, omit for all accounts)
 * - startDate: Filter from date (ISO string)
 * - endDate: Filter to date (ISO string)
 *
 * @returns Dashboard statistics including P&L, win rate, positions, etc.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching dashboard stats');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = statsQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      log.warn({ errors: validatedQuery.error.flatten() }, 'Invalid query parameters');
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validatedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate } = validatedQuery.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard stats');
      return apiJson({ data: sampleDashboardStats() });
    }

    // Build base where clauses - DerivedPosition.brokerageAccountId is NOT nullable
    const positionWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      quantity: { gt: 0 },
    };

    // RealizedClose.brokerageAccountId IS nullable (null = all-accounts)
    const closeWhere: Prisma.RealizedCloseWhereInput = {
      userId,
    };

    // DailyAggregate.brokerageAccountId IS nullable (null = all-accounts rollup)
    const dailyWhere: Prisma.DailyAggregateWhereInput = {
      userId,
    };

    if (brokerageAccountId) {
      // Filter by specific account
      positionWhere.brokerageAccountId = brokerageAccountId;
      closeWhere.brokerageAccountId = brokerageAccountId;
      dailyWhere.brokerageAccountId = brokerageAccountId;
    } else {
      // For all-accounts view:
      // - Positions: don't filter by account (aggregate all)
      // - Closes: don't filter by account (aggregate all)
      // - Daily: use null for all-accounts rollup (DailyAggregate has nullable brokerageAccountId)
      dailyWhere.brokerageAccountId = null;
    }

    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      closeWhere.closeDate = dateFilter;
      dailyWhere.date = dateFilter;
    }

    // Use database aggregates instead of fetching all rows
    // 7 parallel aggregate queries (no row transfer, just numbers)
    const knownBasisWhere = { ...closeWhere, hasUnknownBasis: false };

    const [
      openPositionCount,
      totalStats,
      winStats,
      lossStats,
      stockStats,
      optionStats,
      dailyData,
    ] = await Promise.all([
      // 1. Open positions count
      prisma.derivedPosition.count({ where: positionWhere }),

      // 2. Total P&L and count (all closes)
      prisma.realizedClose.aggregate({
        where: closeWhere,
        _sum: { realizedPnL: true },
        _count: true,
      }),

      // 3. Win stats (positive P&L, known basis)
      prisma.realizedClose.aggregate({
        where: { ...knownBasisWhere, realizedPnL: { gt: 0 } },
        _sum: { realizedPnL: true },
        _count: true,
      }),

      // 4. Loss stats (negative P&L, known basis)
      prisma.realizedClose.aggregate({
        where: { ...knownBasisWhere, realizedPnL: { lt: 0 } },
        _sum: { realizedPnL: true },
        _count: true,
      }),

      // 5. Stock trade sizes (known basis only)
      prisma.realizedClose.aggregate({
        where: { ...knownBasisWhere, closeType: { in: ['stock', 'future'] } },
        _sum: { openAmount: true },
        _count: true,
      }),

      // 6. Option trade sizes (known basis only)
      prisma.realizedClose.aggregate({
        where: { ...knownBasisWhere, closeType: 'option' },
        _sum: { openAmount: true },
        _count: true,
      }),

      // 7. Daily aggregates for chart
      prisma.dailyAggregate.findMany({
        where: dailyWhere,
        orderBy: { date: 'asc' },
        select: {
          date: true,
          realizedPnL: true,
          tradeCount: true,
          winCount: true,
        },
      }),
    ]);

    // Extract values from aggregates
    const totalPnL = totalStats._sum.realizedPnL?.toNumber() ?? 0;
    const closedTradeCount = totalStats._count;
    const winCount = winStats._count;
    const lossCount = lossStats._count;
    const winSum = winStats._sum.realizedPnL?.toNumber() ?? 0;
    const lossSum = lossStats._sum.realizedPnL?.toNumber() ?? 0;
    const stockCount = stockStats._count;
    const optionCount = optionStats._count;
    const stockOpenAmount = Math.abs(stockStats._sum.openAmount?.toNumber() ?? 0);
    const optionOpenAmount = Math.abs(optionStats._sum.openAmount?.toNumber() ?? 0);
    const avgWinValue = winCount > 0 ? winSum / winCount : 0;
    const avgLossValue = lossCount > 0 ? lossSum / lossCount : 0;
    const profitFactor = avgLossValue !== 0 ? Math.abs(avgWinValue / avgLossValue) : avgWinValue > 0 ? Infinity : 0;

    const avgTradeSizeStock = stockCount > 0 ? stockOpenAmount / stockCount : 0;
    const avgTradeSizeOption = optionCount > 0 ? optionOpenAmount / optionCount : 0;

    const knownBasisCount = winCount + lossCount;
    const winRate = knownBasisCount > 0 ? (winCount / knownBasisCount) * 100 : 0;

    // Format daily data and compute cumulative P&L
    let cumulativePnL = 0;
    const chartData = dailyData.map(d => {
      const dailyPnL = d.realizedPnL.toNumber();
      cumulativePnL += dailyPnL;
      return {
        date: d.date.toISOString().split('T')[0],
        realizedPnL: dailyPnL,
        cumulativePnL,
        tradeCount: d.tradeCount,
        winCount: d.winCount,
        dailyWinRate: d.tradeCount > 0 ? (d.winCount / d.tradeCount) * 100 : 0,
      };
    });

    log.info({ userId }, 'Dashboard stats fetched successfully');

    return apiJson({
      data: {
        // Summary cards
        totalPnL: Math.round(totalPnL * 100) / 100,
        openPositions: openPositionCount,
        closedTrades: closedTradeCount,
        winRate: Math.round(winRate * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        avgWin: Math.round(avgWinValue * 100) / 100,
        avgLoss: Math.round(avgLossValue * 100) / 100,
        avgTradeSizeStock: Math.round(avgTradeSizeStock * 100) / 100,
        avgTradeSizeOption: Math.round(avgTradeSizeOption * 100) / 100,
        stockTradeCount: stockCount,
        optionTradeCount: optionCount,
        totalVolumeStock: Math.round(stockOpenAmount * 100) / 100,
        totalVolumeOption: Math.round(optionOpenAmount * 100) / 100,

        // Breakdown
        wins: winCount,
        losses: lossCount,
        breakeven: closedTradeCount - winCount - lossCount,

        // Chart data
        chartData,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch dashboard stats');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch dashboard stats',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

