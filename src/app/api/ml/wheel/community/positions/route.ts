import { apiJson } from '@/lib/api/response';
/**
 * GET /api/ml/wheel/community/positions
 *
 * Returns community-based suggestions for the user's current open wheel positions.
 * Cross-references open positions with community insights to provide actionable advice.
 */


import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { getCommunityInsight } from '@/lib/ml/wheel/aggregated-model';
import { mlInferenceRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
});

// Suggestion types
type SuggestionType = 'close_profit' | 'close_loss' | 'hold' | 'roll' | 'assignment_warning' | 'no_data';
type SuggestionPriority = 'high' | 'medium' | 'low' | 'info';

interface PositionSuggestion {
  positionId: string;
  symbol: string;
  underlyingTicker: string;
  optionType: string | null;
  strategy: string | null;
  strike: number | null;
  expiration: string | null;
  daysToExpiration: number | null;
  quantity: number;
  costBasis: number;
  currentPnlPercent: number | null;
  suggestion: {
    type: SuggestionType;
    priority: SuggestionPriority;
    title: string;
    description: string;
    action?: string;
  };
  communityData: {
    hasData: boolean;
    winRate?: number;
    assignmentRate?: number;
    avgHoldDays?: number;
    optimalDte?: number;
    recommendation?: string;
    score?: number;
  };
}

/**
 * Extract underlying ticker from option symbol
 * Option symbols typically start with the ticker (e.g., "AAPL 240119C00190000" -> "AAPL")
 */
function extractUnderlyingTicker(symbol: string): string {
  const match = symbol.match(/^([A-Z]+)/);
  return match ? match[1] : symbol;
}

/**
 * Calculate days to expiration
 */
function calculateDTE(expiration: Date | null): number | null {
  if (!expiration) return null;
  const now = new Date();
  const expDate = new Date(expiration);
  const diffTime = expDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Generate suggestion based on position data and community insights
 */
function generateSuggestion(
  position: {
    daysToExpiration: number | null;
    currentPnlPercent: number | null;
    strategy: string | null;
    optionType: string | null;
  },
  communityData: PositionSuggestion['communityData']
): PositionSuggestion['suggestion'] {
  // No community data available
  if (!communityData.hasData) {
    return {
      type: 'no_data',
      priority: 'info',
      title: 'No Community Data',
      description: 'Not enough community data for this ticker to provide suggestions.',
    };
  }

  const { winRate = 0, assignmentRate = 0, avgHoldDays = 30, optimalDte = 30 } = communityData;
  const { daysToExpiration, currentPnlPercent, strategy } = position;

  // Check for assignment warning (high assignment rate + close to expiration)
  if (assignmentRate >= 0.3 && daysToExpiration !== null && daysToExpiration <= 7) {
    return {
      type: 'assignment_warning',
      priority: 'high',
      title: 'Assignment Risk',
      description: `Community shows ${(assignmentRate * 100).toFixed(0)}% assignment rate for this ticker. With ${daysToExpiration} days left, consider rolling or closing.`,
      action: 'Consider rolling to a later expiration',
    };
  }

  // Check for profit-taking opportunity
  if (currentPnlPercent !== null && currentPnlPercent >= 50) {
    const communityClosePoint = winRate >= 0.7 ? '50-75%' : '40-60%';
    return {
      type: 'close_profit',
      priority: 'high',
      title: 'Consider Taking Profit',
      description: `You're at ${currentPnlPercent.toFixed(0)}% profit. Community typically closes ${strategy === 'covered_call' ? 'CCs' : 'CSPs'} at ${communityClosePoint} profit for this ticker.`,
      action: 'Close position to lock in gains',
    };
  }

  // Check for moderate profit with good win rate
  if (currentPnlPercent !== null && currentPnlPercent >= 30 && winRate >= 0.65) {
    return {
      type: 'close_profit',
      priority: 'medium',
      title: 'Solid Profit Level',
      description: `At ${currentPnlPercent.toFixed(0)}% profit with ${(winRate * 100).toFixed(0)}% community win rate. Good opportunity to close and redeploy capital.`,
      action: 'Consider closing for profit',
    };
  }

  // Check for loss with time decay concern
  if (currentPnlPercent !== null && currentPnlPercent < -30 && daysToExpiration !== null && daysToExpiration <= 14) {
    return {
      type: 'close_loss',
      priority: 'high',
      title: 'Manage Risk',
      description: `Position is down ${Math.abs(currentPnlPercent).toFixed(0)}% with limited time remaining. Consider rolling or closing to manage risk.`,
      action: 'Roll to later expiration or close',
    };
  }

  // Check for roll opportunity (past optimal hold time)
  if (daysToExpiration !== null && avgHoldDays && daysToExpiration < avgHoldDays * 0.3) {
    return {
      type: 'roll',
      priority: 'medium',
      title: 'Consider Rolling',
      description: `Community average hold time is ${avgHoldDays.toFixed(0)} days. With ${daysToExpiration} days left, consider rolling to capture more premium.`,
      action: 'Roll to extend duration',
    };
  }

  // Default: Hold
  const holdMessage = daysToExpiration !== null
    ? `${daysToExpiration} days remaining. Community optimal DTE is ${optimalDte} days.`
    : `Community win rate is ${(winRate * 100).toFixed(0)}% for this ticker.`;

  return {
    type: 'hold',
    priority: 'low',
    title: 'Hold Position',
    description: holdMessage,
  };
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlInferenceRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId } = validated.data;

    log.info({ userId, brokerageAccountId }, 'Fetching position suggestions');

    // Get user's open wheel positions (CSP and CC)
    const positions = await prisma.derivedPosition.findMany({
      where: {
        userId,
        quantity: { gt: 0 },
        positionType: 'option',
        strategy: { in: ['cash_secured_put', 'covered_call'] },
        ...(brokerageAccountId ? { brokerageAccountId } : {}),
      },
      select: {
        id: true,
        symbol: true,
        optionType: true,
        strategy: true,
        strike: true,
        expiration: true,
        quantity: true,
        costBasis: true,
        avgPrice: true,
      },
    });

    log.info({ userId, positionCount: positions.length }, 'Found wheel positions');

    // Get unique underlying tickers
    const underlyingTickers = [...new Set(positions.map(p => extractUnderlyingTicker(p.symbol)))];

    // Fetch community insights for all unique tickers (in parallel)
    const insightPromises = underlyingTickers.map(async (ticker) => {
      const insight = await getCommunityInsight(ticker);
      return { ticker, insight };
    });

    const insightsResults = await Promise.all(insightPromises);
    const insightsMap = new Map(insightsResults.map(r => [r.ticker, r.insight]));

    // Generate suggestions for each position
    const suggestions: PositionSuggestion[] = positions.map(position => {
      const underlyingTicker = extractUnderlyingTicker(position.symbol);
      const insight = insightsMap.get(underlyingTicker);
      const daysToExpiration = calculateDTE(position.expiration);

      // Calculate current P&L percent (for options, costBasis is the premium received)
      // For short options (CSP/CC), profit = premium received - current cost to close
      // We don't have real-time prices, so we estimate based on time decay
      let currentPnlPercent: number | null = null;
      if (daysToExpiration !== null && position.expiration) {
        // Rough estimate: assume linear time decay
        const originalDte = 30; // Assume 30 DTE at open (typical)
        const decayPercent = Math.max(0, Math.min(1, 1 - (daysToExpiration / originalDte)));
        currentPnlPercent = decayPercent * 100; // Simplified estimate
      }

      const communityData: PositionSuggestion['communityData'] = insight
        ? {
            hasData: true,
            winRate: insight.winRate,
            assignmentRate: insight.assignmentRate,
            avgHoldDays: insight.avgHoldDays,
            optimalDte: insight.optimalStrategy?.dte,
            recommendation: insight.recommendation,
            score: insight.score,
          }
        : { hasData: false };

      const suggestion = generateSuggestion(
        {
          daysToExpiration,
          currentPnlPercent,
          strategy: position.strategy,
          optionType: position.optionType,
        },
        communityData
      );

      return {
        positionId: position.id,
        symbol: position.symbol,
        underlyingTicker,
        optionType: position.optionType,
        strategy: position.strategy,
        strike: position.strike?.toNumber() ?? null,
        expiration: position.expiration?.toISOString().split('T')[0] ?? null,
        daysToExpiration,
        quantity: position.quantity.toNumber(),
        costBasis: position.costBasis.toNumber(),
        currentPnlPercent,
        suggestion,
        communityData,
      };
    });

    // Sort by priority (high first)
    const priorityOrder: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2, info: 3 };
    suggestions.sort((a, b) => priorityOrder[a.suggestion.priority] - priorityOrder[b.suggestion.priority]);

    log.info({ userId, suggestionCount: suggestions.length }, 'Generated position suggestions');

    return apiJson({
      suggestions,
      summary: {
        totalPositions: suggestions.length,
        highPriority: suggestions.filter(s => s.suggestion.priority === 'high').length,
        mediumPriority: suggestions.filter(s => s.suggestion.priority === 'medium').length,
        withCommunityData: suggestions.filter(s => s.communityData.hasData).length,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get position suggestions');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get position suggestions' },
      { status: 500 }
    );
  }
}

