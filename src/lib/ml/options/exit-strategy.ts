/**
 * Exit Strategy Predictor
 * Multi-task learning model for predicting optimal exit parameters:
 * - Target profit %
 * - Stop loss %
 * - Exit timing (early/at_target/expiration)
 * - Roll probability
 */

import * as tf from '@tensorflow/tfjs';
import { prisma } from '@/lib/prisma';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';
import { average, clamp } from '@/lib/ml/math-utils';
import { ensureQuoteCached } from '@/lib/market/cache';
import { EXIT_STRATEGY_FEATURE_NAMES } from './feature-engineering';
import { saveOptionsModel, loadOptionsModel, logPrediction } from './model-storage';
import type { ExitStrategyResult, ExitTiming, TrainingStats, FeatureVector } from './types';

const NUM_FEATURES = EXIT_STRATEGY_FEATURE_NAMES.length;

// ============================================================================
// Model Architecture (Multi-Task Learning)
// ============================================================================

export function buildExitStrategyModel(): tf.LayersModel {
  // Shared encoder
  const input = tf.input({ shape: [NUM_FEATURES] });

  const shared1 = tf.layers
    .dense({
      units: 64,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    })
    .apply(input);

  const bn1 = tf.layers.batchNormalization().apply(shared1);
  const dropout1 = tf.layers.dropout({ rate: 0.3 }).apply(bn1);

  const shared2 = tf.layers
    .dense({
      units: 32,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    })
    .apply(dropout1);

  const dropout2 = tf.layers.dropout({ rate: 0.2 }).apply(shared2);

  const shared3 = tf.layers
    .dense({
      units: 16,
      activation: 'relu',
    })
    .apply(dropout2);

  // Task-specific heads

  // 1. Target Profit % (regression, 0-1 for 0-100%)
  const targetProfitHead = tf.layers
    .dense({ units: 8, activation: 'relu' })
    .apply(shared3);
  const targetProfitOutput = tf.layers
    .dense({ units: 1, activation: 'sigmoid', name: 'target_profit' })
    .apply(targetProfitHead);

  // 2. Stop Loss % (regression, 0-1 for 0-100%)
  const stopLossHead = tf.layers
    .dense({ units: 8, activation: 'relu' })
    .apply(shared3);
  const stopLossOutput = tf.layers
    .dense({ units: 1, activation: 'sigmoid', name: 'stop_loss' })
    .apply(stopLossHead);

  // 3. Exit Timing (classification: early, at_target, expiration)
  const exitTimingHead = tf.layers
    .dense({ units: 8, activation: 'relu' })
    .apply(shared3);
  const exitTimingOutput = tf.layers
    .dense({ units: 3, activation: 'softmax', name: 'exit_timing' })
    .apply(exitTimingHead);

  // 4. Roll Probability (regression, 0-1)
  const rollHead = tf.layers
    .dense({ units: 8, activation: 'relu' })
    .apply(shared3);
  const rollOutput = tf.layers
    .dense({ units: 1, activation: 'sigmoid', name: 'roll_prob' })
    .apply(rollHead);

  // Concatenate all outputs for single-output model (easier to handle)
  const concatenated = tf.layers.concatenate().apply([
    targetProfitOutput as tf.SymbolicTensor,
    stopLossOutput as tf.SymbolicTensor,
    exitTimingOutput as tf.SymbolicTensor,
    rollOutput as tf.SymbolicTensor,
  ]);

  const model = tf.model({
    inputs: input,
    outputs: concatenated as tf.SymbolicTensor,
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
  });

  return model;
}

// ============================================================================
// Training
// ============================================================================

export async function trainExitStrategyModel(userId: string): Promise<{
  success: boolean;
  stats: TrainingStats;
  error?: string;
}> {
  try {
    const trades = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeType: 'option',
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'asc' },
    });

    if (trades.length < 30) {
      return {
        success: false,
        stats: { tradesUsed: trades.length, epochs: 0, finalLoss: 0 },
        error: `Need at least 30 option trades, found ${trades.length}`,
      };
    }

    const trainingData = prepareExitTrainingData(trades);

    if (trainingData.length < 20) {
      return {
        success: false,
        stats: { tradesUsed: trainingData.length, epochs: 0, finalLoss: 0 },
        error: 'Insufficient training data after filtering',
      };
    }

    const model = buildExitStrategyModel();

    const split = temporalSplit(trainingData, {
      validationFraction: 0.2,
      minTrainRows: 16,
      minValidationRows: 4,
    });
    const trainXs = tf.tensor2d(split.trainRows.map((d) => d.features));
    const trainYs = tf.tensor2d(split.trainRows.map((d) => d.labels));
    const validationXs = tf.tensor2d(split.validationRows.map((d) => d.features));
    const validationYs = tf.tensor2d(split.validationRows.map((d) => d.labels));

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

    await saveOptionsModel(
      userId,
      'exit-strategy',
      'Exit Strategy Predictor',
      model,
      stats,
      'Multi-task: Dense(64)->BN->Dropout->Dense(32)->Dropout->Dense(16)->4 heads'
    );

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

export async function predictExitStrategy(
  userId: string,
  positionId: string
): Promise<ExitStrategyResult> {
  // Get position details
  const position = await prisma.derivedPosition.findUnique({
    where: { id: positionId },
  });

  if (!position || position.positionType !== 'option') {
    return createFallbackExitStrategy();
  }

  const featureVector = await extractExitFeatures(userId, position);

  const model = await loadOptionsModel(userId, 'exit-strategy');

  let predictions: number[];

  if (model) {
    const inputTensor = tf.tensor2d([featureVector.features]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    predictions = Array.from(await prediction.data());

    inputTensor.dispose();
    prediction.dispose();
  } else {
    predictions = calculateStatisticalExit(featureVector.features);
  }

  // Parse multi-task output
  // [0]: target profit, [1]: stop loss, [2-4]: exit timing probs, [5]: roll prob
  const targetProfitPercent = predictions[0] * 100; // Scale to percentage
  const stopLossPercent = predictions[1] * 100;
  const exitTimingProbs = {
    early: predictions[2],
    at_target: predictions[3],
    expiration: predictions[4],
  };
  const rollProbability = predictions[5];

  // Determine exit timing
  const exitTimingEntries = Object.entries(exitTimingProbs);
  exitTimingEntries.sort((a, b) => b[1] - a[1]);
  const exitTiming = exitTimingEntries[0][0] as ExitTiming;
  const confidence = exitTimingEntries[0][1];

  // Generate reasoning
  const reasoning = generateExitReasoning(
    position,
    targetProfitPercent,
    stopLossPercent,
    exitTiming,
    rollProbability
  );

  const result: ExitStrategyResult = {
    targetProfitPercent,
    stopLossPercent,
    exitTiming,
    exitTimingProbabilities: exitTimingProbs,
    rollProbability,
    confidence,
    reasoning,
  };

  // Log prediction
  if (model) {
    const modelInfo = await prisma.optionsMLModel.findFirst({
      where: { userId, modelType: 'exit-strategy', isActive: true },
      select: { version: true },
    });

    await logPrediction(userId, 'exit-strategy', modelInfo?.version ?? 1, {
      symbol: position.symbol,
      predictionType: 'exit_strategy',
      prediction: { ...result, positionId },
      confidence,
    });
  }

  return result;
}

// ============================================================================
// Training Data Preparation
// ============================================================================

interface TrainingExample {
  features: number[];
  labels: number[];
}

function prepareExitTrainingData(
  trades: {
    symbol: string;
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    strike: unknown;
    expiration: Date | null;
    optionType: string | null;
    underlyingPriceAtOpen: unknown;
    underlyingPriceAtClose: unknown;
    realizedPnL: unknown;
    closeReason: string | null;
  }[]
): TrainingExample[] {
  const trainingData: TrainingExample[] = [];

  // Group by symbol for context
  const tradesBySymbol = new Map<string, typeof trades>();
  for (const trade of trades) {
    const existing = tradesBySymbol.get(trade.symbol) || [];
    existing.push(trade);
    tradesBySymbol.set(trade.symbol, existing);
  }

  for (const [, symbolTrades] of tradesBySymbol.entries()) {
    for (let i = 3; i < symbolTrades.length; i++) {
      const historicalTrades = symbolTrades.slice(0, i);
      const currentTrade = symbolTrades[i];

      const features = calculateExitFeatures(historicalTrades, currentTrade);
      const labels = calculateExitLabels(currentTrade, historicalTrades);

      trainingData.push({ features, labels });
    }
  }

  return trainingData;
}

function calculateExitFeatures(
  historicalTrades: {
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    strike: unknown;
    expiration: Date | null;
    optionType: string | null;
    underlyingPriceAtOpen: unknown;
    underlyingPriceAtClose: unknown;
    realizedPnL: unknown;
    closeReason: string | null;
  }[],
  currentTrade: {
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    strike: unknown;
    expiration: Date | null;
    optionType: string | null;
    underlyingPriceAtOpen: unknown;
    underlyingPriceAtClose: unknown;
    realizedPnL: unknown;
  }
): number[] {
  const features = new Array(NUM_FEATURES).fill(0.5);

  const openPrice = Math.abs(Number(currentTrade.openPrice));
  const closePrice = Math.abs(Number(currentTrade.closePrice));
  const strike = Number(currentTrade.strike);
  const currentReturn = toReturnRatio(currentTrade.realizedPnL, currentTrade.openAmount);
  const optionType = (currentTrade.optionType ?? '').toLowerCase();

  // Current P&L % (normalized from realized return ratio)
  features[0] = toNormalizedReturn(currentReturn);

  // Days held
  const daysHeld =
    (new Date(currentTrade.closeDate).getTime() - new Date(currentTrade.openDate).getTime()) /
    (24 * 60 * 60 * 1000);
  features[1] = Math.min(1, daysHeld / 60);

  // DTE remaining
  if (currentTrade.expiration) {
    const dteRemaining =
      (new Date(currentTrade.expiration).getTime() - new Date(currentTrade.closeDate).getTime()) /
      (24 * 60 * 60 * 1000);
    features[2] = Math.max(0, Math.min(1, dteRemaining / 60));
  }

  // Premium captured % proxy from option premium decay/growth.
  if (openPrice > 0 && Number.isFinite(closePrice)) {
    const premiumCaptured = (openPrice - closePrice) / openPrice;
    features[3] = clamp((premiumCaptured + 1) / 2, 0, 1);
  }

  // Distance to strike (normalized using underlying at open if available).
  const underlyingAtOpen = Number(currentTrade.underlyingPriceAtOpen);
  const distanceReference =
    Number.isFinite(underlyingAtOpen) && underlyingAtOpen > 0
      ? underlyingAtOpen
      : Number.isFinite(strike) && strike > 0
        ? strike
        : openPrice;
  if (Number.isFinite(strike) && strike > 0 && Number.isFinite(distanceReference) && distanceReference > 0) {
    features[4] = Math.min(1, Math.abs(distanceReference - strike) / distanceReference / 0.2);
  }

  // Is ITM at close from underlying close and option type.
  const underlyingAtClose = Number(currentTrade.underlyingPriceAtClose);
  if (Number.isFinite(underlyingAtClose) && underlyingAtClose > 0 && Number.isFinite(strike) && strike > 0) {
    if (optionType === 'call') {
      features[5] = underlyingAtClose > strike ? 1 : 0;
    } else if (optionType === 'put') {
      features[5] = underlyingAtClose < strike ? 1 : 0;
    }
  }

  // Theta decay rate estimate
  const dteAtEntry = currentTrade.expiration
    ? (new Date(currentTrade.expiration).getTime() - new Date(currentTrade.openDate).getTime()) /
      (24 * 60 * 60 * 1000)
    : 30;
  features[6] = dteAtEntry > 0 ? Math.min(1, 1 / dteAtEntry) : 0.5;

  // Historical avg hold days
  const holdDays = historicalTrades.map(
    (t) =>
      (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (24 * 60 * 60 * 1000)
  );
  const avgHoldDays = holdDays.length > 0 ? holdDays.reduce((a, b) => a + b, 0) / holdDays.length : 30;
  features[7] = Math.min(1, avgHoldDays / 60);

  // Historical exit point (avg P&L %)
  const historicalReturns = historicalTrades.map((trade) =>
    toReturnRatio(trade.realizedPnL, trade.openAmount)
  );
  const avgExit = average(historicalReturns);
  features[8] = Math.max(0, Math.min(1, avgExit + 0.5));

  // Recent exit patterns (last 5)
  const recentReturns = historicalReturns.slice(-5);
  const recentAvg = average(recentReturns);
  features[9] = Math.max(0, Math.min(1, recentAvg + 0.5));

  // Win rate at similar return levels (local neighborhood).
  features[10] = calculateLocalWinRate(historicalReturns, currentReturn);

  // Avg return for trades held longer than current holding duration.
  const holdAdjustedReturns = historicalTrades
    .filter((trade) => {
      const holdDuration =
        (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
        (24 * 60 * 60 * 1000);
      return holdDuration >= daysHeld;
    })
    .map((trade) => toReturnRatio(trade.realizedPnL, trade.openAmount));
  features[11] = clamp(average(holdAdjustedReturns) + 0.5, 0, 1);

  // Avg return for trades closed earlier than current holding duration.
  const closeAdjustedReturns = historicalTrades
    .filter((trade) => {
      const holdDuration =
        (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
        (24 * 60 * 60 * 1000);
      return holdDuration <= daysHeld;
    })
    .map((trade) => toReturnRatio(trade.realizedPnL, trade.openAmount));
  features[12] = clamp(average(closeAdjustedReturns) + 0.5, 0, 1);

  // Roll success rate
  const rolls = historicalTrades.filter((t) => t.closeReason === 'rolled');
  const rollWins = rolls.filter((t) => Number(t.realizedPnL) > 0).length;
  features[13] = rolls.length > 0 ? rollWins / rolls.length : 0.5;

  return features;
}

function calculateExitLabels(
  trade: {
    openDate: Date;
    closeDate: Date;
    openPrice: unknown;
    closePrice: unknown;
    openAmount: unknown;
    expiration: Date | null;
    realizedPnL: unknown;
    closeReason: string | null;
  },
  historicalTrades: { realizedPnL: unknown; openAmount: unknown }[]
): number[] {
  const cost = Math.max(1, Math.abs(Number(trade.openAmount)));
  const pnl = Number(trade.realizedPnL);
  const pnlPercent = cost > 0 ? pnl / cost : 0;

  // Target profit % - use actual return clamped to 0-1 (0-100%)
  const targetProfit = Math.max(0, Math.min(1, pnlPercent));

  // Stop loss % - estimate from historical losses
  const losses = historicalTrades
    .map((t) => {
      const c = Math.max(1, Math.abs(Number(t.openAmount)));
      const p = Number(t.realizedPnL);
      return c > 0 ? Math.min(0, p / c) : 0;
    })
    .filter((l) => l < 0);
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0.2;
  const stopLoss = Math.min(1, avgLoss);

  // Exit timing - classify based on actual exit
  let exitTiming: number[] = [0, 0, 0]; // [early, at_target, expiration]
  const holdDays =
    (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
    (24 * 60 * 60 * 1000);
  const dteAtEntry = trade.expiration
    ? (new Date(trade.expiration).getTime() - new Date(trade.openDate).getTime()) /
      (24 * 60 * 60 * 1000)
    : 45;

  if (trade.closeReason === 'expired' || (trade.expiration && holdDays >= dteAtEntry * 0.9)) {
    exitTiming = [0, 0, 1]; // expiration
  } else if (pnlPercent >= 0.5 && holdDays < dteAtEntry * 0.5) {
    exitTiming = [0, 1, 0]; // at_target (early win)
  } else {
    exitTiming = [1, 0, 0]; // early
  }

  // Roll probability - 1 if rolled, 0 otherwise
  const rollProb = trade.closeReason === 'rolled' ? 1 : 0;

  return [targetProfit, stopLoss, ...exitTiming, rollProb];
}

// ============================================================================
// Feature Extraction for Prediction
// ============================================================================

async function extractExitFeatures(
  userId: string,
  position: {
    symbol: string;
    firstEntryDate: Date;
    avgPrice: unknown;
    strike: unknown;
    expiration: Date | null;
    quantity: unknown;
    optionType: string | null;
    side: string;
  }
): Promise<FeatureVector> {
  const now = new Date();

  // Get historical trades for this symbol
  const historicalTrades = await prisma.realizedClose.findMany({
    where: {
      userId,
      symbol: position.symbol,
      closeType: 'option',
    },
    orderBy: { closeDate: 'desc' },
    take: 50,
  });

  const features = new Array(NUM_FEATURES).fill(0.5);

  const avgPrice = Math.abs(Number(position.avgPrice));
  const strike = Number(position.strike);
  const optionType = (position.optionType ?? '').toLowerCase();
  const positionSide = position.side.toLowerCase();
  let underlyingPrice: number | null = null;

  try {
    const quote = await ensureQuoteCached(position.symbol, {
      triggerSource: 'options-exit-features',
      allowStaleOnError: true,
    });
    underlyingPrice = quote.price;
  } catch {
    underlyingPrice = null;
  }

  // Current P&L % proxy from intrinsic value vs entry premium.
  if (Number.isFinite(underlyingPrice) && Number.isFinite(strike) && strike > 0 && avgPrice > 0) {
    const intrinsicValue = optionType === 'put'
      ? Math.max(0, strike - (underlyingPrice as number))
      : Math.max(0, (underlyingPrice as number) - strike);
    const signedReturn = positionSide === 'short'
      ? (avgPrice - intrinsicValue) / avgPrice
      : (intrinsicValue - avgPrice) / avgPrice;
    features[0] = toNormalizedReturn(signedReturn);
  }

  // Days held
  const daysHeld = (now.getTime() - new Date(position.firstEntryDate).getTime()) / (24 * 60 * 60 * 1000);
  features[1] = Math.min(1, daysHeld / 60);

  // DTE remaining
  if (position.expiration) {
    const dteRemaining =
      (new Date(position.expiration).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    features[2] = Math.max(0, Math.min(1, dteRemaining / 60));
  }

  // Premium captured % (estimate)
  if (Number.isFinite(underlyingPrice) && Number.isFinite(strike) && strike > 0 && avgPrice > 0) {
    const intrinsicValue = optionType === 'put'
      ? Math.max(0, strike - (underlyingPrice as number))
      : Math.max(0, (underlyingPrice as number) - strike);
    const premiumCaptured = positionSide === 'short'
      ? (avgPrice - intrinsicValue) / avgPrice
      : (intrinsicValue - avgPrice) / avgPrice;
    features[3] = clamp((premiumCaptured + 1) / 2, 0, 1);
  }

  // Distance to strike
  if (Number.isFinite(underlyingPrice) && Number.isFinite(strike) && strike > 0) {
    features[4] = Math.min(1, Math.abs((underlyingPrice as number) - strike) / strike / 0.2);
  }

  // Is ITM from live underlying price.
  if (Number.isFinite(underlyingPrice) && Number.isFinite(strike) && strike > 0) {
    if (optionType === 'call') {
      features[5] = (underlyingPrice as number) > strike ? 1 : 0;
    } else if (optionType === 'put') {
      features[5] = (underlyingPrice as number) < strike ? 1 : 0;
    }
  }

  // Theta decay rate
  const dteAtEntry = position.expiration
    ? (new Date(position.expiration).getTime() - new Date(position.firstEntryDate).getTime()) /
      (24 * 60 * 60 * 1000)
    : 30;
  features[6] = dteAtEntry > 0 ? Math.min(1, 1 / dteAtEntry) : 0.5;

  // Historical metrics
  if (historicalTrades.length > 0) {
    const holdDays = historicalTrades.map(
      (t) =>
        (new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (24 * 60 * 60 * 1000)
    );
    features[7] = Math.min(1, (holdDays.reduce((a, b) => a + b, 0) / holdDays.length) / 60);

    const pnlPcts = historicalTrades.map((t) => toReturnRatio(t.realizedPnL, t.openAmount));
    const avgExit = average(pnlPcts);
    features[8] = Math.max(0, Math.min(1, avgExit + 0.5));

    const recentPnls = pnlPcts.slice(0, 5);
    const recentAvg = average(recentPnls);
    features[9] = Math.max(0, Math.min(1, recentAvg + 0.5));

    const currentReturn = features[0] * 2 - 1;
    features[10] = calculateLocalWinRate(pnlPcts, currentReturn);

    const holdIfLonger = historicalTrades
      .filter((trade) => {
        const holdDuration =
          (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
          (24 * 60 * 60 * 1000);
        return holdDuration >= daysHeld;
      })
      .map((trade) => toReturnRatio(trade.realizedPnL, trade.openAmount));
    features[11] = clamp(average(holdIfLonger) + 0.5, 0, 1);

    const holdIfClosed = historicalTrades
      .filter((trade) => {
        const holdDuration =
          (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) /
          (24 * 60 * 60 * 1000);
        return holdDuration <= daysHeld;
      })
      .map((trade) => toReturnRatio(trade.realizedPnL, trade.openAmount));
    features[12] = clamp(average(holdIfClosed) + 0.5, 0, 1);

    // Roll success rate
    const rolls = historicalTrades.filter((t) => t.closeReason === 'rolled');
    const rollWins = rolls.filter((t) => Number(t.realizedPnL) > 0).length;
    features[13] = rolls.length > 0 ? rollWins / rolls.length : 0.5;
  }

  return {
    featureType: 'position_health',
    symbol: position.symbol,
    features,
    featureNames: EXIT_STRATEGY_FEATURE_NAMES,
    computedAt: now,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function toReturnRatio(realizedPnL: unknown, openAmount: unknown): number {
  const pnl = Number(realizedPnL);
  const deploymentCost = Math.max(1, Math.abs(Number(openAmount)));
  if (!Number.isFinite(pnl) || !Number.isFinite(deploymentCost) || deploymentCost <= 0) return 0;
  return pnl / deploymentCost;
}

function toNormalizedReturn(rawReturn: number): number {
  return clamp((clamp(rawReturn, -1, 1) + 1) / 2, 0, 1);
}

function calculateLocalWinRate(returns: number[], targetReturn: number): number {
  if (returns.length === 0) return 0.5;

  const neighborhood = returns.filter((value) => Math.abs(value - targetReturn) <= 0.1);
  if (neighborhood.length >= 3) {
    return neighborhood.filter((value) => value > 0).length / neighborhood.length;
  }

  const nearest = [...returns]
    .sort((a, b) => Math.abs(a - targetReturn) - Math.abs(b - targetReturn))
    .slice(0, Math.min(5, returns.length));
  return nearest.filter((value) => value > 0).length / nearest.length;
}

function calculateStatisticalExit(features: number[]): number[] {
  // Use historical patterns from features
  const historicalExitPoint = features[8];
  const rollSuccessRate = features[13];
  const dteRemaining = features[2];

  // Target profit: based on historical exit point
  const targetProfit = Math.min(0.7, historicalExitPoint * 1.5);

  // Stop loss: typically 50% of premium
  const stopLoss = 0.5;

  // Exit timing probabilities
  let exitTiming: number[];
  if (dteRemaining < 0.1) {
    exitTiming = [0.2, 0.2, 0.6]; // Near expiration
  } else if (dteRemaining > 0.5) {
    exitTiming = [0.5, 0.4, 0.1]; // Plenty of time
  } else {
    exitTiming = [0.3, 0.5, 0.2]; // Mid-term
  }

  // Roll probability
  const rollProb = dteRemaining < 0.15 ? rollSuccessRate : 0.1;

  return [targetProfit, stopLoss, ...exitTiming, rollProb];
}

function createFallbackExitStrategy(): ExitStrategyResult {
  return {
    targetProfitPercent: 50,
    stopLossPercent: 50,
    exitTiming: 'at_target',
    exitTimingProbabilities: {
      early: 0.3,
      at_target: 0.5,
      expiration: 0.2,
    },
    rollProbability: 0.2,
    confidence: 0.3,
    reasoning: ['Using default exit strategy - train model for personalized recommendations'],
  };
}

function generateExitReasoning(
  position: { symbol: string; optionType: string | null; strategy: string | null },
  targetProfit: number,
  stopLoss: number,
  exitTiming: ExitTiming,
  rollProb: number
): string[] {
  const reasons: string[] = [];

  if (targetProfit >= 50) {
    reasons.push(`Target ${targetProfit.toFixed(0)}% profit based on your historical exits`);
  } else {
    reasons.push(`Conservative ${targetProfit.toFixed(0)}% target for this setup`);
  }

  if (stopLoss <= 30) {
    reasons.push('Tight stop loss recommended due to risk profile');
  } else {
    reasons.push(`${stopLoss.toFixed(0)}% stop loss based on your loss tolerance`);
  }

  switch (exitTiming) {
    case 'early':
      reasons.push('Consider closing early if target is hit quickly');
      break;
    case 'at_target':
      reasons.push('Hold until target profit is reached');
      break;
    case 'expiration':
      reasons.push('Position favors holding closer to expiration');
      break;
  }

  if (rollProb > 0.5) {
    reasons.push('High probability of rolling based on your patterns');
  }

  return reasons;
}
