/**
 * Model Storage for Options ML
 * Handles saving/loading TensorFlow.js models to/from SQL Server
 *
 * Features server-side caching to avoid repeated database loads:
 * - Models cached in memory after first load
 * - Cache invalidated when model is retrained
 * - 30-minute TTL to prevent stale models across server instances
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import type { OptionsModelType, TrainingStats } from './types';
import {
  type CachedModel,
  getCacheKey,
  clearCacheForUser,
  getValidCachedModel,
  updateCache,
  weightsToBuffer,
  buildSavedArtifacts,
  parseModelTopology,
  bufferToArrayBuffer,
  loadModelFromArtifacts,
} from '../model-storage-core';

// In-memory cache for loaded models (per server instance)
const optionsModelCache = new Map<string, CachedModel>();

/**
 * Clear cached model for a user/type (call after training)
 */
export function clearOptionsModelCache(userId: string, modelType?: OptionsModelType): void {
  clearCacheForUser(optionsModelCache, userId, modelType);
}

// ============================================================================
// Save Model to Database
// ============================================================================

export async function saveOptionsModel(
  userId: string,
  modelType: OptionsModelType,
  modelName: string,
  model: tf.LayersModel,
  stats: TrainingStats,
  architecture?: string
): Promise<void> {
  // Get current version
  const existing = await prisma.optionsMLModel.findFirst({
    where: { userId, modelType, isActive: true },
    select: { version: true },
  });

  const newVersion = (existing?.version ?? 0) + 1;

  // Save model using custom handler
  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const weightsBuffer = weightsToBuffer(artifacts.weightData);

      // Deactivate existing models of this type
      await prisma.optionsMLModel.updateMany({
        where: { userId, modelType, isActive: true },
        data: { isActive: false },
      });

      const savedArtifacts = buildSavedArtifacts(artifacts);

      // Create new model record
      await prisma.optionsMLModel.create({
        data: {
          userId,
          modelType,
          modelName,
          version: newVersion,
          modelTopology: JSON.stringify(savedArtifacts),
          modelWeights: new Uint8Array(weightsBuffer),
          architecture: architecture ? JSON.stringify(architecture) : null,
          accuracy: stats.accuracy ?? null,
          loss: stats.finalLoss,
          valLoss: stats.validationLoss ?? null,
          tradesUsed: stats.tradesUsed,
          epochsTrained: stats.epochs,
          trainingStats: JSON.stringify(stats),
          isActive: true,
        },
      });

      // Clear cache for this model type so next load gets fresh version
      clearOptionsModelCache(userId, modelType);

      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    })
  );
}

// ============================================================================
// Load Model from Database
// ============================================================================

export async function loadOptionsModel(
  userId: string,
  modelType: OptionsModelType
): Promise<tf.LayersModel | null> {
  const cacheKey = getCacheKey(userId, modelType);

  // Check cache first - need version info from DB to validate
  const record = await prisma.optionsMLModel.findFirst({
    where: { userId, modelType, isActive: true },
    select: {
      version: true,
      modelTopology: true,
      modelWeights: true,
    },
  });

  if (!record) return null;

  // Check if we have a valid cached model
  const cachedModel = getValidCachedModel(optionsModelCache, cacheKey, record.version);
  if (cachedModel) return cachedModel;

  // Cache miss or stale - load from database
  try {
    const { modelTopology, weightSpecs } = parseModelTopology(
      record.modelTopology, modelType, userId
    );
    const arrayBuffer = bufferToArrayBuffer(record.modelWeights);
    const model = await loadModelFromArtifacts(modelTopology, weightSpecs, arrayBuffer);

    updateCache(optionsModelCache, cacheKey, model, record.version);

    return model;
  } catch (error) {
    console.error(`Error loading model ${modelType}:`, error);
    return null;
  }
}

// ============================================================================
// Model Info & Management
// ============================================================================

export async function getOptionsModelInfo(userId: string): Promise<{
  models: {
    modelType: OptionsModelType;
    version: number;
    modelName: string;
    accuracy: number | null;
    loss: number;
    tradesUsed: number;
    trainedAt: Date;
  }[];
  totalModels: number;
}> {
  const models = await prisma.optionsMLModel.findMany({
    where: { userId, isActive: true },
    select: {
      modelType: true,
      version: true,
      modelName: true,
      accuracy: true,
      loss: true,
      tradesUsed: true,
      trainedAt: true,
    },
    orderBy: { trainedAt: 'desc' },
  });

  return {
    models: models.map((m) => ({
      modelType: m.modelType as OptionsModelType,
      version: m.version,
      modelName: m.modelName,
      accuracy: m.accuracy ? Number(m.accuracy) : null,
      loss: Number(m.loss),
      tradesUsed: m.tradesUsed ?? 0,
      trainedAt: m.trainedAt,
    })),
    totalModels: models.length,
  };
}

export async function deleteOptionsModel(
  userId: string,
  modelType: OptionsModelType
): Promise<boolean> {
  const result = await prisma.optionsMLModel.deleteMany({
    where: { userId, modelType },
  });

  return result.count > 0;
}

// ============================================================================
// Prediction Logging
// ============================================================================

export async function logPrediction(
  userId: string,
  modelType: OptionsModelType,
  modelVersion: number,
  prediction: {
    symbol?: string;
    predictionType: string;
    prediction: unknown;
    confidence?: number;
    uncertainty?: number;
  }
): Promise<string> {
  const record = await prisma.mLPredictionLog.create({
    data: {
      userId,
      modelType,
      modelVersion,
      symbol: prediction.symbol ?? null,
      predictionType: prediction.predictionType,
      prediction: JSON.stringify(prediction.prediction),
      confidence: prediction.confidence ?? null,
      uncertainty: prediction.uncertainty ?? null,
    },
  });

  return record.id;
}

export async function resolvePrediction(
  predictionId: string,
  actualOutcome: unknown,
  wasAccurate: boolean,
  errorMagnitude?: number
): Promise<void> {
  await prisma.mLPredictionLog.update({
    where: { id: predictionId },
    data: {
      actualOutcome: JSON.stringify(actualOutcome),
      wasAccurate,
      errorMagnitude: errorMagnitude ?? null,
      resolvedAt: new Date(),
    },
  });
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toNextClose(
  closes: Array<{
    closeDate: Date;
    realizedPnL: unknown;
    openAmount: unknown;
    strategy: string | null;
    closeReason: string;
    strike: unknown;
    openPrice: unknown;
  }>,
  predictionDate: Date
) {
  return closes.find((close) => {
    const deltaDays = (close.closeDate.getTime() - predictionDate.getTime()) / (1000 * 60 * 60 * 24);
    return deltaDays >= 0 && deltaDays <= 45;
  });
}

function inferVolatilityRegime(
  closes: Array<{ strike: unknown; openPrice: unknown }>
): 'low' | 'medium' | 'high' | 'extreme' | null {
  const premiumPcts = closes
    .map((close) => {
      const strike = Number(close.strike);
      const premium = Math.abs(Number(close.openPrice));
      if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(premium)) return null;
      return premium / strike * 100;
    })
    .filter((value): value is number => value !== null);

  if (premiumPcts.length === 0) return null;
  const mean = premiumPcts.reduce((sum, value) => sum + value, 0) / premiumPcts.length;
  const variance = premiumPcts.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / premiumPcts.length;
  const volatilityScore = mean + Math.sqrt(variance);

  if (volatilityScore < 2) return 'low';
  if (volatilityScore < 4) return 'medium';
  if (volatilityScore < 7) return 'high';
  return 'extreme';
}

function regimeDistance(
  predicted: 'low' | 'medium' | 'high' | 'extreme',
  actual: 'low' | 'medium' | 'high' | 'extreme'
): number {
  const order: Array<'low' | 'medium' | 'high' | 'extreme'> = ['low', 'medium', 'high', 'extreme'];
  const predictedIndex = order.indexOf(predicted);
  const actualIndex = order.indexOf(actual);
  return Math.abs(predictedIndex - actualIndex) / 3;
}

/**
 * Validate unresolved options ML predictions against newly derived closes.
 * Non-blocking, fault-tolerant, and designed for repeated invocation.
 */
export async function validateOptionsPredictionsAfterDerivation(
  userId: string
): Promise<{ validated: number; accurate: number; errors: number }> {
  let validated = 0;
  let accurate = 0;
  let errors = 0;

  try {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const unresolvedPredictions = await prisma.mLPredictionLog.findMany({
      where: {
        userId,
        resolvedAt: null,
        createdAt: { gte: fortyFiveDaysAgo },
        predictionType: { in: ['entry_score', 'strategy', 'regime', 'exit_strategy'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    if (unresolvedPredictions.length === 0) {
      return { validated: 0, accurate: 0, errors: 0 };
    }

    const recentCloses = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeType: 'option',
        hasUnknownBasis: false,
        closeDate: { gte: fortyFiveDaysAgo },
      },
      select: {
        symbol: true,
        closeDate: true,
        realizedPnL: true,
        openAmount: true,
        strategy: true,
        closeReason: true,
        strike: true,
        openPrice: true,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (recentCloses.length === 0) {
      return { validated: 0, accurate: 0, errors: 0 };
    }

    const closesBySymbol = new Map<string, typeof recentCloses>();
    for (const close of recentCloses) {
      const existing = closesBySymbol.get(close.symbol) ?? [];
      existing.push(close);
      closesBySymbol.set(close.symbol, existing);
    }

    for (const predictionLog of unresolvedPredictions) {
      try {
        if (!predictionLog.symbol) continue;

        const predictionPayload = safeParseJson(predictionLog.prediction);
        if (!predictionPayload) {
          errors += 1;
          continue;
        }

        const symbolCloses = closesBySymbol.get(predictionLog.symbol);
        if (!symbolCloses || symbolCloses.length === 0) continue;

        const nextClose = toNextClose(symbolCloses, predictionLog.createdAt);
        if (!nextClose) continue;

        let wasAccurate: boolean | null = null;
        let errorMagnitude: number | undefined;
        let actualOutcome: Record<string, unknown> = {};

        if (predictionLog.predictionType === 'entry_score') {
          const score = Number(predictionPayload.entryScore);
          if (!Number.isFinite(score) || (score > 0.4 && score < 0.6)) continue;

          const actualWin = Number(nextClose.realizedPnL) > 0;
          const predictedWin = score >= 0.6;
          wasAccurate = predictedWin === actualWin;
          errorMagnitude = Math.abs(score - (actualWin ? 1 : 0));
          actualOutcome = {
            closeDate: nextClose.closeDate.toISOString(),
            realizedPnL: Number(nextClose.realizedPnL),
            predictedEntryScore: score,
            predictedWin,
            actualWin,
          };
        } else if (predictionLog.predictionType === 'strategy') {
          const predictedStrategy = String(predictionPayload.strategy ?? '');
          const actualStrategy = nextClose.strategy;
          if (!predictedStrategy || !actualStrategy || actualStrategy !== predictedStrategy) continue;

          wasAccurate = Number(nextClose.realizedPnL) > 0;
          errorMagnitude = wasAccurate ? 0 : 1;
          actualOutcome = {
            closeDate: nextClose.closeDate.toISOString(),
            realizedPnL: Number(nextClose.realizedPnL),
            predictedStrategy,
            actualStrategy,
          };
        } else if (predictionLog.predictionType === 'regime') {
          const predictedRegime = String(predictionPayload.regime ?? '').toLowerCase();
          if (!['low', 'medium', 'high', 'extreme'].includes(predictedRegime)) continue;

          const realizedWindow = symbolCloses
            .filter((close) => close.closeDate >= predictionLog.createdAt)
            .slice(0, 5);
          const realizedRegime = inferVolatilityRegime(realizedWindow);
          if (!realizedRegime) continue;

          wasAccurate = predictedRegime === realizedRegime;
          errorMagnitude = regimeDistance(
            predictedRegime as 'low' | 'medium' | 'high' | 'extreme',
            realizedRegime
          );
          actualOutcome = {
            windowTrades: realizedWindow.length,
            predictedRegime,
            realizedRegime,
          };
        } else if (predictionLog.predictionType === 'exit_strategy') {
          const targetProfitPercent = Number(predictionPayload.targetProfitPercent);
          const stopLossPercent = Number(predictionPayload.stopLossPercent);
          const predictedTiming = String(predictionPayload.exitTiming ?? '');
          const realizedReturnPct =
            (Number(nextClose.realizedPnL) / Math.max(1, Math.abs(Number(nextClose.openAmount)))) * 100;
          const hitTarget =
            Number.isFinite(targetProfitPercent) && realizedReturnPct >= targetProfitPercent;
          const breachedStop =
            Number.isFinite(stopLossPercent) && realizedReturnPct <= -Math.abs(stopLossPercent);
          const realizedTiming =
            nextClose.closeReason === 'expired' || nextClose.closeReason === 'assigned'
              ? 'expiration'
              : hitTarget
                ? 'at_target'
                : 'early';
          const timingMatch = predictedTiming === realizedTiming;

          wasAccurate = hitTarget || (!breachedStop && timingMatch && realizedReturnPct > 0);
          errorMagnitude = Number.isFinite(targetProfitPercent)
            ? Math.abs(realizedReturnPct - targetProfitPercent) / 100
            : Math.abs(realizedReturnPct) / 100;
          actualOutcome = {
            closeDate: nextClose.closeDate.toISOString(),
            closeReason: nextClose.closeReason,
            realizedPnL: Number(nextClose.realizedPnL),
            realizedReturnPct,
            predictedTiming,
            realizedTiming,
            hitTarget,
            breachedStop,
          };
        }

        if (wasAccurate === null) continue;

        await prisma.mLPredictionLog.update({
          where: { id: predictionLog.id },
          data: {
            actualOutcome: JSON.stringify(actualOutcome),
            wasAccurate,
            errorMagnitude: errorMagnitude ?? null,
            resolvedAt: new Date(),
          },
        });

        validated += 1;
        if (wasAccurate) accurate += 1;
      } catch {
        errors += 1;
      }
    }
  } catch {
    errors += 1;
  }

  return { validated, accurate, errors };
}

// ============================================================================
// Model Accuracy Stats
// ============================================================================

export async function getModelAccuracyStats(
  userId: string,
  modelType?: OptionsModelType
): Promise<{
  totalPredictions: number;
  resolvedPredictions: number;
  accuratePredictions: number;
  accuracyRate: number;
  avgErrorMagnitude: number | null;
  byModelType: Record<string, { total: number; accurate: number; rate: number }>;
}> {
  const where: { userId: string; modelType?: string } = { userId };
  if (modelType) where.modelType = modelType;

  const [total, resolved, accurate, avgError, byType] = await Promise.all([
    prisma.mLPredictionLog.count({ where }),
    prisma.mLPredictionLog.count({ where: { ...where, resolvedAt: { not: null } } }),
    prisma.mLPredictionLog.count({ where: { ...where, wasAccurate: true } }),
    prisma.mLPredictionLog.aggregate({
      where: { ...where, errorMagnitude: { not: null } },
      _avg: { errorMagnitude: true },
    }),
    prisma.mLPredictionLog.groupBy({
      by: ['modelType'],
      where: { userId, resolvedAt: { not: null } },
      _count: { _all: true, wasAccurate: true },
    }),
  ]);

  const byModelType: Record<string, { total: number; accurate: number; rate: number }> = {};
  for (const group of byType) {
    // Count accurate separately
    const accurateCount = await prisma.mLPredictionLog.count({
      where: { userId, modelType: group.modelType, wasAccurate: true },
    });
    byModelType[group.modelType] = {
      total: group._count._all,
      accurate: accurateCount,
      rate: group._count._all > 0 ? accurateCount / group._count._all : 0,
    };
  }

  return {
    totalPredictions: total,
    resolvedPredictions: resolved,
    accuratePredictions: accurate,
    accuracyRate: resolved > 0 ? accurate / resolved : 0,
    avgErrorMagnitude: avgError._avg.errorMagnitude ? Number(avgError._avg.errorMagnitude) : null,
    byModelType,
  };
}
