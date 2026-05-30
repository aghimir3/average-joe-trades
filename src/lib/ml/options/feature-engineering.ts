/**
 * Feature Engineering for Options ML Models
 * Extracts features from user's trading history for all model types
 */

import { prisma } from '@/lib/prisma';
import { average, standardDeviation, clamp, calculatePercentile, calculateWinRate } from '@/lib/ml/math-utils';
import type { FeatureVector, FeatureType, OptionStrategy } from './types';

// ============================================================================
// Feature Names Constants
// ============================================================================

export const VOLATILITY_FEATURE_NAMES = [
  'premiumPercentile',
  'premiumTrend30d',
  'premiumStdDev',
  'tradeFrequencyChange',
  'winRateChange30d',
  'avgDteChange',
  'avgHoldDaysChange',
  'recentVolatility',
  'historicalVolatility',
  'premiumSpread',
];

export const ENTRY_TIMING_FEATURE_NAMES = [
  'dayOfWeek', // 0-6
  'dayOfMonth', // 1-31 normalized
  'weekOfMonth', // 1-4
  'hourOfDay', // 0-23 normalized (if available)
  'daysSinceLastTrade',
  'recentWinRate',
  'premiumVsAvg',
  'tradeCountLast7d',
  'tradeCountLast30d',
  'avgReturnLast5Trades',
  'currentDrawdown',
  'daysSinceLastWin',
  'consecutiveWins',
  'consecutiveLosses',
  'symbolFamiliarity',
];

export const EXIT_STRATEGY_FEATURE_NAMES = [
  'currentPnlPercent',
  'daysHeld',
  'dteRemaining',
  'premiumCapturedPercent',
  'distanceToStrike',
  'isItm',
  'thetaDecayRate',
  'historicalAvgHoldDays',
  'historicalExitPoint',
  'recentExitPatterns',
  'winRateAtCurrentPnl',
  'avgReturnIfHeld',
  'avgReturnIfClosed',
  'rollSuccessRate',
];

export const STRATEGY_CLASSIFIER_FEATURE_NAMES = [
  'recentTrend7d',
  'recentTrend30d',
  'volatilityRegime',
  'premiumLevel',
  'userBullishWinRate',
  'userBearishWinRate',
  'userNeutralWinRate',
  'symbolTradedBefore',
  'lastStrategyOnSymbol',
  'portfolioNetDelta',
  'accountSizeNormalized',
  'positionCountCurrent',
  'riskToleranceInferred',
  'preferredDte',
  'preferredStrikeDistance',
];

export const RISK_ANALYZER_FEATURE_NAMES = [
  'positionCount',
  'netDeltaNormalized',
  'netThetaNormalized',
  'netVegaNormalized',
  'topSymbolConcentration',
  'top3SymbolConcentration',
  'correlationScore',
  'nearTermExposure',
  'midTermExposure',
  'longTermExposure',
  'winRateTrend',
  'avgPositionSize',
  'maxPositionSize',
  'accountUtilization',
  'drawdownFromPeak',
];

export const TRADE_EMBEDDING_FEATURE_NAMES = [
  'strategy',
  'dteAtEntry',
  'strikeDistance',
  'premiumPercent',
  'holdDays',
  'pnlPercent',
  'wasAssigned',
  'exitType',
  'marketCondition',
  'positionSize',
  'symbolVolatility',
  'entryDayOfWeek',
];

// ============================================================================
// Volatility Features
// ============================================================================

export async function extractVolatilityFeatures(
  userId: string,
  symbol: string
): Promise<FeatureVector> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get all option trades for this symbol
  const allTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol,
      closeType: 'option',
    },
    orderBy: { closeDate: 'asc' },
  });

  if (allTrades.length === 0) {
    return createEmptyFeatureVector('volatility', symbol, VOLATILITY_FEATURE_NAMES);
  }

  // Calculate premium percentages (premium as % of strike)
  const premiumPcts = allTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openPrice)) / Number(t.strike)) * 100);

  if (premiumPcts.length === 0) {
    return createEmptyFeatureVector('volatility', symbol, VOLATILITY_FEATURE_NAMES);
  }

  // Current premium percentile (vs all history)
  const recentTrades = allTrades.filter((t) => t.openDate >= thirtyDaysAgo);
  const recentPremiumPcts = recentTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openPrice)) / Number(t.strike)) * 100);

  const currentPremium = recentPremiumPcts.length > 0
    ? recentPremiumPcts[recentPremiumPcts.length - 1]
    : premiumPcts[premiumPcts.length - 1];
  const premiumPercentile = calculatePercentile(premiumPcts, currentPremium) / 100;

  // Premium trend (recent vs older)
  const olderPremiumPcts = premiumPcts.slice(0, Math.floor(premiumPcts.length / 2));
  const newerPremiumPcts = premiumPcts.slice(Math.floor(premiumPcts.length / 2));
  const olderAvg = average(olderPremiumPcts);
  const newerAvg = average(newerPremiumPcts);
  const premiumTrend = olderAvg > 0 ? (newerAvg - olderAvg) / olderAvg : 0;

  // Premium standard deviation (normalized)
  const premiumStdDev = standardDeviation(premiumPcts) / average(premiumPcts);

  // Trade frequency change
  const recentTradeCount = allTrades.filter((t) => t.openDate >= thirtyDaysAgo).length;
  const olderTradeCount = allTrades.filter(
    (t) => t.openDate >= ninetyDaysAgo && t.openDate < thirtyDaysAgo
  ).length / 2; // Normalize to 30-day period
  const frequencyChange = olderTradeCount > 0 ? (recentTradeCount - olderTradeCount) / olderTradeCount : 0;

  // Win rate change
  const recentWins = recentTrades.filter((t) => Number(t.realizedPnL) > 0).length;
  const recentWinRate = recentTrades.length > 0 ? recentWins / recentTrades.length : 0.5;
  const allWins = allTrades.filter((t) => Number(t.realizedPnL) > 0).length;
  const allWinRate = allTrades.length > 0 ? allWins / allTrades.length : 0.5;
  const winRateChange = allWinRate > 0 ? (recentWinRate - allWinRate) / allWinRate : 0;

  // DTE and hold days changes
  const recentDtes = recentTrades.map((t) => {
    const open = new Date(t.openDate);
    const exp = t.expiration ? new Date(t.expiration) : open;
    return Math.max(0, (exp.getTime() - open.getTime()) / (24 * 60 * 60 * 1000));
  });
  const allDtes = allTrades.map((t) => {
    const open = new Date(t.openDate);
    const exp = t.expiration ? new Date(t.expiration) : open;
    return Math.max(0, (exp.getTime() - open.getTime()) / (24 * 60 * 60 * 1000));
  });
  const avgDteChange = average(allDtes) > 0 ? (average(recentDtes) - average(allDtes)) / average(allDtes) : 0;

  const recentHoldDays = recentTrades.map((t) =>
    (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (24 * 60 * 60 * 1000)
  );
  const allHoldDays = allTrades.map((t) =>
    (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (24 * 60 * 60 * 1000)
  );
  const avgHoldDaysChange = average(allHoldDays) > 0
    ? (average(recentHoldDays) - average(allHoldDays)) / average(allHoldDays)
    : 0;

  // Volatility estimates
  const recentVolatility = standardDeviation(recentPremiumPcts) / 100;
  const historicalVolatility = standardDeviation(premiumPcts) / 100;

  // Premium spread (max - min recent)
  const premiumSpread = recentPremiumPcts.length > 0
    ? (Math.max(...recentPremiumPcts) - Math.min(...recentPremiumPcts)) / average(recentPremiumPcts)
    : 0;

  const features = [
    clamp(premiumPercentile, 0, 1),
    clamp(premiumTrend, -1, 1),
    clamp(premiumStdDev, 0, 2),
    clamp(frequencyChange, -1, 1),
    clamp(winRateChange, -1, 1),
    clamp(avgDteChange, -1, 1),
    clamp(avgHoldDaysChange, -1, 1),
    clamp(recentVolatility, 0, 1),
    clamp(historicalVolatility, 0, 1),
    clamp(premiumSpread, 0, 2),
  ];

  return {
    featureType: 'volatility',
    symbol,
    features,
    featureNames: VOLATILITY_FEATURE_NAMES,
    computedAt: now,
    windowStart: ninetyDaysAgo,
    windowEnd: now,
  };
}

// ============================================================================
// Entry Timing Features
// ============================================================================

export async function extractEntryTimingFeatures(
  userId: string,
  symbol: string
): Promise<FeatureVector> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get all trades
  const allTrades = await prisma.realizedClose.findMany({
    where: { userId },
    orderBy: { openDate: 'desc' },
  });

  const symbolTrades = allTrades.filter((t) => t.symbol === symbol);

  // Day of week (0-6, normalized to 0-1)
  const dayOfWeek = now.getDay() / 6;

  // Day of month (1-31, normalized)
  const dayOfMonth = (now.getDate() - 1) / 30;

  // Week of month (1-4)
  const weekOfMonth = Math.ceil(now.getDate() / 7) / 4;

  // Hour (0-23, normalized) - use noon if not available
  const hourOfDay = 12 / 23;

  // Days since last trade
  const lastTrade = allTrades[0];
  const daysSinceLastTrade = lastTrade
    ? Math.min(30, (now.getTime() - new Date(lastTrade.closeDate).getTime()) / (24 * 60 * 60 * 1000)) / 30
    : 1;

  // Recent win rate (last 30 days)
  const recentTrades = allTrades.filter((t) => new Date(t.closeDate) >= thirtyDaysAgo);
  const recentWins = recentTrades.filter((t) => Number(t.realizedPnL) > 0).length;
  const recentWinRate = recentTrades.length > 0 ? recentWins / recentTrades.length : 0.5;

  // Premium vs average (need symbol-specific)
  const symbolPremiumRatios = symbolTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => Math.abs(Number(t.openPrice)) / Number(t.strike));
  const avgPremium = average(symbolPremiumRatios);
  const latestPremium = symbolPremiumRatios[0];
  const premiumVsAvg = avgPremium > 0 && latestPremium !== undefined
    ? clamp(latestPremium / avgPremium / 2, 0, 1)
    : 0.5;

  // Trade counts
  const tradeCountLast7d = Math.min(10, allTrades.filter((t) => new Date(t.openDate) >= sevenDaysAgo).length) / 10;
  const tradeCountLast30d = Math.min(30, recentTrades.length) / 30;

  // Average return last 5 trades
  const last5Trades = allTrades.slice(0, 5);
  const avgReturnLast5 = last5Trades.length > 0
    ? average(last5Trades.map((t) => {
        const cost = Math.max(1, Math.abs(Number(t.openAmount)));
        return cost > 0 ? Number(t.realizedPnL) / cost : 0;
      }))
    : 0;
  const avgReturnLast5Normalized = clamp(avgReturnLast5, -0.5, 0.5) + 0.5;

  // Drawdown
  const cumulativePnL = allTrades.reduce((acc, t) => acc + Number(t.realizedPnL), 0);
  const peak = Math.max(0, cumulativePnL);
  const currentDrawdown = peak > 0 ? Math.min(1, (peak - cumulativePnL) / peak) : 0;

  // Days since last win
  const lastWin = allTrades.find((t) => Number(t.realizedPnL) > 0);
  const daysSinceLastWin = lastWin
    ? Math.min(30, (now.getTime() - new Date(lastWin.closeDate).getTime()) / (24 * 60 * 60 * 1000)) / 30
    : 1;

  // Consecutive wins/losses
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  for (const trade of allTrades) {
    if (Number(trade.realizedPnL) > 0) {
      if (consecutiveLosses === 0) consecutiveWins++;
      else break;
    } else {
      if (consecutiveWins === 0) consecutiveLosses++;
      else break;
    }
  }

  // Symbol familiarity
  const symbolFamiliarity = Math.min(1, symbolTrades.length / 20);

  const features = [
    dayOfWeek,
    dayOfMonth,
    weekOfMonth,
    hourOfDay,
    daysSinceLastTrade,
    recentWinRate,
    premiumVsAvg,
    tradeCountLast7d,
    tradeCountLast30d,
    avgReturnLast5Normalized,
    currentDrawdown,
    daysSinceLastWin,
    Math.min(1, consecutiveWins / 5),
    Math.min(1, consecutiveLosses / 5),
    symbolFamiliarity,
  ];

  return {
    featureType: 'user_pattern',
    symbol,
    features,
    featureNames: ENTRY_TIMING_FEATURE_NAMES,
    computedAt: now,
  };
}

// ============================================================================
// Strategy Classifier Features
// ============================================================================

export async function extractStrategyFeatures(
  userId: string,
  symbol: string
): Promise<FeatureVector> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get all trades
  const [allTrades, openPositions] = await Promise.all([
    prisma.realizedClose.findMany({
      where: { userId },
      orderBy: { closeDate: 'desc' },
    }),
    prisma.derivedPosition.findMany({
      where: { userId },
    }),
  ]);

  const symbolTrades = allTrades.filter((t) => t.symbol === symbol);

  // Recent price trend (from trade prices)
  const recent7dTrades = allTrades.filter((t) => new Date(t.closeDate) >= sevenDaysAgo);
  const recent30dTrades = allTrades.filter((t) => new Date(t.closeDate) >= thirtyDaysAgo);

  // Trend from open/close prices
  const recentTrend7d = calculatePriceTrend(recent7dTrades);
  const recentTrend30d = calculatePriceTrend(recent30dTrades);

  // Volatility regime (simplified - from premium levels)
  const premiumPcts = allTrades
    .filter((t) => t.strike && Number(t.strike) > 0 && t.closeType === 'option')
    .slice(0, 20)
    .map((t) => Math.abs(Number(t.openPrice)) / Number(t.strike));
  const avgPremium = average(premiumPcts);
  const volatilityRegime = avgPremium > 0.05 ? 0.8 : avgPremium > 0.03 ? 0.5 : 0.2;

  // Premium level (latest premium percentile vs recent history)
  const latestPremium = premiumPcts[0];
  const premiumLevel = premiumPcts.length > 0 && latestPremium !== undefined
    ? calculatePercentile(premiumPcts, latestPremium) / 100
    : 0.5;

  // Strategy-specific win rates
  const bullishStrategies = ['long_call', 'bull_call_spread', 'cash_secured_put'];
  const bearishStrategies = ['long_put', 'bear_put_spread', 'covered_call'];
  const neutralStrategies = ['iron_condor', 'straddle', 'strangle'];

  const bullishTrades = allTrades.filter((t) => bullishStrategies.includes(t.strategy || ''));
  const bearishTrades = allTrades.filter((t) => bearishStrategies.includes(t.strategy || ''));
  const neutralTrades = allTrades.filter((t) => neutralStrategies.includes(t.strategy || ''));

  const userBullishWinRate = calculateWinRate(bullishTrades);
  const userBearishWinRate = calculateWinRate(bearishTrades);
  const userNeutralWinRate = calculateWinRate(neutralTrades);

  // Symbol traded before
  const symbolTradedBefore = symbolTrades.length > 0 ? 1 : 0;

  // Last strategy on symbol
  const lastSymbolTrade = symbolTrades[0];
  const lastStrategyOnSymbol = lastSymbolTrade ? strategyToNumber(lastSymbolTrade.strategy) : 0.5;

  // Portfolio net delta (simplified)
  const optionPositions = openPositions.filter((p) => p.positionType === 'option');
  let netDelta = 0;
  for (const pos of optionPositions) {
    const delta = pos.optionType === 'call' ? 0.5 : -0.5;
    netDelta += delta * Number(pos.quantity);
  }
  const portfolioNetDelta = clamp(netDelta / 10, -1, 1);

  // Account size (from total trades)
  const totalVolume = allTrades.reduce((acc, t) => acc + Math.abs(Number(t.openAmount)), 0);
  const accountSizeNormalized = Math.min(1, totalVolume / 100000);

  // Position count
  const positionCountCurrent = Math.min(1, openPositions.length / 20);

  // Risk tolerance (inferred from trade size and strategies)
  const avgTradeSize = average(allTrades.map((t) => Math.abs(Number(t.openAmount))));
  const riskToleranceInferred = Math.min(1, avgTradeSize / 5000);

  // Preferred DTE
  const dtes = allTrades
    .filter((t) => t.closeType === 'option' && t.expiration)
    .map((t) => {
      const open = new Date(t.openDate);
      const exp = new Date(t.expiration!);
      return (exp.getTime() - open.getTime()) / (24 * 60 * 60 * 1000);
    });
  const preferredDte = dtes.length > 0 ? Math.min(1, average(dtes) / 60) : 0.5;

  // Preferred strike distance
  const strikeDistances = allTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => Math.abs(Number(t.strike) - Number(t.openPrice)) / Number(t.strike));
  const preferredStrikeDistance = strikeDistances.length > 0 ? Math.min(1, average(strikeDistances) / 0.2) : 0.5;

  const features = [
    clamp(recentTrend7d, -1, 1) / 2 + 0.5,
    clamp(recentTrend30d, -1, 1) / 2 + 0.5,
    volatilityRegime,
    premiumLevel,
    userBullishWinRate,
    userBearishWinRate,
    userNeutralWinRate,
    symbolTradedBefore,
    lastStrategyOnSymbol,
    (portfolioNetDelta + 1) / 2,
    accountSizeNormalized,
    positionCountCurrent,
    riskToleranceInferred,
    preferredDte,
    preferredStrikeDistance,
  ];

  return {
    featureType: 'symbol_profile',
    symbol,
    features,
    featureNames: STRATEGY_CLASSIFIER_FEATURE_NAMES,
    computedAt: now,
  };
}

// ============================================================================
// Risk Analysis Features
// ============================================================================

export async function extractRiskFeatures(userId: string): Promise<FeatureVector> {
  const now = new Date();

  const [openPositions, recentTrades] = await Promise.all([
    prisma.derivedPosition.findMany({ where: { userId } }),
    prisma.realizedClose.findMany({
      where: { userId },
      orderBy: { closeDate: 'desc' },
      take: 100,
    }),
  ]);

  // Position count
  const positionCount = Math.min(1, openPositions.length / 20);

  // Net Greeks (simplified estimates)
  let netDelta = 0;
  let netTheta = 0;
  let netVega = 0;

  for (const pos of openPositions) {
    if (pos.positionType === 'option') {
      const delta = pos.optionType === 'call' ? 0.5 : -0.5;
      const theta = -0.02 * Number(pos.avgPrice); // Rough estimate
      const vega = 0.1 * Number(pos.avgPrice);

      netDelta += delta * Number(pos.quantity);
      netTheta += theta * Number(pos.quantity);
      netVega += vega * Number(pos.quantity);
    } else {
      netDelta += Number(pos.quantity); // Stock delta = 1
    }
  }

  const netDeltaNormalized = clamp(netDelta / 100, -1, 1);
  const netThetaNormalized = clamp(netTheta / 1000, -1, 1);
  const netVegaNormalized = clamp(netVega / 1000, -1, 1);

  // Concentration
  const positionBySymbol = new Map<string, number>();
  let totalValue = 0;
  for (const pos of openPositions) {
    const value = Math.abs(Number(pos.avgPrice) * Number(pos.quantity));
    positionBySymbol.set(pos.symbol, (positionBySymbol.get(pos.symbol) || 0) + value);
    totalValue += value;
  }

  const symbolValues = Array.from(positionBySymbol.values()).sort((a, b) => b - a);
  const topSymbolConcentration = totalValue > 0 ? symbolValues[0] / totalValue : 0;
  const top3Value = symbolValues.slice(0, 3).reduce((a, b) => a + b, 0);
  const top3SymbolConcentration = totalValue > 0 ? top3Value / totalValue : 0;

  // Correlation score (simplified - same sector assumption)
  const uniqueSymbols = new Set(openPositions.map((p) => p.symbol)).size;
  const correlationScore = openPositions.length > 0 ? 1 - uniqueSymbols / openPositions.length : 0;

  // DTE distribution
  const optionPositions = openPositions.filter((p) => p.positionType === 'option' && p.expiration);
  let nearTerm = 0;
  let midTerm = 0;
  let longTerm = 0;

  for (const pos of optionPositions) {
    const dte = (new Date(pos.expiration!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (dte < 7) nearTerm++;
    else if (dte < 30) midTerm++;
    else longTerm++;
  }

  const totalOptions = optionPositions.length || 1;
  const nearTermExposure = nearTerm / totalOptions;
  const midTermExposure = midTerm / totalOptions;
  const longTermExposure = longTerm / totalOptions;

  // Win rate trend
  const recentWinRate = calculateWinRate(recentTrades.slice(0, 20));
  const olderWinRate = calculateWinRate(recentTrades.slice(20, 50));
  const winRateTrend = (recentWinRate - olderWinRate + 1) / 2;

  // Position sizes
  const positionSizes = openPositions.map((p) => Math.abs(Number(p.avgPrice) * Number(p.quantity)));
  const avgPositionSize = Math.min(1, average(positionSizes) / 10000);
  const maxPositionSize = Math.min(1, Math.max(...positionSizes, 0) / 20000);

  // Account utilization (rough estimate)
  const accountUtilization = Math.min(1, totalValue / 100000);

  // Drawdown from peak
  const cumulativePnL = recentTrades.reduce((acc, t) => acc + Number(t.realizedPnL), 0);
  const peak = Math.max(0, cumulativePnL);
  const drawdownFromPeak = peak > 0 ? Math.min(1, (peak - cumulativePnL) / peak) : 0;

  const features = [
    positionCount,
    (netDeltaNormalized + 1) / 2,
    (netThetaNormalized + 1) / 2,
    (netVegaNormalized + 1) / 2,
    topSymbolConcentration,
    top3SymbolConcentration,
    correlationScore,
    nearTermExposure,
    midTermExposure,
    longTermExposure,
    winRateTrend,
    avgPositionSize,
    maxPositionSize,
    accountUtilization,
    drawdownFromPeak,
  ];

  return {
    featureType: 'position_health',
    symbol: 'PORTFOLIO',
    features,
    featureNames: RISK_ANALYZER_FEATURE_NAMES,
    computedAt: now,
  };
}

// ============================================================================
// Trade Embedding Features
// ============================================================================

export function extractTradeEmbeddingFeatures(
  trade: {
    symbol: string;
    strategy: string | null;
    openDate: Date;
    closeDate: Date;
    openPrice: number | { toNumber: () => number };
    closePrice?: number | { toNumber: () => number };
    openAmount?: number | { toNumber: () => number } | null;
    strike: number | { toNumber: () => number } | null;
    expiration: Date | null;
    realizedPnL: number | { toNumber: () => number };
    closeReason: string | null;
  }
): number[] {
  const openPrice = typeof trade.openPrice === 'object' ? trade.openPrice.toNumber() : trade.openPrice;
  const closePrice = trade.closePrice === undefined
    ? openPrice
    : typeof trade.closePrice === 'object'
      ? trade.closePrice.toNumber()
      : trade.closePrice;
  const openAmount = trade.openAmount === undefined || trade.openAmount === null
    ? null
    : typeof trade.openAmount === 'object'
      ? trade.openAmount.toNumber()
      : trade.openAmount;
  const strike = trade.strike ? (typeof trade.strike === 'object' ? trade.strike.toNumber() : trade.strike) : 0;
  const pnl = typeof trade.realizedPnL === 'object' ? trade.realizedPnL.toNumber() : trade.realizedPnL;

  // Strategy encoding
  const strategy = strategyToNumber(trade.strategy);

  // DTE at entry
  const dteAtEntry = trade.expiration
    ? Math.min(1, (new Date(trade.expiration).getTime() - new Date(trade.openDate).getTime()) / (60 * 24 * 60 * 60 * 1000))
    : 0.5;

  // Strike distance
  const strikeDistance = strike > 0 ? Math.min(1, Math.abs(strike - openPrice) / strike / 0.2) : 0.5;

  // Premium percent
  const premiumPercent = strike > 0 ? Math.min(1, Math.abs(openPrice) / strike / 0.1) : 0.5;

  // Hold days
  const holdDays = Math.min(1, (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (60 * 24 * 60 * 60 * 1000));

  // P&L percent
  const cost = Math.max(1, Math.abs(openAmount ?? openPrice));
  const pnlPercent = cost > 0 ? clamp(pnl / cost, -1, 1) / 2 + 0.5 : 0.5;

  // Was assigned
  const wasAssigned = trade.closeReason === 'assigned' ? 1 : 0;

  // Exit type
  const exitType = trade.closeReason === 'expired' ? 0 : trade.closeReason === 'assigned' ? 0.5 : 1;

  // Market condition proxy from option premium move during the trade.
  const premiumMove = openPrice !== 0 ? (closePrice - openPrice) / Math.abs(openPrice) : 0;
  const marketCondition = clamp((clamp(premiumMove, -1, 1) + 1) / 2, 0, 1);

  // Position size from notional deployment.
  const positionSize = Math.min(1, Math.abs(openAmount ?? openPrice) / 10000);

  // Volatility proxy from premium move magnitude and moneyness.
  const symbolVolatility = clamp(Math.abs(premiumMove) + Math.abs(strikeDistance - 0.5), 0, 1);

  // Entry day of week
  const entryDayOfWeek = new Date(trade.openDate).getDay() / 6;

  return [
    strategy,
    dteAtEntry,
    strikeDistance,
    premiumPercent,
    holdDays,
    pnlPercent,
    wasAssigned,
    exitType,
    marketCondition,
    positionSize,
    symbolVolatility,
    entryDayOfWeek,
  ];
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyFeatureVector(
  featureType: FeatureType,
  symbol: string,
  featureNames: string[]
): FeatureVector {
  return {
    featureType,
    symbol,
    features: new Array(featureNames.length).fill(0.5),
    featureNames,
    computedAt: new Date(),
  };
}


function calculatePriceTrend(trades: { openPrice: unknown; closePrice?: unknown }[]): number {
  if (trades.length < 2) return 0;
  const firstPrice = Number(trades[trades.length - 1].openPrice);
  const lastPrice = Number(trades[0].openPrice);
  if (firstPrice === 0) return 0;
  return (lastPrice - firstPrice) / firstPrice;
}

function strategyToNumber(strategy: string | null): number {
  const strategies: Record<string, number> = {
    long_call: 0.1,
    long_put: 0.2,
    covered_call: 0.3,
    cash_secured_put: 0.4,
    bull_call_spread: 0.5,
    bear_put_spread: 0.6,
    iron_condor: 0.7,
    straddle: 0.8,
    strangle: 0.9,
    calendar_spread: 1.0,
  };
  return strategies[strategy || ''] ?? 0.5;
}

// ============================================================================
// Get All Symbols with Options History
// ============================================================================

export async function getOptionsSymbols(userId: string): Promise<string[]> {
  const result = await prisma.realizedClose.groupBy({
    by: ['symbol'],
    where: {
      userId,
      closeType: 'option',
      hasUnknownBasis: false,
    },
    _count: true,
  });

  return result.filter((r) => r._count >= 3).map((r) => r.symbol);
}

export async function getAllTradedStrategies(userId: string): Promise<OptionStrategy[]> {
  const result = await prisma.realizedClose.groupBy({
    by: ['strategy'],
    where: {
      userId,
      closeType: 'option',
      strategy: { not: null },
    },
    _count: true,
  });

  return result
    .filter((r) => r.strategy && r._count >= 2)
    .map((r) => r.strategy as OptionStrategy);
}
