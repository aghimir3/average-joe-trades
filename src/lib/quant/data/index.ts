import { setDefaultMarketDataProvider } from './provider';
import { YahooMarketDataProvider } from './yahoo-provider';

export type {
  BarInterval,
  CorporateActionEvent,
  CorporateActionRequest,
  MarketDataProvider,
  OHLCVBar,
  OptionsChainRequest,
  OptionsChainSnapshot,
  PriceHistoryRequest,
} from './types';

export {
  getDefaultMarketDataProvider,
  setDefaultMarketDataProvider,
  withRetry,
  withTimeout,
} from './provider';

export { YahooMarketDataProvider } from './yahoo-provider';
export { MockMarketDataProvider } from './mock-provider';

// Set default provider lazily at module load.
setDefaultMarketDataProvider(new YahooMarketDataProvider());

