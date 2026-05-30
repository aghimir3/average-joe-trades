/**
 * Schwab JSON Parser Utilities
 *
 * Provides parsing functions for Schwab JSON transaction exports.
 *
 * Schwab JSON format:
 * {
 *   "FromDate": "01/20/2022",
 *   "ToDate": "01/20/2026",
 *   "TotalTransactionsAmount": "$1,980.55",
 *   "BrokerageTransactions": [
 *     {
 *       "Date": "01/20/2026",
 *       "Action": "Buy to Open",
 *       "Symbol": "IBIT 02/20/2026 52.50 P",
 *       "Description": "PUT ISHR BITCOIN TR ETF $52.5 EXP 02/20/26",
 *       "Quantity": "5",
 *       "Price": "$3.25",
 *       "Fees & Comm": "$3.30",
 *       "Amount": "-$1,628.30",
 *       "ItemIssueId": "128406523",
 *       "AcctgRuleCd": "2"
 *     }
 *   ]
 * }
 *
 * Option Symbol Format: "TICKER MM/DD/YYYY STRIKE.XX C/P"
 * Example: "IBIT 02/20/2026 52.50 P" -> IBIT Put $52.50 exp 02/20/2026
 */

import type { TransCode, OptionType } from '../types';

/**
 * Raw Schwab transaction from JSON.
 */
export interface SchwabRawTransaction {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  'Fees & Comm': string;
  Amount: string;
  ItemIssueId: string;
  AcctgRuleCd: string;
}

/**
 * Raw Schwab JSON export format.
 */
export interface SchwabJsonExport {
  FromDate: string;
  ToDate: string;
  TotalTransactionsAmount: string;
  BrokerageTransactions: SchwabRawTransaction[];
}

/**
 * Parsed option details from Schwab symbol.
 */
export interface ParsedOptionDetails {
  ticker: string;
  expiration: Date;
  strike: number;
  optionType: OptionType;
}

/**
 * Map Schwab action to our unified TransCode.
 * Returns null for actions we should skip.
 */
export function mapSchwabAction(action: string): TransCode | null {
  const normalized = action.toLowerCase().trim();

  const actionMap: Record<string, TransCode> = {
    // Stock transactions
    'buy': 'BUY',
    'sell': 'SELL',

    // Option transactions
    'buy to open': 'BTO',
    'sell to open': 'STO',
    'buy to close': 'BTC',
    'sell to close': 'STC',
    'expired': 'OEXP',
    'assigned': 'OASGN',
  };

  return actionMap[normalized] || null;
}

/**
 * Actions to skip (non-trade activities).
 */
export const SCHWAB_SKIP_ACTIONS = [
  'journal',
  'journaled shares',
  'moneylink transfer',
  'credit interest',
  'debit interest',
  'wire transfer',
  'ach',
  'dividend',
  'qualified dividend',
  'non-qualified div',
  'foreign tax withheld',
  'margin interest',
  'stock split',
  'reverse split',
  'name change',
  'merger',
  'spinoff',
];

/**
 * Check if an action should be skipped.
 */
export function shouldSkipSchwabAction(action: string): boolean {
  const normalized = action.toLowerCase().trim();
  return SCHWAB_SKIP_ACTIONS.includes(normalized);
}

/**
 * Parse Schwab price string.
 * Handles formats like "$3.25", "-$1,628.30", "($1,234.56)", "$29.825"
 *
 * @param priceStr - Price string from Schwab
 * @returns Parsed number or null if empty/invalid
 */
export function parseSchwabPrice(priceStr: string): number | null {
  if (!priceStr || priceStr.trim() === '') {
    return null;
  }

  // Remove whitespace
  let cleaned = priceStr.trim();

  // Check for negative indicators
  const isNegative = cleaned.startsWith('-') || cleaned.startsWith('(');

  // Remove currency symbols, commas, parentheses, and minus sign
  cleaned = cleaned.replace(/[$,()+-]/g, '');

  // Parse as float
  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    return null;
  }

  return isNegative ? -value : value;
}

/**
 * Parse Schwab date string.
 * Handles formats like "01/20/2026" or "11/17/2025 as of 11/14/2025"
 *
 * For "as of" dates (used in expirations), we use the "as of" date.
 *
 * @param dateStr - Date string from Schwab
 * @returns Parsed Date at UTC noon, or null if invalid
 */
export function parseSchwabDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') {
    return null;
  }

  let toParse = dateStr.trim();

  // Handle "as of" format - use the "as of" date
  // Example: "11/17/2025 as of 11/14/2025" -> use "11/14/2025"
  const asOfMatch = toParse.match(/as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (asOfMatch) {
    toParse = asOfMatch[1];
  }

  // Parse MM/DD/YYYY format
  const match = toParse.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  const date = new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1, // JS months are 0-indexed
    parseInt(day),
    12, 0, 0, 0 // UTC noon to avoid timezone issues
  ));

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Parse Schwab option symbol.
 * Format: "TICKER MM/DD/YYYY STRIKE.XX C/P"
 *
 * Examples:
 * - "IBIT 02/20/2026 52.50 P" -> IBIT Put $52.50 exp 02/20/2026
 * - "GOOGL 11/14/2025 285.00 C" -> GOOGL Call $285.00 exp 11/14/2025
 * - "MSTR 02/20/2026 160.00 C" -> MSTR Call $160.00 exp 02/20/2026
 *
 * @param symbol - Schwab option symbol string
 * @returns Parsed option details or null if not an option/parse failed
 */
export function parseSchwabOptionSymbol(symbol: string): ParsedOptionDetails | null {
  if (!symbol || symbol.trim() === '') {
    return null;
  }

  const trimmed = symbol.trim();

  // Option symbol pattern: TICKER MM/DD/YYYY STRIKE C/P
  // More flexible pattern to handle various strike formats
  const optionPattern = /^([A-Z]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\d.]+)\s+([CP])$/i;
  const match = trimmed.match(optionPattern);

  if (!match) {
    return null;
  }

  const [, ticker, expDateStr, strikeStr, optionTypeChar] = match;

  // Parse expiration date
  const expiration = parseSchwabDate(expDateStr);
  if (!expiration) {
    return null;
  }

  // Parse strike price
  const strike = parseFloat(strikeStr);
  if (isNaN(strike) || strike <= 0) {
    return null;
  }

  // Determine option type
  const optionType: OptionType = optionTypeChar.toUpperCase() === 'C' ? 'call' : 'put';

  return {
    ticker: ticker.toUpperCase(),
    expiration,
    strike,
    optionType,
  };
}

/**
 * Check if a Schwab symbol represents an option.
 */
export function isSchwabOptionSymbol(symbol: string): boolean {
  return parseSchwabOptionSymbol(symbol) !== null;
}

/**
 * Extract the underlying ticker from a Schwab symbol.
 * For options, extracts the ticker from the option symbol.
 * For stocks, returns the symbol as-is.
 */
export function extractSchwabTicker(symbol: string): string {
  const optionDetails = parseSchwabOptionSymbol(symbol);
  if (optionDetails) {
    return optionDetails.ticker;
  }
  return symbol.trim().toUpperCase();
}

/**
 * Parse Schwab quantity string.
 * Handles negative quantities (e.g., "-1" for expired options).
 *
 * @param quantityStr - Quantity string from Schwab
 * @returns Absolute quantity value, or 0 if empty/invalid
 */
export function parseSchwabQuantity(quantityStr: string): number {
  if (!quantityStr || quantityStr.trim() === '') {
    return 0;
  }

  const value = parseInt(quantityStr.trim(), 10);
  if (isNaN(value)) {
    return 0;
  }

  // Return absolute value - sign is determined by action type
  return Math.abs(value);
}

/**
 * Validate the structure of a Schwab JSON export.
 */
export function validateSchwabJson(data: unknown): data is SchwabJsonExport {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (!Array.isArray(obj.BrokerageTransactions)) {
    return false;
  }

  // Check that transactions have required fields
  if (obj.BrokerageTransactions.length > 0) {
    const first = obj.BrokerageTransactions[0] as Record<string, unknown>;
    const requiredFields = ['Date', 'Action', 'Symbol'];
    for (const field of requiredFields) {
      if (typeof first[field] !== 'string') {
        return false;
      }
    }
  }

  return true;
}
