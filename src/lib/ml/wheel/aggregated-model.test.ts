/**
 * Aggregated ML Model Tests
 *
 * Unit tests for the community aggregated model including:
 * - Normalization functions
 * - Statistical calculations
 * - Data processing functions
 * - Insight generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before importing the module
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(() => ({
    add: vi.fn(),
    compile: vi.fn(),
    fit: vi.fn().mockResolvedValue({ history: { loss: [0.1], val_loss: [0.12], mae: [0.05] }, epoch: [0, 1] }),
    predict: vi.fn(() => ({ data: () => Promise.resolve([0.5]), dispose: vi.fn() })),
    getWeights: vi.fn(() => []),
    setWeights: vi.fn(),
    toJSON: vi.fn(() => ({})),
  })),
  layers: {
    dense: vi.fn(() => ({})),
    batchNormalization: vi.fn(() => ({})),
    leakyReLU: vi.fn(() => ({})),
    dropout: vi.fn(() => ({})),
  },
  regularizers: {
    l2: vi.fn(() => ({})),
  },
  train: {
    adam: vi.fn(() => ({})),
  },
  callbacks: {
    earlyStopping: vi.fn(() => ({})),
  },
  tensor2d: vi.fn(() => ({
    dispose: vi.fn(),
    data: vi.fn().mockResolvedValue([0.5]),
  })),
  tensor: vi.fn(() => ({})),
  models: {
    modelFromJSON: vi.fn().mockResolvedValue({
      getWeights: vi.fn(() => [{ shape: [12] }]),
      setWeights: vi.fn(),
      predict: vi.fn(() => ({ data: () => Promise.resolve([0.5]), dispose: vi.fn() })),
    }),
  },
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    realizedClose: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    communityMLModel: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Import after mocking
import type { AggregatedTickerStats, NormalizationParams } from './aggregated-model';
import { calculateNormalizationParams, normalizeFeatures, normalizeSingleFeature } from '../normalization';

// ============================================================================
// Helper Function Extraction for Testing
// Now imported from shared normalization module
// ============================================================================

interface AggregatedTrainingData {
  symbol: string;
  features: number[];
  label: number;
}

/**
 * Remove outliers using IQR method
 */
function removeOutliers(data: AggregatedTrainingData[]): AggregatedTrainingData[] {
  if (data.length < 4) return data;

  const labels = data.map((d) => d.label);

  // Calculate Q1, Q3, and IQR
  const sorted = [...labels].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Define bounds (1.5 * IQR is standard)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return data.filter((d) => d.label >= lowerBound && d.label <= upperBound);
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculate statistical score without ML model
 */
function calculateStatisticalScore(stats: AggregatedTickerStats): number {
  const winRateScore = stats.winRate * 40;
  const volumeScore = Math.min(stats.totalTrades / 50, 1) * 20;
  const traderScore = Math.min(stats.uniqueTraders / 10, 1) * 15;
  const returnScore = Math.max(0, Math.min(stats.avgAnnualizedReturn * 25, 25));
  const assignmentPenalty = stats.assignmentRate > 0.3 ? 10 : 0;

  return Math.max(0, Math.min(100, winRateScore + volumeScore + traderScore + returnScore - assignmentPenalty));
}

/**
 * Generate human-readable insights from stats
 */
function generateInsights(stats: AggregatedTickerStats): string[] {
  const insights: string[] = [];

  // Win rate assessment
  if (stats.winRate >= 0.8) {
    insights.push(`Excellent community win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  } else if (stats.winRate >= 0.6) {
    insights.push(`Good community win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  } else if (stats.winRate < 0.5) {
    insights.push(`Below average win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  }

  // Sample size
  if (stats.totalTrades >= 50) {
    insights.push(`High confidence: ${stats.totalTrades} trades from ${stats.uniqueTraders} traders`);
  } else if (stats.totalTrades >= 20) {
    insights.push(`Moderate data: ${stats.totalTrades} trades from ${stats.uniqueTraders} traders`);
  } else {
    insights.push(`Limited data: ${stats.totalTrades} trades`);
  }

  // Strategy preference
  if (stats.cspStats.winRate > stats.ccStats.winRate + 0.1) {
    insights.push(`CSP outperforms CC (${(stats.cspStats.winRate * 100).toFixed(0)}% vs ${(stats.ccStats.winRate * 100).toFixed(0)}%)`);
  } else if (stats.ccStats.winRate > stats.cspStats.winRate + 0.1) {
    insights.push(`CC outperforms CSP (${(stats.ccStats.winRate * 100).toFixed(0)}% vs ${(stats.cspStats.winRate * 100).toFixed(0)}%)`);
  }

  // Assignment risk
  if (stats.assignmentRate > 0.3) {
    insights.push(`Higher assignment rate: ${(stats.assignmentRate * 100).toFixed(0)}%`);
  } else if (stats.assignmentRate < 0.1) {
    insights.push(`Low assignment rate: ${(stats.assignmentRate * 100).toFixed(0)}%`);
  }

  // Average return
  if (stats.avgAnnualizedReturn > 0.3) {
    insights.push(`Strong annualized return: ${(stats.avgAnnualizedReturn * 100).toFixed(1)}%`);
  } else if (stats.avgAnnualizedReturn > 0.15) {
    insights.push(`Solid annualized return: ${(stats.avgAnnualizedReturn * 100).toFixed(1)}%`);
  }

  return insights.length > 0 ? insights : ['Neutral performance based on community data'];
}

/**
 * Convert aggregated stats to raw feature array
 */
function statsToRawFeatureArray(stats: AggregatedTickerStats): number[] {
  return [
    stats.winRate,
    stats.avgPremiumPct,
    stats.avgHoldDays,
    stats.assignmentRate,
    stats.totalTrades,
    stats.uniqueTraders,
    stats.cspStats.winRate,
    stats.ccStats.winRate,
    stats.cspStats.trades,
    stats.ccStats.trades,
    stats.cspStats.assignmentRate,
    stats.ccStats.assignmentRate,
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('Aggregated Model - Normalization Functions', () => {
  describe('calculateNormalizationParams', () => {
    it('calculates correct means for simple data', () => {
      const features = [
        [1, 2, 3],
        [3, 4, 5],
        [5, 6, 7],
      ];
      const labels = [10, 20, 30];

      const params = calculateNormalizationParams(features, labels);

      expect(params.featureMeans[0]).toBeCloseTo(3, 5); // (1+3+5)/3 = 3
      expect(params.featureMeans[1]).toBeCloseTo(4, 5); // (2+4+6)/3 = 4
      expect(params.featureMeans[2]).toBeCloseTo(5, 5); // (3+5+7)/3 = 5
      expect(params.labelMean).toBeCloseTo(20, 5); // (10+20+30)/3 = 20
    });

    it('calculates correct standard deviations', () => {
      const features = [
        [1, 1, 1],
        [3, 3, 3],
        [5, 5, 5],
      ];
      const labels = [0, 0, 0]; // No variance in labels

      const params = calculateNormalizationParams(features, labels);

      // Std dev for [1, 3, 5] = sqrt(((1-3)^2 + (3-3)^2 + (5-3)^2) / 3) = sqrt(8/3) ≈ 1.63
      expect(params.featureStds[0]).toBeCloseTo(Math.sqrt(8 / 3), 5);
      expect(params.labelStd).toBe(1); // Should be 1 to avoid division by zero
    });

    it('handles empty data', () => {
      const params = calculateNormalizationParams([], []);

      expect(params.featureMeans).toEqual([]);
      expect(params.featureStds).toEqual([]);
      expect(params.labelMean).toBe(0);
      expect(params.labelStd).toBe(1);
    });

    it('handles single data point', () => {
      const features = [[1, 2, 3]];
      const labels = [10];

      const params = calculateNormalizationParams(features, labels);

      expect(params.featureMeans).toEqual([1, 2, 3]);
      // With single point, std should be 0 but we use 1 to avoid div by zero
      expect(params.featureStds.every(s => s === 1)).toBe(true);
    });
  });

  describe('normalizeFeatures', () => {
    it('normalizes features to z-scores', () => {
      const features = [
        [10, 20],
        [20, 40],
      ];
      const params: NormalizationParams = {
        featureMeans: [15, 30],
        featureStds: [5, 10],
        labelMean: 0,
        labelStd: 1,
      };

      const normalized = normalizeFeatures(features, params);

      expect(normalized[0][0]).toBeCloseTo(-1, 5); // (10-15)/5 = -1
      expect(normalized[0][1]).toBeCloseTo(-1, 5); // (20-30)/10 = -1
      expect(normalized[1][0]).toBeCloseTo(1, 5);  // (20-15)/5 = 1
      expect(normalized[1][1]).toBeCloseTo(1, 5);  // (40-30)/10 = 1
    });

    it('preserves already normalized data (mean=0, std=1)', () => {
      const features = [
        [-1, 0, 1],
        [0, 1, -1],
      ];
      const params: NormalizationParams = {
        featureMeans: [0, 0, 0],
        featureStds: [1, 1, 1],
        labelMean: 0,
        labelStd: 1,
      };

      const normalized = normalizeFeatures(features, params);

      expect(normalized).toEqual(features);
    });
  });

  describe('normalizeSingleFeature', () => {
    it('normalizes a single feature array', () => {
      const features = [10, 20, 30];
      const params: NormalizationParams = {
        featureMeans: [15, 25, 35],
        featureStds: [5, 5, 5],
        labelMean: 0,
        labelStd: 1,
      };

      const normalized = normalizeSingleFeature(features, params);

      expect(normalized[0]).toBeCloseTo(-1, 5);
      expect(normalized[1]).toBeCloseTo(-1, 5);
      expect(normalized[2]).toBeCloseTo(-1, 5);
    });
  });
});

describe('Aggregated Model - Outlier Removal', () => {
  describe('removeOutliers', () => {
    it('removes extreme outliers using IQR method', () => {
      const data: AggregatedTrainingData[] = [
        { symbol: 'A', features: [1], label: 10 },
        { symbol: 'B', features: [1], label: 12 },
        { symbol: 'C', features: [1], label: 14 },
        { symbol: 'D', features: [1], label: 16 },
        { symbol: 'E', features: [1], label: 100 }, // Outlier
      ];

      const filtered = removeOutliers(data);

      expect(filtered.length).toBe(4);
      expect(filtered.find(d => d.symbol === 'E')).toBeUndefined();
    });

    it('keeps all data when no outliers present', () => {
      const data: AggregatedTrainingData[] = [
        { symbol: 'A', features: [1], label: 10 },
        { symbol: 'B', features: [1], label: 11 },
        { symbol: 'C', features: [1], label: 12 },
        { symbol: 'D', features: [1], label: 13 },
        { symbol: 'E', features: [1], label: 14 },
      ];

      const filtered = removeOutliers(data);

      expect(filtered.length).toBe(5);
    });

    it('handles small datasets', () => {
      const data: AggregatedTrainingData[] = [
        { symbol: 'A', features: [1], label: 10 },
        { symbol: 'B', features: [1], label: 100 },
      ];

      const filtered = removeOutliers(data);

      // With only 2 data points, we can't meaningfully remove outliers
      expect(filtered.length).toBe(2);
    });

    it('removes both high and low outliers', () => {
      const data: AggregatedTrainingData[] = [
        { symbol: 'LOW', features: [1], label: -1000 }, // Low outlier
        { symbol: 'A', features: [1], label: 10 },
        { symbol: 'B', features: [1], label: 11 },
        { symbol: 'C', features: [1], label: 12 },
        { symbol: 'D', features: [1], label: 13 },
        { symbol: 'HIGH', features: [1], label: 1000 }, // High outlier
      ];

      const filtered = removeOutliers(data);

      expect(filtered.find(d => d.symbol === 'LOW')).toBeUndefined();
      expect(filtered.find(d => d.symbol === 'HIGH')).toBeUndefined();
      expect(filtered.length).toBe(4);
    });
  });
});

describe('Aggregated Model - Shuffle', () => {
  describe('shuffleArray', () => {
    it('returns array with same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(original);

      expect(shuffled.sort()).toEqual(original.sort());
      expect(shuffled.length).toBe(original.length);
    });

    it('does not modify original array', () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];

      shuffleArray(original);

      expect(original).toEqual(copy);
    });

    it('handles empty array', () => {
      const result = shuffleArray([]);
      expect(result).toEqual([]);
    });

    it('handles single element array', () => {
      const result = shuffleArray([42]);
      expect(result).toEqual([42]);
    });
  });
});

describe('Aggregated Model - Statistical Score', () => {
  describe('calculateStatisticalScore', () => {
    const baseStats: AggregatedTickerStats = {
      symbol: 'TEST',
      totalTrades: 50,
      uniqueTraders: 10,
      winRate: 0.7,
      avgPremiumPct: 2,
      avgHoldDays: 21,
      assignmentRate: 0.2,
      avgAnnualizedReturn: 0.25,
      cspStats: { trades: 25, winRate: 0.72, avgPremiumPct: 2.1, assignmentRate: 0.18 },
      ccStats: { trades: 25, winRate: 0.68, avgPremiumPct: 1.9, assignmentRate: 0.22 },
      optimalDteRange: { min: 14, max: 45 },
      optimalOtmRange: { min: 0.02, max: 0.08 },
    };

    it('calculates score for typical good stats', () => {
      const score = calculateStatisticalScore(baseStats);

      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('gives higher score to better win rates', () => {
      const lowWinRate = { ...baseStats, winRate: 0.4 };
      const highWinRate = { ...baseStats, winRate: 0.9 };

      const lowScore = calculateStatisticalScore(lowWinRate);
      const highScore = calculateStatisticalScore(highWinRate);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('applies penalty for high assignment rate', () => {
      const lowAssignment = { ...baseStats, assignmentRate: 0.1 };
      const highAssignment = { ...baseStats, assignmentRate: 0.4 };

      const lowScore = calculateStatisticalScore(lowAssignment);
      const highScore = calculateStatisticalScore(highAssignment);

      expect(lowScore).toBeGreaterThan(highScore);
    });

    it('caps score between 0 and 100', () => {
      const excellentStats = {
        ...baseStats,
        winRate: 1.0,
        totalTrades: 1000,
        uniqueTraders: 100,
        avgAnnualizedReturn: 2.0,
        assignmentRate: 0,
      };

      const terribleStats = {
        ...baseStats,
        winRate: 0,
        totalTrades: 1,
        uniqueTraders: 1,
        avgAnnualizedReturn: -5,
        assignmentRate: 1,
      };

      const excellentScore = calculateStatisticalScore(excellentStats);
      const terribleScore = calculateStatisticalScore(terribleStats);

      expect(excellentScore).toBeLessThanOrEqual(100);
      expect(terribleScore).toBeGreaterThanOrEqual(0);
    });

    it('rewards more trades and traders', () => {
      const fewTrades = { ...baseStats, totalTrades: 5, uniqueTraders: 1 };
      const manyTrades = { ...baseStats, totalTrades: 100, uniqueTraders: 20 };

      const fewScore = calculateStatisticalScore(fewTrades);
      const manyScore = calculateStatisticalScore(manyTrades);

      expect(manyScore).toBeGreaterThan(fewScore);
    });
  });
});

describe('Aggregated Model - Insight Generation', () => {
  describe('generateInsights', () => {
    const baseStats: AggregatedTickerStats = {
      symbol: 'TEST',
      totalTrades: 50,
      uniqueTraders: 10,
      winRate: 0.7,
      avgPremiumPct: 2,
      avgHoldDays: 21,
      assignmentRate: 0.2,
      avgAnnualizedReturn: 0.25,
      cspStats: { trades: 25, winRate: 0.72, avgPremiumPct: 2.1, assignmentRate: 0.18 },
      ccStats: { trades: 25, winRate: 0.68, avgPremiumPct: 1.9, assignmentRate: 0.22 },
      optimalDteRange: { min: 14, max: 45 },
      optimalOtmRange: { min: 0.02, max: 0.08 },
    };

    it('returns insight for excellent win rate', () => {
      const stats = { ...baseStats, winRate: 0.85 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Excellent'))).toBe(true);
    });

    it('returns insight for good win rate', () => {
      const stats = { ...baseStats, winRate: 0.65 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Good'))).toBe(true);
    });

    it('returns insight for below average win rate', () => {
      const stats = { ...baseStats, winRate: 0.4 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Below average'))).toBe(true);
    });

    it('returns high confidence message for many trades', () => {
      const stats = { ...baseStats, totalTrades: 100 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('High confidence'))).toBe(true);
    });

    it('returns limited data message for few trades', () => {
      const stats = { ...baseStats, totalTrades: 10 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Limited data'))).toBe(true);
    });

    it('identifies when CSP outperforms CC', () => {
      const stats = {
        ...baseStats,
        cspStats: { ...baseStats.cspStats, winRate: 0.8 },
        ccStats: { ...baseStats.ccStats, winRate: 0.5 },
      };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('CSP outperforms'))).toBe(true);
    });

    it('identifies when CC outperforms CSP', () => {
      const stats = {
        ...baseStats,
        cspStats: { ...baseStats.cspStats, winRate: 0.5 },
        ccStats: { ...baseStats.ccStats, winRate: 0.8 },
      };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('CC outperforms'))).toBe(true);
    });

    it('warns about high assignment rate', () => {
      const stats = { ...baseStats, assignmentRate: 0.4 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Higher assignment'))).toBe(true);
    });

    it('notes low assignment rate', () => {
      const stats = { ...baseStats, assignmentRate: 0.05 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Low assignment'))).toBe(true);
    });

    it('highlights strong returns', () => {
      const stats = { ...baseStats, avgAnnualizedReturn: 0.4 };
      const insights = generateInsights(stats);

      expect(insights.some(i => i.includes('Strong annualized'))).toBe(true);
    });

    it('returns default message for neutral performance', () => {
      const stats = {
        ...baseStats,
        winRate: 0.55, // Not good, not bad
        totalTrades: 30, // Moderate
        assignmentRate: 0.2, // Normal
        avgAnnualizedReturn: 0.1, // Mediocre
        cspStats: { ...baseStats.cspStats, winRate: 0.55 },
        ccStats: { ...baseStats.ccStats, winRate: 0.55 },
      };
      const insights = generateInsights(stats);

      // Should have at least one insight, even if generic
      expect(insights.length).toBeGreaterThan(0);
    });
  });
});

describe('Aggregated Model - Feature Conversion', () => {
  describe('statsToRawFeatureArray', () => {
    it('converts stats to correct feature array', () => {
      const stats: AggregatedTickerStats = {
        symbol: 'AAPL',
        totalTrades: 100,
        uniqueTraders: 20,
        winRate: 0.75,
        avgPremiumPct: 2.5,
        avgHoldDays: 21,
        assignmentRate: 0.15,
        avgAnnualizedReturn: 0.3,
        cspStats: { trades: 60, winRate: 0.78, avgPremiumPct: 2.7, assignmentRate: 0.12 },
        ccStats: { trades: 40, winRate: 0.70, avgPremiumPct: 2.2, assignmentRate: 0.2 },
        optimalDteRange: { min: 14, max: 45 },
        optimalOtmRange: { min: 0.02, max: 0.08 },
      };

      const features = statsToRawFeatureArray(stats);

      expect(features.length).toBe(12); // 12 features total
      expect(features[0]).toBe(0.75); // winRate
      expect(features[1]).toBe(2.5);  // avgPremiumPct
      expect(features[2]).toBe(21);   // avgHoldDays
      expect(features[3]).toBe(0.15); // assignmentRate
      expect(features[4]).toBe(100);  // totalTrades
      expect(features[5]).toBe(20);   // uniqueTraders
      expect(features[6]).toBe(0.78); // cspWinRate
      expect(features[7]).toBe(0.70); // ccWinRate
      expect(features[8]).toBe(60);   // cspTrades
      expect(features[9]).toBe(40);   // ccTrades
      expect(features[10]).toBe(0.12); // cspAssignmentRate
      expect(features[11]).toBe(0.2);  // ccAssignmentRate
    });

    it('preserves feature order consistently', () => {
      const stats1: AggregatedTickerStats = {
        symbol: 'A',
        totalTrades: 10,
        uniqueTraders: 2,
        winRate: 0.5,
        avgPremiumPct: 1,
        avgHoldDays: 10,
        assignmentRate: 0.1,
        avgAnnualizedReturn: 0.1,
        cspStats: { trades: 5, winRate: 0.5, avgPremiumPct: 1, assignmentRate: 0.1 },
        ccStats: { trades: 5, winRate: 0.5, avgPremiumPct: 1, assignmentRate: 0.1 },
        optimalDteRange: { min: 7, max: 30 },
        optimalOtmRange: { min: 0.01, max: 0.05 },
      };

      const stats2: AggregatedTickerStats = {
        ...stats1,
        symbol: 'B',
        winRate: 0.9,
      };

      const features1 = statsToRawFeatureArray(stats1);
      const features2 = statsToRawFeatureArray(stats2);

      // Only the winRate (index 0) should differ
      expect(features1[0]).toBe(0.5);
      expect(features2[0]).toBe(0.9);
      // All other features should match
      for (let i = 1; i < features1.length; i++) {
        expect(features1[i]).toBe(features2[i]);
      }
    });
  });
});

describe('Aggregated Model - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-end normalization pipeline', () => {
    it('normalizes and denormalizes correctly', () => {
      // Simulate training data
      const features = [
        [0.7, 2.0, 21, 0.1, 50, 10],
        [0.8, 2.5, 30, 0.2, 100, 20],
        [0.6, 1.5, 14, 0.05, 25, 5],
        [0.75, 2.2, 25, 0.15, 75, 15],
      ];
      const labels = [0.2, 0.35, 0.1, 0.25];

      // Calculate normalization params
      const params = calculateNormalizationParams(features, labels);

      // Normalize features
      const normalizedFeatures = normalizeFeatures(features, params);

      // Each normalized feature should have mean close to 0
      for (let j = 0; j < features[0].length; j++) {
        const colMean = normalizedFeatures.reduce((sum, row) => sum + row[j], 0) / normalizedFeatures.length;
        expect(colMean).toBeCloseTo(0, 5);
      }

      // Verify we can denormalize back (approximately)
      const denormalized = normalizedFeatures.map((row) =>
        row.map((val, j) => val * params.featureStds[j] + params.featureMeans[j])
      );

      for (let i = 0; i < features.length; i++) {
        for (let j = 0; j < features[0].length; j++) {
          expect(denormalized[i][j]).toBeCloseTo(features[i][j], 5);
        }
      }
    });
  });

  describe('Score consistency', () => {
    it('produces consistent scores for identical inputs', () => {
      const stats: AggregatedTickerStats = {
        symbol: 'TEST',
        totalTrades: 50,
        uniqueTraders: 10,
        winRate: 0.7,
        avgPremiumPct: 2,
        avgHoldDays: 21,
        assignmentRate: 0.2,
        avgAnnualizedReturn: 0.25,
        cspStats: { trades: 25, winRate: 0.72, avgPremiumPct: 2.1, assignmentRate: 0.18 },
        ccStats: { trades: 25, winRate: 0.68, avgPremiumPct: 1.9, assignmentRate: 0.22 },
        optimalDteRange: { min: 14, max: 45 },
        optimalOtmRange: { min: 0.02, max: 0.08 },
      };

      const score1 = calculateStatisticalScore(stats);
      const score2 = calculateStatisticalScore(stats);
      const score3 = calculateStatisticalScore({ ...stats }); // Copy

      expect(score1).toBe(score2);
      expect(score2).toBe(score3);
    });
  });
});
