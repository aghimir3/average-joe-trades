import type { OHLCVBar } from '@/lib/quant/data';
import type { QuantSignal } from '@/lib/quant/strategy';
import { computeBacktestMetrics } from './metrics';
import { applySlippageCost, applyTransactionCost, executionPriceWithSlippage } from './cost-model';
import {
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
  type BacktestResult,
  type BacktestTrade,
  type EquityPoint,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function equity(cash: number, positionQty: number, markPrice: number): number {
  return cash + positionQty * markPrice;
}

interface BacktestRunInput {
  strategyKey: string;
  symbol: string;
  bars: OHLCVBar[];
  signals: QuantSignal[];
  config?: Partial<BacktestConfig>;
}

/**
 * Event-driven backtest with no-lookahead execution:
 * signals stamped at T are executed at T+1 bar open.
 */
export function runSignalBacktest(input: BacktestRunInput): BacktestResult {
  const config: BacktestConfig = {
    ...DEFAULT_BACKTEST_CONFIG,
    ...input.config,
  };

  const bars = [...input.bars].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (bars.length < 2) {
    return {
      strategyKey: input.strategyKey,
      symbol: input.symbol,
      config,
      signals: [],
      trades: [],
      equityCurve: [],
      metrics: {
        totalReturnPct: 0,
        cagrPct: 0,
        sharpe: 0,
        sortino: 0,
        maxDrawdownPct: 0,
        hitRatePct: 0,
        avgWin: 0,
        avgLoss: 0,
        exposurePct: 0,
        turnoverPct: 0,
        tradeCount: 0,
      },
    };
  }

  const signalMap = new Map<number, QuantSignal[]>();
  for (const signal of input.signals) {
    const ts = new Date(signal.timestamp).getTime();
    if (Number.isNaN(ts)) continue;
    const existing = signalMap.get(ts) ?? [];
    existing.push(signal);
    signalMap.set(ts, existing);
  }

  let cash = config.initialCapital;
  let positionQty = 0;
  let avgEntryPrice = 0;
  let peakEquity = config.initialCapital;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  const executeSignedOrder = (barOpenPrice: number, signedQty: number, timestamp: Date): void => {
    if (signedQty === 0) return;
    const side: 'buy' | 'sell' = signedQty > 0 ? 'buy' : 'sell';
    const quantity = Math.abs(signedQty);
    const executionPrice = executionPriceWithSlippage(barOpenPrice, side, config.slippageBps);
    const notional = quantity * executionPrice;
    const transactionCost = applyTransactionCost(notional, config.transactionCostBps);
    const slippageCost = applySlippageCost(notional, config.slippageBps);
    const totalFrictionCost = transactionCost + slippageCost;

    let realizedPnL = 0;
    let remainingQty = quantity;

    // Close against opposite-side inventory first.
    if (positionQty !== 0 && Math.sign(positionQty) !== Math.sign(signedQty)) {
      const closeQty = Math.min(Math.abs(positionQty), remainingQty);
      if (positionQty > 0 && signedQty < 0) {
        realizedPnL += (executionPrice - avgEntryPrice) * closeQty;
      } else if (positionQty < 0 && signedQty > 0) {
        realizedPnL += (avgEntryPrice - executionPrice) * closeQty;
      }

      positionQty += Math.sign(signedQty) * closeQty;
      remainingQty -= closeQty;
      if (positionQty === 0) {
        avgEntryPrice = 0;
      }
    }

    if (remainingQty > 0) {
      const addedQtySigned = Math.sign(signedQty) * remainingQty;
      const newQty = positionQty + addedQtySigned;
      if (positionQty === 0 || Math.sign(positionQty) === Math.sign(addedQtySigned)) {
        const existingAbs = Math.abs(positionQty);
        const newAbs = Math.abs(newQty);
        avgEntryPrice =
          newAbs > 0 ? ((existingAbs * avgEntryPrice) + remainingQty * executionPrice) / newAbs : 0;
      }
      positionQty = newQty;
    }

    if (side === 'buy') {
      cash -= notional + totalFrictionCost;
    } else {
      cash += notional - totalFrictionCost;
    }

    trades.push({
      timestamp: timestamp.toISOString(),
      symbol: input.symbol,
      side,
      quantity,
      executionPrice,
      notional,
      transactionCost,
      slippageCost,
      totalFrictionCost,
      realizedPnL,
    });
  };

  for (let i = 1; i < bars.length; i += 1) {
    const previousBar = bars[i - 1];
    const bar = bars[i];

    // Execute previous-bar signals at the current open.
    const pendingSignals = signalMap.get(previousBar.timestamp.getTime()) ?? [];
    for (const signal of pendingSignals) {
      if (signal.side === 'hold') continue;
      const preTradeEquity = equity(cash, positionQty, bar.open);
      const sizedFraction = config.maxPositionFraction * clamp(signal.strength, 0.2, 1);
      const desiredAbsQty = Math.floor((preTradeEquity * sizedFraction) / bar.open);

      let targetQty = positionQty;
      if (signal.side === 'buy') {
        targetQty = desiredAbsQty;
      } else if (signal.side === 'sell') {
        targetQty = config.allowShort ? -desiredAbsQty : 0;
      }

      if (!config.allowShort && targetQty < 0) {
        targetQty = 0;
      }

      const deltaQty = targetQty - positionQty;
      if (deltaQty !== 0) {
        executeSignedOrder(bar.open, deltaQty, bar.timestamp);
      }
    }

    const endOfBarEquity = equity(cash, positionQty, bar.close);
    peakEquity = Math.max(peakEquity, endOfBarEquity);
    const drawdownPct = peakEquity > 0 ? (endOfBarEquity - peakEquity) / peakEquity : 0;
    const grossExposurePct = endOfBarEquity > 0 ? Math.abs((positionQty * bar.close) / endOfBarEquity) : 0;

    equityCurve.push({
      timestamp: bar.timestamp.toISOString(),
      equity: endOfBarEquity,
      cash,
      positionValue: positionQty * bar.close,
      drawdownPct,
      grossExposurePct,
    });
  }

  const metrics = computeBacktestMetrics(
    equityCurve,
    trades,
    config.benchmarkAnnualRiskFreeRate
  );

  return {
    strategyKey: input.strategyKey,
    symbol: input.symbol,
    config,
    signals: input.signals,
    trades,
    equityCurve,
    metrics,
  };
}

