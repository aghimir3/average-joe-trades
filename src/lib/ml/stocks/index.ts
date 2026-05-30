export type {
  StockTradeObservation,
  WeightedStockPerformance,
  StockModelStatus,
  StockActionSignal,
} from './types';

export {
  getStockModelStatus,
  generateStockActions,
} from './stock-model';

export {
  calculateRecencyWeight,
  computeWeightedPerformance,
  shrinkToBaseline,
  blendWithCommunity,
  decideStockAction,
  clamp,
} from './signal-utils';
