/**
 * Training Pipeline for Wheel Strategy ML Models
 * Orchestrates training of all three models for a user
 */

import { prisma } from '@/lib/prisma';
import { trainCandidateRanker } from './candidate-ranker';
import { trainStrikeOptimizer } from './strike-optimizer';
import { trainRollAdvisor } from './roll-advisor';
import { getAllModelInfo } from './model-storage';
import type { TrainingReport, ModelReport, TrainingStats } from './types';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'wheel-training-pipeline' });

/**
 * Train all wheel ML models for a user
 * Returns a report with success/failure status for each model
 */
export async function trainAllModels(userId: string): Promise<TrainingReport> {
  const reports: ModelReport[] = [];

  // Get wheel trade count for logging
  const wheelTradeCount = await prisma.realizedClose.count({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
  });

  log.info({ userId, wheelTradeCount }, 'Starting wheel ML model training');

  // 1. Train Candidate Ranker (needs 30+ trades)
  log.info({ userId }, 'Training candidate ranker');
  let rankerResult: { success: boolean; stats: TrainingStats; error?: string };
  try {
    rankerResult = await trainCandidateRanker(userId);
  } catch (err) {
    log.error({ err, userId, model: 'candidate-ranker' }, 'Unexpected training crash');
    rankerResult = { success: false, stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 }, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
  reports.push({
    modelType: 'candidate-ranker',
    success: rankerResult.success,
    stats: rankerResult.stats,
    error: rankerResult.error,
  });

  // 2. Train Strike Optimizer (needs 50+ trades with strike data)
  log.info({ userId }, 'Training strike optimizer');
  let strikeResult: { success: boolean; stats: TrainingStats; error?: string };
  try {
    strikeResult = await trainStrikeOptimizer(userId);
  } catch (err) {
    log.error({ err, userId, model: 'strike-optimizer' }, 'Unexpected training crash');
    strikeResult = { success: false, stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 }, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
  reports.push({
    modelType: 'strike-optimizer',
    success: strikeResult.success,
    stats: strikeResult.stats,
    error: strikeResult.error,
  });

  // 3. Train Roll Advisor (needs 20+ trades)
  log.info({ userId }, 'Training roll advisor');
  let rollResult: { success: boolean; stats: TrainingStats; error?: string };
  try {
    rollResult = await trainRollAdvisor(userId);
  } catch (err) {
    log.error({ err, userId, model: 'roll-advisor' }, 'Unexpected training crash');
    rollResult = { success: false, stats: { tradesUsed: 0, epochs: 0, finalLoss: 0 }, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
  reports.push({
    modelType: 'roll-advisor',
    success: rollResult.success,
    stats: rollResult.stats,
    error: rollResult.error,
  });

  const successCount = reports.filter((r) => r.success).length;
  log.info({ userId, successCount, totalModels: reports.length }, 'Wheel ML training completed');

  return {
    userId,
    reports,
    trainedAt: new Date(),
  };
}

/**
 * Check if a user has enough data to train models
 */
export async function checkTrainingReadiness(userId: string): Promise<{
  ready: boolean;
  wheelTradeCount: number;
  strikeDataCount: number;
  recommendations: string[];
}> {
  const wheelTradeCount = await prisma.realizedClose.count({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
  });

  const strikeDataCount = await prisma.realizedClose.count({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      strike: { not: null },
      hasUnknownBasis: false,
    },
  });

  const recommendations: string[] = [];

  if (wheelTradeCount < 30) {
    recommendations.push(
      `Need ${30 - wheelTradeCount} more wheel trades for basic ML insights`
    );
  }

  if (strikeDataCount < 50) {
    recommendations.push(
      `Need ${50 - strikeDataCount} more trades with strike data for strike optimizer`
    );
  }

  if (wheelTradeCount < 20) {
    recommendations.push(`Need ${20 - wheelTradeCount} more trades for roll advisor`);
  }

  return {
    ready: wheelTradeCount >= 20,
    wheelTradeCount,
    strikeDataCount,
    recommendations,
  };
}

/**
 * Get comprehensive ML status for a user
 */
export async function getMLStatus(userId: string): Promise<{
  hasEnoughData: boolean;
  dataStats: {
    totalWheelTrades: number;
    uniqueSymbols: number;
    dateRange: { start: string; end: string } | null;
  };
  modelInfo: {
    candidateRankerVersion: number | null;
    strikeOptimizerVersion: number | null;
    rollAdvisorVersion: number | null;
    lastTrainedAt: string | null;
  };
  trainingReadiness: {
    ready: boolean;
    recommendations: string[];
  };
}> {
  // Get wheel trade stats
  const wheelTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      strategy: { in: ['cash_secured_put', 'covered_call'] },
      hasUnknownBasis: false,
    },
    select: {
      symbol: true,
      closeDate: true,
    },
    orderBy: { closeDate: 'asc' },
  });

  const uniqueSymbols = new Set(wheelTrades.map((t) => t.symbol)).size;
  const dateRange =
    wheelTrades.length > 0
      ? {
          start: new Date(wheelTrades[0].closeDate).toISOString().split('T')[0],
          end: new Date(wheelTrades[wheelTrades.length - 1].closeDate)
            .toISOString()
            .split('T')[0],
        }
      : null;

  // Get model info
  const modelInfo = await getAllModelInfo(userId);

  // Check training readiness
  const readiness = await checkTrainingReadiness(userId);

  return {
    hasEnoughData: wheelTrades.length >= 20,
    dataStats: {
      totalWheelTrades: wheelTrades.length,
      uniqueSymbols,
      dateRange,
    },
    modelInfo,
    trainingReadiness: {
      ready: readiness.ready,
      recommendations: readiness.recommendations,
    },
  };
}

