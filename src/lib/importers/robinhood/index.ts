/**
 * Robinhood Importer
 *
 * Adapts the Robinhood CSV parser to produce NormalizedTransactions
 * for the ledger-first import pipeline.
 *
 * This importer:
 * 1. Uses the existing robinhood-parser for CSV parsing
 * 2. Maps Robinhood transaction codes to unified TransCode
 * 3. Handles option details extraction
 * 4. Filters out non-trade transactions (ACH, CDIV, etc.)
 *
 * Usage:
 *   const importer = new RobinhoodImporter();
 *   const result = await importer.parse(csvContent);
 *   // result.transactions are ready for writeLedgerEvents()
 */

import { createChildLogger } from '@/lib/logger';
import {
  parseCsvContent,
  parseTransaction,
  type ParsedTransaction,
} from '@/lib/utils/robinhood-parser';
import type {
  BrokerImporter,
  NormalizedTransaction,
  ParseOptions,
  ParseResult,
  ValidationResult,
  TransCode,
  EventType,
  ImportError,
  ImportWarning,
} from '../types';
import { normalizeSymbol, normalizeActivityDate, validateTransaction } from '../types';

const log = createChildLogger({ module: 'robinhood-importer' });

/**
 * Transaction codes we intentionally skip (non-trade activities).
 */
const SKIP_TRANS_CODES = [
  'ACH', // Bank transfers
  'CDIV', // Cash dividends
  'DTAX', // Dividend taxes
  'ITRF', // Internal transfers
  'MINT', // Margin interest
  'INT', // Interest
  'FUTSWP', // Futures sweeps
  'WIRE', // Wire transfers
  'FEE', // Fees
  'ADJ', // Adjustments
  'SPLIT', // Stock splits (handled separately if needed)
];

/**
 * Map Robinhood trans codes to our unified TransCode.
 * Returns null for codes we should skip.
 */
function mapTransCode(rhCode: string): TransCode | null {
  const code = rhCode.toUpperCase().trim();

  // Direct mappings
  const directMap: Record<string, TransCode> = {
    BUY: 'BUY',
    SELL: 'SELL',
    BTO: 'BTO',
    STO: 'STO',
    BTC: 'BTC',
    STC: 'STC',
    OEXP: 'OEXP',
    OASGN: 'OASGN',
    // Cash movements (skipped by default but can be included)
    ACH: 'ACH',
    WIRE: 'WIRE',
    INT: 'INT',
    // Dividends
    CDIV: 'CDIV',
    DTAX: 'DTAX',
    // Other
    ITRF: 'ITRF',
    MINT: 'MINT',
    FEE: 'FEE',
    ADJ: 'ADJ',
    SPLIT: 'SPLIT',
  };

  return directMap[code] || null;
}

/**
 * Determine event type from transaction details.
 */
function getEventType(txn: ParsedTransaction, transCode: TransCode): EventType {
  // Options
  if (txn.isOption) {
    return 'EQUITY_OPTION';
  }

  // Stock trades
  if (['BUY', 'SELL'].includes(transCode)) {
    return 'EQUITY_STOCK';
  }

  // Cash movements
  if (['ACH', 'WIRE', 'ITRF'].includes(transCode)) {
    return 'CASH_MOVEMENT';
  }

  // Fees and interest
  if (['INT', 'MINT', 'FEE'].includes(transCode)) {
    return 'FEES_INTEREST';
  }

  // Dividends and taxes
  if (['CDIV', 'DTAX'].includes(transCode)) {
    return 'DIVIDENDS_TAX';
  }

  return 'OTHER';
}

/**
 * Check if a transaction should be skipped by default.
 */
function shouldSkipByDefault(transCode: string): boolean {
  return SKIP_TRANS_CODES.includes(transCode.toUpperCase());
}

/**
 * Robinhood CSV Importer
 *
 * Implements the BrokerImporter interface for Robinhood CSV exports.
 */
export class RobinhoodImporter implements BrokerImporter {
  readonly broker = 'robinhood' as const;
  readonly supportedExtensions = ['.csv'];

  /**
   * Parse Robinhood CSV content into normalized transactions.
   */
  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const transactions: NormalizedTransaction[] = [];

    let totalRows = 0;
    let parsedRows = 0;
    let skippedRows = 0;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    try {
      // Parse CSV into rows
      const csvRows = parseCsvContent(content);
      totalRows = csvRows.length;

      log.info({ totalRows }, 'Parsing Robinhood CSV');

      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];

        try {
          // Parse the row
          const parsed = parseTransaction(row);

          // Check if we should skip this transaction type
          if (shouldSkipByDefault(parsed.transCode)) {
            if (!options?.skipTransCodes?.includes(mapTransCode(parsed.transCode) || 'OTHER')) {
              // Log at debug level since this is expected behavior
              log.debug(
                { transCode: parsed.transCode, index: i },
                'Skipping non-trade transaction'
              );
            }
            skippedRows++;
            continue;
          }

          // Map to our unified trans code
          const transCode = mapTransCode(parsed.transCode);
          if (!transCode) {
            warnings.push({
              index: i,
              symbol: parsed.symbol,
              message: `Unknown transaction code: ${parsed.transCode}`,
              code: 'other',
            });
            skippedRows++;
            continue;
          }

          // Check if this trans code is in the skip list
          if (options?.skipTransCodes?.includes(transCode)) {
            skippedRows++;
            continue;
          }

          // Validate activity date
          if (!parsed.activityDate) {
            errors.push({
              index: i,
              symbol: parsed.symbol,
              message: 'Missing activity date',
              code: 'invalid_date',
            });
            continue;
          }

          // Apply date range filter if provided
          if (options?.dateRange) {
            if (options.dateRange.start && parsed.activityDate < options.dateRange.start) {
              skippedRows++;
              continue;
            }
            if (options.dateRange.end && parsed.activityDate > options.dateRange.end) {
              skippedRows++;
              continue;
            }
          }

          // Track date range
          if (!minDate || parsed.activityDate < minDate) {
            minDate = parsed.activityDate;
          }
          if (!maxDate || parsed.activityDate > maxDate) {
            maxDate = parsed.activityDate;
          }

          // Validate quantity
          if (parsed.quantity <= 0) {
            // For OEXP, quantity might be 0 - that's okay
            if (transCode !== 'OEXP' || parsed.quantity < 0) {
              errors.push({
                index: i,
                symbol: parsed.symbol,
                message: 'Invalid quantity',
                code: 'invalid_quantity',
              });
              continue;
            }
          }

          // Validate option details
          if (parsed.isOption) {
            if (!parsed.optionType) {
              warnings.push({
                index: i,
                symbol: parsed.symbol,
                message: 'Could not determine option type (call/put), defaulting to call',
                code: 'option_parse_partial',
              });
            }
            if (!parsed.strike || parsed.strike <= 0) {
              warnings.push({
                index: i,
                symbol: parsed.symbol,
                message: 'Could not determine strike price',
                code: 'option_parse_partial',
              });
            }
            if (!parsed.expiration) {
              warnings.push({
                index: i,
                symbol: parsed.symbol,
                message: 'Could not determine expiration date',
                code: 'option_parse_partial',
              });
            }
          }

          // Determine event type
          const eventType = getEventType(parsed, transCode);

          // Build normalized transaction
          const normalized: NormalizedTransaction = {
            // Core fields
            activityDate: normalizeActivityDate(parsed.activityDate),
            symbol: normalizeSymbol(parsed.symbol),
            transCode,
            quantity: Math.abs(parsed.quantity), // Always positive

            // Pricing
            price: parsed.price !== null ? Math.abs(parsed.price) : undefined,
            amount: parsed.amount !== null ? parsed.amount : undefined, // Preserve sign for cash flow
            fees: undefined, // Robinhood CSV doesn't include fees

            // Classification
            eventType,
            isOption: parsed.isOption,

            // Option details
            optionType: parsed.optionType || undefined,
            strike: parsed.strike !== null ? parsed.strike : undefined,
            expiration: parsed.expiration
              ? normalizeActivityDate(parsed.expiration)
              : undefined,

            // Source data
            rawInstrument: parsed.instrument,
            rawDescription: parsed.description || undefined,
            sourceTransactionId: undefined, // Robinhood CSV doesn't have transaction IDs
            processDate: parsed.processDate
              ? normalizeActivityDate(parsed.processDate)
              : undefined,
            settleDate: parsed.settleDate
              ? normalizeActivityDate(parsed.settleDate)
              : undefined,
          };

          transactions.push(normalized);
          parsedRows++;

          // Check max rows limit
          if (options?.maxRows && parsedRows >= options.maxRows) {
            log.info({ maxRows: options.maxRows }, 'Reached max rows limit');
            break;
          }
        } catch (rowError) {
          errors.push({
            index: i,
            message: `Parse error: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`,
            code: 'other',
          });
        }
      }

      log.info(
        {
          totalRows,
          parsedRows,
          skippedRows,
          errors: errors.length,
          warnings: warnings.length,
        },
        'Robinhood CSV parsing completed'
      );

      return {
        transactions,
        totalRows,
        parsedRows,
        skippedRows,
        errors,
        warnings,
        dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : undefined,
      };
    } catch (error) {
      log.error({ error }, 'Failed to parse Robinhood CSV');
      throw error;
    }
  }

  /**
   * Validate a batch of normalized transactions.
   */
  validate(transactions: NormalizedTransaction[]): ValidationResult {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];
      const txnErrors = validateTransaction(txn);

      for (const err of txnErrors) {
        errors.push({ ...err, index: i });
      }

      // Additional Robinhood-specific validations

      // Check for price on buy/sell transactions
      if (
        ['BUY', 'SELL', 'BTO', 'STO', 'BTC', 'STC'].includes(txn.transCode) &&
        txn.price === undefined
      ) {
        warnings.push({
          index: i,
          symbol: txn.symbol,
          message: 'Price is missing for trade transaction',
          code: 'price_missing',
        });
      }

      // Verify option details consistency
      if (txn.isOption) {
        if (!txn.strike || !txn.expiration) {
          // This is already an error from validateTransaction, but let's ensure
          if (!errors.some((e) => e.index === i && e.code === 'missing_option_details')) {
            errors.push({
              index: i,
              symbol: txn.symbol,
              message: 'Option is missing strike or expiration',
              code: 'missing_option_details',
            });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if this importer can handle the given file.
   */
  canHandle(content: string, fileName: string): boolean {
    // Check file extension
    if (!fileName.toLowerCase().endsWith('.csv')) {
      return false;
    }

    // Check for Robinhood-specific headers
    const firstLine = content.split('\n')[0]?.toLowerCase() || '';
    const robinhoodHeaders = ['activity date', 'trans code', 'instrument'];

    return robinhoodHeaders.every((h) => firstLine.includes(h));
  }
}

// Export a singleton instance for convenience
export const robinhoodImporter = new RobinhoodImporter();
