import type { QuantSignal } from '@/lib/quant/strategy';

export interface BacktestConfig {
  initialCapital: number;
  transactionCostBps: number;
  slippageBps: number;
  maxPositionFraction: number;
  allowShort: boolean;
  benchmarkAnnualRiskFreeRate: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100_000,
  transactionCostBps: 5,
  slippageBps: 3,
  maxPositionFraction: 0.25,
  allowShort: false,
  benchmarkAnnualRiskFreeRate: 0.04,
};

export interface BacktestTrade {
  timestamp: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  executionPrice: number;
  notional: number;
  transactionCost: number;
  slippageCost: number;
  totalFrictionCost: number;
  realizedPnL: number;
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  cash: number;
  positionValue: number;
  drawdownPct: number;
  grossExposurePct: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  hitRatePct: number;
  avgWin: number;
  avgLoss: number;
  exposurePct: number;
  turnoverPct: number;
  tradeCount: number;
}

export interface BacktestResult {
  strategyKey: string;
  symbol: string;
  config: BacktestConfig;
  signals: QuantSignal[];
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

export interface WalkForwardWindowConfig {
  trainBars: number;
  testBars: number;
  stepBars: number;
}

