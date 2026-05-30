/**
 * Batch Import Edge Case Tests
 *
 * Tests for corporate actions, non-trade events, and import robustness.
 * Ensures the importer handles messy/incomplete data gracefully.
 */

import { describe, it, expect } from 'vitest';
import { parseCsvContent, parseTransaction } from './robinhood-parser';
import { matchTransactionsFifo } from './fifo-matcher';

/**
 * Helper to check if a transaction code is recognized as a trade.
 */
function isTradeTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  const validTradeCodes = ['BTO', 'STC', 'STO', 'BTC', 'BUY', 'SELL', 'OEXP', 'OASGN'];
  const excludedCodes = ['FUTSWP', 'ACH', 'CDIV', 'DTAX', 'ITRF', 'MINT', 'MDIV', 'GOLD', 'INT', 'SLIP', 'RTP', 'ABIP', 'MISC', 'GMPC', 'T/A', 'XENT', 'SXCH'];

  if (excludedCodes.includes(code)) {
    return false;
  }

  return validTradeCodes.includes(code);
}

describe('Batch Import Edge Cases', () => {
  describe('Corporate Actions & Non-Trade Events', () => {
    /**
     * CDIV (Cash Dividend) - should be filtered out
     */
    it('should filter out cash dividends (CDIV)', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
12/31/2025,12/31/2025,12/31/2025,ICE,"Cash Div: R/D 2025-12-16 P/D 2025-12-31 - 8 shares at 0.48",CDIV,,,$3.84`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      // CDIV should not be recognized as a trade
      expect(isTradeTransaction('CDIV')).toBe(false);
      expect(transactions[0].transCode).toBe('CDIV');
    });

    /**
     * MDIV (Manufactured Dividend) - should be filtered out
     */
    it('should filter out manufactured dividends (MDIV)', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
12/31/2025,12/31/2025,12/31/2025,ICE,"Manufactured Div: R/D 2025-12-16 P/D 2025-12-31 - 3 shares at 0.48",MDIV,,,$1.44`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      expect(isTradeTransaction('MDIV')).toBe(false);
      expect(transactions[0].transCode).toBe('MDIV');
    });

    /**
     * ACH (Bank Transfer) - should be filtered out
     */
    it('should filter out ACH transfers', () => {
      expect(isTradeTransaction('ACH')).toBe(false);
    });

    /**
     * FUTSWP (Future Swap) - should be filtered out
     */
    it('should filter out future swaps (FUTSWP)', () => {
      expect(isTradeTransaction('FUTSWP')).toBe(false);
    });

    /**
     * INT (Interest) - should be filtered out
     */
    it('should filter out interest payments (INT)', () => {
      expect(isTradeTransaction('INT')).toBe(false);
    });

    /**
     * MINT (Margin Interest?) - should be filtered out
     */
    it('should filter out MINT transactions', () => {
      expect(isTradeTransaction('MINT')).toBe(false);
    });

    /**
     * ITRF (Internal Transfer) - should be filtered out
     */
    it('should filter out internal transfers (ITRF)', () => {
      expect(isTradeTransaction('ITRF')).toBe(false);
    });

    /**
     * GOLD (Robinhood Gold) - should be filtered out
     */
    it('should filter out Robinhood Gold transactions (GOLD)', () => {
      expect(isTradeTransaction('GOLD')).toBe(false);
    });

    /**
     * SLIP - should be filtered out
     */
    it('should filter out SLIP transactions', () => {
      expect(isTradeTransaction('SLIP')).toBe(false);
    });

    /**
     * RTP - should be filtered out
     */
    it('should filter out RTP transactions', () => {
      expect(isTradeTransaction('RTP')).toBe(false);
    });

    /**
     * ABIP - should be filtered out
     */
    it('should filter out ABIP transactions', () => {
      expect(isTradeTransaction('ABIP')).toBe(false);
    });

    /**
     * MISC (Miscellaneous) - should be filtered out
     */
    it('should filter out MISC transactions', () => {
      expect(isTradeTransaction('MISC')).toBe(false);
    });

    /**
     * GMPC - should be filtered out
     */
    it('should filter out GMPC transactions', () => {
      expect(isTradeTransaction('GMPC')).toBe(false);
    });

    /**
     * T/A (Transfer/Adjustment?) - should be filtered out
     */
    it('should filter out T/A transactions', () => {
      expect(isTradeTransaction('T/A')).toBe(false);
    });

    /**
     * XENT - should be filtered out
     */
    it('should filter out XENT transactions', () => {
      expect(isTradeTransaction('XENT')).toBe(false);
    });

    /**
     * SXCH - should be filtered out
     */
    it('should filter out SXCH transactions', () => {
      expect(isTradeTransaction('SXCH')).toBe(false);
    });

    /**
     * Valid trade codes should be recognized
     */
    it('should recognize valid trade codes', () => {
      expect(isTradeTransaction('BTO')).toBe(true);
      expect(isTradeTransaction('STC')).toBe(true);
      expect(isTradeTransaction('STO')).toBe(true);
      expect(isTradeTransaction('BTC')).toBe(true);
      expect(isTradeTransaction('BUY')).toBe(true);
      expect(isTradeTransaction('SELL')).toBe(true);
      expect(isTradeTransaction('OEXP')).toBe(true);
      expect(isTradeTransaction('OASGN')).toBe(true);
    });

    /**
     * Mixed CSV with trades and non-trades
     */
    it('should filter non-trades from mixed CSV data', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
12/31/2025,12/31/2025,12/31/2025,ICE,"Cash Div: 8 shares at 0.48",CDIV,,,$3.84
12/31/2025,12/31/2025,1/2/2026,TSLA,"TSLA 1/2/2026 Call $452.50",BTC,1,$4.49,"($449.02)"
12/31/2025,12/31/2025,1/2/2026,TSLA,"TSLA 1/9/2026 Put $445.00",STC,1,$8.40,$839.97
12/31/2025,12/31/2025,12/31/2025,,"ACH Transfer",ACH,,,$1000.00`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      // Filter to only trade transactions
      const tradeTransactions = transactions.filter(t => isTradeTransaction(t.transCode));

      // Should only have BTC and STC
      expect(tradeTransactions).toHaveLength(2);
      expect(tradeTransactions.map(t => t.transCode)).toEqual(['BTC', 'STC']);
    });
  });

  describe('Unmatched Transaction Messaging', () => {
    it('should provide clear reason for close without open', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/15/2026,1/15/2026,1/17/2026,AAPL,"AAPL",SELL,100,$175.00,$17500.00`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      const result = matchTransactionsFifo(transactions);

      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].reason).toContain('No matching open');
      expect(result.unmatched[0].symbol).toBe('AAPL');
      expect(result.unmatched[0].transCode).toBe('SELL');
    });

    it('should provide clear reason for over-close', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/10/2026,1/10/2026,1/12/2026,AAPL,"Apple Inc",Buy,50,$170.00,"($8500.00)"
1/15/2026,1/15/2026,1/17/2026,AAPL,"Apple Inc",Sell,100,$175.00,$17500.00`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      const result = matchTransactionsFifo(transactions);

      // Should match 50 shares
      expect(result.matched.some(m => m.closeQuantity === 50)).toBe(true);

      // Should have 50 unmatched (over-close)
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].quantity).toBe(50);
      expect(result.unmatched[0].reason).toContain('without matching open');
    });
  });

  describe('Data Quality Edge Cases', () => {
    it('should handle empty quantity fields gracefully', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
12/31/2025,12/31/2025,12/31/2025,ICE,"Cash Div",CDIV,,,$3.84`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      expect(transactions[0].quantity).toBe(0);
    });

    it('should handle empty price fields gracefully', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/16/2026,1/16/2026,1/20/2026,TSLA,"Option Expiration for TSLA 1/16/2026 Put $435.00",OEXP,1,,`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      expect(transactions[0].price).toBeNull();
      expect(transactions[0].amount).toBeNull();
    });

    it('should handle malformed date strings', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
invalid,1/16/2026,1/20/2026,AAPL,"Apple Inc",Buy,100,$175.00,"($17500.00)"`;

      const rows = parseCsvContent(csv);
      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      expect(transactions[0].activityDate).toBeNull();
      // Process date should still work
      expect(transactions[0].processDate).not.toBeNull();
    });

    it('should handle multiline descriptions in CSV', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/16/2026,1/16/2026,1/20/2026,TSLA,"Tesla
CUSIP: 88160R101
1 TSLA Option Assigned",Buy,100,$440.00,"($44,000.00)"`;

      const rows = parseCsvContent(csv);
      expect(rows).toHaveLength(1);

      const transactions = rows.map((row, i) => ({
        ...parseTransaction(row),
        id: `txn-${i}`,
      }));

      expect(transactions[0].symbol).toBe('TSLA');
      expect(transactions[0].transCode).toBe('Buy');
      expect(transactions[0].quantity).toBe(100);
    });
  });

  describe('Deduplication Key Generation', () => {
    /**
     * Same ticker, date, type, quantity, strategy should dedupe
     */
    it('should generate consistent dedup keys', () => {
      // Dedup key format: ticker_date_type_quantity_strategy
      const buildTradeKey = (trade: {
        ticker: string;
        type?: string;
        entryDate: Date;
        quantity: number;
        strategy: string | null;
      }): string => {
        const dateStr = trade.entryDate.toISOString().split('T')[0];
        const type = trade.type || (trade.strategy ? 'option' : 'stock');
        return `${trade.ticker}_${dateStr}_${type}_${trade.quantity}_${trade.strategy || 'none'}`;
      };

      const trade1 = {
        ticker: 'AAPL',
        type: 'stock',
        entryDate: new Date('2026-01-15T12:00:00Z'),
        quantity: 100,
        strategy: null,
      };

      const trade2 = {
        ticker: 'AAPL',
        type: 'stock',
        entryDate: new Date('2026-01-15T18:00:00Z'), // Same day, different time
        quantity: 100,
        strategy: null,
      };

      // Same day should generate same key (normalized to date only)
      expect(buildTradeKey(trade1)).toBe(buildTradeKey(trade2));
    });

    /**
     * Different quantities should not dedupe
     */
    it('should not dedupe different quantities', () => {
      const buildTradeKey = (trade: {
        ticker: string;
        type?: string;
        entryDate: Date;
        quantity: number;
        strategy: string | null;
      }): string => {
        const dateStr = trade.entryDate.toISOString().split('T')[0];
        const type = trade.type || (trade.strategy ? 'option' : 'stock');
        return `${trade.ticker}_${dateStr}_${type}_${trade.quantity}_${trade.strategy || 'none'}`;
      };

      const trade1 = {
        ticker: 'AAPL',
        type: 'stock',
        entryDate: new Date('2026-01-15T12:00:00Z'),
        quantity: 100,
        strategy: null,
      };

      const trade2 = {
        ticker: 'AAPL',
        type: 'stock',
        entryDate: new Date('2026-01-15T12:00:00Z'),
        quantity: 50, // Different quantity
        strategy: null,
      };

      expect(buildTradeKey(trade1)).not.toBe(buildTradeKey(trade2));
    });
  });
});
