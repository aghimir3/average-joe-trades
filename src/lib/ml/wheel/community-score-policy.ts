/**
 * Community score policy for wheel insights.
 *
 * This module keeps community model scoring reliable by calibrating model output
 * against observed aggregate outcomes from the same community dataset.
 * It intentionally does not mix personal model or risk-engine responsibilities.
 */

export type CommunityRecommendation = 'strong_buy' | 'buy' | 'neutral' | 'avoid';

export type CommunityScoreMethod = 'ml' | 'blended' | 'statistical_fallback';

export interface CommunityScoreStats {
  winRate: number;
  totalTrades: number;
  uniqueTraders: number;
  avgAnnualizedReturn: number;
  assignmentRate: number;
}

export interface CommunityScoreComputation {
  finalScore: number;
  modelScore: number | null;
  statisticalScore: number;
  method: CommunityScoreMethod;
  divergence: number | null;
  sampleStrength: number;
  note?: 'contradiction_guard' | 'high_divergence' | 'calibrated_blend';
}

export function clampToScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function calculateSampleStrength(stats: CommunityScoreStats): number {
  return Math.min(1, stats.totalTrades / 50) * Math.min(1, stats.uniqueTraders / 5);
}

export function calculateStatisticalCommunityScore(stats: CommunityScoreStats): number {
  const winRateScore = stats.winRate * 40;
  const volumeScore = Math.min(stats.totalTrades / 50, 1) * 20;
  const traderScore = Math.min(stats.uniqueTraders / 10, 1) * 15;
  const returnScore = Math.max(0, Math.min(stats.avgAnnualizedReturn * 25, 25));
  const assignmentPenalty = stats.assignmentRate > 0.3 ? 10 : 0;

  return clampToScore(winRateScore + volumeScore + traderScore + returnScore - assignmentPenalty);
}

/**
 * Derive a stable 0-100 score for community insights.
 *
 * - If no model score exists, use statistical score.
 * - If model score strongly contradicts robust observed outcomes, anchor to stats.
 * - If model and statistical scores diverge significantly, blend conservatively.
 */
export function deriveCommunityScore(
  stats: CommunityScoreStats,
  rawModelScore: number | null
): CommunityScoreComputation {
  const statisticalScore = calculateStatisticalCommunityScore(stats);
  const sampleStrength = calculateSampleStrength(stats);

  if (rawModelScore === null || !Number.isFinite(rawModelScore)) {
    return {
      finalScore: statisticalScore,
      modelScore: null,
      statisticalScore,
      method: 'statistical_fallback',
      divergence: null,
      sampleStrength,
    };
  }

  const modelScore = clampToScore(rawModelScore);
  const divergence = Math.abs(modelScore - statisticalScore);

  const strongObservedQuality =
    sampleStrength >= 0.45 &&
    statisticalScore >= 65 &&
    stats.winRate >= 0.6 &&
    stats.avgAnnualizedReturn > 0;

  const weakObservedQuality =
    sampleStrength >= 0.45 &&
    statisticalScore <= 35 &&
    stats.winRate < 0.45;

  const contradictorySignal =
    (strongObservedQuality && modelScore <= 35) ||
    (weakObservedQuality && modelScore >= 65);

  if (contradictorySignal) {
    return {
      finalScore: clampToScore(statisticalScore * 0.85 + modelScore * 0.15),
      modelScore,
      statisticalScore,
      method: 'blended',
      divergence,
      sampleStrength,
      note: 'contradiction_guard',
    };
  }

  if (divergence >= 45) {
    return {
      finalScore: clampToScore(statisticalScore * 0.7 + modelScore * 0.3),
      modelScore,
      statisticalScore,
      method: 'blended',
      divergence,
      sampleStrength,
      note: 'high_divergence',
    };
  }

  if (divergence <= 10 && sampleStrength >= 0.4) {
    return {
      finalScore: modelScore,
      modelScore,
      statisticalScore,
      method: 'ml',
      divergence,
      sampleStrength,
    };
  }

  const modelWeight = sampleStrength >= 0.7 ? 0.65 : sampleStrength >= 0.4 ? 0.55 : 0.45;
  return {
    finalScore: clampToScore(modelScore * modelWeight + statisticalScore * (1 - modelWeight)),
    modelScore,
    statisticalScore,
    method: 'blended',
    divergence,
    sampleStrength,
    note: 'calibrated_blend',
  };
}

/**
 * Recommendation policy built on stable score + core community outcomes.
 * `avoid` requires weak underlying outcomes, not a single noisy score.
 */
export function deriveCommunityRecommendation(input: {
  score: number;
  statisticalScore: number;
  winRate: number;
  assignmentRate: number;
  avgAnnualizedReturn: number;
}): CommunityRecommendation {
  const score = clampToScore(input.score);
  const statScore = clampToScore(input.statisticalScore);

  const structuralWeakness =
    input.winRate < 0.4 ||
    (input.winRate < 0.5 && score <= 35 && statScore <= 40) ||
    (input.assignmentRate > 0.45 && input.avgAnnualizedReturn <= 0 && score <= 45);

  if (structuralWeakness) {
    return 'avoid';
  }

  if (score >= 75 && input.winRate >= 0.7) {
    return 'strong_buy';
  }

  if (score >= 60 && input.winRate >= 0.6) {
    return 'buy';
  }

  return 'neutral';
}

