import { apiJson } from '@/lib/api/response';
/**
 * Real-Time Portfolio Data API
 *
 * GET /api/dashboard/realtime - Get real-time portfolio metrics from SnapTrade
 *
 * Returns:
 * - Total portfolio value and unrealized P&L
 * - Today's portfolio change
 * - Asset allocation breakdown
 * - Position health metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardRealtime } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
});

interface PositionHealth {
  symbol: string;
  positionType: 'stock' | 'option' | 'future';
  quantity: number;
  marketPrice: number | null;
  marketValue: number | null;
  avgCostBasis: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  priceChangeAbs: number | null;
  priceChangePct: number | null;
  // Option details
  optionType?: string | null;
  strike?: number | null;
  expiration?: string | null;
}

interface AllocationBreakdown {
  stocks: { value: number; count: number; percentage: number };
  options: { value: number; count: number; percentage: number };
  futures: { value: number; count: number; percentage: number };
  cash: { value: number; percentage: number };
}

interface RealtimePortfolioData {
  // Portfolio totals
  totalMarketValue: number;
  totalCash: number;
  totalBuyingPower: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPct: number;

  // Combined P&L
  realizedPnL: number;
  totalPnL: number; // realized + unrealized

  // Today's change (based on price changes since last sync)
  todaysChange: number;
  todaysChangePct: number;

  // Allocation breakdown
  allocation: AllocationBreakdown;

  // Position health
  positions: PositionHealth[];

  // Metadata
  lastSyncAt: string | null;
  positionCount: number;
  hasRealTimeData: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedQuery = querySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId } = validatedQuery.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample realtime dashboard data');
      return apiJson({ data: sampleDashboardRealtime() });
    }

    log.info({ userId, brokerageAccountId }, 'Fetching real-time portfolio data');

    // Build where clause for positions - only include active accounts
    const positionWhere = brokerageAccountId
      ? { userId, brokerageAccountId }
      : {
          userId,
          brokerageAccount: { isActive: true },
        };

    // Fetch broker positions, balances, and realized P&L in parallel
    const [brokerPositions, brokerBalances, realizedPnLResult] = await Promise.all([
      prisma.brokerPosition.findMany({
        where: positionWhere,
        orderBy: [
          { marketValue: 'desc' },
          { symbol: 'asc' },
        ],
      }),
      prisma.brokerBalance.findMany({
        where: brokerageAccountId
          ? { userId, brokerageAccountId }
          : { userId, brokerageAccount: { isActive: true } },
      }),
      // Get total realized P&L from RealizedClose
      prisma.realizedClose.aggregate({
        where: {
          userId,
          ...(brokerageAccountId ? { brokerageAccountId } : {}),
        },
        _sum: { realizedPnL: true },
      }),
    ]);

    // Check if we have real-time data
    const hasRealTimeData = brokerPositions.length > 0;

    // Calculate totals from broker positions
    let totalMarketValue = 0;
    let totalUnrealizedPnL = 0;
    let todaysChange = 0;
    let stockValue = 0;
    let optionValue = 0;
    let futureValue = 0;
    let stockCount = 0;
    let optionCount = 0;
    let futureCount = 0;

    const positions: PositionHealth[] = brokerPositions.map(pos => {
      const marketValue = pos.marketValue?.toNumber() ?? 0;
      const unrealizedPnL = pos.unrealizedPnL?.toNumber() ?? 0;
      const priceChangeAbs = pos.priceChangeAbs?.toNumber() ?? 0;
      const quantity = pos.quantity.toNumber();

      totalMarketValue += marketValue;
      totalUnrealizedPnL += unrealizedPnL;

      // Today's change = sum of (price change * quantity)
      todaysChange += priceChangeAbs * quantity;

      if (pos.positionType === 'stock') {
        stockValue += marketValue;
        stockCount++;
      } else if (pos.positionType === 'option') {
        optionValue += marketValue;
        optionCount++;
      } else if (pos.positionType === 'future') {
        futureValue += marketValue;
        futureCount++;
      } else {
        // Fallback to options bucket for unsupported types (e.g., crypto)
        optionValue += marketValue;
        optionCount++;
      }

      return {
        symbol: pos.symbol,
        positionType: pos.positionType as 'stock' | 'option' | 'future',
        quantity,
        marketPrice: pos.marketPrice?.toNumber() ?? null,
        marketValue: marketValue || null,
        avgCostBasis: pos.avgCostBasis?.toNumber() ?? null,
        unrealizedPnL: unrealizedPnL || null,
        unrealizedPnLPct: pos.unrealizedPnLPct?.toNumber() ?? null,
        priceChangeAbs: pos.priceChangeAbs?.toNumber() ?? null,
        priceChangePct: pos.priceChangePct?.toNumber() ?? null,
        optionType: pos.optionType,
        strike: pos.strike?.toNumber() ?? null,
        expiration: pos.expiration?.toISOString().split('T')[0] ?? null,
      };
    });

    // Calculate cash totals
    const totalCash = brokerBalances.reduce((sum, b) => sum + (b.cash?.toNumber() ?? 0), 0);
    const totalBuyingPower = brokerBalances.reduce((sum, b) => sum + (b.buyingPower?.toNumber() ?? 0), 0);

    // Total portfolio value includes cash
    const totalPortfolioValue = totalMarketValue + totalCash;

    // Calculate allocation percentages
    const allocation: AllocationBreakdown = {
      stocks: {
        value: stockValue,
        count: stockCount,
        percentage: totalPortfolioValue > 0 ? (stockValue / totalPortfolioValue) * 100 : 0,
      },
      options: {
        value: optionValue,
        count: optionCount,
        percentage: totalPortfolioValue > 0 ? (optionValue / totalPortfolioValue) * 100 : 0,
      },
      futures: {
        value: futureValue,
        count: futureCount,
        percentage: totalPortfolioValue > 0 ? (futureValue / totalPortfolioValue) * 100 : 0,
      },
      cash: {
        value: totalCash,
        percentage: totalPortfolioValue > 0 ? (totalCash / totalPortfolioValue) * 100 : 0,
      },
    };

    // Calculate overall unrealized P&L percentage
    const totalCostBasis = totalMarketValue - totalUnrealizedPnL;
    const totalUnrealizedPnLPct = totalCostBasis > 0
      ? (totalUnrealizedPnL / totalCostBasis) * 100
      : 0;

    // Today's change percentage
    const previousTotalValue = totalMarketValue - todaysChange;
    const todaysChangePct = previousTotalValue > 0
      ? (todaysChange / previousTotalValue) * 100
      : 0;

    // Get realized P&L
    const realizedPnL = realizedPnLResult._sum?.realizedPnL?.toNumber() ?? 0;

    // Combined P&L = realized + unrealized
    const totalPnL = realizedPnL + totalUnrealizedPnL;

    // Get last sync time
    const lastSync = brokerPositions.length > 0
      ? brokerPositions.reduce((latest, pos) => {
          const posSync = pos.lastSyncAt.getTime();
          return posSync > latest ? posSync : latest;
        }, 0)
      : null;

    const data: RealtimePortfolioData = {
      totalMarketValue,
      totalCash,
      totalBuyingPower,
      totalUnrealizedPnL,
      totalUnrealizedPnLPct: Math.round(totalUnrealizedPnLPct * 100) / 100,
      realizedPnL,
      totalPnL,
      todaysChange,
      todaysChangePct: Math.round(todaysChangePct * 100) / 100,
      allocation,
      positions,
      lastSyncAt: lastSync ? new Date(lastSync).toISOString() : null,
      positionCount: brokerPositions.length,
      hasRealTimeData,
    };

    log.info({
      userId,
      positionCount: brokerPositions.length,
      totalMarketValue,
      totalUnrealizedPnL,
      hasRealTimeData,
    }, 'Real-time portfolio data fetched');

    return apiJson({ data });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Failed to fetch real-time portfolio data');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch portfolio data' },
      { status: 500 }
    );
  }
}

