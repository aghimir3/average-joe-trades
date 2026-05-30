/**
 * Daily Insights Generator
 * Generates personalized daily trading insights and recommendations
 */

import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { analyzePortfolioRisk } from './risk-analyzer';
import { predictStrategy } from './strategy-classifier';
import type {
  DailyInsights,
  DailyInsightSummary,
  ActionItem,
  Opportunity,
  RiskAlert,
} from './types';

const log = createChildLogger({ module: 'options-daily-insights' });

// ============================================================================
// Generate Daily Insights
// ============================================================================

export async function generateDailyInsights(userId: string): Promise<DailyInsights> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if already generated today
  const existing = await prisma.dailyInsight.findUnique({
    where: { userId_insightDate: { userId, insightDate: today } },
  });

  if (existing) {
    return parseDailyInsight(existing);
  }

  // Generate fresh insights
  const [positions, recentTrades, riskAnalysis] = await Promise.all([
    prisma.derivedPosition.findMany({ where: { userId } }),
    prisma.realizedClose.findMany({
      where: { userId, hasUnknownBasis: false },
      orderBy: { closeDate: 'desc' },
      take: 50,
    }),
    analyzePortfolioRisk(userId),
  ]);

  // Calculate summary
  const summary = calculateSummary(positions);

  // Generate action items from positions
  const actionItems = await generateActionItems(userId, positions);

  // Generate opportunities
  const opportunities = await generateOpportunities(userId, recentTrades);

  // Convert risk alerts
  const riskAlerts: RiskAlert[] = riskAnalysis.alerts.map((a) => ({
    type: a.type,
    severity: a.severity,
    description: a.message,
    action: getAlertAction(a.type),
  }));

  // Generate learning insights
  const learnings = generateLearnings(recentTrades);

  const insights: DailyInsights = {
    date: today,
    summary,
    actionItems,
    opportunities,
    riskAlerts,
    learnings,
    generatedAt: new Date(),
  };

  // Save to database using upsert to handle race conditions
  // Wrap in try-catch to handle edge case where another request creates the record
  // between our findUnique check and this upsert (SQL Server isolation behavior)
  try {
    await prisma.dailyInsight.upsert({
      where: { userId_insightDate: { userId, insightDate: today } },
      create: {
        userId,
        insightDate: today,
        summary: JSON.stringify(summary),
        actionItems: JSON.stringify(actionItems),
        opportunities: JSON.stringify(opportunities),
        riskAlerts: JSON.stringify(riskAlerts),
        learnings: JSON.stringify(learnings),
      },
      update: {
        summary: JSON.stringify(summary),
        actionItems: JSON.stringify(actionItems),
        opportunities: JSON.stringify(opportunities),
        riskAlerts: JSON.stringify(riskAlerts),
        learnings: JSON.stringify(learnings),
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    // P2002 = unique constraint violation - another request created the record
    // This is a benign race condition, just log and continue
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002') {
      log.debug({ userId }, 'Daily insights upsert race handled; record already exists');
    } else {
      throw error; // Re-throw non-P2002 errors
    }
  }

  return insights;
}

// ============================================================================
// Get Insights
// ============================================================================

export async function getDailyInsights(
  userId: string,
  date?: Date
): Promise<DailyInsights | null> {
  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);

  const insight = await prisma.dailyInsight.findUnique({
    where: { userId_insightDate: { userId, insightDate: targetDate } },
  });

  if (!insight) {
    // Generate if today
    if (!date || isSameDay(date, new Date())) {
      return generateDailyInsights(userId);
    }
    return null;
  }

  // Mark as viewed
  if (!insight.wasViewed) {
    await prisma.dailyInsight.update({
      where: { id: insight.id },
      data: { wasViewed: true, viewedAt: new Date() },
    });
  }

  return parseDailyInsight(insight);
}

export async function getInsightsHistory(
  userId: string,
  limit: number = 7
): Promise<DailyInsights[]> {
  const insights = await prisma.dailyInsight.findMany({
    where: { userId },
    orderBy: { insightDate: 'desc' },
    take: limit,
  });

  return insights.map(parseDailyInsight);
}

// ============================================================================
// Helpers
// ============================================================================

function calculateSummary(
  positions: { positionType: string; quantity: unknown; avgPrice: unknown; optionType: string | null; costBasis: unknown }[]
): DailyInsightSummary {
  let netDelta = 0;
  let dailyTheta = 0;
  let portfolioValue = 0;
  let optionCount = 0;
  const unrealizedPnL = 0; // Would need current prices

  // Filter to OPTIONS ONLY - this is an options insights module
  for (const pos of positions) {
    if (pos.positionType !== 'option') continue;

    optionCount++;
    const price = Number(pos.avgPrice);
    const quantity = Number(pos.quantity);
    // Use costBasis directly - it's already the correct total value
    const costBasis = Number(pos.costBasis);
    portfolioValue += Math.abs(costBasis);

    // Rough delta estimate
    const delta = pos.optionType === 'call' ? 0.5 : -0.5;
    netDelta += delta * quantity;

    // Rough theta estimate (based on per-share price, multiplied by 100 for contracts)
    dailyTheta += -0.02 * price * quantity * 100;
  }

  return {
    totalPositions: optionCount,
    netDelta: Math.round(netDelta * 10) / 10,
    dailyTheta: Math.round(dailyTheta),
    unrealizedPnL,
    portfolioValue: Math.round(portfolioValue),
  };
}

async function generateActionItems(
  _userId: string,
  positions: {
    id: string;
    symbol: string;
    positionType: string;
    expiration: Date | null;
    avgPrice: unknown;
    quantity: unknown;
  }[]
): Promise<ActionItem[]> {
  const actionItems: ActionItem[] = [];
  const now = new Date();

  for (const pos of positions) {
    if (pos.positionType !== 'option' || !pos.expiration) continue;

    const daysToExpiry = Math.ceil(
      (pos.expiration.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Skip expired options - focus on forward-looking insights only
    if (daysToExpiry <= 0) {
      continue;
    }

    if (daysToExpiry <= 3) {
      actionItems.push({
        type: 'roll',
        symbol: pos.symbol,
        priority: 'high',
        description: `${pos.symbol} expires in ${daysToExpiry} day${daysToExpiry !== 1 ? 's' : ''}`,
        recommendation: 'Consider rolling or closing',
        deadline: pos.expiration,
      });
    } else if (daysToExpiry <= 7) {
      actionItems.push({
        type: 'monitor',
        symbol: pos.symbol,
        priority: 'medium',
        description: `${pos.symbol} expires in ${daysToExpiry} days`,
        recommendation: 'Monitor position closely',
      });
    }
  }

  // Sort by priority, then by days to expiry (nearest first)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actionItems.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // For same priority, sort by deadline (nearest first)
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    return 0;
  });

  return actionItems.slice(0, 5);
}

async function generateOpportunities(
  userId: string,
  recentTrades: { symbol: string; strategy: string | null; realizedPnL: unknown }[]
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  // Get top performing symbols
  const symbolStats = new Map<string, { wins: number; total: number; pnl: number }>();
  for (const trade of recentTrades) {
    const stats = symbolStats.get(trade.symbol) || { wins: 0, total: 0, pnl: 0 };
    stats.total++;
    stats.pnl += Number(trade.realizedPnL);
    if (Number(trade.realizedPnL) > 0) stats.wins++;
    symbolStats.set(trade.symbol, stats);
  }

  // Find symbols with good win rates
  const goodSymbols = Array.from(symbolStats.entries())
    .filter(([, stats]) => stats.total >= 3 && stats.wins / stats.total >= 0.6)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 3);

  for (const [symbol, stats] of goodSymbols) {
    try {
      const strategyRec = await predictStrategy(userId, symbol);

      opportunities.push({
        symbol,
        strategy: strategyRec.strategy,
        confidence: strategyRec.confidence,
        expectedReturn: strategyRec.expectedReturn,
        reasoning: [
          `${(stats.wins / stats.total * 100).toFixed(0)}% win rate on ${symbol}`,
          ...strategyRec.reasoning.slice(0, 2),
        ],
      });
    } catch {
      // Skip if prediction fails
    }
  }

  return opportunities;
}

function generateLearnings(
  recentTrades: { symbol: string; strategy: string | null; realizedPnL: unknown; openDate: Date }[]
): string[] {
  const learnings: string[] = [];

  if (recentTrades.length < 5) {
    learnings.push('Keep trading to generate personalized insights');
    return learnings;
  }

  // Analyze recent performance
  const last10 = recentTrades.slice(0, 10);
  const wins = last10.filter((t) => Number(t.realizedPnL) > 0).length;
  const winRate = wins / last10.length;

  if (winRate >= 0.7) {
    learnings.push('Strong recent performance - maintain current approach');
  } else if (winRate < 0.4) {
    learnings.push('Consider reviewing your entry criteria');
  }

  // Day of week analysis
  const byDay = new Map<number, { wins: number; total: number }>();
  for (const trade of recentTrades) {
    const day = new Date(trade.openDate).getDay();
    const stats = byDay.get(day) || { wins: 0, total: 0 };
    stats.total++;
    if (Number(trade.realizedPnL) > 0) stats.wins++;
    byDay.set(day, stats);
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay = -1;
  let bestRate = 0;
  for (const [day, stats] of byDay.entries()) {
    if (stats.total >= 3) {
      const rate = stats.wins / stats.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestDay = day;
      }
    }
  }

  if (bestDay >= 0 && bestRate >= 0.7) {
    learnings.push(`${dayNames[bestDay]}s show your best performance (${(bestRate * 100).toFixed(0)}% win rate)`);
  }

  return learnings;
}

function getAlertAction(alertType: string): string {
  const actions: Record<string, string> = {
    CONCENTRATION: 'Review position sizes and consider diversifying',
    EXPIRATION_CLUSTER: 'Spread out expirations to manage risk',
    DRAWDOWN: 'Consider reducing position sizes temporarily',
    PERFORMANCE: 'Review recent trades for improvement opportunities',
  };
  return actions[alertType] || 'Review and take appropriate action';
}

function parseDailyInsight(insight: {
  insightDate: Date;
  summary: string;
  actionItems: string;
  opportunities: string;
  riskAlerts: string;
  learnings: string | null;
  generatedAt: Date;
}): DailyInsights {
  return {
    date: insight.insightDate,
    summary: JSON.parse(insight.summary) as DailyInsightSummary,
    actionItems: JSON.parse(insight.actionItems) as ActionItem[],
    opportunities: JSON.parse(insight.opportunities) as Opportunity[],
    riskAlerts: JSON.parse(insight.riskAlerts) as RiskAlert[],
    learnings: insight.learnings ? (JSON.parse(insight.learnings) as string[]) : [],
    generatedAt: insight.generatedAt,
  };
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ============================================================================
// Get or Generate Insights (Idempotent)
// ============================================================================

/**
 * Gets daily insights, generating them if needed (idempotent operation)
 * This is safe to call multiple times concurrently
 */
export async function getOrGenerateDailyInsights(userId: string): Promise<DailyInsights | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Try to find existing insights first
  const existing = await prisma.dailyInsight.findUnique({
    where: { userId_insightDate: { userId, insightDate: today } },
  });

  if (existing) {
    // Mark as viewed if not already
    if (!existing.wasViewed) {
      await prisma.dailyInsight.update({
        where: { id: existing.id },
        data: { wasViewed: true, viewedAt: new Date() },
      }).catch(() => { /* ignore view tracking errors */ });
    }
    return parseDailyInsight(existing);
  }

  // Generate new insights (handles race conditions internally)
  try {
    return await generateDailyInsights(userId);
  } catch (error) {
    // If generation fails, try to return existing (in case of race)
    const fallback = await prisma.dailyInsight.findUnique({
      where: { userId_insightDate: { userId, insightDate: today } },
    });
    if (fallback) {
      return parseDailyInsight(fallback);
    }
    throw error;
  }
}

// ============================================================================
// Refresh Daily Insights (Force Regenerate)
// ============================================================================

/**
 * Deletes today's cached insight and regenerates fresh from current data.
 * Use this when underlying position data has changed and you need updated insights.
 */
export async function refreshDailyInsights(userId: string): Promise<DailyInsights> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Delete existing insight for today (if any)
  await prisma.dailyInsight.deleteMany({
    where: { userId, insightDate: today },
  });

  // Generate fresh by calling internal generation logic directly
  const [positions, recentTrades, riskAnalysis] = await Promise.all([
    prisma.derivedPosition.findMany({ where: { userId } }),
    prisma.realizedClose.findMany({
      where: { userId, hasUnknownBasis: false },
      orderBy: { closeDate: 'desc' },
      take: 50,
    }),
    analyzePortfolioRisk(userId),
  ]);

  const summary = calculateSummary(positions);
  const actionItems = await generateActionItems(userId, positions);
  const opportunities = await generateOpportunities(userId, recentTrades);
  const riskAlerts: RiskAlert[] = riskAnalysis.alerts.map((a) => ({
    type: a.type,
    severity: a.severity,
    description: a.message,
    action: getAlertAction(a.type),
  }));
  const learnings = generateLearnings(recentTrades);

  const insights: DailyInsights = {
    date: today,
    summary,
    actionItems,
    opportunities,
    riskAlerts,
    learnings,
    generatedAt: new Date(),
  };

  // Save to database
  try {
    await prisma.dailyInsight.create({
      data: {
        userId,
        insightDate: today,
        summary: JSON.stringify(summary),
        actionItems: JSON.stringify(actionItems),
        opportunities: JSON.stringify(opportunities),
        riskAlerts: JSON.stringify(riskAlerts),
        learnings: JSON.stringify(learnings),
      },
    });
  } catch (error) {
    // Ignore P2002 if another request created it
    if (!(error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002')) {
      throw error;
    }
  }

  return insights;
}
