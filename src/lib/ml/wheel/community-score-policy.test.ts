import { describe, expect, it } from 'vitest';
import {
  calculateStatisticalCommunityScore,
  deriveCommunityRecommendation,
  deriveCommunityScore,
  type CommunityScoreStats,
} from './community-score-policy';

const strongCommunityStats: CommunityScoreStats = {
  winRate: 0.8,
  totalTrades: 441,
  uniqueTraders: 3,
  avgAnnualizedReturn: 1.35,
  assignmentRate: 0.07,
};

describe('community-score-policy', () => {
  it('uses statistical fallback when ML score is unavailable', () => {
    const result = deriveCommunityScore(strongCommunityStats, null);
    expect(result.method).toBe('statistical_fallback');
    expect(result.finalScore).toBeCloseTo(calculateStatisticalCommunityScore(strongCommunityStats), 6);
  });

  it('guards against contradictory ML score for strong observed outcomes', () => {
    const result = deriveCommunityScore(strongCommunityStats, 0);
    expect(result.method).toBe('blended');
    expect(result.note).toBe('contradiction_guard');
    expect(result.finalScore).toBeGreaterThan(60);
  });

  it('blends high divergence even when not a direct contradiction', () => {
    const moderateStats: CommunityScoreStats = {
      winRate: 0.58,
      totalTrades: 60,
      uniqueTraders: 4,
      avgAnnualizedReturn: 0.22,
      assignmentRate: 0.2,
    };
    const result = deriveCommunityScore(moderateStats, 0);
    expect(result.method).toBe('blended');
    expect(result.note).toBe('high_divergence');
  });

  it('does not label avoid when score is low but outcomes remain strong', () => {
    const recommendation = deriveCommunityRecommendation({
      score: 20,
      statisticalScore: 82,
      winRate: 0.79,
      assignmentRate: 0.08,
      avgAnnualizedReturn: 1.2,
    });
    expect(recommendation).toBe('neutral');
  });

  it('labels avoid when win rate is structurally weak', () => {
    const recommendation = deriveCommunityRecommendation({
      score: 48,
      statisticalScore: 30,
      winRate: 0.35,
      assignmentRate: 0.2,
      avgAnnualizedReturn: 0.1,
    });
    expect(recommendation).toBe('avoid');
  });

  it('returns strong_buy for high score and high win rate', () => {
    const recommendation = deriveCommunityRecommendation({
      score: 82,
      statisticalScore: 80,
      winRate: 0.78,
      assignmentRate: 0.1,
      avgAnnualizedReturn: 0.45,
    });
    expect(recommendation).toBe('strong_buy');
  });
});
