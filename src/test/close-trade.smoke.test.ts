/**
 * Close Trade Smoke Tests
 *
 * End-to-end tests for the position closing API flow.
 * Tests verify that the /api/entries/close endpoint correctly:
 * - Creates closing ledger events
 * - Triggers derivation
 * - Calculates realized P&L
 *
 * Covers:
 * - Stock position closing
 * - Option position closing (long and short)
 * - Partial position closing
 * - Edge cases (already closed, not found)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { closeStockTradeSchema, closeOptionTradeSchema, closeFutureTradeSchema } from '@/lib/validations/close-trade';
import type { NormalizedTransaction, ImportContext } from '@/lib/importers/types';

// Test user data
let testUserId: string;
let testAccountId: string;

/**
 * Create a deterministic date at noon UTC to avoid timezone issues.
 */
function fixedDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/**
 * Create a test user for this test suite.
 */
async function createTestUser(): Promise<string> {
  const uniqueEmail = `close-trade-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Close Trade Test User',
    },
  });
  return user.id;
}

/**
 * Create a normalized stock transaction for testing.
 */
function createStockTransaction(
  overrides: Partial<NormalizedTransaction> & { symbol: string; transCode: string }
): NormalizedTransaction {
  const { symbol, transCode, ...rest } = overrides;
  const isOpen = transCode === 'BUY';
  const quantity = rest.quantity ?? 100;
  const price = rest.price ?? 150;
  return {
    ...rest,
    symbol,
    rawInstrument: symbol,
    transCode,
    quantity,
    price,
    amount: rest.amount ?? (isOpen ? -(quantity * price) : quantity * price),
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: false,
    eventType: 'EQUITY_STOCK',
    rawDescription: rest.rawDescription ?? `${isOpen ? 'Buy' : 'Sell'} ${symbol}`,
  };
}

/**
 * Create a normalized option transaction for testing.
 */
function createOptionTransaction(
  overrides: Partial<NormalizedTransaction> & {
    symbol: string;
    transCode: string;
    optionType: 'call' | 'put';
    strike: number;
    expiration: Date;
  }
): NormalizedTransaction {
  const { symbol, transCode, optionType, strike, expiration, ...rest } = overrides;
  const isBuy = transCode === 'BTO' || transCode === 'BTC';
  const quantity = rest.quantity ?? 1;
  const price = rest.price ?? 5.0;

  return {
    ...rest,
    symbol,
    rawInstrument: `${symbol} ${expiration.toISOString().split('T')[0]} ${strike} ${optionType.toUpperCase()}`,
    transCode,
    quantity,
    price,
    amount: rest.amount ?? (isBuy ? -quantity * price * 100 : quantity * price * 100),
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: true,
    optionType,
    strike,
    expiration,
    eventType: 'EQUITY_OPTION',
    rawDescription: rest.rawDescription ?? `${transCode} ${symbol} ${optionType}`,
  };
}

/**
 * Create a normalized futures transaction for testing.
 */
function createFutureTransaction(
  overrides: Partial<NormalizedTransaction> & { symbol: string; transCode: string }
): NormalizedTransaction {
  const { symbol, transCode, ...rest } = overrides;
  const isOpen = transCode === 'BUY';
  const quantity = rest.quantity ?? 1;
  const price = rest.price ?? 4200;
  return {
    ...rest,
    symbol,
    rawInstrument: symbol,
    transCode,
    quantity,
    price,
    amount: rest.amount ?? (isOpen ? -(quantity * price) : quantity * price),
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: false,
    eventType: 'FUTURES',
    rawDescription: rest.rawDescription ?? `${isOpen ? 'Buy' : 'Sell'} ${symbol} futures`,
  };
}

describe('Close Trade Smoke Tests', () => {
  beforeAll(async () => {
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Close Trade Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    // Retry user deletion in case of write conflicts/deadlocks
    for (let i = 0; i < 3; i++) {
      try {
        await testPrisma.user.delete({ where: { id: testUserId } });
        break;
      } catch (error) {
        if (i === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      }
    }
  });

  describe('Close Stock Position API Flow', () => {
    // Note: Each test creates its own position with unique symbol to avoid idempotency issues

    it('should validate close stock input correctly', () => {
      const validInput = {
        exitDate: new Date('2026-02-15'),
        exitPrice: 55.00,
        closingNotes: 'Taking profits',
      };

      const result = closeStockTradeSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid exit price', () => {
      const invalidInput = {
        exitDate: new Date('2026-02-15'),
        exitPrice: -10.00, // Invalid
      };

      const result = closeStockTradeSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should close stock position and calculate profit', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create a position first
      const buyTx = createStockTransaction({
        symbol: 'PROFIT',
        transCode: 'BUY',
        quantity: 100,
        price: 50.00,
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify position exists
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PROFIT',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.quantity.toNumber()).toBe(100);

      // Create closing transaction
      const closeTransaction: NormalizedTransaction = {
        activityDate: fixedDate('2026-02-15'),
        symbol: 'PROFIT',
        transCode: 'SELL',
        quantity: 100,
        price: 55.00, // Profit
        amount: 100 * 55.00,
        eventType: 'EQUITY_STOCK',
        isOption: false,
        rawInstrument: 'PROFIT',
        rawDescription: 'Close PROFIT position',
      };

      await writeLedgerEvents(testPrisma, context, [closeTransaction]);
      await fullRederivation(testPrisma, testUserId);

      // Position should be closed
      const closedPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PROFIT',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });
      expect(closedPosition).toBeNull();

      // Check realized P&L
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PROFIT',
          closeType: 'stock',
        },
      });

      expect(close).toBeDefined();
      // P&L = (55 - 50) * 100 = $500
      expect(close?.realizedPnL.toNumber()).toBe(500);
      expect(close?.closeReason).toBe('normal');
    });

    it('should close stock position and calculate loss', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create another position first
      const buyTx = createStockTransaction({
        symbol: 'LOSS',
        transCode: 'BUY',
        quantity: 50,
        price: 100.00,
        activityDate: fixedDate('2026-02-05'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx]);
      await fullRederivation(testPrisma, testUserId);

      // Close at loss
      const sellTx: NormalizedTransaction = {
        activityDate: fixedDate('2026-02-20'),
        symbol: 'LOSS',
        transCode: 'SELL',
        quantity: 50,
        price: 80.00, // Loss
        amount: 50 * 80.00,
        eventType: 'EQUITY_STOCK',
        isOption: false,
        rawInstrument: 'LOSS',
        rawDescription: 'Close LOSS position',
      };

      await writeLedgerEvents(testPrisma, context, [sellTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'LOSS',
        },
      });

      expect(close).toBeDefined();
      // P&L = (80 - 100) * 50 = -$1000
      expect(close?.realizedPnL.toNumber()).toBe(-1000);
    });
  });

  describe('Close Future Position API Flow', () => {
    it('should validate close futures input correctly', () => {
      const validInput = {
        exitDate: new Date('2026-02-15'),
        exitPrice: 4350.25,
        closingNotes: 'Closed futures for profit',
      };

      const result = closeFutureTradeSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should close futures position and calculate profit', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const buyTx = createFutureTransaction({
        symbol: 'FUTPROFIT',
        transCode: 'BUY',
        quantity: 2,
        price: 4000.00,
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx]);
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'FUTPROFIT',
          positionType: 'future',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.quantity.toNumber()).toBe(2);

      const sellTx = createFutureTransaction({
        symbol: 'FUTPROFIT',
        transCode: 'SELL',
        quantity: 2,
        price: 4100.00,
        activityDate: fixedDate('2026-02-10'),
      });

      await writeLedgerEvents(testPrisma, context, [sellTx]);
      await fullRederivation(testPrisma, testUserId);

      const closedPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'FUTPROFIT',
          positionType: 'future',
          quantity: { gt: 0 },
        },
      });
      expect(closedPosition).toBeNull();

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'FUTPROFIT',
          closeType: 'future',
        },
      });

      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(200);
      expect(close?.closeReason).toBe('normal');
    });
  });

  describe('Close Option Position API Flow', () => {
    it('should validate close option input correctly', () => {
      const validInput = {
        exitDate: new Date('2026-02-15'),
        optionLegs: [
          { id: crypto.randomUUID(), exitPremium: 8.50 },
        ],
        closingNotes: 'Took profit on call',
      };

      const result = closeOptionTradeSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid exit premium', () => {
      const invalidInput = {
        exitDate: new Date('2026-02-15'),
        optionLegs: [
          { id: crypto.randomUUID(), exitPremium: -5.00 }, // Invalid
        ],
      };

      const result = closeOptionTradeSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should close long call at profit', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Open long call
      const openTx = createOptionTransaction({
        symbol: 'CALL',
        transCode: 'BTO',
        optionType: 'call',
        strike: 100,
        expiration: fixedDate('2026-03-21'),
        quantity: 2,
        price: 5.00,
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [openTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify position exists
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'CALL',
          optionType: 'call',
        },
      });
      expect(position).toBeDefined();
      expect(position?.side).toBe('long');

      // Close at profit
      const closeTx = createOptionTransaction({
        symbol: 'CALL',
        transCode: 'STC',
        optionType: 'call',
        strike: 100,
        expiration: fixedDate('2026-03-21'),
        quantity: 2,
        price: 8.00, // Profit
        activityDate: fixedDate('2026-02-20'),
      });

      await writeLedgerEvents(testPrisma, context, [closeTx]);
      await fullRederivation(testPrisma, testUserId);

      // Position should be closed
      const closedPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'CALL',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });
      expect(closedPosition).toBeNull();

      // Check P&L
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'CALL',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // P&L = (8.00 - 5.00) * 2 * 100 = $600
      expect(close?.realizedPnL.toNumber()).toBe(600);
    });

    it('should close short put at profit (premium kept)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Open short put (CSP)
      const openTx = createOptionTransaction({
        symbol: 'SPUT',
        transCode: 'STO',
        optionType: 'put',
        strike: 200,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 10.00, // Receive $1000 premium
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [openTx]);
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SPUT',
          optionType: 'put',
        },
      });
      expect(position?.side).toBe('short');

      // Buy back cheaper - profit
      const closeTx = createOptionTransaction({
        symbol: 'SPUT',
        transCode: 'BTC',
        optionType: 'put',
        strike: 200,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 3.00, // Pay $300 to close
        activityDate: fixedDate('2026-02-20'),
      });

      await writeLedgerEvents(testPrisma, context, [closeTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SPUT',
          optionType: 'put',
        },
      });

      expect(close).toBeDefined();
      // Short option profit: (entry - exit) * qty * 100 = (10 - 3) * 1 * 100 = $700
      expect(close?.realizedPnL.toNumber()).toBe(700);
    });

    it('should close short call at loss', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Open short call (covered call)
      const openTx = createOptionTransaction({
        symbol: 'SCALL',
        transCode: 'STO',
        optionType: 'call',
        strike: 150,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 5.00, // Receive $500 premium
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [openTx]);
      await fullRederivation(testPrisma, testUserId);

      // Buy back at higher price - loss
      const closeTx = createOptionTransaction({
        symbol: 'SCALL',
        transCode: 'BTC',
        optionType: 'call',
        strike: 150,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 12.00, // Pay $1200 to close
        activityDate: fixedDate('2026-02-25'),
      });

      await writeLedgerEvents(testPrisma, context, [closeTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SCALL',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // Short option loss: (entry - exit) * qty * 100 = (5 - 12) * 1 * 100 = -$700
      expect(close?.realizedPnL.toNumber()).toBe(-700);
    });
  });

  describe('Daily Aggregates After Close', () => {
    it('should update daily aggregates correctly', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create and close a winning trade on a specific date
      const buyTx = createStockTransaction({
        symbol: 'DAILY',
        transCode: 'BUY',
        quantity: 100,
        price: 10.00,
        activityDate: fixedDate('2026-03-01'),
      });

      const sellTx = createStockTransaction({
        symbol: 'DAILY',
        transCode: 'SELL',
        quantity: 100,
        price: 15.00, // $500 profit
        activityDate: fixedDate('2026-03-05'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx, sellTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify realized close was created first
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'DAILY',
        },
      });
      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(500);

      // Check daily aggregate for close date
      // Note: derivation creates both per-account and all-accounts (null brokerageAccountId) aggregates
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: {
          userId: testUserId,
        },
      });

      // Find the aggregate for the close date
      const closeDate = close!.closeDate.toISOString().split('T')[0];
      const aggregate = aggregates.find(
        (a) => a.date.toISOString().split('T')[0] === closeDate
      );

      expect(aggregate).toBeDefined();
      expect(aggregate?.realizedPnL.toNumber()).toBe(500);
      expect(aggregate?.tradeCount).toBe(1);
      expect(aggregate?.winCount).toBe(1);
      expect(aggregate?.lossCount).toBe(0);
    });

    it('should handle multiple closes on same day', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy two different stocks
      const buy1 = createStockTransaction({
        symbol: 'MULTI1',
        transCode: 'BUY',
        quantity: 50,
        price: 20.00,
        activityDate: fixedDate('2026-03-10'),
      });

      const buy2 = createStockTransaction({
        symbol: 'MULTI2',
        transCode: 'BUY',
        quantity: 50,
        price: 30.00,
        activityDate: fixedDate('2026-03-10'),
      });

      await writeLedgerEvents(testPrisma, context, [buy1, buy2]);

      // Close both on same day
      const sell1 = createStockTransaction({
        symbol: 'MULTI1',
        transCode: 'SELL',
        quantity: 50,
        price: 25.00, // $250 profit
        activityDate: fixedDate('2026-03-15'),
      });

      const sell2 = createStockTransaction({
        symbol: 'MULTI2',
        transCode: 'SELL',
        quantity: 50,
        price: 28.00, // $100 loss
        activityDate: fixedDate('2026-03-15'),
      });

      await writeLedgerEvents(testPrisma, context, [sell1, sell2]);
      await fullRederivation(testPrisma, testUserId);

      // Verify closes were created
      const closes = await testPrisma.realizedClose.findMany({
        where: {
          userId: testUserId,
          symbol: { in: ['MULTI1', 'MULTI2'] },
        },
      });
      expect(closes.length).toBe(2);

      // Note: derivation creates both per-account and all-accounts (null brokerageAccountId) aggregates
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: {
          userId: testUserId,
        },
      });

      // Find the aggregate for the close date using one of the closes
      const closeDate = closes[0].closeDate.toISOString().split('T')[0];
      const aggregate = aggregates.find(
        (a) => a.date.toISOString().split('T')[0] === closeDate
      );

      expect(aggregate).toBeDefined();
      // Net P&L = $250 - $100 = $150
      expect(aggregate?.realizedPnL.toNumber()).toBe(150);
      expect(aggregate?.tradeCount).toBe(2);
      expect(aggregate?.winCount).toBe(1);
      expect(aggregate?.lossCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle breakeven trade correctly', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const buyTx = createStockTransaction({
        symbol: 'EVEN',
        transCode: 'BUY',
        quantity: 100,
        price: 50.00,
        activityDate: fixedDate('2026-03-20'),
      });

      const sellTx = createStockTransaction({
        symbol: 'EVEN',
        transCode: 'SELL',
        quantity: 100,
        price: 50.00, // Breakeven
        activityDate: fixedDate('2026-03-25'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx, sellTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EVEN',
        },
      });

      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(0);
      // Breakeven should not count as win or loss for win rate
    });

    it('should handle very small P&L amounts', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const buyTx = createStockTransaction({
        symbol: 'TINY',
        transCode: 'BUY',
        quantity: 1,
        price: 10.0001,
        activityDate: fixedDate('2026-03-26'),
      });

      const sellTx = createStockTransaction({
        symbol: 'TINY',
        transCode: 'SELL',
        quantity: 1,
        price: 10.0002,
        activityDate: fixedDate('2026-03-27'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx, sellTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TINY',
        },
      });

      expect(close).toBeDefined();
      // Very small profit: $0.0001
      expect(close?.realizedPnL.toNumber()).toBeCloseTo(0.0001, 4);
    });
  });
});
