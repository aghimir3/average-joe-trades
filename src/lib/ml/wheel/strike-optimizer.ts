/**
 * Strike/DTE Optimizer Model for Wheel Strategy
 * Recommends optimal strike and DTE for CSP or covered call trades
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import {
  extractStrikeFeatures,
  strikeFeaturesToArray,
  STRIKE_FEATURE_NAMES,
} from './feature-engineering';
import { saveModelToSQL, loadModelFromSQL, storePrediction } from './model-storage';
import type { StrikeDteRecommendation, TrainingStats } from './types';

const NUM_FEATURES = STRIKE_FEATURE_NAMES.length;

/**
 * Build the strike optimizer neural network
 * Multi-output model predicting strike%, DTE, and expected return
 */
export async function buildStrikeOptimizer(): Promise<tf.LayersModel> {
  // Functional API for multi-output
  const input = tf.input({ shape: [NUM_FEATURES] });

  // Shared layers
  const dense1 = tf.layers
    .dense({
      units: 64,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    })
    .apply(input) as tf.SymbolicTensor;

  const dropout1 = tf.layers.dropout({ rate: 0.2 }).apply(dense1) as tf.SymbolicTensor;

  const dense2 = tf.layers
    .dense({
      units: 32,
      activation: 'relu',
    })
    .apply(dropout1) as tf.SymbolicTensor;

  const dense3 = tf.layers
    .dense({
      units: 16,
      activation: 'relu',
    })
    .apply(dense2) as tf.SymbolicTensor;

  // Multi-output heads
  const strikeOutput = tf.layers
    .dense({
      units: 1,
      activation: 'sigmoid', // 0-1 representing % OTM (0-20%)
      name: 'strike_percent',
    })
    .apply(dense3) as tf.SymbolicTensor;

  const dteOutput = tf.layers
    .dense({
      units: 1,
      activation: 'sigmoid', // 0-1 representing DTE (7-60 days normalized)
      name: 'dte',
    })
    .apply(dense3) as tf.SymbolicTensor;

  const returnOutput = tf.layers
    .dense({
      units: 1,
      activation: 'linear', // Expected return
      name: 'expected_return',
    })
    .apply(dense3) as tf.SymbolicTensor;

  // Concatenate outputs for single-output training
  const outputs = tf.layers.concatenate().apply([strikeOutput, dteOutput, returnOutput]) as tf.SymbolicTensor;

  const model = tf.model({
    inputs: input,
    outputs: outputs,
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

/**
 * Train the strike optimizer model for a user
 */
export async function trainStrikeOptimizer(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    // Get all wheel trades with strike info
    const wheelTrades = await prisma.realizedClose.findMany({
      where: {
        userId,
        strategy: { in: ['cash_secured_put', 'covered_call'] },
        strike: { not: null },
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (wheelTrades.length < 50) {
      return {
        success: false,
        stats: { tradesUsed: wheelTrades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 50 wheel trades with strike data, found ${wheelTrades.length}`,
      };
    }

    // Prepare training data
    const trainingData: { features: number[]; labels: number[] }[] = [];

    for (const trade of wheelTrades) {
      const direction = trade.strategy === 'cash_secured_put' ? 'csp' : 'covered_call';
      const features = await extractStrikeFeatures(userId, trade.symbol, direction);
      const featureArray = strikeFeaturesToArray(features);

      // Calculate labels from trade outcome
      const strike = Number(trade.strike);
      const stockPrice = Number(trade.underlyingPriceAtOpen) || strike * 1.05;
      const strikePercent = Math.abs(strike - stockPrice) / stockPrice;

      const holdDays = Math.max(
        1,
        Math.ceil(
          (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      const dteNormalized = Math.min(1, holdDays / 60);

      const capitalUsed = Math.max(1, Math.abs(Number(trade.openAmount)));
      const returnPct = capitalUsed > 0 ? Number(trade.realizedPnL) / capitalUsed : 0;
      const annualizedReturn = returnPct * (365 / holdDays);

      trainingData.push({
        features: featureArray,
        labels: [
          Math.min(1, strikePercent / 0.2), // Normalize strike% to 0-1 (0-20% range)
          dteNormalized,
          Math.max(-1, Math.min(1, annualizedReturn)), // Clip return
        ],
      });
    }

    // Build model
    const model = await buildStrikeOptimizer();

    // Prepare tensors
    const split = temporalSplit(trainingData, {
      validationFraction: 0.2,
      minTrainRows: 40,
      minValidationRows: 10,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((d) => d.features));
    const trainYs = tf.tensor2d(split.trainRows.map((d) => d.labels));
    const validationXs = tf.tensor2d(split.validationRows.map((d) => d.features));
    const validationYs = tf.tensor2d(split.validationRows.map((d) => d.labels));

    // Train
    const startTime = Date.now();
    const history = await model.fit(trainXs, trainYs, {
      epochs: 100,
      batchSize: Math.min(32, Math.floor(split.trainRows.length / 4)),
      validationData: [validationXs, validationYs],
      shuffle: false,
      callbacks: tf.callbacks.earlyStopping({ patience: 10, monitor: 'val_loss' }),
      verbose: 0,
    });

    const trainingTime = Date.now() - startTime;
    const finalLoss = getLastHistoryMetric(history, ['loss']) ?? 0;
    const valLoss = getLastHistoryMetric(history, ['val_loss']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss: valLoss,
      trainingTime,
    };

    // Save model
    await saveModelToSQL(userId, 'strike-optimizer', model, stats);

    // Cleanup
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

/**
 * Get strike/DTE recommendation for a symbol
 * @param currentPrice - Optional override for current stock price (from options chain)
 * @param targetDte - Optional specific DTE to optimize for (from selected expiration)
 */
export async function getStrikeRecommendation(
  userId: string,
  symbol: string,
  direction: 'csp' | 'covered_call',
  currentPrice?: number,
  targetDte?: number
): Promise<StrikeDteRecommendation | null> {
  const features = await extractStrikeFeatures(userId, symbol, direction);

  // Use provided currentPrice if available (from options chain), otherwise use features
  if (currentPrice && currentPrice > 0) {
    features.currentPrice = currentPrice;
  }

  // If still no price, can't make recommendation
  if (features.currentPrice === 0) {
    return null;
  }

  if (features.tradesOnSymbol < 3) {
    // Not enough data for recommendation
    return generateStatisticalRecommendation(features, targetDte);
  }

  const model = await loadModelFromSQL(userId, 'strike-optimizer');

  let recommendation: StrikeDteRecommendation;

  if (model) {
    // Use ML model
    const featureArray = strikeFeaturesToArray(features);
    const inputTensor = tf.tensor2d([featureArray]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    const [strikePercent, dteNormalized, expectedReturn] = await prediction.data();

    recommendation = denormalizeRecommendation(
      { strikePercent, dteNormalized, expectedReturn },
      features.currentPrice,
      features,
      direction,
      targetDte
    );

    inputTensor.dispose();
    prediction.dispose();
    // Don't dispose model - it's cached and reused by loadModelFromSQL
  } else {
    // Fallback to statistical
    recommendation = generateStatisticalRecommendation(features, targetDte);
  }

  // Store prediction
  await storePrediction(userId, 'strike_dte', symbol, recommendation);

  return recommendation;
}

/**
 * Calculate appropriate OTM range based on DTE
 * Shorter DTE = closer to money (less time for stock to move)
 */
// TODO: Support $1/$2.50 strike spacing for stocks under $25
export function getOtmRangeForDte(dte: number): { min: number; max: number } {
  if (dte <= 7) {
    // 0-7 days: 1-4% OTM (very close to money for short expiry)
    return { min: 0.01, max: 0.04 };
  } else if (dte <= 14) {
    // 8-14 days: 2-6% OTM
    return { min: 0.02, max: 0.06 };
  } else if (dte <= 21) {
    // 15-21 days: 2-8% OTM
    return { min: 0.02, max: 0.08 };
  } else if (dte <= 30) {
    // 22-30 days: 3-10% OTM
    return { min: 0.03, max: 0.10 };
  } else {
    // 31+ days: 3-15% OTM (full range for longer DTE)
    return { min: 0.03, max: 0.15 };
  }
}

/**
 * Denormalize model outputs to actual values
 * @param targetDte - Optional specific DTE to optimize strike for
 */
function denormalizeRecommendation(
  output: { strikePercent: number; dteNormalized: number; expectedReturn: number },
  currentPrice: number,
  features: { userPreferredDte: number; winRateOnSymbol: number; avgPnlOnSymbol: number; tradesOnSymbol: number },
  direction: 'csp' | 'covered_call',
  targetDte?: number
): StrikeDteRecommendation {
  // Clamp model outputs to valid 0-1 range (neural networks can output outside this range)
  const clampedStrikePercent = Math.max(0, Math.min(1, output.strikePercent));
  const clampedDteNormalized = Math.max(0, Math.min(1, output.dteNormalized));

  // DTE: Use targetDte if provided, otherwise decode from model output
  // 0-1 maps to 7-45 days (typical wheel strategy range)
  const recommendedDte = targetDte ?? Math.round(7 + clampedDteNormalized * 38);

  // Strike: Scale OTM range based on DTE
  // Shorter DTE = tighter OTM range (stock has less time to move)
  const otmRange = getOtmRangeForDte(recommendedDte);
  const otmPercent = otmRange.min + clampedStrikePercent * (otmRange.max - otmRange.min);
  const strikeMultiplier = direction === 'csp' ? 1 - otmPercent : 1 + otmPercent;
  const recommendedStrike = Math.round((currentPrice * strikeMultiplier) / 5) * 5; // Round to $5

  // Estimate premium based on historical data
  const expectedPremium = estimatePremium(
    currentPrice,
    recommendedStrike,
    recommendedDte,
    features.avgPnlOnSymbol
  );

  // Probability estimates
  const probabilityOfProfit = 0.5 + features.winRateOnSymbol * 0.3;
  const probabilityOfAssignment = direction === 'csp' ? otmPercent * 2 : otmPercent * 1.5;

  return {
    recommendedStrike,
    recommendedDte,
    expectedPremium,
    expectedReturn: output.expectedReturn * 100, // Convert to percentage

    probabilityOfProfit: Math.min(1, Math.max(0, probabilityOfProfit)),
    probabilityOfAssignment: Math.min(1, Math.max(0, probabilityOfAssignment)),

    alternatives: generateAlternatives(currentPrice, recommendedStrike, recommendedDte, direction),

    reasoning: generateStrikeReasoning(
      recommendedStrike,
      recommendedDte,
      currentPrice,
      features,
      direction
    ),
  };
}

/**
 * Generate statistical recommendation without ML
 * @param targetDte - Optional specific DTE to optimize strike for
 */
function generateStatisticalRecommendation(
  features: {
    currentPrice: number;
    direction: 'csp' | 'covered_call';
    userPreferredDte: number;
    userAvgStrikeDistance: number;
    winRateOnSymbol: number;
    avgPnlOnSymbol: number;
  },
  targetDte?: number
): StrikeDteRecommendation {
  const { currentPrice, direction, userPreferredDte, userAvgStrikeDistance } = features;

  // DTE: Use targetDte if provided, otherwise user's preference clamped to 7-45 days
  const rawDte = targetDte ?? userPreferredDte ?? 30;
  const recommendedDte = Math.max(7, Math.min(45, rawDte));

  // OTM range scales with DTE - shorter DTE = tighter range
  const otmRange = getOtmRangeForDte(recommendedDte);
  const rawOtmPercent = userAvgStrikeDistance || (otmRange.min + otmRange.max) / 2;
  const otmPercent = Math.max(otmRange.min, Math.min(otmRange.max, rawOtmPercent));
  const strikeMultiplier = direction === 'csp' ? 1 - otmPercent : 1 + otmPercent;
  const recommendedStrike = Math.round((currentPrice * strikeMultiplier) / 5) * 5;

  const expectedPremium = estimatePremium(
    currentPrice,
    recommendedStrike,
    recommendedDte,
    features.avgPnlOnSymbol
  );

  return {
    recommendedStrike,
    recommendedDte,
    expectedPremium,
    expectedReturn: 2, // Conservative 2% estimate

    probabilityOfProfit: 0.6 + features.winRateOnSymbol * 0.2,
    probabilityOfAssignment: 0.15,

    alternatives: generateAlternatives(currentPrice, recommendedStrike, recommendedDte, direction),

    reasoning: [
      'Based on your historical trading patterns',
      `You typically trade ${recommendedDte}-day options`,
      `Average strike distance: ${(otmPercent * 100).toFixed(1)}% OTM`,
    ],
  };
}

/**
 * Estimate premium based on strike/DTE
 */
function estimatePremium(
  currentPrice: number,
  strike: number,
  dte: number,
  historicalAvg: number
): number {
  // Simplified premium estimation
  const otmPercent = Math.abs(strike - currentPrice) / currentPrice;
  const timeFactor = Math.sqrt(dte / 30);
  const basePremium = currentPrice * 0.02 * timeFactor;
  const otmDiscount = 1 - otmPercent * 2;

  // Blend with historical average if available
  const estimatedPremium = basePremium * Math.max(0.3, otmDiscount);
  return historicalAvg > 0 ? (estimatedPremium + historicalAvg) / 2 : estimatedPremium;
}

/**
 * Generate alternative strike/DTE combinations
 */
function generateAlternatives(
  currentPrice: number,
  recommendedStrike: number,
  recommendedDte: number,
  direction: 'csp' | 'covered_call'
): StrikeDteRecommendation['alternatives'] {
  const alternatives: StrikeDteRecommendation['alternatives'] = [];

  // More conservative (further OTM, longer DTE)
  const conservativeStrike =
    direction === 'csp' ? recommendedStrike - 5 : recommendedStrike + 5;
  alternatives.push({
    strike: conservativeStrike,
    dte: Math.min(60, recommendedDte + 7),
    premium: estimatePremium(currentPrice, conservativeStrike, recommendedDte + 7, 0) * 0.8,
    pop: 0.75,
    tradeoff: 'Lower premium, higher probability of profit',
  });

  // More aggressive (closer to ATM, shorter DTE)
  const aggressiveStrike =
    direction === 'csp' ? recommendedStrike + 5 : recommendedStrike - 5;
  alternatives.push({
    strike: aggressiveStrike,
    dte: Math.max(7, recommendedDte - 7),
    premium: estimatePremium(currentPrice, aggressiveStrike, recommendedDte - 7, 0) * 1.3,
    pop: 0.55,
    tradeoff: 'Higher premium, more assignment risk',
  });

  // Shorter DTE at same strike
  if (recommendedDte > 14) {
    alternatives.push({
      strike: recommendedStrike,
      dte: 14,
      premium: estimatePremium(currentPrice, recommendedStrike, 14, 0) * 0.7,
      pop: 0.65,
      tradeoff: 'Faster theta decay, more frequent trading',
    });
  }

  return alternatives;
}

/**
 * Generate reasoning for strike/DTE recommendation
 */
function generateStrikeReasoning(
  strike: number,
  dte: number,
  currentPrice: number,
  features: { winRateOnSymbol: number; tradesOnSymbol: number; userPreferredDte: number },
  direction: 'csp' | 'covered_call'
): string[] {
  const reasons: string[] = [];

  const otmPercent = Math.abs(strike - currentPrice) / currentPrice;

  reasons.push(
    `${direction === 'csp' ? 'Put' : 'Call'} strike at $${strike} (${(otmPercent * 100).toFixed(1)}% OTM)`
  );
  reasons.push(`${dte}-day expiration balances premium vs risk`);

  if (features.winRateOnSymbol >= 0.7) {
    reasons.push(`Your ${(features.winRateOnSymbol * 100).toFixed(0)}% win rate supports this strike`);
  }

  if (Math.abs(dte - features.userPreferredDte) <= 7) {
    reasons.push('Matches your typical DTE preference');
  }

  if (features.tradesOnSymbol >= 10) {
    reasons.push(`Based on ${features.tradesOnSymbol} historical trades`);
  }

  return reasons;
}
