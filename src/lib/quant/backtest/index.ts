export type {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  BacktestTrade,
  EquityPoint,
  WalkForwardWindowConfig,
} from './types';

export { DEFAULT_BACKTEST_CONFIG } from './types';

export {
  applySlippageCost,
  applyTransactionCost,
  executionPriceWithSlippage,
} from './cost-model';

export { runSignalBacktest } from './engine';
export {
  runWalkForward,
  type WalkForwardInput,
  type WalkForwardResult,
  type WalkForwardWindowResult,
} from './walk-forward';

export { computeBacktestMetrics } from './metrics';

