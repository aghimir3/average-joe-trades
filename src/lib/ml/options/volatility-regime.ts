/**
 * Volatility Regime Detector
 * Classifies market volatility conditions: low, medium, high, extreme
 * Uses Temporal patterns from user's trading history
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { clamp, calculatePercentile, standardDeviation } from '@/lib/ml/math-utils';
import { extractVolatilityFeatures, VOLATILITY_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel, logPrediction } from './model-storage';
import { getOrComputeFeatures } from './feature-store';
import type { VolatilityRegime, VolatilityRegimeResult, TrainingStats } from './types';

const NUM_FEATURES = VOLATILITY_FEATURE_NAMES.length;
const NUM_CLASSES = 4; // low, medium, high, extreme

// ============================================================================
// Model Architecture
// ============================================================================

export function buildVolatilityRegimeModel(): tf.LayersModel {
  const model = tf.sequential({
    layers: [
      // Input layer with batch normalization
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.batchNormalization(),
      tf.layers.dropout({ rate: 0.3 }),

      // Hidden layer with attention-like weighting
      tf.layers.dense({
        units: 16,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.2 }),

      // Output layer
      tf.layers.dense({
        units: NUM_CLASSES,
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

export async function trainVolatilityRegimeModel(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    // Get historical trades
    const trades = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeType: 'option',
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (trades.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 30 option trades for training, found ${trades.length}`,
      };
    }

    // Prepare training data
    const trainingData = await prepareVolatilityTrainingData(userId, trades);

    if (trainingData.length < 20) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: 'Insufficient training data after processing',
      };
    }

    // Build model
    const model = buildVolatilityRegimeModel();

    const split = temporalSplit(trainingData, {
      validationFraction: 0.2,
      minTrainRows: 16,
      minValidationRows: 4,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((d) => d.features));
    const trainYs = tf.tensor2d(split.trainRows.map((d) => d.label));
    const validationXs = tf.tensor2d(split.validationRows.map((d) => d.features));
    const validationYs = tf.tensor2d(split.validationRows.map((d) => d.label));

    // Train
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
    const valLoss = getLastHistoryMetric(history, ['val_loss']);
    const accuracy = getLastHistoryMetric(history, ['accuracy', 'acc']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss: valLoss,
      accuracy,
      trainingTime,
    };

    // Save model
    await saveOptionsModel(userId, 'volatility-regime', 'Volatility Regime Detector', model, stats);

    // Cleanup
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

export async function predictVolatilityRegime(
  userId: string,
  symbol: string
): Promise<VolatilityRegimeResult> {
  // Get features (with caching)
  const featureVector = await getOrComputeFeatures(userId, symbol, 'volatility', () =>
    extractVolatilityFeatures(userId, symbol)
  );

  // Load model
  const model = await loadOptionsModel(userId, 'volatility-regime');

  let probabilities: number[];
  let confidence: number;

  if (model) {
    // Use ML model
    const inputTensor = tf.tensor2d([featureVector.features]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    probabilities = Array.from(await prediction.data());

    inputTensor.dispose();
    prediction.dispose();

    confidence = Math.max(...probabilities);
  } else {
    // Fallback to statistical method
    probabilities = calculateStatisticalRegime(featureVector.features);
    confidence = Math.max(...probabilities) * 0.7; // Lower confidence for fallback
  }

  const regimeIndex = probabilities.indexOf(Math.max(...probabilities));
  const regimes: VolatilityRegime[] = ['low', 'medium', 'high', 'extreme'];
  const regime = regimes[regimeIndex];

  const result: VolatilityRegimeResult = {
    regime,
    confidence,
    probabilities: {
      low: probabilities[0],
      medium: probabilities[1],
      high: probabilities[2],
      extreme: probabilities[3],
    },
    indicators: {
      premiumPercentile: featureVector.features[0] * 100,
      tradeFrequencyChange: featureVector.features[3] * 100,
      winRateChange: featureVector.features[4] * 100,
    },
    recommendation: getRegimeRecommendation(regime),
  };

  // Log prediction
  if (model) {
    const modelInfo = await prisma.optionsMLModel.findFirst({
      where: { userId, modelType: 'volatility-regime', isActive: true },
      select: { version: true },
    });

    await logPrediction(userId, 'volatility-regime', modelInfo?.version ?? 1, {
      symbol,
      predictionType: 'regime',
      prediction: result,
      confidence,
    });
  }

  return result;
}

// ============================================================================
// Training Data Preparation
// ============================================================================

async function prepareVolatilityTrainingData(
  userId: string,
  trades: {
    symbol: string;
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    strike: unknown;
    realizedPnL: unknown;
  }[]
): Promise<{ features: number[]; label: number[] }[]> {
  const trainingData: { features: number[]; label: number[] }[] = [];

  // Group trades by symbol
  const tradesBySymbol = new Map<string, typeof trades>();
  for (const trade of trades) {
    const existing = tradesBySymbol.get(trade.symbol) || [];
    existing.push(trade);
    tradesBySymbol.set(trade.symbol, existing);
  }

  // For each symbol with enough history
  for (const [, symbolTrades] of tradesBySymbol.entries()) {
    if (symbolTrades.length < 5) continue;

    // Calculate features at different time points
    for (let i = 10; i < symbolTrades.length; i++) {
      const historicalTrades = symbolTrades.slice(0, i);

      // Extract features from historical trades
      const features = calculateHistoricalFeatures(historicalTrades);

      // Calculate label from subsequent trades
      const futureTrades = symbolTrades.slice(i, Math.min(i + 5, symbolTrades.length));
      const label = calculateVolatilityLabel(futureTrades);

      trainingData.push({ features, label });
    }
  }

  return trainingData;
}

function calculateHistoricalFeatures(
  trades: { openPrice: unknown; strike: unknown; openDate: Date; closeDate: Date; realizedPnL: unknown }[]
): number[] {
  // Calculate premium percentages
  const premiumPcts = trades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openPrice)) / Number(t.strike)) * 100);

  if (premiumPcts.length === 0) {
    return new Array(NUM_FEATURES).fill(0.5);
  }

  const avg = premiumPcts.reduce((a, b) => a + b, 0) / premiumPcts.length;
  const stdDev = standardDeviation(premiumPcts);

  // Recent vs older comparison
  const midpoint = Math.floor(premiumPcts.length / 2);
  const olderAvg = premiumPcts.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint || avg;
  const newerAvg = premiumPcts.slice(midpoint).reduce((a, b) => a + b, 0) / (premiumPcts.length - midpoint) || avg;
  const olderPremiumPcts = premiumPcts.slice(0, midpoint);
  const newerPremiumPcts = premiumPcts.slice(midpoint);

  const premiumPercentile = calculatePercentile(premiumPcts, premiumPcts[premiumPcts.length - 1]) / 100;
  const premiumTrend = clamp((newerAvg - olderAvg) / olderAvg, -1, 1);
  const premiumStdDev = clamp(stdDev / avg, 0, 2);

  // Trade frequency
  const recentCount = trades.slice(-Math.floor(trades.length / 3)).length;
  const olderCount = trades.slice(0, Math.floor(trades.length / 3)).length;
  const frequencyChange = olderCount > 0 ? clamp((recentCount - olderCount) / olderCount, -1, 1) : 0;

  // Win rates
  const recentTrades = trades.slice(-Math.floor(trades.length / 3));
  const recentWins = recentTrades.filter((t) => Number(t.realizedPnL) > 0).length;
  const recentWinRate = recentTrades.length > 0 ? recentWins / recentTrades.length : 0.5;
  const allWins = trades.filter((t) => Number(t.realizedPnL) > 0).length;
  const allWinRate = trades.length > 0 ? allWins / trades.length : 0.5;
  const winRateChange = clamp((recentWinRate - allWinRate) / Math.max(0.1, allWinRate), -1, 1);

  // Cadence/hold trends as leakage-safe time-structure proxies.
  const holdDays = trades.map((trade) =>
    Math.max(
      0,
      (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (24 * 60 * 60 * 1000)
    )
  );
  const olderHoldDays = holdDays.slice(0, midpoint);
  const newerHoldDays = holdDays.slice(midpoint);
  const avgOlderHold = olderHoldDays.length > 0
    ? olderHoldDays.reduce((sum, value) => sum + value, 0) / olderHoldDays.length
    : 0;
  const avgNewerHold = newerHoldDays.length > 0
    ? newerHoldDays.reduce((sum, value) => sum + value, 0) / newerHoldDays.length
    : avgOlderHold;
  const holdDaysChange = avgOlderHold > 0
    ? clamp((avgNewerHold - avgOlderHold) / avgOlderHold, -1, 1)
    : 0;

  const openTimes = trades.map((trade) => new Date(trade.openDate).getTime());
  const tradeIntervalsDays = openTimes
    .slice(1)
    .map((value, index) => Math.max(0, (value - openTimes[index]) / (24 * 60 * 60 * 1000)));
  const intervalMidpoint = Math.floor(tradeIntervalsDays.length / 2);
  const olderIntervals = tradeIntervalsDays.slice(0, intervalMidpoint);
  const newerIntervals = tradeIntervalsDays.slice(intervalMidpoint);
  const avgOlderInterval = olderIntervals.length > 0
    ? olderIntervals.reduce((sum, value) => sum + value, 0) / olderIntervals.length
    : 0;
  const avgNewerInterval = newerIntervals.length > 0
    ? newerIntervals.reduce((sum, value) => sum + value, 0) / newerIntervals.length
    : avgOlderInterval;
  const cadenceChange = avgOlderInterval > 0
    ? clamp((avgNewerInterval - avgOlderInterval) / avgOlderInterval, -1, 1)
    : 0;

  const recentVolatility = standardDeviation(newerPremiumPcts.length > 1 ? newerPremiumPcts : premiumPcts);
  const historicalVolatility = standardDeviation(olderPremiumPcts.length > 1 ? olderPremiumPcts : premiumPcts);

  return [
    clamp(premiumPercentile, 0, 1),
    (premiumTrend + 1) / 2,
    clamp(premiumStdDev / 2, 0, 1),
    (frequencyChange + 1) / 2,
    (winRateChange + 1) / 2,
    (cadenceChange + 1) / 2, // trade-cadence proxy for DTE mix changes
    (holdDaysChange + 1) / 2,
    clamp(recentVolatility / 10, 0, 1),
    clamp(historicalVolatility / 10, 0, 1),
    clamp((Math.max(...premiumPcts) - Math.min(...premiumPcts)) / avg / 2, 0, 1), // premiumSpread
  ];
}

function calculateVolatilityLabel(
  futureTrades: { openPrice: unknown; strike: unknown; realizedPnL: unknown }[]
): number[] {
  // Calculate volatility from future trades
  const premiumPcts = futureTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => Math.abs(Number(t.openPrice)) / Number(t.strike) * 100);

  if (premiumPcts.length === 0) {
    return [0, 1, 0, 0]; // Default to medium
  }

  const avg = premiumPcts.reduce((a, b) => a + b, 0) / premiumPcts.length;
  const stdDev = Math.sqrt(
    premiumPcts.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / premiumPcts.length
  );

  // Classify based on premium level and volatility
  const volatilityScore = avg + stdDev;

  // One-hot encoding: [low, medium, high, extreme]
  if (volatilityScore < 2) return [1, 0, 0, 0]; // Low
  if (volatilityScore < 4) return [0, 1, 0, 0]; // Medium
  if (volatilityScore < 7) return [0, 0, 1, 0]; // High
  return [0, 0, 0, 1]; // Extreme
}

// ============================================================================
// Helpers
// ============================================================================

function calculateStatisticalRegime(features: number[]): number[] {
  // Use premium percentile, trend, and std dev to estimate regime
  const premiumPercentile = features[0];
  const premiumTrend = features[1] * 2 - 1; // Convert back to -1 to 1
  const premiumStdDev = features[2] * 2;

  const volatilityScore = premiumPercentile * 0.4 + (premiumTrend + 1) / 2 * 0.3 + premiumStdDev * 0.3;

  // Soft classification
  if (volatilityScore < 0.25) return [0.7, 0.2, 0.08, 0.02];
  if (volatilityScore < 0.5) return [0.2, 0.6, 0.15, 0.05];
  if (volatilityScore < 0.75) return [0.05, 0.2, 0.6, 0.15];
  return [0.02, 0.08, 0.3, 0.6];
}

function getRegimeRecommendation(regime: VolatilityRegime): string {
  const recommendations: Record<VolatilityRegime, string> = {
    low: 'Consider tighter strikes and shorter DTEs. Premium is below average.',
    medium: 'Normal conditions. Standard strike selection and DTE choices are appropriate.',
    high: 'Elevated volatility. Consider wider strikes and collecting more premium.',
    extreme: 'Very high volatility. Be cautious with position sizing. Great premium but higher risk.',
  };
  return recommendations[regime];
}

