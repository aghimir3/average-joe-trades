/**
 * Normalized Transaction Interface for Multi-Broker Import System
 *
 * This module defines the common data structures used across all broker importers.
 * Each broker-specific importer (Robinhood, Schwab, Fidelity) converts its native
 * format into NormalizedTransaction, which is then written to the ledger.
 *
 * Architecture:
 * CSV/API Data → Broker Importer → NormalizedTransaction[] → Ledger Write Service → LedgerEvent
 */

// Note: Decimal type is not directly imported but used via Prisma schema

// ============================================================================
// Transaction Types & Constants
// ============================================================================

/**
 * Supported broker identifiers.
 * 'manual' is used for manually entered transactions.
 */
export const BROKERS = [
  'manual',
  'robinhood',
  'schwab',
  'fidelity',
  'td_ameritrade',
  'etrade',
  'interactive_brokers',
] as const;
export type Broker = (typeof BROKERS)[number];

/**
 * Source type for ledger events.
 */
export const SOURCE_TYPES = ['manual', 'import', 'api'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Event types for classification.
 */
export const EVENT_TYPES = [
  'EQUITY_STOCK',
  'EQUITY_OPTION',
  'CASH_MOVEMENT',
  'FEES_INTEREST',
  'DIVIDENDS_TAX',
  'FUTURES',
  'CRYPTO',
  'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Transaction codes - the action performed.
 * Unified across all brokers.
 */
export const TRANS_CODES = [
  // Stock transactions
  'BUY',
  'SELL',
  // Option transactions
  'BTO', // Buy to Open
  'STO', // Sell to Open
  'BTC', // Buy to Close
  'STC', // Sell to Close
  'OEXP', // Option Expired
  'OASGN', // Option Assigned
  // Cash movements
  'ACH', // Bank transfer
  'WIRE', // Wire transfer
  'INT', // Interest
  // Dividends and taxes
  'CDIV', // Cash dividend
  'DTAX', // Dividend tax
  // Other
  'ITRF', // Internal transfer
  'MINT', // Margin interest
  'FEE', // Fee
  'ADJ', // Adjustment
  'SPLIT', // Stock split
  'OTHER',
] as const;
export type TransCode = (typeof TRANS_CODES)[number];

/**
 * Option types.
 */
export const OPTION_TYPES = ['call', 'put'] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

/**
 * Close reasons for realized trades.
 */
export const CLOSE_REASONS = ['normal', 'expired', 'assigned'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/**
 * Option strategies - for manual entries and detection.
 */
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
export type OptionStrategy = (typeof OPTION_STRATEGIES)[number];

// ============================================================================
// Normalized Transaction Interface
// ============================================================================

/**
 * NormalizedTransaction - The common format all broker importers produce.
 *
 * This is the "lingua franca" between raw broker data and the ledger.
 * Broker importers convert their native CSV/API data to this format,
 * then the ledger write service converts this to LedgerEvent records.
 */
export interface NormalizedTransaction {
  // =========== Core Fields (Required) ===========
  /** Activity date normalized to UTC noon */
  activityDate: Date;
  /** Optional time of day in HH:MM format (e.g., "09:30", "14:45") */
  activityTime?: string;
  /** Normalized ticker symbol (uppercase) */
  symbol: string;
  /** Transaction code indicating the action */
  transCode: TransCode;
  /** Quantity of shares/contracts (always positive) */
  quantity: number;

  // =========== Pricing (Optional - depends on transaction type) ===========
  /** Price per unit (share or contract) */
  price?: number;
  /** Total dollar amount of the transaction */
  amount?: number;
  /** Transaction fees */
  fees?: number;

  // =========== Classification ===========
  /** Event type classification */
  eventType: EventType;
  /** Is this an option transaction? */
  isOption: boolean;

  // =========== Option Details (Required if isOption=true) ===========
  /** Call or put */
  optionType?: OptionType;
  /** Strike price */
  strike?: number;
  /** Expiration date */
  expiration?: Date;

  // =========== Source Data ===========
  /** Raw instrument string from source (for reference) */
  rawInstrument: string;
  /** Raw description from source */
  rawDescription?: string;
  /** Broker-provided transaction ID (for deduplication) */
  sourceTransactionId?: string;
  /** Process date (if different from activity date) */
  processDate?: Date;
  /** Settlement date */
  settleDate?: Date;

  // =========== Manual Entry Fields ===========
  /** User-specified strategy */
  strategy?: OptionStrategy;
  /** Groups related legs of a spread */
  positionGroupId?: string;
  /** User notes */
  notes?: string;

  // =========== Underlying Price (for options) ===========
  /**
   * The price of the underlying stock at the time of this option transaction.
   * Useful for analyzing option trades relative to underlying movement.
   * E.g., if buying a $150 call when stock is at $145, underlyingPrice = 145
   */
  underlyingPrice?: number;
}

/**
 * Import context passed to the ledger write service.
 */
export interface ImportContext {
  /** User ID */
  userId: string;
  /** Brokerage account ID */
  brokerageAccountId: string;
  /** Broker identifier */
  broker: Broker;
  /** Source type */
  sourceType: SourceType;
  /** Import batch ID (null for manual entries) */
  importBatchId?: string | null;
}

/**
 * Result from writing transactions to the ledger.
 */
export interface LedgerWriteResult {
  /** Number of events inserted */
  inserted: number;
  /** Number of duplicates skipped */
  duplicates: number;
  /** IDs of inserted events */
  insertedIds: string[];
  /** Warnings (non-fatal issues) */
  warnings: ImportWarning[];
  /** Errors (fatal issues that prevented writing) */
  errors: ImportError[];
}

/**
 * Warning during import (non-fatal).
 */
export interface ImportWarning {
  /** Index in the transaction array */
  index: number;
  /** Symbol if available */
  symbol?: string;
  /** Warning message */
  message: string;
  /** Warning code */
  code: 'price_missing' | 'amount_calculated' | 'option_parse_partial' | 'date_adjusted' | 'other';
}

/**
 * Error during import (prevented writing this transaction).
 */
export interface ImportError {
  /** Index in the transaction array */
  index: number;
  /** Symbol if available */
  symbol?: string;
  /** Error message */
  message: string;
  /** Error code */
  code:
    | 'invalid_symbol'
    | 'invalid_date'
    | 'invalid_quantity'
    | 'invalid_trans_code'
    | 'missing_option_details'
    | 'validation_failed'
    | 'database_error'
    | 'other';
}

// ============================================================================
// Broker Importer Interface
// ============================================================================

/**
 * BrokerImporter - Interface that all broker-specific importers must implement.
 *
 * Each broker has different CSV formats and data structures. Importers
 * convert broker-specific data to the normalized format.
 */
export interface BrokerImporter {
  /** Broker identifier */
  readonly broker: Broker;

  /** Supported file extensions (e.g., ['.csv']) */
  readonly supportedExtensions: string[];

  /**
   * Parse raw file content into normalized transactions.
   *
   * @param content - Raw file content (string for CSV, object for JSON)
   * @param options - Parser options
   * @returns Parsed transactions and any parse-time errors
   */
  parse(
    content: string,
    options?: ParseOptions
  ): Promise<ParseResult>;

  /**
   * Validate parsed transactions.
   * Called after parse() to perform additional validation.
   *
   * @param transactions - Parsed transactions
   * @returns Validation result with any errors/warnings
   */
  validate(transactions: NormalizedTransaction[]): ValidationResult;

  /**
   * Check if this importer can handle the given file.
   *
   * @param content - Raw file content
   * @param fileName - Original file name
   * @returns True if this importer can parse the file
   */
  canHandle(content: string, fileName: string): boolean;
}

/**
 * Options for parsing broker data.
 */
export interface ParseOptions {
  /** Skip certain transaction types */
  skipTransCodes?: TransCode[];
  /** Date range filter */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  /** Maximum rows to parse (for preview) */
  maxRows?: number;
}

/**
 * Result from parsing broker data.
 */
export interface ParseResult {
  /** Parsed transactions */
  transactions: NormalizedTransaction[];
  /** Total rows in the source file */
  totalRows: number;
  /** Rows successfully parsed */
  parsedRows: number;
  /** Rows skipped (e.g., non-trade rows) */
  skippedRows: number;
  /** Parse errors */
  errors: ImportError[];
  /** Parse warnings */
  warnings: ImportWarning[];
  /** Date range of transactions */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Result from validating transactions.
 */
export interface ValidationResult {
  /** Is the batch valid? */
  isValid: boolean;
  /** Validation errors */
  errors: ImportError[];
  /** Validation warnings */
  warnings: ImportWarning[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a date to UTC noon.
 * This avoids timezone issues where dates shift by a day.
 *
 * For string inputs in YYYY-MM-DD format (from HTML date inputs),
 * we parse the components directly to avoid timezone conversion issues.
 *
 * @param date - Date to normalize (string in YYYY-MM-DD format, or Date object)
 * @returns Date object at UTC noon
 */
export function normalizeActivityDate(date: Date | string): Date {
  if (typeof date === 'string') {
    // Parse YYYY-MM-DD string directly to avoid timezone issues
    // HTML date inputs always return YYYY-MM-DD format
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0, 0));
    }
    // Fallback for other date string formats
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
  }
  // For Date objects, use UTC methods to preserve the date
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}

/**
 * Parse a date string in various formats.
 * Supports: MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY
 *
 * @param dateStr - Date string to parse
 * @returns Parsed Date or null if invalid
 */
export function parseDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  // Try US format (M/D/YYYY or MM/DD/YYYY)
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Generate an instrument key for FIFO matching.
 *
 * For stocks: "{symbol}|stock"
 * For options: "{symbol}|{optionType}|{strike}|{expiration}"
 *
 * @param txn - Transaction to generate key for
 * @returns Instrument key string
 */
export function getInstrumentKey(txn: NormalizedTransaction): string {
  if (txn.isOption && txn.optionType && txn.strike !== undefined && txn.expiration) {
    const expStr = txn.expiration.toISOString().split('T')[0];
    return `${txn.symbol}|${txn.optionType}|${txn.strike}|${expStr}`;
  }
  return `${txn.symbol}|stock`;
}

/**
 * Determine if a transaction code represents opening a position.
 */
export function isOpeningTransCode(code: TransCode): boolean {
  return ['BUY', 'BTO', 'STO'].includes(code);
}

/**
 * Determine if a transaction code represents closing a position.
 */
export function isClosingTransCode(code: TransCode): boolean {
  return ['SELL', 'STC', 'BTC', 'OEXP', 'OASGN'].includes(code);
}

/**
 * Get the side (long/short) based on transaction code.
 */
export function getSideFromTransCode(code: TransCode): 'long' | 'short' {
  // Long positions: BUY (stock), BTO (options)
  // Short positions: STO (options)
  if (code === 'STO') return 'short';
  return 'long';
}

/**
 * Determine close reason from transaction code.
 */
export function getCloseReason(code: TransCode): CloseReason {
  if (code === 'OEXP') return 'expired';
  if (code === 'OASGN') return 'assigned';
  return 'normal';
}

/**
 * Normalize a ticker symbol (uppercase, trim whitespace).
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Validate that a NormalizedTransaction has all required fields.
 */
export function validateTransaction(txn: NormalizedTransaction): ImportError[] {
  const errors: ImportError[] = [];

  if (!txn.symbol || txn.symbol.trim() === '') {
    errors.push({
      index: 0,
      message: 'Symbol is required',
      code: 'invalid_symbol',
    });
  }

  if (!txn.activityDate || isNaN(txn.activityDate.getTime())) {
    errors.push({
      index: 0,
      symbol: txn.symbol,
      message: 'Valid activity date is required',
      code: 'invalid_date',
    });
  }

  if (typeof txn.quantity !== 'number' || txn.quantity <= 0) {
    errors.push({
      index: 0,
      symbol: txn.symbol,
      message: 'Quantity must be a positive number',
      code: 'invalid_quantity',
    });
  }

  if (!TRANS_CODES.includes(txn.transCode)) {
    errors.push({
      index: 0,
      symbol: txn.symbol,
      message: `Invalid transaction code: ${txn.transCode}`,
      code: 'invalid_trans_code',
    });
  }

  if (txn.isOption) {
    if (!txn.optionType || !OPTION_TYPES.includes(txn.optionType)) {
      errors.push({
        index: 0,
        symbol: txn.symbol,
        message: 'Option type (call/put) is required for options',
        code: 'missing_option_details',
      });
    }
    if (typeof txn.strike !== 'number' || txn.strike <= 0) {
      errors.push({
        index: 0,
        symbol: txn.symbol,
        message: 'Strike price is required for options',
        code: 'missing_option_details',
      });
    }
    if (!txn.expiration || isNaN(txn.expiration.getTime())) {
      errors.push({
        index: 0,
        symbol: txn.symbol,
        message: 'Expiration date is required for options',
        code: 'missing_option_details',
      });
    }
  }

  return errors;
}
