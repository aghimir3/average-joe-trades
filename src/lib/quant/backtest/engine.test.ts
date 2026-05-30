import { describe, expect, it } from 'vitest';
import { runSignalBacktest } from './engine';
import type { OHLCVBar } from '@/lib/quant/data';
import type { QuantSignal } from '@/lib/quant/strategy';

function bars(): OHLCVBar[] {
  return [
    {
      symbol: 'TEST',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1_000,
    },
    {
      symbol: 'TEST',
      timestamp: new Date('2024-01-02T00:00:00.000Z'),
      open: 110,
      high: 111,
      low: 109,
      close: 110,
      volume: 1_000,
    },
    {
      symbol: 'TEST',
      timestamp: new Date('2024-01-03T00:00:00.000Z'),
      open: 120,
      high: 121,
      low: 119,
      close: 120,
      volume: 1_000,
    },
  ];
}

describe('runSignalBacktest', () => {
  it('executes signals on the next bar open (no lookahead)', () => {
    const signal: QuantSignal = {
      symbol: 'TEST',
      timestamp: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      side: 'buy',
      strength: 1,
      horizon: 'swing',
      rationaleCodes: ['TEST_SIGNAL'],
      confidence: 0.8,
      confidenceBand: 'high',
      expectedReturnPct: 5,
      riskFlags: [],
    };

    const result = runSignalBacktest({
      strategyKey: 'unit-test',
      symbol: 'TEST',
      bars: bars(),
      signals: [signal],
      config: {
        initialCapital: 1_000,
        maxPositionFraction: 1,
        transactionCostBps: 0,
        slippageBps: 0,
        allowShort: false,
      },
    });

    expect(result.trades.length).toBe(1);
    expect(result.trades[0].executionPrice).toBe(110);
    expect(result.trades[0].timestamp).toBe(new Date('2024-01-02T00:00:00.000Z').toISOString());
  });
});

