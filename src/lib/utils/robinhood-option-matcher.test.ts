/**
 * Tests for Robinhood Option Matching Algorithm
 */

import { describe, it, expect } from 'vitest';
import { matchOptionTransactions } from './robinhood-option-matcher';
import { ParsedTransaction } from './robinhood-parser';

// Helper function to create mock option transaction
function createOptionTx(
  overrides: Partial<ParsedTransaction>
): ParsedTransaction {
  return {
    activityDate: new Date('2026-01-16'),
    processDate: new Date('2026-01-16'),
    settleDate: new Date('2026-01-20'),
    accountType: null,
    instrument: overrides.instrument || 'TSLA',
    description: overrides.description || 'TSLA 1/16/2026 Call $440.00',
    transCode: overrides.transCode || 'STO',
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 2.0,
    amount: overrides.amount ?? 200,
    suppressed: null,
    symbol: overrides.symbol || 'TSLA',
    isOption: true,
    optionType: overrides.optionType || 'call',
    strike: overrides.strike ?? 440,
    expiration: overrides.expiration || new Date('2026-01-16'),
    ...overrides,
  };
}

// Helper function to create mock stock transaction
function createStockTx(
  overrides: Partial<ParsedTransaction>
): ParsedTransaction {
  return {
    activityDate: new Date('2026-01-16'),
    processDate: new Date('2026-01-16'),
    settleDate: new Date('2026-01-20'),
    accountType: null,
    instrument: overrides.instrument || 'TSLA',
    description: overrides.description || 'Tesla',
    transCode: overrides.transCode || 'Buy',
    quantity: overrides.quantity ?? 100,
    price: overrides.price ?? 440,
    amount: overrides.amount ?? -44000,
    suppressed: null,
    symbol: overrides.symbol || 'TSLA',
    isOption: false,
    optionType: null,
    strike: null,
    expiration: null,
    ...overrides,
  };
}

describe('Robinhood Option Matcher', () => {
  describe('STO → BTC (Sell to Open, Buy to Close)', () => {
    it('should match STO → BTC with profit', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          price: 3.0,
          amount: 300,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'BTC',
          price: 1.0,
          amount: -100,
          activityDate: new Date('2026-01-15'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].openAction).toBe('STO');
      expect(matched[0].closeAction).toBe('BTC');
      expect(matched[0].quantity).toBe(1);
      expect(matched[0].openPremium).toBe(3);
      expect(matched[0].closePremium).toBe(1);
      expect(matched[0].pnl).toBe(200); // (3 - 1) × 1 × 100 = $200 profit
    });

    it('should match STO → BTC with loss', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          price: 1.0,
          amount: 100,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'BTC',
          price: 3.0,
          amount: -300,
          activityDate: new Date('2026-01-15'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].pnl).toBe(-200); // (1 - 3) × 1 × 100 = -$200 loss
    });
  });

  describe('BTO → STC (Buy to Open, Sell to Close)', () => {
    it('should match BTO → STC with profit', () => {
      const transactions = [
        createOptionTx({
          transCode: 'BTO',
          price: 2.0,
          amount: -200,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'STC',
          price: 5.0,
          amount: 500,
          activityDate: new Date('2026-01-15'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].openAction).toBe('BTO');
      expect(matched[0].closeAction).toBe('STC');
      expect(matched[0].quantity).toBe(1);
      expect(matched[0].openPremium).toBe(2);
      expect(matched[0].closePremium).toBe(5);
      expect(matched[0].pnl).toBe(300); // (5 - 2) × 1 × 100 = $300 profit
    });

    it('should match BTO → STC with loss', () => {
      const transactions = [
        createOptionTx({
          transCode: 'BTO',
          price: 5.0,
          amount: -500,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'STC',
          price: 2.0,
          amount: 200,
          activityDate: new Date('2026-01-15'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].pnl).toBe(-300); // (2 - 5) × 1 × 100 = -$300 loss
    });
  });

  describe('STO → OEXP (Sell to Open, Option Expiration)', () => {
    it('should match STO → OEXP with full premium profit', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          price: 1.72,
          amount: 171.95,
          activityDate: new Date('2026-01-13'),
        }),
        createOptionTx({
          transCode: 'OEXP',
          description: 'Option Expiration for TSLA 1/16/2026 Call $440.00',
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].openAction).toBe('STO');
      expect(matched[0].closeAction).toBe('OEXP');
      expect(matched[0].quantity).toBe(1);
      expect(matched[0].openPremium).toBe(1.72);
      expect(matched[0].closePremium).toBe(0);
      expect(matched[0].pnl).toBe(172); // 1.72 × 1 × 100 = $172 profit (keep premium)
    });

    it('should match multiple STO → OEXP', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          quantity: 11,
          price: 2.11,
          amount: 2362.47,
          activityDate: new Date('2026-01-13'),
        }),
        createOptionTx({
          transCode: 'OEXP',
          quantity: 11,
          description: 'Option Expiration for TSLA 1/16/2026 Call $440.00',
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].quantity).toBe(11);
      expect(matched[0].pnl).toBe(2321); // 2.11 × 11 × 100 = $2,321 profit
    });
  });

  describe('BTO → OEXP (Buy to Open, Option Expiration)', () => {
    it('should match BTO → OEXP with full premium loss', () => {
      const transactions = [
        createOptionTx({
          transCode: 'BTO',
          price: 5.10,
          amount: -510.04,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'OEXP',
          description: 'Option Expiration for TSLA 1/16/2026 Call $440.00',
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].openAction).toBe('BTO');
      expect(matched[0].closeAction).toBe('OEXP');
      expect(matched[0].quantity).toBe(1);
      expect(matched[0].openPremium).toBe(5.10);
      expect(matched[0].closePremium).toBe(0);
      expect(matched[0].pnl).toBe(-510); // -5.10 × 1 × 100 = -$510 loss (lose premium)
    });
  });

  describe('STO → OASGN (Sell to Open, Option Assignment)', () => {
    it('should match STO Put → OASGN with stock Buy', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          optionType: 'put',
          strike: 440,
          price: 4.55,
          amount: 454.95,
          activityDate: new Date('2026-01-13'),
          description: 'TSLA 1/16/2026 Put $440.00',
        }),
        createOptionTx({
          transCode: 'OASGN',
          optionType: 'put',
          strike: 440,
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
          description: 'TSLA 1/16/2026 Put $440.00',
        }),
        createStockTx({
          transCode: 'Buy',
          quantity: 100,
          price: 440,
          amount: -44000,
          activityDate: new Date('2026-01-16'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].openAction).toBe('STO');
      expect(matched[0].closeAction).toBe('OASGN');
      expect(matched[0].quantity).toBe(1);
      expect(matched[0].openPremium).toBe(4.55);
      expect(matched[0].closePremium).toBe(0);
      expect(matched[0].pnl).toBe(455); // 4.55 × 1 × 100 = $455 profit (keep premium)
      expect(matched[0].stockTransaction).toBeDefined();
      expect(matched[0].stockTransaction?.transCode).toBe('Buy');
      expect(matched[0].stockTransaction?.price).toBe(440);
    });

    it('should match STO Call → OASGN with stock Sell', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          symbol: 'IREN',
          optionType: 'call',
          strike: 56,
          quantity: 2,
          price: 0.51,
          amount: 101.91,
          activityDate: new Date('2026-01-13'),
          description: 'IREN 1/16/2026 Call $56.00',
          expiration: new Date('2026-01-16'),
        }),
        createOptionTx({
          transCode: 'OASGN',
          symbol: 'IREN',
          optionType: 'call',
          strike: 56,
          quantity: 2,
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
          description: 'IREN 1/16/2026 Call $56.00',
          expiration: new Date('2026-01-16'),
        }),
        createStockTx({
          symbol: 'IREN',
          transCode: 'Sell',
          quantity: 200,
          price: 56,
          amount: 11199.96,
          activityDate: new Date('2026-01-16'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].symbol).toBe('IREN');
      expect(matched[0].openAction).toBe('STO');
      expect(matched[0].closeAction).toBe('OASGN');
      expect(matched[0].quantity).toBe(2);
      expect(matched[0].pnl).toBe(102); // 0.51 × 2 × 100 = $102 profit
      expect(matched[0].stockTransaction).toBeDefined();
      expect(matched[0].stockTransaction?.transCode).toBe('Sell');
      expect(matched[0].stockTransaction?.quantity).toBe(200);
    });
  });

  describe('FIFO Matching', () => {
    it('should match multiple opens and closes using FIFO', () => {
      const transactions = [
        // Open position 1
        createOptionTx({
          transCode: 'STO',
          quantity: 5,
          price: 2.0,
          amount: 1000,
          activityDate: new Date('2026-01-10'),
        }),
        // Open position 2
        createOptionTx({
          transCode: 'STO',
          quantity: 3,
          price: 3.0,
          amount: 900,
          activityDate: new Date('2026-01-11'),
        }),
        // Close 4 contracts (should match 4 from position 1)
        createOptionTx({
          transCode: 'BTC',
          quantity: 4,
          price: 1.0,
          amount: -400,
          activityDate: new Date('2026-01-12'),
        }),
        // Close 2 contracts (should match 1 from position 1, 1 from position 2)
        createOptionTx({
          transCode: 'BTC',
          quantity: 2,
          price: 0.5,
          amount: -100,
          activityDate: new Date('2026-01-13'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      // Algorithm creates separate matches for each open position matched
      // First close (4 contracts) matches position 1
      // Second close (2 contracts) matches 1 from position 1, then 1 from position 2
      expect(matched).toHaveLength(3);

      // First match: 4 contracts from position 1
      expect(matched[0].quantity).toBe(4);
      expect(matched[0].openPremium).toBe(8); // 2.0 × 4
      expect(matched[0].closePremium).toBe(4); // 1.0 × 4
      expect(matched[0].pnl).toBe(400); // (2.0 - 1.0) × 4 × 100

      // Second match: 1 contract from position 1
      expect(matched[1].quantity).toBe(1);
      expect(matched[1].openPremium).toBe(2); // 2.0 × 1
      expect(matched[1].closePremium).toBe(0.5); // 0.5 × 1
      expect(matched[1].pnl).toBe(150); // (2.0 - 0.5) × 1 × 100

      // Third match: 1 contract from position 2
      expect(matched[2].quantity).toBe(1);
      expect(matched[2].openPremium).toBe(3); // 3.0 × 1
      expect(matched[2].closePremium).toBe(0.5); // 0.5 × 1
      expect(matched[2].pnl).toBe(250); // (3.0 - 0.5) × 1 × 100
    });

    it('should match partial closes correctly', () => {
      const transactions = [
        createOptionTx({
          transCode: 'BTO',
          quantity: 10,
          price: 2.0,
          amount: -2000,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'STC',
          quantity: 3,
          price: 5.0,
          amount: 1500,
          activityDate: new Date('2026-01-11'),
        }),
        createOptionTx({
          transCode: 'STC',
          quantity: 5,
          price: 4.0,
          amount: 2000,
          activityDate: new Date('2026-01-12'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(2);

      // First close: 3 contracts
      expect(matched[0].quantity).toBe(3);
      expect(matched[0].openPremium).toBe(6); // 2.0 × 3
      expect(matched[0].closePremium).toBe(15); // 5.0 × 3
      expect(matched[0].pnl).toBe(900); // (5.0 - 2.0) × 3 × 100

      // Second close: 5 contracts
      expect(matched[1].quantity).toBe(5);
      expect(matched[1].openPremium).toBe(10); // 2.0 × 5
      expect(matched[1].closePremium).toBe(20); // 4.0 × 5
      expect(matched[1].pnl).toBe(1000); // (4.0 - 2.0) × 5 × 100
    });
  });

  describe('Multiple Option Contracts', () => {
    it('should match different option contracts separately', () => {
      const transactions = [
        // TSLA Call $440
        createOptionTx({
          transCode: 'STO',
          symbol: 'TSLA',
          optionType: 'call',
          strike: 440,
          price: 2.0,
          activityDate: new Date('2026-01-10'),
          description: 'TSLA 1/16/2026 Call $440.00',
        }),
        createOptionTx({
          transCode: 'BTC',
          symbol: 'TSLA',
          optionType: 'call',
          strike: 440,
          price: 1.0,
          activityDate: new Date('2026-01-11'),
          description: 'TSLA 1/16/2026 Call $440.00',
        }),
        // TSLA Put $435
        createOptionTx({
          transCode: 'STO',
          symbol: 'TSLA',
          optionType: 'put',
          strike: 435,
          price: 3.0,
          activityDate: new Date('2026-01-10'),
          description: 'TSLA 1/16/2026 Put $435.00',
        }),
        createOptionTx({
          transCode: 'OEXP',
          symbol: 'TSLA',
          optionType: 'put',
          strike: 435,
          price: null,
          amount: null,
          activityDate: new Date('2026-01-16'),
          description: 'Option Expiration for TSLA 1/16/2026 Put $435.00',
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(2);

      // TSLA Call $440
      const callMatch = matched.find(m => m.optionType === 'call');
      expect(callMatch).toBeDefined();
      expect(callMatch!.strike).toBe(440);
      expect(callMatch!.closeAction).toBe('BTC');
      expect(callMatch!.pnl).toBe(100); // (2 - 1) × 1 × 100

      // TSLA Put $435
      const putMatch = matched.find(m => m.optionType === 'put');
      expect(putMatch).toBeDefined();
      expect(putMatch!.strike).toBe(435);
      expect(putMatch!.closeAction).toBe('OEXP');
      expect(putMatch!.pnl).toBe(300); // 3 × 1 × 100
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty transaction list', () => {
      const matched = matchOptionTransactions([]);
      expect(matched).toHaveLength(0);
    });

    it('should handle only stock transactions (no options)', () => {
      const transactions = [
        createStockTx({ transCode: 'Buy' }),
        createStockTx({ transCode: 'Sell' }),
      ];

      const matched = matchOptionTransactions(transactions);
      expect(matched).toHaveLength(0);
    });

    it('should handle only open positions (no closes)', () => {
      const transactions = [
        createOptionTx({ transCode: 'STO' }),
        createOptionTx({ transCode: 'BTO' }),
      ];

      const matched = matchOptionTransactions(transactions);
      expect(matched).toHaveLength(0); // No matches, still open
    });

    it('should handle very small premiums', () => {
      const transactions = [
        createOptionTx({
          transCode: 'STO',
          price: 0.01,
          amount: 1.0,
          activityDate: new Date('2026-01-10'),
        }),
        createOptionTx({
          transCode: 'BTC',
          price: 0.01,
          amount: -1.0,
          activityDate: new Date('2026-01-11'),
        }),
      ];

      const matched = matchOptionTransactions(transactions);

      expect(matched).toHaveLength(1);
      expect(matched[0].pnl).toBe(0); // (0.01 - 0.01) × 1 × 100 = $0
    });
  });
});
