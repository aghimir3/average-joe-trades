/**
 * P&L Attribution Model
 * Analyzes WHY trades won or lost by attributing P&L to different factors:
 * - Delta contribution (price movement impact)
 * - Theta contribution (time decay captured)
 * - Vega contribution (volatility change impact)
 * - Execution impact (entry/exit timing)
 */

import { prisma } from '@/lib/prisma';
import type { PnLAttribution } from './types';

// ============================================================================
// Main Attribution Function
// ============================================================================

export async function calculatePnLAttribution(
  userId: string,
  realizedCloseId: string
): Promise<PnLAttribution> {
  const trade = await prisma.realizedClose.findUnique({
    where: { id: realizedCloseId },
  });

  if (!trade) {
    return createEmptyAttribution();
  }

  return attributePnL(trade);
}

export async function calculatePortfolioPnLAttribution(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<PnLAttribution> {
  const where: {
    userId: string;
    closeType: string;
    hasUnknownBasis: boolean;
    closeDate?: { gte?: Date; lte?: Date };
  } = {
    userId,
    closeType: 'option',
    hasUnknownBasis: false,
  };

  if (startDate || endDate) {
    where.closeDate = {};
    if (startDate) where.closeDate.gte = startDate;
    if (endDate) where.closeDate.lte = endDate;
  }

  const trades = await prisma.realizedClose.findMany({ where });

  if (trades.length === 0) {
    return createEmptyAttribution();
  }

  // Aggregate attributions
  const attributions = trades.map((trade) => attributePnL(trade));

  const totalPnL = attributions.reduce((sum, a) => sum + a.totalPnL, 0);
  const breakdown = {
    deltaContribution: attributions.reduce((sum, a) => sum + a.breakdown.deltaContribution, 0),
    thetaContribution: attributions.reduce((sum, a) => sum + a.breakdown.thetaContribution, 0),
    vegaContribution: attributions.reduce((sum, a) => sum + a.breakdown.vegaContribution, 0),
    executionImpact: attributions.reduce((sum, a) => sum + a.breakdown.executionImpact, 0),
    otherFactors: attributions.reduce((sum, a) => sum + a.breakdown.otherFactors, 0),
  };

  const totalAttributed =
    Math.abs(breakdown.deltaContribution) +
    Math.abs(breakdown.thetaContribution) +
    Math.abs(breakdown.vegaContribution) +
    Math.abs(breakdown.executionImpact) +
    Math.abs(breakdown.otherFactors);

  const percentages = totalAttributed > 0
    ? {
        delta: (Math.abs(breakdown.deltaContribution) / totalAttributed) * 100,
        theta: (Math.abs(breakdown.thetaContribution) / totalAttributed) * 100,
        vega: (Math.abs(breakdown.vegaContribution) / totalAttributed) * 100,
        execution: (Math.abs(breakdown.executionImpact) / totalAttributed) * 100,
        other: (Math.abs(breakdown.otherFactors) / totalAttributed) * 100,
      }
    : { delta: 20, theta: 20, vega: 20, execution: 20, other: 20 };

  const insights = generateAggregateInsights(attributions, totalPnL, percentages);

  return {
    totalPnL,
    breakdown,
    percentages,
    insights,
  };
}

// ============================================================================
// Attribution Logic
// ============================================================================

function attributePnL(trade: {
  symbol: string;
  openDate: Date;
  closeDate: Date;
  openPrice: unknown;
  closePrice: unknown;
  strike: unknown;
  expiration: Date | null;
  realizedPnL: unknown;
  quantity: unknown;
  optionType: string | null;
  closeReason: string | null;
}): PnLAttribution {
  const openPrice = Math.abs(Number(trade.openPrice));
  const closePrice = Math.abs(Number(trade.closePrice || 0));
  const pnl = Number(trade.realizedPnL);
  const quantity = Math.abs(Number(trade.quantity));
  const multiplier = 100;

  // Calculate time-based factors
  const holdDays = Math.max(
    1,
    (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
      (24 * 60 * 60 * 1000)
  );

  const dteAtOpen = trade.expiration
    ? Math.max(
        1,
        (new Date(trade.expiration).getTime() - new Date(trade.openDate).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : 30;

  // Estimate Greeks contributions

  // 1. THETA CONTRIBUTION
  // Premium decay over time - for short positions (covered calls, CSPs)
  // Theta benefit = (DTE at open - DTE at close) / DTE at open * premium
  const thetaDecayRatio = dteAtOpen > 0 ? holdDays / dteAtOpen : 0;
  const thetaContribution = openPrice * thetaDecayRatio * quantity * multiplier * 0.5;

  // 2. DELTA CONTRIBUTION
  // Estimate based on price movement implied by P&L
  // If option moved a lot, delta played a bigger role
  const priceChange = closePrice - openPrice;
  const estimatedDelta = trade.optionType === 'call' ? 0.5 : -0.5;
  const deltaContribution = priceChange * quantity * multiplier * Math.abs(estimatedDelta);

  // 3. VEGA CONTRIBUTION
  // Volatility changes - harder to estimate without IV data
  // Use residual approach: what's left after theta and delta
  const unexplained = pnl - (thetaContribution + deltaContribution);
  const vegaContribution = unexplained * 0.3; // Attribute 30% of unexplained to vega

  // 4. EXECUTION IMPACT
  // Entry/exit timing quality
  // Compare to average outcomes
  const executionImpact = unexplained * 0.2; // Attribute 20% to execution

  // 5. OTHER FACTORS
  // Everything else (gamma, rho, etc.)
  const otherFactors = unexplained - vegaContribution - executionImpact;

  // Normalize so breakdown sums to total P&L
  const breakdown = {
    deltaContribution: normalizeContribution(deltaContribution, pnl),
    thetaContribution: normalizeContribution(thetaContribution, pnl),
    vegaContribution: normalizeContribution(vegaContribution, pnl),
    executionImpact: normalizeContribution(executionImpact, pnl),
    otherFactors: normalizeContribution(otherFactors, pnl),
  };

  // Recalculate to ensure sum equals total
  const sumBreakdown =
    breakdown.deltaContribution +
    breakdown.thetaContribution +
    breakdown.vegaContribution +
    breakdown.executionImpact +
    breakdown.otherFactors;

  if (Math.abs(sumBreakdown - pnl) > 0.01) {
    breakdown.otherFactors += pnl - sumBreakdown;
  }

  // Calculate percentages
  const totalAttributed =
    Math.abs(breakdown.deltaContribution) +
    Math.abs(breakdown.thetaContribution) +
    Math.abs(breakdown.vegaContribution) +
    Math.abs(breakdown.executionImpact) +
    Math.abs(breakdown.otherFactors);

  const percentages = totalAttributed > 0
    ? {
        delta: (Math.abs(breakdown.deltaContribution) / totalAttributed) * 100,
        theta: (Math.abs(breakdown.thetaContribution) / totalAttributed) * 100,
        vega: (Math.abs(breakdown.vegaContribution) / totalAttributed) * 100,
        execution: (Math.abs(breakdown.executionImpact) / totalAttributed) * 100,
        other: (Math.abs(breakdown.otherFactors) / totalAttributed) * 100,
      }
    : { delta: 20, theta: 20, vega: 20, execution: 20, other: 20 };

  const insights = generateTradeInsights(trade, breakdown, percentages, holdDays, dteAtOpen);

  return {
    totalPnL: pnl,
    breakdown,
    percentages,
    insights,
  };
}

// ============================================================================
// Insights Generation
// ============================================================================

function generateTradeInsights(
  trade: {
    symbol: string;
    optionType: string | null;
    closeReason: string | null;
  },
  breakdown: PnLAttribution['breakdown'],
  percentages: PnLAttribution['percentages'],
  holdDays: number,
  dteAtOpen: number
): string[] {
  const insights: string[] = [];
  const isWin = breakdown.deltaContribution + breakdown.thetaContribution > 0;

  // Primary driver
  const maxContributor = Object.entries(percentages).sort((a, b) => b[1] - a[1])[0];

  switch (maxContributor[0]) {
    case 'theta':
      if (breakdown.thetaContribution > 0) {
        insights.push('Time decay was the primary profit driver');
        if (holdDays < dteAtOpen * 0.5) {
          insights.push('Captured theta efficiently by closing early');
        }
      } else {
        insights.push('Time decay worked against this position');
      }
      break;
    case 'delta':
      if (breakdown.deltaContribution > 0) {
        insights.push('Favorable price movement drove profits');
      } else {
        insights.push('Adverse price movement caused losses');
      }
      break;
    case 'vega':
      if (breakdown.vegaContribution > 0) {
        insights.push('Volatility changes contributed positively');
      } else {
        insights.push('Volatility crush impacted returns negatively');
      }
      break;
    case 'execution':
      insights.push('Entry/exit timing significantly impacted returns');
      break;
  }

  // Secondary insights
  if (percentages.theta > 40 && breakdown.thetaContribution > 0) {
    insights.push('Strong theta capture - good for income strategies');
  }

  if (trade.closeReason === 'expired') {
    if (isWin) {
      insights.push('Full premium captured through expiration');
    } else {
      insights.push('Position expired with a loss');
    }
  }

  if (holdDays < 7 && isWin) {
    insights.push('Quick profit - consider if early exit was optimal');
  }

  return insights;
}

function generateAggregateInsights(
  attributions: PnLAttribution[],
  totalPnL: number,
  percentages: PnLAttribution['percentages']
): string[] {
  const insights: string[] = [];

  // Primary P&L driver across portfolio
  const maxContributor = Object.entries(percentages).sort((a, b) => b[1] - a[1])[0];

  insights.push(`Primary P&L driver: ${formatContributor(maxContributor[0])} (${maxContributor[1].toFixed(0)}%)`);

  // Theta analysis
  const totalTheta = attributions.reduce((sum, a) => sum + a.breakdown.thetaContribution, 0);
  if (totalTheta > 0) {
    insights.push(`Time decay contributed $${totalTheta.toFixed(0)} to profits`);
  } else if (totalTheta < 0) {
    insights.push(`Time decay cost you $${Math.abs(totalTheta).toFixed(0)}`);
  }

  // Win vs loss patterns
  const wins = attributions.filter((a) => a.totalPnL > 0);
  const losses = attributions.filter((a) => a.totalPnL < 0);

  if (wins.length > 0 && losses.length > 0) {
    const avgWinTheta = wins.reduce((sum, a) => sum + a.percentages.theta, 0) / wins.length;
    const avgLossTheta = losses.reduce((sum, a) => sum + a.percentages.theta, 0) / losses.length;

    if (avgWinTheta > avgLossTheta + 10) {
      insights.push('Winners show stronger theta capture than losers');
    }
  }

  // Execution analysis
  const avgExecution = attributions.reduce((sum, a) => sum + a.percentages.execution, 0) / attributions.length;
  if (avgExecution > 25) {
    insights.push('Execution timing has significant impact - consider entry/exit optimization');
  }

  return insights;
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeContribution(contribution: number, total: number): number {
  if (total === 0) return 0;
  // Cap contribution to not exceed total magnitude
  if (Math.abs(contribution) > Math.abs(total) * 2) {
    return (Math.sign(contribution) * Math.abs(total)) / 3;
  }
  return contribution;
}

function formatContributor(key: string): string {
  const names: Record<string, string> = {
    delta: 'Price Movement (Delta)',
    theta: 'Time Decay (Theta)',
    vega: 'Volatility (Vega)',
    execution: 'Entry/Exit Timing',
    other: 'Other Factors',
  };
  return names[key] || key;
}

function createEmptyAttribution(): PnLAttribution {
  return {
    totalPnL: 0,
    breakdown: {
      deltaContribution: 0,
      thetaContribution: 0,
      vegaContribution: 0,
      executionImpact: 0,
      otherFactors: 0,
    },
    percentages: {
      delta: 20,
      theta: 20,
      vega: 20,
      execution: 20,
      other: 20,
    },
    insights: ['No trade data available for attribution'],
  };
}

// ============================================================================
// Batch Attribution for Analytics
// ============================================================================

export async function getAttributionByStrategy(
  userId: string
): Promise<Map<string, PnLAttribution>> {
  const trades = await prisma.realizedClose.findMany({
    where: {
      userId,
      closeType: 'option',
      hasUnknownBasis: false,
      strategy: { not: null },
    },
  });

  const byStrategy = new Map<string, typeof trades>();
  for (const trade of trades) {
    const strategy = trade.strategy || 'unknown';
    const existing = byStrategy.get(strategy) || [];
    existing.push(trade);
    byStrategy.set(strategy, existing);
  }

  const result = new Map<string, PnLAttribution>();
  for (const [strategy, strategyTrades] of byStrategy.entries()) {
    const attributions = strategyTrades.map((trade) => attributePnL(trade));

    const totalPnL = attributions.reduce((sum, a) => sum + a.totalPnL, 0);
    const breakdown = {
      deltaContribution: attributions.reduce((sum, a) => sum + a.breakdown.deltaContribution, 0),
      thetaContribution: attributions.reduce((sum, a) => sum + a.breakdown.thetaContribution, 0),
      vegaContribution: attributions.reduce((sum, a) => sum + a.breakdown.vegaContribution, 0),
      executionImpact: attributions.reduce((sum, a) => sum + a.breakdown.executionImpact, 0),
      otherFactors: attributions.reduce((sum, a) => sum + a.breakdown.otherFactors, 0),
    };

    const totalAttributed =
      Math.abs(breakdown.deltaContribution) +
      Math.abs(breakdown.thetaContribution) +
      Math.abs(breakdown.vegaContribution) +
      Math.abs(breakdown.executionImpact) +
      Math.abs(breakdown.otherFactors);

    const percentages = totalAttributed > 0
      ? {
          delta: (Math.abs(breakdown.deltaContribution) / totalAttributed) * 100,
          theta: (Math.abs(breakdown.thetaContribution) / totalAttributed) * 100,
          vega: (Math.abs(breakdown.vegaContribution) / totalAttributed) * 100,
          execution: (Math.abs(breakdown.executionImpact) / totalAttributed) * 100,
          other: (Math.abs(breakdown.otherFactors) / totalAttributed) * 100,
        }
      : { delta: 20, theta: 20, vega: 20, execution: 20, other: 20 };

    result.set(strategy, {
      totalPnL,
      breakdown,
      percentages,
      insights: [`${strategy.replace('_', ' ')}: ${strategyTrades.length} trades analyzed`],
    });
  }

  return result;
}
