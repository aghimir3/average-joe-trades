/**
 * Aggregated ML Model for Wheel Strategy
 *
 * Trains on ALL users' wheel trades to provide community-wide insights.
 * This gives users "wisdom of the crowd" recommendations based on collective
 * performance across all traders.
 *
 * Privacy: Only aggregate statistics are used - no individual user data is exposed.
 * Uses CommunityMLModel table (no foreign key to User).
 *
 * Model Improvements (v2):
 * - Z-score normalization for all features (mean=0, std=1)
 * - Batch normalization layers for faster convergence
 * - Outlier detection and removal (IQR method)
 * - Deterministic holdout split for stable validation
 * - Normalization parameters stored with model for inference
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import type { TrainingStats } from './types';
import {
  deriveCommunityRecommendation,
  deriveCommunityScore,
  type CommunityScoreMethod,
} from './community-score-policy';

const log = createChildLogger({ module: 'aggregated-ml' });

// Model type constant
const COMMUNITY_MODEL_TYPE = 'aggregated-ranker-v2';

// ============================================================================
// Types
// ============================================================================

export interface AggregatedTickerStats {
  symbol: string;
  totalTrades: number;
  uniqueTraders: number;
  winRate: number;
  avgPremiumPct: number; // Premium as % of strike
  avgHoldDays: number;
  assignmentRate: number;
  avgAnnualizedReturn: number;
  cspStats: {
    trades: number;
    winRate: number;
    avgPremiumPct: number;
    assignmentRate: number;
  };
  ccStats: {
    trades: number;
    winRate: number;
    avgPremiumPct: number;
    assignmentRate: number;
  };
  // Optimal ranges based on community data
  optimalDteRange: { min: number; max: number };
  optimalOtmRange: { min: number; max: number };
}

export interface CommunityInsight {
  symbol: string;
  score: number; // 0-100 community score
  confidence: number; // Based on sample size
  totalTrades: number;
  uniqueTraders: number;
  winRate: number;
  avgAnnualizedReturn: number;
  assignmentRate: number; // Percentage of trades that were assigned
  avgHoldDays: number; // Average days held before closing
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'avoid';
  scoreMeta?: {
    method: CommunityScoreMethod;
    modelScore: number | null;
    statisticalScore: number;
    divergence: number | null;
  };
  insights: string[];
  optimalStrategy: {
    direction: 'csp' | 'covered_call' | 'both';
    dte: number;
    otmPercent: number;
  };
}

export interface AggregatedTrainingData {
  symbol: string;
  features: number[];
  label: number; // Annualized return
}

export type { NormalizationParams } from '../normalization';
import type { NormalizationParams } from '../normalization';
import { calculateNormalizationParams, normalizeFeatures, normalizeSingleFeature } from '../normalization';

// Feature names for aggregated model (expanded for better predictions)
const AGGREGATED_FEATURE_NAMES = [
  'winRate',
  'avgPremiumPct',
  'avgHoldDays',
  'assignmentRate',
  'totalTrades',
  'uniqueTraders',
  'cspWinRate',
  'ccWinRate',
  'cspTrades',
  'ccTrades',
  'cspAssignmentRate',
  'ccAssignmentRate',
] as const;

const NUM_FEATURES = AGGREGATED_FEATURE_NAMES.length;

// In-memory cache for community model
let communityModelCache: {
  model: tf.LayersModel;
  version: number;
  loadedAt: number;
  normParams: NormalizationParams;
} | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Community Model Storage (CommunityMLModel table)
// ============================================================================

/**
 * Save community model to CommunityMLModel table
 */
async function saveCommunityModel(
  model: tf.LayersModel,
  stats: TrainingStats,
  tickerCount: number,
  userCount: number,
  normParams: NormalizationParams
): Promise<void> {
  // Get model topology and weights
  const topology = model.toJSON(null, false);
  const weightData = await model.getWeights();
  const weightsArrays = await Promise.all(weightData.map(async (w) => Array.from(await w.data())));
  const weightsBuffer = Buffer.from(JSON.stringify(weightsArrays));

  // Include normalization params in training stats
  const extendedStats = {
    ...stats,
    normalizationParams: normParams,
  };

  // Deactivate existing models (both v1 and v2)
  await prisma.communityMLModel.updateMany({
    where: { modelType: { startsWith: 'aggregated-ranker' }, isActive: true },
    data: { isActive: false },
  });

  // Get next version
  const lastModel = await prisma.communityMLModel.findFirst({
    where: { modelType: COMMUNITY_MODEL_TYPE },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const newVersion = (lastModel?.version ?? 0) + 1;

  // Save new model
  await prisma.communityMLModel.create({
    data: {
      modelType: COMMUNITY_MODEL_TYPE,
      version: newVersion,
      modelTopology: JSON.stringify(topology),
      modelWeights: weightsBuffer,
      loss: stats.finalLoss,
      tradesUsed: stats.tradesUsed,
      epochsTrained: stats.epochs,
      trainingStats: JSON.stringify(extendedStats),
      uniqueUsers: userCount,
      tickersUsed: tickerCount,
      isActive: true,
    },
  });

  log.info({ version: newVersion, tickerCount, userCount }, 'Community model saved');

  // Update cache
  communityModelCache = { model, version: newVersion, loadedAt: Date.now(), normParams };
}

/**
 * Load community model from CommunityMLModel table
 */
async function loadCommunityModel(): Promise<{
  model: tf.LayersModel;
  normParams: NormalizationParams;
} | null> {
  // Try v2 first, then fall back to v1 for backwards compatibility
  let modelRecord = await prisma.communityMLModel.findFirst({
    where: { modelType: COMMUNITY_MODEL_TYPE, isActive: true },
    select: { version: true, modelTopology: true, modelWeights: true, trainingStats: true },
  });

  // Fallback to v1 model if v2 doesn't exist
  if (!modelRecord) {
    modelRecord = await prisma.communityMLModel.findFirst({
      where: { modelType: 'aggregated-ranker', isActive: true },
      select: { version: true, modelTopology: true, modelWeights: true, trainingStats: true },
    });
  }

  if (!modelRecord) return null;

  // Check cache
  if (
    communityModelCache &&
    communityModelCache.version === modelRecord.version &&
    Date.now() - communityModelCache.loadedAt < CACHE_TTL_MS
  ) {
    return { model: communityModelCache.model, normParams: communityModelCache.normParams };
  }

  try {
    // Parse topology and weights
    const topology = JSON.parse(modelRecord.modelTopology);
    // Prisma MSSQL adapter returns Uint8Array for Bytes fields - Buffer.from handles both types
    const weightsJson = Buffer.from(modelRecord.modelWeights).toString('utf8');
    const weightsArrays = JSON.parse(weightsJson) as number[][];

    // Reconstruct model
    const model = await tf.models.modelFromJSON(topology);

    // Load weights
    const existingWeights = model.getWeights();
    const loadedWeights = weightsArrays.map((arr, i) => {
      const shape = existingWeights[i].shape;
      return tf.tensor(arr, shape);
    });
    model.setWeights(loadedWeights);

    // Load normalization params from training stats
    let normParams: NormalizationParams;
    try {
      const trainingStats = JSON.parse(modelRecord.trainingStats || '{}');
      normParams = trainingStats.normalizationParams || getDefaultNormParams();
    } catch {
      normParams = getDefaultNormParams();
    }

    // Update cache
    communityModelCache = { model, version: modelRecord.version, loadedAt: Date.now(), normParams };

    log.debug({ version: modelRecord.version }, 'Community model loaded from database');

    return { model, normParams };
  } catch (err) {
    log.error({ err }, 'Failed to load community model');
    return null;
  }
}

/**
 * Get default normalization params for backwards compatibility
 */
function getDefaultNormParams(): NormalizationParams {
  return {
    featureMeans: Array(NUM_FEATURES).fill(0.5),
    featureStds: Array(NUM_FEATURES).fill(0.3),
    labelMean: 0,
    labelStd: 0.5,
  };
}

// ============================================================================
// Data Collection (Anonymized)
// ============================================================================

/**
 * Get IDs of test users to exclude from community aggregation.
 * Uses domain-based matching only to avoid false positives
 * (e.g., "contest@gmail.com" or "testerman@outlook.com").
 */
async function getTestUserIds(): Promise<Set<string>> {
  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@test.com' } },
        { email: { endsWith: '@test.local' } },
        { email: { endsWith: '@example.com' } },
      ],
    },
    select: { id: true },
  });
  return new Set(testUsers.map((u) => u.id));
}

/**
 * Collect aggregated statistics for all tickers across all users.
 * Data is fully anonymized - only aggregate counts and rates.
 * EXCLUDES test users (emails ending in @test.com, @test.local, @example.com).
 */
export async function collectAggregatedStats(): Promise<AggregatedTickerStats[]> {
  // First, get IDs of test users to exclude
  const testUserIds = await getTestUserIds();

  log.info({ testUserCount: testUserIds.size }, 'Excluding test users from training data');

  // Get all wheel trades from all users (only aggregate data), excluding test users
  const allTrades = await prisma.realizedClose.findMany({
    where: {
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
      userId: { notIn: Array.from(testUserIds) },
    },
    select: {
      symbol: true,
      userId: true,
      strategy: true,
      realizedPnL: true,
      openAmount: true,
      strike: true,
      openDate: true,
      closeDate: true,
      closeReason: true,
    },
  });

  if (allTrades.length === 0) {
    return [];
  }

  // Group by symbol
  const symbolGroups = new Map<string, typeof allTrades>();
  for (const trade of allTrades) {
    const existing = symbolGroups.get(trade.symbol) || [];
    existing.push(trade);
    symbolGroups.set(trade.symbol, existing);
  }

  const stats: AggregatedTickerStats[] = [];

  for (const [symbol, trades] of symbolGroups) {
    // Need minimum sample size for meaningful stats
    if (trades.length < 5) continue;

    const uniqueUsers = new Set(trades.map((t) => t.userId));
    const wins = trades.filter((t) => Number(t.realizedPnL) > 0);
    const assignments = trades.filter((t) => t.closeReason === 'assigned');

    // Calculate premium as % of strike
    const premiumPcts = trades
      .filter((t) => t.strike && Number(t.strike) > 0)
      .map((t) => (Math.abs(Number(t.openAmount)) / Number(t.strike)) * 100);
    const avgPremiumPct = premiumPcts.length > 0
      ? premiumPcts.reduce((a, b) => a + b, 0) / premiumPcts.length
      : 0;

    // Calculate hold days
    const holdDays = trades.map((t) => {
      const open = new Date(t.openDate);
      const close = new Date(t.closeDate);
      return Math.ceil((close.getTime() - open.getTime()) / (1000 * 60 * 60 * 24));
    });
    const avgHoldDays = holdDays.reduce((a, b) => a + b, 0) / holdDays.length;

    // Calculate annualized returns
    const annualizedReturns = trades.map((t) => {
      const days = Math.max(1, Math.ceil(
        (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const capital = Math.abs(Number(t.strike)) * 100 || 10000;
      const returnPct = Number(t.realizedPnL) / capital;
      return returnPct * (365 / days);
    });
    const avgAnnualizedReturn = annualizedReturns.reduce((a, b) => a + b, 0) / annualizedReturns.length;

    // CSP-specific stats
    const cspTrades = trades.filter((t) => t.strategy === 'cash_secured_put');
    const cspWins = cspTrades.filter((t) => Number(t.realizedPnL) > 0);
    const cspAssignments = cspTrades.filter((t) => t.closeReason === 'assigned');
    const cspPremiumPcts = cspTrades
      .filter((t) => t.strike && Number(t.strike) > 0)
      .map((t) => (Math.abs(Number(t.openAmount)) / Number(t.strike)) * 100);

    // CC-specific stats
    const ccTrades = trades.filter((t) => t.strategy === 'covered_call');
    const ccWins = ccTrades.filter((t) => Number(t.realizedPnL) > 0);
    const ccAssignments = ccTrades.filter((t) => t.closeReason === 'assigned');
    const ccPremiumPcts = ccTrades
      .filter((t) => t.strike && Number(t.strike) > 0)
      .map((t) => (Math.abs(Number(t.openAmount)) / Number(t.strike)) * 100);

    // Calculate optimal ranges from successful trades
    const successfulTrades = trades.filter((t) => Number(t.realizedPnL) > 0);
    const successfulHoldDays = successfulTrades.map((t) =>
      Math.ceil((new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    const optimalDte = successfulHoldDays.length > 0
      ? { min: Math.min(...successfulHoldDays), max: Math.max(...successfulHoldDays) }
      : { min: 14, max: 45 };

    stats.push({
      symbol,
      totalTrades: trades.length,
      uniqueTraders: uniqueUsers.size,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      avgPremiumPct,
      avgHoldDays,
      assignmentRate: trades.length > 0 ? assignments.length / trades.length : 0,
      avgAnnualizedReturn,
      cspStats: {
        trades: cspTrades.length,
        winRate: cspTrades.length > 0 ? cspWins.length / cspTrades.length : 0,
        avgPremiumPct: cspPremiumPcts.length > 0 ? cspPremiumPcts.reduce((a, b) => a + b, 0) / cspPremiumPcts.length : 0,
        assignmentRate: cspTrades.length > 0 ? cspAssignments.length / cspTrades.length : 0,
      },
      ccStats: {
        trades: ccTrades.length,
        winRate: ccTrades.length > 0 ? ccWins.length / ccTrades.length : 0,
        avgPremiumPct: ccPremiumPcts.length > 0 ? ccPremiumPcts.reduce((a, b) => a + b, 0) / ccPremiumPcts.length : 0,
        assignmentRate: ccTrades.length > 0 ? ccAssignments.length / ccTrades.length : 0,
      },
      optimalDteRange: optimalDte,
      optimalOtmRange: { min: 0.02, max: 0.08 }, // Default, can be refined
    });
  }

  // Sort by total trades (most data first)
  stats.sort((a, b) => b.totalTrades - a.totalTrades);

  return stats;
}

// ============================================================================
// Model Building & Training
// ============================================================================

/**
 * Build the aggregated ticker ranker neural network.
 * Predicts expected annualized return for a ticker based on community data.
 *
 * Architecture (v2):
 * - Input layer with batch normalization
 * - 3 hidden layers with batch normalization and dropout
 * - L2 regularization to prevent overfitting
 * - Adam optimizer with learning rate scheduling
 */
export async function buildAggregatedRanker(): Promise<tf.LayersModel> {
  const model = tf.sequential();

  // Input layer with batch normalization
  model.add(tf.layers.dense({
    units: 64,
    inputShape: [NUM_FEATURES],
    kernelInitializer: 'heNormal',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.leakyReLU({ alpha: 0.1 }));
  model.add(tf.layers.dropout({ rate: 0.3 }));

  // Hidden layer 1
  model.add(tf.layers.dense({
    units: 32,
    kernelInitializer: 'heNormal',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.leakyReLU({ alpha: 0.1 }));
  model.add(tf.layers.dropout({ rate: 0.2 }));

  // Hidden layer 2
  model.add(tf.layers.dense({
    units: 16,
    kernelInitializer: 'heNormal',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.leakyReLU({ alpha: 0.1 }));
  model.add(tf.layers.dropout({ rate: 0.1 }));

  // Output layer
  model.add(tf.layers.dense({
    units: 1,
    activation: 'linear',
    kernelInitializer: 'glorotNormal',
  }));

  // Compile with Adam optimizer
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

/**
 * Convert aggregated stats to raw feature array (before normalization)
 */
function statsToRawFeatureArray(stats: AggregatedTickerStats): number[] {
  return [
    stats.winRate,
    stats.avgPremiumPct,
    stats.avgHoldDays,
    stats.assignmentRate,
    stats.totalTrades,
    stats.uniqueTraders,
    stats.cspStats.winRate,
    stats.ccStats.winRate,
    stats.cspStats.trades,
    stats.ccStats.trades,
    stats.cspStats.assignmentRate,
    stats.ccStats.assignmentRate,
  ];
}


/**
 * Remove outliers using IQR method
 */
function removeOutliers(data: AggregatedTrainingData[]): AggregatedTrainingData[] {
  const labels = data.map((d) => d.label);

  // Calculate Q1, Q3, and IQR
  const sorted = [...labels].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Define bounds (1.5 * IQR is standard)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const filtered = data.filter((d) => d.label >= lowerBound && d.label <= upperBound);

  log.info(
    { original: data.length, filtered: filtered.length, removed: data.length - filtered.length },
    'Outlier removal complete'
  );

  return filtered;
}

/**
 * Train the aggregated model on all users' wheel trades.
 * This should be run periodically (e.g., daily) to update community insights.
 *
 * Training pipeline (v2):
 * 1. Collect aggregated stats from all users
 * 2. Convert to raw features and labels
 * 3. Remove outliers using IQR method
 * 4. Calculate z-score normalization parameters
 * 5. Normalize features and labels
 * 6. Train with deterministic holdout validation and early stopping
 * 7. Save model with normalization parameters
 */
export async function trainAggregatedModel(): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    log.info('Starting community model training...');

    const tickerStats = await collectAggregatedStats();
    log.info({ tickerCount: tickerStats.length }, 'Collected ticker stats');

    if (tickerStats.length < 10) {
      return {
        success: false,
        stats: { tradesUsed: tickerStats.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 10 tickers with data, found ${tickerStats.length}`,
      };
    }

    // Step 1: Prepare raw training data
    let trainingData: AggregatedTrainingData[] = tickerStats.map((stats) => ({
      symbol: stats.symbol,
      features: statsToRawFeatureArray(stats),
      label: stats.avgAnnualizedReturn,
    }));

    // Step 2: Remove outliers
    trainingData = removeOutliers(trainingData);

    if (trainingData.length < 10) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: `Not enough data after outlier removal: ${trainingData.length} tickers`,
      };
    }

    // Step 3: Keep deterministic ordering for stable holdout validation.
    trainingData = [...trainingData].sort((a, b) => a.symbol.localeCompare(b.symbol));
    log.info({ sampleCount: trainingData.length }, 'Training data prepared');

    // Step 4: Calculate normalization parameters
    const rawFeatures = trainingData.map((d) => d.features);
    const rawLabels = trainingData.map((d) => d.label);
    const normParams = calculateNormalizationParams(rawFeatures, rawLabels);
    log.info('Normalization parameters calculated');

    // Step 5: Normalize features and labels
    const normalizedFeatures = normalizeFeatures(rawFeatures, normParams);
    const normalizedLabels = rawLabels.map((l) => (l - normParams.labelMean) / normParams.labelStd);

    // Step 6: Build and train model
    const model = await buildAggregatedRanker();
    log.info('Model built');

    const rows = normalizedFeatures.map((features, index) => ({
      features,
      label: [normalizedLabels[index]],
    }));
    const split = temporalSplit(rows, {
      validationFraction: 0.2,
      minTrainRows: 8,
      minValidationRows: 2,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((row) => row.features));
    const trainYs = tf.tensor2d(split.trainRows.map((row) => row.label));
    const validationXs = tf.tensor2d(split.validationRows.map((row) => row.features));
    const validationYs = tf.tensor2d(split.validationRows.map((row) => row.label));

    const startTime = Date.now();

    // Training with callbacks for monitoring
    const history = await model.fit(trainXs, trainYs, {
      epochs: 200,
      batchSize: Math.min(32, Math.max(8, Math.floor(split.trainRows.length / 4))),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: [
        tf.callbacks.earlyStopping({ patience: 20, monitor: 'val_loss' }),
      ],
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;

    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const valLoss = getLastHistoryMetric(history, ['val_loss']);
    const finalMAE = getLastHistoryMetric(history, ['mae', 'meanAbsoluteError']);

    log.info(
      { epochs: history.epoch.length, finalLoss, valLoss, finalMAE, trainingTime },
      'Training complete'
    );

    const stats: TrainingStats = {
      tradesUsed: tickerStats.reduce((sum, s) => sum + s.totalTrades, 0),
      epochs: history.epoch.length,
      finalLoss,
      validationLoss: valLoss,
      trainingTime,
    };

    // Get unique user count from the database
    const userGroups = await prisma.realizedClose.groupBy({
      by: ['userId'],
      where: {
        strategy: { in: ['cash_secured_put', 'covered_call'] },
        hasUnknownBasis: false,
      },
    });
    const uniqueUserCount = userGroups.length;

    // Save to CommunityMLModel table with normalization params
    await saveCommunityModel(model, stats, trainingData.length, uniqueUserCount, normParams);

    // Cleanup
    trainXs.dispose();
    trainYs.dispose();
    validationXs.dispose();
    validationYs.dispose();

    return { success: true, stats };
  } catch (error) {
    log.error({ error }, 'Training failed');
    return {
      success: false,
      stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Inference
// ============================================================================

function predictionToRawScore(normalizedPrediction: number, normParams: NormalizationParams): number {
  const denormalizedPrediction = normalizedPrediction * normParams.labelStd + normParams.labelMean;
  return (denormalizedPrediction + 1) * 50;
}

function scoringNoteToInsight(note: 'contradiction_guard' | 'high_divergence' | 'calibrated_blend' | undefined): string | null {
  if (!note) return null;
  if (note === 'contradiction_guard') return 'Score stabilized using observed community outcomes due to model mismatch.';
  if (note === 'high_divergence') return 'Score blended with observed community outcomes due to high model divergence.';
  return null;
}

function buildCommunityInsight(stats: AggregatedTickerStats, rawModelScore: number | null): CommunityInsight {
  const scoreComputation = deriveCommunityScore(stats, rawModelScore);
  const score = scoreComputation.finalScore;
  const recommendation = deriveCommunityRecommendation({
    score,
    statisticalScore: scoreComputation.statisticalScore,
    winRate: stats.winRate,
    assignmentRate: stats.assignmentRate,
    avgAnnualizedReturn: stats.avgAnnualizedReturn,
  });

  const bestDirection = stats.cspStats.winRate > stats.ccStats.winRate
    ? 'csp'
    : stats.ccStats.winRate > stats.cspStats.winRate
      ? 'covered_call'
      : 'both';

  const confidence = Math.min(1, stats.totalTrades / 50) * Math.min(1, stats.uniqueTraders / 5);
  const insights = generateInsights(stats);
  const scoreNote = scoringNoteToInsight(scoreComputation.note);
  if (scoreNote) {
    insights.unshift(scoreNote);
  }

  return {
    symbol: stats.symbol,
    score,
    confidence,
    totalTrades: stats.totalTrades,
    uniqueTraders: stats.uniqueTraders,
    winRate: stats.winRate,
    avgAnnualizedReturn: stats.avgAnnualizedReturn,
    assignmentRate: stats.assignmentRate,
    avgHoldDays: stats.avgHoldDays,
    recommendation,
    scoreMeta: {
      method: scoreComputation.method,
      modelScore: scoreComputation.modelScore,
      statisticalScore: scoreComputation.statisticalScore,
      divergence: scoreComputation.divergence,
    },
    insights,
    optimalStrategy: {
      direction: bestDirection,
      dte: Math.round((stats.optimalDteRange.min + stats.optimalDteRange.max) / 2),
      otmPercent: (stats.optimalOtmRange.min + stats.optimalOtmRange.max) / 2,
    },
  };
}

/**
 * Get community insights for a specific ticker.
 * Uses both the ML model and raw statistics.
 */
export async function getCommunityInsight(symbol: string): Promise<CommunityInsight | null> {
  // Get stats for this ticker
  const allStats = await collectAggregatedStats();
  const tickerStats = allStats.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());

  if (!tickerStats) {
    return null;
  }

  // Try to get ML model prediction
  const modelResult = await loadCommunityModel();

  let rawModelScore: number | null = null;
  if (modelResult) {
    const { model, normParams } = modelResult;
    const rawFeatures = statsToRawFeatureArray(tickerStats);
    const normalizedFeatures = normalizeSingleFeature(rawFeatures, normParams);
    const inputTensor = tf.tensor2d([normalizedFeatures]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    const normalizedPrediction = (await prediction.data())[0];
    rawModelScore = predictionToRawScore(normalizedPrediction, normParams);
    inputTensor.dispose();
    prediction.dispose();
  }

  return buildCommunityInsight(tickerStats, rawModelScore);
}

/**
 * Get all community insights (top tickers for wheel strategy).
 */
export async function getAllCommunityInsights(): Promise<CommunityInsight[]> {
  const allStats = await collectAggregatedStats();

  // Only include tickers with sufficient data
  const qualifiedStats = allStats.filter((s) => s.totalTrades >= 5 && s.uniqueTraders >= 2);

  const modelResult = await loadCommunityModel();

  const insights: CommunityInsight[] = [];

  // Batch predict if model available
  if (modelResult && qualifiedStats.length > 0) {
    const { model, normParams } = modelResult;
    const rawFeatureMatrix = qualifiedStats.map((s) => statsToRawFeatureArray(s));
    const normalizedFeatureMatrix = normalizeFeatures(rawFeatureMatrix, normParams);
    const inputTensor = tf.tensor2d(normalizedFeatureMatrix);
    const predictions = model.predict(inputTensor) as tf.Tensor;
    const normalizedPredictions = await predictions.data();

    for (let i = 0; i < qualifiedStats.length; i++) {
      const stats = qualifiedStats[i];
      const rawModelScore = predictionToRawScore(normalizedPredictions[i], normParams);
      insights.push(buildCommunityInsight(stats, rawModelScore));
    }

    inputTensor.dispose();
    predictions.dispose();
  } else {
    // Fallback to statistical scoring
    for (const stats of qualifiedStats) {
      insights.push(buildCommunityInsight(stats, null));
    }
  }

  // Sort by score descending
  insights.sort((a, b) => b.score - a.score);

  return insights;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateInsights(stats: AggregatedTickerStats): string[] {
  const insights: string[] = [];

  // Win rate assessment
  if (stats.winRate >= 0.8) {
    insights.push(`Excellent community win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  } else if (stats.winRate >= 0.6) {
    insights.push(`Good community win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  } else if (stats.winRate < 0.5) {
    insights.push(`Below average win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  }

  // Sample size
  if (stats.totalTrades >= 50) {
    insights.push(`High confidence: ${stats.totalTrades} trades from ${stats.uniqueTraders} traders`);
  } else if (stats.totalTrades >= 20) {
    insights.push(`Moderate data: ${stats.totalTrades} trades from ${stats.uniqueTraders} traders`);
  } else {
    insights.push(`Limited data: ${stats.totalTrades} trades`);
  }

  // Strategy preference
  if (stats.cspStats.winRate > stats.ccStats.winRate + 0.1) {
    insights.push(`CSP outperforms CC (${(stats.cspStats.winRate * 100).toFixed(0)}% vs ${(stats.ccStats.winRate * 100).toFixed(0)}%)`);
  } else if (stats.ccStats.winRate > stats.cspStats.winRate + 0.1) {
    insights.push(`CC outperforms CSP (${(stats.ccStats.winRate * 100).toFixed(0)}% vs ${(stats.cspStats.winRate * 100).toFixed(0)}%)`);
  }

  // Assignment risk
  if (stats.assignmentRate > 0.3) {
    insights.push(`Higher assignment rate: ${(stats.assignmentRate * 100).toFixed(0)}%`);
  } else if (stats.assignmentRate < 0.1) {
    insights.push(`Low assignment rate: ${(stats.assignmentRate * 100).toFixed(0)}%`);
  }

  // Average return
  if (stats.avgAnnualizedReturn > 0.3) {
    insights.push(`Strong annualized return: ${(stats.avgAnnualizedReturn * 100).toFixed(1)}%`);
  } else if (stats.avgAnnualizedReturn > 0.15) {
    insights.push(`Solid annualized return: ${(stats.avgAnnualizedReturn * 100).toFixed(1)}%`);
  }

  return insights.length > 0 ? insights : ['Neutral performance based on community data'];
}

/**
 * Get aggregated model status and training readiness
 */
export async function getAggregatedModelStatus(): Promise<{
  hasModel: boolean;
  lastTrainedAt: string | null;
  totalTickers: number;
  totalTrades: number;
  uniqueUsers: number;
}> {
  // Check if model exists in CommunityMLModel table (v2 or v1)
  let model = await prisma.communityMLModel.findFirst({
    where: { modelType: COMMUNITY_MODEL_TYPE, isActive: true },
    select: { trainedAt: true },
  });

  // Fallback to v1 model
  if (!model) {
    model = await prisma.communityMLModel.findFirst({
      where: { modelType: 'aggregated-ranker', isActive: true },
      select: { trainedAt: true },
    });
  }

  // Get IDs of test users to exclude from stats
  const testUserIds = Array.from(await getTestUserIds());

  // Get aggregate stats (excluding test users)
  const stats = await prisma.realizedClose.groupBy({
    by: ['symbol'],
    where: {
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
      userId: { notIn: testUserIds },
    },
    _count: true,
  });

  const uniqueUsers = await prisma.realizedClose.groupBy({
    by: ['userId'],
    where: {
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
      userId: { notIn: testUserIds },
    },
  });

  const totalTrades = stats.reduce((sum, s) => sum + s._count, 0);

  return {
    hasModel: model !== null,
    lastTrainedAt: model?.trainedAt?.toISOString() ?? null,
    totalTickers: stats.length,
    totalTrades,
    uniqueUsers: uniqueUsers.length,
  };
}
