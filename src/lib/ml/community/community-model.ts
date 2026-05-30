/**
 * Comprehensive Community ML Model
 *
 * Trains on ALL stocks and options trades from non-test users to provide
 * platform-wide insights and recommendations.
 *
 * Data Sources:
 * - Stock trades (buy/sell performance)
 * - All options trades (all strategies, not just wheel)
 * - Position outcomes and P&L patterns
 *
 * Privacy: Only aggregate statistics are used - no individual user data is exposed.
 * Uses CommunityMLModel table (no foreign key to User).
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';

const log = createChildLogger({ module: 'community-ml' });

// Model type for comprehensive community model
const COMMUNITY_MODEL_TYPE = 'community-comprehensive-v1';

// ============================================================================
// Types
// ============================================================================

export interface CommunityTickerInsight {
  symbol: string;
  totalTrades: number;
  uniqueTraders: number;
  score: number; // 0-100 community score
  confidence: number; // Based on sample size
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'avoid';
  insights: string[];

  // Stock trading stats
  stockStats: {
    trades: number;
    winRate: number;
    avgReturnPct: number;
    avgHoldDays: number;
    buyCount: number;
    sellCount: number;
  };

  // Options trading stats (all strategies)
  optionsStats: {
    trades: number;
    winRate: number;
    avgReturnPct: number;
    avgPremiumPct: number;
    avgHoldDays: number;
    strategiesUsed: string[];
    bestStrategy: string | null;
    bestStrategyWinRate: number;
  };

  // Wheel-specific stats (subset of options)
  wheelStats: {
    trades: number;
    winRate: number;
    avgPremiumPct: number;
    assignmentRate: number;
    cspWinRate: number;
    ccWinRate: number;
  };
}

export interface CommunityStrategyInsight {
  strategy: string;
  totalTrades: number;
  uniqueTraders: number;
  winRate: number;
  avgReturnPct: number;
  avgHoldDays: number;
  avgPremiumPct: number;
  bestTickers: string[];
  recommendation: 'strong' | 'moderate' | 'weak' | 'avoid';
}

export interface CommunityTrainingStats {
  totalTrades: number;
  stockTrades: number;
  optionTrades: number;
  uniqueUsers: number;
  uniqueTickers: number;
  strategiesFound: number;
  epochs: number;
  finalLoss: number;
}

export interface CommunityModelStatus {
  hasModel: boolean;
  version: number | null;
  trainedAt: string | null;
  stats: CommunityTrainingStats | null;
}

interface AggregatedTickerData {
  symbol: string;
  // Stock features
  stockTrades: number;
  stockWinRate: number;
  stockAvgReturn: number;
  stockAvgHoldDays: number;
  // Options features
  optionTrades: number;
  optionWinRate: number;
  optionAvgReturn: number;
  optionAvgPremiumPct: number;
  optionAvgHoldDays: number;
  // Wheel features
  wheelTrades: number;
  wheelWinRate: number;
  wheelAssignmentRate: number;
  // Meta
  uniqueTraders: number;
  totalTrades: number;
  // Label: overall score based on combined performance
  label: number;
}

import type { NormalizationParams } from '../normalization';
import { calculateNormalizationParams, normalizeFeatures, getDefaultNormParams } from '../normalization';

// Feature names for the model
const FEATURE_NAMES = [
  'stockTrades',
  'stockWinRate',
  'stockAvgReturn',
  'stockAvgHoldDays',
  'optionTrades',
  'optionWinRate',
  'optionAvgReturn',
  'optionAvgPremiumPct',
  'optionAvgHoldDays',
  'wheelTrades',
  'wheelWinRate',
  'wheelAssignmentRate',
  'uniqueTraders',
  'totalTrades',
] as const;

const NUM_FEATURES = FEATURE_NAMES.length;

// In-memory cache
let modelCache: {
  model: tf.LayersModel;
  version: number;
  loadedAt: number;
  normParams: NormalizationParams;
} | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TEST_USER_CACHE_TTL_MS = 10 * 60 * 1000;
const TICKER_INSIGHT_CACHE_TTL_MS = 3 * 60 * 1000;
const STRATEGY_INSIGHT_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_TICKER_INSIGHT_CACHE_SIZE = 500;

let testUserIdsCache: { ids: Set<string>; expiresAt: number } | null = null;
let strategyInsightsCache: { insights: CommunityStrategyInsight[]; expiresAt: number } | null = null;
const tickerInsightCache = new Map<string, { insight: CommunityTickerInsight | null; expiresAt: number }>();

// ============================================================================
// Test User Filtering
// ============================================================================

/**
 * Get IDs of test users to exclude from training data.
 * Excludes: emails ending in @test.com, @test.local, or containing 'test'
 */
async function getTestUserIds(): Promise<Set<string>> {
  const now = Date.now();
  if (testUserIdsCache && testUserIdsCache.expiresAt > now) {
    return new Set(testUserIdsCache.ids);
  }

  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@test.com' } },
        { email: { endsWith: '@test.local' } },
        { email: { contains: 'test' } },
      ],
    },
    select: { id: true },
  });

  const ids = new Set(testUsers.map((u) => u.id));
  testUserIdsCache = {
    ids,
    expiresAt: now + TEST_USER_CACHE_TTL_MS,
  };
  return new Set(ids);
}

// ============================================================================
// Data Collection
// ============================================================================

/**
 * Collect comprehensive stats for all tickers from all non-test users.
 */
export async function collectCommunityStats(): Promise<AggregatedTickerData[]> {
  const testUserIds = await getTestUserIds();
  const excludeUserIds = Array.from(testUserIds);

  log.info({ testUserCount: testUserIds.size }, 'Excluding test users from community training');

  // Fetch ALL realized closes from non-test users
  const allTrades = await prisma.realizedClose.findMany({
    where: {
      hasUnknownBasis: false,
      userId: { notIn: excludeUserIds },
    },
    select: {
      symbol: true,
      userId: true,
      closeType: true,
      strategy: true,
      realizedPnL: true,
      openAmount: true,
      closeAmount: true,
      strike: true,
      openDate: true,
      closeDate: true,
      closeReason: true,
      quantity: true,
    },
  });

  if (allTrades.length === 0) {
    log.warn('No trades found for community model training');
    return [];
  }

  log.info({ totalTrades: allTrades.length }, 'Collected trades for community training');

  // Group by symbol
  const symbolGroups = new Map<string, typeof allTrades>();
  for (const trade of allTrades) {
    // Extract base symbol (remove option suffix if present)
    const baseSymbol = extractBaseSymbol(trade.symbol);
    const existing = symbolGroups.get(baseSymbol) || [];
    existing.push(trade);
    symbolGroups.set(baseSymbol, existing);
  }

  const aggregatedData: AggregatedTickerData[] = [];

  for (const [symbol, trades] of symbolGroups) {
    // Need minimum sample size
    if (trades.length < 3) continue;

    const uniqueUsers = new Set(trades.map((t) => t.userId));

    // Separate stock and option trades
    const stockTrades = trades.filter((t) => t.closeType === 'stock');
    const optionTrades = trades.filter((t) => t.closeType === 'option');
    const wheelTrades = optionTrades.filter((t) =>
      t.strategy && ['cash_secured_put', 'covered_call'].includes(t.strategy)
    );

    // Calculate stock stats
    const stockWins = stockTrades.filter((t) => Number(t.realizedPnL) > 0);
    const stockReturns = stockTrades.map((t) => {
      const cost = Math.abs(Number(t.openAmount)) || 1;
      return (Number(t.realizedPnL) / cost) * 100;
    });
    const stockHoldDays = stockTrades.map((t) => calculateHoldDays(t.openDate, t.closeDate));

    // Calculate option stats
    const optionWins = optionTrades.filter((t) => Number(t.realizedPnL) > 0);
    const optionReturns = optionTrades.map((t) => {
      const cost = Math.abs(Number(t.openAmount)) || 1;
      return (Number(t.realizedPnL) / cost) * 100;
    });
    const optionPremiums = optionTrades
      .filter((t) => t.strike && Number(t.strike) > 0)
      .map((t) => (Math.abs(Number(t.openAmount)) / (Number(t.strike) * 100)) * 100);
    const optionHoldDays = optionTrades.map((t) => calculateHoldDays(t.openDate, t.closeDate));

    // Calculate wheel stats
    const wheelWins = wheelTrades.filter((t) => Number(t.realizedPnL) > 0);
    const wheelAssignments = wheelTrades.filter((t) => t.closeReason === 'assigned');

    // Calculate overall score (weighted by win rates and returns)
    const overallScore = calculateTickerScore({
      stockWinRate: stockTrades.length > 0 ? stockWins.length / stockTrades.length : 0.5,
      stockAvgReturn: avg(stockReturns),
      optionWinRate: optionTrades.length > 0 ? optionWins.length / optionTrades.length : 0.5,
      optionAvgReturn: avg(optionReturns),
      wheelWinRate: wheelTrades.length > 0 ? wheelWins.length / wheelTrades.length : 0.5,
      totalTrades: trades.length,
      uniqueTraders: uniqueUsers.size,
    });

    aggregatedData.push({
      symbol,
      stockTrades: stockTrades.length,
      stockWinRate: stockTrades.length > 0 ? stockWins.length / stockTrades.length : 0.5,
      stockAvgReturn: avg(stockReturns),
      stockAvgHoldDays: avg(stockHoldDays),
      optionTrades: optionTrades.length,
      optionWinRate: optionTrades.length > 0 ? optionWins.length / optionTrades.length : 0.5,
      optionAvgReturn: avg(optionReturns),
      optionAvgPremiumPct: avg(optionPremiums),
      optionAvgHoldDays: avg(optionHoldDays),
      wheelTrades: wheelTrades.length,
      wheelWinRate: wheelTrades.length > 0 ? wheelWins.length / wheelTrades.length : 0.5,
      wheelAssignmentRate: wheelTrades.length > 0 ? wheelAssignments.length / wheelTrades.length : 0,
      uniqueTraders: uniqueUsers.size,
      totalTrades: trades.length,
      label: overallScore,
    });
  }

  // Sort by total trades (most data first)
  aggregatedData.sort((a, b) => b.totalTrades - a.totalTrades);

  log.info({ tickerCount: aggregatedData.length }, 'Aggregated community data by ticker');

  return aggregatedData;
}

/**
 * Collect strategy-level insights from all non-test users.
 */
export async function collectStrategyStats(): Promise<CommunityStrategyInsight[]> {
  const testUserIds = await getTestUserIds();
  const excludeUserIds = Array.from(testUserIds);

  const allTrades = await prisma.realizedClose.findMany({
    where: {
      hasUnknownBasis: false,
      userId: { notIn: excludeUserIds },
      strategy: { not: null },
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
    },
  });

  // Group by strategy
  const strategyGroups = new Map<string, typeof allTrades>();
  for (const trade of allTrades) {
    if (!trade.strategy) continue;
    const existing = strategyGroups.get(trade.strategy) || [];
    existing.push(trade);
    strategyGroups.set(trade.strategy, existing);
  }

  const insights: CommunityStrategyInsight[] = [];

  for (const [strategy, trades] of strategyGroups) {
    if (trades.length < 5) continue;

    const uniqueUsers = new Set(trades.map((t) => t.userId));
    const wins = trades.filter((t) => Number(t.realizedPnL) > 0);
    const returns = trades.map((t) => {
      const cost = Math.abs(Number(t.openAmount)) || 1;
      return (Number(t.realizedPnL) / cost) * 100;
    });
    const holdDays = trades.map((t) => calculateHoldDays(t.openDate, t.closeDate));
    const premiums = trades
      .filter((t) => t.strike && Number(t.strike) > 0)
      .map((t) => (Math.abs(Number(t.openAmount)) / (Number(t.strike) * 100)) * 100);

    // Find best tickers for this strategy
    const tickerPerf = new Map<string, { wins: number; total: number }>();
    for (const trade of trades) {
      const baseSymbol = extractBaseSymbol(trade.symbol);
      const perf = tickerPerf.get(baseSymbol) || { wins: 0, total: 0 };
      perf.total++;
      if (Number(trade.realizedPnL) > 0) perf.wins++;
      tickerPerf.set(baseSymbol, perf);
    }
    const bestTickers = Array.from(tickerPerf.entries())
      .filter(([, p]) => p.total >= 3)
      .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
      .slice(0, 5)
      .map(([symbol]) => symbol);

    const winRate = wins.length / trades.length;
    const avgReturn = avg(returns);

    let recommendation: 'strong' | 'moderate' | 'weak' | 'avoid';
    if (winRate >= 0.7 && avgReturn > 10) {
      recommendation = 'strong';
    } else if (winRate >= 0.55 && avgReturn > 0) {
      recommendation = 'moderate';
    } else if (winRate >= 0.4) {
      recommendation = 'weak';
    } else {
      recommendation = 'avoid';
    }

    insights.push({
      strategy,
      totalTrades: trades.length,
      uniqueTraders: uniqueUsers.size,
      winRate,
      avgReturnPct: avgReturn,
      avgHoldDays: avg(holdDays),
      avgPremiumPct: avg(premiums),
      bestTickers,
      recommendation,
    });
  }

  // Sort by win rate
  insights.sort((a, b) => b.winRate - a.winRate);

  return insights;
}

// ============================================================================
// Model Building & Training
// ============================================================================

/**
 * Build the community neural network model.
 */
function buildCommunityModel(): tf.LayersModel {
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
  }));
  model.add(tf.layers.leakyReLU({ alpha: 0.1 }));

  // Output layer (score 0-100)
  model.add(tf.layers.dense({
    units: 1,
    activation: 'sigmoid',
  }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

/**
 * Train the comprehensive community model.
 */
export async function trainCommunityModel(): Promise<{
  success: boolean;
  stats: CommunityTrainingStats;
  error?: string;
}> {
  try {
    log.info('Starting community model training...');

    const aggregatedData = await collectCommunityStats();

    if (aggregatedData.length < 10) {
      return {
        success: false,
        stats: {
          totalTrades: 0,
          stockTrades: 0,
          optionTrades: 0,
          uniqueUsers: 0,
          uniqueTickers: aggregatedData.length,
          strategiesFound: 0,
          epochs: 0,
          finalLoss: 0,
        },
        error: `Not enough data: only ${aggregatedData.length} tickers with trades`,
      };
    }

    // Calculate unique users
    const testUserIds = await getTestUserIds();
    const allUsers = await prisma.realizedClose.groupBy({
      by: ['userId'],
      where: {
        hasUnknownBasis: false,
        userId: { notIn: Array.from(testUserIds) },
      },
    });

    const orderedData = [...aggregatedData].sort((a, b) => a.symbol.localeCompare(b.symbol));

    // Prepare training data
    const features = orderedData.map((d) => [
      d.stockTrades,
      d.stockWinRate,
      d.stockAvgReturn,
      d.stockAvgHoldDays,
      d.optionTrades,
      d.optionWinRate,
      d.optionAvgReturn,
      d.optionAvgPremiumPct,
      d.optionAvgHoldDays,
      d.wheelTrades,
      d.wheelWinRate,
      d.wheelAssignmentRate,
      d.uniqueTraders,
      d.totalTrades,
    ]);
    const labels = orderedData.map((d) => d.label);

    // Z-score normalization
    const normParams = calculateNormalizationParams(features, labels);
    const normalizedFeatures = normalizeFeatures(features, normParams);
    const normalizedLabels = labels.map((l) =>
      normParams.labelStd > 0 ? (l - normParams.labelMean) / normParams.labelStd : l
    );

    const rows = normalizedFeatures.map((featureRow, index) => ({
      features: featureRow,
      label: [normalizedLabels[index]],
    }));
    const split = temporalSplit(rows, {
      validationFraction: 0.2,
      minTrainRows: 8,
      minValidationRows: 2,
    });

    // Create tensors
    const trainXs = tf.tensor2d(split.trainRows.map((row) => row.features));
    const trainYs = tf.tensor2d(split.trainRows.map((row) => row.label));
    const validationXs = tf.tensor2d(split.validationRows.map((row) => row.features));
    const validationYs = tf.tensor2d(split.validationRows.map((row) => row.label));

    // Build and train model
    const model = buildCommunityModel();

    const history = await model.fit(trainXs, trainYs, {
      epochs: 100,
      batchSize: Math.min(32, Math.max(4, Math.floor(split.trainRows.length / 2))),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 20 === 0) {
            log.debug({ epoch, loss: logs?.loss, valLoss: logs?.val_loss }, 'Training progress');
          }
        },
      },
    });

    // Cleanup tensors
    trainXs.dispose();
    trainYs.dispose();
    validationXs.dispose();
    validationYs.dispose();

    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;

    // Count trades by type
    const totalTrades = aggregatedData.reduce((sum, d) => sum + d.totalTrades, 0);
    const stockTrades = aggregatedData.reduce((sum, d) => sum + d.stockTrades, 0);
    const optionTrades = aggregatedData.reduce((sum, d) => sum + d.optionTrades, 0);

    // Get strategy count
    const strategies = await collectStrategyStats();

    const stats: CommunityTrainingStats = {
      totalTrades,
      stockTrades,
      optionTrades,
      uniqueUsers: allUsers.length,
      uniqueTickers: aggregatedData.length,
      strategiesFound: strategies.length,
      epochs: 100,
      finalLoss,
    };

    // Save model
    await saveCommunityModel(model, stats, normParams);

    // Reset short-lived aggregate caches after retraining.
    strategyInsightsCache = null;
    tickerInsightCache.clear();

    log.info(stats, 'Community model training completed');

    return { success: true, stats };
  } catch (error) {
    log.error({ error }, 'Community model training failed');
    return {
      success: false,
      stats: {
        totalTrades: 0,
        stockTrades: 0,
        optionTrades: 0,
        uniqueUsers: 0,
        uniqueTickers: 0,
        strategiesFound: 0,
        epochs: 0,
        finalLoss: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Model Storage
// ============================================================================

async function saveCommunityModel(
  model: tf.LayersModel,
  stats: CommunityTrainingStats,
  normParams: NormalizationParams
): Promise<void> {
  const topology = model.toJSON(null, false);
  const weightData = await model.getWeights();
  const weightsArrays = await Promise.all(weightData.map(async (w) => Array.from(await w.data())));
  const weightsBuffer = Buffer.from(JSON.stringify(weightsArrays));

  const extendedStats = { ...stats, normalizationParams: normParams };

  // Deactivate existing models
  await prisma.communityMLModel.updateMany({
    where: { modelType: { startsWith: 'community-comprehensive' }, isActive: true },
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
      tradesUsed: stats.totalTrades,
      epochsTrained: stats.epochs,
      trainingStats: JSON.stringify(extendedStats),
      uniqueUsers: stats.uniqueUsers,
      tickersUsed: stats.uniqueTickers,
      isActive: true,
    },
  });

  log.info({ version: newVersion }, 'Community model saved');

  // Update cache
  modelCache = { model, version: newVersion, loadedAt: Date.now(), normParams };
}

// Used for model predictions (will be used when predictions are enabled)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadCommunityModel(): Promise<{
  model: tf.LayersModel;
  normParams: NormalizationParams;
} | null> {
  const modelRecord = await prisma.communityMLModel.findFirst({
    where: { modelType: COMMUNITY_MODEL_TYPE, isActive: true },
    select: { version: true, modelTopology: true, modelWeights: true, trainingStats: true },
  });

  if (!modelRecord) return null;

  // Check cache
  if (
    modelCache &&
    modelCache.version === modelRecord.version &&
    Date.now() - modelCache.loadedAt < CACHE_TTL_MS
  ) {
    return { model: modelCache.model, normParams: modelCache.normParams };
  }

  try {
    const topology = JSON.parse(modelRecord.modelTopology);
    // Prisma MSSQL adapter returns Uint8Array for Bytes fields - Buffer.from handles both types
    const weightsJson = Buffer.from(modelRecord.modelWeights).toString('utf8');
    const weightsArrays = JSON.parse(weightsJson) as number[][];

    const model = await tf.models.modelFromJSON(topology);
    const existingWeights = model.getWeights();
    const loadedWeights = weightsArrays.map((arr, i) => {
      const shape = existingWeights[i].shape;
      return tf.tensor(arr, shape);
    });
    model.setWeights(loadedWeights);

    let normParams: NormalizationParams;
    try {
      const trainingStats = JSON.parse(modelRecord.trainingStats || '{}');
      normParams = trainingStats.normalizationParams || getDefaultNormParams(NUM_FEATURES);
    } catch {
      normParams = getDefaultNormParams(NUM_FEATURES);
    }

    modelCache = { model, version: modelRecord.version, loadedAt: Date.now(), normParams };

    return { model, normParams };
  } catch (err) {
    log.error({ err }, 'Failed to load community model');
    return null;
  }
}

// ============================================================================
// Predictions & Insights
// ============================================================================

function pruneTickerInsightCache(now: number): void {
  if (tickerInsightCache.size <= MAX_TICKER_INSIGHT_CACHE_SIZE) return;

  for (const [symbol, entry] of tickerInsightCache.entries()) {
    if (entry.expiresAt <= now) {
      tickerInsightCache.delete(symbol);
    }
  }

  if (tickerInsightCache.size <= MAX_TICKER_INSIGHT_CACHE_SIZE) return;

  const overflow = tickerInsightCache.size - MAX_TICKER_INSIGHT_CACHE_SIZE;
  let removed = 0;
  for (const symbol of tickerInsightCache.keys()) {
    tickerInsightCache.delete(symbol);
    removed++;
    if (removed >= overflow) break;
  }
}

function setTickerInsightCache(symbol: string, insight: CommunityTickerInsight | null): void {
  const now = Date.now();
  tickerInsightCache.set(symbol, {
    insight,
    expiresAt: now + TICKER_INSIGHT_CACHE_TTL_MS,
  });
  pruneTickerInsightCache(now);
}

/**
 * Get community insight for a specific ticker.
 */
export async function getCommunityInsight(symbol: string): Promise<CommunityTickerInsight | null> {
  const baseSymbol = extractBaseSymbol(symbol);
  const now = Date.now();
  const cached = tickerInsightCache.get(baseSymbol);
  if (cached && cached.expiresAt > now) {
    return cached.insight;
  }

  const testUserIds = await getTestUserIds();
  const excludeUserIds = Array.from(testUserIds);

  // Get all trades for this symbol
  const trades = await prisma.realizedClose.findMany({
    where: {
      hasUnknownBasis: false,
      userId: { notIn: excludeUserIds },
      OR: [
        { symbol: baseSymbol },
        { symbol: { startsWith: `${baseSymbol} ` } }, // Option symbols
      ],
    },
    select: {
      symbol: true,
      userId: true,
      closeType: true,
      strategy: true,
      realizedPnL: true,
      openAmount: true,
      strike: true,
      openDate: true,
      closeDate: true,
      closeReason: true,
    },
  });

  if (trades.length < 3) {
    setTickerInsightCache(baseSymbol, null);
    return null;
  }

  const uniqueUsers = new Set(trades.map((t) => t.userId));
  const stockTrades = trades.filter((t) => t.closeType === 'stock');
  const optionTrades = trades.filter((t) => t.closeType === 'option');
  const wheelTrades = optionTrades.filter((t) =>
    t.strategy && ['cash_secured_put', 'covered_call'].includes(t.strategy)
  );

  // Stock stats
  const stockWins = stockTrades.filter((t) => Number(t.realizedPnL) > 0);
  const stockReturns = stockTrades.map((t) => {
    const cost = Math.abs(Number(t.openAmount)) || 1;
    return (Number(t.realizedPnL) / cost) * 100;
  });
  const stockHoldDays = stockTrades.map((t) => calculateHoldDays(t.openDate, t.closeDate));

  // Options stats
  const optionWins = optionTrades.filter((t) => Number(t.realizedPnL) > 0);
  const optionReturns = optionTrades.map((t) => {
    const cost = Math.abs(Number(t.openAmount)) || 1;
    return (Number(t.realizedPnL) / cost) * 100;
  });
  const optionPremiums = optionTrades
    .filter((t) => t.strike && Number(t.strike) > 0)
    .map((t) => (Math.abs(Number(t.openAmount)) / (Number(t.strike) * 100)) * 100);
  const optionHoldDays = optionTrades.map((t) => calculateHoldDays(t.openDate, t.closeDate));

  // Find strategies used and best one
  const strategyPerf = new Map<string, { wins: number; total: number }>();
  for (const trade of optionTrades) {
    if (!trade.strategy) continue;
    const perf = strategyPerf.get(trade.strategy) || { wins: 0, total: 0 };
    perf.total++;
    if (Number(trade.realizedPnL) > 0) perf.wins++;
    strategyPerf.set(trade.strategy, perf);
  }
  const strategiesUsed = Array.from(strategyPerf.keys());
  const bestStrategy = strategiesUsed.length > 0
    ? Array.from(strategyPerf.entries())
        .filter(([, p]) => p.total >= 2)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0]?.[0] || null
    : null;
  const bestStrategyWinRate = bestStrategy
    ? (strategyPerf.get(bestStrategy)!.wins / strategyPerf.get(bestStrategy)!.total)
    : 0;

  // Wheel stats
  const wheelWins = wheelTrades.filter((t) => Number(t.realizedPnL) > 0);
  const wheelAssignments = wheelTrades.filter((t) => t.closeReason === 'assigned');
  const cspTrades = wheelTrades.filter((t) => t.strategy === 'cash_secured_put');
  const cspWins = cspTrades.filter((t) => Number(t.realizedPnL) > 0);
  const ccTrades = wheelTrades.filter((t) => t.strategy === 'covered_call');
  const ccWins = ccTrades.filter((t) => Number(t.realizedPnL) > 0);

  // Calculate score
  const score = calculateTickerScore({
    stockWinRate: stockTrades.length > 0 ? stockWins.length / stockTrades.length : 0.5,
    stockAvgReturn: avg(stockReturns),
    optionWinRate: optionTrades.length > 0 ? optionWins.length / optionTrades.length : 0.5,
    optionAvgReturn: avg(optionReturns),
    wheelWinRate: wheelTrades.length > 0 ? wheelWins.length / wheelTrades.length : 0.5,
    totalTrades: trades.length,
    uniqueTraders: uniqueUsers.size,
  });

  // Confidence based on sample size
  const confidence = Math.min(1, trades.length / 50) * Math.min(1, uniqueUsers.size / 5);

  // Generate insights
  const insights = generateTickerInsights({
    symbol: baseSymbol,
    stockWinRate: stockTrades.length > 0 ? stockWins.length / stockTrades.length : 0,
    optionWinRate: optionTrades.length > 0 ? optionWins.length / optionTrades.length : 0,
    wheelWinRate: wheelTrades.length > 0 ? wheelWins.length / wheelTrades.length : 0,
    avgReturn: avg([...stockReturns, ...optionReturns]),
    totalTrades: trades.length,
    uniqueTraders: uniqueUsers.size,
    bestStrategy,
    bestStrategyWinRate,
  });

  // Recommendation
  let recommendation: CommunityTickerInsight['recommendation'];
  const overallWinRate = (stockWins.length + optionWins.length) / trades.length;
  if (score >= 75 && overallWinRate >= 0.7) {
    recommendation = 'strong_buy';
  } else if (score >= 60 && overallWinRate >= 0.6) {
    recommendation = 'buy';
  } else if (score <= 35 || overallWinRate < 0.4) {
    recommendation = 'avoid';
  } else {
    recommendation = 'neutral';
  }

  const insight = {
    symbol: baseSymbol,
    totalTrades: trades.length,
    uniqueTraders: uniqueUsers.size,
    score,
    confidence,
    recommendation,
    insights,
    stockStats: {
      trades: stockTrades.length,
      winRate: stockTrades.length > 0 ? stockWins.length / stockTrades.length : 0,
      avgReturnPct: avg(stockReturns),
      avgHoldDays: avg(stockHoldDays),
      buyCount: stockTrades.filter((t) => Number(t.openAmount) < 0).length,
      sellCount: stockTrades.filter((t) => Number(t.openAmount) > 0).length,
    },
    optionsStats: {
      trades: optionTrades.length,
      winRate: optionTrades.length > 0 ? optionWins.length / optionTrades.length : 0,
      avgReturnPct: avg(optionReturns),
      avgPremiumPct: avg(optionPremiums),
      avgHoldDays: avg(optionHoldDays),
      strategiesUsed,
      bestStrategy,
      bestStrategyWinRate,
    },
    wheelStats: {
      trades: wheelTrades.length,
      winRate: wheelTrades.length > 0 ? wheelWins.length / wheelTrades.length : 0,
      avgPremiumPct: avg(optionPremiums.slice(0, wheelTrades.length)),
      assignmentRate: wheelTrades.length > 0 ? wheelAssignments.length / wheelTrades.length : 0,
      cspWinRate: cspTrades.length > 0 ? cspWins.length / cspTrades.length : 0,
      ccWinRate: ccTrades.length > 0 ? ccWins.length / ccTrades.length : 0,
    },
  };

  setTickerInsightCache(baseSymbol, insight);
  return insight;
}

/**
 * Get top community picks across all tickers.
 */
export async function getCommunityTopPicks(limit = 10): Promise<CommunityTickerInsight[]> {
  const aggregatedData = await collectCommunityStats();

  // Get insights for top tickers by score
  const topTickers = aggregatedData
    .filter((d) => d.totalTrades >= 5 && d.uniqueTraders >= 2)
    .sort((a, b) => b.label - a.label)
    .slice(0, limit * 2); // Get more to filter

  const insights: CommunityTickerInsight[] = [];
  for (const ticker of topTickers) {
    const insight = await getCommunityInsight(ticker.symbol);
    if (insight && insight.recommendation !== 'avoid') {
      insights.push(insight);
    }
    if (insights.length >= limit) break;
  }

  return insights;
}

/**
 * Get strategy insights from community data.
 */
export async function getStrategyInsights(): Promise<CommunityStrategyInsight[]> {
  const now = Date.now();
  if (strategyInsightsCache && strategyInsightsCache.expiresAt > now) {
    return strategyInsightsCache.insights;
  }

  const insights = await collectStrategyStats();
  strategyInsightsCache = {
    insights,
    expiresAt: now + STRATEGY_INSIGHT_CACHE_TTL_MS,
  };
  return insights;
}

/**
 * Get community model status.
 */
export async function getCommunityModelStatus(): Promise<CommunityModelStatus> {
  const model = await prisma.communityMLModel.findFirst({
    where: { modelType: COMMUNITY_MODEL_TYPE, isActive: true },
    select: { version: true, trainedAt: true, trainingStats: true },
  });

  if (!model) {
    return { hasModel: false, version: null, trainedAt: null, stats: null };
  }

  let stats: CommunityTrainingStats | null = null;
  try {
    const parsed = JSON.parse(model.trainingStats || '{}');
    stats = {
      totalTrades: parsed.totalTrades || 0,
      stockTrades: parsed.stockTrades || 0,
      optionTrades: parsed.optionTrades || 0,
      uniqueUsers: parsed.uniqueUsers || 0,
      uniqueTickers: parsed.uniqueTickers || 0,
      strategiesFound: parsed.strategiesFound || 0,
      epochs: parsed.epochs || 0,
      finalLoss: parsed.finalLoss || 0,
    };
  } catch {
    // Ignore parse errors
  }

  return {
    hasModel: true,
    version: model.version,
    trainedAt: model.trainedAt.toISOString(),
    stats,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractBaseSymbol(symbol: string): string {
  // Option symbols are like "AAPL 240315C150" - extract base
  const parts = symbol.split(' ');
  return parts[0];
}

function calculateHoldDays(openDate: Date, closeDate: Date): number {
  return Math.max(1, Math.ceil(
    (new Date(closeDate).getTime() - new Date(openDate).getTime()) / (1000 * 60 * 60 * 24)
  ));
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calculateTickerScore(data: {
  stockWinRate: number;
  stockAvgReturn: number;
  optionWinRate: number;
  optionAvgReturn: number;
  wheelWinRate: number;
  totalTrades: number;
  uniqueTraders: number;
}): number {
  // Weight factors
  const weights = {
    stockWinRate: 0.15,
    stockReturn: 0.1,
    optionWinRate: 0.25,
    optionReturn: 0.15,
    wheelWinRate: 0.2,
    volume: 0.1,
    diversity: 0.05,
  };

  // Normalize each factor to 0-100
  const stockWinScore = data.stockWinRate * 100;
  const stockReturnScore = Math.min(100, Math.max(0, 50 + data.stockAvgReturn * 2));
  const optionWinScore = data.optionWinRate * 100;
  const optionReturnScore = Math.min(100, Math.max(0, 50 + data.optionAvgReturn * 2));
  const wheelWinScore = data.wheelWinRate * 100;
  const volumeScore = Math.min(100, data.totalTrades * 2);
  const diversityScore = Math.min(100, data.uniqueTraders * 20);

  return (
    stockWinScore * weights.stockWinRate +
    stockReturnScore * weights.stockReturn +
    optionWinScore * weights.optionWinRate +
    optionReturnScore * weights.optionReturn +
    wheelWinScore * weights.wheelWinRate +
    volumeScore * weights.volume +
    diversityScore * weights.diversity
  );
}

function generateTickerInsights(data: {
  symbol: string;
  stockWinRate: number;
  optionWinRate: number;
  wheelWinRate: number;
  avgReturn: number;
  totalTrades: number;
  uniqueTraders: number;
  bestStrategy: string | null;
  bestStrategyWinRate: number;
}): string[] {
  const insights: string[] = [];

  if (data.totalTrades >= 20) {
    insights.push(`${data.totalTrades} total trades from ${data.uniqueTraders} traders`);
  }

  if (data.stockWinRate >= 0.7) {
    insights.push(`Strong stock performance: ${(data.stockWinRate * 100).toFixed(0)}% win rate`);
  } else if (data.stockWinRate < 0.4 && data.stockWinRate > 0) {
    insights.push(`Caution: Stock win rate is ${(data.stockWinRate * 100).toFixed(0)}%`);
  }

  if (data.optionWinRate >= 0.7) {
    insights.push(`Excellent options performance: ${(data.optionWinRate * 100).toFixed(0)}% win rate`);
  }

  if (data.wheelWinRate >= 0.75) {
    insights.push(`Great for wheel strategy: ${(data.wheelWinRate * 100).toFixed(0)}% win rate`);
  }

  if (data.bestStrategy && data.bestStrategyWinRate >= 0.7) {
    const strategyName = formatStrategyName(data.bestStrategy);
    insights.push(`Best strategy: ${strategyName} (${(data.bestStrategyWinRate * 100).toFixed(0)}% win rate)`);
  }

  if (data.avgReturn > 20) {
    insights.push(`High average return: ${data.avgReturn.toFixed(1)}%`);
  } else if (data.avgReturn < -10) {
    insights.push(`Warning: Negative average return: ${data.avgReturn.toFixed(1)}%`);
  }

  return insights;
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

