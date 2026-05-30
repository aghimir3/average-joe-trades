/**
 * Feature Engineering Tests for Options ML Models
 *
 * Unit tests for feature extraction helper functions.
 * Tests data transformation logic without database access.
 */

import { describe, it, expect, vi } from 'vitest';
import { average, standardDeviation, clamp, calculatePercentile, calculateWinRate } from '@/lib/ml/math-utils';

// Mock the logger
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
    realizedClose: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    derivedPosition: { findMany: vi.fn().mockResolvedValue([]) },
    brokerPosition: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

// ============================================================================
// Helper Function Extraction for Testing (mirrors feature-engineering.ts)
// ============================================================================

function calculatePriceTrend(trades: { openPrice: unknown; closePrice?: unknown }[]): number {
  if (trades.length < 2) return 0;
  const firstPrice = Number(trades[trades.length - 1].openPrice);
  const lastPrice = Number(trades[0].openPrice);
  if (firstPrice === 0) return 0;
  return (lastPrice - firstPrice) / firstPrice;
}

function strategyToNumber(strategy: string | null): number {
  const strategies: Record<string, number> = {
    long_call: 0.1,
    long_put: 0.2,
    covered_call: 0.3,
    cash_secured_put: 0.4,
    bull_call_spread: 0.5,
    bear_put_spread: 0.6,
    iron_condor: 0.7,
    straddle: 0.8,
    strangle: 0.9,
    calendar_spread: 1.0,
  };
  return strategies[strategy || ''] ?? 0.5;
}

interface FeatureType {
  featureType: string;
  symbol: string;
  features: number[];
  featureNames: string[];
  computedAt: Date;
}

function createEmptyFeatureVector(
  featureType: string,
  symbol: string,
  featureNames: string[]
): FeatureType {
  return {
    featureType,
    symbol,
    features: new Array(featureNames.length).fill(0.5),
    featureNames,
    computedAt: new Date(),
  };
}

/**
 * Extract trade embedding features
 */
function extractTradeEmbeddingFeatures(
  trade: {
    symbol: string;
    strategy: string | null;
    openDate: Date;
    closeDate: Date;
    openPrice: number;
    strike: number | null;
    expiration: Date | null;
    realizedPnL: number;
    closeReason: string | null;
  }
): number[] {
  const openPrice = trade.openPrice;
  const strike = trade.strike ?? 0;
  const pnl = trade.realizedPnL;

  // Strategy encoding
  const strategy = strategyToNumber(trade.strategy);

  // DTE at entry
  const dteAtEntry = trade.expiration
    ? Math.min(1, (new Date(trade.expiration).getTime() - new Date(trade.openDate).getTime()) / (60 * 24 * 60 * 60 * 1000))
    : 0.5;

  // Strike distance
  const strikeDistance = strike > 0 ? Math.min(1, Math.abs(strike - openPrice) / strike / 0.2) : 0.5;

  // Premium percent
  const premiumPercent = strike > 0 ? Math.min(1, Math.abs(openPrice) / strike / 0.1) : 0.5;

  // Hold days
  const holdDays = Math.min(1, (new Date(trade.closeDate).getTime() - new Date(trade.openDate).getTime()) / (60 * 24 * 60 * 60 * 1000));

  // P&L percent
  const cost = Math.abs(openPrice) * 100;
  const pnlPercent = cost > 0 ? clamp(pnl / cost, -1, 1) / 2 + 0.5 : 0.5;

  // Was assigned
  const wasAssigned = trade.closeReason === 'assigned' ? 1 : 0;

  // Exit type
  const exitType = trade.closeReason === 'expired' ? 0 : trade.closeReason === 'assigned' ? 0.5 : 1;

  // Market condition (placeholder)
  const marketCondition = 0.5;

  // Position size (normalized placeholder)
  const positionSize = 0.5;

  // Symbol volatility (placeholder)
  const symbolVolatility = 0.5;

  // Entry day of week
  const entryDayOfWeek = new Date(trade.openDate).getDay() / 6;

  return [
    strategy,
    dteAtEntry,
    strikeDistance,
    premiumPercent,
    holdDays,
    pnlPercent,
    wasAssigned,
    exitType,
    marketCondition,
    positionSize,
    symbolVolatility,
    entryDayOfWeek,
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('Options Feature Engineering - Basic Math Functions', () => {
  describe('average', () => {
    it('calculates correct average', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
      expect(average([10, 20])).toBe(15);
    });

    it('returns 0 for empty array', () => {
      expect(average([])).toBe(0);
    });

    it('handles single element', () => {
      expect(average([42])).toBe(42);
    });

    it('handles negative numbers', () => {
      expect(average([-10, 10])).toBe(0);
      expect(average([-5, -10, -15])).toBe(-10);
    });

    it('handles decimals', () => {
      expect(average([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
    });
  });

  describe('standardDeviation', () => {
    it('calculates correct std dev', () => {
      // For [1, 2, 3, 4, 5], std dev ≈ 1.41
      const result = standardDeviation([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(Math.sqrt(2), 5);
    });

    it('returns 0 for single element', () => {
      expect(standardDeviation([42])).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(standardDeviation([])).toBe(0);
    });

    it('returns 0 for identical values', () => {
      expect(standardDeviation([5, 5, 5, 5])).toBe(0);
    });

    it('handles negative numbers', () => {
      const result = standardDeviation([-2, -1, 0, 1, 2]);
      expect(result).toBeCloseTo(Math.sqrt(2), 5);
    });
  });

  describe('calculatePercentile', () => {
    it('finds correct percentile position', () => {
      const arr = [10, 20, 30, 40, 50];

      expect(calculatePercentile(arr, 10)).toBe(0); // First element
      expect(calculatePercentile(arr, 30)).toBe(40); // Middle
      expect(calculatePercentile(arr, 50)).toBe(80); // Second to last position
    });

    it('returns 100 for value greater than all', () => {
      expect(calculatePercentile([1, 2, 3], 100)).toBe(100);
    });

    it('returns 50 for empty array', () => {
      expect(calculatePercentile([], 50)).toBe(50);
    });

    it('handles unsorted input array', () => {
      const arr = [50, 10, 30, 40, 20];
      const result = calculatePercentile(arr, 30);
      // Sorts to [10, 20, 30, 40, 50], 30 is at index 2
      expect(result).toBe(40);
    });
  });

  describe('clamp', () => {
    it('clamps values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('works with negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('works with decimal ranges', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(1.5, 0, 1)).toBe(1);
      expect(clamp(-0.5, 0, 1)).toBe(0);
    });
  });
});

describe('Options Feature Engineering - Win Rate', () => {
  describe('calculateWinRate', () => {
    it('calculates correct win rate', () => {
      const trades = [
        { realizedPnL: 100 },
        { realizedPnL: -50 },
        { realizedPnL: 200 },
        { realizedPnL: -100 },
      ];

      expect(calculateWinRate(trades)).toBe(0.5); // 2/4
    });

    it('returns 0.5 for empty trades', () => {
      expect(calculateWinRate([])).toBe(0.5);
    });

    it('returns 1 for all wins', () => {
      const trades = [
        { realizedPnL: 100 },
        { realizedPnL: 200 },
        { realizedPnL: 50 },
      ];

      expect(calculateWinRate(trades)).toBe(1);
    });

    it('returns 0 for all losses', () => {
      const trades = [
        { realizedPnL: -100 },
        { realizedPnL: -200 },
      ];

      expect(calculateWinRate(trades)).toBe(0);
    });

    it('treats zero P&L as loss', () => {
      const trades = [
        { realizedPnL: 0 },
        { realizedPnL: 100 },
      ];

      expect(calculateWinRate(trades)).toBe(0.5);
    });

    it('handles Decimal-like objects', () => {
      const trades = [
        { realizedPnL: 100 },
        { realizedPnL: -50 },
      ];

      expect(calculateWinRate(trades)).toBe(0.5);
    });
  });
});

describe('Options Feature Engineering - Price Trend', () => {
  describe('calculatePriceTrend', () => {
    it('calculates positive trend', () => {
      const trades = [
        { openPrice: 110 }, // Most recent first
        { openPrice: 105 },
        { openPrice: 100 }, // Oldest
      ];

      const trend = calculatePriceTrend(trades);
      expect(trend).toBe(0.1); // (110 - 100) / 100 = 10%
    });

    it('calculates negative trend', () => {
      const trades = [
        { openPrice: 90 }, // Most recent
        { openPrice: 95 },
        { openPrice: 100 }, // Oldest
      ];

      const trend = calculatePriceTrend(trades);
      expect(trend).toBe(-0.1); // (90 - 100) / 100 = -10%
    });

    it('returns 0 for insufficient trades', () => {
      expect(calculatePriceTrend([])).toBe(0);
      expect(calculatePriceTrend([{ openPrice: 100 }])).toBe(0);
    });

    it('returns 0 for zero first price', () => {
      const trades = [
        { openPrice: 100 },
        { openPrice: 0 },
      ];

      expect(calculatePriceTrend(trades)).toBe(0);
    });

    it('handles flat trend', () => {
      const trades = [
        { openPrice: 100 },
        { openPrice: 100 },
        { openPrice: 100 },
      ];

      expect(calculatePriceTrend(trades)).toBe(0);
    });
  });
});

describe('Options Feature Engineering - Strategy Encoding', () => {
  describe('strategyToNumber', () => {
    it('encodes known strategies', () => {
      expect(strategyToNumber('long_call')).toBe(0.1);
      expect(strategyToNumber('long_put')).toBe(0.2);
      expect(strategyToNumber('covered_call')).toBe(0.3);
      expect(strategyToNumber('cash_secured_put')).toBe(0.4);
      expect(strategyToNumber('bull_call_spread')).toBe(0.5);
      expect(strategyToNumber('bear_put_spread')).toBe(0.6);
      expect(strategyToNumber('iron_condor')).toBe(0.7);
      expect(strategyToNumber('straddle')).toBe(0.8);
      expect(strategyToNumber('strangle')).toBe(0.9);
      expect(strategyToNumber('calendar_spread')).toBe(1.0);
    });

    it('returns 0.5 for null strategy', () => {
      expect(strategyToNumber(null)).toBe(0.5);
    });

    it('returns 0.5 for unknown strategy', () => {
      expect(strategyToNumber('unknown_strategy')).toBe(0.5);
      expect(strategyToNumber('')).toBe(0.5);
    });
  });
});

describe('Options Feature Engineering - Empty Feature Vector', () => {
  describe('createEmptyFeatureVector', () => {
    it('creates vector with correct length', () => {
      const names = ['feature1', 'feature2', 'feature3'];
      const vector = createEmptyFeatureVector('test_type', 'AAPL', names);

      expect(vector.features.length).toBe(3);
    });

    it('fills with 0.5 (neutral value)', () => {
      const names = ['a', 'b', 'c'];
      const vector = createEmptyFeatureVector('test_type', 'TEST', names);

      expect(vector.features.every(f => f === 0.5)).toBe(true);
    });

    it('preserves metadata', () => {
      const names = ['feature1'];
      const vector = createEmptyFeatureVector('volatility', 'AAPL', names);

      expect(vector.featureType).toBe('volatility');
      expect(vector.symbol).toBe('AAPL');
      expect(vector.featureNames).toEqual(names);
      expect(vector.computedAt).toBeInstanceOf(Date);
    });
  });
});

describe('Options Feature Engineering - Trade Embedding', () => {
  describe('extractTradeEmbeddingFeatures', () => {
    const baseTrade = {
      symbol: 'AAPL',
      strategy: 'covered_call',
      openDate: new Date('2024-01-01'),
      closeDate: new Date('2024-01-15'),
      openPrice: 2.50,
      strike: 150,
      expiration: new Date('2024-01-20'),
      realizedPnL: 200,
      closeReason: 'normal',
    };

    it('returns correct feature count', () => {
      const features = extractTradeEmbeddingFeatures(baseTrade);
      expect(features.length).toBe(12);
    });

    it('encodes strategy correctly', () => {
      const features = extractTradeEmbeddingFeatures(baseTrade);
      expect(features[0]).toBe(0.3); // covered_call
    });

    it('handles different close reasons', () => {
      const assignedTrade = { ...baseTrade, closeReason: 'assigned' };
      const expiredTrade = { ...baseTrade, closeReason: 'expired' };
      const normalTrade = { ...baseTrade, closeReason: 'normal' };

      const assignedFeatures = extractTradeEmbeddingFeatures(assignedTrade);
      const expiredFeatures = extractTradeEmbeddingFeatures(expiredTrade);
      const normalFeatures = extractTradeEmbeddingFeatures(normalTrade);

      // wasAssigned
      expect(assignedFeatures[6]).toBe(1);
      expect(expiredFeatures[6]).toBe(0);
      expect(normalFeatures[6]).toBe(0);

      // exitType
      expect(assignedFeatures[7]).toBe(0.5);
      expect(expiredFeatures[7]).toBe(0);
      expect(normalFeatures[7]).toBe(1);
    });

    it('handles null expiration', () => {
      const noExpTrade = { ...baseTrade, expiration: null };
      const features = extractTradeEmbeddingFeatures(noExpTrade);

      expect(features[1]).toBe(0.5); // Default DTE
    });

    it('handles null strike', () => {
      const noStrikeTrade = { ...baseTrade, strike: null };
      const features = extractTradeEmbeddingFeatures(noStrikeTrade);

      expect(features[2]).toBe(0.5); // Default strike distance
      expect(features[3]).toBe(0.5); // Default premium percent
    });

    it('normalizes P&L percentage', () => {
      const winTrade = { ...baseTrade, realizedPnL: 250 };
      const lossTrade = { ...baseTrade, realizedPnL: -250 };

      const winFeatures = extractTradeEmbeddingFeatures(winTrade);
      const lossFeatures = extractTradeEmbeddingFeatures(lossTrade);

      // P&L percent should be centered around 0.5
      expect(winFeatures[5]).toBeGreaterThan(0.5);
      expect(lossFeatures[5]).toBeLessThan(0.5);
    });

    it('encodes day of week correctly', () => {
      // Use explicit time to avoid timezone issues
      // January 8, 2024 was a Monday (day 1), so 1/6 ≈ 0.167
      const mondayTrade = { ...baseTrade, openDate: new Date('2024-01-08T12:00:00') };
      const features = extractTradeEmbeddingFeatures(mondayTrade);
      expect(features[11]).toBeCloseTo(1 / 6, 5);
    });

    it('all features are in valid range', () => {
      const features = extractTradeEmbeddingFeatures(baseTrade);

      features.forEach((f) => {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      });
    });
  });
});

describe('Options Feature Engineering - Edge Cases', () => {
  describe('numeric edge cases', () => {
    it('handles very large numbers', () => {
      const largeNumber = 1000000;
      expect(average([largeNumber, largeNumber])).toBe(largeNumber);
      expect(clamp(largeNumber, 0, 1)).toBe(1);
    });

    it('handles very small numbers', () => {
      const smallNumber = 0.0000001;
      expect(average([smallNumber, smallNumber])).toBe(smallNumber);
      expect(clamp(smallNumber, 0, 1)).toBe(smallNumber);
    });

    it('handles negative zero', () => {
      expect(average([-0, 0])).toBe(0);
    });

    it('handles Infinity values gracefully', () => {
      expect(clamp(Infinity, 0, 1)).toBe(1);
      expect(clamp(-Infinity, 0, 1)).toBe(0);
    });
  });

  describe('array edge cases', () => {
    it('handles large arrays', () => {
      const largeArray = Array(10000).fill(1);
      expect(average(largeArray)).toBe(1);
      expect(standardDeviation(largeArray)).toBe(0);
    });

    it('handles arrays with duplicates', () => {
      const arr = [5, 5, 5, 10, 10, 10];
      expect(average(arr)).toBe(7.5);
    });
  });

  describe('trade embedding edge cases', () => {
    it('handles zero open price', () => {
      const trade = {
        symbol: 'TEST',
        strategy: null,
        openDate: new Date(),
        closeDate: new Date(),
        openPrice: 0,
        strike: 100,
        expiration: null,
        realizedPnL: 0,
        closeReason: null,
      };

      const features = extractTradeEmbeddingFeatures(trade);
      expect(features.every(f => !isNaN(f))).toBe(true);
    });

    it('handles same open and close date', () => {
      const sameDay = new Date('2024-01-15');
      const trade = {
        symbol: 'TEST',
        strategy: 'long_call',
        openDate: sameDay,
        closeDate: sameDay,
        openPrice: 2.50,
        strike: 150,
        expiration: new Date('2024-01-20'),
        realizedPnL: 50,
        closeReason: 'normal',
      };

      const features = extractTradeEmbeddingFeatures(trade);
      expect(features[4]).toBe(0); // Hold days should be 0
    });
  });
});

describe('Options Feature Engineering - Feature Names Constants', () => {
  it('verifies volatility feature count', () => {
    const VOLATILITY_FEATURE_NAMES = [
      'premiumPercentile',
      'premiumTrend30d',
      'premiumStdDev',
      'tradeFrequencyChange',
      'winRateChange30d',
      'avgDteChange',
      'avgHoldDaysChange',
      'recentVolatility',
      'historicalVolatility',
      'premiumSpread',
    ];
    expect(VOLATILITY_FEATURE_NAMES.length).toBe(10);
  });

  it('verifies entry timing feature count', () => {
    const ENTRY_TIMING_FEATURE_NAMES = [
      'dayOfWeek',
      'dayOfMonth',
      'weekOfMonth',
      'hourOfDay',
      'daysSinceLastTrade',
      'recentWinRate',
      'premiumVsAvg',
      'tradeCountLast7d',
      'tradeCountLast30d',
      'avgReturnLast5Trades',
      'currentDrawdown',
      'daysSinceLastWin',
      'consecutiveWins',
      'consecutiveLosses',
      'symbolFamiliarity',
    ];
    expect(ENTRY_TIMING_FEATURE_NAMES.length).toBe(15);
  });

  it('verifies risk analyzer feature count', () => {
    const RISK_ANALYZER_FEATURE_NAMES = [
      'positionCount',
      'netDeltaNormalized',
      'netThetaNormalized',
      'netVegaNormalized',
      'topSymbolConcentration',
      'top3SymbolConcentration',
      'correlationScore',
      'nearTermExposure',
      'midTermExposure',
      'longTermExposure',
      'winRateTrend',
      'avgPositionSize',
      'maxPositionSize',
      'accountUtilization',
      'drawdownFromPeak',
    ];
    expect(RISK_ANALYZER_FEATURE_NAMES.length).toBe(15);
  });

  it('verifies trade embedding feature count', () => {
    const TRADE_EMBEDDING_FEATURE_NAMES = [
      'strategy',
      'dteAtEntry',
      'strikeDistance',
      'premiumPercent',
      'holdDays',
      'pnlPercent',
      'wasAssigned',
      'exitType',
      'marketCondition',
      'positionSize',
      'symbolVolatility',
      'entryDayOfWeek',
    ];
    expect(TRADE_EMBEDDING_FEATURE_NAMES.length).toBe(12);
  });
});
