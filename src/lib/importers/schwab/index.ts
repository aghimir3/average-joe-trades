/**
 * Schwab JSON Importer
 *
 * Imports trade history from Charles Schwab JSON exports.
 *
 * This importer:
 * 1. Parses Schwab JSON transaction history
 * 2. Maps Schwab actions to unified TransCode
 * 3. Handles option symbol parsing (TICKER MM/DD/YYYY STRIKE C/P)
 * 4. Filters out non-trade transactions (Journal, MoneyLink Transfer, etc.)
 *
 * Usage:
 *   const importer = new SchwabImporter();
 *   const result = await importer.parse(jsonContent);
 *   // result.transactions are ready for writeLedgerEvents()
 */

import { createChildLogger } from '@/lib/logger';
import type {
  BrokerImporter,
  NormalizedTransaction,
  ParseOptions,
  ParseResult,
  ValidationResult,
  EventType,
  ImportError,
  ImportWarning,
} from '../types';
import { normalizeSymbol, normalizeActivityDate, validateTransaction } from '../types';
import {
  mapSchwabAction,
  shouldSkipSchwabAction,
  parseSchwabPrice,
  parseSchwabDate,
  parseSchwabOptionSymbol,
  parseSchwabQuantity,
  validateSchwabJson,
  extractSchwabTicker,
  type SchwabJsonExport,
  type SchwabRawTransaction,
} from './schwab-parser';

const log = createChildLogger({ module: 'schwab-importer' });

/**
 * Determine event type from transaction details.
 */
function getEventType(isOption: boolean, transCode: string): EventType {
  if (isOption) {
    return 'EQUITY_OPTION';
  }

  if (['BUY', 'SELL'].includes(transCode)) {
    return 'EQUITY_STOCK';
  }

  return 'OTHER';
}

/**
 * Schwab JSON Importer
 *
 * Implements the BrokerImporter interface for Schwab JSON exports.
 */
export class SchwabImporter implements BrokerImporter {
  readonly broker = 'schwab' as const;
  readonly supportedExtensions = ['.json'];

  /**
   * Parse Schwab JSON content into normalized transactions.
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
      // Parse JSON
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new Error('Invalid JSON format');
      }

      // Validate structure
      if (!validateSchwabJson(data)) {
        throw new Error('Invalid Schwab JSON format - missing BrokerageTransactions array');
      }

      const schwabData = data as SchwabJsonExport;
      const rawTransactions = schwabData.BrokerageTransactions;
      totalRows = rawTransactions.length;

      log.info({ totalRows }, 'Parsing Schwab JSON');

      for (let i = 0; i < rawTransactions.length; i++) {
        const raw = rawTransactions[i];

        try {
          const normalized = this.parseTransaction(raw, i, options, errors, warnings);

          if (!normalized) {
            skippedRows++;
            continue;
          }

          // Track date range
          if (!minDate || normalized.activityDate < minDate) {
            minDate = normalized.activityDate;
          }
          if (!maxDate || normalized.activityDate > maxDate) {
            maxDate = normalized.activityDate;
          }

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
            symbol: raw.Symbol,
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
        'Schwab JSON parsing completed'
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
      log.error({ error }, 'Failed to parse Schwab JSON');
      throw error;
    }
  }

  /**
   * Parse a single Schwab transaction.
   * Returns null if the transaction should be skipped.
   */
  private parseTransaction(
    raw: SchwabRawTransaction,
    index: number,
    options: ParseOptions | undefined,
    errors: ImportError[],
    warnings: ImportWarning[]
  ): NormalizedTransaction | null {
    // Check if we should skip this action type
    if (shouldSkipSchwabAction(raw.Action)) {
      log.debug(
        { action: raw.Action, index },
        'Skipping non-trade transaction'
      );
      return null;
    }

    // Map to our unified trans code
    const transCode = mapSchwabAction(raw.Action);
    if (!transCode) {
      warnings.push({
        index,
        symbol: raw.Symbol,
        message: `Unknown action: ${raw.Action}`,
        code: 'other',
      });
      return null;
    }

    // Check if this trans code is in the skip list
    if (options?.skipTransCodes?.includes(transCode)) {
      return null;
    }

    // Parse activity date
    const activityDate = parseSchwabDate(raw.Date);
    if (!activityDate) {
      errors.push({
        index,
        symbol: raw.Symbol,
        message: `Invalid date: ${raw.Date}`,
        code: 'invalid_date',
      });
      return null;
    }

    // Apply date range filter if provided
    if (options?.dateRange) {
      if (options.dateRange.start && activityDate < options.dateRange.start) {
        return null;
      }
      if (options.dateRange.end && activityDate > options.dateRange.end) {
        return null;
      }
    }

    // Parse quantity
    const quantity = parseSchwabQuantity(raw.Quantity);

    // For OEXP, quantity might be 0 from the raw data but we need to handle it
    if (quantity <= 0 && transCode !== 'OEXP') {
      // Some Schwab transactions may have empty quantity (like journal entries)
      // These should have been skipped above, but double-check
      if (raw.Quantity.trim() === '') {
        return null;
      }
      errors.push({
        index,
        symbol: raw.Symbol,
        message: 'Invalid quantity',
        code: 'invalid_quantity',
      });
      return null;
    }

    // Parse option details from symbol
    const optionDetails = parseSchwabOptionSymbol(raw.Symbol);
    const isOption = optionDetails !== null;

    // Extract ticker
    const ticker = extractSchwabTicker(raw.Symbol);
    if (!ticker) {
      errors.push({
        index,
        symbol: raw.Symbol,
        message: 'Missing symbol',
        code: 'invalid_symbol',
      });
      return null;
    }

    // Parse price and amount
    const price = parseSchwabPrice(raw.Price);
    const amount = parseSchwabPrice(raw.Amount);
    const fees = parseSchwabPrice(raw['Fees & Comm']);

    // Warn if price is missing for trade transactions
    if (
      ['BUY', 'SELL', 'BTO', 'STO', 'BTC', 'STC'].includes(transCode) &&
      price === null
    ) {
      warnings.push({
        index,
        symbol: ticker,
        message: 'Price is missing for trade transaction',
        code: 'price_missing',
      });
    }

    // Validate option details
    if (isOption && optionDetails) {
      if (!optionDetails.strike || optionDetails.strike <= 0) {
        warnings.push({
          index,
          symbol: ticker,
          message: 'Could not determine strike price',
          code: 'option_parse_partial',
        });
      }
      if (!optionDetails.expiration) {
        warnings.push({
          index,
          symbol: ticker,
          message: 'Could not determine expiration date',
          code: 'option_parse_partial',
        });
      }
    }

    // Determine event type
    const eventType = getEventType(isOption, transCode);

    // Build normalized transaction
    const normalized: NormalizedTransaction = {
      // Core fields
      activityDate: normalizeActivityDate(activityDate),
      symbol: normalizeSymbol(ticker),
      transCode,
      quantity: quantity > 0 ? quantity : 1, // Default to 1 for OEXP if quantity is 0

      // Pricing
      price: price !== null ? Math.abs(price) : undefined,
      amount: amount !== null ? amount : undefined, // Preserve sign for cash flow
      fees: fees !== null ? Math.abs(fees) : undefined,

      // Classification
      eventType,
      isOption,

      // Option details
      optionType: optionDetails?.optionType,
      strike: optionDetails?.strike,
      expiration: optionDetails?.expiration
        ? normalizeActivityDate(optionDetails.expiration)
        : undefined,

      // Source data
      rawInstrument: raw.Symbol,
      rawDescription: raw.Description,
      sourceTransactionId: raw.ItemIssueId !== '0' ? raw.ItemIssueId : undefined,
    };

    return normalized;
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

      // Additional Schwab-specific validations

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
          // Check if this error already exists
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
    if (!fileName.toLowerCase().endsWith('.json')) {
      return false;
    }

    // Try to parse and validate structure
    try {
      const data = JSON.parse(content);
      return validateSchwabJson(data);
    } catch {
      return false;
    }
  }
}

// Export a singleton instance for convenience
export const schwabImporter = new SchwabImporter();
