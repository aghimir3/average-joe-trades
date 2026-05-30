/**
 * Demo mode constants.
 *
 * Fixed IDs for demo user and accounts so that all demo data
 * is internally consistent and deterministic.
 */

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export const DEMO_ACCOUNTS = {
  robinhood: {
    id: '00000000-0000-0000-0000-000000000010',
    broker: 'robinhood',
    name: 'Robinhood Individual',
  },
  schwab: {
    id: '00000000-0000-0000-0000-000000000020',
    broker: 'schwab',
    name: 'Schwab IRA',
  },
} as const;

export const DEMO_USER = {
  id: DEMO_USER_ID,
  name: 'Demo User',
  email: 'demo@example.com',
  image: null,
} as const;

/** Symbols used across demo data */
export const DEMO_SYMBOLS = [
  'AAPL', 'TSLA', 'NVDA', 'SPY', 'MSFT',
  'AMD', 'AMZN', 'META', 'QQQ', 'PLTR', 'HOOD',
] as const;
