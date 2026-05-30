import { describe, expect, it } from 'vitest';
import {
  blendWithCommunity,
  calculateRecencyWeight,
  computeWeightedPerformance,
  decideStockAction,
  shrinkToBaseline,
} from './signal-utils';
import type { StockTradeObservation } from './types';

describe('stock signal utils', () => {
  it('assigns more weight to recent trades', () => {
    const now = new Date('2026-02-07T00:00:00.000Z');
    const recent = calculateRecencyWeight(new Date('2026-01-20T00:00:00.000Z'), now);
    const older = calculateRecencyWeight(new Date('2025-06-01T00:00:00.000Z'), now);

    expect(recent).toBeGreaterThan(older);
  });

  it('shrinks sparse symbol performance toward baseline', () => {
    const symbolPerf = {
      tradeCount: 3,
      effectiveSampleSize: 2,
      weightedWinRate: 0.9,
      weightedAvgReturnPct: 18,
      weightedVolatilityPct: 22,
      weightedDownsidePct: -12,
      weightedAvgHoldDays: 20,
    };
    const baseline = {
      tradeCount: 30,
      effectiveSampleSize: 20,
      weightedWinRate: 0.55,
      weightedAvgReturnPct: 4,
      weightedVolatilityPct: 12,
      weightedDownsidePct: -7,
      weightedAvgHoldDays: 12,
    };

    const shrunk = shrinkToBaseline(symbolPerf, baseline, 12);
    expect(shrunk.weightedWinRate).toBeLessThan(symbolPerf.weightedWinRate);
    expect(shrunk.weightedWinRate).toBeGreaterThan(baseline.weightedWinRate);
  });

  it('leans on community data when available', () => {
    const personalPerf = {
      tradeCount: 8,
      effectiveSampleSize: 6,
      weightedWinRate: 0.58,
      weightedAvgReturnPct: 3,
      weightedVolatilityPct: 11,
      weightedDownsidePct: -8,
      weightedAvgHoldDays: 9,
    };

    const signal = blendWithCommunity(personalPerf, {
      winRate: 0.7,
      avgReturnPct: 9,
      confidence: 0.8,
    });

    expect(signal.winRate).toBeGreaterThan(personalPerf.weightedWinRate);
    expect(signal.expectedReturnPct).toBeGreaterThan(personalPerf.weightedAvgReturnPct);
  });

  it('returns a risk reduction signal for deep losses', () => {
    const decision = decideStockAction({
      symbol: 'AAPL',
      pnlPercent: -11,
      dayChangePercent: -2.5,
      ageDays: 15,
      blendedSignal: {
        winRate: 0.46,
        expectedReturnPct: 1,
        downsidePct: -7,
        confidence: 0.7,
      },
      communityRecommendation: 'neutral',
    });

    expect(decision?.type).toBe('consider_exit');
    expect(decision?.priority).toBe('high');
  });

  it('computes weighted performance stats from observations', () => {
    const now = new Date('2026-02-07T00:00:00.000Z');
    const observations: StockTradeObservation[] = [
      {
        symbol: 'TSLA',
        closeDate: new Date('2026-01-31T00:00:00.000Z'),
        holdDays: 7,
        returnPct: 10,
      },
      {
        symbol: 'TSLA',
        closeDate: new Date('2025-12-01T00:00:00.000Z'),
        holdDays: 14,
        returnPct: -5,
      },
    ];

    const perf = computeWeightedPerformance(observations, now);
    expect(perf.tradeCount).toBe(2);
    expect(perf.weightedWinRate).toBeGreaterThan(0);
    expect(perf.weightedWinRate).toBeLessThan(1);
    expect(perf.weightedAvgHoldDays).toBeGreaterThan(0);
  });
});
