/**
 * Strategy Classifier
 * Recommends optimal options strategy based on market conditions and user patterns
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { average, standardDeviation } from '@/lib/ml/math-utils';
import { extractStrategyFeatures, STRATEGY_CLASSIFIER_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel, logPrediction } from './model-storage';
import { getOrComputeFeatures } from './feature-store';
import type { StrategyRecommendation, OptionStrategy, TrainingStats } from './types';

const NUM_FEATURES = STRATEGY_CLASSIFIER_FEATURE_NAMES.length;
const STRATEGIES: OptionStrategy[] = [
  'long_call',
  'long_put',
  'covered_call',
  'cash_secured_put',
  'bull_call_spread',
  'bear_put_spread',
  'iron_condor',
  'straddle',
];
const NUM_STRATEGIES = STRATEGIES.length;

const BULLISH_STRATEGIES = new Set<OptionStrategy>([
  'long_call',
  'bull_call_spread',
  'cash_secured_put',
]);
const BEARISH_STRATEGIES = new Set<OptionStrategy>([
  'long_put',
  'bear_put_spread',
  'covered_call',
]);
const NEUTRAL_STRATEGIES = new Set<OptionStrategy>([
  'iron_condor',
  'straddle',
]);

function toStrategyDelta(strategy: string | null): number {
  if (!strategy) return 0;
  if (BULLISH_STRATEGIES.has(strategy as OptionStrategy)) return 1;
  if (BEARISH_STRATEGIES.has(strategy as OptionStrategy)) return -1;
  return 0;
}

function strategyToNumber(strategy: string | null): number {
  const index = STRATEGIES.indexOf((strategy ?? '') as OptionStrategy);
  return index >= 0 ? index / (NUM_STRATEGIES - 1) : 0.5;
}

// ============================================================================
// Model Architecture
// ============================================================================

export function buildStrategyClassifierModel(): tf.LayersModel {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 64,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.batchNormalization(),
      tf.layers.dropout({ rate: 0.3 }),

      tf.layers.dense({
        units: 32,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.2 }),

      tf.layers.dense({
        units: 16,
        activation: 'relu',
      }),

      tf.layers.dense({
        units: NUM_STRATEGIES,
        activation: 'softmax',
      }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  return model;
}

// ============================================================================
// Training
// ============================================================================

export async function trainStrategyClassifierModel(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    const trades = await prisma.realizedClose.findMany({
      where: {
        userId,
        strategy: { not: null },
        hasUnknownBasis: false,
      },
      orderBy: { openDate: 'asc' },
    });

    if (trades.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 30 trades with strategies, found ${trades.length}`,
      };
    }

    const trainingData = prepareStrategyTrainingData(trades);

    if (trainingData.length < 20) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: 'Insufficient training data',
      };
    }

    const model = buildStrategyClassifierModel();

    const split = temporalSplit(trainingData, {
      validationFraction: 0.2,
      minTrainRows: 16,
      minValidationRows: 4,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((d) => d.features));
    const trainYs = tf.tensor2d(split.trainRows.map((d) => d.label));
    const validationXs = tf.tensor2d(split.validationRows.map((d) => d.features));
    const validationYs = tf.tensor2d(split.validationRows.map((d) => d.label));

    const startTime = Date.now();
    const history = await model.fit(trainXs, trainYs, {
      epochs: 100,
      batchSize: Math.min(32, Math.floor(trainingData.length / 4)),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: tf.callbacks.earlyStopping({ patience: 10, monitor: 'val_loss' }),
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;
    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const validationLoss = getLastHistoryMetric(history, ['val_loss']);
    const accuracy = getLastHistoryMetric(history, ['accuracy', 'acc']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss,
      accuracy,
      trainingTime,
    };

    await saveOptionsModel(userId, 'strategy-classifier', 'Strategy Classifier', model, stats);

    trainXs.dispose();
    trainYs.dispose();
    validationXs.dispose();
    validationYs.dispose();
    model.dispose();

    return { success: true, stats };
  } catch (error) {
    return {
      success: false,
      stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Prediction
// ============================================================================

export async function predictStrategy(
  userId: string,
  symbol: string
): Promise<StrategyRecommendation> {
  const featureVector = await getOrComputeFeatures(userId, symbol, 'symbol_profile', () =>
    extractStrategyFeatures(userId, symbol)
  );

  const model = await loadOptionsModel(userId, 'strategy-classifier');

  let probabilities: number[];

  if (model) {
    const inputTensor = tf.tensor2d([featureVector.features]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    probabilities = Array.from(await prediction.data());

    inputTensor.dispose();
    prediction.dispose();
  } else {
    probabilities = calculateStatisticalStrategy(featureVector.features);
  }

  // Get top strategy and alternatives
  const sortedIndices = probabilities
    .map((p, i) => ({ prob: p, idx: i }))
    .sort((a, b) => b.prob - a.prob);

  const topStrategy = STRATEGIES[sortedIndices[0].idx];
  const confidence = sortedIndices[0].prob;

  // Get strategy-specific stats
  const strategyStats = await getStrategyStats(userId, topStrategy);

  const result: StrategyRecommendation = {
    strategy: topStrategy,
    confidence,
    probability: sortedIndices[0].prob,
    alternatives: sortedIndices.slice(1, 3).map((s) => ({
      strategy: STRATEGIES[s.idx],
      probability: s.prob,
      reasoning: getStrategyReasoning(STRATEGIES[s.idx], featureVector.features),
    })),
    reasoning: generateStrategyReasoning(topStrategy, featureVector.features, strategyStats),
    riskLevel: getStrategyRiskLevel(topStrategy),
    expectedReturn: strategyStats.avgReturn,
    historicalWinRate: strategyStats.winRate,
  };

  // Log prediction
  if (model) {
    const modelInfo = await prisma.optionsMLModel.findFirst({
      where: { userId, modelType: 'strategy-classifier', isActive: true },
      select: { version: true },
    });

    await logPrediction(userId, 'strategy-classifier', modelInfo?.version ?? 1, {
      symbol,
      predictionType: 'strategy',
      prediction: result,
      confidence,
    });
  }

  return result;
}

// ============================================================================
// Training Data
// ============================================================================

function prepareStrategyTrainingData(
  trades: {
    symbol: string;
    strategy: string | null;
    realizedPnL: unknown;
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    strike: unknown;
    expiration: Date | null;
    underlyingPriceAtOpen: unknown;
    underlyingPriceAtClose: unknown;
  }[]
): { features: number[]; label: number[] }[] {
  const trainingData: { features: number[]; label: number[] }[] = [];

  // Group by symbol for context
  const tradesBySymbol = new Map<string, typeof trades>();
  for (const trade of trades) {
    const existing = tradesBySymbol.get(trade.symbol) || [];
    existing.push(trade);
    tradesBySymbol.set(trade.symbol, existing);
  }

  for (const [, symbolTrades] of tradesBySymbol.entries()) {
    for (let i = 3; i < symbolTrades.length; i++) {
      const historicalTrades = symbolTrades.slice(0, i);
      const currentTrade = symbolTrades[i];

      if (!currentTrade.strategy) continue;

      const strategyIndex = STRATEGIES.indexOf(currentTrade.strategy as OptionStrategy);
      if (strategyIndex === -1) continue;

      const features = calculateStrategyFeatures(historicalTrades);
      const label = new Array(NUM_STRATEGIES).fill(0);
      label[strategyIndex] = 1;

      trainingData.push({ features, label });
    }
  }

  return trainingData;
}

function calculateStrategyFeatures(
  historicalTrades: {
    strategy: string | null;
    realizedPnL: unknown;
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    strike: unknown;
    expiration: Date | null;
    underlyingPriceAtOpen: unknown;
    underlyingPriceAtClose: unknown;
  }[]
): number[] {
  const features = new Array(NUM_FEATURES).fill(0.5);

  // Calculate win rates by strategy type
  const bullish = historicalTrades.filter((t) => BULLISH_STRATEGIES.has((t.strategy ?? '') as OptionStrategy));
  const bearish = historicalTrades.filter((t) => BEARISH_STRATEGIES.has((t.strategy ?? '') as OptionStrategy));
  const neutral = historicalTrades.filter((t) => NEUTRAL_STRATEGIES.has((t.strategy ?? '') as OptionStrategy));

  features[4] = bullish.length > 0
    ? bullish.filter((t) => Number(t.realizedPnL) > 0).length / bullish.length
    : 0.5;
  features[5] = bearish.length > 0
    ? bearish.filter((t) => Number(t.realizedPnL) > 0).length / bearish.length
    : 0.5;
  features[6] = neutral.length > 0
    ? neutral.filter((t) => Number(t.realizedPnL) > 0).length / neutral.length
    : 0.5;

  const now = historicalTrades[historicalTrades.length - 1]?.closeDate ?? new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recent7d = historicalTrades.filter((trade) => trade.closeDate >= sevenDaysAgo);
  const recent30d = historicalTrades.filter((trade) => trade.closeDate >= thirtyDaysAgo);

  const representativePrice = (trade: {
    underlyingPriceAtClose: unknown;
    closePrice: unknown;
    openPrice: unknown;
  }) => {
    const underlying = Number(trade.underlyingPriceAtClose);
    if (Number.isFinite(underlying) && underlying > 0) return underlying;
    const close = Number(trade.closePrice);
    if (Number.isFinite(close) && close > 0) return close;
    const open = Number(trade.openPrice);
    return Number.isFinite(open) && open > 0 ? open : 0;
  };

  const trendFromTrades = (tradesWindow: typeof historicalTrades) => {
    if (tradesWindow.length < 2) return 0;
    const first = representativePrice(tradesWindow[0]);
    const last = representativePrice(tradesWindow[tradesWindow.length - 1]);
    if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) return 0;
    return (last - first) / first;
  };

  features[0] = Math.max(0, Math.min(1, (trendFromTrades(recent7d) + 1) / 2));
  features[1] = Math.max(0, Math.min(1, (trendFromTrades(recent30d) + 1) / 2));

  const premiumPctSeries = historicalTrades
    .map((trade) => {
      const strike = Number(trade.strike);
      const open = Math.abs(Number(trade.openPrice));
      if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(open)) return null;
      return open / strike;
    })
    .filter((value): value is number => value !== null);

  const premiumStd = standardDeviation(premiumPctSeries);
  const premiumMean = average(premiumPctSeries);
  const premiumRegimeScore = premiumMean > 0 ? premiumStd / premiumMean : premiumStd;
  features[2] = Math.max(0, Math.min(1, premiumRegimeScore / 0.5));

  const lastPremium = premiumPctSeries[premiumPctSeries.length - 1] ?? premiumMean;
  if (premiumPctSeries.length > 1) {
    const sorted = [...premiumPctSeries].sort((a, b) => a - b);
    const rank = sorted.filter((value) => value <= lastPremium).length;
    features[3] = Math.max(0, Math.min(1, rank / sorted.length));
  } else {
    features[3] = 0.5;
  }

  features[7] = historicalTrades.length > 0 ? 1 : 0;
  features[8] = strategyToNumber(historicalTrades[historicalTrades.length - 1]?.strategy ?? null);

  const directionalSeries = historicalTrades.map((trade) => toStrategyDelta(trade.strategy));
  features[9] = Math.max(0, Math.min(1, (average(directionalSeries) + 1) / 2));

  const avgNotional = average(historicalTrades.map((trade) => Math.abs(Number(trade.openAmount))));
  features[10] = Math.max(0, Math.min(1, avgNotional / 10_000));
  features[11] = Math.max(0, Math.min(1, recent30d.length / 20));
  features[12] = Math.max(0, Math.min(1, average(historicalTrades.map((trade) =>
    Math.abs(Number(trade.realizedPnL)) / Math.max(1, Math.abs(Number(trade.openAmount)))
  )) * 2));

  const dtes = historicalTrades
    .filter((trade) => trade.expiration)
    .map((trade) =>
      Math.max(
        0,
        (new Date(trade.expiration as Date).getTime() - new Date(trade.openDate).getTime()) / (24 * 60 * 60 * 1000)
      )
    );
  features[13] = Math.max(0, Math.min(1, average(dtes) / 60));

  const strikeDistances = historicalTrades
    .map((trade) => {
      const strike = Number(trade.strike);
      const underlyingAtOpen = Number(trade.underlyingPriceAtOpen);
      const refPrice = Number.isFinite(underlyingAtOpen) && underlyingAtOpen > 0
        ? underlyingAtOpen
        : representativePrice(trade);
      if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(refPrice) || refPrice <= 0) return null;
      return Math.abs(strike - refPrice) / refPrice;
    })
    .filter((value): value is number => value !== null);
  features[14] = Math.max(0, Math.min(1, average(strikeDistances) / 0.2));

  return features;
}

// ============================================================================
// Helpers
// ============================================================================

function calculateStatisticalStrategy(features: number[]): number[] {
  const bullishWinRate = features[4];
  const bearishWinRate = features[5];
  const neutralWinRate = features[6];

  // Weight strategies by win rate
  const probs = new Array(NUM_STRATEGIES).fill(0.05);

  // Bullish strategies
  probs[0] = bullishWinRate * 0.3; // long_call
  probs[3] = bullishWinRate * 0.4; // cash_secured_put
  probs[4] = bullishWinRate * 0.2; // bull_call_spread

  // Bearish strategies
  probs[1] = bearishWinRate * 0.3; // long_put
  probs[2] = bearishWinRate * 0.4; // covered_call
  probs[5] = bearishWinRate * 0.2; // bear_put_spread

  // Neutral strategies
  probs[6] = neutralWinRate * 0.5; // iron_condor
  probs[7] = neutralWinRate * 0.3; // straddle

  // Normalize
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / sum);
}

async function getStrategyStats(
  userId: string,
  strategy: OptionStrategy
): Promise<{ winRate: number; avgReturn: number; tradeCount: number }> {
  const trades = await prisma.realizedClose.findMany({
    where: { userId, strategy, hasUnknownBasis: false },
    select: { realizedPnL: true, openAmount: true },
  });

  if (trades.length === 0) {
    return { winRate: 0.5, avgReturn: 0, tradeCount: 0 };
  }

  const wins = trades.filter((t) => Number(t.realizedPnL) > 0).length;
  const winRate = wins / trades.length;

  const totalReturn = trades.reduce((acc, t) => {
    const cost = Math.max(1, Math.abs(Number(t.openAmount)));
    return acc + (cost > 0 ? Number(t.realizedPnL) / cost : 0);
  }, 0);
  const avgReturn = totalReturn / trades.length;

  return { winRate, avgReturn, tradeCount: trades.length };
}

function generateStrategyReasoning(
  strategy: OptionStrategy,
  features: number[],
  stats: { winRate: number; avgReturn: number; tradeCount: number }
): string[] {
  const reasons: string[] = [];

  if (stats.tradeCount > 0) {
    reasons.push(`Your ${strategy.replace('_', ' ')} win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  }

  if (stats.avgReturn > 0) {
    reasons.push(`Historical avg return: ${(stats.avgReturn * 100).toFixed(1)}%`);
  }

  const bullishWinRate = features[4];
  const bearishWinRate = features[5];

  if (['long_call', 'cash_secured_put', 'bull_call_spread'].includes(strategy) && bullishWinRate > 0.6) {
    reasons.push('Strong historical performance with bullish strategies');
  }

  if (['covered_call', 'long_put', 'bear_put_spread'].includes(strategy) && bearishWinRate > 0.6) {
    reasons.push('Strong historical performance with bearish strategies');
  }

  return reasons.length > 0 ? reasons : ['Based on your trading patterns'];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for feature-based reasoning
function getStrategyReasoning(strategy: OptionStrategy, _features: number[]): string {
  const descriptions: Record<OptionStrategy, string> = {
    long_call: 'For strong bullish conviction',
    long_put: 'For strong bearish conviction',
    covered_call: 'Generate income on existing shares',
    cash_secured_put: 'Acquire shares at lower price',
    bull_call_spread: 'Limited risk bullish play',
    bear_put_spread: 'Limited risk bearish play',
    iron_condor: 'Range-bound expectation',
    straddle: 'High volatility expected',
    strangle: 'High volatility, wider strikes',
    calendar_spread: 'Volatility term structure play',
  };
  return descriptions[strategy];
}

function getStrategyRiskLevel(strategy: OptionStrategy): 'low' | 'medium' | 'high' {
  const riskLevels: Record<OptionStrategy, 'low' | 'medium' | 'high'> = {
    covered_call: 'low',
    cash_secured_put: 'low',
    bull_call_spread: 'medium',
    bear_put_spread: 'medium',
    iron_condor: 'medium',
    long_call: 'high',
    long_put: 'high',
    straddle: 'high',
    strangle: 'high',
    calendar_spread: 'medium',
  };
  return riskLevels[strategy];
}
