import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'quant-model-registry' });

export type ModelScope = 'personal' | 'community';
export type ModelLifecycleStatus = 'draft' | 'stable' | 'archived';

export interface RegisterModelInput {
  userId?: string | null;
  scope: ModelScope;
  modelFamily: string;
  modelName: string;
  semanticVersion: string;
  featureSchemaVersion: string;
  trainingDatasetHash: string;
  status?: ModelLifecycleStatus;
  isStable?: boolean;
  trainedAt?: Date | null;
  metricsSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordEvaluationInput {
  userId?: string | null;
  modelRegistryId: string;
  evaluationType: 'walk_forward' | 'oos' | 'calibration' | 'drift';
  windowStart?: Date;
  windowEnd?: Date;
  metrics: Record<string, unknown>;
  calibrationScore?: number | null;
  driftScore?: number | null;
}

export function hashTrainingDataset(rows: unknown): string {
  const payload = typeof rows === 'string' ? rows : JSON.stringify(rows);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function registerModelVersion(input: RegisterModelInput) {
  const row = await prisma.quantModelRegistry.create({
    data: {
      userId: input.userId ?? null,
      scope: input.scope,
      modelFamily: input.modelFamily,
      modelName: input.modelName,
      semanticVersion: input.semanticVersion,
      featureSchemaVersion: input.featureSchemaVersion,
      trainingDatasetHash: input.trainingDatasetHash,
      status: input.status ?? 'draft',
      isStable: input.isStable ?? false,
      trainedAt: input.trainedAt ?? null,
      metricsSnapshot: input.metricsSnapshot ? JSON.stringify(input.metricsSnapshot) : null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  if (row.isStable) {
    await setStableModel({
      scope: input.scope,
      userId: input.userId ?? null,
      modelFamily: input.modelFamily,
      modelName: input.modelName,
      semanticVersion: input.semanticVersion,
    });
  }

  return row;
}

export async function setStableModel(input: {
  scope: ModelScope;
  userId?: string | null;
  modelFamily: string;
  modelName: string;
  semanticVersion: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.quantModelRegistry.updateMany({
      where: {
        scope: input.scope,
        userId: input.userId ?? null,
        modelFamily: input.modelFamily,
        modelName: input.modelName,
      },
      data: {
        isStable: false,
      },
    }),
    prisma.quantModelRegistry.updateMany({
      where: {
        scope: input.scope,
        userId: input.userId ?? null,
        modelFamily: input.modelFamily,
        modelName: input.modelName,
        semanticVersion: input.semanticVersion,
      },
      data: {
        isStable: true,
        status: 'stable',
      },
    }),
  ]);
}

export async function getLatestStableModel(input: {
  scope: ModelScope;
  userId?: string | null;
  modelFamily: string;
  modelName: string;
}) {
  return prisma.quantModelRegistry.findFirst({
    where: {
      scope: input.scope,
      userId: input.userId ?? null,
      modelFamily: input.modelFamily,
      modelName: input.modelName,
      isStable: true,
      status: { in: ['stable', 'draft'] },
    },
    orderBy: [{ trainedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function recordModelEvaluation(input: RecordEvaluationInput) {
  return prisma.quantModelEvaluation.create({
    data: {
      userId: input.userId ?? null,
      modelRegistryId: input.modelRegistryId,
      evaluationType: input.evaluationType,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      metrics: JSON.stringify(input.metrics),
      calibrationScore: input.calibrationScore ?? null,
      driftScore: input.driftScore ?? null,
    },
  });
}

export async function getModelHealthSummary(userId: string) {
  const models = await prisma.quantModelRegistry.findMany({
    where: {
      OR: [
        { scope: 'community' },
        { scope: 'personal', userId },
      ],
    },
    include: {
      evaluations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { trainedAt: 'desc' },
  });

  return models.map((model) => {
    const latestEval = model.evaluations[0] ?? null;
    let metricsSnapshot: Record<string, unknown> | null = null;
    let latestEvalMetrics: Record<string, unknown> | null = null;
    try {
      metricsSnapshot = model.metricsSnapshot ? JSON.parse(model.metricsSnapshot) as Record<string, unknown> : null;
    } catch {
      metricsSnapshot = null;
    }
    try {
      latestEvalMetrics = latestEval?.metrics ? JSON.parse(latestEval.metrics) as Record<string, unknown> : null;
    } catch {
      latestEvalMetrics = null;
    }

    return {
      id: model.id,
      scope: model.scope,
      modelFamily: model.modelFamily,
      modelName: model.modelName,
      semanticVersion: model.semanticVersion,
      featureSchemaVersion: model.featureSchemaVersion,
      trainedAt: model.trainedAt?.toISOString() ?? null,
      isStable: model.isStable,
      status: model.status,
      metricsSnapshot,
      latestEvaluation: latestEval
        ? {
            evaluationType: latestEval.evaluationType,
            createdAt: latestEval.createdAt.toISOString(),
            calibrationScore: latestEval.calibrationScore ? Number(latestEval.calibrationScore) : null,
            driftScore: latestEval.driftScore ? Number(latestEval.driftScore) : null,
            metrics: latestEvalMetrics,
          }
        : null,
    };
  });
}

export async function ensureBaselineRegistryEntries(userId: string): Promise<void> {
  const existing = await prisma.quantModelRegistry.count({
    where: {
      scope: 'personal',
      userId,
      modelFamily: 'stocks',
      modelName: 'stock_trend_v1',
    },
  });

  if (existing > 0) return;

  const datasetHash = hashTrainingDataset(`bootstrap-${userId}`);
  await registerModelVersion({
    userId,
    scope: 'personal',
    modelFamily: 'stocks',
    modelName: 'stock_trend_v1',
    semanticVersion: '1.0.0',
    featureSchemaVersion: 'stock-v1',
    trainingDatasetHash: datasetHash,
    status: 'draft',
    isStable: true,
    trainedAt: new Date(),
    metricsSnapshot: {
      note: 'Bootstrap registry entry created before first full walk-forward run',
    },
  });

  log.info({ userId }, 'Created baseline quant registry entry');
}

