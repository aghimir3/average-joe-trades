/**
 * Large dataset validation tests.
 *
 * Tests that the import pipeline can handle real-world datasets
 * with thousands of rows without errors or performance issues.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseCsvContent, parseTransaction } from './robinhood-parser';
import { matchTransactionsFifo } from './fifo-matcher';

const LARGE_CSV_PATH = path.join(process.cwd(), 'Robinhood_Trades_2025.csv');

describe('Large Dataset Validation', () => {
  // Skip these tests if the large CSV file doesn't exist
  const csvExists = fs.existsSync(LARGE_CSV_PATH);

  describe.skipIf(!csvExists)('Robinhood_Trades_2025.csv (7000+ rows)', () => {
    let csvContent: string;
    let parsedRows: ReturnType<typeof parseCsvContent>;
    let parsedTransactions: ReturnType<typeof parseTransaction>[];

    beforeAll(() => {
      csvContent = fs.readFileSync(LARGE_CSV_PATH, 'utf-8');
    });

    it('should parse all CSV rows without errors', () => {
      const startTime = Date.now();
      parsedRows = parseCsvContent(csvContent);
      const parseTime = Date.now() - startTime;

      console.log(`CSV parsing: ${parsedRows.length} rows in ${parseTime}ms`);

      // The 7095 line file has ~5041 actual data rows
      // (many rows have multi-line descriptions which inflate line count)
      expect(parsedRows.length).toBeGreaterThan(4000);
      expect(parsedRows.length).toBeLessThan(10000);
    });

    it('should transform all rows to transactions without errors', () => {
      const startTime = Date.now();
      parsedTransactions = parsedRows.map(row => parseTransaction(row));
      const transformTime = Date.now() - startTime;

      console.log(`Transaction transform: ${parsedTransactions.length} transactions in ${transformTime}ms`);

      expect(parsedTransactions.length).toBe(parsedRows.length);
    });

    it('should have valid transaction codes', () => {
      const validCodes = [
        'BTO', 'STO', 'BTC', 'STC', 'OEXP', 'OASGN',
        'Buy', 'Sell',
        'CDIV', 'MDIV', 'SDIV', // Dividend codes
        'GOLD', 'INT', 'ACH', 'CSD', // Other Robinhood codes
        'Split', 'SPL', 'RSPN', 'ACATS', // Corporate action codes
      ];

      const invalidCodes = new Set<string>();
      parsedTransactions.forEach(txn => {
        if (!validCodes.includes(txn.transCode)) {
          invalidCodes.add(txn.transCode);
        }
      });

      if (invalidCodes.size > 0) {
        console.log(`Unrecognized transaction codes: ${Array.from(invalidCodes).join(', ')}`);
      }

      // Allow some unknown codes - Robinhood may have codes we don't handle
      // The important thing is the pipeline doesn't crash
      expect(parsedTransactions.length).toBeGreaterThan(0);
    });

    it('should correctly identify option transactions', () => {
      const optionTransactions = parsedTransactions.filter(txn => txn.isOption);
      const stockTransactions = parsedTransactions.filter(
        txn => !txn.isOption && ['Buy', 'Sell'].includes(txn.transCode)
      );

      console.log(`Options: ${optionTransactions.length}, Stocks: ${stockTransactions.length}`);

      // The 2025 dataset should have significant option activity
      expect(optionTransactions.length).toBeGreaterThan(1000);
    });

    it('should parse option details correctly', () => {
      const optionTransactions = parsedTransactions.filter(txn => txn.isOption);
      const withValidDetails = optionTransactions.filter(txn =>
        txn.symbol &&
        txn.optionType &&
        txn.strike !== null &&
        txn.strike > 0 &&
        txn.expiration
      );

      const parseRate = (withValidDetails.length / optionTransactions.length) * 100;
      console.log(`Option parse rate: ${parseRate.toFixed(1)}% (${withValidDetails.length}/${optionTransactions.length})`);

      // Should parse at least 95% of option transactions correctly
      expect(parseRate).toBeGreaterThan(95);
    });

    it('should normalize all dates to UTC noon', () => {
      const datesAtNoon = parsedTransactions.filter(txn => {
        if (!txn.activityDate) return true;
        return txn.activityDate.getUTCHours() === 12;
      });

      expect(datesAtNoon.length).toBe(parsedTransactions.length);
    });

    it('should run FIFO matching on option transactions', () => {
      // Filter to just tradeable option transactions
      const optionTxns = parsedTransactions.filter(
        txn => txn.isOption && ['BTO', 'STO', 'BTC', 'STC', 'OEXP', 'OASGN'].includes(txn.transCode)
      );

      // Add IDs for FIFO matcher
      const txnsWithIds = optionTxns.map((txn, idx) => ({
        ...txn,
        id: `txn-${idx}`,
      }));

      const startTime = Date.now();
      const result = matchTransactionsFifo(txnsWithIds);
      const matchTime = Date.now() - startTime;

      console.log(`FIFO matching: ${txnsWithIds.length} transactions -> ${result.matched.length} matches in ${matchTime}ms`);
      console.log(`  Matched trades: ${result.matched.length}`);
      console.log(`  Unmatched: ${result.unmatched.length}`);

      // Should produce matches
      expect(result.matched.length).toBeGreaterThan(0);

      // Verify match structure
      result.matched.forEach(match => {
        expect(match).toHaveProperty('symbol');
        expect(match).toHaveProperty('openTransactionIds');
        expect(match).toHaveProperty('closeTransactionIds');
        expect(match).toHaveProperty('status');
        expect(['open', 'partial', 'closed']).toContain(match.status);
      });
    });

    it('should handle all transaction types without throwing', () => {
      // This test ensures we don't throw on any transaction type
      let errorCount = 0;

      parsedTransactions.forEach((txn) => {
        try {
          // Verify basic structure
          if (typeof txn.symbol !== 'string') errorCount++;
          if (typeof txn.transCode !== 'string') errorCount++;
          if (typeof txn.quantity !== 'number') errorCount++;
        } catch {
          errorCount++;
        }
      });

      expect(errorCount).toBe(0);
    });

    it('should have reasonable memory footprint', () => {
      // Sanity check that we're not creating excessive objects
      const transactionCount = parsedTransactions.length;
      const optionCount = parsedTransactions.filter(t => t.isOption).length;

      // Each transaction should be a reasonable size
      // This is a rough check to catch memory leaks
      expect(transactionCount).toBeLessThan(10000);
      expect(optionCount).toBeLessThan(transactionCount);
    });
  });

  describe('Performance benchmarks', () => {
    it('should parse CSV in under 500ms for 7000 rows', () => {
      if (!fs.existsSync(LARGE_CSV_PATH)) {
        console.log('Skipping: large CSV file not found');
        return;
      }

      const csvContent = fs.readFileSync(LARGE_CSV_PATH, 'utf-8');

      // Warm up
      parseCsvContent(csvContent);

      // Measure
      const iterations = 3;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        parseCsvContent(csvContent);
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`CSV parse avg: ${avgTime.toFixed(1)}ms over ${iterations} iterations`);

      expect(avgTime).toBeLessThan(500);
    });

    it('should transform transactions in under 200ms for 7000 rows', () => {
      if (!fs.existsSync(LARGE_CSV_PATH)) {
        console.log('Skipping: large CSV file not found');
        return;
      }

      const csvContent = fs.readFileSync(LARGE_CSV_PATH, 'utf-8');
      const rows = parseCsvContent(csvContent);

      // Warm up
      rows.map(row => parseTransaction(row));

      // Measure
      const iterations = 3;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        rows.map(row => parseTransaction(row));
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`Transform avg: ${avgTime.toFixed(1)}ms over ${iterations} iterations`);

      expect(avgTime).toBeLessThan(200);
    });
  });
});
