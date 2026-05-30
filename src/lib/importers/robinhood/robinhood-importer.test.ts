/**
 * RobinhoodImporter Tests
 *
 * Tests for the RobinhoodImporter class used by both preview and import endpoints.
 * Verifies parse(), validate(), and canHandle() methods work correctly.
 */

import { describe, it, expect } from 'vitest';
import { RobinhoodImporter } from './index';

// Sample CSV content with various transaction types
const SAMPLE_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/16/2026","1/16/2026","1/20/2026","TSLA","Option Expiration for TSLA 1/16/2026 Put $435.00","OEXP","1","",""
"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Put $440.00","OASGN","1","",""
"1/16/2026","1/16/2026","1/20/2026","TSLA","Tesla
CUSIP: 88160R101
1 TSLA Option Assigned","Buy","100","$440.00","($44,000.00)"
"1/16/2026","1/16/2026","1/20/2026","ZETA","Zeta Global
CUSIP: 98956A105","Buy","54","$20.50","($1,107.00)"
"1/16/2026","1/16/2026","1/20/2026","RKT","RKT 1/15/2027 Call $24.20","STC","2","$5.10","$1,019.91"
"1/15/2026","1/15/2026","1/16/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$1.00","$99.95"
"1/15/2026","1/15/2026","1/16/2026","IBIT","IBIT 3/20/2026 Call $60.00","BTO","2","$1.71","($342.08)"
"1/15/2026","1/15/2026","1/16/2026","MSTR","Strategy Inc.
CUSIP: 594972408","Buy","100","$174.68","($17,468.50)"
"1/15/2026","1/15/2026","1/16/2026","MSTR","Strategy Inc.
CUSIP: 594972408","Sell","41","$171.95","$7,049.95"
"1/14/2026","1/14/2026","1/15/2026","","ACH Withdrawal","ACH","","","($4,000.00)"
"1/14/2026","1/14/2026","1/15/2026","","Futures Inter-Entity Cash Transfer","FUTSWP","","","$226.00"
`;

// Minimal CSV with just one trade
const MINIMAL_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/16/2026","1/16/2026","1/20/2026","AAPL","Apple Inc.","Buy","10","$175.00","($1,750.00)"`;

// Empty CSV (just header)
const HEADER_ONLY_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"`;

// Invalid CSV format
const INVALID_CSV = `This is not a valid CSV file`;

describe('RobinhoodImporter', () => {
  const importer = new RobinhoodImporter();

  describe('canHandle', () => {
    it('should return true for valid Robinhood CSV content', () => {
      expect(importer.canHandle(SAMPLE_CSV, 'trades.csv')).toBe(true);
    });

    it('should return true for minimal CSV with correct headers', () => {
      expect(importer.canHandle(MINIMAL_CSV, 'robinhood.csv')).toBe(true);
    });

    it('should return true for header-only CSV', () => {
      expect(importer.canHandle(HEADER_ONLY_CSV, 'trades.csv')).toBe(true);
    });

    it('should return false for invalid CSV content', () => {
      expect(importer.canHandle(INVALID_CSV, 'trades.csv')).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(importer.canHandle('', 'trades.csv')).toBe(false);
    });

    it('should require .csv extension for file detection', () => {
      // The importer requires .csv extension as a first check
      expect(importer.canHandle(SAMPLE_CSV, 'anything.txt')).toBe(false);
      expect(importer.canHandle(SAMPLE_CSV, 'anything.CSV')).toBe(true);
    });
  });

  describe('parse', () => {
    it('should parse valid CSV and return transactions', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      expect(result.transactions).toBeDefined();
      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.totalRows).toBe(11); // 11 data rows
      expect(result.errors).toEqual([]);
    });

    it('should correctly count parsed rows (excluding skipped non-trade rows)', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      // Should have parsed 9 tradeable transactions (11 - 2 skipped)
      expect(result.parsedRows).toBe(9);
      expect(result.skippedRows).toBe(2); // ACH and FUTSWP
    });

    it('should parse stock transactions correctly', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      // Find the MSTR Buy transaction - note transCode is uppercase BUY after normalization
      const mstrBuy = result.transactions.find(
        (t) => t.symbol === 'MSTR' && t.transCode === 'BUY'
      );

      expect(mstrBuy).toBeDefined();
      if (mstrBuy) {
        expect(mstrBuy.isOption).toBe(false);
        expect(mstrBuy.quantity).toBe(100);
        expect(mstrBuy.price).toBeCloseTo(174.68, 2);
        expect(mstrBuy.amount).toBeCloseTo(-17468.5, 2);
      }
    });

    it('should parse option transactions correctly', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      // Find the STO transaction
      const stoTxn = result.transactions.find((t) => t.transCode === 'STO');

      expect(stoTxn).toBeDefined();
      if (stoTxn) {
        expect(stoTxn.isOption).toBe(true);
        expect(stoTxn.symbol).toBe('TSLA');
        expect(stoTxn.optionType).toBe('call');
        expect(stoTxn.strike).toBe(455);
      }
    });

    it('should parse OEXP transactions correctly', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      const oexpTxn = result.transactions.find((t) => t.transCode === 'OEXP');

      expect(oexpTxn).toBeDefined();
      if (oexpTxn) {
        expect(oexpTxn.isOption).toBe(true);
        expect(oexpTxn.optionType).toBe('put');
        expect(oexpTxn.strike).toBe(435);
        // NormalizedTransaction uses undefined, not null
        expect(oexpTxn.price).toBeUndefined();
        expect(oexpTxn.amount).toBeUndefined();
      }
    });

    it('should parse OASGN transactions correctly', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      const oasgnTxn = result.transactions.find((t) => t.transCode === 'OASGN');

      expect(oasgnTxn).toBeDefined();
      if (oasgnTxn) {
        expect(oasgnTxn.isOption).toBe(true);
        expect(oasgnTxn.optionType).toBe('put');
        expect(oasgnTxn.strike).toBe(440);
      }
    });

    it('should handle multi-line descriptions with CUSIP', async () => {
      const result = await importer.parse(SAMPLE_CSV);

      // Find the ZETA transaction
      const zetaTxn = result.transactions.find((t) => t.symbol === 'ZETA');

      expect(zetaTxn).toBeDefined();
      if (zetaTxn) {
        expect(zetaTxn.rawDescription).toContain('CUSIP');
        expect(zetaTxn.quantity).toBe(54);
      }
    });

    it('should throw error for empty CSV (header only)', async () => {
      // The CSV parser throws an error for header-only CSVs
      await expect(importer.parse(HEADER_ONLY_CSV)).rejects.toThrow(
        'CSV file is empty or invalid'
      );
    });

    it('should parse minimal CSV correctly', async () => {
      const result = await importer.parse(MINIMAL_CSV);

      expect(result.transactions.length).toBe(1);
      expect(result.transactions[0].symbol).toBe('AAPL');
      expect(result.transactions[0].quantity).toBe(10);
    });
  });

  describe('validate', () => {
    it('should validate all transactions from sample CSV', async () => {
      const parseResult = await importer.parse(SAMPLE_CSV);
      const validationResult = importer.validate(parseResult.transactions);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toEqual([]);
    });

    it('should return isValid=true when no errors', async () => {
      const parseResult = await importer.parse(MINIMAL_CSV);
      const validationResult = importer.validate(parseResult.transactions);

      expect(validationResult.isValid).toBe(true);
    });

    it('should handle empty transaction array', () => {
      const validationResult = importer.validate([]);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toEqual([]);
      expect(validationResult.warnings).toEqual([]);
    });
  });

  describe('Preview workflow (parse + validate)', () => {
    it('should support full preview workflow', async () => {
      // This simulates what the /api/import/preview endpoint does
      const parseResult = await importer.parse(SAMPLE_CSV);
      const validationResult = importer.validate(parseResult.transactions);

      // Calculate stats like the preview endpoint
      const errorIndices = new Set(validationResult.errors.map((e) => e.index));
      const validTransactions = parseResult.transactions.filter(
        (_, index) => !errorIndices.has(index)
      );

      expect(validTransactions.length).toBe(parseResult.transactions.length);
      expect(parseResult.totalRows).toBe(11);
      expect(parseResult.skippedRows).toBe(2);
      expect(validTransactions.length).toBe(9); // All valid
    });

    it('should correctly categorize transactions by type', async () => {
      const parseResult = await importer.parse(SAMPLE_CSV);

      const stockTxns = parseResult.transactions.filter((t) => !t.isOption);
      const optionTxns = parseResult.transactions.filter((t) => t.isOption);

      expect(stockTxns.length).toBe(4); // TSLA Buy, ZETA Buy, MSTR Buy, MSTR Sell
      expect(optionTxns.length).toBe(5); // OEXP, OASGN, STC, STO, BTO
    });

    it('should correctly categorize by opening/closing status', async () => {
      const parseResult = await importer.parse(SAMPLE_CSV);

      const openingCodes = ['BUY', 'Buy', 'BTO', 'STO'];
      const closingCodes = ['SELL', 'Sell', 'BTC', 'STC', 'OEXP', 'OASGN'];

      const openTxns = parseResult.transactions.filter((t) =>
        openingCodes.includes(t.transCode)
      );
      const closeTxns = parseResult.transactions.filter((t) =>
        closingCodes.includes(t.transCode)
      );

      expect(openTxns.length).toBe(5); // TSLA Buy, ZETA Buy, MSTR Buy, STO, BTO
      expect(closeTxns.length).toBe(4); // MSTR Sell, STC, OEXP, OASGN
    });
  });

  describe('Large file handling', () => {
    it('should handle files with many rows efficiently', async () => {
      // Generate a larger CSV with 100 rows
      const header = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"`;
      const rows = [];
      for (let i = 0; i < 100; i++) {
        rows.push(
          `"1/16/2026","1/16/2026","1/20/2026","TEST${i}","Test Stock ${i}","Buy","${i + 1}","$100.00","($${(i + 1) * 100}.00)"`
        );
      }
      const largeCsv = header + '\n' + rows.join('\n');

      const start = Date.now();
      const result = await importer.parse(largeCsv);
      const duration = Date.now() - start;

      expect(result.transactions.length).toBe(100);
      expect(duration).toBeLessThan(500); // Should be fast
    });
  });
});
