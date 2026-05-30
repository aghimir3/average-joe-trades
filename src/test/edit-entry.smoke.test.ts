/**
 * Edit Entry Smoke Tests
 *
 * End-to-end tests for editing ledger events and verifying re-derivation.
 * Tests verify that the editing flow correctly:
 * - Updates ledger events
 * - Regenerates event hash
 * - Re-triggers derivation
 * - Updates derived positions and closes
 *
 * Covers:
 * - Edit stock entry (ticker, price, quantity, date)
 * - Edit option entry (premium, strike, expiration)
 * - Soft delete and re-derivation impact
 * - Edge cases (hash collision prevention)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import type { NormalizedTransaction, ImportContext } from '@/lib/importers/types';
import crypto from 'crypto';

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
  const uniqueEmail = `edit-entry-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Edit Entry Test User',
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
 * Regenerate event hash after edits (same logic as API).
 */
function generateEventHash(
  userId: string,
  brokerageAccountId: string,
  activityDate: Date,
  symbol: string,
  transCode: string,
  quantity: number,
  price: number | null,
  amount: number | null
): string {
  const hashData = {
    userId,
    brokerageAccountId,
    activityDate: activityDate.toISOString(),
    symbol,
    transCode,
    quantity: String(quantity),
    price: String(price ?? ''),
    amount: String(amount ?? ''),
  };
  const hashString = Object.values(hashData).join('|');
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

describe('Edit Entry Smoke Tests', () => {
  beforeAll(async () => {
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Edit Entry Test Account',
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

  describe('Edit Stock Entry', () => {
    let stockEventId: string;

    it('should create initial stock entry', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createStockTransaction({
        symbol: 'EDIT',
        transCode: 'BUY',
        quantity: 100,
        price: 50.00,
        activityDate: fixedDate('2026-04-01'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      expect(event).toBeDefined();
      stockEventId = event!.id;

      // Verify initial position
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
        },
      });

      expect(position?.quantity.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(50);
    });

    it('should update entry price and re-derive correctly', async () => {
      // Edit the entry price
      const newPrice = 55.00;
      const newAmount = -100 * newPrice; // BUY = negative amount

      const updatedEvent = await testPrisma.ledgerEvent.update({
        where: { id: stockEventId },
        data: {
          price: newPrice,
          amount: newAmount,
          eventHash: generateEventHash(
            testUserId,
            testAccountId,
            fixedDate('2026-04-01'),
            'EDIT',
            'BUY',
            100,
            newPrice,
            newAmount
          ),
        },
      });

      expect(updatedEvent.price?.toNumber()).toBe(55);

      // Re-derive
      await fullRederivation(testPrisma, testUserId);

      // Verify position reflects new price
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
        },
      });

      expect(position?.avgPrice.toNumber()).toBe(55);
      expect(position?.costBasis.toNumber()).toBe(5500); // 100 * 55
    });

    it('should update entry quantity and re-derive correctly', async () => {
      // Edit the quantity
      const newQuantity = 150;
      const currentPrice = 55.00;
      const newAmount = -newQuantity * currentPrice;

      await testPrisma.ledgerEvent.update({
        where: { id: stockEventId },
        data: {
          quantity: newQuantity,
          amount: newAmount,
          eventHash: generateEventHash(
            testUserId,
            testAccountId,
            fixedDate('2026-04-01'),
            'EDIT',
            'BUY',
            newQuantity,
            currentPrice,
            newAmount
          ),
        },
      });

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
        },
      });

      expect(position?.quantity.toNumber()).toBe(150);
      expect(position?.costBasis.toNumber()).toBe(8250); // 150 * 55
    });

    it('should update entry date and re-derive correctly', async () => {
      const newDate = fixedDate('2026-04-05');

      await testPrisma.ledgerEvent.update({
        where: { id: stockEventId },
        data: {
          activityDate: newDate,
          eventHash: generateEventHash(
            testUserId,
            testAccountId,
            newDate,
            'EDIT',
            'BUY',
            150,
            55.00,
            -150 * 55
          ),
        },
      });

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
        },
      });

      // First entry date should reflect new date
      expect(position?.firstEntryDate.toISOString()).toContain('2026-04-05');
    });

    it('should update symbol and re-derive as new position', async () => {
      const newSymbol = 'RENAMED';

      await testPrisma.ledgerEvent.update({
        where: { id: stockEventId },
        data: {
          symbol: newSymbol,
          instrument: newSymbol,
          eventHash: generateEventHash(
            testUserId,
            testAccountId,
            fixedDate('2026-04-05'),
            newSymbol,
            'BUY',
            150,
            55.00,
            -150 * 55
          ),
        },
      });

      await fullRederivation(testPrisma, testUserId);

      // Old symbol position should not exist
      const oldPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'EDIT',
          quantity: { gt: 0 },
        },
      });
      expect(oldPosition).toBeNull();

      // New symbol position should exist
      const newPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'RENAMED',
        },
      });
      expect(newPosition).toBeDefined();
      expect(newPosition?.quantity.toNumber()).toBe(150);
    });
  });

  describe('Edit Option Entry', () => {
    let optionEventId: string;

    it('should create initial option entry', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'OPTIO',
        transCode: 'BTO',
        optionType: 'call',
        strike: 100,
        expiration: fixedDate('2026-05-21'),
        quantity: 2,
        price: 5.00,
        activityDate: fixedDate('2026-04-10'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
          transCode: 'BTO',
          deletedAt: null,
        },
      });

      expect(event).toBeDefined();
      optionEventId = event!.id;

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
          optionType: 'call',
        },
      });

      expect(position?.strike?.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(5);
    });

    it('should update option premium and re-derive', async () => {
      const newPremium = 7.50;

      await testPrisma.ledgerEvent.update({
        where: { id: optionEventId },
        data: {
          price: newPremium,
          amount: -2 * newPremium * 100,
        },
      });

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
          optionType: 'call',
        },
      });

      expect(position?.avgPrice.toNumber()).toBe(7.5);
      expect(position?.costBasis.toNumber()).toBe(1500); // 2 * 7.50 * 100
    });

    it('should update strike price and create new position (different instrument key)', async () => {
      const newStrike = 110;

      await testPrisma.ledgerEvent.update({
        where: { id: optionEventId },
        data: {
          strike: newStrike,
        },
      });

      await fullRederivation(testPrisma, testUserId);

      // Old strike position should not exist
      const oldPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
          strike: { equals: 100 },
          quantity: { gt: 0 },
        },
      });
      expect(oldPosition).toBeNull();

      // New strike position should exist
      const newPosition = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
          strike: { equals: 110 },
        },
      });
      expect(newPosition).toBeDefined();
      expect(newPosition?.strike?.toNumber()).toBe(110);
    });

    it('should update expiration date', async () => {
      const newExpiration = fixedDate('2026-06-21');

      await testPrisma.ledgerEvent.update({
        where: { id: optionEventId },
        data: {
          expiration: newExpiration,
        },
      });

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'OPTIO',
        },
      });

      expect(position?.expiration?.toISOString()).toContain('2026-06-21');
    });
  });

  describe('Edit Impact on Realized Closes', () => {
    it('should recalculate P&L when editing entry price of a closed position', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create and close a trade
      const buyTx = createStockTransaction({
        symbol: 'PNLEDIT',
        transCode: 'BUY',
        quantity: 100,
        price: 100.00,
        activityDate: fixedDate('2026-04-15'),
      });

      const sellTx = createStockTransaction({
        symbol: 'PNLEDIT',
        transCode: 'SELL',
        quantity: 100,
        price: 120.00, // $2000 profit
        activityDate: fixedDate('2026-04-20'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx, sellTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify initial P&L
      let close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PNLEDIT',
        },
      });

      expect(close?.realizedPnL.toNumber()).toBe(2000);

      // Edit the buy price to be higher
      const buyEvent = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PNLEDIT',
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      await testPrisma.ledgerEvent.update({
        where: { id: buyEvent!.id },
        data: {
          price: 110.00, // Now bought at $110
          amount: -100 * 110,
        },
      });

      await fullRederivation(testPrisma, testUserId);

      // P&L should be recalculated
      close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'PNLEDIT',
        },
      });

      // New P&L = (120 - 110) * 100 = $1000
      expect(close?.realizedPnL.toNumber()).toBe(1000);
    });
  });

  describe('Soft Delete Impact', () => {
    it('should remove position when opening entry is soft deleted', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createStockTransaction({
        symbol: 'SOFTDEL',
        transCode: 'BUY',
        quantity: 100,
        price: 75.00,
        activityDate: fixedDate('2026-04-25'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      // Verify position exists
      let position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SOFTDEL',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeDefined();

      // Soft delete the event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SOFTDEL',
          deletedAt: null,
        },
      });

      await testPrisma.ledgerEvent.update({
        where: { id: event!.id },
        data: { deletedAt: new Date() },
      });

      await fullRederivation(testPrisma, testUserId);

      // Position should be gone
      position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'SOFTDEL',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull();
    });

    it('should create unknown basis close when open is deleted but close exists', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create a round trip trade
      const buyTx = createStockTransaction({
        symbol: 'UNBASIS',
        transCode: 'BUY',
        quantity: 50,
        price: 100.00,
        activityDate: fixedDate('2026-04-26'),
      });

      const sellTx = createStockTransaction({
        symbol: 'UNBASIS',
        transCode: 'SELL',
        quantity: 50,
        price: 110.00,
        activityDate: fixedDate('2026-04-28'),
      });

      await writeLedgerEvents(testPrisma, context, [buyTx, sellTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify close exists with known basis
      let close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'UNBASIS',
        },
      });
      expect(close?.hasUnknownBasis).toBe(false);
      expect(close?.realizedPnL.toNumber()).toBe(500); // (110-100)*50

      // Delete the buy event
      const buyEvent = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'UNBASIS',
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      await testPrisma.ledgerEvent.update({
        where: { id: buyEvent!.id },
        data: { deletedAt: new Date() },
      });

      await fullRederivation(testPrisma, testUserId);

      // Close should now have unknown basis
      close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'UNBASIS',
        },
      });
      expect(close?.hasUnknownBasis).toBe(true);
      expect(close?.realizedPnL.toNumber()).toBe(0); // Unknown basis = 0 P&L
    });
  });

  describe('Notes/Description Editing', () => {
    it('should update notes without affecting P&L', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createStockTransaction({
        symbol: 'NOTES',
        transCode: 'BUY',
        quantity: 100,
        price: 50.00,
        activityDate: fixedDate('2026-04-29'),
        notes: 'Initial note',
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NOTES',
          deletedAt: null,
        },
      });

      // Update only the notes
      await testPrisma.ledgerEvent.update({
        where: { id: event!.id },
        data: {
          notes: 'Updated trading thesis - bullish momentum play',
          description: 'Updated trading thesis - bullish momentum play',
        },
      });

      await fullRederivation(testPrisma, testUserId);

      // Position should remain unchanged
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NOTES',
        },
      });

      expect(position?.quantity.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(50);

      // Notes should be updated
      const updatedEvent = await testPrisma.ledgerEvent.findFirst({
        where: { id: event!.id },
      });
      expect(updatedEvent?.notes).toBe('Updated trading thesis - bullish momentum play');
    });
  });

  describe('Multiple Account Edits', () => {
    it('should only affect positions in the same account', async () => {
      // Create second account with unique externalAccountId to avoid unique constraint
      const account2 = await createTestAccount(testUserId, {
        broker: 'manual',
        name: 'Second Edit Test Account',
        externalAccountId: `edit-test-${Date.now()}`, // Unique ID to avoid constraint
        isDefault: false,
      });

      const context1: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const context2: ImportContext = {
        userId: testUserId,
        brokerageAccountId: account2.id,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create same symbol in both accounts
      const tx1 = createStockTransaction({
        symbol: 'MULTI',
        transCode: 'BUY',
        quantity: 100,
        price: 50.00,
        activityDate: fixedDate('2026-04-30'),
      });

      const tx2 = createStockTransaction({
        symbol: 'MULTI',
        transCode: 'BUY',
        quantity: 50, // Different quantity
        price: 60.00, // Different price
        activityDate: fixedDate('2026-04-30'),
      });

      await writeLedgerEvents(testPrisma, context1, [tx1]);
      await writeLedgerEvents(testPrisma, context2, [tx2]);
      await fullRederivation(testPrisma, testUserId);

      // Verify both positions exist
      const positions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          symbol: 'MULTI',
        },
      });

      expect(positions.length).toBe(2);

      // Edit first account's entry
      const event1 = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MULTI',
          brokerageAccountId: testAccountId,
          deletedAt: null,
        },
      });

      await testPrisma.ledgerEvent.update({
        where: { id: event1!.id },
        data: { price: 55.00 },
      });

      await fullRederivation(testPrisma, testUserId);

      // Verify only first account position changed
      const position1 = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MULTI',
          brokerageAccountId: testAccountId,
        },
      });

      const position2 = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MULTI',
          brokerageAccountId: account2.id,
        },
      });

      expect(position1?.avgPrice.toNumber()).toBe(55); // Changed
      expect(position2?.avgPrice.toNumber()).toBe(60); // Unchanged

      // Cleanup second account - delete in correct order to avoid FK violations
      // First get position IDs to delete their links
      const positionsToDelete = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: account2.id },
        select: { id: true },
      });
      const positionIds = positionsToDelete.map((p) => p.id);

      if (positionIds.length > 0) {
        await testPrisma.positionLedgerLink.deleteMany({
          where: { positionId: { in: positionIds } },
        });
      }

      await testPrisma.dailyAggregate.deleteMany({
        where: { brokerageAccountId: account2.id },
      });
      await testPrisma.derivedPosition.deleteMany({
        where: { brokerageAccountId: account2.id },
      });
      await testPrisma.ledgerEvent.deleteMany({
        where: { brokerageAccountId: account2.id },
      });
      await testPrisma.brokerageAccount.delete({
        where: { id: account2.id },
      });
    });
  });
});
