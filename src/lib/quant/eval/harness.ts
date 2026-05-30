import type { OHLCVBar } from '@/lib/quant/data';
import { buildLeakageSafeStockFeatures } from '@/lib/quant/features';
import type { QuantStrategy } from '@/lib/quant/strategy';
import { runWalkForward, type WalkForwardResult } from '@/lib/quant/backtest';

export interface CalibrationPoint {
  predictedProbability: number;
  outcome: 0 | 1;
}

export interface CalibrationReport {
  brierScore: number;
  expectedCalibrationError: number;
  sampleSize: number;
}

export interface DriftReport {
  performanceDecayPct: number;
  sharpeDecayPct: number;
  driftScore: number;
  status: 'stable' | 'watch' | 'drift';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateCalibration(
  points: CalibrationPoint[],
  bins = 10
): CalibrationReport {
  if (points.length === 0) {
    return {
      brierScore: 0,
      expectedCalibrationError: 0,
      sampleSize: 0,
    };
  }

  const brierScore = avg(
    points.map((point) => (point.predictedProbability - point.outcome) ** 2)
  );

  let ece = 0;
  for (let i = 0; i < bins; i += 1) {
    const low = i / bins;
    const high = (i + 1) / bins;
    const bin = points.filter((point) => point.predictedProbability >= low && point.predictedProbability < high);
    if (bin.length === 0) continue;
    const confidence = avg(bin.map((point) => point.predictedProbability));
    const accuracy = avg(bin.map((point) => point.outcome));
    ece += (bin.length / points.length) * Math.abs(confidence - accuracy);
  }

  return {
    brierScore,
    expectedCalibrationError: ece,
    sampleSize: points.length,
  };
}

export function detectPerformanceDrift(
  baseline: { totalReturnPct: number; sharpe: number },
  recent: { totalReturnPct: number; sharpe: number }
): DriftReport {
  const performanceDecayPct =
    baseline.totalReturnPct !== 0
      ? ((recent.totalReturnPct - baseline.totalReturnPct) / Math.abs(baseline.totalReturnPct)) * 100
      : recent.totalReturnPct * 100;
  const sharpeDecayPct =
    baseline.sharpe !== 0
      ? ((recent.sharpe - baseline.sharpe) / Math.abs(baseline.sharpe)) * 100
      : recent.sharpe * 100;

  const driftScore = clamp(
    (Math.abs(Math.min(performanceDecayPct, 0)) * 0.6 + Math.abs(Math.min(sharpeDecayPct, 0)) * 0.4) / 100,
    0,
    1
  );

  const status: DriftReport['status'] =
    driftScore >= 0.45 ? 'drift' : driftScore >= 0.25 ? 'watch' : 'stable';

  return {
    performanceDecayPct,
    sharpeDecayPct,
    driftScore,
    status,
  };
}

export function evaluateStrategyWalkForward(params: {
  strategy: QuantStrategy;
  symbol: string;
  bars: OHLCVBar[];
}): WalkForwardResult {
  const bars = [...params.bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return runWalkForward({
    strategyKey: params.strategy.strategyKey,
    symbol: params.symbol,
    bars,
    window: {
      trainBars: 180,
      testBars: 60,
      stepBars: 30,
    },
    generateSignals: ({ symbol, allBarsForWindow, testBars }) => {
      const features = buildLeakageSafeStockFeatures(allBarsForWindow);
      const featureByTimestamp = new Map(features.map((feature) => [feature.timestamp.getTime(), feature]));

      const signals = [];
      for (const bar of testBars) {
        const feature = featureByTimestamp.get(bar.timestamp.getTime());
        if (!feature) continue;

        const historicalBars = allBarsForWindow.filter(
          (candidate) => candidate.timestamp.getTime() <= bar.timestamp.getTime()
        );
        const historicalFeatures = features.filter(
          (candidate) => candidate.timestamp.getTime() <= bar.timestamp.getTime()
        );

        const generated = params.strategy.generateSignals({
          symbol,
          bars: historicalBars,
          features: historicalFeatures,
          openPositions: [],
          asOf: bar.timestamp,
        });
        signals.push(...generated);
      }
      return signals;
    },
  });
}

