import type { OHLCVBar } from '@/lib/quant/data';
import type { QuantSignal } from '@/lib/quant/strategy';
import { runSignalBacktest } from './engine';
import type { BacktestConfig, BacktestResult, WalkForwardWindowConfig } from './types';

export interface WalkForwardWindowResult {
  windowIndex: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  result: BacktestResult;
}

export interface WalkForwardResult {
  windows: WalkForwardWindowResult[];
  aggregate: {
    avgCagrPct: number;
    avgSharpe: number;
    avgSortino: number;
    avgMaxDrawdownPct: number;
    avgHitRatePct: number;
    totalTrades: number;
  };
}

export interface WalkForwardInput {
  strategyKey: string;
  symbol: string;
  bars: OHLCVBar[];
  window: WalkForwardWindowConfig;
  config?: Partial<BacktestConfig>;
  generateSignals: (ctx: {
    symbol: string;
    trainBars: OHLCVBar[];
    testBars: OHLCVBar[];
    allBarsForWindow: OHLCVBar[];
  }) => QuantSignal[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runWalkForward(input: WalkForwardInput): WalkForwardResult {
  const bars = [...input.bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const windows: WalkForwardWindowResult[] = [];

  const trainBars = input.window.trainBars;
  const testBars = input.window.testBars;
  const stepBars = input.window.stepBars;

  for (
    let startIdx = 0;
    startIdx + trainBars + testBars <= bars.length;
    startIdx += stepBars
  ) {
    const trainSlice = bars.slice(startIdx, startIdx + trainBars);
    const testSlice = bars.slice(startIdx + trainBars, startIdx + trainBars + testBars);
    if (trainSlice.length === 0 || testSlice.length < 2) continue;

    // Include last train bar to keep no-lookahead execution for first test signal.
    const executionBars = [trainSlice[trainSlice.length - 1], ...testSlice];
    const signals = input.generateSignals({
      symbol: input.symbol,
      trainBars: trainSlice,
      testBars: testSlice,
      allBarsForWindow: [...trainSlice, ...testSlice],
    });

    const result = runSignalBacktest({
      strategyKey: input.strategyKey,
      symbol: input.symbol,
      bars: executionBars,
      signals,
      config: input.config,
    });

    windows.push({
      windowIndex: windows.length,
      trainStart: trainSlice[0].timestamp.toISOString(),
      trainEnd: trainSlice[trainSlice.length - 1].timestamp.toISOString(),
      testStart: testSlice[0].timestamp.toISOString(),
      testEnd: testSlice[testSlice.length - 1].timestamp.toISOString(),
      result,
    });
  }

  const aggregate = {
    avgCagrPct: average(windows.map((window) => window.result.metrics.cagrPct)),
    avgSharpe: average(windows.map((window) => window.result.metrics.sharpe)),
    avgSortino: average(windows.map((window) => window.result.metrics.sortino)),
    avgMaxDrawdownPct: average(windows.map((window) => window.result.metrics.maxDrawdownPct)),
    avgHitRatePct: average(windows.map((window) => window.result.metrics.hitRatePct)),
    totalTrades: windows.reduce((sum, window) => sum + window.result.metrics.tradeCount, 0),
  };

  return { windows, aggregate };
}

