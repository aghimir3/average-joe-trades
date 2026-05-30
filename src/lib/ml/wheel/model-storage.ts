/**
 * Model Storage Service for Wheel Strategy ML
 * Stores and loads TensorFlow.js models in Azure SQL for multi-instance compatibility
 *
 * Features server-side caching to avoid repeated database loads:
 * - Models cached in memory after first load
 * - Cache invalidated when model is retrained
 * - 30-minute TTL to prevent stale models across server instances
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import type { ModelType, TrainingStats } from './types';
import {
  type CachedModel,
  getCacheKey,
  clearCacheForUser,
  clearEntireCache,
  getValidCachedModel,
  updateCache,
  weightsToBuffer,
  buildSavedArtifacts,
  parseModelTopology,
  bufferToArrayBuffer,
  loadModelFromArtifacts,
} from '../model-storage-core';

// In-memory cache for loaded models (per server instance)
const modelCache = new Map<string, CachedModel>();

/**
 * Clear cached model for a user/type (call after training)
 */
export function clearModelCache(userId: string, modelType?: ModelType): void {
  clearCacheForUser(modelCache, userId, modelType);
}

/**
 * Clear entire model cache (for server shutdown/restart)
 */
export function clearAllModelCache(): void {
  clearEntireCache(modelCache);
}

/**
 * Save a trained model to SQL database
 * Uses TensorFlow.js save handler to serialize model artifacts
 */
export async function saveModelToSQL(
  userId: string,
  modelType: ModelType,
  model: tf.LayersModel,
  stats: TrainingStats
): Promise<{ version: number }> {
  let newVersion = 1;

  // Use TF.js save handler to serialize model
  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const weightsData = weightsToBuffer(artifacts.weightData);

      // Deactivate previous active version
      await prisma.wheelMLModel.updateMany({
        where: { userId, modelType, isActive: true },
        data: { isActive: false },
      });

      // Get latest version number
      const lastModel = await prisma.wheelMLModel.findFirst({
        where: { userId, modelType },
        orderBy: { version: 'desc' },
      });
      newVersion = (lastModel?.version ?? 0) + 1;

      const savedArtifacts = buildSavedArtifacts(artifacts);

      await prisma.wheelMLModel.create({
        data: {
          userId,
          modelType,
          version: newVersion,
          modelTopology: JSON.stringify(savedArtifacts),
          modelWeights: new Uint8Array(weightsData),
          accuracy: stats.accuracy ?? null,
          loss: stats.finalLoss,
          tradesUsed: stats.tradesUsed,
          epochsTrained: stats.epochs,
          trainingStats: JSON.stringify(stats),
          isActive: true,
        },
      });

      // Clear cache for this model type so next load gets fresh version
      clearModelCache(userId, modelType);

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON' as const,
        },
      };
    })
  );

  return { version: newVersion };
}

/**
 * Load a trained model from SQL database with server-side caching
 * Returns null if no model exists for the user
 *
 * Caching strategy:
 * - First checks in-memory cache
 * - Validates cache by version number
 * - TTL prevents stale models in multi-server deployments
 */
export async function loadModelFromSQL(
  userId: string,
  modelType: ModelType
): Promise<tf.LayersModel | null> {
  const cacheKey = getCacheKey(userId, modelType);

  // Check cache first - need version info from DB to validate
  const modelRecord = await prisma.wheelMLModel.findFirst({
    where: { userId, modelType, isActive: true },
    select: {
      version: true,
      modelTopology: true,
      modelWeights: true,
    },
  });

  if (!modelRecord) return null;

  // Check if we have a valid cached model
  const cachedModel = getValidCachedModel(modelCache, cacheKey, modelRecord.version);
  if (cachedModel) return cachedModel;

  // Cache miss or stale - load from database
  try {
    const { modelTopology, weightSpecs } = parseModelTopology(
      modelRecord.modelTopology, modelType, userId
    );
    const weightsArrayBuffer = bufferToArrayBuffer(modelRecord.modelWeights);
    const model = await loadModelFromArtifacts(modelTopology, weightSpecs, weightsArrayBuffer);

    updateCache(modelCache, cacheKey, model, modelRecord.version);

    return model;
  } catch (error) {
    console.error(`Failed to load model ${modelType} for user ${userId}:`, error);
    return null;
  }
}

/**
 * Check if user has a trained model
 */
export async function hasTrainedModel(userId: string, modelType: ModelType): Promise<boolean> {
  const count = await prisma.wheelMLModel.count({
    where: { userId, modelType, isActive: true },
  });
  return count > 0;
}

/**
 * Get model info for a user
 */
export async function getModelInfo(
  userId: string,
  modelType: ModelType
): Promise<{
  version: number;
  trainedAt: Date;
  tradesUsed: number;
  accuracy: number | null;
} | null> {
  const model = await prisma.wheelMLModel.findFirst({
    where: { userId, modelType, isActive: true },
    select: {
      version: true,
      trainedAt: true,
      tradesUsed: true,
      accuracy: true,
    },
  });

  if (!model) return null;

  return {
    version: model.version,
    trainedAt: model.trainedAt,
    tradesUsed: model.tradesUsed ?? 0,
    accuracy: model.accuracy ? Number(model.accuracy) : null,
  };
}

/**
 * Get all model info for a user
 */
export async function getAllModelInfo(userId: string): Promise<{
  candidateRankerVersion: number | null;
  strikeOptimizerVersion: number | null;
  rollAdvisorVersion: number | null;
  lastTrainedAt: string | null;
}> {
  const models = await prisma.wheelMLModel.findMany({
    where: { userId, isActive: true },
    select: {
      modelType: true,
      version: true,
      trainedAt: true,
    },
  });

  const modelMap = new Map(models.map((m) => [m.modelType, m]));

  const candidateRanker = modelMap.get('candidate-ranker');
  const strikeOptimizer = modelMap.get('strike-optimizer');
  const rollAdvisor = modelMap.get('roll-advisor');

  // Find most recent training date
  const trainedDates = models.map((m) => m.trainedAt).filter(Boolean);
  const lastTrainedAt =
    trainedDates.length > 0
      ? new Date(Math.max(...trainedDates.map((d) => d.getTime()))).toISOString()
      : null;

  return {
    candidateRankerVersion: candidateRanker?.version ?? null,
    strikeOptimizerVersion: strikeOptimizer?.version ?? null,
    rollAdvisorVersion: rollAdvisor?.version ?? null,
    lastTrainedAt,
  };
}

/**
 * Delete all models for a user (for testing/reset)
 */
export async function deleteAllModels(userId: string): Promise<number> {
  const result = await prisma.wheelMLModel.deleteMany({
    where: { userId },
  });
  return result.count;
}

/**
 * Store a prediction for accuracy tracking
 */
export async function storePrediction(
  userId: string,
  predictionType: 'ranking' | 'strike_dte' | 'roll',
  symbol: string,
  prediction: unknown
): Promise<string> {
  const record = await prisma.wheelPrediction.create({
    data: {
      userId,
      predictionType,
      symbol,
      prediction: JSON.stringify(prediction),
    },
  });
  return record.id;
}

/**
 * Update prediction with actual outcome
 */
export async function updatePredictionOutcome(
  predictionId: string,
  actualOutcome: unknown,
  wasAccurate: boolean
): Promise<void> {
  await prisma.wheelPrediction.update({
    where: { id: predictionId },
    data: {
      actualOutcome: JSON.stringify(actualOutcome),
      wasAccurate,
      resolvedAt: new Date(),
    },
  });
}

/**
 * Get prediction accuracy stats
 */
export async function getPredictionAccuracy(
  userId: string,
  predictionType?: string
): Promise<{ total: number; accurate: number; accuracy: number }> {
  const where: { userId: string; resolvedAt: { not: null }; predictionType?: string } = {
    userId,
    resolvedAt: { not: null },
  };
  if (predictionType) {
    where.predictionType = predictionType;
  }

  const total = await prisma.wheelPrediction.count({ where });
  const accurate = await prisma.wheelPrediction.count({
    where: { ...where, wasAccurate: true },
  });

  return {
    total,
    accurate,
    accuracy: total > 0 ? accurate / total : 0,
  };
}

/**
 * Validate unresolved predictions against newly closed trades.
 * Call this after derivation completes to update prediction accuracy.
 *
 * IMPORTANT: This is designed to be non-blocking and fault-tolerant.
 * Errors in validation should NEVER break the import/sync flow.
 */
export async function validatePredictionsAfterDerivation(
  userId: string
): Promise<{ validated: number; accurate: number; errors: number }> {
  let validated = 0;
  let accurate = 0;
  let errors = 0;

  try {
    // Get unresolved predictions (created in last 45 days to limit scope)
    // Use 45 days max - predictions older than this are stale
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const unresolvedPredictions = await prisma.wheelPrediction.findMany({
      where: {
        userId,
        resolvedAt: null,
        createdAt: { gte: fortyFiveDaysAgo },
      },
      take: 100, // Limit to 100 predictions per run to avoid long processing
    });

    if (unresolvedPredictions.length === 0) {
      return { validated: 0, accurate: 0, errors: 0 };
    }

    // Get recent closes (last 14 days) to match against predictions
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentCloses = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeDate: { gte: fourteenDaysAgo },
        hasUnknownBasis: false,
        isWheelTrade: true,
      },
      orderBy: { closeDate: 'desc' },
    });

    if (recentCloses.length === 0) {
      return { validated: 0, accurate: 0, errors: 0 };
    }

    // Group closes by symbol for quick lookup
    const closesBySymbol = new Map<string, typeof recentCloses>();
    for (const close of recentCloses) {
      const existing = closesBySymbol.get(close.symbol) || [];
      existing.push(close);
      closesBySymbol.set(close.symbol, existing);
    }

    // Collect updates to batch instead of sequential DB round-trips
    const pendingUpdates: Array<{
      id: string;
      actualOutcome: string;
      wasAccurate: boolean;
    }> = [];

    // Process each prediction individually with error isolation
    for (const prediction of unresolvedPredictions) {
      try {
        const symbolCloses = closesBySymbol.get(prediction.symbol);
        if (!symbolCloses || symbolCloses.length === 0) continue;

        const predictionDate = new Date(prediction.createdAt);

        // Find a close that happened AFTER the prediction AND within 45 days
        // This ensures we're matching the right trade to the prediction
        const relevantClose = symbolCloses.find((c) => {
          const closeDate = new Date(c.closeDate);
          const daysSincePrediction = (closeDate.getTime() - predictionDate.getTime()) / (1000 * 60 * 60 * 24);
          // Close must be after prediction AND within reasonable window (1-45 days)
          return daysSincePrediction >= 0 && daysSincePrediction <= 45;
        });

        if (!relevantClose) continue;

        // Parse prediction data safely
        let predictionData: Record<string, unknown>;
        try {
          predictionData = JSON.parse(prediction.prediction) as Record<string, unknown>;
        } catch {
          // Invalid JSON in prediction - skip but mark as error
          errors++;
          continue;
        }

        let wasAccurate: boolean | null = null;
        let actualOutcome: Record<string, unknown> = {};

        if (prediction.predictionType === 'strike_dte') {
          // Strike/DTE prediction: accurate if recommended strike was close to actual
          // AND trade was profitable
          const pnl = Number(relevantClose.realizedPnL);
          const actualStrike = Number(relevantClose.strike);
          const predictedStrike = Number(predictionData.recommendedStrike) || 0;

          // Only validate if we have valid strikes to compare
          if (actualStrike > 0 && predictedStrike > 0) {
            const strikeDiff = Math.abs(actualStrike - predictedStrike) / actualStrike;
            // Accurate if: profitable AND strike within 10% of prediction
            wasAccurate = pnl > 0 && strikeDiff <= 0.10;
            actualOutcome = {
              closeDate: relevantClose.closeDate,
              realizedPnL: pnl,
              closeReason: relevantClose.closeReason,
              actualStrike,
              predictedStrike,
              strikeDiffPct: strikeDiff * 100,
            };
          }
        } else if (prediction.predictionType === 'roll') {
          // Roll prediction: accurate if recommended action matched outcome
          const recommended = String(predictionData.recommendation || '');
          const closeReason = relevantClose.closeReason;
          const pnl = Number(relevantClose.realizedPnL);

          // Map close reasons to actions
          const actualAction =
            closeReason === 'expired' ? 'let_expire' :
            closeReason === 'assigned' ? 'let_expire' :
            'close';

          // Accurate if: action aligned with recommendation OR profitable
          // (user may have followed advice which led to profit)
          if (recommended && ['roll_out', 'let_expire', 'close'].includes(recommended)) {
            wasAccurate = recommended === actualAction || pnl > 0;
            actualOutcome = {
              closeDate: relevantClose.closeDate,
              closeReason,
              recommendedAction: recommended,
              actualAction,
              realizedPnL: pnl,
              actionsMatched: recommended === actualAction,
            };
          }
        } else if (prediction.predictionType === 'ranking') {
          // Ranking prediction: check if the score prediction was directionally correct
          // Only validate for clear predictions (score < 35 or > 65)
          const score = Number(predictionData.score) || 50;
          const pnl = Number(relevantClose.realizedPnL);

          // Only validate clear predictions, skip neutral zone
          if (score <= 35 || score >= 65) {
            const predictedGood = score >= 65;
            const wasGood = pnl > 0;
            wasAccurate = predictedGood === wasGood;
            actualOutcome = {
              closeDate: relevantClose.closeDate,
              realizedPnL: pnl,
              predictedScore: score,
              predictedGood,
              wasGood,
            };
          }
          // Skip neutral predictions (40-60) - don't count as accurate or inaccurate
        }

        // Collect update instead of executing immediately
        if (wasAccurate !== null) {
          pendingUpdates.push({
            id: prediction.id,
            actualOutcome: JSON.stringify(actualOutcome),
            wasAccurate,
          });
          validated++;
          if (wasAccurate) accurate++;
        }
      } catch (predictionError) {
        // Log but don't throw - isolate errors per prediction
        console.error(`Error validating prediction ${prediction.id}:`, predictionError);
        errors++;
      }
    }

    // Batch execute all updates in parallel chunks (avoids N sequential round-trips)
    const BATCH_SIZE = 20;
    const resolvedAt = new Date();
    for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
      const batch = pendingUpdates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((u) =>
          prisma.wheelPrediction.update({
            where: { id: u.id },
            data: {
              actualOutcome: u.actualOutcome,
              wasAccurate: u.wasAccurate,
              resolvedAt,
            },
          })
        )
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          errors++;
        }
      }
    }
  } catch (error) {
    // Catch-all for any unexpected errors
    console.error('Error in validatePredictionsAfterDerivation:', error);
    errors++;
  }

  return { validated, accurate, errors };
}
