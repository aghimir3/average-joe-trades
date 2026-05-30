/**
 * Schwab Importer Tests
 *
 * Tests for Schwab JSON parsing and import functionality.
 */

import { describe, it, expect } from 'vitest';
import { SchwabImporter } from './index';
import {
  mapSchwabAction,
  shouldSkipSchwabAction,
  parseSchwabPrice,
  parseSchwabDate,
  parseSchwabOptionSymbol,
  parseSchwabQuantity,
  validateSchwabJson,
  extractSchwabTicker,
} from './schwab-parser';
import type { NormalizedTransaction } from '../types';

describe('Schwab Parser Utilities', () => {
  describe('mapSchwabAction', () => {
    it('should map stock buy action', () => {
      expect(mapSchwabAction('Buy')).toBe('BUY');
      expect(mapSchwabAction('buy')).toBe('BUY');
      expect(mapSchwabAction('BUY')).toBe('BUY');
    });

    it('should map stock sell action', () => {
      expect(mapSchwabAction('Sell')).toBe('SELL');
    });

    it('should map option buy to open action', () => {
      expect(mapSchwabAction('Buy to Open')).toBe('BTO');
      expect(mapSchwabAction('buy to open')).toBe('BTO');
    });

    it('should map option sell to close action', () => {
      expect(mapSchwabAction('Sell to Close')).toBe('STC');
    });

    it('should map option sell to open action', () => {
      expect(mapSchwabAction('Sell to Open')).toBe('STO');
    });

    it('should map option buy to close action', () => {
      expect(mapSchwabAction('Buy to Close')).toBe('BTC');
    });

    it('should map expired action', () => {
      expect(mapSchwabAction('Expired')).toBe('OEXP');
    });

    it('should map assigned action', () => {
      expect(mapSchwabAction('Assigned')).toBe('OASGN');
    });

    it('should return null for unknown actions', () => {
      expect(mapSchwabAction('Unknown Action')).toBeNull();
      expect(mapSchwabAction('')).toBeNull();
    });
  });

  describe('shouldSkipSchwabAction', () => {
    it('should skip journal actions', () => {
      expect(shouldSkipSchwabAction('Journal')).toBe(true);
      expect(shouldSkipSchwabAction('Journaled Shares')).toBe(true);
    });

    it('should skip money transfer actions', () => {
      expect(shouldSkipSchwabAction('MoneyLink Transfer')).toBe(true);
      expect(shouldSkipSchwabAction('Wire Transfer')).toBe(true);
      expect(shouldSkipSchwabAction('ACH')).toBe(true);
    });

    it('should skip interest and dividend actions', () => {
      expect(shouldSkipSchwabAction('Credit Interest')).toBe(true);
      expect(shouldSkipSchwabAction('Debit Interest')).toBe(true);
      expect(shouldSkipSchwabAction('Dividend')).toBe(true);
      expect(shouldSkipSchwabAction('Qualified Dividend')).toBe(true);
    });

    it('should not skip trade actions', () => {
      expect(shouldSkipSchwabAction('Buy')).toBe(false);
      expect(shouldSkipSchwabAction('Sell')).toBe(false);
      expect(shouldSkipSchwabAction('Buy to Open')).toBe(false);
      expect(shouldSkipSchwabAction('Sell to Close')).toBe(false);
      expect(shouldSkipSchwabAction('Expired')).toBe(false);
    });
  });

  describe('parseSchwabPrice', () => {
    it('should parse positive prices', () => {
      expect(parseSchwabPrice('$3.25')).toBe(3.25);
      expect(parseSchwabPrice('$1,628.30')).toBe(1628.30);
      expect(parseSchwabPrice('$29.825')).toBe(29.825);
    });

    it('should parse negative prices', () => {
      expect(parseSchwabPrice('-$1,628.30')).toBe(-1628.30);
      expect(parseSchwabPrice('($1,234.56)')).toBe(-1234.56);
    });

    it('should handle empty or whitespace strings', () => {
      expect(parseSchwabPrice('')).toBeNull();
      expect(parseSchwabPrice('   ')).toBeNull();
    });

    it('should handle prices without dollar sign', () => {
      expect(parseSchwabPrice('3.25')).toBe(3.25);
      expect(parseSchwabPrice('1,628.30')).toBe(1628.30);
    });
  });

  describe('parseSchwabDate', () => {
    it('should parse standard date format', () => {
      const date = parseSchwabDate('01/20/2026');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(date?.getUTCMonth()).toBe(0); // January
      expect(date?.getUTCDate()).toBe(20);
      expect(date?.getUTCHours()).toBe(12); // UTC noon
    });

    it('should parse "as of" date format and use the as of date', () => {
      const date = parseSchwabDate('11/17/2025 as of 11/14/2025');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2025);
      expect(date?.getUTCMonth()).toBe(10); // November
      expect(date?.getUTCDate()).toBe(14); // Uses the "as of" date
    });

    it('should handle empty or invalid dates', () => {
      expect(parseSchwabDate('')).toBeNull();
      expect(parseSchwabDate('invalid')).toBeNull();
      expect(parseSchwabDate('2026/01/20')).toBeNull(); // Wrong format
    });

    it('should handle single-digit months and days', () => {
      const date = parseSchwabDate('1/5/2026');
      expect(date).not.toBeNull();
      expect(date?.getUTCMonth()).toBe(0); // January
      expect(date?.getUTCDate()).toBe(5);
    });
  });

  describe('parseSchwabOptionSymbol', () => {
    it('should parse put option symbol', () => {
      const result = parseSchwabOptionSymbol('IBIT 02/20/2026 52.50 P');
      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('IBIT');
      expect(result?.strike).toBe(52.5);
      expect(result?.optionType).toBe('put');
      expect(result?.expiration.getUTCFullYear()).toBe(2026);
      expect(result?.expiration.getUTCMonth()).toBe(1); // February
      expect(result?.expiration.getUTCDate()).toBe(20);
    });

    it('should parse call option symbol', () => {
      const result = parseSchwabOptionSymbol('GOOGL 11/14/2025 285.00 C');
      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('GOOGL');
      expect(result?.strike).toBe(285);
      expect(result?.optionType).toBe('call');
    });

    it('should handle various strike price formats', () => {
      expect(parseSchwabOptionSymbol('MSTR 02/20/2026 160.00 C')?.strike).toBe(160);
      expect(parseSchwabOptionSymbol('RKT 02/20/2026 22.00 C')?.strike).toBe(22);
      expect(parseSchwabOptionSymbol('NVDA 11/14/2025 207.50 C')?.strike).toBe(207.5);
    });

    it('should return null for stock symbols', () => {
      expect(parseSchwabOptionSymbol('AAPL')).toBeNull();
      expect(parseSchwabOptionSymbol('DXYZ')).toBeNull();
    });

    it('should return null for invalid option formats', () => {
      expect(parseSchwabOptionSymbol('')).toBeNull();
      expect(parseSchwabOptionSymbol('INVALID')).toBeNull();
      expect(parseSchwabOptionSymbol('AAPL 02/20/2026')).toBeNull(); // Missing strike and type
    });

    it('should be case-insensitive for option type', () => {
      expect(parseSchwabOptionSymbol('IBIT 02/20/2026 52.50 p')?.optionType).toBe('put');
      expect(parseSchwabOptionSymbol('IBIT 02/20/2026 52.50 c')?.optionType).toBe('call');
    });
  });

  describe('parseSchwabQuantity', () => {
    it('should parse positive quantities', () => {
      expect(parseSchwabQuantity('5')).toBe(5);
      expect(parseSchwabQuantity('10')).toBe(10);
      expect(parseSchwabQuantity('100')).toBe(100);
    });

    it('should return absolute value for negative quantities', () => {
      expect(parseSchwabQuantity('-1')).toBe(1);
      expect(parseSchwabQuantity('-20')).toBe(20);
    });

    it('should return 0 for empty strings', () => {
      expect(parseSchwabQuantity('')).toBe(0);
      expect(parseSchwabQuantity('   ')).toBe(0);
    });

    it('should return 0 for invalid quantities', () => {
      expect(parseSchwabQuantity('abc')).toBe(0);
    });
  });

  describe('extractSchwabTicker', () => {
    it('should extract ticker from option symbol', () => {
      expect(extractSchwabTicker('IBIT 02/20/2026 52.50 P')).toBe('IBIT');
      expect(extractSchwabTicker('GOOGL 11/14/2025 285.00 C')).toBe('GOOGL');
    });

    it('should return stock symbol as-is', () => {
      expect(extractSchwabTicker('AAPL')).toBe('AAPL');
      expect(extractSchwabTicker('DXYZ')).toBe('DXYZ');
    });

    it('should uppercase the result', () => {
      expect(extractSchwabTicker('aapl')).toBe('AAPL');
    });
  });

  describe('validateSchwabJson', () => {
    it('should validate correct Schwab JSON structure', () => {
      const validData = {
        FromDate: '01/20/2022',
        ToDate: '01/20/2026',
        TotalTransactionsAmount: '$1,980.55',
        BrokerageTransactions: [
          {
            Date: '01/20/2026',
            Action: 'Buy to Open',
            Symbol: 'IBIT 02/20/2026 52.50 P',
            Description: 'PUT ISHR BITCOIN TR ETF',
            Quantity: '5',
            Price: '$3.25',
            'Fees & Comm': '$3.30',
            Amount: '-$1,628.30',
            ItemIssueId: '128406523',
            AcctgRuleCd: '2',
          },
        ],
      };
      expect(validateSchwabJson(validData)).toBe(true);
    });

    it('should reject invalid structures', () => {
      expect(validateSchwabJson(null)).toBe(false);
      expect(validateSchwabJson({})).toBe(false);
      expect(validateSchwabJson({ BrokerageTransactions: 'not an array' })).toBe(false);
    });

    it('should accept empty transaction array', () => {
      expect(validateSchwabJson({ BrokerageTransactions: [] })).toBe(true);
    });

    it('should reject transactions missing required fields', () => {
      const missingFields = {
        BrokerageTransactions: [
          {
            Quantity: '5',
            Price: '$3.25',
          },
        ],
      };
      expect(validateSchwabJson(missingFields)).toBe(false);
    });
  });
});

describe('SchwabImporter', () => {
  const importer = new SchwabImporter();

  describe('canHandle', () => {
    it('should return true for valid Schwab JSON', () => {
      const validJson = JSON.stringify({
        BrokerageTransactions: [
          { Date: '01/20/2026', Action: 'Buy', Symbol: 'AAPL' },
        ],
      });
      expect(importer.canHandle(validJson, 'schwab_export.json')).toBe(true);
    });

    it('should return false for non-JSON files', () => {
      expect(importer.canHandle('csv,data,here', 'data.csv')).toBe(false);
    });

    it('should return false for invalid JSON', () => {
      expect(importer.canHandle('{ invalid json }', 'data.json')).toBe(false);
    });

    it('should return false for non-Schwab JSON', () => {
      const otherJson = JSON.stringify({ someOtherFormat: true });
      expect(importer.canHandle(otherJson, 'other.json')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse option buy to open transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/20/2026',
            Action: 'Buy to Open',
            Symbol: 'IBIT 02/20/2026 52.50 P',
            Description: 'PUT ISHR BITCOIN TR ETF $52.5 EXP 02/20/26',
            Quantity: '5',
            Price: '$3.25',
            'Fees & Comm': '$3.30',
            Amount: '-$1,628.30',
            ItemIssueId: '128406523',
            AcctgRuleCd: '2',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(1);
      expect(result.parsedRows).toBe(1);
      expect(result.skippedRows).toBe(0);
      expect(result.errors).toHaveLength(0);

      const txn = result.transactions[0];
      expect(txn.symbol).toBe('IBIT');
      expect(txn.transCode).toBe('BTO');
      expect(txn.quantity).toBe(5);
      expect(txn.price).toBe(3.25);
      expect(txn.fees).toBe(3.30);
      expect(txn.isOption).toBe(true);
      expect(txn.optionType).toBe('put');
      expect(txn.strike).toBe(52.50);
      expect(txn.eventType).toBe('EQUITY_OPTION');
      expect(txn.sourceTransactionId).toBe('128406523');
    });

    it('should parse stock buy transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/13/2026',
            Action: 'Buy',
            Symbol: 'DXYZ',
            Description: 'DESTINY TECH ...100 INC',
            Quantity: '20',
            Price: '$29.825',
            'Fees & Comm': '',
            Amount: '-$596.50',
            ItemIssueId: '83263595',
            AcctgRuleCd: '2',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(1);
      const txn = result.transactions[0];
      expect(txn.symbol).toBe('DXYZ');
      expect(txn.transCode).toBe('BUY');
      expect(txn.quantity).toBe(20);
      expect(txn.price).toBe(29.825);
      expect(txn.isOption).toBe(false);
      expect(txn.eventType).toBe('EQUITY_STOCK');
    });

    it('should parse expired options with "as of" date', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '11/17/2025 as of 11/14/2025',
            Action: 'Expired',
            Symbol: 'GOOGL 11/14/2025 285.00 C',
            Description: 'CALL ALPHABET INC $285 EXP 11/14/25',
            Quantity: '-1',
            Price: '',
            'Fees & Comm': '',
            Amount: '',
            ItemIssueId: '116928190',
            AcctgRuleCd: '2',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(1);
      const txn = result.transactions[0];
      expect(txn.symbol).toBe('GOOGL');
      expect(txn.transCode).toBe('OEXP');
      expect(txn.quantity).toBe(1); // Absolute value
      expect(txn.isOption).toBe(true);
      expect(txn.optionType).toBe('call');
      expect(txn.strike).toBe(285);
      // Activity date should use the "as of" date
      expect(txn.activityDate.getUTCMonth()).toBe(10); // November
      expect(txn.activityDate.getUTCDate()).toBe(14);
    });

    it('should skip journal and money transfer transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/14/2026',
            Action: 'Journaled Shares',
            Symbol: 'DXYZ',
            Description: 'DESTINY TECH ...100 INC',
            Quantity: '-20',
            Price: '$29.73',
            'Fees & Comm': '',
            Amount: '',
            ItemIssueId: '83263595',
            AcctgRuleCd: '2',
          },
          {
            Date: '01/13/2026',
            Action: 'Journal',
            Symbol: '',
            Description: 'JOURNAL TO ...163',
            Quantity: '',
            Price: '',
            'Fees & Comm': '',
            Amount: '-$650.00',
            ItemIssueId: '0',
            AcctgRuleCd: '1',
          },
          {
            Date: '12/01/2025',
            Action: 'MoneyLink Transfer',
            Symbol: '',
            Description: 'TRANSFER FROM BANK',
            Quantity: '',
            Price: '',
            'Fees & Comm': '',
            Amount: '$5,000.00',
            ItemIssueId: '0',
            AcctgRuleCd: '1',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(0);
      expect(result.skippedRows).toBe(3);
    });

    it('should skip credit interest transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '12/01/2025',
            Action: 'Credit Interest',
            Symbol: '',
            Description: 'SCHWAB BANK INTEREST',
            Quantity: '',
            Price: '',
            'Fees & Comm': '',
            Amount: '$0.50',
            ItemIssueId: '0',
            AcctgRuleCd: '1',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(0);
      expect(result.skippedRows).toBe(1);
    });

    it('should parse multiple transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/20/2026',
            Action: 'Buy to Open',
            Symbol: 'IBIT 02/20/2026 52.50 P',
            Description: 'PUT ISHR BITCOIN TR ETF',
            Quantity: '5',
            Price: '$3.25',
            'Fees & Comm': '$3.30',
            Amount: '-$1,628.30',
            ItemIssueId: '1',
            AcctgRuleCd: '2',
          },
          {
            Date: '01/20/2026',
            Action: 'Sell to Close',
            Symbol: 'RKT 02/20/2026 22.00 C',
            Description: 'CALL ROCKET COMPANIES',
            Quantity: '10',
            Price: '$1.62',
            'Fees & Comm': '$6.64',
            Amount: '$1,613.36',
            ItemIssueId: '2',
            AcctgRuleCd: '2',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.parsedRows).toBe(2);

      expect(result.transactions[0].transCode).toBe('BTO');
      expect(result.transactions[1].transCode).toBe('STC');
    });

    it('should handle invalid JSON gracefully', async () => {
      await expect(importer.parse('{ invalid json }')).rejects.toThrow();
    });

    it('should handle missing fields with warnings', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/20/2026',
            Action: 'Buy to Open',
            Symbol: 'IBIT 02/20/2026 52.50 P',
            Description: 'PUT ISHR BITCOIN TR ETF',
            Quantity: '5',
            Price: '', // Empty price
            'Fees & Comm': '',
            Amount: '',
            ItemIssueId: '1',
            AcctgRuleCd: '2',
          },
        ],
      });

      const result = await importer.parse(json);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.code === 'price_missing')).toBe(true);
    });

    it('should respect maxRows option', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          { Date: '01/20/2026', Action: 'Buy', Symbol: 'AAPL', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '1', AcctgRuleCd: '2' },
          { Date: '01/20/2026', Action: 'Buy', Symbol: 'MSFT', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '2', AcctgRuleCd: '2' },
          { Date: '01/20/2026', Action: 'Buy', Symbol: 'GOOGL', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '3', AcctgRuleCd: '2' },
        ],
      });

      const result = await importer.parse(json, { maxRows: 2 });

      expect(result.transactions).toHaveLength(2);
      expect(result.parsedRows).toBe(2);
    });

    it('should respect date range filter', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          { Date: '01/01/2026', Action: 'Buy', Symbol: 'AAPL', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '1', AcctgRuleCd: '2' },
          { Date: '01/15/2026', Action: 'Buy', Symbol: 'MSFT', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '2', AcctgRuleCd: '2' },
          { Date: '01/30/2026', Action: 'Buy', Symbol: 'GOOGL', Quantity: '10', Price: '$100', 'Fees & Comm': '', Amount: '-$1000', ItemIssueId: '3', AcctgRuleCd: '2' },
        ],
      });

      const result = await importer.parse(json, {
        dateRange: {
          start: new Date('2026-01-10'),
          end: new Date('2026-01-20'),
        },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].symbol).toBe('MSFT');
    });
  });

  describe('validate', () => {
    it('should validate correct transactions', async () => {
      const json = JSON.stringify({
        BrokerageTransactions: [
          {
            Date: '01/20/2026',
            Action: 'Buy to Open',
            Symbol: 'IBIT 02/20/2026 52.50 P',
            Description: 'PUT',
            Quantity: '5',
            Price: '$3.25',
            'Fees & Comm': '$3.30',
            Amount: '-$1,628.30',
            ItemIssueId: '1',
            AcctgRuleCd: '2',
          },
        ],
      });

      const parseResult = await importer.parse(json);
      const validationResult = importer.validate(parseResult.transactions);

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });

    it('should flag missing option details', async () => {
      // Create a transaction with missing option details by manually constructing
      const transactions = [
        {
          activityDate: new Date('2026-01-20T12:00:00.000Z'),
          symbol: 'TEST',
          transCode: 'BTO' as const,
          quantity: 5,
          price: 3.25,
          eventType: 'EQUITY_OPTION' as const,
          isOption: true,
          // Missing: optionType, strike, expiration
          rawInstrument: 'TEST option',
        },
      ];

      const validationResult = importer.validate(transactions as NormalizedTransaction[]);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.some(e => e.code === 'missing_option_details')).toBe(true);
    });
  });
});
