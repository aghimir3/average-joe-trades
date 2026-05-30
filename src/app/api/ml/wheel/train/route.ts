import { apiJson } from '@/lib/api/response';
/**
 * POST /api/ml/wheel/train
 * Triggers model training for the authenticated user
 * GET /api/ml/wheel/train
 * Returns training status and readiness
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { trainAllModels, getMLStatus, checkTrainingReadiness } from '@/lib/ml/wheel';
import { deleteAllModels, clearModelCache, validatePredictionsAfterDerivation } from '@/lib/ml/wheel/model-storage';
import { prisma } from '@/lib/prisma';
import {
  evaluatePromotionGate,
  getLatestStableModel,
  hashTrainingDataset,
  recordModelEvaluation,
  registerModelVersion,
} from '@/lib/quant/governance';
import { mlTrainingRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { parseBaselineMetrics } from '@/lib/ml/governance-utils';

function extractWheelPredictionConfidence(
  predictionType: string,
  predictionJson: string
): number | null {
  try {
    const parsed = JSON.parse(predictionJson) as unknown;
    if (predictionType === 'ranking' && Array.isArray(parsed) && parsed.length > 0) {
      const top = parsed[0] as Record<string, unknown>;
      const explicitConfidence = Number(top.confidence);
      if (Number.isFinite(explicitConfidence)) return explicitConfidence > 1 ? explicitConfidence / 100 : explicitConfidence;
      const score = Number(top.score);
      if (Number.isFinite(score)) return Math.max(0, Math.min(1, score / 100));
      return null;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const payload = parsed as Record<string, unknown>;
      if (predictionType === 'strike_dte') {
        const pop = Number(payload.probabilityOfProfit);
        return Number.isFinite(pop) ? Math.max(0, Math.min(1, pop)) : null;
      }
      if (predictionType === 'roll') {
        const confidence = Number(payload.confidence);
        return Number.isFinite(confidence)
          ? (confidence > 1 ? Math.max(0, Math.min(1, confidence / 100)) : Math.max(0, Math.min(1, confidence)))
          : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getValidationLossFromTrainingStats(trainingStats: string | null): number | null {
  if (!trainingStats) return null;
  try {
    const parsed = JSON.parse(trainingStats) as Record<string, unknown>;
    const valLoss = Number(parsed.validationLoss);
    return Number.isFinite(valLoss) ? valLoss : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Getting ML training status');

    const status = await getMLStatus(userId);
    const readiness = await checkTrainingReadiness(userId);

    return apiJson({
      status,
      readiness,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get training status');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get training status' },
      { status: 500 }
    );
  }
}

export async function POST() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlTrainingRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    log.info({ userId }, 'Training wheel ML models');

    // Check readiness first
    const readiness = await checkTrainingReadiness(userId);
    if (!readiness.ready) {
      return apiJson(
        {
          error: 'Not Ready',
          message: 'Not enough data to train models',
          recommendations: readiness.recommendations,
        },
        { status: 400 }
      );
    }

    // Train all models
    const report = await trainAllModels(userId);

    // Register model versions for governance/audit (best-effort)
    try {
      await validatePredictionsAfterDerivation(userId);

      const resolvedPredictions = await prisma.wheelPrediction.findMany({
        where: {
          userId,
          resolvedAt: { not: null },
          wasAccurate: { not: null },
        },
        select: {
          predictionType: true,
          prediction: true,
          wasAccurate: true,
        },
        orderBy: { resolvedAt: 'desc' },
        take: 1500,
      });
      const samplesByModel = new Map<string, Array<{ confidence: number; wasAccurate: boolean }>>();
      const predictionTypeToModelType: Record<string, string> = {
        ranking: 'candidate-ranker',
        strike_dte: 'strike-optimizer',
        roll: 'roll-advisor',
      };
      for (const prediction of resolvedPredictions) {
        const modelType = predictionTypeToModelType[prediction.predictionType];
        if (!modelType) continue;
        const confidence = extractWheelPredictionConfidence(prediction.predictionType, prediction.prediction);
        if (confidence === null) continue;
        const existing = samplesByModel.get(modelType) ?? [];
        existing.push({
          confidence,
          wasAccurate: Boolean(prediction.wasAccurate),
        });
        samplesByModel.set(modelType, existing);
      }

      const activeModels = await prisma.wheelMLModel.findMany({
        where: { userId, isActive: true },
        select: {
          modelType: true,
          version: true,
          tradesUsed: true,
          trainedAt: true,
          accuracy: true,
          loss: true,
          trainingStats: true,
        },
      });

      const promotionSummary: Array<{
        modelType: string;
        status: 'stable' | 'draft';
        reasons: string[];
      }> = [];

      for (const model of activeModels) {
        const baselineRow = await getLatestStableModel({
          scope: 'personal',
          userId,
          modelFamily: 'wheel',
          modelName: model.modelType,
        });
        const baseline = parseBaselineMetrics(baselineRow?.metricsSnapshot ?? null);
        const gateDecision = evaluatePromotionGate({
          current: {
            loss: Number(model.loss),
            validationLoss: getValidationLossFromTrainingStats(model.trainingStats),
            accuracy: model.accuracy ? Number(model.accuracy) : null,
            tradesUsed: model.tradesUsed ?? 0,
          },
          calibrationSamples: samplesByModel.get(model.modelType) ?? [],
          baseline,
          minTrades: 20,
          minCalibrationSamples: 20,
        });

        const registryRow = await registerModelVersion({
          userId,
          scope: 'personal',
          modelFamily: 'wheel',
          modelName: model.modelType,
          semanticVersion: `1.0.${model.version}`,
          featureSchemaVersion: 'wheel-v1',
          trainingDatasetHash: hashTrainingDataset({
            modelType: model.modelType,
            tradesUsed: model.tradesUsed ?? 0,
            version: model.version,
            trainedAt: model.trainedAt.toISOString(),
          }),
          status: gateDecision.status,
          isStable: gateDecision.pass,
          trainedAt: model.trainedAt,
          metricsSnapshot: {
            accuracy: model.accuracy ? Number(model.accuracy) : null,
            loss: Number(model.loss),
            tradesUsed: model.tradesUsed ?? 0,
          },
          metadata: {
            promotionGate: gateDecision,
          },
        });

        await Promise.all([
          recordModelEvaluation({
            userId,
            modelRegistryId: registryRow.id,
            evaluationType: 'oos',
            metrics: {
              ...gateDecision.oos,
              pass: gateDecision.oos.pass,
            },
          }),
          recordModelEvaluation({
            userId,
            modelRegistryId: registryRow.id,
            evaluationType: 'calibration',
            metrics: {
              ...gateDecision.calibration,
              pass: gateDecision.calibration.pass,
            },
            calibrationScore: gateDecision.calibration.score,
          }),
          recordModelEvaluation({
            userId,
            modelRegistryId: registryRow.id,
            evaluationType: 'drift',
            metrics: {
              ...gateDecision.drift,
              pass: gateDecision.drift.pass,
            },
            driftScore: gateDecision.drift.score,
          }),
        ]);

        promotionSummary.push({
          modelType: model.modelType,
          status: gateDecision.status,
          reasons: gateDecision.reasons,
        });
      }

      log.info({ userId, promotionSummary }, 'Wheel model promotion gates evaluated');
    } catch (registryError) {
      log.warn({ registryError, userId }, 'Wheel model registry sync failed');
    }

    log.info(
      {
        userId,
        successCount: report.reports.filter((r) => r.success).length,
        totalModels: report.reports.length,
      },
      'Training completed'
    );

    return apiJson({
      success: true,
      report,
    });
  } catch (error) {
    log.error({ error }, 'Failed to train models');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to train models' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ml/wheel/train
 * Clears all trained models for the user (useful for retraining from scratch)
 */
export async function DELETE() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlTrainingRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    log.info({ userId }, 'Deleting all wheel ML models');

    // Clear cache first
    clearModelCache(userId);

    // Delete from database
    const deletedCount = await deleteAllModels(userId);

    log.info({ userId, deletedCount }, 'Models deleted');

    return apiJson({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} model(s). You can now retrain.`,
    });
  } catch (error) {
    log.error({ error }, 'Failed to delete models');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete models' },
      { status: 500 }
    );
  }
}

