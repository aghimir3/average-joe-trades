import { apiJson } from '@/lib/api/response';
/**
 * Options Chain API Route
 * GET /api/market/options-chain?symbol=TSLA&expiration=2024-02-07
 *
 * Returns options chain data from Yahoo Finance (free, no API key required)
 * Note: Greeks (delta, gamma, theta, vega) are NOT available with Yahoo Finance
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import {
  getOptionsChain,
  getExpirations,
  getNextFridayExpiration,
  filterByOtmPercent,
  calculateAnnualizedReturn,
  calculateDte,
  getAtmIv,
  estimateDeltaFromDistance,
  type OptionContract,
} from '@/lib/services/yahoo-finance';

// ============================================================================
// Request Schema
// ============================================================================

const querySchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  expiration: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiration must be YYYY-MM-DD')
    .optional(),
  // OTM percentage filtering (since Yahoo doesn't provide Greeks)
  minOtmPercent: z.coerce.number().min(0).max(1).optional(),
  maxOtmPercent: z.coerce.number().min(0).max(1).optional(),
});

// ============================================================================
// Response Types
// ============================================================================

interface EnrichedOption extends OptionContract {
  annualizedReturn: number;
  probOtm: number | null;
  credit: number; // Total credit per contract
  otmPercent: number; // Distance from current price as percentage
  estimatedDelta: number | null; // Rough delta estimate (not from Greeks)
}

interface OptionsChainApiResponse {
  symbol: string;
  underlyingPrice: number;
  expiration: string;
  dte: number;
  atmIv: number | null;
  calls: EnrichedOption[];
  puts: EnrichedOption[];
  expirations: string[];
  fetchedAt: string;
  isDelayed: boolean;
  hasGreeks: boolean; // False for Yahoo Finance data
}

// ============================================================================
// Helper Functions
// ============================================================================

function enrichOptions(
  options: OptionContract[],
  underlyingPrice: number,
  dte: number,
  atmIv: number | null
): EnrichedOption[] {
  return options.map((opt) => {
    // Calculate OTM percentage
    const otmPercent =
      opt.optionType === 'put'
        ? (underlyingPrice - opt.strike) / underlyingPrice
        : (opt.strike - underlyingPrice) / underlyingPrice;

    // Estimate delta from strike distance (since Yahoo doesn't provide Greeks)
    const estimatedDelta = estimateDeltaFromDistance(
      opt.strike,
      underlyingPrice,
      opt.optionType,
      opt.impliedVolatility ?? atmIv,
      dte
    );

    // Estimate probOtm from estimated delta
    const probOtm = estimatedDelta !== null ? Math.round((1 - Math.abs(estimatedDelta)) * 100) : null;

    return {
      ...opt,
      annualizedReturn: calculateAnnualizedReturn(opt.bid, opt.strike, dte),
      probOtm,
      credit: Math.round(opt.bid * 100 * 100) / 100, // Per contract, rounded to cents
      otmPercent: Math.round(otmPercent * 10000) / 100, // As percentage with 2 decimal places
      estimatedDelta,
    };
  });
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;
    userId = session.user.id;

    // Parse query params
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        {
          error: 'Bad Request',
          message: 'Invalid query parameters',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { symbol, minOtmPercent, maxOtmPercent } = validated.data;
    let { expiration } = validated.data;

    log.info({ userId, symbol, expiration }, 'Fetching options chain');

    // Get expirations list
    const expirations = await getExpirations(symbol);

    if (expirations.length === 0) {
      return apiJson(
        {
          error: 'Not Found',
          message: `No options available for symbol: ${symbol}`,
        },
        { status: 404 }
      );
    }

    // If no expiration specified, get next Friday (weekly)
    if (!expiration) {
      const nextFriday = await getNextFridayExpiration(symbol);
      expiration = nextFriday ?? expirations[0];
    }

    // Validate expiration exists
    if (!expirations.includes(expiration)) {
      return apiJson(
        {
          error: 'Bad Request',
          message: `Invalid expiration date. Available: ${expirations.slice(0, 5).join(', ')}...`,
        },
        { status: 400 }
      );
    }

    // Fetch options chain
    const chain = await getOptionsChain(symbol, expiration);
    const dte = calculateDte(expiration);
    const atmIv = getAtmIv(chain, 'put');

    // Filter by OTM percentage if specified (since Yahoo doesn't provide Greeks)
    let filteredCalls = chain.calls;
    let filteredPuts = chain.puts;

    if (minOtmPercent !== undefined || maxOtmPercent !== undefined) {
      const min = minOtmPercent ?? 0;
      const max = maxOtmPercent ?? 1;
      filteredCalls = filterByOtmPercent(chain.calls, chain.underlyingPrice, min, max);
      filteredPuts = filterByOtmPercent(chain.puts, chain.underlyingPrice, min, max);
    }

    // Enrich with calculated fields
    const enrichedCalls = enrichOptions(filteredCalls, chain.underlyingPrice, dte, atmIv);
    const enrichedPuts = enrichOptions(filteredPuts, chain.underlyingPrice, dte, atmIv);

    const response_data: OptionsChainApiResponse = {
      symbol: chain.symbol,
      underlyingPrice: chain.underlyingPrice,
      expiration,
      dte,
      atmIv,
      calls: enrichedCalls,
      puts: enrichedPuts,
      expirations,
      fetchedAt: chain.fetchedAt,
      isDelayed: chain.isDelayed,
      hasGreeks: chain.hasGreeks,
    };

    log.info(
      { userId, symbol, expiration, callCount: enrichedCalls.length, putCount: enrichedPuts.length },
      'Options chain fetched'
    );

    return apiJson({ data: response_data });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch options chain');

    // Handle specific errors
    if (errorMessage.includes('No quote data') || errorMessage.includes('No options')) {
      return apiJson(
        { error: 'Not Found', message: errorMessage },
        { status: 404 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch options chain' },
      { status: 500 }
    );
  }
}

