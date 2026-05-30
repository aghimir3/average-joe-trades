/**
 * Robinhood CSV Parser
 *
 * Parses Robinhood CSV export format and extracts trade information.
 * Handles stocks and options with proper symbol parsing.
 */

import { createChildLogger } from '@/lib/logger';

const logger = createChildLogger({ module: 'robinhood-parser' });

/**
 * Robinhood CSV row structure
 */
export interface RobinhoodCsvRow {
  activityDate: string;
  processDate: string;
  settleDate: string;
  accountType: string;
  instrument: string;
  description: string;
  transCode: string;
  quantity: string;
  price: string;
  amount: string;
  suppressed: string;
}

/**
 * Parsed transaction with extracted fields
 */
export interface ParsedTransaction {
  activityDate: Date | null;
  processDate: Date | null;
  settleDate: Date | null;
  accountType: string | null;
  instrument: string;
  description: string;
  transCode: string;
  quantity: number;
  price: number | null;
  amount: number | null;
  suppressed: string | null;

  // Parsed fields
  symbol: string;
  isOption: boolean;
  optionType: 'call' | 'put' | null;
  strike: number | null;
  expiration: Date | null;
}

/**
 * Parse CSV content into rows.
 * Handles multi-line quoted fields properly (e.g., descriptions with CUSIP info).
 */
export function parseCsvContent(content: string): RobinhoodCsvRow[] {
  // Parse CSV lines respecting quoted fields that may contain newlines
  const lines = parseCsvLines(content);

  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  const header = lines[0];
  const requiredHeaders = [
    'Activity Date',
    'Process Date',
    'Settle Date',
    'Instrument',
    'Description',
    'Trans Code',
    'Quantity',
    'Price',
    'Amount',
  ];

  // Parse header
  const headerCols = parseCSVLine(header);

  // Validate header (flexible - allow different column orders)
  const normalizeHeader = (h: string) => h.toLowerCase().replace(/\s+/g, '');

  const hasRequiredColumns = requiredHeaders.every(reqHeader => {
    const normalized = normalizeHeader(reqHeader);
    return headerCols.some(col => normalizeHeader(col) === normalized);
  });

  if (!hasRequiredColumns) {
    logger.warn({ headerCols, requiredHeaders }, 'CSV header missing required columns');
    throw new Error('CSV file does not contain required Robinhood columns. Found: ' + headerCols.join(', '));
  }

  // Create column index map
  const colMap: Record<string, number> = {};
  headerCols.forEach((col, idx) => {
    const normalized = col.toLowerCase().replace(/\s+/g, '');
    colMap[normalized] = idx;
  });

  // Parse data rows
  const rows: RobinhoodCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue; // Skip invalid rows

    rows.push({
      activityDate: cols[colMap['activitydate']] || '',
      processDate: cols[colMap['processdate']] || '',
      settleDate: cols[colMap['settledate']] || '',
      accountType: (colMap['accounttype'] !== undefined) ? (cols[colMap['accounttype']] || '') : '',
      instrument: cols[colMap['instrument']] || '',
      description: cols[colMap['description']] || '',
      transCode: cols[colMap['transcode']] || '',
      quantity: cols[colMap['quantity']] || '0',
      price: cols[colMap['price']] || '',
      amount: cols[colMap['amount']] || '',
      suppressed: (colMap['suppressed'] !== undefined) ? (cols[colMap['suppressed']] || '') : '',
    });
  }

  return rows;
}

/**
 * Parse CSV content into logical lines, respecting quoted fields with newlines.
 */
function parseCsvLines(content: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '""';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (only when not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      // Windows line ending (only when not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      i++; // Skip the \n
    } else if (char === '\r' && !inQuotes) {
      // Mac line ending (only when not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  // Add last line
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Parse transaction and extract symbol/option details.
 */
export function parseTransaction(row: RobinhoodCsvRow): ParsedTransaction {
  const instrument = row.instrument.trim();
  const description = row.description.trim();

  // Parse dates
  const activityDate = parseDate(row.activityDate);
  const processDate = parseDate(row.processDate);
  const settleDate = parseDate(row.settleDate);

  // Parse numeric fields
  const quantity = parseFloat(row.quantity) || 0;
  const price = row.price ? parseNumericValue(row.price) : null;
  const amount = row.amount ? parseNumericValue(row.amount) : null;

  // Determine if option
  const isOption = isOptionInstrument(instrument, description);

  let symbol = instrument;
  let optionType: 'call' | 'put' | null = null;
  let strike: number | null = null;
  let expiration: Date | null = null;

  if (isOption) {
    const optionInfo = parseOptionInstrument(instrument, description);
    symbol = optionInfo.symbol;
    optionType = optionInfo.optionType;
    strike = optionInfo.strike;
    expiration = optionInfo.expiration;
  }

  return {
    activityDate,
    processDate,
    settleDate,
    accountType: row.accountType || null,
    instrument,
    description,
    transCode: row.transCode,
    quantity,
    price,
    amount,
    suppressed: row.suppressed || null,
    symbol,
    isOption,
    optionType,
    strike,
    expiration,
  };
}

/**
 * Parse numeric value from string.
 * Handles: $1,234.56, ($1,234.56), 1234.56, etc.
 */
function parseNumericValue(value: string): number | null {
  if (!value || value.trim() === '') return null;

  // Remove whitespace
  let cleaned = value.trim();

  // Check if negative (parentheses format)
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegative) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove currency symbols and commas
  cleaned = cleaned.replace(/[$,]/g, '');

  // Parse to float
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;

  return isNegative ? -parsed : parsed;
}

/**
 * Parse date string in various formats and normalize to UTC at noon.
 *
 * Why UTC noon: Robinhood CSV dates are in M/D/YYYY format without timezone info.
 * Using local time can cause dates to shift by a day depending on user's timezone.
 * Normalizing to UTC noon (12:00:00) ensures consistent day representation across
 * all timezones (midnight-to-midnight range is safely covered).
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const cleaned = dateStr.trim();

  // Try M/D/YYYY or MM/DD/YYYY format first (Robinhood standard)
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);

    // Handle 2-digit year
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    // Validate components
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      // Create UTC date at noon to avoid day-shift issues
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Fallback: try native Date parsing for ISO formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    // Normalize to UTC noon for the same day
    return new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12, 0, 0
    ));
  }

  return null;
}

/**
 * Check if instrument is an option.
 */
function isOptionInstrument(instrument: string, description: string): boolean {
  // Robinhood option format: AAPL 01/17/26 $150 Call
  // Or instrument might be: AAPL
  // Check description for Call/Put
  return /\b(call|put)\b/i.test(description) || /\b(call|put)\b/i.test(instrument);
}

/**
 * Parse option instrument details.
 *
 * Robinhood formats:
 * - Description: "AAPL 01/17/26 $150 Call"
 * - Or: "AAPL 1/16/2026 Put $435.00"
 * - Option Expiration: "Option Expiration for TSLA 1/16/2026 Put $435.00"
 * - Option Assignment: "TSLA 1/16/2026 Put $440.00" (from OASGN row)
 */
function parseOptionInstrument(instrument: string, description: string): {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
} {
  // Format 1: "Option Expiration for SYMBOL M/D/YYYY Call/Put $STRIKE"
  const expirationMatch = description.match(/Option Expiration for\s+([A-Z]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(Call|Put)\s+\$?([\d.]+)/i);

  if (expirationMatch) {
    const [, symbol, dateStr, type, strikeStr] = expirationMatch;

    return {
      symbol: symbol.toUpperCase(),
      optionType: type.toLowerCase() as 'call' | 'put',
      strike: parseFloat(strikeStr),
      expiration: parseOptionDate(dateStr),
    };
  }

  // Format 2: SYMBOL M/D/YYYY Call $STRIKE (standard option description)
  const descMatch = description.match(/([A-Z]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(Call|Put)\s+\$?([\d.]+)/i);

  if (descMatch) {
    const [, symbol, dateStr, type, strikeStr] = descMatch;

    return {
      symbol: symbol.toUpperCase(),
      optionType: type.toLowerCase() as 'call' | 'put',
      strike: parseFloat(strikeStr),
      expiration: parseOptionDate(dateStr),
    };
  }

  // Format 3: SYMBOL M/D/YYYY $STRIKE Call/Put (alternate order)
  const altDescMatch = description.match(/([A-Z]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\$?([\d.]+)\s+(Call|Put)/i);

  if (altDescMatch) {
    const [, symbol, dateStr, strikeStr, type] = altDescMatch;

    return {
      symbol: symbol.toUpperCase(),
      optionType: type.toLowerCase() as 'call' | 'put',
      strike: parseFloat(strikeStr),
      expiration: parseOptionDate(dateStr),
    };
  }

  // Format 4: Try instrument field if description didn't match
  const instMatch = instrument.match(/([A-Z]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\$?([\d.]+)\s+(Call|Put)/i);

  if (instMatch) {
    const [, symbol, dateStr, strikeStr, type] = instMatch;

    return {
      symbol: symbol.toUpperCase(),
      optionType: type.toLowerCase() as 'call' | 'put',
      strike: parseFloat(strikeStr),
      expiration: parseOptionDate(dateStr),
    };
  }

  // Fallback: If we can't parse, use defaults
  logger.warn({ instrument, description }, 'Could not parse option details');

  return {
    symbol: instrument.split(' ')[0] || 'UNKNOWN',
    optionType: /put/i.test(description) ? 'put' : 'call',
    strike: 0,
    expiration: new Date(),
  };
}

/**
 * Parse option expiration date (M/D/YY, M/D/YYYY, MM/DD/YY or MM/DD/YYYY).
 *
 * Returns UTC date at noon for timezone consistency. See parseDate() for rationale.
 */
function parseOptionDate(dateStr: string): Date {
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    logger.warn({ dateStr }, 'Invalid date format for option expiration');
    // Return UTC noon today as fallback
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
  }

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  // Handle 2-digit year
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  // Validate date components
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    logger.warn({ dateStr, month, day, year }, 'Invalid date components');
    // Return UTC noon today as fallback
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
  }

  // Create UTC date at noon to avoid day-shift issues across timezones
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}
