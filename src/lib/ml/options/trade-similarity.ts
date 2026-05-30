/**
 * Trade Similarity Search
 * Uses embeddings to find similar past trades and inform current decisions
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { extractTradeEmbeddingFeatures, TRADE_EMBEDDING_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel } from './model-storage';
import type { SimilarTrade, SimilaritySearchResult, TrainingStats } from './types';

const EMBEDDING_DIM = 32;
const NUM_FEATURES = TRADE_EMBEDDING_FEATURE_NAMES.length;

// ============================================================================
// Autoencoder for Trade Embeddings
// ============================================================================

export function buildTradeEmbedder(): tf.LayersModel {
  // Encoder
  const input = tf.input({ shape: [NUM_FEATURES] });

  const encoder1 = tf.layers
    .dense({
      units: 24,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    })
    .apply(input);

  const encoder2 = tf.layers
    .dense({
      units: EMBEDDING_DIM,
      activation: 'tanh',
      name: 'embedding',
    })
    .apply(encoder1);

  // Decoder
  const decoder1 = tf.layers
    .dense({
      units: 24,
      activation: 'relu',
    })
    .apply(encoder2);

  const decoder2 = tf.layers
    .dense({
      units: NUM_FEATURES,
      activation: 'sigmoid',
    })
    .apply(decoder1);

  const autoencoder = tf.model({
    inputs: input,
    outputs: decoder2 as tf.SymbolicTensor,
  });

  autoencoder.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
  });

  return autoencoder;
}

export function getEncoder(autoencoder: tf.LayersModel): tf.LayersModel {
  // Extract just the encoder part for generating embeddings
  const embeddingLayer = autoencoder.getLayer('embedding');
  return tf.model({
    inputs: autoencoder.input,
    outputs: embeddingLayer.output,
  });
}

// ============================================================================
// Training
// ============================================================================

export async function trainTradeEmbedder(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
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
        error: `Need at least 30 option trades, found ${trades.length}`,
      };
    }

    // Generate features for all trades
    const featurePromises = trades.map((trade) =>
      extractTradeEmbeddingFeatures({
        symbol: trade.symbol,
        strategy: trade.strategy,
        openDate: trade.openDate,
        closeDate: trade.closeDate,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        openAmount: trade.openAmount,
        strike: trade.strike,
        expiration: trade.expiration,
        realizedPnL: trade.realizedPnL,
        closeReason: trade.closeReason,
      })
    );

    const features = await Promise.all(featurePromises);

    const model = buildTradeEmbedder();

    const split = temporalSplit(features, {
      validationFraction: 0.2,
      minTrainRows: 20,
      minValidationRows: 5,
    });
    const trainXs = tf.tensor2d(split.trainRows);
    const validationXs = tf.tensor2d(split.validationRows);

    const startTime = Date.now();
    const history = await model.fit(trainXs, trainXs, {
      // Autoencoder: input = output
      epochs: 100,
      batchSize: Math.min(32, Math.floor(trades.length / 4)),
      validationData: [validationXs, validationXs],
      shuffle: false,
      callbacks: tf.callbacks.earlyStopping({ patience: 15, monitor: 'val_loss' }),
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;
    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const validationLoss = getLastHistoryMetric(history, ['val_loss']);

    const stats: TrainingStats = {
      tradesUsed: trades.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss,
      trainingTime,
    };

    await saveOptionsModel(
      userId,
      'trade-embedder',
      'Trade Similarity Embedder',
      model,
      stats,
      `Autoencoder: Dense(24)->Dense(${EMBEDDING_DIM})->Dense(24)->Dense(${NUM_FEATURES})`
    );

    // Generate and store embeddings for all trades
    const encoder = getEncoder(model);
    const allXs = tf.tensor2d(features);
    const embeddings = encoder.predict(allXs) as tf.Tensor;
    const embeddingData = await embeddings.array() as number[][];

    // Store embeddings in database
    await storeEmbeddings(userId, trades, embeddingData);

    trainXs.dispose();
    validationXs.dispose();
    allXs.dispose();
    embeddings.dispose();
    model.dispose();
    encoder.dispose();

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
// Embedding Storage
// ============================================================================

async function storeEmbeddings(
  userId: string,
  trades: {
    id: string;
    symbol: string;
    strategy: string | null;
    realizedPnL: unknown;
    openDate: Date;
    closeDate: Date;
  }[],
  embeddings: number[][]
): Promise<void> {
  // Delete existing embeddings
  await prisma.tradeEmbedding.deleteMany({
    where: { userId },
  });

  // Store new embeddings in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

    await prisma.tradeEmbedding.createMany({
      data: batch.map((trade, idx) => {
        const pnl = Number(trade.realizedPnL);
        const holdDays = Math.max(
          1,
          Math.ceil((trade.closeDate.getTime() - trade.openDate.getTime()) / (24 * 60 * 60 * 1000))
        );
        return {
          userId,
          realizedCloseId: trade.id,
          symbol: trade.symbol,
          strategy: trade.strategy || 'unknown',
          embedding: JSON.stringify(batchEmbeddings[idx]),
          embeddingDim: batchEmbeddings[idx].length,
          outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
          pnlPercent: pnl, // Simplified - would need to calculate %
          holdDays,
          tradeDate: trade.openDate,
        };
      }),
    });
  }
}

// ============================================================================
// Similarity Search
// ============================================================================

export async function findSimilarTrades(
  userId: string,
  tradeSetup: {
    symbol: string;
    strategy: string | null;
    strike: number;
    dte: number;
    premium: number;
  },
  k: number = 5
): Promise<SimilaritySearchResult> {
  // Generate embedding for the new trade setup
  const features = await generateSetupFeatures(tradeSetup);

  const model = await loadOptionsModel(userId, 'trade-embedder');

  let queryEmbedding: number[];

  if (model) {
    const encoder = getEncoder(model);
    const inputTensor = tf.tensor2d([features]);
    const embeddingTensor = encoder.predict(inputTensor) as tf.Tensor;
    queryEmbedding = Array.from(await embeddingTensor.data());

    inputTensor.dispose();
    embeddingTensor.dispose();
    encoder.dispose();
  } else {
    // Use features directly as a pseudo-embedding
    queryEmbedding = features;
  }

  // Get stored embeddings (data is denormalized in TradeEmbedding)
  const storedEmbeddings = await prisma.tradeEmbedding.findMany({
    where: { userId },
  });

  if (storedEmbeddings.length === 0) {
    return {
      similarTrades: [],
      aggregateStats: {
        totalFound: 0,
        winCount: 0,
        lossCount: 0,
        avgReturn: 0,
        avgHoldDays: 0,
      },
    };
  }

  // Calculate similarities
  const similarities = storedEmbeddings.map((stored) => {
    const storedEmb = JSON.parse(stored.embedding) as number[];
    const similarity = cosineSimilarity(queryEmbedding, storedEmb);
    return { stored, similarity };
  });

  // Sort by similarity and get top k
  similarities.sort((a, b) => b.similarity - a.similarity);
  const topK = similarities.slice(0, k);

  // Build results (using denormalized data from TradeEmbedding)
  const similarTrades: SimilarTrade[] = topK.map(({ stored, similarity }) => {
    return {
      tradeId: stored.realizedCloseId || stored.id, // Fallback to embedding ID if no trade ID
      symbol: stored.symbol,
      strategy: stored.strategy || 'unknown',
      similarity,
      outcome: stored.outcome as 'win' | 'loss' | 'breakeven',
      pnlPercent: Number(stored.pnlPercent),
      holdDays: stored.holdDays,
    };
  });

  // Aggregate stats
  const wins = similarTrades.filter((t) => t.outcome === 'win').length;
  const losses = similarTrades.filter((t) => t.outcome === 'loss').length;
  const avgReturn =
    similarTrades.length > 0
      ? similarTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / similarTrades.length
      : 0;
  const avgHoldDays =
    similarTrades.length > 0
      ? similarTrades.reduce((sum, t) => sum + t.holdDays, 0) / similarTrades.length
      : 0;

  // Generate pattern description
  const pattern = generatePatternDescription(similarTrades);

  return {
    similarTrades,
    aggregateStats: {
      totalFound: similarTrades.length,
      winCount: wins,
      lossCount: losses,
      avgReturn,
      avgHoldDays,
    },
    pattern,
  };
}

// ============================================================================
// Feature Generation for New Setups
// ============================================================================

async function generateSetupFeatures(setup: {
  symbol: string;
  strategy: string | null;
  strike: number;
  dte: number;
  premium: number;
}): Promise<number[]> {
  const now = new Date();
  const expiration = new Date(now.getTime() + setup.dte * 24 * 60 * 60 * 1000);

  // Create a mock trade for feature extraction
  return extractTradeEmbeddingFeatures({
    symbol: setup.symbol,
    strategy: setup.strategy,
    openDate: now,
    closeDate: expiration, // Use expiration as close date estimate
    openPrice: setup.premium,
    closePrice: setup.premium,
    openAmount: Math.abs(setup.premium),
    strike: setup.strike,
    expiration,
    realizedPnL: 0, // Unknown yet
    closeReason: null,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  // Create copies to avoid mutating parameters
  let arrA = a;
  let arrB = b;

  if (a.length !== b.length) {
    // Pad shorter array
    const maxLen = Math.max(a.length, b.length);
    arrA = [...a];
    arrB = [...b];
    while (arrA.length < maxLen) arrA.push(0);
    while (arrB.length < maxLen) arrB.push(0);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < arrA.length; i++) {
    dotProduct += arrA[i] * arrB[i];
    normA += arrA[i] * arrA[i];
    normB += arrB[i] * arrB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

function generatePatternDescription(trades: SimilarTrade[]): string | undefined {
  if (trades.length === 0) return undefined;

  const wins = trades.filter((t) => t.outcome === 'win').length;
  const winRate = wins / trades.length;

  const avgReturn = trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length;
  const avgHold = trades.reduce((sum, t) => sum + t.holdDays, 0) / trades.length;

  const parts: string[] = [];

  if (winRate >= 0.8) {
    parts.push(`Strong historical success (${(winRate * 100).toFixed(0)}% win rate)`);
  } else if (winRate >= 0.6) {
    parts.push(`Good historical performance (${(winRate * 100).toFixed(0)}% win rate)`);
  } else if (winRate < 0.4) {
    parts.push(`Historically challenging setup (${(winRate * 100).toFixed(0)}% win rate)`);
  }

  if (avgReturn > 20) {
    parts.push(`Average return: +${avgReturn.toFixed(1)}%`);
  } else if (avgReturn > 0) {
    parts.push(`Modest average return: +${avgReturn.toFixed(1)}%`);
  } else {
    parts.push(`Historical average: ${avgReturn.toFixed(1)}%`);
  }

  if (avgHold < 7) {
    parts.push('Typically quick trades');
  } else if (avgHold > 30) {
    parts.push('Usually held longer term');
  }

  return parts.join('. ');
}

// ============================================================================
// Refresh Embeddings
// ============================================================================

export async function refreshAllEmbeddings(userId: string): Promise<{
  success: boolean;
  tradesUpdated: number;
  error?: string;
}> {
  try {
    const model = await loadOptionsModel(userId, 'trade-embedder');

    if (!model) {
      return {
        success: false,
        tradesUpdated: 0,
        error: 'No trained embedder model found. Train the model first.',
      };
    }

    const trades = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeType: 'option',
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (trades.length === 0) {
      return { success: true, tradesUpdated: 0 };
    }

    // Generate features
    const featurePromises = trades.map((trade) =>
      extractTradeEmbeddingFeatures({
        symbol: trade.symbol,
        strategy: trade.strategy,
        openDate: trade.openDate,
        closeDate: trade.closeDate,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        openAmount: trade.openAmount,
        strike: trade.strike,
        expiration: trade.expiration,
        realizedPnL: trade.realizedPnL,
        closeReason: trade.closeReason,
      })
    );

    const features = await Promise.all(featurePromises);

    const encoder = getEncoder(model);
    const xs = tf.tensor2d(features);
    const embeddings = encoder.predict(xs) as tf.Tensor;
    const embeddingData = await embeddings.array() as number[][];

    await storeEmbeddings(userId, trades, embeddingData);

    xs.dispose();
    embeddings.dispose();
    encoder.dispose();

    return { success: true, tradesUpdated: trades.length };
  } catch (error) {
    return {
      success: false,
      tradesUpdated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
