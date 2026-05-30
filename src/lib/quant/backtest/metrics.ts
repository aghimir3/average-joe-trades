import type { BacktestMetrics, BacktestTrade, EquityPoint } from './types';

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function dailyReturns(equityCurve: EquityPoint[]): number[] {
  if (equityCurve.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const previous = equityCurve[i - 1].equity;
    const current = equityCurve[i].equity;
    returns.push(safeDivide(current - previous, previous));
  }
  return returns;
}

function cagrFromCurve(equityCurve: EquityPoint[]): number {
  if (equityCurve.length < 2) return 0;
  const start = new Date(equityCurve[0].timestamp).getTime();
  const end = new Date(equityCurve[equityCurve.length - 1].timestamp).getTime();
  const years = Math.max((end - start) / (365 * 24 * 60 * 60 * 1000), 1 / 365);
  const startEquity = equityCurve[0].equity;
  const endEquity = equityCurve[equityCurve.length - 1].equity;
  if (startEquity <= 0 || endEquity <= 0) return 0;
  return Math.pow(endEquity / startEquity, 1 / years) - 1;
}

export function computeBacktestMetrics(
  equityCurve: EquityPoint[],
  trades: BacktestTrade[],
  riskFreeRateAnnual = 0.04
): BacktestMetrics {
  const startEquity = equityCurve[0]?.equity ?? 0;
  const endEquity = equityCurve[equityCurve.length - 1]?.equity ?? startEquity;
  const totalReturnPct = safeDivide(endEquity - startEquity, startEquity) * 100;
  const cagr = cagrFromCurve(equityCurve);
  const cagrPct = cagr * 100;

  const returns = dailyReturns(equityCurve);
  const meanReturn = mean(returns);
  const returnStd = standardDeviation(returns);
  const downsideStd = standardDeviation(returns.filter((value) => value < 0));
  const riskFreeDaily = Math.pow(1 + riskFreeRateAnnual, 1 / 252) - 1;

  const sharpe = returnStd > 0 ? ((meanReturn - riskFreeDaily) / returnStd) * Math.sqrt(252) : 0;
  const sortino = downsideStd > 0 ? ((meanReturn - riskFreeDaily) / downsideStd) * Math.sqrt(252) : 0;

  const maxDrawdownPct = Math.abs(
    Math.min(...equityCurve.map((point) => point.drawdownPct), 0)
  ) * 100;

  const realizedTrades = trades.filter((trade) => trade.realizedPnL !== 0);
  const winningTrades = realizedTrades.filter((trade) => trade.realizedPnL > 0);
  const losingTrades = realizedTrades.filter((trade) => trade.realizedPnL < 0);
  const hitRatePct = realizedTrades.length > 0 ? (winningTrades.length / realizedTrades.length) * 100 : 0;
  const avgWin = mean(winningTrades.map((trade) => trade.realizedPnL));
  const avgLoss = mean(losingTrades.map((trade) => trade.realizedPnL));

  const avgExposurePct =
    equityCurve.length > 0
      ? mean(equityCurve.map((point) => point.grossExposurePct)) * 100
      : 0;

  const tradedNotional = trades.reduce((sum, trade) => sum + Math.abs(trade.notional), 0);
  const averageEquity = equityCurve.length > 0 ? mean(equityCurve.map((point) => point.equity)) : 0;
  const turnoverPct = averageEquity > 0 ? (tradedNotional / averageEquity) * 100 : 0;

  return {
    totalReturnPct,
    cagrPct,
    sharpe,
    sortino,
    maxDrawdownPct,
    hitRatePct,
    avgWin,
    avgLoss,
    exposurePct: avgExposurePct,
    turnoverPct,
    tradeCount: trades.length,
  };
}

