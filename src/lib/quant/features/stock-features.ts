import type { OHLCVBar } from '@/lib/quant/data';
import { StockFeatureRowSchema, type StockFeatureRow } from './schema';

export interface BuildStockFeatureOptions {
  lookback?: number;
}

function safeReturn(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return 0;
  }
  return current / previous - 1;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function zScore(values: number[], currentValue: number): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = standardDeviation(values) || 1;
  return (currentValue - avg) / sd;
}

/**
 * Build stock features using only information known at each timestamp.
 * No feature references any future bar.
 */
export function buildLeakageSafeStockFeatures(
  bars: OHLCVBar[],
  options: BuildStockFeatureOptions = {}
): StockFeatureRow[] {
  const lookback = options.lookback ?? 20;
  if (lookback < 6) {
    throw new Error('lookback must be at least 6 bars');
  }
  if (bars.length <= lookback) return [];

  const sortedBars = [...bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const rows: StockFeatureRow[] = [];

  for (let i = lookback; i < sortedBars.length; i += 1) {
    const current = sortedBars[i];
    const prev1 = sortedBars[i - 1];
    const prev5 = sortedBars[i - 5];
    const window = sortedBars.slice(i - lookback, i);

    const windowCloses = window.map((bar) => bar.close);
    const windowVolumes = window.map((bar) => bar.volume);
    const windowReturns = window.slice(1).map((bar, idx) => safeReturn(bar.close, window[idx].close));
    const downsideReturns = windowReturns.filter((value) => value < 0);

    const maxClose = Math.max(...windowCloses);
    const drawdown20d = maxClose > 0 ? current.close / maxClose - 1 : 0;
    const momentum20d = safeReturn(current.close, window[0].close);

    const featureCandidate: StockFeatureRow = {
      symbol: current.symbol,
      timestamp: current.timestamp,
      sourceWindowEnd: current.timestamp,
      close: current.close,
      return1d: safeReturn(current.close, prev1.close),
      return5d: safeReturn(current.close, prev5.close),
      momentum20d,
      volatility20d: standardDeviation(windowReturns),
      downsideVolatility20d: standardDeviation(downsideReturns),
      volumeZScore20d: zScore(windowVolumes, current.volume),
      drawdown20d,
    };

    const parsed = StockFeatureRowSchema.safeParse(featureCandidate);
    if (!parsed.success) continue;
    rows.push(parsed.data);
  }

  return rows;
}

export function targetForwardReturn(
  bars: OHLCVBar[],
  horizonBars = 5
): Array<{ timestamp: Date; forwardReturn: number }> {
  if (horizonBars < 1) {
    throw new Error('horizonBars must be >= 1');
  }

  const sortedBars = [...bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const targets: Array<{ timestamp: Date; forwardReturn: number }> = [];

  for (let i = 0; i + horizonBars < sortedBars.length; i += 1) {
    const current = sortedBars[i];
    const future = sortedBars[i + horizonBars];
    targets.push({
      timestamp: current.timestamp,
      forwardReturn: safeReturn(future.close, current.close),
    });
  }
  return targets;
}

