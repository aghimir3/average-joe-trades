/**
 * Manual Stock Entry Smoke Tests
 *
 * End-to-end tests for stock trade creation, validation, and ledger integration.
 * Tests verify that manually entered stock trades correctly flow through
 * the ledger write and derivation pipeline.
 *
 * Covers:
 * - Stock entry creation (BUY)
 * - Ledger event generation
 * - Derivation to DerivedPosition
 * - Idempotency (duplicate detection)
 * - Soft delete and re-derivation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
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
  const uniqueEmail = `manual-stock-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Manual Stock Test User',
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

describe('Manual Stock Entry Smoke Tests', () => {
  beforeAll(async () => {
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Manual Stock Test Account',
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

  describe('Stock Entry Creation', () => {
    it('should create a BUY ledger event for stock purchase', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'BUY',
        quantity: 100,
        price: 150.00,
        activityDate: fixedDate('2026-01-15'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);

      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify ledger event was created
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      expect(event).toBeDefined();
      expect(event?.symbol).toBe('AAPL');
      expect(event?.quantity.toNumber()).toBe(100);
      expect(event?.price?.toNumber()).toBe(150);
      expect(event?.isOption).toBe(false);
      expect(event?.eventType).toBe('EQUITY_STOCK');
    });

    it('should derive an open position after stock purchase', async () => {
      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Check derived position
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.symbol).toBe('AAPL');
      expect(position?.quantity.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(150);
      expect(position?.costBasis.toNumber()).toBe(15000); // 100 * 150
      expect(position?.side).toBe('long');
    });

    it('should reject duplicate stock entry (idempotency)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Same transaction as before
      const transaction = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'BUY',
        quantity: 100,
        price: 150.00,
        activityDate: fixedDate('2026-01-15'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);

      // Should be detected as duplicate
      expect(result.inserted).toBe(0);
      expect(result.duplicates).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should create multiple stock entries for different symbols', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transactions = [
        createStockTransaction({
          symbol: 'MSFT',
          transCode: 'BUY',
          quantity: 50,
          price: 400.00,
          activityDate: fixedDate('2026-01-16'),
        }),
        createStockTransaction({
          symbol: 'NVDA',
          transCode: 'BUY',
          quantity: 25,
          price: 800.00,
          activityDate: fixedDate('2026-01-16'),
        }),
      ];

      const result = await writeLedgerEvents(testPrisma, context, transactions);

      expect(result.inserted).toBe(2);
      expect(result.duplicates).toBe(0);

      // Run derivation and verify positions
      await fullRederivation(testPrisma, testUserId);

      const positions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(positions.length).toBe(3); // AAPL, MSFT, NVDA
    });
  });

  describe('Stock Sale and P&L Calculation', () => {
    it('should create a SELL ledger event and calculate realized P&L', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell MSFT at a profit
      const transaction = createStockTransaction({
        symbol: 'MSFT',
        transCode: 'SELL',
        quantity: 50,
        price: 420.00,
        activityDate: fixedDate('2026-01-20'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Check that position is closed
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull(); // Position should be closed

      // Check realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          closeType: 'stock',
        },
      });

      expect(close).toBeDefined();
      expect(close?.quantity.toNumber()).toBe(50);
      expect(close?.openPrice.toNumber()).toBe(400);
      expect(close?.closePrice.toNumber()).toBe(420);
      // P&L = (420 - 400) * 50 = $1000
      expect(close?.realizedPnL.toNumber()).toBe(1000);
      expect(close?.hasUnknownBasis).toBe(false);
    });

    it('should calculate loss correctly for losing trade', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell NVDA at a loss
      const transaction = createStockTransaction({
        symbol: 'NVDA',
        transCode: 'SELL',
        quantity: 25,
        price: 750.00, // Bought at 800
        activityDate: fixedDate('2026-01-21'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NVDA',
          closeType: 'stock',
        },
      });

      expect(close).toBeDefined();
      // P&L = (750 - 800) * 25 = -$1250
      expect(close?.realizedPnL.toNumber()).toBe(-1250);
    });
  });

  describe('Partial Position Close', () => {
    it('should handle partial stock sale correctly', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy more TSLA
      const buyTx = createStockTransaction({
        symbol: 'TSLA',
        transCode: 'BUY',
        quantity: 100,
        price: 200.00,
        activityDate: fixedDate('2026-01-17'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx]);
      await fullRederivation(testPrisma, testUserId);

      // Sell only 40 shares
      const sellTx = createStockTransaction({
        symbol: 'TSLA',
        transCode: 'SELL',
        quantity: 40,
        price: 220.00,
        activityDate: fixedDate('2026-01-22'),
      });

      await writeLedgerEvents(testPrisma, context, [sellTx]);
      await fullRederivation(testPrisma, testUserId);

      // Should have remaining position
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.quantity.toNumber()).toBe(60); // 100 - 40

      // Should have realized close for partial
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          closeType: 'stock',
        },
      });

      expect(close).toBeDefined();
      expect(close?.quantity.toNumber()).toBe(40);
      // P&L = (220 - 200) * 40 = $800
      expect(close?.realizedPnL.toNumber()).toBe(800);
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete a ledger event', async () => {
      // Find the TSLA buy event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      expect(event).toBeDefined();

      // Soft delete
      await testPrisma.ledgerEvent.update({
        where: { id: event!.id },
        data: { deletedAt: new Date() },
      });

      // Verify it's deleted
      const deletedEvent = await testPrisma.ledgerEvent.findFirst({
        where: {
          id: event!.id,
          deletedAt: null,
        },
      });

      expect(deletedEvent).toBeNull();

      // Re-derive - TSLA position should disappear
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      // Position should be gone because buy event is deleted
      expect(position).toBeNull();

      // But the SELL event still exists without a matching open
      // This creates an unknown basis close
      const tslaClose = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
        },
      });

      // The sell event creates an unknown basis close
      expect(tslaClose?.hasUnknownBasis).toBe(true);
    });
  });

  describe('Unknown Basis Handling', () => {
    it('should create unknown basis close when selling without open', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell stock that was never bought
      const transaction = createStockTransaction({
        symbol: 'GOOGL',
        transCode: 'SELL',
        quantity: 10,
        price: 150.00,
        activityDate: fixedDate('2026-01-25'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'GOOGL',
        },
      });

      expect(close).toBeDefined();
      expect(close?.hasUnknownBasis).toBe(true);
      expect(close?.realizedPnL.toNumber()).toBe(0); // Unknown basis = 0 P&L
    });
  });

  describe('Daily Aggregate Generation', () => {
    it('should create daily aggregates for days with closes', async () => {
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId },
        orderBy: { date: 'asc' },
      });

      expect(aggregates.length).toBeGreaterThan(0);

      // Check for Jan 20 (MSFT close date)
      const jan20 = aggregates.find(
        (a) => a.date.toISOString().split('T')[0] === '2026-01-20'
      );

      expect(jan20).toBeDefined();
      expect(jan20?.realizedPnL.toNumber()).toBe(1000); // MSFT profit
      expect(jan20?.tradeCount).toBe(1);
      expect(jan20?.winCount).toBe(1);
      expect(jan20?.lossCount).toBe(0);
    });
  });
});
