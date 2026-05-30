import type {
  CorporateActionEvent,
  CorporateActionRequest,
  MarketDataProvider,
  OHLCVBar,
  OptionsChainRequest,
  OptionsChainSnapshot,
  PriceHistoryRequest,
} from './types';

function generateSyntheticBars(request: PriceHistoryRequest): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const symbol = request.symbol.toUpperCase();
  const dayMs = 24 * 60 * 60 * 1000;
  const intervalMs = dayMs;

  let index = 0;
  for (let ts = request.start.getTime(); ts <= request.end.getTime(); ts += intervalMs) {
    const baseline = 100 + Math.sin(index / 7) * 4 + index * 0.05;
    const open = baseline;
    const close = baseline + Math.sin(index / 3) * 1.1;
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.8;
    bars.push({
      symbol,
      timestamp: new Date(ts),
      open,
      high,
      low,
      close,
      volume: 1_000_000 + (index % 10) * 10_000,
    });
    index += 1;
  }
  return bars;
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly providerId = 'mock';

  async getPriceHistory(request: PriceHistoryRequest): Promise<OHLCVBar[]> {
    return generateSyntheticBars(request);
  }

  async getOptionsChain(request: OptionsChainRequest): Promise<OptionsChainSnapshot> {
    const strikes = [90, 95, 100, 105, 110];
    const mk = (optionType: 'call' | 'put') =>
      strikes.map((strike) => ({
        symbol: `${request.symbol}-${request.expiration}-${optionType}-${strike}`,
        strike,
        expiration: request.expiration,
        optionType,
        bid: Math.max(0.1, Math.abs(100 - strike) * 0.1 + 0.5),
        ask: Math.max(0.2, Math.abs(100 - strike) * 0.1 + 0.65),
        openInterest: 1000,
        volume: 100,
        impliedVolatility: 0.25,
      }));

    return {
      symbol: request.symbol.toUpperCase(),
      expiration: request.expiration,
      fetchedAt: new Date().toISOString(),
      underlyingPrice: 100,
      calls: mk('call'),
      puts: mk('put'),
    };
  }

  async getCorporateActions(_request: CorporateActionRequest): Promise<CorporateActionEvent[]> {
    void _request;
    return [];
  }
}
