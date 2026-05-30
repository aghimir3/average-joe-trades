/**
 * Finnhub Market Data Service
 * Provides earnings calendar data (free tier)
 *
 * API Documentation: https://finnhub.io/docs/api/earnings-calendar
 * Free tier: 60 calls/minute
 */

// ============================================================================
// Types
// ============================================================================

export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  hour: 'bmo' | 'amc' | 'dmh' | ''; // Before market open, after market close, during market hours
  quarter: number;
  year: number;
}

interface FinnhubEarningsResponse {
  earningsCalendar: Array<{
    symbol: string;
    date: string;
    epsActual: number | null;
    epsEstimate: number | null;
    revenueActual: number | null;
    revenueEstimate: number | null;
    hour: string;
    quarter: number;
    year: number;
  }>;
}

// ============================================================================
// Configuration
// ============================================================================

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function getFinnhubConfig(): { token: string } {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    throw new Error('FINNHUB_API_KEY environment variable is required');
  }
  return { token };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get upcoming earnings for a specific symbol
 * Returns earnings within the next 60 days
 */
export async function getUpcomingEarnings(symbol: string): Promise<EarningsEvent | null> {
  const { token } = getFinnhubConfig();

  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);

  const fromDate = today.toISOString().split('T')[0];
  const toDate = futureDate.toISOString().split('T')[0];

  const url = `${FINNHUB_BASE_URL}/calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${token}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }

  const data: FinnhubEarningsResponse = await response.json();

  if (!data.earningsCalendar || data.earningsCalendar.length === 0) {
    return null;
  }

  // Return the next upcoming earnings event
  const next = data.earningsCalendar[0];
  return {
    symbol: next.symbol,
    date: next.date,
    epsActual: next.epsActual,
    epsEstimate: next.epsEstimate,
    revenueActual: next.revenueActual,
    revenueEstimate: next.revenueEstimate,
    hour: (next.hour as EarningsEvent['hour']) || '',
    quarter: next.quarter,
    year: next.year,
  };
}

/**
 * Check if earnings are within the expiration window
 * Returns warning info if earnings fall before option expiration
 */
export async function checkEarningsRisk(
  symbol: string,
  expirationDate: string
): Promise<{
  hasEarningsRisk: boolean;
  earningsDate: string | null;
  daysToEarnings: number | null;
  message: string | null;
}> {
  try {
    const earnings = await getUpcomingEarnings(symbol);

    if (!earnings) {
      return {
        hasEarningsRisk: false,
        earningsDate: null,
        daysToEarnings: null,
        message: null,
      };
    }

    const earningsDateObj = new Date(earnings.date + 'T00:00:00');
    const expirationDateObj = new Date(expirationDate + 'T00:00:00');
    const today = new Date();

    const daysToEarnings = Math.ceil(
      (earningsDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if earnings are before expiration
    const hasEarningsRisk = earningsDateObj <= expirationDateObj;

    return {
      hasEarningsRisk,
      earningsDate: earnings.date,
      daysToEarnings,
      message: hasEarningsRisk
        ? `Earnings ${earnings.date} before expiration - HIGH IV CRUSH RISK`
        : daysToEarnings <= 14
          ? `Earnings ${earnings.date} (${daysToEarnings} days) - monitor closely`
          : null,
    };
  } catch (error) {
    // If Finnhub is not configured, return no risk (graceful degradation)
    console.warn('Finnhub earnings check failed:', error);
    return {
      hasEarningsRisk: false,
      earningsDate: null,
      daysToEarnings: null,
      message: null,
    };
  }
}

/**
 * Get earnings hour display string
 */
export function getEarningsHourLabel(hour: EarningsEvent['hour']): string {
  switch (hour) {
    case 'bmo':
      return 'Before Market Open';
    case 'amc':
      return 'After Market Close';
    case 'dmh':
      return 'During Market Hours';
    default:
      return 'Time TBD';
  }
}
