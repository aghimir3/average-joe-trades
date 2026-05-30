import { apiJson } from '@/lib/api/response';
/**
 * Wheel Strategy Dashboard API route handler.
 *
 * Handles:
 * - GET /api/dashboard/wheel - Get wheel strategy statistics
 *
 * Tracks covered calls and cash-secured puts for wheel strategy traders.
 * Includes both closed trades (realized P&L) and open positions (pending premium).
 *
 * Wheel strategy detection:
 * - Covered Call: STO (Sell to Open) a call option while owning the underlying
 * - Cash Secured Put: STO a put option with cash collateral
 *
 * Close types supported:
 * - OEXP (Option Expiration): Option expires worthless → full premium profit
 * - BTC (Buy to Close): Close early → profit = STO premium - BTC cost
 * - OASGN (Option Assignment): Assigned → full premium profit + stock transaction
 *
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardWheel } from '@/lib/dashboard/sample-data';

/**
 * Schema for wheel query params.
 */
const wheelQuerySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
});

// ============================================================================
// Types for Enhanced Wheel Analytics
// ============================================================================

interface WheelCycle {
  id: string;
  symbol: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'completed';
  // CSP leg
  cspTrade: {
    id: string;
    openDate: string;
    closeDate: string;
    strike: number;
    premium: number;
    closeReason: string;
  } | null;
  // Stock holding (after CSP assignment)
  stockAcquired: boolean;
  stockAcquisitionDate: string | null;
  stockAcquisitionPrice: number | null;
  // CC leg(s)
  ccTrades: Array<{
    id: string;
    openDate: string;
    closeDate: string;
    strike: number;
    premium: number;
    closeReason: string;
  }>;
  // Totals
  totalPremium: number;
  totalCycles: number; // Number of CC cycles on this stock
}

interface RollTrade {
  id: string;
  symbol: string;
  rollDate: string;
  // Original position
  originalStrike: number;
  originalExpiration: string;
  originalType: string; // 'Covered Call' or 'Cash Secured Put'
  closePremium: number; // Debit paid to close (negative = cost)
  // New position
  newStrike: number;
  newExpiration: string;
  newPremium: number; // Credit received for new position
  // Net
  netCredit: number; // Positive = credit, negative = debit
  rollType: 'up' | 'down' | 'out' | 'up_and_out' | 'down_and_out';
  daysExtended: number;
}

interface AssignmentStats {
  totalTrades: number;
  totalAssignments: number;
  assignmentRate: number;
  bySymbol: Array<{
    symbol: string;
    trades: number;
    assignments: number;
    assignmentRate: number;
    avgDaysToAssignment: number;
  }>;
  byStrikeDistance: Array<{
    range: string; // e.g., "0-5% OTM", "5-10% OTM"
    trades: number;
    assignments: number;
    assignmentRate: number;
  }>;
  avgDaysToAssignment: number;
  avgPremiumOnAssigned: number;
  avgPremiumOnExpired: number;
}

// ============================================================================
// Helper Functions for Enhanced Analytics
// ============================================================================

/**
 * Detect roll type based on strike and expiration changes.
 */
function detectRollType(
  originalStrike: number,
  newStrike: number,
  originalExpiration: Date,
  newExpiration: Date
): 'up' | 'down' | 'out' | 'up_and_out' | 'down_and_out' {
  const strikeUp = newStrike > originalStrike;
  const strikeDown = newStrike < originalStrike;
  const expirationOut = newExpiration > originalExpiration;

  if (strikeUp && expirationOut) return 'up_and_out';
  if (strikeDown && expirationOut) return 'down_and_out';
  if (strikeUp) return 'up';
  if (strikeDown) return 'down';
  return 'out';
}

/**
 * Calculate days between two dates.
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Detect rolls from closed wheel trades.
 * A roll is when a position is closed and a new position is opened on the same symbol
 * within 1 day, typically with a different strike or expiration.
 */
function detectRolls(
  closedTrades: Array<{
    id: string;
    symbol: string;
    optionType: string | null;
    strike: { toNumber: () => number } | null;
    expiration: Date | null;
    closeDate: Date;
    openDate: Date;
    closeReason: string;
    realizedPnL: { toNumber: () => number };
    strategy: string | null;
  }>,
  openPositions: Array<{
    id: string;
    symbol: string;
    optionType: string | null;
    strike: { toNumber: () => number } | null;
    expiration: Date | null;
    firstEntryDate: Date;
    costBasis: { toNumber: () => number };
    strategy: string | null;
  }>
): RollTrade[] {
  const rolls: RollTrade[] = [];

  // Sort closed trades by close date descending
  const sortedClosed = [...closedTrades].sort(
    (a, b) => b.closeDate.getTime() - a.closeDate.getTime()
  );

  // For each closed trade, look for a new position opened within 1 day
  for (const closedTrade of sortedClosed) {
    // Skip if not a normal close (we're looking for BTC closes that roll)
    if (closedTrade.closeReason !== 'normal') continue;

    const closeDate = closedTrade.closeDate;
    const symbol = closedTrade.symbol;
    const optionType = closedTrade.optionType;

    // Look for a later trade on the same symbol/type that opened within 1 day
    const rolledInto = sortedClosed.find(t => {
      if (t.id === closedTrade.id) return false;
      if (t.symbol !== symbol) return false;
      if (t.optionType !== optionType) return false;

      const openDateDiff = daysBetween(closeDate, t.openDate);
      return openDateDiff <= 1 && t.openDate >= closeDate;
    });

    // Also check open positions
    const rolledIntoOpen = openPositions.find(p => {
      if (p.symbol !== symbol) return false;
      if (p.optionType !== optionType) return false;

      const openDateDiff = daysBetween(closeDate, p.firstEntryDate);
      return openDateDiff <= 1 && p.firstEntryDate >= closeDate;
    });

    const newPosition = rolledInto || rolledIntoOpen;
    if (!newPosition) continue;

    const originalStrike = closedTrade.strike?.toNumber() || 0;
    const originalExpiration = closedTrade.expiration;
    const newStrike = newPosition.strike?.toNumber() || 0;
    const newExpiration = newPosition.expiration;

    if (!originalExpiration || !newExpiration) continue;

    // Determine type label
    const isCC = closedTrade.strategy === 'covered_call' || closedTrade.optionType === 'call';
    const typeLabel = isCC ? 'Covered Call' : 'Cash Secured Put';

    // Calculate premiums
    // closePremium is negative (cost to close)
    const closePremium = closedTrade.realizedPnL.toNumber();
    // newPremium is the cost basis of new position (for short options, stored negative = premium received)
    const newPremium = 'costBasis' in newPosition
      ? Math.abs(newPosition.costBasis.toNumber())
      : Math.abs(newPosition.realizedPnL.toNumber()); // Approximate if closed

    // Net credit = new premium - cost to close original
    // Note: realizedPnL for the closed position already accounts for the full trade P&L
    // For roll tracking, we want: new premium received - debit paid to close
    const netCredit = newPremium + closePremium; // closePremium is negative if we lost money closing

    rolls.push({
      id: `roll-${closedTrade.id}`,
      symbol,
      rollDate: closeDate.toISOString().split('T')[0],
      originalStrike,
      originalExpiration: originalExpiration.toISOString().split('T')[0],
      originalType: typeLabel,
      closePremium,
      newStrike,
      newExpiration: newExpiration.toISOString().split('T')[0],
      newPremium,
      netCredit,
      rollType: detectRollType(originalStrike, newStrike, originalExpiration, newExpiration),
      daysExtended: daysBetween(originalExpiration, newExpiration),
    });
  }

  return rolls;
}

/**
 * Build wheel cycles from trades.
 * A wheel cycle starts with a CSP assignment, then tracks subsequent CC trades
 * until the stock is called away.
 */
function buildWheelCycles(
  closedTrades: Array<{
    id: string;
    symbol: string;
    optionType: string | null;
    strike: { toNumber: () => number } | null;
    expiration: Date | null;
    openDate: Date;
    closeDate: Date;
    closeReason: string;
    realizedPnL: { toNumber: () => number };
    strategy: string | null;
    side: string;
  }>
): WheelCycle[] {
  const cycles: WheelCycle[] = [];

  // Group by symbol
  const bySymbol = new Map<string, typeof closedTrades>();
  for (const trade of closedTrades) {
    const existing = bySymbol.get(trade.symbol) || [];
    existing.push(trade);
    bySymbol.set(trade.symbol, existing);
  }

  for (const [symbol, trades] of bySymbol) {
    // Sort by close date
    const sorted = [...trades].sort(
      (a, b) => a.closeDate.getTime() - b.closeDate.getTime()
    );

    // Find CSP assignments (start of wheel cycles)
    const cspAssignments = sorted.filter(
      t => (t.strategy === 'cash_secured_put' || t.optionType === 'put') &&
           t.side === 'short' &&
           t.closeReason === 'assigned'
    );

    for (const cspAssignment of cspAssignments) {
      const assignmentDate = cspAssignment.closeDate;
      const strikePrice = cspAssignment.strike?.toNumber() || 0;

      // Find CC trades after this assignment
      const ccTradesAfter = sorted.filter(
        t => (t.strategy === 'covered_call' || t.optionType === 'call') &&
             t.side === 'short' &&
             t.openDate >= assignmentDate
      );

      // Group CC trades until stock is called away (CC assigned)
      const cycleCC: typeof ccTradesAfter = [];
      let stockCalledAway = false;
      let cycleEndDate: Date | null = null;

      for (const cc of ccTradesAfter) {
        // Stop if this CC is for a different cycle (after stock was called away)
        if (stockCalledAway) break;

        cycleCC.push(cc);

        if (cc.closeReason === 'assigned') {
          stockCalledAway = true;
          cycleEndDate = cc.closeDate;
        }
      }

      // Calculate totals
      const cspPremium = cspAssignment.realizedPnL.toNumber();
      const ccPremium = cycleCC.reduce((sum, cc) => sum + cc.realizedPnL.toNumber(), 0);
      const totalPremium = cspPremium + ccPremium;

      cycles.push({
        id: `cycle-${cspAssignment.id}`,
        symbol,
        startDate: cspAssignment.openDate.toISOString().split('T')[0],
        endDate: cycleEndDate?.toISOString().split('T')[0] || null,
        status: stockCalledAway ? 'completed' : 'active',
        cspTrade: {
          id: cspAssignment.id,
          openDate: cspAssignment.openDate.toISOString().split('T')[0],
          closeDate: cspAssignment.closeDate.toISOString().split('T')[0],
          strike: strikePrice,
          premium: cspPremium,
          closeReason: cspAssignment.closeReason,
        },
        stockAcquired: true,
        stockAcquisitionDate: assignmentDate.toISOString().split('T')[0],
        stockAcquisitionPrice: strikePrice,
        ccTrades: cycleCC.map(cc => ({
          id: cc.id,
          openDate: cc.openDate.toISOString().split('T')[0],
          closeDate: cc.closeDate.toISOString().split('T')[0],
          strike: cc.strike?.toNumber() || 0,
          premium: cc.realizedPnL.toNumber(),
          closeReason: cc.closeReason,
        })),
        totalPremium,
        totalCycles: cycleCC.length,
      });
    }
  }

  // Sort by start date descending
  return cycles.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Calculate assignment rate statistics.
 */
function calculateAssignmentStats(
  closedTrades: Array<{
    id: string;
    symbol: string;
    optionType: string | null;
    strike: { toNumber: () => number } | null;
    openDate: Date;
    closeDate: Date;
    closeReason: string;
    realizedPnL: { toNumber: () => number };
    strategy: string | null;
    side: string;
  }>
): AssignmentStats {
  // Filter to short options only (wheel trades)
  const wheelTrades = closedTrades.filter(t => t.side === 'short');

  const totalTrades = wheelTrades.length;
  const assignments = wheelTrades.filter(t => t.closeReason === 'assigned');
  const expirations = wheelTrades.filter(t => t.closeReason === 'expired');
  const totalAssignments = assignments.length;

  // Calculate assignment rate
  const assignmentRate = totalTrades > 0 ? (totalAssignments / totalTrades) * 100 : 0;

  // Calculate days to assignment for assigned trades
  const daysToAssignment = assignments.map(t => daysBetween(t.openDate, t.closeDate));
  const avgDaysToAssignment = daysToAssignment.length > 0
    ? daysToAssignment.reduce((a, b) => a + b, 0) / daysToAssignment.length
    : 0;

  // Average premium on assigned vs expired
  const avgPremiumOnAssigned = assignments.length > 0
    ? assignments.reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0) / assignments.length
    : 0;
  const avgPremiumOnExpired = expirations.length > 0
    ? expirations.reduce((sum, t) => sum + t.realizedPnL.toNumber(), 0) / expirations.length
    : 0;

  // By symbol
  const symbolMap = new Map<string, { trades: number; assignments: number; totalDays: number }>();
  for (const trade of wheelTrades) {
    const existing = symbolMap.get(trade.symbol) || { trades: 0, assignments: 0, totalDays: 0 };
    existing.trades += 1;
    if (trade.closeReason === 'assigned') {
      existing.assignments += 1;
      existing.totalDays += daysBetween(trade.openDate, trade.closeDate);
    }
    symbolMap.set(trade.symbol, existing);
  }

  const bySymbol = Array.from(symbolMap.entries())
    .map(([symbol, data]) => ({
      symbol,
      trades: data.trades,
      assignments: data.assignments,
      assignmentRate: data.trades > 0 ? (data.assignments / data.trades) * 100 : 0,
      avgDaysToAssignment: data.assignments > 0 ? data.totalDays / data.assignments : 0,
    }))
    .sort((a, b) => b.assignmentRate - a.assignmentRate);

  // By strike distance (placeholder - would need underlying price at open)
  // For now, group by whether expired/assigned/early closed
  const byStrikeDistance: AssignmentStats['byStrikeDistance'] = [
    {
      range: 'All Strikes',
      trades: totalTrades,
      assignments: totalAssignments,
      assignmentRate,
    },
  ];

  return {
    totalTrades,
    totalAssignments,
    assignmentRate,
    bySymbol,
    byStrikeDistance,
    avgDaysToAssignment,
    avgPremiumOnAssigned,
    avgPremiumOnExpired,
  };
}

/**
 * GET /api/dashboard/wheel
 *
 * Get wheel strategy statistics for the authenticated user.
 *
 * Query parameters:
 * - brokerageAccountId: Filter by account (optional, omit for all accounts)
 * - startDate: Filter from date (ISO string)
 * - endDate: Filter to date (ISO string)
 *
 * @returns Wheel strategy stats including premium collected, assignments, etc.
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
    log.info({ userId }, 'Fetching wheel strategy stats');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = wheelQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      log.warn({ errors: validatedQuery.error.flatten() }, 'Invalid query parameters');
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validatedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate } = validatedQuery.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample wheel dashboard data');
      return apiJson({ data: sampleDashboardWheel() });
    }

    // Build where clause for wheel trades
    // Wheel trades are short options (side = 'short') which are either:
    // - strategy = 'covered_call' or 'cash_secured_put' (from derivation)
    // - OR: side = 'short' and isWheelTrade = true
    const wheelWhere: Prisma.RealizedCloseWhereInput = {
      userId,
      OR: [
        { strategy: { in: ['covered_call', 'cash_secured_put'] } },
        { side: 'short', isWheelTrade: true },
      ],
    };

    // Open positions where clause - short options are wheel candidates
    const positionWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      positionType: 'option',
      side: 'short', // Short options = sold options = wheel trades
    };

    if (brokerageAccountId) {
      wheelWhere.brokerageAccountId = brokerageAccountId;
      positionWhere.brokerageAccountId = brokerageAccountId;
    }

    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      wheelWhere.closeDate = dateFilter;
    }

    // Fetch all wheel stats in parallel
    const [
      closedWheelTrades,
      openWheelPositions,
    ] = await Promise.all([
      // All closed wheel trades with full details
      prisma.realizedClose.findMany({
        where: wheelWhere,
        select: {
          id: true,
          realizedPnL: true,
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          closeReason: true,
          closeDate: true,
          openDate: true,
          quantity: true,
          openPrice: true,
          closePrice: true,
          strategy: true,
          side: true,
        },
        orderBy: { closeDate: 'desc' },
      }),

      // Active short option positions (pending wheel trades)
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
    ]);

    // Separate closed trades by type
    const coveredCallTrades = closedWheelTrades.filter(
      t => t.strategy === 'covered_call' || (t.optionType === 'call' && t.side === 'short')
    );
    const cashSecuredPutTrades = closedWheelTrades.filter(
      t => t.strategy === 'cash_secured_put' || (t.optionType === 'put' && t.side === 'short')
    );

    // Calculate premium totals for closed trades
    const coveredCallPremium = coveredCallTrades.reduce(
      (sum, t) => sum + t.realizedPnL.toNumber(),
      0
    );
    const cashSecuredPutPremium = cashSecuredPutTrades.reduce(
      (sum, t) => sum + t.realizedPnL.toNumber(),
      0
    );
    const totalPremiumCollected = coveredCallPremium + cashSecuredPutPremium;

    // Count by close reason
    const expirationCount = closedWheelTrades.filter(t => t.closeReason === 'expired').length;
    const assignmentCount = closedWheelTrades.filter(t => t.closeReason === 'assigned').length;
    const earlyCloseCount = closedWheelTrades.filter(t => t.closeReason === 'normal').length;

    // Calculate win rate (positive premium = win)
    const winCount = closedWheelTrades.filter(t => t.realizedPnL.toNumber() > 0).length;
    const totalClosedCount = closedWheelTrades.length;
    const winRate = totalClosedCount > 0 ? (winCount / totalClosedCount) * 100 : 0;

    // Average premium per trade
    const avgPremiumPerTrade = totalClosedCount > 0 ? totalPremiumCollected / totalClosedCount : 0;

    // Open positions summary
    const openCoveredCalls = openWheelPositions.filter(p => p.optionType === 'call');
    const openCashSecuredPuts = openWheelPositions.filter(p => p.optionType === 'put');

    // Pending premium from open positions (cost basis for short options = premium received)
    const pendingCoveredCallPremium = openCoveredCalls.reduce(
      (sum, p) => sum + Math.abs(p.costBasis.toNumber()),
      0
    );
    const pendingCashSecuredPutPremium = openCashSecuredPuts.reduce(
      (sum, p) => sum + Math.abs(p.costBasis.toNumber()),
      0
    );

    // Calculate collateral tied up
    // CSP collateral = strike * 100 * quantity (cash needed to buy shares if assigned)
    // CC collateral = strike * 100 * quantity (value of shares that could be called away)
    const cspCollateral = openCashSecuredPuts.reduce(
      (sum, p) => sum + ((p.strike?.toNumber() || 0) * 100 * Math.abs(p.quantity.toNumber())),
      0
    );
    const ccCollateral = openCoveredCalls.reduce(
      (sum, p) => sum + ((p.strike?.toNumber() || 0) * 100 * Math.abs(p.quantity.toNumber())),
      0
    );
    const totalCollateral = cspCollateral + ccCollateral;

    // Aggregate by symbol (closed trades)
    const symbolMap = new Map<string, {
      premium: number;
      count: number;
      ccCount: number;
      cspCount: number;
      assignments: number;
    }>();

    for (const trade of closedWheelTrades) {
      const existing = symbolMap.get(trade.symbol) || {
        premium: 0,
        count: 0,
        ccCount: 0,
        cspCount: 0,
        assignments: 0,
      };

      const isCC = trade.strategy === 'covered_call' || (trade.optionType === 'call' && trade.side === 'short');

      symbolMap.set(trade.symbol, {
        premium: existing.premium + trade.realizedPnL.toNumber(),
        count: existing.count + 1,
        ccCount: existing.ccCount + (isCC ? 1 : 0),
        cspCount: existing.cspCount + (isCC ? 0 : 1),
        assignments: existing.assignments + (trade.closeReason === 'assigned' ? 1 : 0),
      });
    }

    // Convert to sorted array (top symbols by premium)
    const symbols = Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        premium: Math.round(data.premium * 100) / 100,
        tradeCount: data.count,
        coveredCalls: data.ccCount,
        cashSecuredPuts: data.cspCount,
        assignments: data.assignments,
      }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 10); // Top 10 symbols

    // Recent trades (last 5 closed)
    const recentTrades = closedWheelTrades.slice(0, 5).map(t => ({
      id: t.id,
      symbol: t.symbol,
      type: t.optionType === 'call' ? 'Covered Call' : 'Cash Secured Put',
      strike: t.strike?.toNumber() || 0,
      expiration: t.expiration?.toISOString().split('T')[0] || '',
      closeReason: t.closeReason,
      closeDate: t.closeDate.toISOString().split('T')[0],
      premium: Math.round(t.realizedPnL.toNumber() * 100) / 100,
    }));

    // Open positions detail
    const openPositionsDetail = openWheelPositions.slice(0, 5).map(p => {
      const strike = p.strike?.toNumber() || 0;
      const qty = Math.abs(p.quantity.toNumber());
      const collateral = strike * 100 * qty;
      return {
        id: p.id,
        ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
        symbol: p.symbol,
        type: p.optionType === 'call' ? 'Covered Call' : 'Cash Secured Put',
        strike,
        expiration: p.expiration?.toISOString().split('T')[0] || '',
        quantity: qty,
        pendingPremium: Math.round(Math.abs(p.costBasis.toNumber()) * 100) / 100,
        entryDate: p.firstEntryDate.toISOString().split('T')[0],
        collateral: Math.round(collateral * 100) / 100,
      };
    });

    // =========================================================================
    // Enhanced Analytics: Assignment Stats, Wheel Cycles, Roll Tracking
    // =========================================================================

    // Calculate assignment rate statistics
    const assignmentStats = calculateAssignmentStats(closedWheelTrades);

    // Build wheel cycles (CSP assignment → stock → CC cycles)
    const wheelCycles = buildWheelCycles(closedWheelTrades);

    // Detect rolls
    const rolls = detectRolls(closedWheelTrades, openWheelPositions);

    // Roll statistics
    const rollStats = {
      totalRolls: rolls.length,
      totalNetCredit: rolls.reduce((sum, r) => sum + r.netCredit, 0),
      avgNetCredit: rolls.length > 0
        ? rolls.reduce((sum, r) => sum + r.netCredit, 0) / rolls.length
        : 0,
      rollsByType: {
        up: rolls.filter(r => r.rollType === 'up').length,
        down: rolls.filter(r => r.rollType === 'down').length,
        out: rolls.filter(r => r.rollType === 'out').length,
        upAndOut: rolls.filter(r => r.rollType === 'up_and_out').length,
        downAndOut: rolls.filter(r => r.rollType === 'down_and_out').length,
      },
      avgDaysExtended: rolls.length > 0
        ? rolls.reduce((sum, r) => sum + r.daysExtended, 0) / rolls.length
        : 0,
    };

    // Wheel cycle statistics
    const cycleStats = {
      totalCycles: wheelCycles.length,
      activeCycles: wheelCycles.filter(c => c.status === 'active').length,
      completedCycles: wheelCycles.filter(c => c.status === 'completed').length,
      totalPremiumFromCycles: wheelCycles.reduce((sum, c) => sum + c.totalPremium, 0),
      avgPremiumPerCycle: wheelCycles.length > 0
        ? wheelCycles.reduce((sum, c) => sum + c.totalPremium, 0) / wheelCycles.length
        : 0,
      avgCCPerCycle: wheelCycles.length > 0
        ? wheelCycles.reduce((sum, c) => sum + c.totalCycles, 0) / wheelCycles.length
        : 0,
    };

    log.info({
      userId,
      totalClosedTrades: totalClosedCount,
      totalOpenPositions: openWheelPositions.length,
    }, 'Wheel strategy stats fetched successfully');

    return apiJson({
      data: {
        // Summary stats
        totalPremiumCollected: Math.round(totalPremiumCollected * 100) / 100,
        coveredCallPremium: Math.round(coveredCallPremium * 100) / 100,
        cashSecuredPutPremium: Math.round(cashSecuredPutPremium * 100) / 100,
        coveredCallCount: coveredCallTrades.length,
        cashSecuredPutCount: cashSecuredPutTrades.length,

        // Close reason breakdown
        expirations: expirationCount,
        assignments: assignmentCount,
        earlyCloses: earlyCloseCount,

        // Open positions
        activePositions: openWheelPositions.length,
        activeCoveredCalls: openCoveredCalls.length,
        activeCashSecuredPuts: openCashSecuredPuts.length,
        pendingPremium: Math.round((pendingCoveredCallPremium + pendingCashSecuredPutPremium) * 100) / 100,
        pendingCoveredCallPremium: Math.round(pendingCoveredCallPremium * 100) / 100,
        pendingCashSecuredPutPremium: Math.round(pendingCashSecuredPutPremium * 100) / 100,

        // Capital/Collateral
        totalCollateral: Math.round(totalCollateral * 100) / 100,
        cspCollateral: Math.round(cspCollateral * 100) / 100,
        ccCollateral: Math.round(ccCollateral * 100) / 100,

        // Performance metrics
        winRate: Math.round(winRate * 100) / 100,
        avgPremiumPerTrade: Math.round(avgPremiumPerTrade * 100) / 100,

        // Detailed breakdowns
        symbols,
        recentTrades,
        openPositions: openPositionsDetail,

        // Enhanced Analytics
        assignmentStats: {
          totalTrades: assignmentStats.totalTrades,
          totalAssignments: assignmentStats.totalAssignments,
          assignmentRate: Math.round(assignmentStats.assignmentRate * 100) / 100,
          avgDaysToAssignment: Math.round(assignmentStats.avgDaysToAssignment * 10) / 10,
          avgPremiumOnAssigned: Math.round(assignmentStats.avgPremiumOnAssigned * 100) / 100,
          avgPremiumOnExpired: Math.round(assignmentStats.avgPremiumOnExpired * 100) / 100,
          bySymbol: assignmentStats.bySymbol.slice(0, 10).map(s => ({
            ...s,
            assignmentRate: Math.round(s.assignmentRate * 100) / 100,
            avgDaysToAssignment: Math.round(s.avgDaysToAssignment * 10) / 10,
          })),
        },

        wheelCycles: {
          stats: {
            totalCycles: cycleStats.totalCycles,
            activeCycles: cycleStats.activeCycles,
            completedCycles: cycleStats.completedCycles,
            totalPremium: Math.round(cycleStats.totalPremiumFromCycles * 100) / 100,
            avgPremiumPerCycle: Math.round(cycleStats.avgPremiumPerCycle * 100) / 100,
            avgCCPerCycle: Math.round(cycleStats.avgCCPerCycle * 10) / 10,
          },
          cycles: wheelCycles.slice(0, 10).map(c => ({
            ...c,
            totalPremium: Math.round(c.totalPremium * 100) / 100,
            cspTrade: c.cspTrade ? {
              ...c.cspTrade,
              premium: Math.round(c.cspTrade.premium * 100) / 100,
            } : null,
            ccTrades: c.ccTrades.map(cc => ({
              ...cc,
              premium: Math.round(cc.premium * 100) / 100,
            })),
          })),
        },

        rolls: {
          stats: {
            totalRolls: rollStats.totalRolls,
            totalNetCredit: Math.round(rollStats.totalNetCredit * 100) / 100,
            avgNetCredit: Math.round(rollStats.avgNetCredit * 100) / 100,
            avgDaysExtended: Math.round(rollStats.avgDaysExtended * 10) / 10,
            byType: rollStats.rollsByType,
          },
          recentRolls: rolls.slice(0, 10).map(r => ({
            ...r,
            closePremium: Math.round(r.closePremium * 100) / 100,
            newPremium: Math.round(r.newPremium * 100) / 100,
            netCredit: Math.round(r.netCredit * 100) / 100,
          })),
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch wheel strategy stats');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch wheel strategy stats',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

