/**
 * Feature Engineering Service for Wheel Strategy ML
 * Extracts features from historical trades and positions for model training/inference
 */

import { prisma } from '@/lib/prisma';
import type {
  WheelCandidateFeatures,
  StrikeDteFeatures,
  RollDecisionFeatures,
  CandidateTrainingExample,
} from './types';

// ============================================================================
// Candidate Ranking Features
// ============================================================================

// Feature names for candidate ranker (must match model input order)
export const CANDIDATE_FEATURE_NAMES = [
  'estimatedIvRank',
  'avgPremiumToStrikeRatio',
  'premiumTrend',
  'userWheelWinRate',
  'userWheelTradesCount',
  'userAvgPremiumCaptured',
  'userAvgHoldDays',
  'userAssignmentRate',
  'priceChange30d',
  'daysSinceLastWheelTrade',
  'hasOpenPosition',
  'todayWinRate', // Win rate for today's day of week (0-1)
] as const;

/**
 * Extract candidate features for a symbol
 */
export async function extractCandidateFeatures(
  userId: string,
  symbol: string
): Promise<WheelCandidateFeatures> {
  // Get current position from SnapTrade cache
  const brokerPosition = await prisma.brokerPosition.findFirst({
    where: { userId, symbol },
    orderBy: { lastSyncAt: 'desc' },
  });

  // Get user's wheel history with this stock
  const wheelHistory = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
    orderBy: { closeDate: 'desc' },
  });

  // Calculate win rate
  const wins = wheelHistory.filter((t) => Number(t.realizedPnL) > 0);
  const winRate = wheelHistory.length > 0 ? wins.length / wheelHistory.length : 0;

  // Calculate averages
  const avgPremium =
    wheelHistory.length > 0
      ? wheelHistory.reduce((sum, t) => sum + Math.abs(Number(t.openAmount)), 0) / wheelHistory.length
      : 0;

  const avgHoldDays =
    wheelHistory.length > 0
      ? wheelHistory.reduce((sum, t) => {
          const openDate = new Date(t.openDate);
          const closeDate = new Date(t.closeDate);
          return sum + Math.ceil((closeDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / wheelHistory.length
      : 0;

  // Calculate assignment rate
  const assignments = wheelHistory.filter((t) => t.closeReason === 'assigned');
  const assignmentRate = wheelHistory.length > 0 ? assignments.length / wheelHistory.length : 0;

  // Get IV metrics from historical premiums
  const ivMetrics = await estimateIVFromUserHistory(userId, symbol);

  // Get price from last trade if no live position
  const lastTrade = wheelHistory[0];
  const currentPrice = brokerPosition?.marketPrice
    ? Number(brokerPosition.marketPrice)
    : lastTrade
      ? Number(lastTrade.closePrice)
      : 0;

  // Calculate price change over 30 days from trade history
  const priceChange30d = calculatePriceChange30d(wheelHistory);

  // Days since last trade
  const daysSinceLastTrade = lastTrade
    ? Math.ceil((Date.now() - new Date(lastTrade.closeDate).getTime()) / (1000 * 60 * 60 * 24))
    : 365;

  // First and last trade prices
  const sortedByDate = [...wheelHistory].sort(
    (a, b) => new Date(a.openDate).getTime() - new Date(b.openDate).getTime()
  );
  const priceAtFirstTrade = sortedByDate.length > 0 ? Number(sortedByDate[0].openPrice) : 0;
  const priceAtLastTrade = lastTrade ? Number(lastTrade.closePrice) : 0;

  // Day-of-week patterns
  const dayOfWeekStats = calculateDayOfWeekStats(wheelHistory);

  return {
    symbol,
    currentPrice,
    currentShares: brokerPosition?.quantity ? Number(brokerPosition.quantity) : 0,
    unrealizedPnl: brokerPosition?.unrealizedPnL ? Number(brokerPosition.unrealizedPnL) : 0,

    estimatedIvRank: ivMetrics.ivRank,
    avgPremiumToStrikeRatio: ivMetrics.avgPremiumPct,
    premiumTrend: ivMetrics.trend,

    userWheelTradesCount: wheelHistory.length,
    userWheelWinRate: winRate,
    userAvgPremiumCaptured: avgPremium,
    userAvgHoldDays: avgHoldDays,
    userAssignmentRate: assignmentRate,
    userTotalPnlOnSymbol: wheelHistory.reduce((sum, t) => sum + Number(t.realizedPnL), 0),

    priceAtFirstTrade,
    priceAtLastTrade,
    priceChange30d,

    daysSinceLastWheelTrade: daysSinceLastTrade,
    hasOpenPosition: brokerPosition !== null,

    bestDayOfWeek: dayOfWeekStats.bestDay,
    worstDayOfWeek: dayOfWeekStats.worstDay,
    todayWinRate: dayOfWeekStats.todayWinRate,
  };
}

/**
 * Convert candidate features to numeric array for model input
 */
export function candidateFeaturesToArray(features: WheelCandidateFeatures): number[] {
  return [
    features.estimatedIvRank / 100, // Normalize to 0-1
    features.avgPremiumToStrikeRatio,
    features.premiumTrend,
    features.userWheelWinRate,
    Math.min(features.userWheelTradesCount / 100, 1), // Cap and normalize
    features.userAvgPremiumCaptured / 1000, // Normalize to typical range
    features.userAvgHoldDays / 45, // Normalize (45 days typical max)
    features.userAssignmentRate,
    features.priceChange30d / 100, // Normalize percentage
    Math.min(features.daysSinceLastWheelTrade / 365, 1), // Normalize (cap at 1 year)
    features.hasOpenPosition ? 1 : 0,
    features.todayWinRate, // Already 0-1
  ];
}

// ============================================================================
// Strike/DTE Features
// ============================================================================

export const STRIKE_FEATURE_NAMES = [
  'direction', // 0=csp, 1=cc
  'avgPremiumPct_7_14',
  'avgPremiumPct_14_30',
  'avgPremiumPct_30_45',
  'recentPremiumTrend',
  'userPreferredDte',
  'userAvgStrikeDistance',
  'tradesOnSymbol',
  'winRateOnSymbol',
] as const;

/**
 * Extract features for strike/DTE optimization
 */
export async function extractStrikeFeatures(
  userId: string,
  symbol: string,
  direction: 'csp' | 'covered_call'
): Promise<StrikeDteFeatures> {
  const strategyFilter = direction === 'csp' ? 'cash_secured_put' : 'covered_call';

  // Get all trades for this symbol and direction
  const trades = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol,
      strategy: strategyFilter,
      hasUnknownBasis: false,
    },
    orderBy: { closeDate: 'desc' },
  });

  // Get current price - try broker position first, then fall back to last trade price
  const brokerPosition = await prisma.brokerPosition.findFirst({
    where: { userId, symbol },
    orderBy: { lastSyncAt: 'desc' },
  });
  let currentPrice = brokerPosition?.marketPrice ? Number(brokerPosition.marketPrice) : 0;

  // If no broker position or price is 0, use the last trade's close price as fallback
  if (currentPrice === 0 && trades.length > 0) {
    currentPrice = Number(trades[0].closePrice) || 0;
  }

  // Group trades by DTE bucket and calculate avg premium %
  const avgPremiumPctByDte = calculatePremiumByDteBucket(trades);

  // Calculate premium trend
  const recentTrades = trades.slice(0, 10);
  const olderTrades = trades.slice(10, 20);
  const recentAvgPremium =
    recentTrades.length > 0
      ? recentTrades.reduce((sum, t) => sum + Math.abs(Number(t.openAmount)), 0) / recentTrades.length
      : 0;
  const olderAvgPremium =
    olderTrades.length > 0
      ? olderTrades.reduce((sum, t) => sum + Math.abs(Number(t.openAmount)), 0) / olderTrades.length
      : recentAvgPremium;
  const premiumTrend = olderAvgPremium > 0 ? (recentAvgPremium - olderAvgPremium) / olderAvgPremium : 0;

  // User's preferred DTE (mode)
  const userPreferredDte = calculatePreferredDte(trades);

  // User's average strike distance
  const userAvgStrikeDistance = calculateAvgStrikeDistance(trades);

  // Win rate by DTE bucket
  const userWinRateByDteBucket = calculateWinRateByDteBucket(trades);

  // Win rate by strike distance
  const userWinRateByStrikeDistance = calculateWinRateByStrikeDistance(trades);

  // Average stock move over hold period
  const avgMoveOverHoldPeriod = calculateAvgStockMove(trades);

  // Assignment rate by strike distance
  const assignmentRateByStrikeDistance = calculateAssignmentRateByStrikeDistance(trades);

  const wins = trades.filter((t) => Number(t.realizedPnL) > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgPnl = trades.length > 0 ? trades.reduce((sum, t) => sum + Number(t.realizedPnL), 0) / trades.length : 0;

  return {
    symbol,
    currentPrice,
    direction,
    avgPremiumPctByDte,
    recentPremiumTrend: premiumTrend,
    userPreferredDte,
    userAvgStrikeDistance,
    userWinRateByDteBucket,
    userWinRateByStrikeDistance,
    avgMoveOverHoldPeriod,
    assignmentRateByStrikeDistance,
    tradesOnSymbol: trades.length,
    winRateOnSymbol: winRate,
    avgPnlOnSymbol: avgPnl,
    lastTradeDate: trades.length > 0 ? new Date(trades[0].closeDate) : null,
  };
}

/**
 * Convert strike features to numeric array for model input
 */
export function strikeFeaturesToArray(features: StrikeDteFeatures): number[] {
  return [
    features.direction === 'csp' ? 0 : 1,
    features.avgPremiumPctByDte.dte_7_14,
    features.avgPremiumPctByDte.dte_14_30,
    features.avgPremiumPctByDte.dte_30_45,
    features.recentPremiumTrend,
    features.userPreferredDte / 60, // Normalize
    features.userAvgStrikeDistance,
    Math.min(features.tradesOnSymbol / 50, 1), // Cap and normalize
    features.winRateOnSymbol,
  ];
}

// ============================================================================
// Roll Decision Features
// ============================================================================

export const ROLL_FEATURE_NAMES = [
  'daysToExpiration',
  'isItm',
  'distanceToStrike',
  'premiumCapturedPct',
  'rollCredit',
  'stockTrend7d',
  'userRollWinRate',
] as const;

/**
 * Extract features for roll decision
 */
export async function extractRollFeatures(
  userId: string,
  positionId: string
): Promise<RollDecisionFeatures | null> {
  const position = await prisma.derivedPosition.findUnique({
    where: { id: positionId },
  });

  if (!position || position.positionType !== 'option') {
    return null;
  }

  // Get current stock price
  const brokerPosition = await prisma.brokerPosition.findFirst({
    where: { userId, symbol: position.symbol, positionType: 'stock' },
    orderBy: { lastSyncAt: 'desc' },
  });
  const currentStockPrice = brokerPosition?.marketPrice
    ? Number(brokerPosition.marketPrice)
    : Number(position.avgPrice);

  // Calculate DTE
  const expiration = position.expiration ? new Date(position.expiration) : new Date();
  const daysToExpiration = Math.max(0, Math.ceil((expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  // Determine if ITM
  const strike = Number(position.strike);
  const isItm =
    position.optionType === 'put' ? strike > currentStockPrice : strike < currentStockPrice;

  // Distance to strike
  const distanceToStrike = Math.abs(strike - currentStockPrice) / currentStockPrice;

  // Estimate roll credit from historical data
  const rollCredit = await estimateRollCredit(userId, position.symbol, daysToExpiration);

  // Stock trend over 7 days (from trade history if available)
  const stockTrend7d = await calculateStockTrend7d(userId, position.symbol);

  // User's historical roll win rate
  const userRollWinRate = await calculateRollWinRate(userId);

  // Premium captured percentage (simplified - use original premium)
  const premiumReceived = Math.abs(Number(position.avgPrice));
  const premiumCapturedPct = daysToExpiration <= 3 ? 0.9 : daysToExpiration <= 7 ? 0.7 : 0.5;

  return {
    symbol: position.symbol,
    positionType: position.strategy?.includes('put') ? 'csp' : 'covered_call',
    strike,
    daysToExpiration,
    currentStockPrice,
    isItm,
    distanceToStrike,
    premiumReceived,
    premiumCapturedPct,
    rollCredit,
    stockTrend7d,
    userRollWinRate,
  };
}

/**
 * Convert roll features to numeric array for model input
 */
export function rollFeaturesToArray(features: RollDecisionFeatures): number[] {
  return [
    features.daysToExpiration / 60, // Normalize
    features.isItm ? 1 : 0,
    features.distanceToStrike,
    features.premiumCapturedPct,
    features.rollCredit / 500, // Normalize typical credit
    features.stockTrend7d / 10, // Normalize percentage
    features.userRollWinRate,
  ];
}

// ============================================================================
// Training Data Preparation
// ============================================================================

/**
 * Prepare training data for candidate ranker
 * Uses historical wheel trades to create feature-label pairs
 */
export async function prepareCandidateTrainingData(
  userId: string
): Promise<CandidateTrainingExample[]> {
  // Get all wheel trades
  const wheelTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
    orderBy: { closeDate: 'asc' },
  });

  if (wheelTrades.length < 10) {
    return [];
  }

  const trainingData: CandidateTrainingExample[] = [];
  const uniqueSymbols = [...new Set(wheelTrades.map((t) => t.symbol))];

  for (const symbol of uniqueSymbols) {
    const symbolTrades = wheelTrades.filter((t) => t.symbol === symbol);
    if (symbolTrades.length < 3) continue;

    // For each trade, extract features at time of entry and use outcome as label
    for (let i = 0; i < symbolTrades.length; i++) {
      const trade = symbolTrades[i];
      const historicalTrades = symbolTrades.slice(0, i); // Only trades before this one

      if (historicalTrades.length < 2) continue;

      // Build features from historical data
      const wins = historicalTrades.filter((t) => Number(t.realizedPnL) > 0);
      const winRate = wins.length / historicalTrades.length;
      const avgPremium =
        historicalTrades.reduce((sum, t) => sum + Math.abs(Number(t.openAmount)), 0) /
        historicalTrades.length;
      const avgHoldDays =
        historicalTrades.reduce((sum, t) => {
          const days = Math.ceil(
            (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / historicalTrades.length;
      const assignmentRate =
        historicalTrades.filter((t) => t.closeReason === 'assigned').length / historicalTrades.length;

      // Calculate day-of-week win rate at time of trade
      const tradeDayOfWeek = new Date(trade.openDate).getDay();
      const tradesOnSameDay = historicalTrades.filter(
        (t) => new Date(t.openDate).getDay() === tradeDayOfWeek
      );
      const winsOnSameDay = tradesOnSameDay.filter((t) => Number(t.realizedPnL) > 0);
      const dayWinRate = tradesOnSameDay.length >= 3 ? winsOnSameDay.length / tradesOnSameDay.length : 0.5;

      const features = [
        50 / 100, // Neutral IV rank
        avgPremium / Number(trade.strike || 100) / 100, // Premium to strike ratio
        0, // Neutral trend
        winRate,
        Math.min(historicalTrades.length / 100, 1),
        avgPremium / 1000,
        avgHoldDays / 45,
        assignmentRate,
        0, // Price change (simplified)
        0.1, // Recent trade
        0, // No current position at entry
        dayWinRate, // Day-of-week win rate
      ];

      // Label: annualized return
      const holdDays = Math.max(
        1,
        Math.ceil((new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (1000 * 60 * 60 * 24))
      );
      const capitalUsed = Math.abs(Number(trade.openAmount)) * 100; // Rough capital estimate
      const returnPct = capitalUsed > 0 ? Number(trade.realizedPnL) / capitalUsed : 0;
      const annualizedReturn = returnPct * (365 / holdDays);

      trainingData.push({
        features,
        label: Math.max(-1, Math.min(1, annualizedReturn)), // Clip to [-1, 1]
      });
    }
  }

  return trainingData;
}

/**
 * Get all unique symbols with wheel trades for a user
 */
export async function getWheelSymbols(userId: string): Promise<string[]> {
  const result = await prisma.realizedClose.groupBy({
    by: ['symbol'],
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
    _count: true,
  });

  return result.filter((r) => r._count >= 3).map((r) => r.symbol);
}

/**
 * Get unique symbols from current open wheel positions
 * (CSP or CC positions user currently holds)
 * @param userId - User ID
 * @param brokerageAccountId - Optional account filter (null = all accounts)
 */
export async function getWheelSymbolsFromOpenPositions(
  userId: string,
  brokerageAccountId?: string | null
): Promise<string[]> {
  const positions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'option',
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      // Filter by account if specified, otherwise get from all accounts
      ...(brokerageAccountId ? { brokerageAccountId } : {}),
    },
    select: { symbol: true },
    distinct: ['symbol'],
  });

  return positions.map((p) => p.symbol);
}

// ============================================================================
// Helper Functions
// ============================================================================

async function estimateIVFromUserHistory(
  userId: string,
  symbol: string
): Promise<{ ivRank: number; avgPremiumPct: number; trend: number }> {
  const allTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol,
      closeType: 'option',
    },
    orderBy: { closeDate: 'asc' },
  });

  if (allTrades.length === 0) {
    return { ivRank: 50, avgPremiumPct: 0, trend: 0 };
  }

  // Calculate premium as % of strike for each trade
  const premiumPcts = allTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openPrice)) / Number(t.strike)) * 100);

  if (premiumPcts.length === 0) {
    return { ivRank: 50, avgPremiumPct: 0, trend: 0 };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTrades = allTrades.filter((t) => new Date(t.closeDate) > thirtyDaysAgo);
  const recentPremiumPcts = recentTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openPrice)) / Number(t.strike)) * 100);

  const avgRecent =
    recentPremiumPcts.length > 0
      ? recentPremiumPcts.reduce((a, b) => a + b, 0) / recentPremiumPcts.length
      : premiumPcts.reduce((a, b) => a + b, 0) / premiumPcts.length;
  const avgAll = premiumPcts.reduce((a, b) => a + b, 0) / premiumPcts.length;

  // IV rank = percentile of recent premiums in distribution
  const sorted = [...premiumPcts].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= avgRecent).length;
  const ivRank = (rank / sorted.length) * 100;

  const trend = avgRecent > avgAll * 1.1 ? 1 : avgRecent < avgAll * 0.9 ? -1 : 0;

  return { ivRank, avgPremiumPct: avgRecent, trend };
}

function calculatePriceChange30d(
  trades: Array<{ openDate: Date | string; openPrice: unknown; closePrice: unknown }>
): number {
  if (trades.length < 2) return 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTrades = trades.filter((t) => new Date(t.openDate) > thirtyDaysAgo);
  if (recentTrades.length < 2) return 0;

  const sortedByDate = [...recentTrades].sort(
    (a, b) => new Date(a.openDate).getTime() - new Date(b.openDate).getTime()
  );
  const firstPrice = Number(sortedByDate[0].openPrice);
  const lastPrice = Number(sortedByDate[sortedByDate.length - 1].closePrice);

  return firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
}

function calculatePremiumByDteBucket(
  trades: Array<{ openDate: Date | string; closeDate: Date | string; openAmount: unknown; strike: unknown }>
): StrikeDteFeatures['avgPremiumPctByDte'] {
  const buckets: Record<string, number[]> = {
    dte_7_14: [],
    dte_14_30: [],
    dte_30_45: [],
    dte_45_plus: [],
  };

  for (const trade of trades) {
    const holdDays = Math.ceil(
      (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const strike = Number(trade.strike) || 100;
    const premiumPct = (Math.abs(Number(trade.openAmount)) / strike) * 100;

    if (holdDays <= 14) {
      buckets.dte_7_14.push(premiumPct);
    } else if (holdDays <= 30) {
      buckets.dte_14_30.push(premiumPct);
    } else if (holdDays <= 45) {
      buckets.dte_30_45.push(premiumPct);
    } else {
      buckets.dte_45_plus.push(premiumPct);
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    dte_7_14: avg(buckets.dte_7_14),
    dte_14_30: avg(buckets.dte_14_30),
    dte_30_45: avg(buckets.dte_30_45),
    dte_45_plus: avg(buckets.dte_45_plus),
  };
}

function calculatePreferredDte(trades: Array<{ openDate: Date | string; closeDate: Date | string }>): number {
  if (trades.length === 0) return 30;

  const holdDays = trades.map((t) =>
    Math.ceil((new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  // Mode calculation
  const counts: Record<number, number> = {};
  for (const days of holdDays) {
    const bucket = Math.round(days / 7) * 7; // Round to nearest week
    counts[bucket] = (counts[bucket] || 0) + 1;
  }

  let mode = 30;
  let maxCount = 0;
  for (const [bucket, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mode = Number(bucket);
    }
  }

  return mode;
}

function calculateAvgStrikeDistance(
  trades: Array<{ strike: unknown; underlyingPriceAtOpen: unknown }>
): number {
  // Calculate OTM distance as percentage of underlying price
  // Only use trades where we have actual underlying price data
  const distances = trades
    .filter((t) => t.strike && Number(t.strike) > 0 && t.underlyingPriceAtOpen && Number(t.underlyingPriceAtOpen) > 0)
    .map((t) => {
      const strike = Number(t.strike);
      const stockPrice = Number(t.underlyingPriceAtOpen);
      return Math.abs(strike - stockPrice) / stockPrice;
    });

  // Default to 5% OTM if no valid data
  return distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0.05;
}

function calculateWinRateByDteBucket(
  trades: Array<{ openDate: Date | string; closeDate: Date | string; realizedPnL: unknown }>
): Record<string, number> {
  const buckets: Record<string, { wins: number; total: number }> = {
    'dte_7_14': { wins: 0, total: 0 },
    'dte_14_30': { wins: 0, total: 0 },
    'dte_30_45': { wins: 0, total: 0 },
    'dte_45_plus': { wins: 0, total: 0 },
  };

  for (const trade of trades) {
    const holdDays = Math.ceil(
      (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const isWin = Number(trade.realizedPnL) > 0;

    let bucket: string;
    if (holdDays <= 14) bucket = 'dte_7_14';
    else if (holdDays <= 30) bucket = 'dte_14_30';
    else if (holdDays <= 45) bucket = 'dte_30_45';
    else bucket = 'dte_45_plus';

    buckets[bucket].total++;
    if (isWin) buckets[bucket].wins++;
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets)) {
    result[key] = value.total > 0 ? value.wins / value.total : 0;
  }

  return result;
}

function calculateWinRateByStrikeDistance(
  trades: Array<{ strike: unknown; underlyingPriceAtOpen: unknown; realizedPnL: unknown }>
): Record<string, number> {
  const buckets: Record<string, { wins: number; total: number }> = {
    'otm_0_5': { wins: 0, total: 0 },
    'otm_5_10': { wins: 0, total: 0 },
    'otm_10_15': { wins: 0, total: 0 },
    'otm_15_plus': { wins: 0, total: 0 },
  };

  for (const trade of trades) {
    const strike = Number(trade.strike) || 0;
    const stockPrice = Number(trade.underlyingPriceAtOpen) || 0;
    if (strike === 0 || stockPrice === 0) continue;

    const distancePct = (Math.abs(strike - stockPrice) / stockPrice) * 100;
    const isWin = Number(trade.realizedPnL) > 0;

    let bucket: string;
    if (distancePct <= 5) bucket = 'otm_0_5';
    else if (distancePct <= 10) bucket = 'otm_5_10';
    else if (distancePct <= 15) bucket = 'otm_10_15';
    else bucket = 'otm_15_plus';

    buckets[bucket].total++;
    if (isWin) buckets[bucket].wins++;
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets)) {
    result[key] = value.total > 0 ? value.wins / value.total : 0;
  }

  return result;
}

function calculateAvgStockMove(
  trades: Array<{ underlyingPriceAtOpen: unknown; underlyingPriceAtClose: unknown }>
): number {
  const moves = trades
    .filter((t) => t.underlyingPriceAtOpen && t.underlyingPriceAtClose)
    .map((t) => {
      const openPrice = Number(t.underlyingPriceAtOpen);
      const closePrice = Number(t.underlyingPriceAtClose);
      return openPrice > 0 ? Math.abs(closePrice - openPrice) / openPrice : 0;
    });

  return moves.length > 0 ? moves.reduce((a, b) => a + b, 0) / moves.length : 0.05;
}

function calculateAssignmentRateByStrikeDistance(
  trades: Array<{ strike: unknown; underlyingPriceAtOpen: unknown; closeReason: string }>
): Record<string, number> {
  const buckets: Record<string, { assigned: number; total: number }> = {
    'otm_0_5': { assigned: 0, total: 0 },
    'otm_5_10': { assigned: 0, total: 0 },
    'otm_10_plus': { assigned: 0, total: 0 },
  };

  for (const trade of trades) {
    const strike = Number(trade.strike) || 0;
    const stockPrice = Number(trade.underlyingPriceAtOpen) || 0;
    if (strike === 0 || stockPrice === 0) continue;

    const distancePct = (Math.abs(strike - stockPrice) / stockPrice) * 100;
    const wasAssigned = trade.closeReason === 'assigned';

    let bucket: string;
    if (distancePct <= 5) bucket = 'otm_0_5';
    else if (distancePct <= 10) bucket = 'otm_5_10';
    else bucket = 'otm_10_plus';

    buckets[bucket].total++;
    if (wasAssigned) buckets[bucket].assigned++;
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets)) {
    result[key] = value.total > 0 ? value.assigned / value.total : 0;
  }

  return result;
}

async function estimateRollCredit(userId: string, symbol: string, dte: number): Promise<number> {
  // Estimate from similar historical trades
  const similarTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
    take: 20,
    orderBy: { closeDate: 'desc' },
  });

  if (similarTrades.length === 0) return 50; // Default estimate

  const avgPremium = similarTrades.reduce((sum, t) => sum + Math.abs(Number(t.openAmount)), 0) / similarTrades.length;
  // Roll credit typically 20-50% of original premium depending on DTE
  const rollFactor = dte <= 7 ? 0.2 : dte <= 14 ? 0.3 : 0.4;

  return avgPremium * rollFactor;
}

async function calculateStockTrend7d(userId: string, symbol: string): Promise<number> {
  const recentTrades = await prisma.realizedClose.findMany({
    where: { userId, symbol },
    take: 10,
    orderBy: { closeDate: 'desc' },
  });

  if (recentTrades.length < 2) return 0;

  const prices = recentTrades.map((t) => Number(t.closePrice)).filter((p) => p > 0);
  if (prices.length < 2) return 0;

  const firstPrice = prices[prices.length - 1];
  const lastPrice = prices[0];

  return firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
}

async function calculateRollWinRate(userId: string): Promise<number> {
  // Look for trades that were likely rolls (similar symbol, close dates near each other)
  // Simplified: just use overall wheel win rate as proxy
  const wheelTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
  });

  if (wheelTrades.length === 0) return 0.5;

  const wins = wheelTrades.filter((t) => Number(t.realizedPnL) > 0);
  return wins.length / wheelTrades.length;
}

/**
 * Calculate day-of-week win rate patterns
 * Returns best/worst days and today's win rate
 * @param referenceDate - Optional date override for deterministic todayWinRate (defaults to now)
 */
function calculateDayOfWeekStats(
  trades: Array<{ openDate: Date | string; realizedPnL: unknown }>,
  referenceDate?: Date
): { bestDay: number; worstDay: number; todayWinRate: number } {
  // Default values (no pattern detected)
  const defaults = { bestDay: 1, worstDay: 5, todayWinRate: 0.5 }; // Monday best, Friday worst

  if (trades.length < 10) {
    return defaults;
  }

  // Track wins/total by day of week (0=Sunday, 6=Saturday)
  const dayStats: Array<{ wins: number; total: number }> = Array(7)
    .fill(null)
    .map(() => ({ wins: 0, total: 0 }));

  for (const trade of trades) {
    const openDate = new Date(trade.openDate);
    const dayOfWeek = openDate.getDay();
    const isWin = Number(trade.realizedPnL) > 0;

    dayStats[dayOfWeek].total++;
    if (isWin) dayStats[dayOfWeek].wins++;
  }

  // Calculate win rates per day (only for days with 3+ trades)
  const dayWinRates = dayStats.map((stat, day) => ({
    day,
    winRate: stat.total >= 3 ? stat.wins / stat.total : 0.5,
    trades: stat.total,
  }));

  // Find best and worst days (only considering days with enough data)
  const daysWithData = dayWinRates.filter((d) => d.trades >= 3);

  if (daysWithData.length === 0) {
    return defaults;
  }

  const sorted = [...daysWithData].sort((a, b) => b.winRate - a.winRate);
  const bestDay = sorted[0].day;
  const worstDay = sorted[sorted.length - 1].day;

  // Today's win rate
  const today = (referenceDate ?? new Date()).getDay();
  const todayWinRate = dayStats[today].total >= 3 ? dayStats[today].wins / dayStats[today].total : 0.5;

  return { bestDay, worstDay, todayWinRate };
}
