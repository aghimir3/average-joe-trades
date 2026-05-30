/**
 * Training Pipeline for Options ML Models
 * Orchestrates training of all model types
 */

import { prisma } from '@/lib/prisma';
import { trainVolatilityRegimeModel } from './volatility-regime';
import { trainEntryTimingModel } from './entry-timing';
import { trainExitStrategyModel } from './exit-strategy';
import { trainStrategyClassifierModel } from './strategy-classifier';
import { trainRiskAnalyzerModel } from './risk-analyzer';
import { trainTradeEmbedder } from './trade-similarity';
import type { OptionsModelType, TrainingResult } from './types';

// ============================================================================
// Training Pipeline
// ============================================================================

export interface TrainingReport {
  userId: string;
  results: TrainingResult[];
  trainedAt: Date;
  overallSuccess: boolean;
  modelsTrainedCount: number;
}

export async function trainAllOptionsModels(userId: string): Promise<TrainingReport> {
  const results: TrainingResult[] = [];
  const trainedAt = new Date();

  // Train each model type
  const modelTrainers: { type: OptionsModelType; train: () => Promise<TrainingResult> }[] = [
    {
      type: 'volatility-regime',
      train: async () => {
        const result = await trainVolatilityRegimeModel(userId);
        return { ...result, modelType: 'volatility-regime' as OptionsModelType };
      },
    },
    {
      type: 'entry-timing',
      train: async () => {
        const result = await trainEntryTimingModel(userId);
        return { ...result, modelType: 'entry-timing' as OptionsModelType };
      },
    },
    {
      type: 'exit-strategy',
      train: async () => {
        const result = await trainExitStrategyModel(userId);
        return { ...result, modelType: 'exit-strategy' as OptionsModelType };
      },
    },
    {
      type: 'strategy-classifier',
      train: async () => {
        const result = await trainStrategyClassifierModel(userId);
        return { ...result, modelType: 'strategy-classifier' as OptionsModelType };
      },
    },
    {
      type: 'risk-analyzer',
      train: async () => {
        const result = await trainRiskAnalyzerModel(userId);
        return { ...result, modelType: 'risk-analyzer' as OptionsModelType };
      },
    },
    {
      type: 'trade-embedder',
      train: async () => {
        const result = await trainTradeEmbedder(userId);
        return { ...result, modelType: 'trade-embedder' as OptionsModelType };
      },
    },
  ];

  for (const { train } of modelTrainers) {
    try {
      const result = await train();
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        modelType: 'volatility-regime', // Will be overwritten
        stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    userId,
    results,
    trainedAt,
    overallSuccess: successCount > 0,
    modelsTrainedCount: successCount,
  };
}

// ============================================================================
// Status & Readiness
// ============================================================================

export interface OptionsMLStatus {
  hasEnoughData: boolean;
  dataStats: {
    totalTrades: number;
    optionTrades: number;
    uniqueSymbols: number;
    strategiesUsed: number;
    dateRange: { start: string; end: string } | null;
  };
  modelInfo: {
    volatilityRegimeVersion: number | null;
    entryTimingVersion: number | null;
    exitStrategyVersion: number | null;
    strategyClassifierVersion: number | null;
    riskAnalyzerVersion: number | null;
    tradeEmbedderVersion: number | null;
    lastTrainedAt: string | null;
  };
}

export async function getOptionsMLStatus(userId: string): Promise<OptionsMLStatus> {
  const [totalTrades, optionTrades, uniqueSymbols, strategies, models, dateRange] = await Promise.all([
    prisma.realizedClose.count({ where: { userId, hasUnknownBasis: false } }),
    prisma.realizedClose.count({ where: { userId, closeType: 'option', hasUnknownBasis: false } }),
    prisma.realizedClose
      .groupBy({ by: ['symbol'], where: { userId, hasUnknownBasis: false } })
      .then((r) => r.length),
    prisma.realizedClose
      .groupBy({ by: ['strategy'], where: { userId, strategy: { not: null }, hasUnknownBasis: false } })
      .then((r) => r.length),
    prisma.optionsMLModel.findMany({
      where: { userId, isActive: true },
      select: { modelType: true, version: true, trainedAt: true },
    }),
    prisma.realizedClose.aggregate({
      where: { userId, hasUnknownBasis: false },
      _min: { openDate: true },
      _max: { closeDate: true },
    }),
  ]);

  const modelMap = new Map(models.map((m) => [m.modelType, { version: m.version, trainedAt: m.trainedAt }]));

  const lastTrainedAt = models.length > 0
    ? models.reduce((latest, m) => (m.trainedAt > latest ? m.trainedAt : latest), models[0].trainedAt)
    : null;

  return {
    hasEnoughData: totalTrades >= 30,
    dataStats: {
      totalTrades,
      optionTrades,
      uniqueSymbols,
      strategiesUsed: strategies,
      dateRange:
        dateRange._min.openDate && dateRange._max.closeDate
          ? {
              start: dateRange._min.openDate.toISOString().split('T')[0],
              end: dateRange._max.closeDate.toISOString().split('T')[0],
            }
          : null,
    },
    modelInfo: {
      volatilityRegimeVersion: modelMap.get('volatility-regime')?.version ?? null,
      entryTimingVersion: modelMap.get('entry-timing')?.version ?? null,
      exitStrategyVersion: modelMap.get('exit-strategy')?.version ?? null,
      strategyClassifierVersion: modelMap.get('strategy-classifier')?.version ?? null,
      riskAnalyzerVersion: modelMap.get('risk-analyzer')?.version ?? null,
      tradeEmbedderVersion: modelMap.get('trade-embedder')?.version ?? null,
      lastTrainedAt: lastTrainedAt?.toISOString() ?? null,
    },
  };
}

export interface TrainingReadiness {
  ready: boolean;
  tradeCount: number;
  optionTradeCount: number;
  recommendations: string[];
}

export async function checkOptionsTrainingReadiness(userId: string): Promise<TrainingReadiness> {
  const [totalTrades, optionTrades, strategyCounts] = await Promise.all([
    prisma.realizedClose.count({ where: { userId, hasUnknownBasis: false } }),
    prisma.realizedClose.count({ where: { userId, closeType: 'option', hasUnknownBasis: false } }),
    prisma.realizedClose.groupBy({
      by: ['strategy'],
      where: { userId, strategy: { not: null }, hasUnknownBasis: false },
      _count: true,
    }),
  ]);

  const recommendations: string[] = [];

  if (totalTrades < 30) {
    recommendations.push(`Need ${30 - totalTrades} more trades to train models`);
  }

  if (optionTrades < 20) {
    recommendations.push(`Need ${20 - optionTrades} more option trades for better predictions`);
  }

  if (strategyCounts.length < 3) {
    recommendations.push('Try more diverse strategies for better classifier training');
  }

  const lowStrategyTrades = strategyCounts.filter((s) => s._count < 5);
  if (lowStrategyTrades.length > 0) {
    recommendations.push(
      `Some strategies have few trades: ${lowStrategyTrades.map((s) => s.strategy).join(', ')}`
    );
  }

  return {
    ready: totalTrades >= 30,
    tradeCount: totalTrades,
    optionTradeCount: optionTrades,
    recommendations,
  };
}
