export type BarInterval = '1d' | '1wk' | '1mo';

export interface PriceHistoryRequest {
  symbol: string;
  start: Date;
  end: Date;
  interval?: BarInterval;
  maxStaleMs?: number;
  allowStaleOnError?: boolean;
  triggerSource?: string;
}

export interface OHLCVBar {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionsChainRequest {
  symbol: string;
  expiration: string;
}

export interface OptionsContractSnapshot {
  symbol: string;
  strike: number;
  expiration: string;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  openInterest: number;
  volume: number;
  impliedVolatility: number | null;
}

export interface OptionsChainSnapshot {
  symbol: string;
  expiration: string;
  fetchedAt: string;
  underlyingPrice: number;
  calls: OptionsContractSnapshot[];
  puts: OptionsContractSnapshot[];
}

export interface CorporateActionRequest {
  symbol: string;
  start: Date;
  end: Date;
}

export interface CorporateActionEvent {
  symbol: string;
  effectiveDate: Date;
  actionType: 'split' | 'dividend' | 'merger' | 'other';
  ratio?: number;
  cashAmount?: number;
  notes?: string;
}

export interface MarketDataProvider {
  readonly providerId: string;
  getPriceHistory(request: PriceHistoryRequest): Promise<OHLCVBar[]>;
  getOptionsChain(request: OptionsChainRequest): Promise<OptionsChainSnapshot>;
  getCorporateActions(request: CorporateActionRequest): Promise<CorporateActionEvent[]>;
}
