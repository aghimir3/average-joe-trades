/**
 * Entry Timing Optimizer
 * Predicts optimal entry timing based on user's historical patterns
 * Uses LSTM-like pattern with attention for temporal dependencies
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { extractEntryTimingFeatures, ENTRY_TIMING_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel, logPrediction } from './model-storage';
import { getOrComputeFeatures } from './feature-store';
import type { EntryTimingResult, TrainingStats } from './types';

const NUM_FEATURES = ENTRY_TIMING_FEATURE_NAMES.length;

// ============================================================================
// Model Architecture
// ============================================================================

export function buildEntryTimingModel(): tf.LayersModel {
  const model = tf.sequential({
    layers: [
      // Input processing
      tf.layers.dense({
        units: 64,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.batchNormalization(),
      tf.layers.dropout({ rate: 0.3 }),

      // Pattern recognition
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.2 }),

      // Attention-like layer
      tf.layers.dense({
        units: 16,
        activation: 'tanh',
      }),

      // Output: entry score (0-1) and confidence
      tf.layers.dense({
        units: 2,
        activation: 'sigmoid',
      }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

// ============================================================================
// Training
// ============================================================================

export async function trainEntryTimingModel(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    const trades = await prisma.realizedClose.findMany({
      where: { userId, hasUnknownBasis: false },
      orderBy: { openDate: 'asc' },
    });

    if (trades.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 30 trades for training, found ${trades.length}`,
      };
    }

    // Prepare training data
    const trainingData = prepareEntryTimingData(trades);

    if (trainingData.length < 20) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: 'Insufficient training data',
      };
    }

    const model = buildEntryTimingModel();

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
    const valLoss = getLastHistoryMetric(history, ['val_loss']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss: valLoss,
      trainingTime,
    };

    await saveOptionsModel(userId, 'entry-timing', 'Entry Timing Optimizer', model, stats);

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

export async function predictEntryTiming(
  userId: string,
  symbol: string
): Promise<EntryTimingResult> {
  const featureVector = await getOrComputeFeatures(userId, symbol, 'user_pattern', () =>
    extractEntryTimingFeatures(userId, symbol)
  );

  const model = await loadOptionsModel(userId, 'entry-timing');

  let entryScore: number;
  let confidence: number;

  if (model) {
    const inputTensor = tf.tensor2d([featureVector.features]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    const [score, conf] = Array.from(await prediction.data());

    entryScore = score;
    confidence = conf;

    inputTensor.dispose();
    prediction.dispose();
  } else {
    // Fallback
    const result = calculateStatisticalEntryScore(featureVector.features);
    entryScore = result.score;
    confidence = result.confidence * 0.7;
  }

  // Analyze day-of-week patterns
  const dayOfWeekAnalysis = await analyzeDayOfWeekPatterns(userId);

  // Generate reasoning
  const reasoning = generateEntryReasoning(featureVector.features, entryScore);

  // Determine if should wait
  const suggestedWait = entryScore < 0.4 ? 'Consider waiting for better conditions' : undefined;

  const result: EntryTimingResult = {
    entryScore,
    confidence,
    reasoning,
    suggestedWait,
    dayOfWeekAnalysis,
    optimalConditions: getOptimalConditions(featureVector.features),
  };

  // Log prediction
  if (model) {
    const modelInfo = await prisma.optionsMLModel.findFirst({
      where: { userId, modelType: 'entry-timing', isActive: true },
      select: { version: true },
    });

    await logPrediction(userId, 'entry-timing', modelInfo?.version ?? 1, {
      symbol,
      predictionType: 'entry_score',
      prediction: result,
      confidence,
    });
  }

  return result;
}

// ============================================================================
// Training Data Preparation
// ============================================================================

function prepareEntryTimingData(
  trades: {
    symbol: string;
    openDate: Date;
    closeDate: Date;
    openAmount: unknown;
    realizedPnL: unknown;
  }[]
): { features: number[]; label: number[] }[] {
  const trainingData: { features: number[]; label: number[] }[] = [];

  for (let i = 5; i < trades.length; i++) {
    const historicalTrades = trades.slice(0, i);
    const currentTrade = trades[i];

    // Extract features from context before this trade
    const features = calculateEntryFeatures(historicalTrades, currentTrade.openDate);

    // Calculate label: was this a good entry?
    const pnl = Number(currentTrade.realizedPnL);
    const deploymentCost = Math.max(1, Math.abs(Number(currentTrade.openAmount)));
    const returnPct = pnl / deploymentCost;

    // Entry score: positive return = good entry
    const entryScore = Math.max(0, Math.min(1, (returnPct + 0.4) / 0.8));

    // Confidence grows with realized edge magnitude and enough holding-time signal.
    const holdDays = Math.max(
      1,
      (new Date(currentTrade.closeDate).getTime() - new Date(currentTrade.openDate).getTime()) / (24 * 60 * 60 * 1000)
    );
    const confidence = Math.max(
      0.3,
      Math.min(0.95, 0.45 + Math.min(0.4, Math.abs(returnPct)) + (holdDays >= 3 ? 0.1 : 0))
    );

    trainingData.push({
      features,
      label: [entryScore, confidence],
    });
  }

  return trainingData;
}

function calculateEntryFeatures(
  historicalTrades: { openDate: Date; closeDate: Date; openAmount: unknown; realizedPnL: unknown }[],
  entryDate: Date
): number[] {
  const features = new Array(NUM_FEATURES).fill(0.5);

  // Day of week
  features[0] = entryDate.getDay() / 6;

  // Day of month
  features[1] = (entryDate.getDate() - 1) / 30;

  // Week of month
  features[2] = Math.ceil(entryDate.getDate() / 7) / 4;

  // Hour (use noon default)
  features[3] = 12 / 23;

  // Days since last trade
  const lastTrade = historicalTrades[historicalTrades.length - 1];
  if (lastTrade) {
    const days = (entryDate.getTime() - lastTrade.closeDate.getTime()) / (24 * 60 * 60 * 1000);
    features[4] = Math.min(1, days / 30);
  }

  // Recent win rate
  const recentTrades = historicalTrades.slice(-20);
  const wins = recentTrades.filter((t) => Number(t.realizedPnL) > 0).length;
  features[5] = recentTrades.length > 0 ? wins / recentTrades.length : 0.5;

  const recentRiskAdjusted = historicalTrades
    .slice(-10)
    .map((t) => {
      const cost = Math.max(1, Math.abs(Number(t.openAmount)));
      return Number(t.realizedPnL) / cost;
    });
  const olderRiskAdjusted = historicalTrades
    .slice(-20, -10)
    .map((t) => {
      const cost = Math.max(1, Math.abs(Number(t.openAmount)));
      return Number(t.realizedPnL) / cost;
    });
  const recentAvg = recentRiskAdjusted.length > 0
    ? recentRiskAdjusted.reduce((sum, value) => sum + value, 0) / recentRiskAdjusted.length
    : 0;
  const olderAvg = olderRiskAdjusted.length > 0
    ? olderRiskAdjusted.reduce((sum, value) => sum + value, 0) / olderRiskAdjusted.length
    : recentAvg;
  const edgeVsHistory = olderAvg !== 0 ? (recentAvg - olderAvg) / Math.max(Math.abs(olderAvg), 0.02) : 0;
  features[6] = Math.max(0, Math.min(1, (edgeVsHistory + 1) / 2));

  // Trade counts
  const sevenDaysAgo = new Date(entryDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(entryDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  features[7] = Math.min(1, historicalTrades.filter((t) => t.openDate >= sevenDaysAgo).length / 10);
  features[8] = Math.min(1, historicalTrades.filter((t) => t.openDate >= thirtyDaysAgo).length / 30);

  // Avg return last 5 trades
  const last5 = historicalTrades.slice(-5);
  if (last5.length > 0) {
    const avgReturn = last5.reduce((acc, t) => acc + Number(t.realizedPnL), 0) / last5.length / 1000;
    features[9] = Math.max(0, Math.min(1, avgReturn + 0.5));
  }

  // Consecutive wins/losses
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  for (let i = historicalTrades.length - 1; i >= 0; i--) {
    const pnl = Number(historicalTrades[i].realizedPnL);
    if (pnl > 0) {
      if (consecutiveLosses === 0) consecutiveWins++;
      else break;
    } else {
      if (consecutiveWins === 0) consecutiveLosses++;
      else break;
    }
  }
  features[12] = Math.min(1, consecutiveWins / 5);
  features[13] = Math.min(1, consecutiveLosses / 5);

  return features;
}

// ============================================================================
// Helpers
// ============================================================================

function calculateStatisticalEntryScore(features: number[]): { score: number; confidence: number } {
  // Weighted scoring based on features
  const recentWinRate = features[5];
  const daysSinceLastTrade = features[4];
  const consecutiveWins = features[12];
  const consecutiveLosses = features[13];

  // Better entry when: high recent win rate, not too many consecutive losses
  let score = recentWinRate * 0.4;
  score += (1 - consecutiveLosses) * 0.3;
  score += (daysSinceLastTrade > 0.1 ? 0.2 : 0.1); // Some rest is good
  score += consecutiveWins * 0.1;

  return {
    score: Math.max(0, Math.min(1, score)),
    confidence: 0.5,
  };
}

async function analyzeDayOfWeekPatterns(
  userId: string
): Promise<{ dayName: string; historicalWinRate: number; avgReturn: number }[]> {
  const trades = await prisma.realizedClose.findMany({
    where: { userId, hasUnknownBasis: false },
    select: { openDate: true, realizedPnL: true },
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay: { wins: number; total: number; pnl: number }[] = Array(7)
    .fill(null)
    .map(() => ({ wins: 0, total: 0, pnl: 0 }));

  for (const trade of trades) {
    const day = new Date(trade.openDate).getDay();
    byDay[day].total++;
    byDay[day].pnl += Number(trade.realizedPnL);
    if (Number(trade.realizedPnL) > 0) byDay[day].wins++;
  }

  return dayNames.map((dayName, i) => ({
    dayName,
    historicalWinRate: byDay[i].total > 0 ? byDay[i].wins / byDay[i].total : 0.5,
    avgReturn: byDay[i].total > 0 ? byDay[i].pnl / byDay[i].total : 0,
  }));
}

function generateEntryReasoning(features: number[], score: number): string[] {
  const reasons: string[] = [];

  const recentWinRate = features[5];
  const consecutiveWins = features[12];
  const consecutiveLosses = features[13];

  if (recentWinRate >= 0.6) {
    reasons.push(`Recent win rate is strong at ${(recentWinRate * 100).toFixed(0)}%`);
  } else if (recentWinRate < 0.4) {
    reasons.push(`Recent win rate is low at ${(recentWinRate * 100).toFixed(0)}%`);
  }

  if (consecutiveWins >= 0.4) {
    reasons.push(`On a winning streak`);
  }

  if (consecutiveLosses >= 0.4) {
    reasons.push(`Recent losing streak - consider being cautious`);
  }

  if (score >= 0.7) {
    reasons.push('Conditions appear favorable for entry');
  } else if (score < 0.4) {
    reasons.push('Consider waiting for better conditions');
  }

  return reasons.length > 0 ? reasons : ['Based on your historical patterns'];
}

function getOptimalConditions(features: number[]): string[] {
  const conditions: string[] = [];

  // Based on feature values, suggest optimal conditions
  if (features[5] >= 0.6) {
    conditions.push('Recent performance supports current timing');
  }

  if (features[4] >= 0.1 && features[4] <= 0.3) {
    conditions.push('Good spacing from last trade');
  }

  conditions.push('Check premium levels vs historical average');
  conditions.push('Consider overall market conditions');

  return conditions;
}
