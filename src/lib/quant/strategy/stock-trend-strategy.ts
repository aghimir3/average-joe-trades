import { confidenceToBand, type QuantSignal, type QuantStrategy, type StrategyInput } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasOpenPosition(input: StrategyInput): boolean {
  return input.openPositions.some((position) => position.symbol === input.symbol && position.quantity !== 0);
}

/**
 * Lightweight baseline stock strategy.
 * Uses only leakage-safe features and emits structured, auditable signals.
 */
export class StockTrendStrategy implements QuantStrategy {
  readonly strategyKey = 'stock_trend_v1';

  generateSignals(input: StrategyInput): QuantSignal[] {
    if (input.features.length === 0) return [];
    const latest = input.features[input.features.length - 1];

    const score =
      latest.momentum20d * 1.7
      + latest.return5d * 0.8
      - latest.drawdown20d * 0.4
      - latest.volatility20d * 0.6;
    const strength = clamp01(Math.abs(score));
    const confidence = clamp01(
      0.45
      + Math.min(Math.abs(latest.momentum20d) * 1.2, 0.3)
      + Math.min(0.2, 0.2 / (1 + latest.volatility20d * 20))
    );

    const rationaleCodes: string[] = [];
    const riskFlags: string[] = [];

    if (latest.momentum20d > 0.03) rationaleCodes.push('TREND_UP_20D');
    if (latest.momentum20d < -0.03) rationaleCodes.push('TREND_DOWN_20D');
    if (latest.return5d > 0.015) rationaleCodes.push('NEAR_TERM_STRENGTH');
    if (latest.return5d < -0.015) rationaleCodes.push('NEAR_TERM_WEAKNESS');
    if (latest.drawdown20d <= -0.08) riskFlags.push('RECENT_DRAWDOWN');
    if (latest.volatility20d >= 0.03) riskFlags.push('ELEVATED_VOLATILITY');
    if (latest.volumeZScore20d >= 2) rationaleCodes.push('VOLUME_EXPANSION');
    if (latest.volumeZScore20d <= -1.5) riskFlags.push('THIN_LIQUIDITY');

    const hasPosition = hasOpenPosition(input);
    const side: QuantSignal['side'] =
      score >= 0.04 ? 'buy' : score <= -0.03 ? 'sell' : hasPosition ? 'hold' : 'hold';

    if (rationaleCodes.length === 0) {
      rationaleCodes.push('NO_CLEAR_EDGE');
    }

    const expectedReturnPct = Number((score * 8).toFixed(2));

    return [
      {
        symbol: input.symbol,
        timestamp: input.asOf.toISOString(),
        side,
        strength,
        horizon: 'swing',
        rationaleCodes,
        confidence,
        confidenceBand: confidenceToBand(confidence),
        expectedReturnPct,
        riskFlags,
      },
    ];
  }
}

