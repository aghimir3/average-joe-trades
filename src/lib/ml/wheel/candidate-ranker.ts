/**
 * Candidate Ranker Model for Wheel Strategy
 * Ranks potential wheel underlyings by expected risk-adjusted return
 */

import * as tf from '@tensorflow/tfjs';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import {
  extractCandidateFeatures,
  candidateFeaturesToArray,
  prepareCandidateTrainingData,
  getWheelSymbols,
  getWheelSymbolsFromOpenPositions,
  CANDIDATE_FEATURE_NAMES,
} from './feature-engineering';
import { saveModelToSQL, loadModelFromSQL, storePrediction } from './model-storage';
import type { WheelRanking, TrainingStats } from './types';

const NUM_FEATURES = CANDIDATE_FEATURE_NAMES.length;

/**
 * Build the candidate ranker neural network
 * Regression model predicting expected annualized return
 */
export async function buildCandidateRanker(): Promise<tf.LayersModel> {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({
        units: 16,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dense({
        units: 8,
        activation: 'relu',
      }),
      tf.layers.dense({
        units: 1,
        activation: 'linear', // Predicted annualized return
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

/**
 * Train the candidate ranker model for a user
 */
export async function trainCandidateRanker(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    // Prepare training data
    const trainingData = await prepareCandidateTrainingData(userId);

    if (trainingData.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 30 wheel trades for training, found ${trainingData.length}`,
      };
    }

    // Build model
    const model = await buildCandidateRanker();

    // Prepare tensors
    const features = trainingData.map((d) => d.features);
    const labels = trainingData.map((d) => [d.label]);
    const rows = features.map((featureRow, index) => ({
      features: featureRow,
      label: labels[index],
    }));
    const split = temporalSplit(rows, {
      validationFraction: 0.2,
      minTrainRows: 24,
      minValidationRows: 6,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((row) => row.features));
    const trainYs = tf.tensor2d(split.trainRows.map((row) => row.label));
    const validationXs = tf.tensor2d(split.validationRows.map((row) => row.features));
    const validationYs = tf.tensor2d(split.validationRows.map((row) => row.label));

    // Train with early stopping
    const startTime = Date.now();
    const history = await model.fit(trainXs, trainYs, {
      epochs: 100,
      batchSize: Math.min(32, Math.floor(split.trainRows.length / 4)),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: tf.callbacks.earlyStopping({ patience: 10, monitor: 'val_loss' }),
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;

    // Get final metrics
    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const valLoss = getLastHistoryMetric(history, ['val_loss']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss: valLoss,
      trainingTime,
    };

    // Save model to SQL
    await saveModelToSQL(userId, 'candidate-ranker', model, stats);

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

/**
 * Get wheel candidate rankings for a user
 * Uses batch prediction for better performance when processing multiple symbols.
 * @param userId - User ID
 * @param options.currentHoldingsOnly - If true, only show symbols user currently holds wheel positions in
 * @param options.brokerageAccountId - Optional account filter (null = all accounts)
 */
export async function getWheelRankings(
  userId: string,
  options: { currentHoldingsOnly?: boolean; brokerageAccountId?: string | null } = {}
): Promise<WheelRanking[]> {
  // Load model
  const model = await loadModelFromSQL(userId, 'candidate-ranker');

  // Get symbols based on filter
  // If currentHoldingsOnly: symbols from open wheel positions
  // Otherwise: all symbols with 3+ historical wheel trades
  const symbols = options.currentHoldingsOnly
    ? await getWheelSymbolsFromOpenPositions(userId, options.brokerageAccountId)
    : await getWheelSymbols(userId);

  if (symbols.length === 0) {
    return [];
  }

  // Step 1: Extract features for all symbols
  const symbolFeatures: Array<{
    symbol: string;
    features: Awaited<ReturnType<typeof extractCandidateFeatures>>;
    featureArray: number[];
  }> = [];

  for (const symbol of symbols) {
    try {
      const features = await extractCandidateFeatures(userId, symbol);
      const featureArray = candidateFeaturesToArray(features);
      symbolFeatures.push({ symbol, features, featureArray });
    } catch (error) {
      console.error(`Error extracting features for ${symbol}:`, error);
    }
  }

  if (symbolFeatures.length === 0) {
    return [];
  }

  // Step 2: Batch predict with model if available
  let scores: number[] = [];
  let confidences: number[] = [];

  if (model && symbolFeatures.length > 0) {
    // Batch all predictions in a single model.predict() call
    const featureMatrix = symbolFeatures.map((sf) => sf.featureArray);
    const inputTensor = tf.tensor2d(featureMatrix);
    const predictions = model.predict(inputTensor) as tf.Tensor;
    const predictionValues = await predictions.data();

    // Convert predictions to scores
    scores = Array.from(predictionValues).map((v) =>
      Math.max(0, Math.min(100, (v + 1) * 50))
    );
    // Derive confidence from prediction spread (tighter spread = higher confidence)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.length > 1
      ? scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length
      : 0;
    const spread = Math.sqrt(variance) / 50; // Normalize: 50 is half the 0-100 range
    const modelConfidence = Math.max(0.5, Math.min(0.85, 0.85 - spread * 0.35));
    confidences = scores.map(() => Math.round(modelConfidence * 100) / 100);

    inputTensor.dispose();
    predictions.dispose();
  } else {
    // Fallback to statistical ranking
    scores = symbolFeatures.map((sf) => calculateStatisticalScore(sf.features));
    confidences = scores.map(() => 0.5);
  }

  // Step 3: Build rankings with additional metrics
  const rankings: WheelRanking[] = symbolFeatures.map((sf, i) => {
    const features = sf.features;

    // Calculate risk score based on assignment rate and volatility
    const riskScore = Math.round(
      Math.min(10, Math.max(1, features.userAssignmentRate * 5 + 5 + Math.abs(features.premiumTrend) * 2))
    );

    // Expected monthly return based on historical data
    const expectedMonthlyReturn =
      features.userWheelTradesCount > 0
        ? features.userTotalPnlOnSymbol / features.userWheelTradesCount / 100 / 12
        : 0.02;

    // Generate reasoning
    const reasoning = generateReasoning(features);

    return {
      symbol: sf.symbol,
      score: scores[i],
      expectedMonthlyReturn,
      riskScore,
      confidence: confidences[i],
      reasoning,
    };
  });

  // Sort by score descending
  rankings.sort((a, b) => b.score - a.score);

  // Store prediction for accuracy tracking
  if (rankings.length > 0) {
    await storePrediction(userId, 'ranking', rankings[0].symbol, rankings.slice(0, 5));
  }

  // Don't dispose model - it's cached and reused by loadModelFromSQL

  return rankings;
}

/**
 * Calculate statistical score without ML (fallback)
 */
function calculateStatisticalScore(features: {
  userWheelWinRate: number;
  userWheelTradesCount: number;
  userTotalPnlOnSymbol: number;
  userAssignmentRate: number;
  daysSinceLastWheelTrade: number;
}): number {
  // Weighted scoring
  const winRateScore = features.userWheelWinRate * 40;
  const volumeScore = Math.min(features.userWheelTradesCount / 20, 1) * 20;
  const profitScore = features.userTotalPnlOnSymbol > 0 ? 20 : 0;
  const recencyScore = Math.max(0, 10 - features.daysSinceLastWheelTrade / 30);
  const riskPenalty = features.userAssignmentRate > 0.3 ? 10 : 0;

  return Math.max(0, Math.min(100, winRateScore + volumeScore + profitScore + recencyScore - riskPenalty));
}

/**
 * Generate human-readable reasoning for the ranking
 */
function generateReasoning(features: {
  symbol: string;
  userWheelWinRate: number;
  userWheelTradesCount: number;
  userTotalPnlOnSymbol: number;
  estimatedIvRank: number;
  premiumTrend: number;
  userAssignmentRate: number;
  daysSinceLastWheelTrade: number;
}): string[] {
  const reasons: string[] = [];

  // Win rate assessment
  if (features.userWheelWinRate >= 0.8) {
    reasons.push(`Excellent win rate: ${(features.userWheelWinRate * 100).toFixed(0)}%`);
  } else if (features.userWheelWinRate >= 0.6) {
    reasons.push(`Good win rate: ${(features.userWheelWinRate * 100).toFixed(0)}%`);
  }

  // Volume assessment
  if (features.userWheelTradesCount >= 20) {
    reasons.push(`High familiarity: ${features.userWheelTradesCount} trades`);
  } else if (features.userWheelTradesCount >= 10) {
    reasons.push(`Moderate experience: ${features.userWheelTradesCount} trades`);
  }

  // Profitability
  if (features.userTotalPnlOnSymbol > 1000) {
    reasons.push(`Total profit: $${features.userTotalPnlOnSymbol.toFixed(0)}`);
  }

  // IV assessment
  if (features.estimatedIvRank >= 70) {
    reasons.push('Elevated premiums currently');
  } else if (features.estimatedIvRank <= 30) {
    reasons.push('Premiums below historical average');
  }

  // Premium trend
  if (features.premiumTrend > 0) {
    reasons.push('Premiums trending up');
  } else if (features.premiumTrend < 0) {
    reasons.push('Premiums trending down');
  }

  // Assignment risk
  if (features.userAssignmentRate > 0.3) {
    reasons.push(`Note: Higher assignment rate (${(features.userAssignmentRate * 100).toFixed(0)}%)`);
  }

  // Recency
  if (features.daysSinceLastWheelTrade <= 7) {
    reasons.push('Recently traded');
  }

  return reasons.length > 0 ? reasons : ['Based on your trading history'];
}

/**
 * Get feature importance for explainability
 */
export async function getFeatureImportance(
  userId: string,
  symbol: string
): Promise<Map<string, number> | null> {
  const model = await loadModelFromSQL(userId, 'candidate-ranker');
  if (!model) return null;

  try {
    const features = await extractCandidateFeatures(userId, symbol);
    const featureArray = candidateFeaturesToArray(features);
    const inputTensor = tf.tensor2d([featureArray]);

    // Compute gradients for feature importance
    const gradFn = tf.grad((x) => {
      const pred = model.predict(x) as tf.Tensor;
      return pred.squeeze();
    });

    const grads = gradFn(inputTensor);
    const gradValues = await grads.abs().data();

    const importanceMap = new Map<string, number>();
    CANDIDATE_FEATURE_NAMES.forEach((feat, i) => {
      importanceMap.set(feat, gradValues[i]);
    });

    inputTensor.dispose();
    grads.dispose();
    // Don't dispose model - it's cached and reused by loadModelFromSQL

    return importanceMap;
  } catch (error) {
    console.error('Error computing feature importance:', error);
    return null;
  }
}
