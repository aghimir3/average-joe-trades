import { describe, expect, it } from 'vitest';
import { buildLeakageSafeStockFeatures } from './stock-features';
import type { OHLCVBar } from '@/lib/quant/data';

function makeBars(length: number): OHLCVBar[] {
  const start = new Date('2024-01-01T00:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length }, (_, index) => {
    const close = 100 + index;
    return {
      symbol: 'TEST',
      timestamp: new Date(start + index * dayMs),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000 + index * 1_000,
    };
  });
}

describe('buildLeakageSafeStockFeatures', () => {
  it('does not change historical features when future bars change', () => {
    const baselineBars = makeBars(60);
    const baselineFeatures = buildLeakageSafeStockFeatures(baselineBars, { lookback: 20 });

    const mutatedBars = makeBars(60);
    for (let i = 40; i < mutatedBars.length; i += 1) {
      mutatedBars[i] = {
        ...mutatedBars[i],
        close: mutatedBars[i].close * 4,
        volume: mutatedBars[i].volume * 3,
      };
    }
    const mutatedFeatures = buildLeakageSafeStockFeatures(mutatedBars, { lookback: 20 });

    const compareTimestamp = baselineFeatures[10]?.timestamp.getTime();
    const baselineRow = baselineFeatures.find((row) => row.timestamp.getTime() === compareTimestamp);
    const mutatedRow = mutatedFeatures.find((row) => row.timestamp.getTime() === compareTimestamp);

    expect(baselineRow).toBeDefined();
    expect(mutatedRow).toBeDefined();
    expect(mutatedRow?.momentum20d).toBeCloseTo(baselineRow?.momentum20d ?? 0, 10);
    expect(mutatedRow?.volatility20d).toBeCloseTo(baselineRow?.volatility20d ?? 0, 10);
    expect(mutatedRow?.drawdown20d).toBeCloseTo(baselineRow?.drawdown20d ?? 0, 10);
  });
});

