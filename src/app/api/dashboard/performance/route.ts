import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Performance API route handler.
 *
 * Returns performance metrics:
 * - Top performers (best P&L by symbol)
 * - Needs improvement (worst P&L by symbol)
 * - Monthly breakdown
 * - Extreme trades (biggest wins/losses)
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardPerformance } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
});

/**
 * GET /api/dashboard/performance
 *
 * Returns performance analytics for the dashboard.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching dashboard performance');

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
      log.info({ userId }, 'Returning sample dashboard performance');
      return apiJson({ data: sampleDashboardPerformance() });
    }

    const where: Prisma.RealizedCloseWhereInput = { userId };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    if (startDate || endDate) {
      where.closeDate = {};
      if (startDate) where.closeDate.gte = startDate;
      if (endDate) where.closeDate.lte = endDate;
    }

    // Parallel queries:
    // 1. Main aggregation data (minimal fields for symbol/monthly grouping)
    // 2. Top 5 biggest wins (separate efficient query)
    // 3. Top 5 biggest losses (separate efficient query)
    const [closes, biggestWinsRaw, biggestLossesRaw] = await Promise.all([
      // Main query - only fields needed for aggregation
      prisma.realizedClose.findMany({
        where,
        select: {
          symbol: true,
          closeType: true,
          realizedPnL: true,
          closeDate: true,
          openAmount: true,
          hasUnknownBasis: true,
        },
      }),

      // Biggest wins - efficient query with limit
      prisma.realizedClose.findMany({
        where: { ...where, realizedPnL: { gt: 0 } },
        select: {
          id: true,
          symbol: true,
          closeType: true,
          realizedPnL: true,
          closeDate: true,
        },
        orderBy: { realizedPnL: 'desc' },
        take: 5,
      }),

      // Biggest losses - efficient query with limit
      prisma.realizedClose.findMany({
        where: { ...where, realizedPnL: { lt: 0 } },
        select: {
          id: true,
          symbol: true,
          closeType: true,
          realizedPnL: true,
          closeDate: true,
        },
        orderBy: { realizedPnL: 'asc' },
        take: 5,
      }),
    ]);

    // Convert Decimals for main data
    const closesData = closes.map(c => ({
      symbol: c.symbol,
      closeType: c.closeType,
      realizedPnL: c.realizedPnL.toNumber(),
      closeDate: c.closeDate,
      openAmount: c.openAmount.toNumber(),
      hasUnknownBasis: c.hasUnknownBasis,
    }));

    // Group by symbol for performance
    const symbolPerformance = new Map<string, { pnl: number; trades: number; wins: number }>();

    for (const close of closesData) {
      const existing = symbolPerformance.get(close.symbol) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += close.realizedPnL;
      existing.trades += 1;
      if (close.realizedPnL > 0 && !close.hasUnknownBasis) {
        existing.wins += 1;
      }
      symbolPerformance.set(close.symbol, existing);
    }

    // Sort for top/bottom performers
    const symbolArray = Array.from(symbolPerformance.entries()).map(([symbol, data]) => ({
      symbol,
      totalPnL: Math.round(data.pnl * 100) / 100,
      tradeCount: data.trades,
      winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
    }));

    // Top performers: Only include symbols with positive total P&L
    const topPerformers = [...symbolArray]
      .filter(s => s.totalPnL > 0)
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 5);

    // Needs improvement: Only include symbols with negative total P&L
    const needsImprovement = [...symbolArray]
      .filter(s => s.totalPnL < 0)
      .sort((a, b) => a.totalPnL - b.totalPnL)
      .slice(0, 5);

    // Monthly breakdown with separate stats for stocks and options
    interface MonthlyStats {
      pnl: number;
      trades: number;
      wins: number;
      losses: number;
      stockOpenAmount: number;
      stockCount: number;
      optionOpenAmount: number;
      optionCount: number;
    }

    const monthlyData = new Map<string, MonthlyStats>();

    for (const close of closesData) {
      const monthKey = close.closeDate.toISOString().substring(0, 7); // YYYY-MM
      const existing = monthlyData.get(monthKey) || {
        pnl: 0, trades: 0, wins: 0, losses: 0,
        stockOpenAmount: 0, stockCount: 0, optionOpenAmount: 0, optionCount: 0
      };
      existing.pnl += close.realizedPnL;
      existing.trades += 1;
      if (!close.hasUnknownBasis) {
        // Use pre-calculated openAmount which includes 100x multiplier for options
        const tradeSize = Math.abs(close.openAmount);
        if (close.closeType !== 'option') {
          existing.stockOpenAmount += tradeSize;
          existing.stockCount += 1;
        } else {
          existing.optionOpenAmount += tradeSize;
          existing.optionCount += 1;
        }
        if (close.realizedPnL > 0) existing.wins += 1;
        else if (close.realizedPnL < 0) existing.losses += 1;
      }
      monthlyData.set(monthKey, existing);
    }

    const monthlyBreakdown = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        totalPnL: Math.round(data.pnl * 100) / 100,
        tradeCount: data.trades,
        wins: data.wins,
        losses: data.losses,
        winRate: (data.wins + data.losses) > 0
          ? Math.round((data.wins / (data.wins + data.losses)) * 10000) / 100
          : 0,
        avgTradeSizeStock: data.stockCount > 0
          ? Math.round((data.stockOpenAmount / data.stockCount) * 100) / 100
          : 0,
        avgTradeSizeOption: data.optionCount > 0
          ? Math.round((data.optionOpenAmount / data.optionCount) * 100) / 100
          : 0,
        stockTradeCount: data.stockCount,
        optionTradeCount: data.optionCount,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // Extreme trades (already fetched efficiently with limit)
    const biggestWins = biggestWinsRaw.map(c => ({
      id: c.id,
      symbol: c.symbol,
      type: c.closeType,
      pnl: c.realizedPnL.toNumber(),
      date: c.closeDate.toISOString().split('T')[0],
    }));

    const biggestLosses = biggestLossesRaw.map(c => ({
      id: c.id,
      symbol: c.symbol,
      type: c.closeType,
      pnl: c.realizedPnL.toNumber(),
      date: c.closeDate.toISOString().split('T')[0],
    }));

    log.info({ userId }, 'Dashboard performance fetched');

    return apiJson({
      data: {
        topPerformers,
        needsImprovement,
        monthlyBreakdown,
        extremeTrades: {
          biggestWins,
          biggestLosses,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch dashboard performance');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch performance' },
      { status: 500 }
    );
  }
}

