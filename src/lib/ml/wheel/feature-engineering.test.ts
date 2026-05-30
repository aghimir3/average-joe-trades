/**
 * Feature Engineering Tests for Wheel Strategy ML
 *
 * Unit tests for feature extraction and conversion functions.
 * Tests data transformation logic without database access.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the logger before importing
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brokerPosition: { findFirst: vi.fn().mockResolvedValue(null) },
    realizedClose: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    derivedPosition: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Import types
import type { WheelCandidateFeatures, StrikeDteFeatures, RollDecisionFeatures } from './types';

// ============================================================================
// Helper Functions (extracted for testing)
// These mirror the logic from feature-engineering.ts
// ============================================================================

/**
 * Convert candidate features to numeric array for model input
 */
function candidateFeaturesToArray(features: WheelCandidateFeatures): number[] {
  return [
    features.estimatedIvRank / 100, // Normalize to 0-1
    features.avgPremiumToStrikeRatio,
    features.premiumTrend,
    features.userWheelWinRate,
    Math.min(features.userWheelTradesCount / 100, 1), // Cap and normalize
    features.userAvgPremiumCaptured / 1000, // Normalize to typical range
    features.userAvgHoldDays / 45, // Normalize (45 days typical max)
    features.userAssignmentRate,
    features.priceChange30d / 100, // Normalize percentage
    Math.min(features.daysSinceLastWheelTrade / 365, 1), // Normalize (cap at 1 year)
    features.hasOpenPosition ? 1 : 0,
    features.todayWinRate, // Already 0-1
  ];
}

/**
 * Convert strike features to numeric array for model input
 */
function strikeFeaturesToArray(features: StrikeDteFeatures): number[] {
  return [
    features.direction === 'csp' ? 0 : 1,
    features.avgPremiumPctByDte.dte_7_14,
    features.avgPremiumPctByDte.dte_14_30,
    features.avgPremiumPctByDte.dte_30_45,
    features.recentPremiumTrend,
    features.userPreferredDte / 60, // Normalize
    features.userAvgStrikeDistance,
    Math.min(features.tradesOnSymbol / 50, 1), // Cap and normalize
    features.winRateOnSymbol,
  ];
}

/**
 * Convert roll features to numeric array for model input
 */
function rollFeaturesToArray(features: RollDecisionFeatures): number[] {
  return [
    features.daysToExpiration / 60, // Normalize
    features.isItm ? 1 : 0,
    features.distanceToStrike,
    features.premiumCapturedPct,
    features.rollCredit / 500, // Normalize typical credit
    features.stockTrend7d / 10, // Normalize percentage
    features.userRollWinRate,
  ];
}

/**
 * Calculate premium by DTE bucket
 */
function calculatePremiumByDteBucket(
  trades: Array<{ openDate: Date | string; closeDate: Date | string; openAmount: unknown; strike: unknown }>
): StrikeDteFeatures['avgPremiumPctByDte'] {
  const buckets: Record<string, number[]> = {
    dte_7_14: [],
    dte_14_30: [],
    dte_30_45: [],
    dte_45_plus: [],
  };

  for (const trade of trades) {
    const holdDays = Math.ceil(
      (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const strike = Number(trade.strike) || 100;
    const premiumPct = (Math.abs(Number(trade.openAmount)) / strike) * 100;

    if (holdDays <= 14) {
      buckets.dte_7_14.push(premiumPct);
    } else if (holdDays <= 30) {
      buckets.dte_14_30.push(premiumPct);
    } else if (holdDays <= 45) {
      buckets.dte_30_45.push(premiumPct);
    } else {
      buckets.dte_45_plus.push(premiumPct);
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    dte_7_14: avg(buckets.dte_7_14),
    dte_14_30: avg(buckets.dte_14_30),
    dte_30_45: avg(buckets.dte_30_45),
    dte_45_plus: avg(buckets.dte_45_plus),
  };
}

/**
 * Calculate user's preferred DTE (mode)
 */
function calculatePreferredDte(trades: Array<{ openDate: Date | string; closeDate: Date | string }>): number {
  if (trades.length === 0) return 30;

  const holdDays = trades.map((t) =>
    Math.ceil((new Date(t.closeDate).getTime() - new Date(t.openDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  // Mode calculation
  const counts: Record<number, number> = {};
  for (const days of holdDays) {
    const bucket = Math.round(days / 7) * 7; // Round to nearest week
    counts[bucket] = (counts[bucket] || 0) + 1;
  }

  let mode = 30;
  let maxCount = 0;
  for (const [bucket, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mode = Number(bucket);
    }
  }

  return mode;
}

/**
 * Calculate average strike distance
 */
function calculateAvgStrikeDistance(
  trades: Array<{ strike: unknown; underlyingPriceAtOpen: unknown }>
): number {
  const distances = trades
    .filter((t) => t.strike && Number(t.strike) > 0 && t.underlyingPriceAtOpen && Number(t.underlyingPriceAtOpen) > 0)
    .map((t) => {
      const strike = Number(t.strike);
      const stockPrice = Number(t.underlyingPriceAtOpen);
      return Math.abs(strike - stockPrice) / stockPrice;
    });

  return distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0.05;
}

/**
 * Calculate win rate by DTE bucket
 */
function calculateWinRateByDteBucket(
  trades: Array<{ openDate: Date | string; closeDate: Date | string; realizedPnL: unknown }>
): Record<string, number> {
  const buckets: Record<string, { wins: number; total: number }> = {
    'dte_7_14': { wins: 0, total: 0 },
    'dte_14_30': { wins: 0, total: 0 },
    'dte_30_45': { wins: 0, total: 0 },
    'dte_45_plus': { wins: 0, total: 0 },
  };

  for (const trade of trades) {
    const holdDays = Math.ceil(
      (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const isWin = Number(trade.realizedPnL) > 0;

    let bucket: string;
    if (holdDays <= 14) bucket = 'dte_7_14';
    else if (holdDays <= 30) bucket = 'dte_14_30';
    else if (holdDays <= 45) bucket = 'dte_30_45';
    else bucket = 'dte_45_plus';

    buckets[bucket].total++;
    if (isWin) buckets[bucket].wins++;
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets)) {
    result[key] = value.total > 0 ? value.wins / value.total : 0;
  }

  return result;
}

/**
 * Calculate day-of-week win rate patterns
 */
function calculateDayOfWeekStats(
  trades: Array<{ openDate: Date | string; realizedPnL: unknown }>,
  referenceDate?: Date
): { bestDay: number; worstDay: number; todayWinRate: number } {
  const defaults = { bestDay: 1, worstDay: 5, todayWinRate: 0.5 };

  if (trades.length < 10) {
    return defaults;
  }

  const dayStats: Array<{ wins: number; total: number }> = Array(7)
    .fill(null)
    .map(() => ({ wins: 0, total: 0 }));

  for (const trade of trades) {
    const openDate = new Date(trade.openDate);
    const dayOfWeek = openDate.getDay();
    const isWin = Number(trade.realizedPnL) > 0;

    dayStats[dayOfWeek].total++;
    if (isWin) dayStats[dayOfWeek].wins++;
  }

  const dayWinRates = dayStats.map((stat, day) => ({
    day,
    winRate: stat.total >= 3 ? stat.wins / stat.total : 0.5,
    trades: stat.total,
  }));

  const daysWithData = dayWinRates.filter((d) => d.trades >= 3);

  if (daysWithData.length === 0) {
    return defaults;
  }

  const sorted = [...daysWithData].sort((a, b) => b.winRate - a.winRate);
  const bestDay = sorted[0].day;
  const worstDay = sorted[sorted.length - 1].day;

  const today = (referenceDate ?? new Date()).getDay();
  const todayWinRate = dayStats[today].total >= 3 ? dayStats[today].wins / dayStats[today].total : 0.5;

  return { bestDay, worstDay, todayWinRate };
}

/**
 * Calculate price change over 30 days
 */
function calculatePriceChange30d(
  trades: Array<{ openDate: Date | string; openPrice: unknown; closePrice: unknown }>
): number {
  if (trades.length < 2) return 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTrades = trades.filter((t) => new Date(t.openDate) > thirtyDaysAgo);
  if (recentTrades.length < 2) return 0;

  const sortedByDate = [...recentTrades].sort(
    (a, b) => new Date(a.openDate).getTime() - new Date(b.openDate).getTime()
  );
  const firstPrice = Number(sortedByDate[0].openPrice);
  const lastPrice = Number(sortedByDate[sortedByDate.length - 1].closePrice);

  return firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
}

// ============================================================================
// Tests
// ============================================================================

describe('Feature Engineering - Candidate Features', () => {
  describe('candidateFeaturesToArray', () => {
    const baseFeatures: WheelCandidateFeatures = {
      symbol: 'AAPL',
      currentPrice: 150,
      currentShares: 100,
      unrealizedPnl: 500,
      estimatedIvRank: 50,
      avgPremiumToStrikeRatio: 0.02,
      premiumTrend: 0,
      userWheelTradesCount: 20,
      userWheelWinRate: 0.7,
      userAvgPremiumCaptured: 150,
      userAvgHoldDays: 21,
      userAssignmentRate: 0.15,
      userTotalPnlOnSymbol: 3000,
      priceAtFirstTrade: 140,
      priceAtLastTrade: 155,
      priceChange30d: 5,
      daysSinceLastWheelTrade: 14,
      hasOpenPosition: true,
      bestDayOfWeek: 1,
      worstDayOfWeek: 5,
      todayWinRate: 0.65,
    };

    it('converts all features to correct array length', () => {
      const array = candidateFeaturesToArray(baseFeatures);
      expect(array.length).toBe(12);
    });

    it('normalizes IV rank to 0-1 range', () => {
      const features = { ...baseFeatures, estimatedIvRank: 75 };
      const array = candidateFeaturesToArray(features);
      expect(array[0]).toBe(0.75);
    });

    it('caps trade count at 1 when over 100', () => {
      const features = { ...baseFeatures, userWheelTradesCount: 150 };
      const array = candidateFeaturesToArray(features);
      expect(array[4]).toBe(1); // Should be capped at 1
    });

    it('normalizes premium captured correctly', () => {
      const features = { ...baseFeatures, userAvgPremiumCaptured: 500 };
      const array = candidateFeaturesToArray(features);
      expect(array[5]).toBe(0.5); // 500/1000
    });

    it('normalizes hold days with 45-day base', () => {
      const features = { ...baseFeatures, userAvgHoldDays: 30 };
      const array = candidateFeaturesToArray(features);
      expect(array[6]).toBeCloseTo(30 / 45, 5);
    });

    it('converts boolean position to 0/1', () => {
      const withPosition = { ...baseFeatures, hasOpenPosition: true };
      const withoutPosition = { ...baseFeatures, hasOpenPosition: false };

      expect(candidateFeaturesToArray(withPosition)[10]).toBe(1);
      expect(candidateFeaturesToArray(withoutPosition)[10]).toBe(0);
    });

    it('preserves win rates directly', () => {
      const features = { ...baseFeatures, userWheelWinRate: 0.8, todayWinRate: 0.9 };
      const array = candidateFeaturesToArray(features);
      expect(array[3]).toBe(0.8);
      expect(array[11]).toBe(0.9);
    });

    it('handles extreme values gracefully', () => {
      const extreme: WheelCandidateFeatures = {
        ...baseFeatures,
        estimatedIvRank: 100,
        userWheelTradesCount: 1000,
        userAvgPremiumCaptured: 10000,
        userAvgHoldDays: 90,
        priceChange30d: 50,
        daysSinceLastWheelTrade: 730, // 2 years
      };

      const array = candidateFeaturesToArray(extreme);

      expect(array[0]).toBe(1); // IV rank maxes at 1
      expect(array[4]).toBe(1); // Trade count capped at 1
      expect(array[9]).toBe(1); // Days since last trade capped at 1
    });
  });
});

describe('Feature Engineering - Strike Features', () => {
  describe('strikeFeaturesToArray', () => {
    const baseFeatures: StrikeDteFeatures = {
      symbol: 'AAPL',
      currentPrice: 150,
      direction: 'csp',
      avgPremiumPctByDte: {
        dte_7_14: 1.5,
        dte_14_30: 2.0,
        dte_30_45: 2.5,
        dte_45_plus: 3.0,
      },
      recentPremiumTrend: 0.1,
      userPreferredDte: 30,
      userAvgStrikeDistance: 0.05,
      userWinRateByDteBucket: {},
      userWinRateByStrikeDistance: {},
      avgMoveOverHoldPeriod: 0.03,
      assignmentRateByStrikeDistance: {},
      tradesOnSymbol: 25,
      winRateOnSymbol: 0.72,
      avgPnlOnSymbol: 150,
      lastTradeDate: new Date(),
    };

    it('converts features to correct array length', () => {
      const array = strikeFeaturesToArray(baseFeatures);
      expect(array.length).toBe(9);
    });

    it('encodes CSP direction as 0', () => {
      const features = { ...baseFeatures, direction: 'csp' as const };
      const array = strikeFeaturesToArray(features);
      expect(array[0]).toBe(0);
    });

    it('encodes CC direction as 1', () => {
      const features = { ...baseFeatures, direction: 'covered_call' as const };
      const array = strikeFeaturesToArray(features);
      expect(array[0]).toBe(1);
    });

    it('preserves premium percentages by DTE', () => {
      const array = strikeFeaturesToArray(baseFeatures);
      expect(array[1]).toBe(1.5); // dte_7_14
      expect(array[2]).toBe(2.0); // dte_14_30
      expect(array[3]).toBe(2.5); // dte_30_45
    });

    it('normalizes preferred DTE with 60-day base', () => {
      const features = { ...baseFeatures, userPreferredDte: 45 };
      const array = strikeFeaturesToArray(features);
      expect(array[5]).toBe(0.75); // 45/60
    });

    it('caps trades on symbol at 1', () => {
      const features = { ...baseFeatures, tradesOnSymbol: 100 };
      const array = strikeFeaturesToArray(features);
      expect(array[7]).toBe(1);
    });
  });
});

describe('Feature Engineering - Roll Features', () => {
  describe('rollFeaturesToArray', () => {
    const baseFeatures: RollDecisionFeatures = {
      symbol: 'AAPL',
      positionType: 'csp',
      strike: 145,
      daysToExpiration: 14,
      currentStockPrice: 150,
      isItm: false,
      distanceToStrike: 0.033, // ~3.3%
      premiumReceived: 200,
      premiumCapturedPct: 0.6,
      rollCredit: 100,
      stockTrend7d: 2.5,
      userRollWinRate: 0.75,
    };

    it('converts features to correct array length', () => {
      const array = rollFeaturesToArray(baseFeatures);
      expect(array.length).toBe(7);
    });

    it('normalizes days to expiration', () => {
      const features = { ...baseFeatures, daysToExpiration: 30 };
      const array = rollFeaturesToArray(features);
      expect(array[0]).toBe(0.5); // 30/60
    });

    it('converts ITM boolean correctly', () => {
      const otm = { ...baseFeatures, isItm: false };
      const itm = { ...baseFeatures, isItm: true };

      expect(rollFeaturesToArray(otm)[1]).toBe(0);
      expect(rollFeaturesToArray(itm)[1]).toBe(1);
    });

    it('normalizes roll credit correctly', () => {
      const features = { ...baseFeatures, rollCredit: 250 };
      const array = rollFeaturesToArray(features);
      expect(array[4]).toBe(0.5); // 250/500
    });

    it('normalizes stock trend correctly', () => {
      const features = { ...baseFeatures, stockTrend7d: 5 };
      const array = rollFeaturesToArray(features);
      expect(array[5]).toBe(0.5); // 5/10
    });
  });
});

describe('Feature Engineering - Premium Calculations', () => {
  describe('calculatePremiumByDteBucket', () => {
    it('groups trades into correct buckets', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-10', openAmount: -100, strike: 150 }, // 9 days -> dte_7_14
        { openDate: '2024-01-01', closeDate: '2024-01-20', openAmount: -150, strike: 150 }, // 19 days -> dte_14_30
        { openDate: '2024-01-01', closeDate: '2024-02-05', openAmount: -200, strike: 150 }, // 35 days -> dte_30_45
        { openDate: '2024-01-01', closeDate: '2024-02-20', openAmount: -250, strike: 150 }, // 50 days -> dte_45_plus
      ];

      const result = calculatePremiumByDteBucket(trades);

      expect(result.dte_7_14).toBeGreaterThan(0);
      expect(result.dte_14_30).toBeGreaterThan(0);
      expect(result.dte_30_45).toBeGreaterThan(0);
      expect(result.dte_45_plus).toBeGreaterThan(0);
    });

    it('calculates correct premium percentage', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-10', openAmount: -3, strike: 100 }, // 3% of strike
      ];

      const result = calculatePremiumByDteBucket(trades);

      expect(result.dte_7_14).toBe(3); // 3% premium
    });

    it('handles empty trades array', () => {
      const result = calculatePremiumByDteBucket([]);

      expect(result.dte_7_14).toBe(0);
      expect(result.dte_14_30).toBe(0);
      expect(result.dte_30_45).toBe(0);
      expect(result.dte_45_plus).toBe(0);
    });

    it('uses absolute value for negative premiums', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-10', openAmount: -200, strike: 100 },
        { openDate: '2024-01-01', closeDate: '2024-01-10', openAmount: 200, strike: 100 }, // Same result
      ];

      const result = calculatePremiumByDteBucket(trades);

      // Both should contribute equally
      expect(result.dte_7_14).toBe(200); // Average of 200 and 200
    });
  });

  describe('calculatePreferredDte', () => {
    it('returns 30 for empty trades', () => {
      expect(calculatePreferredDte([])).toBe(30);
    });

    it('finds mode DTE bucket', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-21' }, // 20 days -> rounds to 21
        { openDate: '2024-01-01', closeDate: '2024-01-22' }, // 21 days -> rounds to 21
        { openDate: '2024-01-01', closeDate: '2024-01-23' }, // 22 days -> rounds to 21
        { openDate: '2024-01-01', closeDate: '2024-02-15' }, // 45 days -> rounds to 42
      ];

      const result = calculatePreferredDte(trades);

      // Most trades are around 21 days
      expect(result).toBe(21);
    });
  });
});

describe('Feature Engineering - Win Rate Calculations', () => {
  describe('calculateWinRateByDteBucket', () => {
    it('calculates win rates per bucket', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-10', realizedPnL: 100 },  // Win, 9 days
        { openDate: '2024-01-01', closeDate: '2024-01-10', realizedPnL: -50 },  // Loss, 9 days
        { openDate: '2024-01-01', closeDate: '2024-01-25', realizedPnL: 100 },  // Win, 24 days
        { openDate: '2024-01-01', closeDate: '2024-01-25', realizedPnL: 100 },  // Win, 24 days
      ];

      const result = calculateWinRateByDteBucket(trades);

      expect(result.dte_7_14).toBe(0.5);  // 1/2
      expect(result.dte_14_30).toBe(1);    // 2/2
    });

    it('returns 0 for empty buckets', () => {
      const trades = [
        { openDate: '2024-01-01', closeDate: '2024-01-10', realizedPnL: 100 },
      ];

      const result = calculateWinRateByDteBucket(trades);

      expect(result.dte_30_45).toBe(0);
      expect(result.dte_45_plus).toBe(0);
    });
  });

  describe('calculateDayOfWeekStats', () => {
    it('returns defaults for few trades', () => {
      const trades = [
        { openDate: '2024-01-01', realizedPnL: 100 },
        { openDate: '2024-01-02', realizedPnL: 100 },
      ];

      const result = calculateDayOfWeekStats(trades);

      expect(result.bestDay).toBe(1);  // Default: Monday
      expect(result.worstDay).toBe(5); // Default: Friday
      expect(result.todayWinRate).toBe(0.5);
    });

    it('identifies best and worst days with sufficient data', () => {
      // Create trades across weekdays with different win rates
      // Use noon time to avoid timezone issues with date-only strings
      const trades = [];

      // Monday (day 1): 3 wins, 0 losses = 100%
      for (let i = 0; i < 3; i++) {
        trades.push({ openDate: new Date('2024-01-08T12:00:00'), realizedPnL: 100 }); // Monday
      }

      // Friday (day 5): 0 wins, 3 losses = 0%
      for (let i = 0; i < 3; i++) {
        trades.push({ openDate: new Date('2024-01-12T12:00:00'), realizedPnL: -100 }); // Friday
      }

      // Add more to reach 10 minimum
      trades.push({ openDate: new Date('2024-01-09T12:00:00'), realizedPnL: 100 }); // Tuesday
      trades.push({ openDate: new Date('2024-01-09T12:00:00'), realizedPnL: 100 }); // Tuesday
      trades.push({ openDate: new Date('2024-01-09T12:00:00'), realizedPnL: 100 }); // Tuesday
      trades.push({ openDate: new Date('2024-01-10T12:00:00'), realizedPnL: 100 }); // Wednesday

      const result = calculateDayOfWeekStats(trades);

      // Monday or Tuesday should be best (both have high win rates)
      expect([1, 2]).toContain(result.bestDay);
      // Friday should be worst
      expect(result.worstDay).toBe(5);
    });

    it('returns deterministic todayWinRate with referenceDate', () => {
      const trades = [];

      // Wednesday (day 3): 3 wins, 1 loss = 75%
      for (let i = 0; i < 3; i++) {
        trades.push({ openDate: new Date('2024-01-10T12:00:00'), realizedPnL: 100 }); // Wed
      }
      trades.push({ openDate: new Date('2024-01-10T12:00:00'), realizedPnL: -100 }); // Wed loss

      // Monday (day 1): 3 wins, 0 losses = 100%
      for (let i = 0; i < 3; i++) {
        trades.push({ openDate: new Date('2024-01-08T12:00:00'), realizedPnL: 100 }); // Mon
      }

      // Friday (day 5): 0 wins, 3 losses = 0%
      for (let i = 0; i < 3; i++) {
        trades.push({ openDate: new Date('2024-01-12T12:00:00'), realizedPnL: -100 }); // Fri
      }

      // Use a known Wednesday as referenceDate
      const wednesday = new Date('2025-06-11T12:00:00Z'); // A Wednesday
      const result = calculateDayOfWeekStats(trades, wednesday);

      // Wednesday has 3 wins / 4 total = 0.75
      expect(result.todayWinRate).toBe(0.75);

      // Use a known Friday as referenceDate
      const friday = new Date('2025-06-13T12:00:00Z'); // A Friday
      const resultFriday = calculateDayOfWeekStats(trades, friday);

      // Friday has 0 wins / 3 total = 0
      expect(resultFriday.todayWinRate).toBe(0);
    });
  });
});

describe('Feature Engineering - Strike Distance', () => {
  describe('calculateAvgStrikeDistance', () => {
    it('calculates correct distance percentage', () => {
      const trades = [
        { strike: 95, underlyingPriceAtOpen: 100 },  // 5% OTM
        { strike: 90, underlyingPriceAtOpen: 100 },  // 10% OTM
      ];

      const result = calculateAvgStrikeDistance(trades);

      expect(result).toBeCloseTo(0.075, 5); // Average of 5% and 10%
    });

    it('returns default for empty trades', () => {
      expect(calculateAvgStrikeDistance([])).toBe(0.05);
    });

    it('filters out invalid data', () => {
      const trades = [
        { strike: 95, underlyingPriceAtOpen: 100 },
        { strike: 0, underlyingPriceAtOpen: 100 },  // Invalid strike
        { strike: 90, underlyingPriceAtOpen: 0 },   // Invalid price
        { strike: null, underlyingPriceAtOpen: 100 }, // Null strike
      ];

      const result = calculateAvgStrikeDistance(trades);

      expect(result).toBe(0.05); // Only first trade is valid
    });
  });
});

describe('Feature Engineering - Price Change', () => {
  describe('calculatePriceChange30d', () => {
    it('calculates correct percentage change', () => {
      const now = new Date();
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(now.getDate() - 10);
      const twentyDaysAgo = new Date(now);
      twentyDaysAgo.setDate(now.getDate() - 20);

      const trades = [
        { openDate: twentyDaysAgo, openPrice: 100, closePrice: 105 },
        { openDate: tenDaysAgo, openPrice: 105, closePrice: 110 },
      ];

      const result = calculatePriceChange30d(trades);

      // (110 - 100) / 100 * 100 = 10%
      expect(result).toBe(10);
    });

    it('returns 0 for insufficient trades', () => {
      expect(calculatePriceChange30d([])).toBe(0);
      expect(calculatePriceChange30d([{ openDate: new Date(), openPrice: 100, closePrice: 110 }])).toBe(0);
    });

    it('returns 0 when no recent trades', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      const trades = [
        { openDate: oldDate, openPrice: 100, closePrice: 110 },
        { openDate: oldDate, openPrice: 110, closePrice: 120 },
      ];

      const result = calculatePriceChange30d(trades);

      expect(result).toBe(0);
    });
  });
});

describe('Feature Engineering - Edge Cases', () => {
  it('handles all-zero features', () => {
    const features: WheelCandidateFeatures = {
      symbol: 'TEST',
      currentPrice: 0,
      currentShares: 0,
      unrealizedPnl: 0,
      estimatedIvRank: 0,
      avgPremiumToStrikeRatio: 0,
      premiumTrend: 0,
      userWheelTradesCount: 0,
      userWheelWinRate: 0,
      userAvgPremiumCaptured: 0,
      userAvgHoldDays: 0,
      userAssignmentRate: 0,
      userTotalPnlOnSymbol: 0,
      priceAtFirstTrade: 0,
      priceAtLastTrade: 0,
      priceChange30d: 0,
      daysSinceLastWheelTrade: 0,
      hasOpenPosition: false,
      bestDayOfWeek: 0,
      worstDayOfWeek: 0,
      todayWinRate: 0,
    };

    const array = candidateFeaturesToArray(features);

    expect(array.every(v => typeof v === 'number')).toBe(true);
    expect(array.every(v => !isNaN(v))).toBe(true);
  });

  it('handles negative values appropriately', () => {
    const features: WheelCandidateFeatures = {
      symbol: 'TEST',
      currentPrice: 100,
      currentShares: 100,
      unrealizedPnl: -1000, // Big loss
      estimatedIvRank: 50,
      avgPremiumToStrikeRatio: 0.02,
      premiumTrend: -1, // Decreasing
      userWheelTradesCount: 20,
      userWheelWinRate: 0.3, // Low win rate
      userAvgPremiumCaptured: 100,
      userAvgHoldDays: 30,
      userAssignmentRate: 0.5, // High assignment
      userTotalPnlOnSymbol: -5000, // Big loss
      priceAtFirstTrade: 150,
      priceAtLastTrade: 100,
      priceChange30d: -30, // Big drop
      daysSinceLastWheelTrade: 7,
      hasOpenPosition: true,
      bestDayOfWeek: 1,
      worstDayOfWeek: 5,
      todayWinRate: 0.2,
    };

    const array = candidateFeaturesToArray(features);

    // Premium trend is passed through
    expect(array[2]).toBe(-1);
    // Price change is normalized
    expect(array[8]).toBe(-0.3); // -30/100
  });
});
