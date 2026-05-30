import { apiJson } from '@/lib/api/response';
/**
 * Income Wheel Strategy API
 *
 * Treats the wheel strategy as an income-generating business:
 * - Weekly/monthly/annualized premium yields
 * - Cost basis evolution tracking (effective buy price after premiums)
 * - 52-week rolling income history for charts
 * - Position management with DTE and yield metrics
 *
 * Mental Model: Premium is income, assignments are inventory acquisition events
 *
 * GET /api/dashboard/income-wheel
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardIncomeWheel } from '@/lib/dashboard/sample-data';

// ============================================================================
// Types
// ============================================================================

interface WeeklyPremium {
  weekStart: string;
  weekEnd: string;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface MonthlyPremium {
  month: string;
  year: number;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface StockHolding {
  symbol: string;
  shares: number;
  acquisitionDate: string;
  acquisitionPrice: number; // Strike price at assignment
  totalPremiumCollected: number; // CSP + CC premiums
  effectiveCostBasis: number; // acquisitionPrice - premiums
  currentCCStrike: number | null; // Active CC strike if any
  ccPremiumPending: number;
}

interface ActivePosition {
  id: string;
  ledgerEventId: string | null;
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: number;
  expiration: string;
  dte: number;
  quantity: number;
  premium: number;
  collateral: number;
  yieldOnCollateral: number;
  annualizedYield: number;
  entryDate: string;
  underlyingPrice?: number;
}

interface IncomeMetrics {
  totalPremiumRealized: number;
  totalPremiumPending: number;
  totalCollateralAtRisk: number;

  // Time-based metrics
  premiumLast7Days: number;
  premiumLast30Days: number;
  premiumLast90Days: number;
  premiumYTD: number;
  premium52Weeks: number;

  // Yield calculations
  yieldOnCollateral: number; // pending / collateral
  annualizedYield: number; // Based on average holding period
  weeklyAvgPremium: number;
  monthlyAvgPremium: number;

  // Trade stats
  totalTrades: number;
  winRate: number;
  avgPremiumPerTrade: number;
  avgDTE: number;

  // Strategy breakdown
  ccPremiumRealized: number;
  cspPremiumRealized: number;
  ccCount: number;
  cspCount: number;
}

// ============================================================================
// Query Schema
// ============================================================================

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateDTE(expiration: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiration);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching wheel strategy v2 data');

    // Parse query
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample income wheel dashboard data');
      return apiJson({ data: sampleDashboardIncomeWheel() });
    }

    // Build where clauses
    const wheelWhere: Prisma.RealizedCloseWhereInput = {
      userId,
      OR: [
        { strategy: { in: ['covered_call', 'cash_secured_put'] } },
        { side: 'short', isWheelTrade: true },
      ],
    };

    const positionWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      positionType: 'option',
      side: 'short',
    };

    if (brokerageAccountId) {
      wheelWhere.brokerageAccountId = brokerageAccountId;
      positionWhere.brokerageAccountId = brokerageAccountId;
    }

    // Fetch all data in parallel
    const [closedTrades, openPositions, stockPositions] = await Promise.all([
      // All closed wheel trades
      prisma.realizedClose.findMany({
        where: wheelWhere,
        select: {
          id: true,
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          closeDate: true,
          openDate: true,
          quantity: true,
          realizedPnL: true,
          strategy: true,
          side: true,
          closeReason: true,
          openPrice: true,
          closePrice: true,
        },
        orderBy: { closeDate: 'desc' },
      }),

      // Open short option positions
      prisma.derivedPosition.findMany({
        where: positionWhere,
        select: {
          id: true,
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          quantity: true,
          costBasis: true,
          avgPrice: true,
          firstEntryDate: true,
          strategy: true,
          ledgerLinks: {
            where: { openEventId: { not: null } },
            select: { openEventId: true },
            take: 1,
          },
        },
        orderBy: { expiration: 'asc' },
      }),

      // Stock positions (for cost basis tracking)
      prisma.derivedPosition.findMany({
        where: {
          userId,
          positionType: 'stock',
          side: 'long',
          ...(brokerageAccountId ? { brokerageAccountId } : {}),
        },
        select: {
          id: true,
          symbol: true,
          quantity: true,
          costBasis: true,
          avgPrice: true,
          firstEntryDate: true,
        },
      }),
    ]);

    // =========================================================================
    // Calculate Income Metrics
    // =========================================================================

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const last52Weeks = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Separate by strategy
    const ccTrades = closedTrades.filter(
      t => t.strategy === 'covered_call' || (t.optionType === 'call' && t.side === 'short')
    );
    const cspTrades = closedTrades.filter(
      t => t.strategy === 'cash_secured_put' || (t.optionType === 'put' && t.side === 'short')
    );

    // Calculate premium totals
    const totalPremiumRealized = closedTrades.reduce(
      (sum, t) => sum + t.realizedPnL.toNumber(), 0
    );
    const ccPremiumRealized = ccTrades.reduce(
      (sum, t) => sum + t.realizedPnL.toNumber(), 0
    );
    const cspPremiumRealized = cspTrades.reduce(
      (sum, t) => sum + t.realizedPnL.toNumber(), 0
    );

    // Time-filtered premiums
    const premiumLast7Days = closedTrades
      .filter(t => t.closeDate >= last7Days)
      .reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0);
    const premiumLast30Days = closedTrades
      .filter(t => t.closeDate >= last30Days)
      .reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0);
    const premiumLast90Days = closedTrades
      .filter(t => t.closeDate >= last90Days)
      .reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0);
    const premiumYTD = closedTrades
      .filter(t => t.closeDate >= yearStart)
      .reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0);
    const premium52Weeks = closedTrades
      .filter(t => t.closeDate >= last52Weeks)
      .reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0);

    // Open positions metrics
    const totalPremiumPending = openPositions.reduce(
      (sum, p) => sum + Math.abs(p.costBasis.toNumber()), 0
    );

    // Calculate collateral
    let totalCollateralAtRisk = 0;
    const activePositionsData: ActivePosition[] = openPositions.map(p => {
      const strike = p.strike?.toNumber() || 0;
      const qty = Math.abs(p.quantity.toNumber());
      const collateral = strike * 100 * qty;
      totalCollateralAtRisk += collateral;

      const premium = Math.abs(p.costBasis.toNumber());
      const dte = p.expiration ? calculateDTE(p.expiration) : 0;
      const yieldOnCollateral = collateral > 0 ? (premium / collateral) * 100 : 0;

      // Annualized: (premium/collateral) * (365/dte) * 100
      const effectiveDTE = Math.max(dte, 1);
      const annualizedYield = collateral > 0
        ? (premium / collateral) * (365 / effectiveDTE) * 100
        : 0;

      return {
        id: p.id,
        ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
        symbol: p.symbol,
        strategy: p.optionType === 'call' ? 'covered_call' : 'cash_secured_put',
        strike,
        expiration: p.expiration?.toISOString().split('T')[0] || '',
        dte,
        quantity: qty,
        premium: Math.round(premium * 100) / 100,
        collateral: Math.round(collateral * 100) / 100,
        yieldOnCollateral: Math.round(yieldOnCollateral * 100) / 100,
        annualizedYield: Math.round(annualizedYield * 100) / 100,
        entryDate: p.firstEntryDate.toISOString().split('T')[0],
      };
    });

    // Win rate
    const winCount = closedTrades.filter(t => t.realizedPnL.toNumber() > 0).length;
    const winRate = closedTrades.length > 0
      ? (winCount / closedTrades.length) * 100
      : 0;

    // Average DTE (from closed trades)
    const avgDTE = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => {
          if (!t.openDate || !t.closeDate) return sum;
          return sum + daysBetween(t.openDate, t.closeDate);
        }, 0) / closedTrades.length
      : 0;

    // Yield calculations
    const yieldOnCollateral = totalCollateralAtRisk > 0
      ? (totalPremiumPending / totalCollateralAtRisk) * 100
      : 0;

    // Calculate weekly average (over last 52 weeks)
    const weeksOfData = Math.min(52, Math.ceil(daysBetween(last52Weeks, now) / 7));
    const weeklyAvgPremium = weeksOfData > 0 ? premium52Weeks / weeksOfData : 0;
    const monthlyAvgPremium = weeklyAvgPremium * 4.33;

    // Annualized yield based on current collateral and weekly avg
    const annualizedYield = totalCollateralAtRisk > 0
      ? ((weeklyAvgPremium * 52) / totalCollateralAtRisk) * 100
      : 0;

    const incomeMetrics: IncomeMetrics = {
      totalPremiumRealized: Math.round(totalPremiumRealized * 100) / 100,
      totalPremiumPending: Math.round(totalPremiumPending * 100) / 100,
      totalCollateralAtRisk: Math.round(totalCollateralAtRisk * 100) / 100,
      premiumLast7Days: Math.round(premiumLast7Days * 100) / 100,
      premiumLast30Days: Math.round(premiumLast30Days * 100) / 100,
      premiumLast90Days: Math.round(premiumLast90Days * 100) / 100,
      premiumYTD: Math.round(premiumYTD * 100) / 100,
      premium52Weeks: Math.round(premium52Weeks * 100) / 100,
      yieldOnCollateral: Math.round(yieldOnCollateral * 100) / 100,
      annualizedYield: Math.round(annualizedYield * 100) / 100,
      weeklyAvgPremium: Math.round(weeklyAvgPremium * 100) / 100,
      monthlyAvgPremium: Math.round(monthlyAvgPremium * 100) / 100,
      totalTrades: closedTrades.length,
      winRate: Math.round(winRate * 100) / 100,
      avgPremiumPerTrade: closedTrades.length > 0
        ? Math.round((totalPremiumRealized / closedTrades.length) * 100) / 100
        : 0,
      avgDTE: Math.round(avgDTE * 10) / 10,
      ccPremiumRealized: Math.round(ccPremiumRealized * 100) / 100,
      cspPremiumRealized: Math.round(cspPremiumRealized * 100) / 100,
      ccCount: ccTrades.length,
      cspCount: cspTrades.length,
    };

    // =========================================================================
    // Weekly Premium History (last 52 weeks)
    // =========================================================================

    const weeklyPremiumMap = new Map<string, WeeklyPremium>();

    // Initialize last 52 weeks
    for (let i = 0; i < 52; i++) {
      const weekStart = getWeekStart(new Date(today.getTime() - i * 7 * 24 * 60 * 60 * 1000));
      const weekEnd = getWeekEnd(weekStart);
      const key = formatDate(weekStart);
      weeklyPremiumMap.set(key, {
        weekStart: key,
        weekEnd: formatDate(weekEnd),
        premium: 0,
        tradeCount: 0,
        ccPremium: 0,
        cspPremium: 0,
      });
    }

    // Populate with actual data
    for (const trade of closedTrades) {
      if (trade.closeDate < last52Weeks) continue;

      const weekStart = getWeekStart(trade.closeDate);
      const key = formatDate(weekStart);
      const week = weeklyPremiumMap.get(key);

      if (week) {
        const premium = trade.realizedPnL.toNumber();
        week.premium += premium;
        week.tradeCount += 1;

        const isCC = trade.strategy === 'covered_call' ||
          (trade.optionType === 'call' && trade.side === 'short');
        if (isCC) {
          week.ccPremium += premium;
        } else {
          week.cspPremium += premium;
        }
      }
    }

    const weeklyPremiumHistory = Array.from(weeklyPremiumMap.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map(w => ({
        ...w,
        premium: Math.round(w.premium * 100) / 100,
        ccPremium: Math.round(w.ccPremium * 100) / 100,
        cspPremium: Math.round(w.cspPremium * 100) / 100,
      }));

    // =========================================================================
    // Monthly Premium History
    // =========================================================================

    const monthlyPremiumMap = new Map<string, MonthlyPremium>();

    for (const trade of closedTrades) {
      const month = trade.closeDate.getMonth();
      const year = trade.closeDate.getFullYear();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      const existing = monthlyPremiumMap.get(key) || {
        month: key,
        year,
        premium: 0,
        tradeCount: 0,
        ccPremium: 0,
        cspPremium: 0,
      };

      const premium = trade.realizedPnL.toNumber();
      existing.premium += premium;
      existing.tradeCount += 1;

      const isCC = trade.strategy === 'covered_call' ||
        (trade.optionType === 'call' && trade.side === 'short');
      if (isCC) {
        existing.ccPremium += premium;
      } else {
        existing.cspPremium += premium;
      }

      monthlyPremiumMap.set(key, existing);
    }

    const monthlyPremiumHistory = Array.from(monthlyPremiumMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12) // Last 12 months
      .map(m => ({
        ...m,
        premium: Math.round(m.premium * 100) / 100,
        ccPremium: Math.round(m.ccPremium * 100) / 100,
        cspPremium: Math.round(m.cspPremium * 100) / 100,
      }));

    // =========================================================================
    // Stock Holdings with Cost Basis Evolution
    // =========================================================================

    const stockHoldings: StockHolding[] = [];

    // Find stocks acquired through CSP assignments
    const cspAssignments = closedTrades.filter(
      t => (t.strategy === 'cash_secured_put' || t.optionType === 'put') &&
           t.closeReason === 'assigned'
    );

    for (const assignment of cspAssignments) {
      const symbol = assignment.symbol;

      // Check if we still hold this stock
      const stockPos = stockPositions.find(s => s.symbol === symbol);
      if (!stockPos) continue;

      // Calculate total premium from all wheel trades on this symbol
      const symbolTrades = closedTrades.filter(t => t.symbol === symbol);
      const totalPremiumCollected = symbolTrades.reduce(
        (sum, t) => sum + t.realizedPnL.toNumber(), 0
      );

      // Find active CC on this symbol
      const activeCC = activePositionsData.find(
        p => p.symbol === symbol && p.strategy === 'covered_call'
      );

      const acquisitionPrice = assignment.strike?.toNumber() || 0;
      const shares = Math.abs(stockPos.quantity.toNumber());

      stockHoldings.push({
        symbol,
        shares,
        acquisitionDate: assignment.closeDate.toISOString().split('T')[0],
        acquisitionPrice,
        totalPremiumCollected: Math.round(totalPremiumCollected * 100) / 100,
        effectiveCostBasis: Math.round((acquisitionPrice * shares - totalPremiumCollected) / shares * 100) / 100,
        currentCCStrike: activeCC?.strike || null,
        ccPremiumPending: activeCC?.premium || 0,
      });
    }

    // =========================================================================
    // Recent Trades
    // =========================================================================

    const recentTrades = closedTrades.slice(0, 20).map(t => ({
      id: t.id,
      symbol: t.symbol,
      strategy: t.optionType === 'call' ? 'covered_call' : 'cash_secured_put',
      strike: t.strike?.toNumber() || 0,
      expiration: t.expiration?.toISOString().split('T')[0] || '',
      openDate: t.openDate.toISOString().split('T')[0],
      closeDate: t.closeDate.toISOString().split('T')[0],
      closeReason: t.closeReason,
      premium: Math.round(t.realizedPnL.toNumber() * 100) / 100,
      daysHeld: daysBetween(t.openDate, t.closeDate),
    }));

    // =========================================================================
    // Symbol Performance Summary
    // =========================================================================

    const symbolMap = new Map<string, {
      premium: number;
      trades: number;
      ccCount: number;
      cspCount: number;
      assignments: number;
      avgPremium: number;
    }>();

    for (const trade of closedTrades) {
      const existing = symbolMap.get(trade.symbol) || {
        premium: 0,
        trades: 0,
        ccCount: 0,
        cspCount: 0,
        assignments: 0,
        avgPremium: 0,
      };

      const isCC = trade.strategy === 'covered_call' ||
        (trade.optionType === 'call' && trade.side === 'short');

      existing.premium += trade.realizedPnL.toNumber();
      existing.trades += 1;
      existing.ccCount += isCC ? 1 : 0;
      existing.cspCount += isCC ? 0 : 1;
      existing.assignments += trade.closeReason === 'assigned' ? 1 : 0;

      symbolMap.set(trade.symbol, existing);
    }

    const symbolPerformance = Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        premium: Math.round(data.premium * 100) / 100,
        trades: data.trades,
        ccCount: data.ccCount,
        cspCount: data.cspCount,
        assignments: data.assignments,
        avgPremium: Math.round((data.premium / data.trades) * 100) / 100,
      }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 15);

    // =========================================================================
    // Response
    // =========================================================================

    log.info({
      userId,
      totalTrades: closedTrades.length,
      openPositions: openPositions.length,
    }, 'Wheel v2 data fetched successfully');

    return apiJson({
      data: {
        incomeMetrics,
        activePositions: activePositionsData,
        weeklyPremiumHistory,
        monthlyPremiumHistory,
        stockHoldings,
        recentTrades,
        symbolPerformance,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch wheel v2 data');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch wheel strategy data',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

