import type { StockTradeObservation, WeightedStockPerformance } from './types';
export { clamp } from '../math-utils';
import { clamp } from '../math-utils';

const DEFAULT_HALF_LIFE_DAYS = 120;

export function calculateRecencyWeight(
  closeDate: Date,
  now = new Date(),
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS
): number {
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - closeDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = values.reduce((sum, value, i) => sum + value * weights[i], 0);
  return weightedSum / totalWeight;
}

function weightedStd(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const mean = weightedMean(values, weights);
  const variance = weightedMean(values.map((v) => (v - mean) ** 2), weights);
  return Math.sqrt(Math.max(0, variance));
}

function weightedQuantile(values: number[], weights: number[], quantile: number): number {
  if (values.length === 0) return 0;

  const entries = values.map((value, index) => ({ value, weight: Math.max(0, weights[index]) }));
  entries.sort((a, b) => a.value - b.value);

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return entries[Math.floor(entries.length * quantile)]?.value ?? 0;

  const target = clamp(quantile, 0, 1) * totalWeight;
  let cumulative = 0;

  for (const entry of entries) {
    cumulative += entry.weight;
    if (cumulative >= target) return entry.value;
  }

  return entries[entries.length - 1].value;
}

function effectiveSampleSize(weights: number[]): number {
  if (weights.length === 0) return 0;
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const sumSquares = weights.reduce((acc, value) => acc + value * value, 0);
  if (sumSquares === 0) return 0;
  return (sum * sum) / sumSquares;
}

export function computeWeightedPerformance(
  observations: StockTradeObservation[],
  now = new Date()
): WeightedStockPerformance {
  if (observations.length === 0) {
    return {
      tradeCount: 0,
      effectiveSampleSize: 0,
      weightedWinRate: 0.5,
      weightedAvgReturnPct: 0,
      weightedVolatilityPct: 0,
      weightedDownsidePct: -8,
      weightedAvgHoldDays: 0,
    };
  }

  const weights = observations.map((obs) => calculateRecencyWeight(obs.closeDate, now));
  const returns = observations.map((obs) => obs.returnPct);
  const holdDays = observations.map((obs) => obs.holdDays);
  const wins = observations.map((obs) => (obs.returnPct > 0 ? 1 : 0));

  const downsideReturns = returns.map((value) => (value < 0 ? value : 0));
  const downsideCutoff = weightedQuantile(downsideReturns, weights, 0.3);

  return {
    tradeCount: observations.length,
    effectiveSampleSize: effectiveSampleSize(weights),
    weightedWinRate: weightedMean(wins, weights),
    weightedAvgReturnPct: weightedMean(returns, weights),
    weightedVolatilityPct: weightedStd(returns, weights),
    weightedDownsidePct: Math.min(-2, downsideCutoff),
    weightedAvgHoldDays: weightedMean(holdDays, weights),
  };
}

export function shrinkToBaseline(
  symbolPerf: WeightedStockPerformance,
  baselinePerf: WeightedStockPerformance,
  priorStrength = 12
): WeightedStockPerformance {
  if (symbolPerf.tradeCount === 0) return baselinePerf;

  const n = symbolPerf.effectiveSampleSize;
  const alpha = n / (n + priorStrength);
  const beta = 1 - alpha;

  return {
    ...symbolPerf,
    weightedWinRate: alpha * symbolPerf.weightedWinRate + beta * baselinePerf.weightedWinRate,
    weightedAvgReturnPct:
      alpha * symbolPerf.weightedAvgReturnPct + beta * baselinePerf.weightedAvgReturnPct,
    weightedVolatilityPct:
      alpha * symbolPerf.weightedVolatilityPct + beta * baselinePerf.weightedVolatilityPct,
    weightedDownsidePct:
      alpha * symbolPerf.weightedDownsidePct + beta * baselinePerf.weightedDownsidePct,
    weightedAvgHoldDays:
      alpha * symbolPerf.weightedAvgHoldDays + beta * baselinePerf.weightedAvgHoldDays,
  };
}

export interface BlendedStockSignal {
  winRate: number;
  expectedReturnPct: number;
  downsidePct: number;
  confidence: number; // 0-1
}

export function blendWithCommunity(
  personalPerf: WeightedStockPerformance,
  community: { winRate: number; avgReturnPct: number; confidence: number } | null
): BlendedStockSignal {
  if (!community) {
    const confidence = clamp(
      0.25
      + Math.min(personalPerf.effectiveSampleSize / 25, 0.5)
      + Math.max(0, 0.25 - personalPerf.weightedVolatilityPct / 120),
      0.2,
      0.95
    );

    return {
      winRate: personalPerf.weightedWinRate,
      expectedReturnPct: personalPerf.weightedAvgReturnPct,
      downsidePct: personalPerf.weightedDownsidePct,
      confidence,
    };
  }

  const communityWeight = clamp(0.15 + community.confidence * 0.35, 0.15, 0.45);
  const personalWeight = 1 - communityWeight;

  const confidence = clamp(
    personalWeight * Math.min(personalPerf.effectiveSampleSize / 20, 1)
    + communityWeight * community.confidence,
    0.25,
    0.96
  );

  return {
    winRate: personalWeight * personalPerf.weightedWinRate + communityWeight * community.winRate,
    expectedReturnPct:
      personalWeight * personalPerf.weightedAvgReturnPct
      + communityWeight * community.avgReturnPct,
    downsidePct: personalPerf.weightedDownsidePct,
    confidence,
  };
}

export interface DecisionInput {
  symbol: string;
  pnlPercent: number;
  dayChangePercent: number;
  blendedSignal: BlendedStockSignal;
  ageDays: number;
  communityRecommendation?: 'strong_buy' | 'buy' | 'neutral' | 'avoid';
}

export interface DecisionResult {
  type: 'add_position' | 'consider_exit' | 'reduce_risk' | 'hold_winner';
  priority: 'high' | 'medium' | 'low';
  title: string;
  recommendation: string;
}

export function decideStockAction(input: DecisionInput): DecisionResult | null {
  const conviction = input.blendedSignal.winRate - 0.5;
  const takeProfitThreshold = clamp(
    Math.max(6, input.blendedSignal.expectedReturnPct * 0.8),
    6,
    20
  );
  const stopLossThreshold = Math.min(-5, input.blendedSignal.downsidePct);

  const isCommunityBearish = input.communityRecommendation === 'avoid';

  if (
    input.pnlPercent <= stopLossThreshold
    || (conviction < 0 && input.dayChangePercent < -2 && input.pnlPercent < 0)
    || (isCommunityBearish && input.pnlPercent < -2)
  ) {
    return {
      type: 'consider_exit',
      priority: input.pnlPercent <= stopLossThreshold - 2 ? 'high' : 'medium',
      title: `Cut risk on ${input.symbol}`,
      recommendation: 'Tighten risk: trim or exit to protect capital.',
    };
  }

  if (input.pnlPercent >= takeProfitThreshold && conviction < 0.1) {
    return {
      type: 'reduce_risk',
      priority: input.pnlPercent > takeProfitThreshold + 4 ? 'high' : 'medium',
      title: `De-risk gains on ${input.symbol}`,
      recommendation: 'Take partial profits while edge is modest.',
    };
  }

  if (conviction >= 0.12 && input.dayChangePercent > -1 && input.pnlPercent <= 12) {
    return {
      type: 'add_position',
      priority: input.pnlPercent < 5 ? 'medium' : 'low',
      title: `Scale into ${input.symbol}`,
      recommendation: 'Model edge is favorable and trend is supportive.',
    };
  }

  if (conviction >= 0.08 && input.pnlPercent >= 0 && input.ageDays <= 180) {
    return {
      type: 'hold_winner',
      priority: 'low',
      title: `Hold ${input.symbol}`,
      recommendation: 'Edge remains positive; continue to monitor.',
    };
  }

  return null;
}
