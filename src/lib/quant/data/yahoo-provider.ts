import YahooFinance from 'yahoo-finance2';
import {
  getOptionsChain,
  type OptionContract,
} from '@/lib/services/yahoo-finance';
import { createChildLogger } from '@/lib/logger';
import { ensurePriceHistoryCached } from '@/lib/market/cache';
import { withRetry, withTimeout } from './provider';
import type {
  CorporateActionEvent,
  CorporateActionRequest,
  MarketDataProvider,
  OHLCVBar,
  OptionsChainRequest,
  OptionsChainSnapshot,
  PriceHistoryRequest,
} from './types';

const log = createChildLogger({ module: 'quant-yahoo-provider' });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function mapContract(contract: OptionContract) {
  return {
    symbol: contract.symbol,
    strike: contract.strike,
    expiration: contract.expiration,
    optionType: contract.optionType,
    bid: contract.bid,
    ask: contract.ask,
    openInterest: contract.openInterest,
    volume: contract.volume,
    impliedVolatility: contract.impliedVolatility,
  };
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly providerId = 'yahoo-finance2';

  async getPriceHistory(request: PriceHistoryRequest): Promise<OHLCVBar[]> {
    const interval = request.interval ?? '1d';
    const result = await ensurePriceHistoryCached({
      symbol: request.symbol,
      start: request.start,
      end: request.end,
      interval,
      maxStaleMs: request.maxStaleMs,
      allowStaleOnError: request.allowStaleOnError,
      triggerSource: request.triggerSource,
    });
    return result.bars;
  }

  async getOptionsChain(request: OptionsChainRequest): Promise<OptionsChainSnapshot> {
    const chain = await withRetry(
      () =>
        withTimeout(
          getOptionsChain(request.symbol, request.expiration),
          8_000,
          `Options chain ${request.symbol}`
        ),
      { retries: 2, baseDelayMs: 300 }
    );

    return {
      symbol: chain.symbol,
      expiration: chain.expiration,
      fetchedAt: chain.fetchedAt,
      underlyingPrice: chain.underlyingPrice,
      calls: chain.calls.map(mapContract),
      puts: chain.puts.map(mapContract),
    };
  }

  async getCorporateActions(request: CorporateActionRequest): Promise<CorporateActionEvent[]> {
    // Yahoo corporate-actions coverage can be inconsistent per symbol. Keep this lightweight
    // and fail-safe for now so strategies can still run.
    try {
      const quoteSummary = await withTimeout(
        yahooFinance.quoteSummary(request.symbol, { modules: ['price'] }) as Promise<{
          price?: { splitFactor?: string | null };
        }>,
        5_000,
        `Corporate actions ${request.symbol}`
      );

      const splitFactor = quoteSummary.price?.splitFactor ?? null;
      if (!splitFactor || splitFactor === 'N/A') {
        return [];
      }

      const [left, right] = splitFactor.split(':').map((value) => Number(value));
      if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) {
        return [];
      }

      return [
        {
          symbol: request.symbol.toUpperCase(),
          effectiveDate: new Date(request.end),
          actionType: 'split',
          ratio: left / right,
          notes: `Derived from splitFactor=${splitFactor}`,
        },
      ];
    } catch (error) {
      log.debug({ error, symbol: request.symbol }, 'Corporate action lookup failed; returning empty list');
      return [];
    }
  }
}
