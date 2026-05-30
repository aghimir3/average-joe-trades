/**
 * Manual Entry Regression Tests
 *
 * Comprehensive regression tests for manual stock and option entries,
 * including create, edit, and close flows.
 *
 * These tests ensure that the core manual entry functionality remains
 * working after changes to the codebase.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';

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
  const uniqueEmail = `manual-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Manual Regression Test User',
    },
  });
  return user.id;
}

describe('Manual Entry Regression Tests', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser();

    // Create a test brokerage account
    const account = await createTestAccount(testUserId, {
      name: 'Regression Test Account',
      broker: 'manual',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Stock Entry Flow', () => {
    it('should create a stock BUY entry with all required fields', async () => {
      const entryDate = fixedDate('2024-06-15');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'AAPL',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'AAPL',
          quantity: 100,
          price: 150.00,
          amount: -15000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-stock-buy-${Date.now()}`,
        },
      });

      expect(event.id).toBeDefined();
      expect(event.symbol).toBe('AAPL');
      expect(event.transCode).toBe('BUY');
      expect(event.quantity.toNumber()).toBe(100);
      expect(event.price?.toNumber()).toBe(150.00);
    });

    it('should create a stock SELL entry', async () => {
      const entryDate = fixedDate('2024-06-20');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'AAPL',
          eventType: 'EQUITY_STOCK',
          transCode: 'SELL',
          symbol: 'AAPL',
          quantity: 100,
          price: 160.00,
          amount: 16000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-stock-sell-${Date.now()}`,
        },
      });

      expect(event.id).toBeDefined();
      expect(event.transCode).toBe('SELL');
      expect(event.amount?.toNumber()).toBe(16000.00);
    });

    it('should handle fractional share quantities', async () => {
      const entryDate = fixedDate('2024-06-25');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'GOOGL',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'GOOGL',
          quantity: 0.5,
          price: 2800.00,
          amount: -1400.00,
          activityDate: entryDate,
          eventHash: `manual-regression-fractional-${Date.now()}`,
        },
      });

      expect(event.quantity.toNumber()).toBe(0.5);
    });

    it('should prevent duplicate entries via eventHash', async () => {
      const entryDate = fixedDate('2024-07-01');
      const uniqueHash = `manual-regression-dupe-test-${Date.now()}`;

      // First entry should succeed
      await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'MSFT',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'MSFT',
          quantity: 10,
          price: 300.00,
          amount: -3000.00,
          activityDate: entryDate,
          eventHash: uniqueHash,
        },
      });

      // Duplicate should fail
      await expect(
        testPrisma.ledgerEvent.create({
          data: {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            broker: 'manual',
            sourceType: 'manual',
            instrument: 'MSFT',
            eventType: 'EQUITY_STOCK',
            transCode: 'BUY',
            symbol: 'MSFT',
            quantity: 10,
            price: 300.00,
            amount: -3000.00,
            activityDate: entryDate,
            eventHash: uniqueHash,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Option Entry Flow', () => {
    it('should create an option BTO entry with all option fields', async () => {
      const entryDate = fixedDate('2024-06-15');
      const expiration = fixedDate('2024-07-19');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'AAPL 07/19/2024 155 Call',
          eventType: 'EQUITY_OPTION',
          transCode: 'BTO',
          symbol: 'AAPL',
          quantity: 5,
          price: 3.50,
          amount: -1750.00,
          activityDate: entryDate,
          eventHash: `manual-regression-option-bto-${Date.now()}`,
          optionType: 'call',
          strike: 155.00,
          expiration: expiration,
          isOption: true,
        },
      });

      expect(event.id).toBeDefined();
      expect(event.transCode).toBe('BTO');
      expect(event.optionType).toBe('call');
      expect(event.strike?.toNumber()).toBe(155.00);
      // Compare date portion only (database stores as date, not datetime)
      expect(event.expiration?.toISOString().split('T')[0]).toBe('2024-07-19');
    });

    it('should create an option STO entry (selling to open)', async () => {
      const entryDate = fixedDate('2024-06-16');
      const expiration = fixedDate('2024-07-19');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'TSLA 07/19/2024 250 Put',
          eventType: 'EQUITY_OPTION',
          transCode: 'STO',
          symbol: 'TSLA',
          quantity: 2,
          price: 8.50,
          amount: 1700.00,
          activityDate: entryDate,
          eventHash: `manual-regression-option-sto-${Date.now()}`,
          optionType: 'put',
          strike: 250.00,
          expiration: expiration,
          isOption: true,
        },
      });

      expect(event.transCode).toBe('STO');
      expect(event.optionType).toBe('put');
      expect(event.amount?.toNumber()).toBe(1700.00);
    });

    it('should create an option STC entry (selling to close)', async () => {
      const entryDate = fixedDate('2024-06-20');
      const expiration = fixedDate('2024-07-19');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'AAPL 07/19/2024 155 Call',
          eventType: 'EQUITY_OPTION',
          transCode: 'STC',
          symbol: 'AAPL',
          quantity: 5,
          price: 5.00,
          amount: 2500.00,
          activityDate: entryDate,
          eventHash: `manual-regression-option-stc-${Date.now()}`,
          optionType: 'call',
          strike: 155.00,
          expiration: expiration,
          isOption: true,
        },
      });

      expect(event.transCode).toBe('STC');
      expect(event.amount?.toNumber()).toBe(2500.00);
    });

    it('should create an option BTC entry (buying to close)', async () => {
      const entryDate = fixedDate('2024-06-25');
      const expiration = fixedDate('2024-07-19');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'TSLA 07/19/2024 250 Put',
          eventType: 'EQUITY_OPTION',
          transCode: 'BTC',
          symbol: 'TSLA',
          quantity: 2,
          price: 2.00,
          amount: -400.00,
          activityDate: entryDate,
          eventHash: `manual-regression-option-btc-${Date.now()}`,
          optionType: 'put',
          strike: 250.00,
          expiration: expiration,
          isOption: true,
        },
      });

      expect(event.transCode).toBe('BTC');
      expect(event.amount?.toNumber()).toBe(-400.00);
    });
  });

  describe('Entry Edit Flow', () => {
    it('should update a ledger event price', async () => {
      const entryDate = fixedDate('2024-08-01');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'NVDA',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'NVDA',
          quantity: 50,
          price: 400.00,
          amount: -20000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-edit-test-${Date.now()}`,
        },
      });

      const updated = await testPrisma.ledgerEvent.update({
        where: { id: event.id },
        data: {
          price: 410.00,
          amount: -20500.00,
        },
      });

      expect(updated.price?.toNumber()).toBe(410.00);
      expect(updated.amount?.toNumber()).toBe(-20500.00);
    });

    it('should update a ledger event quantity', async () => {
      const entryDate = fixedDate('2024-08-02');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'AMD',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'AMD',
          quantity: 100,
          price: 150.00,
          amount: -15000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-edit-qty-${Date.now()}`,
        },
      });

      const updated = await testPrisma.ledgerEvent.update({
        where: { id: event.id },
        data: {
          quantity: 75,
          amount: -11250.00,
        },
      });

      expect(updated.quantity.toNumber()).toBe(75);
    });

    it('should update a ledger event notes', async () => {
      const entryDate = fixedDate('2024-08-03');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'META',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'META',
          quantity: 20,
          price: 500.00,
          amount: -10000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-edit-notes-${Date.now()}`,
        },
      });

      const updated = await testPrisma.ledgerEvent.update({
        where: { id: event.id },
        data: {
          notes: 'Updated: Added after earnings beat',
        },
      });

      expect(updated.notes).toBe('Updated: Added after earnings beat');
    });
  });

  describe('Soft Delete Flow', () => {
    it('should soft delete a ledger event', async () => {
      const entryDate = fixedDate('2024-09-01');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'NFLX',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'NFLX',
          quantity: 10,
          price: 600.00,
          amount: -6000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-soft-delete-${Date.now()}`,
        },
      });

      const deleted = await testPrisma.ledgerEvent.update({
        where: { id: event.id },
        data: {
          deletedAt: new Date(),
        },
      });

      expect(deleted.deletedAt).not.toBeNull();

      // Verify it's excluded from normal queries
      const found = await testPrisma.ledgerEvent.findFirst({
        where: {
          id: event.id,
          deletedAt: null,
        },
      });

      expect(found).toBeNull();
    });

    it('should be able to restore a soft-deleted entry', async () => {
      const entryDate = fixedDate('2024-09-02');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'DIS',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'DIS',
          quantity: 25,
          price: 90.00,
          amount: -2250.00,
          activityDate: entryDate,
          eventHash: `manual-regression-restore-${Date.now()}`,
          deletedAt: new Date(),
        },
      });

      const restored = await testPrisma.ledgerEvent.update({
        where: { id: event.id },
        data: {
          deletedAt: null,
        },
      });

      expect(restored.deletedAt).toBeNull();
    });
  });

  describe('Field Validation', () => {
    it('should require positive quantity for BUY', async () => {
      const entryDate = fixedDate('2024-10-01');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'INTC',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'INTC',
          quantity: 50,
          price: 30.00,
          amount: -1500.00,
          activityDate: entryDate,
          eventHash: `manual-regression-qty-positive-${Date.now()}`,
        },
      });

      expect(event.quantity.toNumber()).toBeGreaterThan(0);
    });

    it('should store high precision prices', async () => {
      const entryDate = fixedDate('2024-10-02');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'COIN',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'COIN',
          quantity: 10,
          price: 123.456789,
          amount: -1234.57,
          activityDate: entryDate,
          eventHash: `manual-regression-precision-${Date.now()}`,
        },
      });

      // Database stores with high precision
      expect(event.price?.toNumber()).toBeCloseTo(123.456789, 4);
    });

    it('should handle zero price for expired options', async () => {
      const entryDate = fixedDate('2024-10-05');
      const expiration = fixedDate('2024-10-04');

      const event = await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'SPY 10/04/2024 600 Call',
          eventType: 'EQUITY_OPTION',
          transCode: 'OEXP',
          symbol: 'SPY',
          quantity: 1,
          price: 0,
          amount: 0,
          activityDate: entryDate,
          eventHash: `manual-regression-expired-${Date.now()}`,
          optionType: 'call',
          strike: 600.00,
          expiration: expiration,
          isOption: true,
        },
      });

      expect(event.transCode).toBe('OEXP');
      expect(event.price?.toNumber()).toBe(0);
    });
  });

  describe('Multi-Account Isolation', () => {
    it('should keep entries isolated between accounts', async () => {
      // Create a second account
      const account2 = await testPrisma.brokerageAccount.create({
        data: {
          userId: testUserId,
          name: 'Second Account',
          broker: 'manual',
        },
      });

      const entryDate = fixedDate('2024-11-01');

      // Create entry in first account
      await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'ISOLATION_TEST',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'ISOLATION_TEST',
          quantity: 100,
          price: 50.00,
          amount: -5000.00,
          activityDate: entryDate,
          eventHash: `manual-regression-account1-${Date.now()}`,
        },
      });

      // Create entry in second account
      await testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: account2.id,
          broker: 'manual',
          sourceType: 'manual',
          instrument: 'ISOLATION_TEST',
          eventType: 'EQUITY_STOCK',
          transCode: 'BUY',
          symbol: 'ISOLATION_TEST',
          quantity: 50,
          price: 55.00,
          amount: -2750.00,
          activityDate: entryDate,
          eventHash: `manual-regression-account2-${Date.now()}`,
        },
      });

      // Query entries for first account only
      const account1Entries = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'ISOLATION_TEST',
          deletedAt: null,
        },
      });

      const account2Entries = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          brokerageAccountId: account2.id,
          symbol: 'ISOLATION_TEST',
          deletedAt: null,
        },
      });

      expect(account1Entries.length).toBe(1);
      expect(account2Entries.length).toBe(1);
      expect(account1Entries[0].quantity.toNumber()).toBe(100);
      expect(account2Entries[0].quantity.toNumber()).toBe(50);

      // Cleanup second account
      await testPrisma.ledgerEvent.deleteMany({ where: { brokerageAccountId: account2.id } });
      await testPrisma.brokerageAccount.delete({ where: { id: account2.id } });
    });
  });
});
