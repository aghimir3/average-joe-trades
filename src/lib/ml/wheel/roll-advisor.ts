/**
 * Roll Advisor Model for Wheel Strategy
 * Advises whether to roll, let expire, or close positions near expiration
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import {
  extractRollFeatures,
  rollFeaturesToArray,
  ROLL_FEATURE_NAMES,
} from './feature-engineering';
import { saveModelToSQL, loadModelFromSQL, storePrediction } from './model-storage';
import type { RollAdvice, RollAction, RollAlert, TrainingStats } from './types';

const NUM_FEATURES = ROLL_FEATURE_NAMES.length;

// Actions: 0=roll_out, 1=let_expire, 2=close
const ACTIONS: RollAction[] = ['roll_out', 'let_expire', 'close'];

/**
 * Build the roll advisor neural network
 * Classification model predicting best action
 */
export async function buildRollAdvisor(): Promise<tf.LayersModel> {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [NUM_FEATURES],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
      }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({
        units: 16,
        activation: 'relu',
      }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({
        units: 3, // 3 classes: roll, expire, close
        activation: 'softmax',
      }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  return model;
}

/**
 * Train the roll advisor model for a user
 */
export async function trainRollAdvisor(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    // Get all wheel trades to identify roll patterns
    const wheelTrades = await prisma.realizedClose.findMany({
      where: {
        userId,
        strategy: { in: ['cash_secured_put', 'covered_call'] },
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (wheelTrades.length < 20) {
      return {
        success: false,
        stats: { tradesUsed: wheelTrades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 20 wheel trades for training, found ${wheelTrades.length}`,
      };
    }

    // Build training data from trade outcomes
    const trainingData: { features: number[]; label: number }[] = [];

    for (const trade of wheelTrades) {
      // Extract features at time of close
      const holdDays = Math.max(
        1,
        Math.ceil(
          (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      const isItm =
        trade.optionType === 'put'
          ? Number(trade.strike) > Number(trade.closePrice)
          : Number(trade.strike) < Number(trade.closePrice);

      const strike = Number(trade.strike) || 100;
      const closePrice = Number(trade.closePrice) || strike;
      const distanceToStrike = Math.abs(strike - closePrice) / closePrice;

      const pnl = Number(trade.realizedPnL);
      const wasSuccessful = pnl > 0;

      // Determine what action was effectively taken
      let actionLabel: number;
      if (trade.closeReason === 'expired') {
        actionLabel = 1; // let_expire
      } else if (trade.closeReason === 'assigned') {
        actionLabel = 1; // let_expire/assign
      } else {
        // Normal close - was it early (roll/close) or near expiration (let expire)?
        actionLabel = holdDays < 14 ? 2 : 1; // close early vs let expire
      }

      // Create feature vector (simplified)
      const features = [
        Math.min(holdDays / 60, 1), // Normalized DTE at entry
        isItm ? 1 : 0,
        distanceToStrike,
        0.7, // Assume 70% premium captured
        50 / 500, // Normalized roll credit estimate
        0, // Neutral stock trend
        wasSuccessful ? 0.7 : 0.3, // Win rate proxy
      ];

      trainingData.push({ features, label: actionLabel });
    }

    // Build model
    const model = await buildRollAdvisor();

    // Prepare tensors
    // One-hot encode labels
    const ysOneHot = trainingData.map((d) => {
      const oneHot = [0, 0, 0];
      oneHot[d.label] = 1;
      return oneHot;
    });
    const rows = trainingData.map((row, index) => ({
      features: row.features,
      labels: ysOneHot[index],
    }));
    const split = temporalSplit(rows, {
      validationFraction: 0.2,
      minTrainRows: 16,
      minValidationRows: 4,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((row) => row.features));
    const trainYs = tf.tensor2d(split.trainRows.map((row) => row.labels));
    const validationXs = tf.tensor2d(split.validationRows.map((row) => row.features));
    const validationYs = tf.tensor2d(split.validationRows.map((row) => row.labels));

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
    const validationLoss = getLastHistoryMetric(history, ['val_loss']);
    const accuracy = getLastHistoryMetric(history, ['accuracy', 'acc']);

    const stats: TrainingStats = {
      tradesUsed: trainingData.length,
      epochs: history.epoch.length,
      finalLoss,
      validationLoss,
      accuracy,
      trainingTime,
    };

    // Save model
    await saveModelToSQL(userId, 'roll-advisor', model, stats);

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
 * Get roll advice for a position
 */
export async function getRollAdvice(
  userId: string,
  positionId: string
): Promise<RollAdvice | null> {
  const features = await extractRollFeatures(userId, positionId);
  if (!features) return null;

  const model = await loadModelFromSQL(userId, 'roll-advisor');

  let advice: RollAdvice;

  if (model) {
    // Use ML model
    const featureArray = rollFeaturesToArray(features);
    const inputTensor = tf.tensor2d([featureArray]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    const probabilities = await prediction.data();

    const maxIndex = Array.from(probabilities).indexOf(Math.max(...probabilities));
    const recommendation = ACTIONS[maxIndex];
    const confidence = probabilities[maxIndex];

    advice = {
      recommendation,
      confidence,
      actionProbabilities: {
        roll_out: probabilities[0],
        let_expire: probabilities[1],
        close: probabilities[2],
      },
      reasoning: generateReasoning(features, recommendation),
      projectedOutcomes: calculateProjectedOutcomes(features),
    };

    inputTensor.dispose();
    prediction.dispose();
    // Don't dispose model - it's cached and reused by loadModelFromSQL
  } else {
    // Fallback to rule-based
    advice = generateRuleBasedAdvice(features);
  }

  // Store prediction
  await storePrediction(userId, 'roll', features.symbol, advice);

  return advice;
}

/**
 * Get all positions needing roll decisions
 * Only returns wheel strategy positions (covered_call, cash_secured_put)
 * @param userId - User ID
 * @param brokerageAccountId - Optional account filter (null = all accounts)
 */
export async function getRollAlerts(
  userId: string,
  brokerageAccountId?: string | null
): Promise<RollAlert[]> {
  // Get open WHEEL option positions expiring within 14 days
  // Only covered calls and cash secured puts - not long calls/puts
  const positions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'option',
      strategy: { in: ['covered_call', 'cash_secured_put'] },
      expiration: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        gte: new Date(),
      },
      // Filter by account if specified, otherwise get from all accounts
      ...(brokerageAccountId ? { brokerageAccountId } : {}),
    },
    orderBy: { expiration: 'asc' },
  });

  const alerts: RollAlert[] = [];

  for (const position of positions) {
    const features = await extractRollFeatures(userId, position.id);
    if (!features) continue;

    const advice = await getRollAdvice(userId, position.id);
    if (!advice) continue;

    alerts.push({
      positionId: position.id,
      symbol: position.symbol,
      positionType: features.positionType,
      strike: features.strike,
      expiration: position.expiration?.toISOString().split('T')[0] ?? '',
      daysToExpiration: features.daysToExpiration,
      isItm: features.isItm,
      distanceToStrike: features.distanceToStrike,
      advice,
    });
  }

  return alerts;
}

/**
 * Generate rule-based advice without ML
 */
function generateRuleBasedAdvice(features: {
  symbol: string;
  positionType: 'csp' | 'covered_call';
  strike: number;
  daysToExpiration: number;
  isItm: boolean;
  distanceToStrike: number;
  premiumCapturedPct: number;
  rollCredit: number;
  premiumReceived?: number;
  currentStockPrice?: number;
}): RollAdvice {
  const { daysToExpiration, isItm, premiumCapturedPct, rollCredit, strike } = features;
  // Use defaults if not provided
  const premiumReceived = features.premiumReceived ?? strike * 0.02 * 100; // Estimate ~2% premium
  const currentStockPrice = features.currentStockPrice ?? strike;

  let recommendation: RollAction;
  let confidence: number;

  if (isItm && daysToExpiration <= 7) {
    // ITM near expiration - likely roll or accept assignment
    if (rollCredit > 0) {
      recommendation = 'roll_out';
      confidence = 0.7;
    } else {
      recommendation = 'let_assign';
      confidence = 0.6;
    }
  } else if (!isItm && premiumCapturedPct >= 0.8) {
    // OTM with most premium captured - let expire
    recommendation = 'let_expire';
    confidence = 0.8;
  } else if (!isItm && premiumCapturedPct >= 0.5 && daysToExpiration > 7) {
    // OTM with decent premium captured - consider closing
    recommendation = 'close';
    confidence = 0.6;
  } else if (daysToExpiration <= 3) {
    // Very near expiration
    recommendation = isItm ? 'roll_out' : 'let_expire';
    confidence = 0.7;
  } else {
    // Default: wait
    recommendation = 'let_expire';
    confidence = 0.5;
  }

  return {
    recommendation,
    confidence,
    actionProbabilities: {
      roll_out: recommendation === 'roll_out' ? confidence : 0.2,
      let_expire: recommendation === 'let_expire' ? confidence : 0.3,
      close: recommendation === 'close' ? confidence : 0.2,
    },
    reasoning: generateReasoning(features, recommendation),
    projectedOutcomes: calculateProjectedOutcomes({
      strike,
      premiumReceived,
      premiumCapturedPct,
      rollCredit,
      daysToExpiration,
      isItm,
      currentStockPrice,
    }),
  };
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  features: {
    daysToExpiration: number;
    isItm: boolean;
    premiumCapturedPct: number;
    rollCredit: number;
    distanceToStrike: number;
  },
  action: RollAction
): string[] {
  const reasons: string[] = [];

  if (action === 'roll_out') {
    if (features.isItm) {
      reasons.push('Position is ITM - rolling avoids assignment');
    }
    if (features.rollCredit > 0) {
      reasons.push(`Can collect $${features.rollCredit.toFixed(0)} credit by rolling`);
    }
    if (features.daysToExpiration <= 5) {
      reasons.push('Expiration is imminent');
    }
  } else if (action === 'let_expire' || action === 'let_assign') {
    if (!features.isItm) {
      reasons.push('Position is OTM - will expire worthless');
    }
    if (features.premiumCapturedPct >= 0.8) {
      reasons.push(`${(features.premiumCapturedPct * 100).toFixed(0)}% of premium already captured`);
    }
    if (features.daysToExpiration <= 2) {
      reasons.push('Only 1-2 days left - let theta work');
    }
  } else if (action === 'close') {
    if (features.premiumCapturedPct >= 0.5) {
      reasons.push(`${(features.premiumCapturedPct * 100).toFixed(0)}% of premium captured - lock in profit`);
    }
    reasons.push('Frees up capital for new opportunities');
  }

  if (reasons.length === 0) {
    reasons.push('Based on historical trading patterns');
  }

  return reasons;
}

/**
 * Calculate projected outcomes for each action
 */
function calculateProjectedOutcomes(features: {
  strike: number;
  premiumReceived: number;
  premiumCapturedPct: number;
  rollCredit: number;
  daysToExpiration: number;
  isItm: boolean;
  currentStockPrice: number;
}): RollAdvice['projectedOutcomes'] {
  const {
    strike,
    premiumReceived,
    premiumCapturedPct,
    rollCredit,
    isItm,
    currentStockPrice,
  } = features;

  const currentValue = premiumReceived * (1 - premiumCapturedPct);
  const closeProfit = premiumReceived - currentValue;

  const newExpiration = new Date();
  newExpiration.setDate(newExpiration.getDate() + 30);

  return {
    ifRoll: {
      netCredit: rollCredit,
      newExpiration: newExpiration.toISOString().split('T')[0],
      newStrike: strike,
      expectedReturn: ((rollCredit + premiumReceived) / (strike * 100)) * (365 / 30) * 100,
    },
    ifLetExpire: {
      pnl: isItm ? -Math.abs(strike - currentStockPrice) * 100 : premiumReceived,
      willBeAssigned: isItm,
      assignmentCost: isItm ? strike * 100 : undefined,
    },
    ifClose: {
      pnl: closeProfit,
      capitalFreed: strike * 100,
    },
  };
}
