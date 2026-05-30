/**
 * Type definitions for the Robinhood CSV import feature.
 *
 * This module defines the intermediate data structures used during import:
 * - Parsed CSV rows from Robinhood exports
 * - Matched trade pairs (entry + exit) for FIFO processing
 * - Import result summaries
 * - Duplicate detection warnings
 */

import { type OptionStrategy, type TradeStatus, type TradeType } from '@/db/constants';

// ============================================================================
// Raw CSV Row Types (from Robinhood exports)
// ============================================================================

/**
 * Raw stock trade row from Robinhood CSV export.
 * Represents a single order as exported by robin_stocks library.
 */
export interface RobinhoodStockRow {
  symbol: string;
  date: string; // ISO date string
  order_type: string; // 'market', 'limit', etc.
  side: string; // 'buy', 'sell'
  fees: string; // Dollar amount as string
  quantity: string; // Number as string
  average_price: string; // Dollar amount as string
}

/**
 * Raw option trade row from Robinhood CSV export.
 * Represents a single option order with leg details.
 */
export interface RobinhoodOptionRow {
  chain_symbol: string; // Underlying ticker
  expiration_date: string; // ISO date string
  strike_price: string; // Dollar amount as string
  option_type: string; // 'call', 'put'
  side: string; // 'buy', 'sell'
  order_created_at: string; // ISO datetime string
  direction: string; // 'debit', 'credit'
  order_quantity: string; // Number as string
  order_type: string; // 'market', 'limit', etc.
  opening_strategy?: string; // Robinhood strategy name (optional)
  closing_strategy?: string; // Robinhood strategy name (optional)
  price: string; // Premium as string
  processed_quantity: string; // Filled quantity as string
}

// ============================================================================
// Parsed Trade Types (intermediate format)
// ============================================================================

/**
 * Parsed option leg from CSV row.
 * Normalized format with typed fields ready for database insertion.
 */
export interface ParsedOptionLeg {
  legType: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  expiration: Date;
  premium: number; // Entry premium (positive)
  exitPremium?: number; // Exit premium if closing
  quantity: number;
  isAssigned?: boolean;
  assignmentDate?: Date;
  assignmentNotes?: string;
  isExpired?: boolean;
  expirationValue?: number;
}

/**
 * Parsed trade from CSV row.
 * Universal format for both stock and option trades before database insertion.
 *
 * Why this structure: Decouples CSV parsing from database schema, allowing
 * flexible validation and transformation before persistence.
 */
export interface ParsedTrade {
  // Core fields
  type: TradeType;
  status: TradeStatus;
  ticker: string;
  entryDate: Date;
  exitDate?: Date;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;

  // Option-specific fields
  strategy?: OptionStrategy;
  underlyingPrice?: number;
  optionLegs?: ParsedOptionLeg[];

  // Fee tracking
  entryFees?: number;
  exitFees?: number;
  totalFees?: number;

  // Import metadata
  importSource: 'robinhood_csv' | 'manual';
  importBatchId?: string;

  // Notes
  openingNotes?: string;
  closingNotes?: string;

  // Calculated fields
  pnl?: number;

  // CSV metadata for debugging
  csvRowNumber?: number;
  csvFileName?: string;
}

// ============================================================================
// FIFO Matching Types
// ============================================================================

/**
 * A matched pair of opening and closing trades.
 * Used for FIFO matching and auto-calculation of P&L.
 */
export interface MatchedPair {
  open: ParsedTrade;
  close: ParsedTrade;
  pnl: number; // Calculated P&L including fees
  confidence: 'exact' | 'partial' | 'uncertain'; // Match quality
  matchReason: string; // Human-readable explanation of match
}

/**
 * Result of FIFO matching algorithm.
 * Contains matched pairs and remaining open positions.
 */
export interface MatchingResult {
  matched: MatchedPair[];
  unmatchedOpens: ParsedTrade[]; // Positions still open
  unmatchedCloses: ParsedTrade[]; // Closes without matching opens
  errors: MatchingError[];
}

/**
 * Error encountered during FIFO matching.
 */
export interface MatchingError {
  trade: ParsedTrade;
  error: string;
  severity: 'warning' | 'error';
}

// ============================================================================
// Duplicate Detection Types
// ============================================================================

/**
 * Warning about potential duplicate trade.
 * Only exact matches (date+time+quantity+price) are flagged.
 */
export interface DuplicateWarning {
  csvTrade: ParsedTrade;
  existingTradeId: string;
  existingTrade: {
    ticker: string;
    entryDate: Date;
    quantity: number;
    entryPrice: number;
    type: TradeType;
    strategy?: string;
  };
  matchFields: string[]; // Fields that matched
  confidence: 'exact' | 'high' | 'medium'; // Match confidence
}

// ============================================================================
// Import Result Types
// ============================================================================

/**
 * Result of a single trade import attempt.
 */
export interface ImportTradeResult {
  success: boolean;
  tradeId?: string;
  trade: ParsedTrade;
  error?: string;
  skipped?: boolean;
  skipReason?: 'duplicate' | 'validation_error' | 'user_excluded';
}

/**
 * Summary of bulk import operation.
 * Returned by the import API endpoint.
 */
export interface ImportSummary {
  importBatchId: string;
  totalProcessed: number;
  imported: number;
  skipped: number;
  errors: number;
  results: ImportTradeResult[];
  duplicates: DuplicateWarning[];
  timestamp: Date;
}

// ============================================================================
// Import Options
// ============================================================================

/**
 * Options for controlling import behavior.
 * Passed to the import API endpoint.
 */
export interface ImportOptions {
  skipDuplicates: boolean; // Auto-skip exact duplicates without prompting
  autoCloseMatched: boolean; // Auto-close matched pairs via FIFO
  importBatchId?: string; // Group related imports (generated if not provided)
  validateOnly?: boolean; // Parse and validate without importing
  dryRun?: boolean; // Full import flow without database writes
}

// ============================================================================
// CSV Parsing Types
// ============================================================================

/**
 * Result of CSV parsing operation.
 * Contains parsed trades and validation errors.
 */
export interface ParseResult {
  trades: ParsedTrade[];
  errors: ParseError[];
  fileName: string;
  rowCount: number;
  type: 'stock' | 'option' | 'unknown';
}

/**
 * Error encountered during CSV parsing.
 */
export interface ParseError {
  row: number;
  field?: string;
  value?: string;
  error: string;
  severity: 'warning' | 'error';
  rawRow?: Record<string, string>; // Original CSV row for debugging
}

/**
 * CSV file metadata and validation.
 */
export interface CSVFile {
  name: string;
  size: number;
  type: string;
  content: string; // Raw CSV content
  encoding?: string;
}

// ============================================================================
// Strategy Detection Types
// ============================================================================

/**
 * Robinhood strategy name mapping.
 * Maps Robinhood CSV strategy names to our internal strategy enum.
 */
export const ROBINHOOD_STRATEGY_MAP: Record<string, OptionStrategy> = {
  // Single leg strategies
  'buy_call': 'long_call',
  'buy_put': 'long_put',
  'sell_covered_call': 'covered_call',
  'sell_cash_secured_put': 'cash_secured_put',

  // Debit spreads
  'call_debit_spread': 'call_debit_spread',
  'put_debit_spread': 'put_debit_spread',
  'bull_call_spread': 'call_debit_spread', // Alias
  'bear_put_spread': 'put_debit_spread', // Alias

  // Credit spreads
  'call_credit_spread': 'call_credit_spread',
  'put_credit_spread': 'put_credit_spread',
  'bear_call_spread': 'call_credit_spread', // Alias
  'bull_put_spread': 'put_credit_spread', // Alias

  // Straddles and strangles
  'long_straddle': 'long_straddle',
  'short_straddle': 'short_straddle',
  'long_strangle': 'long_strangle',
  'short_strangle': 'short_strangle',

  // Complex strategies
  'iron_condor': 'iron_condor',
  'iron_butterfly': 'iron_butterfly',
  'jade_lizard': 'jade_lizard',

  // Calendar and diagonal
  'calendar_spread': 'calendar_spread',
  'diagonal_spread': 'diagonal_spread',

  // Fallback
  'custom': 'custom',
};

/**
 * Pattern-based strategy detection input.
 * Used when Robinhood strategy field is missing or unreliable.
 */
export interface StrategyPattern {
  legs: ParsedOptionLeg[];
  ticker: string;
  entryDate: Date;
  direction?: 'debit' | 'credit';
}

/**
 * Strategy detection result.
 */
export interface StrategyDetectionResult {
  strategy: OptionStrategy;
  confidence: 'high' | 'medium' | 'low';
  reason: string; // Explanation of detection logic
  suggestedAlternatives?: OptionStrategy[]; // Other possible strategies
}
