/**
 * Yahoo Finance Market Data Service
 * Provides options chain data (no Greeks, but free and no API key required)
 *
 * Uses yahoo-finance2 npm package
 * Limitations:
 * - No Greeks (delta, gamma, theta, vega) - use strike distance for filtering
 * - Data may be delayed 15+ minutes
 * - IV is available but no IV rank history
 */

import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance client (required in v3+)
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ============================================================================
// Types (compatible with Tradier interface for easy swap)
// ============================================================================

export interface OptionContract {
  symbol: string;
  description: string;
  strike: number;
  expiration: string;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  last: number | null;
  volume: number;
  openInterest: number;
  delta: number | null; // Always null - Yahoo doesn't provide Greeks
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  impliedVolatility: number | null;
  bidIv: number | null;
  askIv: number | null;
  inTheMoney: boolean;
}

export interface OptionsChainResponse {
  symbol: string;
  underlyingPrice: number;
  expiration: string;
  calls: OptionContract[];
  puts: OptionContract[];
  fetchedAt: string;
  isDelayed: boolean;
  hasGreeks: boolean; // Always false for Yahoo
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  week52High: number;
  week52Low: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get stock quote for underlying
 */
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const result = await yahooFinance.quote(symbol);

  // Type guard for quote result
  const quote = result as {
    symbol: string;
    regularMarketPrice?: number;
    regularMarketChange?: number;
    regularMarketChangePercent?: number;
    bid?: number;
    ask?: number;
    regularMarketVolume?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketOpen?: number;
    regularMarketPreviousClose?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };

  if (!quote || !quote.regularMarketPrice) {
    throw new Error(`No quote data for symbol: ${symbol}`);
  }

  return {
    symbol: quote.symbol,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? 0,
    bid: quote.bid ?? quote.regularMarketPrice,
    ask: quote.ask ?? quote.regularMarketPrice,
    volume: quote.regularMarketVolume ?? 0,
    high: quote.regularMarketDayHigh ?? quote.regularMarketPrice,
    low: quote.regularMarketDayLow ?? quote.regularMarketPrice,
    open: quote.regularMarketOpen ?? quote.regularMarketPrice,
    previousClose: quote.regularMarketPreviousClose ?? quote.regularMarketPrice,
    week52High: quote.fiftyTwoWeekHigh ?? quote.regularMarketPrice,
    week52Low: quote.fiftyTwoWeekLow ?? quote.regularMarketPrice,
  };
}

// Type for Yahoo Finance options result
interface YahooOptionsResult {
  expirationDates?: Date[];
  strikes?: number[];
  quote?: {
    regularMarketPrice?: number;
  };
  options?: Array<{
    expirationDate: Date;
    calls?: Array<{
      contractSymbol: string;
      strike: number;
      bid?: number;
      ask?: number;
      lastPrice?: number;
      volume?: number;
      openInterest?: number;
      impliedVolatility?: number;
      inTheMoney?: boolean;
    }>;
    puts?: Array<{
      contractSymbol: string;
      strike: number;
      bid?: number;
      ask?: number;
      lastPrice?: number;
      volume?: number;
      openInterest?: number;
      impliedVolatility?: number;
      inTheMoney?: boolean;
    }>;
  }>;
}

/**
 * Get available expiration dates for a symbol
 */
export async function getExpirations(symbol: string): Promise<string[]> {
  const result = (await yahooFinance.options(symbol)) as YahooOptionsResult;

  if (!result.expirationDates || result.expirationDates.length === 0) {
    return [];
  }

  // Convert Date objects to YYYY-MM-DD strings
  return result.expirationDates.map((date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  });
}

/**
 * Get the next Friday expiration (weekly options)
 */
export async function getNextFridayExpiration(symbol: string): Promise<string | null> {
  const expirations = await getExpirations(symbol);
  const today = new Date();

  // Find the nearest Friday expiration
  for (const exp of expirations) {
    const expDate = new Date(exp + 'T00:00:00');
    if (expDate >= today && expDate.getDay() === 5) {
      return exp;
    }
  }

  // If no Friday found, return the first available expiration
  return expirations[0] ?? null;
}

/**
 * Get options chain (without Greeks)
 */
export async function getOptionsChain(
  symbol: string,
  expiration: string
): Promise<OptionsChainResponse> {
  // Yahoo Finance requires Date object for expiration (use UTC to avoid timezone issues)
  const expDate = new Date(expiration + 'T00:00:00Z');

  const result = (await yahooFinance.options(symbol, { date: expDate })) as YahooOptionsResult;

  if (!result.quote || !result.quote.regularMarketPrice) {
    throw new Error(`No quote data for symbol: ${symbol}`);
  }

  const underlyingPrice = result.quote.regularMarketPrice;

  // When we request a specific expiration date, Yahoo returns it as options[0]
  // Just take the first (and usually only) options entry
  const optionsForExpiration = result.options?.[0];

  const calls: OptionContract[] = [];
  const puts: OptionContract[] = [];

  if (optionsForExpiration) {
    // Process calls
    for (const call of optionsForExpiration.calls || []) {
      calls.push({
        symbol: call.contractSymbol,
        description: `${symbol} ${expiration} ${call.strike} Call`,
        strike: call.strike,
        expiration,
        optionType: 'call',
        bid: call.bid ?? 0,
        ask: call.ask ?? 0,
        last: call.lastPrice ?? null,
        volume: call.volume ?? 0,
        openInterest: call.openInterest ?? 0,
        delta: null, // Yahoo doesn't provide Greeks
        gamma: null,
        theta: null,
        vega: null,
        impliedVolatility: call.impliedVolatility ?? null,
        bidIv: null,
        askIv: null,
        inTheMoney: call.inTheMoney ?? call.strike < underlyingPrice,
      });
    }

    // Process puts
    for (const put of optionsForExpiration.puts || []) {
      puts.push({
        symbol: put.contractSymbol,
        description: `${symbol} ${expiration} ${put.strike} Put`,
        strike: put.strike,
        expiration,
        optionType: 'put',
        bid: put.bid ?? 0,
        ask: put.ask ?? 0,
        last: put.lastPrice ?? null,
        volume: put.volume ?? 0,
        openInterest: put.openInterest ?? 0,
        delta: null, // Yahoo doesn't provide Greeks
        gamma: null,
        theta: null,
        vega: null,
        impliedVolatility: put.impliedVolatility ?? null,
        bidIv: null,
        askIv: null,
        inTheMoney: put.inTheMoney ?? put.strike > underlyingPrice,
      });
    }
  }

  // Sort by strike
  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  return {
    symbol,
    underlyingPrice,
    expiration,
    calls,
    puts,
    fetchedAt: new Date().toISOString(),
    isDelayed: true, // Yahoo data is always delayed
    hasGreeks: false,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate annualized return for selling an option
 */
export function calculateAnnualizedReturn(
  premium: number,
  strike: number,
  daysToExpiration: number
): number {
  if (strike === 0 || daysToExpiration === 0) return 0;
  const collateral = strike * 100; // Per contract
  const creditPerContract = premium * 100;
  const returnPct = creditPerContract / collateral;
  const annualized = (returnPct * 365) / daysToExpiration;
  return annualized * 100; // As percentage
}

/**
 * Calculate days to expiration
 */
export function calculateDte(expiration: string): number {
  const expDate = new Date(expiration + 'T16:00:00'); // Market close
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Get average IV from options chain (ATM options)
 */
export function getAtmIv(
  chain: OptionsChainResponse,
  optionType: 'call' | 'put' = 'put'
): number | null {
  const options = optionType === 'call' ? chain.calls : chain.puts;
  const price = chain.underlyingPrice;

  // Find ATM option (closest strike to current price)
  let atmOption: OptionContract | null = null;
  let minDistance = Infinity;

  for (const opt of options) {
    const distance = Math.abs(opt.strike - price);
    if (distance < minDistance && opt.impliedVolatility) {
      minDistance = distance;
      atmOption = opt;
    }
  }

  return atmOption?.impliedVolatility ?? null;
}

/**
 * Filter options by OTM percentage range (since we don't have Greeks)
 * For puts: OTM% = (underlyingPrice - strike) / underlyingPrice
 * For calls: OTM% = (strike - underlyingPrice) / underlyingPrice
 *
 * @param options - Array of option contracts
 * @param underlyingPrice - Current stock price
 * @param minOtmPercent - Minimum OTM percentage (0-1, e.g., 0.05 = 5%)
 * @param maxOtmPercent - Maximum OTM percentage (0-1, e.g., 0.15 = 15%)
 */
export function filterByOtmPercent(
  options: OptionContract[],
  underlyingPrice: number,
  minOtmPercent: number,
  maxOtmPercent: number
): OptionContract[] {
  return options.filter((opt) => {
    const otmPercent =
      opt.optionType === 'put'
        ? (underlyingPrice - opt.strike) / underlyingPrice
        : (opt.strike - underlyingPrice) / underlyingPrice;

    // Only include OTM options (otmPercent > 0)
    return otmPercent >= minOtmPercent && otmPercent <= maxOtmPercent;
  });
}

/**
 * Estimate delta from strike distance (rough approximation)
 * This is a very rough estimate - real delta depends on IV, time, etc.
 *
 * Rule of thumb:
 * - ATM options have ~0.50 delta
 * - 1 standard deviation OTM ≈ 0.16 delta
 * - Approximation: delta ≈ 0.5 - (otmPercent / iv)
 */
export function estimateDeltaFromDistance(
  strike: number,
  underlyingPrice: number,
  optionType: 'call' | 'put',
  iv: number | null,
  dte: number
): number | null {
  if (!iv || iv === 0 || dte === 0) return null;

  // Calculate OTM percentage
  const otmPercent =
    optionType === 'put'
      ? (underlyingPrice - strike) / underlyingPrice
      : (strike - underlyingPrice) / underlyingPrice;

  // Rough delta estimation using normal distribution approximation
  // Standard deviation move = iv * sqrt(dte/365)
  const annualizedIv = iv; // IV is already annualized
  const stdMove = annualizedIv * Math.sqrt(dte / 365);

  if (stdMove === 0) return null;

  // Number of standard deviations OTM
  const numStdDevs = otmPercent / stdMove;

  // Approximate delta using simplified normal CDF
  // For puts: delta = -N(-d) ≈ -(0.5 - numStdDevs * 0.3) clamped
  // For calls: delta = N(d) ≈ (0.5 - numStdDevs * 0.3) clamped
  const rawDelta = Math.max(0, Math.min(1, 0.5 - numStdDevs * 0.3));

  return optionType === 'put' ? -rawDelta : rawDelta;
}
