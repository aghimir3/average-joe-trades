/**
 * Premium Accounting Tests for Wheel Strategy
 *
 * Verifies that premiums from STO (Sell to Open) calls/puts are correctly
 * included in realized P&L for Covered Calls and Cash-Secured Puts.
 *
 * Test scenarios:
 * - STO → BTC: Premium collected minus premium paid to close = profit
 * - STO → OEXP: Option expired worthless, full premium = profit
 * - STO → OASGN: Option assigned, full premium = profit (stock transaction separate)
 */

import { describe, it, expect } from 'vitest';
import {
  matchTransactionsFifo,
  TransactionWithId,
} from './fifo-matcher';

function createOptionTxn(
  id: string,
  overrides: Partial<TransactionWithId>
): TransactionWithId {
  return {
    id,
    activityDate: new Date('2025-01-15'),
    processDate: new Date('2025-01-15'),
    settleDate: new Date('2025-01-18'),
    accountType: null,
    instrument: overrides.instrument || 'AAPL',
    description: overrides.description || 'AAPL Call $150 1/31/25',
    transCode: overrides.transCode || 'STO',
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 3.5,
    amount: overrides.amount ?? 350, // $3.50 × 1 × 100
    suppressed: null,
    symbol: overrides.symbol || 'AAPL',
    isOption: true,
    optionType: overrides.optionType || 'call',
    strike: overrides.strike ?? 150,
    expiration: overrides.expiration || new Date('2025-01-31'),
    ...overrides,
  };
}

describe('Wheel Premium Accounting', () => {
  describe('Covered Call (STO Call)', () => {
    it('STO → BTC: profit = premium collected - premium paid to close', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open: Collect $3.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          price: 3.5,
          amount: 350, // Credit received
          activityDate: new Date('2025-01-10'),
        }),
        // Buy to Close: Pay $1.00 to close
        createOptionTxn('txn-2', {
          transCode: 'BTC',
          price: 1.0,
          amount: -100, // Debit paid
          activityDate: new Date('2025-01-20'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      // Verify open action
      expect(match.openAction).toBe('sell');

      // Verify close type
      expect(match.closeType).toBe('btc');

      // P&L = 350 (collected) - 100 (paid to close) = 250 profit
      expect(match.realizedPnL).toBe(250);
      expect(match.status).toBe('closed');
    });

    it('STO → OEXP: option expired worthless, full premium = profit', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open: Collect $3.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          price: 3.5,
          amount: 350,
          activityDate: new Date('2025-01-10'),
        }),
        // Option Expiration: Expired worthless
        createOptionTxn('txn-2', {
          transCode: 'OEXP',
          price: 0,
          amount: 0,
          activityDate: new Date('2025-01-31'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      // Verify open action
      expect(match.openAction).toBe('sell');

      // Verify close type
      expect(match.closeType).toBe('expired');

      // P&L = full premium collected = 350 profit
      expect(match.realizedPnL).toBe(350);
      expect(match.closePrice).toBe(0);
      expect(match.status).toBe('closed');
    });

    it('STO → OASGN: option assigned, full premium = profit', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open: Collect $3.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          price: 3.5,
          amount: 350,
          activityDate: new Date('2025-01-10'),
        }),
        // Option Assignment: Shares were called away
        createOptionTxn('txn-2', {
          transCode: 'OASGN',
          price: 0,
          amount: 0,
          activityDate: new Date('2025-01-25'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      // Verify open action
      expect(match.openAction).toBe('sell');

      // Verify close type
      expect(match.closeType).toBe('assigned');

      // P&L = full premium collected = 350 profit
      // Note: The stock sale from assignment is a SEPARATE transaction
      expect(match.realizedPnL).toBe(350);
      expect(match.closePrice).toBe(0);
      expect(match.status).toBe('closed');
    });
  });

  describe('Cash-Secured Put (STO Put)', () => {
    it('STO → BTC: profit = premium collected - premium paid to close', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open Put: Collect $2.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          optionType: 'put',
          strike: 145,
          price: 2.5,
          amount: 250,
          activityDate: new Date('2025-01-10'),
        }),
        // Buy to Close: Pay $0.75 to close
        createOptionTxn('txn-2', {
          transCode: 'BTC',
          optionType: 'put',
          strike: 145,
          price: 0.75,
          amount: -75,
          activityDate: new Date('2025-01-20'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      expect(match.openAction).toBe('sell');
      expect(match.closeType).toBe('btc');
      expect(match.optionType).toBe('put');

      // P&L = 250 (collected) - 75 (paid to close) = 175 profit
      expect(match.realizedPnL).toBe(175);
    });

    it('STO → OEXP: put expired worthless, full premium = profit', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open Put: Collect $2.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          optionType: 'put',
          strike: 145,
          price: 2.5,
          amount: 250,
          activityDate: new Date('2025-01-10'),
        }),
        // Put Expiration: Expired worthless (stock stayed above strike)
        createOptionTxn('txn-2', {
          transCode: 'OEXP',
          optionType: 'put',
          strike: 145,
          price: 0,
          amount: 0,
          activityDate: new Date('2025-01-31'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      expect(match.openAction).toBe('sell');
      expect(match.closeType).toBe('expired');

      // P&L = full premium = 250 profit
      expect(match.realizedPnL).toBe(250);
    });

    it('STO → OASGN: put assigned, full premium = profit (stock purchase separate)', () => {
      const transactions: TransactionWithId[] = [
        // Sell to Open Put: Collect $2.50 premium
        createOptionTxn('txn-1', {
          transCode: 'STO',
          optionType: 'put',
          strike: 145,
          price: 2.5,
          amount: 250,
          activityDate: new Date('2025-01-10'),
        }),
        // Put Assignment: Obligated to buy shares at strike
        createOptionTxn('txn-2', {
          transCode: 'OASGN',
          optionType: 'put',
          strike: 145,
          price: 0,
          amount: 0,
          activityDate: new Date('2025-01-25'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      expect(match.openAction).toBe('sell');
      expect(match.closeType).toBe('assigned');

      // P&L = full premium = 250 profit
      // Note: The stock purchase from assignment is SEPARATE - no double counting
      expect(match.realizedPnL).toBe(250);
    });
  });

  describe('No double-counting between option and stock P&L', () => {
    it('covered call assignment: option P&L is separate from stock sale', () => {
      // Scenario: User owns AAPL at $140, sells $150 call for $3.50, gets assigned
      // Option P&L: $350 (full premium)
      // Stock P&L: Should be separate trade ($150 sale - $140 cost = $1000 profit on 100 shares)

      const optionTxns: TransactionWithId[] = [
        createOptionTxn('opt-1', {
          transCode: 'STO',
          optionType: 'call',
          strike: 150,
          price: 3.5,
          amount: 350,
        }),
        createOptionTxn('opt-2', {
          transCode: 'OASGN',
          optionType: 'call',
          strike: 150,
          price: 0,
          amount: 0,
        }),
      ];

      const result = matchTransactionsFifo(optionTxns);

      expect(result.matched).toHaveLength(1);

      // Option trade P&L should ONLY be the premium
      const optionMatch = result.matched[0];
      expect(optionMatch.realizedPnL).toBe(350);

      // The stock sale at $150 would be a separate transaction
      // processed separately - this test confirms option P&L is isolated
    });

    it('CSP assignment: option P&L is separate from stock purchase', () => {
      // Scenario: User sells $145 put for $2.50, gets assigned
      // Option P&L: $250 (full premium)
      // Stock cost basis: $145 (separate from option P&L)

      const putTxns: TransactionWithId[] = [
        createOptionTxn('put-1', {
          transCode: 'STO',
          optionType: 'put',
          strike: 145,
          price: 2.5,
          amount: 250,
        }),
        createOptionTxn('put-2', {
          transCode: 'OASGN',
          optionType: 'put',
          strike: 145,
          price: 0,
          amount: 0,
        }),
      ];

      const result = matchTransactionsFifo(putTxns);

      expect(result.matched).toHaveLength(1);

      // Option trade P&L should ONLY be the premium
      const putMatch = result.matched[0];
      expect(putMatch.realizedPnL).toBe(250);

      // The stock purchase at $145 would be a separate transaction
      // This confirms no double counting
    });
  });

  describe('Long option expiration (for comparison)', () => {
    it('BTO → OEXP: option expired worthless, full premium = loss', () => {
      const transactions: TransactionWithId[] = [
        // Buy to Open: Pay $3.50 premium
        createOptionTxn('txn-1', {
          transCode: 'BTO',
          price: 3.5,
          amount: -350, // Debit paid
          activityDate: new Date('2025-01-10'),
        }),
        // Option Expiration: Expired worthless
        createOptionTxn('txn-2', {
          transCode: 'OEXP',
          price: 0,
          amount: 0,
          activityDate: new Date('2025-01-31'),
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      expect(match.openAction).toBe('buy');
      expect(match.closeType).toBe('expired');

      // P&L = -350 loss (paid for option, got nothing back)
      expect(match.realizedPnL).toBe(-350);
    });
  });

  describe('Multiple contracts', () => {
    it('should calculate P&L correctly for multiple contracts', () => {
      const transactions: TransactionWithId[] = [
        // Sell 3 contracts: Collect $3.00 × 3 × 100 = $900
        createOptionTxn('txn-1', {
          transCode: 'STO',
          quantity: 3,
          price: 3.0,
          amount: 900,
        }),
        // Buy back 3 contracts: Pay $1.00 × 3 × 100 = $300
        createOptionTxn('txn-2', {
          transCode: 'BTC',
          quantity: 3,
          price: 1.0,
          amount: -300,
        }),
      ];

      const result = matchTransactionsFifo(transactions);

      expect(result.matched).toHaveLength(1);
      const match = result.matched[0];

      // P&L = 900 - 300 = 600 profit
      expect(match.realizedPnL).toBe(600);
      expect(match.openQuantity).toBe(3);
    });
  });
});
