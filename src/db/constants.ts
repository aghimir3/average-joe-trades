/**
 * Database constants and type definitions.
 *
 * This file contains only TypeScript types and constants without
 * importing any ORM, making it safe to import in tests and
 * validation schemas.
 */

// ============================================================================
// TypeScript Types (enum-like constants for type safety)
// ============================================================================

/** Trade types - stock, option, or crypto */
export type TradeType = 'stock' | 'option' | 'crypto';
export const TRADE_TYPES = ['stock', 'option', 'crypto'] as const;

/** Trade status - lifecycle tracking */
export type TradeStatus = 'open' | 'partial' | 'closed';
export const TRADE_STATUSES = ['open', 'partial', 'closed'] as const;

/**
 * Option strategies supported by the app.
 * MVP focuses on first 4 (single-leg strategies).
 * Additional strategies are for future multi-leg support.
 */
export type OptionStrategy =
  | 'long_call'
  | 'long_put'
  | 'covered_call'
  | 'cash_secured_put'
  | 'call_debit_spread'
  | 'put_debit_spread'
  | 'call_credit_spread'
  | 'put_credit_spread'
  | 'long_straddle'
  | 'long_strangle'
  | 'short_straddle'
  | 'short_strangle'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'jade_lizard'
  | 'calendar_spread'
  | 'diagonal_spread'
  | 'custom';

export const OPTION_STRATEGIES = [
  'long_call',
  'long_put',
  'covered_call',
  'cash_secured_put',
  'call_debit_spread',
  'put_debit_spread',
  'call_credit_spread',
  'put_credit_spread',
  'long_straddle',
  'long_strangle',
  'short_straddle',
  'short_strangle',
  'iron_condor',
  'iron_butterfly',
  'jade_lizard',
  'calendar_spread',
  'diagonal_spread',
  'custom',
] as const;

/** MVP strategies - single-leg options for initial release */
export const MVP_STRATEGIES = [
  'long_call',
  'long_put',
  'covered_call',
  'cash_secured_put',
] as const;

/** Option leg types */
export type LegType = 'call' | 'put';
export const LEG_TYPES = ['call', 'put'] as const;

/** Option leg actions */
export type LegAction = 'buy' | 'sell';
export const LEG_ACTIONS = ['buy', 'sell'] as const;

// ============================================================================
// Ledger System Types
// ============================================================================

/**
 * Ledger event types for categorizing transactions.
 * Used to separate trading activity from other account activity.
 */
export type LedgerEventType =
  | 'EQUITY_STOCK'
  | 'EQUITY_OPTION'
  | 'CASH_MOVEMENT'
  | 'FEES_INTEREST'
  | 'DIVIDENDS_TAX'
  | 'FUTURES'
  | 'CRYPTO'
  | 'OTHER';

export const LEDGER_EVENT_TYPES = [
  'EQUITY_STOCK',
  'EQUITY_OPTION',
  'CASH_MOVEMENT',
  'FEES_INTEREST',
  'DIVIDENDS_TAX',
  'FUTURES',
  'CRYPTO',
  'OTHER',
] as const;

/**
 * Trading event types - subset of LedgerEventType that represents actual trades
 */
export const TRADING_EVENT_TYPES = ['EQUITY_STOCK', 'EQUITY_OPTION'] as const;

/**
 * Transaction codes and their mappings
 */
export const TRANS_CODE_MAPPING: Record<string, {
  eventType: LedgerEventType;
  action: string;
  isOpening: boolean;
  isClosing: boolean;
}> = {
  // Stock transactions
  BUY: { eventType: 'EQUITY_STOCK', action: 'buy', isOpening: true, isClosing: false },
  SELL: { eventType: 'EQUITY_STOCK', action: 'sell', isOpening: false, isClosing: true },

  // Option transactions
  BTO: { eventType: 'EQUITY_OPTION', action: 'buy', isOpening: true, isClosing: false },
  STO: { eventType: 'EQUITY_OPTION', action: 'sell', isOpening: true, isClosing: false },
  BTC: { eventType: 'EQUITY_OPTION', action: 'buy', isOpening: false, isClosing: true },
  STC: { eventType: 'EQUITY_OPTION', action: 'sell', isOpening: false, isClosing: true },
  OEXP: { eventType: 'EQUITY_OPTION', action: 'expired', isOpening: false, isClosing: true },
  OASGN: { eventType: 'EQUITY_OPTION', action: 'assigned', isOpening: false, isClosing: true },

  // Cash movements
  ACH: { eventType: 'CASH_MOVEMENT', action: 'transfer', isOpening: false, isClosing: false },
  ITRF: { eventType: 'CASH_MOVEMENT', action: 'internal_transfer', isOpening: false, isClosing: false },

  // Dividends and taxes
  CDIV: { eventType: 'DIVIDENDS_TAX', action: 'cash_dividend', isOpening: false, isClosing: false },
  MDIV: { eventType: 'DIVIDENDS_TAX', action: 'manufactured_dividend', isOpening: false, isClosing: false },
  DTAX: { eventType: 'DIVIDENDS_TAX', action: 'tax', isOpening: false, isClosing: false },

  // Fees and interest
  INT: { eventType: 'FEES_INTEREST', action: 'interest', isOpening: false, isClosing: false },
  MINT: { eventType: 'FEES_INTEREST', action: 'margin_interest', isOpening: false, isClosing: false },
  GOLD: { eventType: 'FEES_INTEREST', action: 'gold_fee', isOpening: false, isClosing: false },

  // Futures
  FUTSWP: { eventType: 'FUTURES', action: 'futures_swap', isOpening: false, isClosing: false },

  // Crypto transactions
  CRYPTO_BUY: { eventType: 'CRYPTO', action: 'buy', isOpening: true, isClosing: false },
  CRYPTO_SELL: { eventType: 'CRYPTO', action: 'sell', isOpening: false, isClosing: true },

  // Other
  SLIP: { eventType: 'OTHER', action: 'slip', isOpening: false, isClosing: false },
  RTP: { eventType: 'OTHER', action: 'rtp', isOpening: false, isClosing: false },
  SXCH: { eventType: 'OTHER', action: 'stock_exchange', isOpening: false, isClosing: false },
  ABIP: { eventType: 'OTHER', action: 'abip', isOpening: false, isClosing: false },
  MISC: { eventType: 'OTHER', action: 'miscellaneous', isOpening: false, isClosing: false },
  GMPC: { eventType: 'OTHER', action: 'gmpc', isOpening: false, isClosing: false },
  XENT: { eventType: 'OTHER', action: 'xent', isOpening: false, isClosing: false },
  'T/A': { eventType: 'OTHER', action: 'ta', isOpening: false, isClosing: false },
};

/** Close reason types for realized closes */
export type CloseReason = 'normal' | 'expired' | 'assigned';
export const CLOSE_REASONS = ['normal', 'expired', 'assigned'] as const;

/** Position side */
export type PositionSide = 'long' | 'short';
export const POSITION_SIDES = ['long', 'short'] as const;
