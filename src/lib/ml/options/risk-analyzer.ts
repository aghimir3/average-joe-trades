/**
 * Portfolio Risk Analyzer
 * Analyzes portfolio-level risk metrics and provides recommendations
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { extractRiskFeatures, RISK_ANALYZER_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel, logPrediction } from './model-storage';
import type { PortfolioRiskAnalysis, TrainingStats } from './types';

const NUM_FEATURES = RISK_ANALYZER_FEATURE_NAMES.length;

// ============================================================================
// Model Architecture
// ============================================================================

export function buildRiskAnalyzerModel(): tf.LayersModel {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.2 }),

      tf.layers.dense({
        units: 16,
        activation: 'relu',
      }),

      // Output: risk score (0-1)
      tf.layers.dense({
        units: 1,
        activation: 'sigmoid',
      }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

// ============================================================================
// Training
// ============================================================================

export async function trainRiskAnalyzerModel(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    // Get historical portfolio snapshots (simulated from trade history)
    const trades = await prisma.realizedClose.findMany({
      where: { userId, hasUnknownBasis: false },
      orderBy: { closeDate: 'asc' },
    });

    if (trades.length < 50) {
      return {
        success: false,
        stats: { tradesUsed: trades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 50 trades for risk training, found ${trades.length}`,
      };
    }

    const trainingData = prepareRiskTrainingData(trades);

    if (trainingData.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: 'Insufficient training data',
      };
    }

    const model = buildRiskAnalyzerModel();

    const split = temporalSplit(trainingData, {
      validationFraction: 0.2,
      minTrainRows: 20,
      minValidationRows: 5,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((d) => d.features));
    const trainYs = tf.tensor2d(split.trainRows.map((d) => [d.label]));
    const validationXs = tf.tensor2d(split.validationRows.map((d) => d.features));
    const validationYs = tf.tensor2d(split.validationRows.map((d) => [d.label]));

    const startTime = Date.now();
    const history = await model.fit(trainXs, trainYs, {
      epochs: 100,
      batchSize: Math.min(32, Math.floor(trainingData.length / 4)),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: tf.callbacks.earlyStopping({ patience: 10, monitor: 'val_loss' }),
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;
    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const validationLoss = getLastHistoryMetric(history, ['val_loss']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss,
      trainingTime,
    };

    await saveOptionsModel(userId, 'risk-analyzer', 'Portfolio Risk Analyzer', model, stats);

    trainXs.dispose();
    trainYs.dispose();
    validationXs.dispose();
    validationYs.dispose();
    model.dispose();

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
// Prediction
// ============================================================================

export async function analyzePortfolioRisk(userId: string): Promise<PortfolioRiskAnalysis> {
  const featureVector = await extractRiskFeatures(userId);
  const features = featureVector.features;

  const model = await loadOptionsModel(userId, 'risk-analyzer');

  let riskScore: number;

  if (model) {
    const inputTensor = tf.tensor2d([features]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    riskScore = (await prediction.data())[0];

    inputTensor.dispose();
    prediction.dispose();
  } else {
    riskScore = calculateStatisticalRisk(features);
  }

  // Scale to 1-10
  const scaledRiskScore = Math.round(riskScore * 9) + 1;

  // Calculate detailed metrics
  const metrics = calculateRiskMetrics(features);

  // Generate alerts
  const alerts = generateRiskAlerts(features, scaledRiskScore);

  // Generate recommendations
  const recommendations = generateRecommendations(features, alerts);

  const result: PortfolioRiskAnalysis = {
    riskScore: scaledRiskScore,
    riskLevel: getRiskLevel(scaledRiskScore),
    metrics,
    alerts,
    recommendations,
  };

  // Log prediction
  if (model) {
    const modelInfo = await prisma.optionsMLModel.findFirst({
      where: { userId, modelType: 'risk-analyzer', isActive: true },
      select: { version: true },
    });

    await logPrediction(userId, 'risk-analyzer', modelInfo?.version ?? 1, {
      predictionType: 'risk_score',
      prediction: result,
      confidence: 0.7,
    });
  }

  return result;
}

// ============================================================================
// Training Data
// ============================================================================

function prepareRiskTrainingData(
  trades: { symbol: string; realizedPnL: unknown; closeDate: Date; openAmount: unknown }[]
): { features: number[]; label: number }[] {
  const trainingData: { features: number[]; label: number }[] = [];

  // Simulate portfolio snapshots at different points in time
  for (let i = 20; i < trades.length; i += 5) {
    const historicalTrades = trades.slice(0, i);
    const futureTrades = trades.slice(i, Math.min(i + 10, trades.length));

    const features = calculateHistoricalRiskFeatures(historicalTrades);

    // Calculate risk label from future outcomes
    // Higher risk = more volatility and larger drawdowns
    const futureReturns = futureTrades.map((t) => {
      const cost = Math.max(1, Math.abs(Number(t.openAmount)));
      return cost > 0 ? Number(t.realizedPnL) / cost : 0;
    });

    const avgReturn = futureReturns.length > 0
      ? futureReturns.reduce((a, b) => a + b, 0) / futureReturns.length
      : 0;
    const returnVolatility = calculateVolatility(futureReturns);
    const maxDrawdown = Math.min(...futureReturns, 0);

    // Risk score: combine volatility and drawdown
    const riskLabel = Math.max(0, Math.min(1,
      returnVolatility * 2 + Math.abs(maxDrawdown) * 3 - avgReturn * 0.5
    ));

    trainingData.push({ features, label: riskLabel });
  }

  return trainingData;
}

function calculateHistoricalRiskFeatures(
  trades: { symbol: string; realizedPnL: unknown; openAmount: unknown }[]
): number[] {
  const features = new Array(NUM_FEATURES).fill(0.5);

  // Position count (simulated)
  features[0] = Math.min(1, trades.length / 50);

  // Win rate trend
  const recentTrades = trades.slice(-10);
  const olderTrades = trades.slice(-20, -10);
  const recentWinRate = recentTrades.filter((t) => Number(t.realizedPnL) > 0).length / (recentTrades.length || 1);
  const olderWinRate = olderTrades.filter((t) => Number(t.realizedPnL) > 0).length / (olderTrades.length || 1);
  features[10] = (recentWinRate - olderWinRate + 1) / 2;

  // Concentration
  const symbolCounts = new Map<string, number>();
  for (const trade of trades) {
    symbolCounts.set(trade.symbol, (symbolCounts.get(trade.symbol) || 0) + 1);
  }
  const counts = Array.from(symbolCounts.values()).sort((a, b) => b - a);
  const total = trades.length;
  features[4] = total > 0 ? counts[0] / total : 0;
  features[5] = total > 0 ? counts.slice(0, 3).reduce((a, b) => a + b, 0) / total : 0;

  return features;
}

// ============================================================================
// Helpers
// ============================================================================

function calculateStatisticalRisk(features: number[]): number {
  // Weighted combination of risk factors
  const concentration = features[4];
  const top3Concentration = features[5];
  const nearTermExposure = features[7];
  const drawdown = features[14];

  return (
    concentration * 0.25 +
    top3Concentration * 0.15 +
    nearTermExposure * 0.2 +
    drawdown * 0.25 +
    (1 - features[10]) * 0.15 // Inverse of win rate trend
  );
}

function calculateRiskMetrics(features: number[]): PortfolioRiskAnalysis['metrics'] {
  return {
    netDelta: (features[1] * 2 - 1) * 100, // Denormalize
    netTheta: (features[2] * 2 - 1) * 100,
    netVega: (features[3] * 2 - 1) * 100,
    concentration: features[4] * 100,
    correlationRisk: features[6] * 100,
    dteDistribution: {
      nearTerm: features[7] * 100,
      midTerm: features[8] * 100,
      longTerm: features[9] * 100,
    },
  };
}

function generateRiskAlerts(
  features: number[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for risk-score-based alert thresholds
  _riskScore: number
): PortfolioRiskAnalysis['alerts'] {
  const alerts: PortfolioRiskAnalysis['alerts'] = [];

  // Concentration alert
  if (features[4] > 0.3) {
    alerts.push({
      type: 'CONCENTRATION',
      severity: features[4] > 0.5 ? 'critical' : 'warning',
      message: `Top position is ${(features[4] * 100).toFixed(0)}% of portfolio`,
    });
  }

  // Near-term exposure
  if (features[7] > 0.4) {
    alerts.push({
      type: 'EXPIRATION_CLUSTER',
      severity: features[7] > 0.6 ? 'critical' : 'warning',
      message: `${(features[7] * 100).toFixed(0)}% of positions expiring in < 7 days`,
    });
  }

  // Drawdown
  if (features[14] > 0.2) {
    alerts.push({
      type: 'DRAWDOWN',
      severity: features[14] > 0.4 ? 'critical' : 'warning',
      message: `Portfolio is ${(features[14] * 100).toFixed(0)}% below peak`,
    });
  }

  // Win rate declining
  if (features[10] < 0.4) {
    alerts.push({
      type: 'PERFORMANCE',
      severity: 'info',
      message: 'Recent win rate below historical average',
    });
  }

  return alerts;
}

function generateRecommendations(
  features: number[],
  alerts: PortfolioRiskAnalysis['alerts']
): string[] {
  const recommendations: string[] = [];

  for (const alert of alerts) {
    if (alert.type === 'CONCENTRATION') {
      recommendations.push('Consider diversifying across more symbols');
    }
    if (alert.type === 'EXPIRATION_CLUSTER') {
      recommendations.push('Spread out expiration dates to reduce gamma risk');
    }
    if (alert.type === 'DRAWDOWN') {
      recommendations.push('Reduce position sizes until performance improves');
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Portfolio risk levels appear healthy');
  }

  return recommendations;
}

function getRiskLevel(score: number): PortfolioRiskAnalysis['riskLevel'] {
  if (score <= 3) return 'low';
  if (score <= 5) return 'moderate';
  if (score <= 7) return 'elevated';
  return 'high';
}

function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / returns.length;
  return Math.sqrt(variance);
}
