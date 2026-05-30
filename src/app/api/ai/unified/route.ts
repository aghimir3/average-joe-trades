import { apiJson } from '@/lib/api/response';
/**
 * Unified AI Status API
 *
 * Aggregates status from all ML endpoints for the AI Command Center hero section.
 *
 * GET /api/ai/unified?accountId=xxx
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { getStockModelStatus } from '@/lib/ml/stocks';
import { buildAccountScope } from '@/lib/db/account-scope';
import { aiInsightsRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

interface UnifiedAIStatus {
  totalModelsActive: number;
  totalModelsPossible: number;
  overallConfidence: 'high' | 'medium' | 'low';
  pendingActions: number;
  lastUpdated: string;
  urgentMessage: string | null;
  topOpportunity: { symbol: string; score: number } | null;
  wheelModelsReady: boolean;
  optionsModelsReady: boolean;
  communityModelReady: boolean;
  stockModelsReady: boolean;
  quantModelsReady: boolean;
  advanced?: {
    wheelModels: Array<{
      type: string;
      version: number;
      loss: number | null;
      accuracy: number | null;
      trainedAt: string;
      tradesUsed: number;
      staleDays: number;
    }>;
    communityModel: {
      version: number;
      trainedAt: string;
      tickersUsed: number | null;
      uniqueUsers: number | null;
    } | null;
  };
}

const BASE_MODEL_FAMILIES = new Set(['wheel', 'options', 'community', 'stocks', 'stock']);

function normalizeModelFamily(modelFamily: string): string {
  return modelFamily.trim().toLowerCase();
}

const unifiedStatusSchema = z.object({
  totalModelsActive: z.number().int().nonnegative(),
  totalModelsPossible: z.number().int().positive(),
  overallConfidence: z.enum(['high', 'medium', 'low']),
  pendingActions: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
  urgentMessage: z.string().nullable(),
  topOpportunity: z.object({ symbol: z.string(), score: z.number() }).nullable(),
  wheelModelsReady: z.boolean(),
  optionsModelsReady: z.boolean(),
  communityModelReady: z.boolean(),
  stockModelsReady: z.boolean(),
  quantModelsReady: z.boolean(),
  advanced: z.object({
    wheelModels: z.array(z.object({
      type: z.string(),
      version: z.number(),
      loss: z.number().nullable(),
      accuracy: z.number().nullable(),
      trainedAt: z.string().datetime(),
      tradesUsed: z.number(),
      staleDays: z.number(),
    })),
    communityModel: z.object({
      version: z.number(),
      trainedAt: z.string().datetime(),
      tickersUsed: z.number().nullable(),
      uniqueUsers: z.number().nullable(),
    }).nullable(),
  }).optional(),
});

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      accountId: searchParams.get('accountId') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid accountId parameter' },
        { status: 400 }
      );
    }
    const { accountId } = parsedQuery.data;
    const rate = aiInsightsRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);
    const accountScope = buildAccountScope(accountId);

    // Fetch wheel model status
    const wheelModels = await prisma.wheelMLModel.findMany({
      where: { userId, isActive: true },
      select: { modelType: true, version: true, trainedAt: true, loss: true, tradesUsed: true, accuracy: true },
    });

    // Fetch options model status
    const optionsModels = await prisma.optionsMLModel.findMany({
      where: { userId, isActive: true },
      select: { modelName: true, version: true, trainedAt: true },
    });

    // Check community model
    const communityModel = await prisma.communityMLModel.findFirst({
      where: { isActive: true },
      select: { trainedAt: true, version: true, tickersUsed: true, uniqueUsers: true },
    });

    // Check stock model readiness
    const stockModelStatus = await getStockModelStatus(userId);

    const quantRegistryModels = await prisma.quantModelRegistry.findMany({
      where: {
        OR: [
          { scope: 'community', isStable: true },
          { scope: 'personal', userId, isStable: true },
        ],
      },
      select: { modelFamily: true, modelName: true },
    });

    // Count pending roll alerts (positions expiring within 7 days)
    const nearExpiryPositions = await prisma.derivedPosition.count({
      where: {
        userId,
        strategy: { in: ['covered_call', 'cash_secured_put'] },
        positionType: 'option',
        expiration: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          gte: new Date(),
        },
        ...accountScope,
      },
    });

    // Calculate model counts using unique model types (handles duplicates)
    // Wheel models: candidate-ranker, strike-optimizer, roll-advisor (3 types)
    // Options models: volatility-regime, entry-timing, exit-strategy, strategy-classifier,
    //                 risk-analyzer, trade-similarity-embedder (6 types)
    // Community model (1)
    const uniqueWheelTypes = new Set(wheelModels.map(m => m.modelType));
    const uniqueOptionsTypes = new Set(optionsModels.map(m => m.modelName));
    const wheelModelCount = uniqueWheelTypes.size;
    const optionsModelCount = uniqueOptionsTypes.size;
    const communityModelCount = communityModel ? 1 : 0;
    const stockModelCount = stockModelStatus.ready ? 1 : 0;
    // Quant registry mostly mirrors wheel/options/community/stocks model families.
    // Count only quant-only families to avoid double counting the same models.
    const quantOnlyModelCount = new Set(
      quantRegistryModels
        .filter((model) => !BASE_MODEL_FAMILIES.has(normalizeModelFamily(model.modelFamily)))
        .map((model) => `${normalizeModelFamily(model.modelFamily)}:${model.modelName.trim().toLowerCase()}`)
    ).size;

    const baseModelsPossible = 14;
    const totalModelsActive = wheelModelCount + optionsModelCount + communityModelCount + stockModelCount + quantOnlyModelCount;
    const totalModelsPossible = baseModelsPossible + quantOnlyModelCount;

    // Determine overall confidence based on model coverage
    let overallConfidence: 'high' | 'medium' | 'low';
    if (totalModelsActive >= 6) {
      overallConfidence = 'high';
    } else if (totalModelsActive >= 3) {
      overallConfidence = 'medium';
    } else {
      overallConfidence = 'low';
    }

    // Generate urgent message
    let urgentMessage: string | null = null;
    if (nearExpiryPositions > 0) {
      urgentMessage = `${nearExpiryPositions} position${nearExpiryPositions > 1 ? 's' : ''} expiring within 7 days`;
    } else if (totalModelsActive === 0) {
      urgentMessage = 'Train your models to unlock AI-powered insights';
    }

    // Get last updated from most recent model
    const allUpdates = [
      ...wheelModels.map(m => m.trainedAt),
      ...optionsModels.map(m => m.trainedAt),
      communityModel?.trainedAt,
    ].filter(Boolean) as Date[];

    const lastUpdated = allUpdates.length > 0
      ? new Date(Math.max(...allUpdates.map(d => d.getTime()))).toISOString()
      : new Date().toISOString();

    const status: UnifiedAIStatus = {
      totalModelsActive,
      totalModelsPossible,
      overallConfidence,
      pendingActions: nearExpiryPositions,
      lastUpdated,
      urgentMessage,
      topOpportunity: null, // Would come from rankings
      wheelModelsReady: wheelModelCount >= 3,
      optionsModelsReady: optionsModelCount >= 3,
      communityModelReady: !!communityModel,
      stockModelsReady: stockModelStatus.ready,
      quantModelsReady: quantRegistryModels.length > 0,
      advanced: {
        wheelModels: wheelModels.map(m => ({
          type: m.modelType,
          version: m.version,
          loss: m.loss ? Number(m.loss) : null,
          accuracy: m.accuracy ? Number(m.accuracy) : null,
          trainedAt: m.trainedAt.toISOString(),
          tradesUsed: m.tradesUsed ?? 0,
          staleDays: Math.floor((Date.now() - m.trainedAt.getTime()) / 86_400_000),
        })),
        communityModel: communityModel ? {
          version: communityModel.version,
          trainedAt: communityModel.trainedAt.toISOString(),
          tickersUsed: communityModel.tickersUsed,
          uniqueUsers: communityModel.uniqueUsers,
        } : null,
      },
    };

    const validated = unifiedStatusSchema.parse(status);
    return apiJson({ data: validated });
  } catch (error) {
    log.error({ error }, 'Failed to fetch unified AI status');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch AI status' },
      { status: 500 }
    );
  }
}

