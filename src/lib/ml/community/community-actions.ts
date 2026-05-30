/**
 * Community Actions Generator
 *
 * Generates actionable recommendations based on community insights
 * for the user's current positions.
 */

import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { getCommunityInsight, getStrategyInsights } from './community-model';
import { buildAccountScope } from '@/lib/db/account-scope';

const log = createChildLogger({ module: 'community-actions' });

// ============================================================================
// Types
// ============================================================================

export type CommunityActionType =
  | 'hold_winner'
  | 'consider_exit'
  | 'add_position'
  | 'avoid_ticker'
  | 'strategy_switch'
  | 'wheel_opportunity'
  | 'premium_opportunity'
  | 'risk_warning';

export interface CommunityAction {
  id: string;
  type: CommunityActionType;
  priority: 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  symbol: string;
  title: string;
  description: string;
  reasoning: string[];
  source: 'community';
  communityData: {
    totalTrades: number;
    uniqueTraders: number;
    winRate: number;
    recommendation: string;
  };
  suggestedAction?: {
    action: string;
    details: string;
  };
}

// ============================================================================
// Action Generation
// ============================================================================

/**
 * Generate actionable recommendations based on community insights
 * for the user's current positions.
 */
export async function generateCommunityActions(
  userId: string,
  accountId?: string | null
): Promise<CommunityAction[]> {
  const actions: CommunityAction[] = [];

  try {
    // Get user's current positions
    const positions = await prisma.derivedPosition.findMany({
      where: {
        userId,
        quantity: { not: 0 },
        ...buildAccountScope(accountId),
      },
      select: {
        id: true,
        symbol: true,
        positionType: true,
        strategy: true,
        quantity: true,
        avgPrice: true,
        strike: true,
        expiration: true,
      },
    });

    if (positions.length === 0) {
      return actions;
    }

    // Convert Prisma positions to PositionData
    const convertedPositions: PositionData[] = positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      positionType: p.positionType,
      strategy: p.strategy,
      quantity: Number(p.quantity),
      avgPrice: p.avgPrice ? Number(p.avgPrice) : null,
      strike: p.strike ? Number(p.strike) : null,
      expiration: p.expiration,
    }));

    // Get unique base symbols from positions
    const baseSymbols = new Set<string>();
    for (const pos of convertedPositions) {
      const baseSymbol = extractBaseSymbol(pos.symbol);
      baseSymbols.add(baseSymbol);
    }

    // Get community insights for each symbol in parallel.
    // Keep the list bounded so one request cannot fan out indefinitely.
    const symbolsToEvaluate = Array.from(baseSymbols).slice(0, 20);
    const symbolInsightResults = await Promise.all(
      symbolsToEvaluate.map(async (symbol) => {
        try {
          const insight = await getCommunityInsight(symbol);
          return { symbol, insight };
        } catch (error) {
          log.debug({ symbol, error }, 'Failed to load community insight for symbol');
          return { symbol, insight: null };
        }
      })
    );

    for (const { symbol, insight } of symbolInsightResults) {
      if (!insight) continue;

      const userPositions = convertedPositions.filter(
        (p) => extractBaseSymbol(p.symbol) === symbol
      );

      // Generate actions based on community data
      const symbolActions = generateSymbolActions(symbol, insight, userPositions);
      actions.push(...symbolActions);
    }

    // Get strategy insights and suggest strategy switches
    const strategyInsights = await getStrategyInsights();
    const strategyActions = generateStrategyActions(convertedPositions, strategyInsights);
    actions.push(...strategyActions);

    // Sort by priority and confidence
    actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Limit to top 8 actions
    return actions.slice(0, 8);
  } catch (error) {
    log.error({ error }, 'Failed to generate community actions');
    return [];
  }
}

// ============================================================================
// Symbol-Based Actions
// ============================================================================

interface PositionData {
  id: string;
  symbol: string;
  positionType: string;
  strategy: string | null;
  quantity: number;
  avgPrice: number | null;
  strike: number | null;
  expiration: Date | null;
}

function generateSymbolActions(
  symbol: string,
  insight: {
    totalTrades: number;
    uniqueTraders: number;
    score: number;
    confidence: number;
    recommendation: string;
    stockStats: { winRate: number; avgReturnPct: number };
    optionsStats: { winRate: number; avgReturnPct: number; bestStrategy: string | null; bestStrategyWinRate: number };
    wheelStats: { winRate: number; assignmentRate: number };
    insights: string[];
  },
  userPositions: PositionData[]
): CommunityAction[] {
  const actions: CommunityAction[] = [];
  const communityData = {
    totalTrades: insight.totalTrades,
    uniqueTraders: insight.uniqueTraders,
    winRate: Math.max(insight.stockStats.winRate, insight.optionsStats.winRate),
    recommendation: insight.recommendation,
  };

  // Strong buy recommendation - suggest adding
  if (insight.recommendation === 'strong_buy' && insight.confidence >= 0.6) {
    const hasStockPosition = userPositions.some((p) => p.positionType === 'stock');
    const hasOptionPosition = userPositions.some((p) => p.positionType === 'option');

    if (!hasStockPosition && insight.stockStats.winRate >= 0.7) {
      actions.push({
        id: `community-add-stock-${symbol}`,
        type: 'add_position',
        priority: 'medium',
        confidence: Math.round(insight.confidence * 100),
        symbol,
        title: `Consider adding ${symbol} stock`,
        description: `Community traders have ${(insight.stockStats.winRate * 100).toFixed(0)}% win rate on ${symbol} stock trades`,
        reasoning: [
          `${insight.totalTrades} community trades with ${(insight.stockStats.winRate * 100).toFixed(0)}% win rate`,
          `Average return: ${insight.stockStats.avgReturnPct.toFixed(1)}%`,
          ...insight.insights.slice(0, 2),
        ],
        source: 'community',
        communityData,
        suggestedAction: {
          action: 'Buy stock',
          details: `Community data suggests strong performance for ${symbol} stock positions`,
        },
      });
    }

    // Suggest wheel if good for wheel
    if (!hasOptionPosition && insight.wheelStats.winRate >= 0.7) {
      actions.push({
        id: `community-wheel-${symbol}`,
        type: 'wheel_opportunity',
        priority: 'medium',
        confidence: Math.round(insight.confidence * 100),
        symbol,
        title: `${symbol} - Great for wheel strategy`,
        description: `Community has ${(insight.wheelStats.winRate * 100).toFixed(0)}% win rate on ${symbol} wheel trades`,
        reasoning: [
          `${insight.wheelStats.winRate >= 0.75 ? 'Excellent' : 'Good'} wheel performance`,
          `Assignment rate: ${(insight.wheelStats.assignmentRate * 100).toFixed(0)}%`,
          `${insight.uniqueTraders} traders wheeling this ticker`,
        ],
        source: 'community',
        communityData,
        suggestedAction: {
          action: 'Sell CSP or CC',
          details: `Consider selling cash-secured puts or covered calls on ${symbol}`,
        },
      });
    }
  }

  // Avoid recommendation - warn if holding
  if (insight.recommendation === 'avoid' && userPositions.length > 0) {
    actions.push({
      id: `community-warning-${symbol}`,
      type: 'risk_warning',
      priority: 'high',
      confidence: Math.round(insight.confidence * 100),
      symbol,
      title: `Caution: ${symbol} has poor community performance`,
      description: `Community traders have low win rates on ${symbol}`,
      reasoning: [
        `Community win rate: ${(communityData.winRate * 100).toFixed(0)}%`,
        `Based on ${insight.totalTrades} trades from ${insight.uniqueTraders} traders`,
        'Consider reducing exposure or setting stop-loss',
      ],
      source: 'community',
      communityData,
      suggestedAction: {
        action: 'Review position',
        details: 'Consider setting stop-loss or reducing position size',
      },
    });
  }

  // Hold winner - if holding a strong performer
  if (
    insight.recommendation === 'strong_buy' &&
    userPositions.some((p) => p.positionType === 'stock')
  ) {
    actions.push({
      id: `community-hold-${symbol}`,
      type: 'hold_winner',
      priority: 'low',
      confidence: Math.round(insight.confidence * 100),
      symbol,
      title: `${symbol} - Community favorite`,
      description: `Your ${symbol} position aligns with community's top picks`,
      reasoning: [
        `${(communityData.winRate * 100).toFixed(0)}% win rate across ${insight.totalTrades} trades`,
        `${insight.uniqueTraders} community traders have success with this ticker`,
        ...insight.insights.slice(0, 1),
      ],
      source: 'community',
      communityData,
    });
  }

  // Suggest best strategy if user has option positions
  const userOptionPositions = userPositions.filter((p) => p.positionType === 'option');
  if (
    userOptionPositions.length > 0 &&
    insight.optionsStats.bestStrategy &&
    insight.optionsStats.bestStrategyWinRate >= 0.7
  ) {
    const userStrategies = new Set(userOptionPositions.map((p) => p.strategy).filter(Boolean));
    if (!userStrategies.has(insight.optionsStats.bestStrategy)) {
      actions.push({
        id: `community-strategy-${symbol}`,
        type: 'strategy_switch',
        priority: 'low',
        confidence: Math.round(insight.optionsStats.bestStrategyWinRate * 100),
        symbol,
        title: `Try ${formatStrategyName(insight.optionsStats.bestStrategy)} on ${symbol}`,
        description: `Community's best strategy for ${symbol} is ${formatStrategyName(insight.optionsStats.bestStrategy)}`,
        reasoning: [
          `${(insight.optionsStats.bestStrategyWinRate * 100).toFixed(0)}% win rate`,
          `Your current strategies may not be optimal for ${symbol}`,
        ],
        source: 'community',
        communityData,
        suggestedAction: {
          action: `Use ${formatStrategyName(insight.optionsStats.bestStrategy)}`,
          details: `Community data shows better results with this strategy`,
        },
      });
    }
  }

  return actions;
}

// ============================================================================
// Strategy-Based Actions
// ============================================================================

interface StrategyInsight {
  strategy: string;
  winRate: number;
  avgReturnPct: number;
  totalTrades: number;
  uniqueTraders: number;
  bestTickers: string[];
  recommendation: string;
}

function generateStrategyActions(
  positions: PositionData[],
  strategyInsights: StrategyInsight[]
): CommunityAction[] {
  const actions: CommunityAction[] = [];

  // Find underperforming strategies user is using
  const userStrategies = new Set(
    positions.map((p) => p.strategy).filter(Boolean) as string[]
  );

  for (const strategy of userStrategies) {
    const insight = strategyInsights.find((s) => s.strategy === strategy);
    if (!insight) continue;

    if (insight.recommendation === 'avoid' || insight.winRate < 0.4) {
      // Find better alternative
      const betterStrategies = strategyInsights
        .filter((s) => s.recommendation === 'strong' || s.recommendation === 'moderate')
        .slice(0, 2);

      if (betterStrategies.length > 0) {
        actions.push({
          id: `strategy-switch-${strategy}`,
          type: 'strategy_switch',
          priority: 'medium',
          confidence: Math.round((1 - insight.winRate) * 100),
          symbol: insight.bestTickers[0] || 'GENERAL',
          title: `Consider switching from ${formatStrategyName(strategy)}`,
          description: `Community win rate for ${formatStrategyName(strategy)} is only ${(insight.winRate * 100).toFixed(0)}%`,
          reasoning: [
            `Your strategy has ${(insight.winRate * 100).toFixed(0)}% community win rate`,
            `Better alternatives: ${betterStrategies.map((s) => formatStrategyName(s.strategy)).join(', ')}`,
            `Top performing strategy: ${formatStrategyName(betterStrategies[0].strategy)} with ${(betterStrategies[0].winRate * 100).toFixed(0)}% win rate`,
          ],
          source: 'community',
          communityData: {
            totalTrades: insight.totalTrades,
            uniqueTraders: insight.uniqueTraders,
            winRate: insight.winRate,
            recommendation: insight.recommendation,
          },
          suggestedAction: {
            action: `Try ${formatStrategyName(betterStrategies[0].strategy)}`,
            details: `Community data shows ${(betterStrategies[0].winRate * 100).toFixed(0)}% win rate`,
          },
        });
      }
    }
  }

  // Suggest top strategies user isn't using
  const topStrategies = strategyInsights
    .filter(
      (s) =>
        (s.recommendation === 'strong' || s.recommendation === 'moderate') &&
        !userStrategies.has(s.strategy)
    )
    .slice(0, 2);

  for (const strategy of topStrategies) {
    actions.push({
      id: `strategy-opportunity-${strategy.strategy}`,
      type: 'premium_opportunity',
      priority: 'low',
      confidence: Math.round(strategy.winRate * 100),
      symbol: strategy.bestTickers[0] || 'VARIOUS',
      title: `Explore ${formatStrategyName(strategy.strategy)}`,
      description: `Community has ${(strategy.winRate * 100).toFixed(0)}% win rate with this strategy`,
      reasoning: [
        `${strategy.totalTrades} trades from ${strategy.uniqueTraders} traders`,
        `Average return: ${strategy.avgReturnPct.toFixed(1)}%`,
        `Best tickers: ${strategy.bestTickers.slice(0, 3).join(', ')}`,
      ],
      source: 'community',
      communityData: {
        totalTrades: strategy.totalTrades,
        uniqueTraders: strategy.uniqueTraders,
        winRate: strategy.winRate,
        recommendation: strategy.recommendation,
      },
      suggestedAction: {
        action: `Learn ${formatStrategyName(strategy.strategy)}`,
        details: `Try on ${strategy.bestTickers.slice(0, 2).join(' or ')}`,
      },
    });
  }

  return actions;
}

// ============================================================================
// Helpers
// ============================================================================

function extractBaseSymbol(symbol: string): string {
  const parts = symbol.split(' ');
  return parts[0];
}

function formatStrategyName(strategy: string): string {
  const names: Record<string, string> = {
    cash_secured_put: 'Cash-Secured Put',
    covered_call: 'Covered Call',
    long_call: 'Long Call',
    long_put: 'Long Put',
    bull_call_spread: 'Bull Call Spread',
    bear_put_spread: 'Bear Put Spread',
    iron_condor: 'Iron Condor',
    straddle: 'Straddle',
    strangle: 'Strangle',
  };
  return names[strategy] || strategy.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
