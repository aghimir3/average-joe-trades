import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Goals API
 *
 * Manages user trading goals (weekly/monthly P&L targets).
 * GET /api/dashboard/goals - Get current goals with progress
 * POST /api/dashboard/goals - Create or update a goal
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardGoals } from '@/lib/dashboard/sample-data';

// Validation schema for goal creation/update
const goalSchema = z.object({
  goalType: z.enum(['weekly', 'monthly', 'premium_weekly', 'premium_monthly']),
  targetPnL: z.number().min(0, 'Target must be positive'),
  brokerageAccountId: z.string().uuid().nullable().optional(), // null = aggregate, uuid = account-specific
});

interface GoalProgress {
  goalType: 'weekly' | 'monthly' | 'premium_weekly' | 'premium_monthly';
  targetPnL: number;
  currentPnL: number;
  progress: number; // percentage (can exceed 100)
  isAchieved: boolean;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  tradesInPeriod: number;
  winsInPeriod: number;
  streak: number; // consecutive periods goal was achieved
}

interface GoalsResponse {
  goals: GoalProgress[];
  history: {
    weekly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    monthly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    premium_weekly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    premium_monthly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
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
      return apiJson({ data: sampleDashboardGoals() });
    }

    // Get active goals for this account scope
    // NULL brokerageAccountId = get aggregate goals (for "All Accounts" view)
    // UUID brokerageAccountId = get account-specific goals
    const activeGoals = await prisma.tradingGoal.findMany({
      where: {
        userId,
        isActive: true,
        brokerageAccountId: brokerageAccountId || null, // Explicit null for aggregate goals
      },
    });

    // Early return if no active goals - skip all expensive queries
    if (activeGoals.length === 0) {
      return apiJson({
        data: {
          goals: [],
          history: {
            weekly: [],
            monthly: [],
            premium_weekly: [],
            premium_monthly: [],
          },
        } satisfies GoalsResponse,
      });
    }

    // Determine which goal types exist to only fetch needed data
    const goalTypes = new Set(activeGoals.map((g) => g.goalType));
    const hasWeekly = goalTypes.has('weekly');
    const hasMonthly = goalTypes.has('monthly');
    const hasPremiumWeekly = goalTypes.has('premium_weekly');
    const hasPremiumMonthly = goalTypes.has('premium_monthly');

    // Calculate date ranges
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);

    // Only fetch P&L/trades data for goal types that exist
    const pnlPromises: Promise<number>[] = [];
    const tradePromises: Promise<{ count: number; wins: number }>[] = [];

    // Build promise arrays based on which goals exist
    if (hasWeekly) {
      pnlPromises.push(getPnLForPeriod(userId, weekStart, weekEnd, brokerageAccountId, false));
      tradePromises.push(getTradesForPeriod(userId, weekStart, weekEnd, brokerageAccountId, false));
    }
    if (hasMonthly) {
      pnlPromises.push(getPnLForPeriod(userId, monthStart, monthEnd, brokerageAccountId, false));
      tradePromises.push(getTradesForPeriod(userId, monthStart, monthEnd, brokerageAccountId, false));
    }
    if (hasPremiumWeekly) {
      pnlPromises.push(getPnLForPeriod(userId, weekStart, weekEnd, brokerageAccountId, true));
      tradePromises.push(getTradesForPeriod(userId, weekStart, weekEnd, brokerageAccountId, true));
    }
    if (hasPremiumMonthly) {
      pnlPromises.push(getPnLForPeriod(userId, monthStart, monthEnd, brokerageAccountId, true));
      tradePromises.push(getTradesForPeriod(userId, monthStart, monthEnd, brokerageAccountId, true));
    }

    // Fetch all needed current period data in parallel
    const [pnlResults, tradeResults] = await Promise.all([
      Promise.all(pnlPromises),
      Promise.all(tradePromises),
    ]);

    // Map results back to goal types
    let pnlIdx = 0;
    let tradeIdx = 0;
    const weeklyPnL = hasWeekly ? pnlResults[pnlIdx++] : 0;
    const monthlyPnL = hasMonthly ? pnlResults[pnlIdx++] : 0;
    const weeklyPremium = hasPremiumWeekly ? pnlResults[pnlIdx++] : 0;
    const monthlyPremium = hasPremiumMonthly ? pnlResults[pnlIdx++] : 0;

    const weeklyTrades = hasWeekly ? tradeResults[tradeIdx++] : { count: 0, wins: 0 };
    const monthlyTrades = hasMonthly ? tradeResults[tradeIdx++] : { count: 0, wins: 0 };
    const weeklyPremiumTrades = hasPremiumWeekly ? tradeResults[tradeIdx++] : { count: 0, wins: 0 };
    const monthlyPremiumTrades = hasPremiumMonthly ? tradeResults[tradeIdx++] : { count: 0, wins: 0 };

    // Only fetch history for goal types that exist
    const historyPromises: Promise<Array<{ period: string; actual: number }>>[] = [];
    if (hasWeekly) historyPromises.push(getWeeklyHistory(userId, 12, brokerageAccountId, false));
    if (hasMonthly) historyPromises.push(getMonthlyHistory(userId, 6, brokerageAccountId, false));
    if (hasPremiumWeekly) historyPromises.push(getWeeklyHistory(userId, 12, brokerageAccountId, true));
    if (hasPremiumMonthly) historyPromises.push(getMonthlyHistory(userId, 6, brokerageAccountId, true));

    const historyResults = await Promise.all(historyPromises);

    // Map history results back to goal types
    let histIdx = 0;
    const weeklyHistory = hasWeekly ? historyResults[histIdx++] : [];
    const monthlyHistory = hasMonthly ? historyResults[histIdx++] : [];
    const weeklyPremiumHistory = hasPremiumWeekly ? historyResults[histIdx++] : [];
    const monthlyPremiumHistory = hasPremiumMonthly ? historyResults[histIdx++] : [];

    // Build goal progress for each active goal
    const goals: GoalProgress[] = [];

    for (const goal of activeGoals) {
      const isPremium = goal.goalType.startsWith('premium_');
      const isWeekly = goal.goalType === 'weekly' || goal.goalType === 'premium_weekly';
      const targetPnL = goal.targetPnL.toNumber();

      // Select the right P&L and trades data based on goal type
      let currentPnL: number;
      let trades: { count: number; wins: number };
      let history: Array<{ period: string; actual: number }>;

      if (isPremium) {
        currentPnL = isWeekly ? weeklyPremium : monthlyPremium;
        trades = isWeekly ? weeklyPremiumTrades : monthlyPremiumTrades;
        history = isWeekly ? weeklyPremiumHistory : monthlyPremiumHistory;
      } else {
        currentPnL = isWeekly ? weeklyPnL : monthlyPnL;
        trades = isWeekly ? weeklyTrades : monthlyTrades;
        history = isWeekly ? weeklyHistory : monthlyHistory;
      }

      // Calculate streak of consecutive achieved periods
      let streak = 0;
      for (const period of history) {
        if (period.actual >= targetPnL) {
          streak++;
        } else {
          break;
        }
      }

      const periodStart = isWeekly ? weekStart : monthStart;
      const periodEnd = isWeekly ? weekEnd : monthEnd;
      const daysRemaining = Math.max(
        0,
        Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      goals.push({
        goalType: goal.goalType as 'weekly' | 'monthly' | 'premium_weekly' | 'premium_monthly',
        targetPnL,
        currentPnL,
        progress: targetPnL > 0 ? (currentPnL / targetPnL) * 100 : 0,
        isAchieved: currentPnL >= targetPnL,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        daysRemaining,
        tradesInPeriod: trades.count,
        winsInPeriod: trades.wins,
        streak,
      });
    }

    // Format history for response
    const weeklyGoal = activeGoals.find((g) => g.goalType === 'weekly');
    const monthlyGoal = activeGoals.find((g) => g.goalType === 'monthly');
    const premiumWeeklyGoal = activeGoals.find((g) => g.goalType === 'premium_weekly');
    const premiumMonthlyGoal = activeGoals.find((g) => g.goalType === 'premium_monthly');

    return apiJson({
      data: {
        goals,
        history: {
          weekly: weeklyHistory.map((p) => ({
            period: p.period,
            target: weeklyGoal?.targetPnL.toNumber() ?? 0,
            actual: p.actual,
            achieved: weeklyGoal ? p.actual >= weeklyGoal.targetPnL.toNumber() : false,
          })),
          monthly: monthlyHistory.map((p) => ({
            period: p.period,
            target: monthlyGoal?.targetPnL.toNumber() ?? 0,
            actual: p.actual,
            achieved: monthlyGoal ? p.actual >= monthlyGoal.targetPnL.toNumber() : false,
          })),
          premium_weekly: weeklyPremiumHistory.map((p) => ({
            period: p.period,
            target: premiumWeeklyGoal?.targetPnL.toNumber() ?? 0,
            actual: p.actual,
            achieved: premiumWeeklyGoal ? p.actual >= premiumWeeklyGoal.targetPnL.toNumber() : false,
          })),
          premium_monthly: monthlyPremiumHistory.map((p) => ({
            period: p.period,
            target: premiumMonthlyGoal?.targetPnL.toNumber() ?? 0,
            actual: p.actual,
            achieved: premiumMonthlyGoal ? p.actual >= premiumMonthlyGoal.targetPnL.toNumber() : false,
          })),
        },
      } satisfies GoalsResponse,
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();

    // Validate input
    const parsed = goalSchema.safeParse(body);
    if (!parsed.success) {
      return apiJson(
        { error: 'Validation Error', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { goalType, targetPnL, brokerageAccountId } = parsed.data;

    // Validate account ownership if brokerageAccountId is provided
    if (brokerageAccountId) {
      const account = await prisma.brokerageAccount.findFirst({
        where: { id: brokerageAccountId, userId, isActive: true },
      });
      if (!account) {
        return apiJson(
          { error: 'Invalid account', message: 'Account not found or does not belong to user' },
          { status: 400 }
        );
      }
    }

    // Use a transaction to safely update the goal
    // First delete any inactive goals of this type to avoid unique constraint issues
    // Then upsert the active goal
    const goal = await prisma.$transaction(async (tx) => {
      // Delete any inactive goals of this type for this account scope (old history we don't need)
      await tx.tradingGoal.deleteMany({
        where: {
          userId,
          goalType,
          brokerageAccountId: brokerageAccountId ?? null,
          isActive: false,
        },
      });

      // Check if there's an active goal to update for this account scope
      const existingGoal = await tx.tradingGoal.findFirst({
        where: {
          userId,
          goalType,
          brokerageAccountId: brokerageAccountId ?? null,
          isActive: true,
        },
      });

      if (existingGoal) {
        // Update existing goal
        return tx.tradingGoal.update({
          where: { id: existingGoal.id },
          data: { targetPnL },
        });
      } else {
        // Create new goal
        return tx.tradingGoal.create({
          data: {
            userId,
            goalType,
            targetPnL,
            brokerageAccountId: brokerageAccountId ?? null,
            isActive: true,
          },
        });
      }
    });

    return apiJson(
      {
        data: {
          id: goal.id,
          goalType: goal.goalType,
          targetPnL: goal.targetPnL.toNumber(),
          brokerageAccountId: goal.brokerageAccountId,
        },
        message: `${goalType} goal set to $${targetPnL.toLocaleString()}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating goal:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const goalType = searchParams.get('type');
    const brokerageAccountId = searchParams.get('brokerageAccountId');

    if (!goalType || !['weekly', 'monthly', 'premium_weekly', 'premium_monthly'].includes(goalType)) {
      return apiJson({ error: 'Invalid goal type' }, { status: 400 });
    }

    // Deactivate the goal for this account scope
    // NULL brokerageAccountId = deactivate aggregate goal
    // UUID brokerageAccountId = deactivate account-specific goal
    await prisma.tradingGoal.updateMany({
      where: {
        userId,
        goalType,
        brokerageAccountId: brokerageAccountId || null, // Explicit null for aggregate
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return apiJson({ message: `${goalType} goal removed` });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Helper functions

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6); // Sunday
  d.setHours(23, 59, 59, 999);
  return d;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

async function getPnLForPeriod(
  userId: string,
  start: Date,
  end: Date,
  brokerageAccountId: string | null,
  premiumOnly: boolean
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    userId,
    closeDate: {
      gte: start,
      lte: end,
    },
    hasUnknownBasis: false,
  };

  if (brokerageAccountId) {
    whereClause.brokerageAccountId = brokerageAccountId;
  }

  // For premium goals, only include wheel strategy trades (covered calls and CSPs)
  if (premiumOnly) {
    whereClause.OR = [
      { strategy: { in: ['covered_call', 'cash_secured_put'] } },
      { side: 'short', isWheelTrade: true },
    ];
  }

  const result = await prisma.realizedClose.aggregate({
    where: whereClause,
    _sum: {
      realizedPnL: true,
    },
  });

  return result._sum.realizedPnL?.toNumber() ?? 0;
}

async function getTradesForPeriod(
  userId: string,
  start: Date,
  end: Date,
  brokerageAccountId: string | null,
  premiumOnly: boolean
): Promise<{ count: number; wins: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    userId,
    closeDate: {
      gte: start,
      lte: end,
    },
    hasUnknownBasis: false,
  };

  if (brokerageAccountId) {
    whereClause.brokerageAccountId = brokerageAccountId;
  }

  // For premium goals, only include wheel strategy trades
  if (premiumOnly) {
    whereClause.OR = [
      { strategy: { in: ['covered_call', 'cash_secured_put'] } },
      { side: 'short', isWheelTrade: true },
    ];
  }

  const trades = await prisma.realizedClose.findMany({
    where: whereClause,
    select: {
      realizedPnL: true,
    },
  });

  return {
    count: trades.length,
    wins: trades.filter((t) => t.realizedPnL.toNumber() > 0).length,
  };
}

/**
 * Fetch weekly history in a single batched query instead of N sequential queries.
 * Groups closes by week and sums P&L in memory.
 */
async function getWeeklyHistory(
  userId: string,
  weeks: number,
  brokerageAccountId: string | null,
  premiumOnly: boolean
): Promise<Array<{ period: string; actual: number }>> {
  const now = new Date();

  // Calculate the start of the oldest week we need
  const oldestWeekDate = new Date(now);
  oldestWeekDate.setDate(oldestWeekDate.getDate() - weeks * 7);
  const rangeStart = getWeekStart(oldestWeekDate);

  // End is the end of last week (not current week)
  const lastWeekDate = new Date(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const rangeEnd = getWeekEnd(lastWeekDate);

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    userId,
    closeDate: {
      gte: rangeStart,
      lte: rangeEnd,
    },
    hasUnknownBasis: false,
  };

  if (brokerageAccountId) {
    whereClause.brokerageAccountId = brokerageAccountId;
  }

  // For premium goals, only include wheel strategy trades
  if (premiumOnly) {
    whereClause.OR = [
      { strategy: { in: ['covered_call', 'cash_secured_put'] } },
      { side: 'short', isWheelTrade: true },
    ];
  }

  // Single query to fetch all closes in date range
  const closes = await prisma.realizedClose.findMany({
    where: whereClause,
    select: {
      closeDate: true,
      realizedPnL: true,
    },
  });

  // Pre-compute all week periods
  const weekPeriods: Array<{ period: string; start: Date; end: Date }> = [];
  for (let i = 1; i <= weeks; i++) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const start = getWeekStart(weekDate);
    const end = getWeekEnd(weekDate);
    weekPeriods.push({
      period: start.toISOString().split('T')[0],
      start,
      end,
    });
  }

  // Group closes by week period
  const history = weekPeriods.map(({ period, start, end }) => {
    const periodPnL = closes
      .filter(c => c.closeDate >= start && c.closeDate <= end)
      .reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
    return { period, actual: periodPnL };
  });

  return history;
}

/**
 * Fetch monthly history in a single batched query instead of N sequential queries.
 * Groups closes by month and sums P&L in memory.
 */
async function getMonthlyHistory(
  userId: string,
  months: number,
  brokerageAccountId: string | null,
  premiumOnly: boolean
): Promise<Array<{ period: string; actual: number }>> {
  const now = new Date();

  // Calculate the start of the oldest month we need
  const oldestMonthDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const rangeStart = getMonthStart(oldestMonthDate);

  // End is the end of last month (not current month)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = getMonthEnd(lastMonthDate);

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    userId,
    closeDate: {
      gte: rangeStart,
      lte: rangeEnd,
    },
    hasUnknownBasis: false,
  };

  if (brokerageAccountId) {
    whereClause.brokerageAccountId = brokerageAccountId;
  }

  // For premium goals, only include wheel strategy trades
  if (premiumOnly) {
    whereClause.OR = [
      { strategy: { in: ['covered_call', 'cash_secured_put'] } },
      { side: 'short', isWheelTrade: true },
    ];
  }

  // Single query to fetch all closes in date range
  const closes = await prisma.realizedClose.findMany({
    where: whereClause,
    select: {
      closeDate: true,
      realizedPnL: true,
    },
  });

  // Pre-compute all month periods
  const monthPeriods: Array<{ period: string; start: Date; end: Date }> = [];
  for (let i = 1; i <= months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = getMonthStart(monthDate);
    const end = getMonthEnd(monthDate);
    monthPeriods.push({
      period: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      start,
      end,
    });
  }

  // Group closes by month period
  const history = monthPeriods.map(({ period, start, end }) => {
    const periodPnL = closes
      .filter(c => c.closeDate >= start && c.closeDate <= end)
      .reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
    return { period, actual: periodPnL };
  });

  return history;
}

