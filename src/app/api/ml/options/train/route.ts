import { apiJson } from '@/lib/api/response';
/**
 * ML Options Training API
 * POST /api/ml/options/train
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { ML_OPTIONS_ENABLED } from '@/lib/ml/options/config';
import {
  trainAllOptionsModels,
  checkOptionsTrainingReadiness,
  validateOptionsPredictionsAfterDerivation,
} from '@/lib/ml/options';
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

export async function POST() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  // Check if ML options feature is enabled
  if (!ML_OPTIONS_ENABLED) {
    return apiJson(
      { error: 'Feature Disabled', message: 'ML options training is currently disabled' },
      { status: 503 }
    );
  }

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const rate = mlTrainingRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    log.info({ userId }, 'Starting ML options training');

    // Check readiness first
    const readiness = await checkOptionsTrainingReadiness(userId);

    if (!readiness.ready) {
      return apiJson(
        {
          error: 'Insufficient data',
          message: 'Not enough trading data to train models',
          details: readiness,
        },
        { status: 400 }
      );
    }

    // Train all models
    const report = await trainAllOptionsModels(userId);

    try {
      await validateOptionsPredictionsAfterDerivation(userId);

      const resolvedSamples = await prisma.mLPredictionLog.findMany({
        where: {
          userId,
          resolvedAt: { not: null },
          confidence: { not: null },
          wasAccurate: { not: null },
        },
        select: {
          modelType: true,
          confidence: true,
          wasAccurate: true,
        },
        orderBy: { resolvedAt: 'desc' },
        take: 1500,
      });
      const samplesByModel = new Map<string, Array<{ confidence: number; wasAccurate: boolean }>>();
      for (const sample of resolvedSamples) {
        const key = sample.modelType;
        const existing = samplesByModel.get(key) ?? [];
        existing.push({
          confidence: Number(sample.confidence),
          wasAccurate: Boolean(sample.wasAccurate),
        });
        samplesByModel.set(key, existing);
      }

      const activeModels = await prisma.optionsMLModel.findMany({
        where: { userId, isActive: true },
        select: {
          modelType: true,
          version: true,
          modelName: true,
          tradesUsed: true,
          trainedAt: true,
          accuracy: true,
          loss: true,
          valLoss: true,
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
          modelFamily: 'options',
          modelName: model.modelType,
        });
        const baseline = parseBaselineMetrics(baselineRow?.metricsSnapshot ?? null);
        const gateDecision = evaluatePromotionGate({
          current: {
            loss: Number(model.loss),
            validationLoss: model.valLoss ? Number(model.valLoss) : null,
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
          modelFamily: 'options',
          modelName: model.modelType,
          semanticVersion: `1.0.${model.version}`,
          featureSchemaVersion: 'options-v1',
          trainingDatasetHash: hashTrainingDataset({
            modelType: model.modelType,
            version: model.version,
            tradesUsed: model.tradesUsed ?? 0,
            trainedAt: model.trainedAt.toISOString(),
          }),
          status: gateDecision.status,
          isStable: gateDecision.pass,
          trainedAt: model.trainedAt,
          metricsSnapshot: {
            accuracy: model.accuracy ? Number(model.accuracy) : null,
            loss: Number(model.loss),
            valLoss: model.valLoss ? Number(model.valLoss) : null,
            tradesUsed: model.tradesUsed ?? 0,
          },
          metadata: {
            sourceModelName: model.modelName,
            promotionGate: gateDecision,
          },
        });

        if (registryRow) {
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
        }

        promotionSummary.push({
          modelType: model.modelType,
          status: gateDecision.status,
          reasons: gateDecision.reasons,
        });
      }

      log.info({ userId, promotionSummary }, 'Options model promotion gates evaluated');
    } catch (registryError) {
      log.warn({ userId, registryError }, 'Options model registry sync failed');
    }

    log.info(
      { userId, modelsTrainedCount: report.modelsTrainedCount, overallSuccess: report.overallSuccess },
      'ML options training completed'
    );

    return apiJson({
      data: {
        success: report.overallSuccess,
        modelsTrainedCount: report.modelsTrainedCount,
        trainedAt: report.trainedAt.toISOString(),
        results: report.results.map((r) => ({
          modelType: r.modelType,
          success: r.success,
          tradesUsed: r.stats.tradesUsed,
          epochs: r.stats.epochs,
          error: r.error,
        })),
      },
    });
  } catch (error) {
    log.error({ error }, 'ML options training failed');
    return apiJson(
      { error: 'Internal Server Error', message: 'Training failed' },
      { status: 500 }
    );
  }
}

