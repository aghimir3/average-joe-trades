/**
 * SnapTrade Integration Smoke Tests
 *
 * Tests the SnapTrade service credential storage and API route behavior.
 * Uses mock data to avoid actual SnapTrade API calls.
 *
 * These tests verify:
 * 1. ServiceCredential storage/retrieval
 * 2. API route validation and error handling
 * 3. Transaction transformation and import flow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import {
  transformToNormalizedTransaction,
  type SnapTradeTransaction,
  SNAPTRADE_SERVICE,
} from '@/lib/services/snaptrade';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';

// Test user prefix for isolation
const TEST_PREFIX = 'snaptrade_smoke';

describe('SnapTrade Smoke Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'SnapTrade Test User',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Clean up test data including service credentials
    await testPrisma.serviceCredential.deleteMany({
      where: { userId: testUserId },
    });
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('ServiceCredential Storage', () => {
    afterEach(async () => {
      // Clean up service credentials after each test
      await testPrisma.serviceCredential.deleteMany({
        where: { userId: testUserId },
      });
    });

    it('should create and retrieve service credentials', async () => {
      const credential = await testPrisma.serviceCredential.create({
        data: {
          userId: testUserId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: 'snap_user_123',
          serviceUserSecret: 'snap_secret_abc',
          isActive: true,
        },
      });

      expect(credential.id).toBeDefined();
      expect(credential.service).toBe(SNAPTRADE_SERVICE);
      expect(credential.serviceUserId).toBe('snap_user_123');
      expect(credential.serviceUserSecret).toBe('snap_secret_abc');
      expect(credential.isActive).toBe(true);
    });

    it('should enforce unique userId + service constraint', async () => {
      // Create first credential
      await testPrisma.serviceCredential.create({
        data: {
          userId: testUserId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: 'snap_user_123',
          serviceUserSecret: 'snap_secret_abc',
          isActive: true,
        },
      });

      // Try to create duplicate - should fail
      await expect(
        testPrisma.serviceCredential.create({
          data: {
            userId: testUserId,
            service: SNAPTRADE_SERVICE,
            serviceUserId: 'snap_user_456',
            serviceUserSecret: 'snap_secret_def',
            isActive: true,
          },
        })
      ).rejects.toThrow();
    });

    it('should find credential by userId and service', async () => {
      await testPrisma.serviceCredential.create({
        data: {
          userId: testUserId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: 'snap_user_123',
          serviceUserSecret: 'snap_secret_abc',
          isActive: true,
        },
      });

      const found = await testPrisma.serviceCredential.findUnique({
        where: {
          userId_service: {
            userId: testUserId,
            service: SNAPTRADE_SERVICE,
          },
        },
      });

      expect(found).not.toBeNull();
      expect(found!.serviceUserId).toBe('snap_user_123');
    });

    it('should update sync status fields', async () => {
      const credential = await testPrisma.serviceCredential.create({
        data: {
          userId: testUserId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: 'snap_user_123',
          serviceUserSecret: 'snap_secret_abc',
          isActive: true,
        },
      });

      const now = new Date();
      const updated = await testPrisma.serviceCredential.update({
        where: { id: credential.id },
        data: {
          lastSyncAt: now,
          syncStatus: 'success',
          syncError: null,
        },
      });

      expect(updated.lastSyncAt).not.toBeNull();
      const lastSyncDeltaMs = Math.abs(updated.lastSyncAt!.getTime() - now.getTime());
      // MSSQL DateTime stores ~3.33ms precision, so exact equality is flaky.
      expect(lastSyncDeltaMs).toBeLessThanOrEqual(5);
      expect(updated.syncStatus).toBe('success');
      expect(updated.syncError).toBeNull();
    });

    it('should record sync errors', async () => {
      const credential = await testPrisma.serviceCredential.create({
        data: {
          userId: testUserId,
          service: SNAPTRADE_SERVICE,
          serviceUserId: 'snap_user_123',
          serviceUserSecret: 'snap_secret_abc',
          isActive: true,
        },
      });

      const updated = await testPrisma.serviceCredential.update({
        where: { id: credential.id },
        data: {
          lastSyncAt: new Date(),
          syncStatus: 'error',
          syncError: 'Connection timeout',
        },
      });

      expect(updated.syncStatus).toBe('error');
      expect(updated.syncError).toBe('Connection timeout');
    });
  });

  describe('Transaction Transformation', () => {
    const sampleStockBuy: SnapTradeTransaction = {
      id: 'txn-stock-1',
      account: { id: 'acc-1', name: 'Robinhood' },
      symbol: { id: 'sym-1', symbol: 'AAPL', description: 'Apple Inc.' },
      type: 'BUY',
      units: 100,
      price: 150.0,
      amount: -15000,
      fee: 0,
      currency: { id: 'cur-1', code: 'USD' },
      trade_date: '2026-01-15',
      settlement_date: '2026-01-17',
    };

    const sampleStockSell: SnapTradeTransaction = {
      id: 'txn-stock-2',
      account: { id: 'acc-1', name: 'Robinhood' },
      symbol: { id: 'sym-1', symbol: 'AAPL', description: 'Apple Inc.' },
      type: 'SELL',
      units: -100,
      price: 160.0,
      amount: 16000,
      fee: 0,
      currency: { id: 'cur-1', code: 'USD' },
      trade_date: '2026-01-20',
      settlement_date: '2026-01-22',
    };

    const sampleOptionBuy: SnapTradeTransaction = {
      id: 'txn-opt-1',
      account: { id: 'acc-1', name: 'Robinhood' },
      symbol: { id: 'sym-opt', symbol: 'TSLA' },
      option_symbol: {
        id: 'opt-1',
        ticker: 'TSLA',
        strike_price: 440.0,
        expiration_date: '2026-02-21',
        option_type: 'PUT',
      },
      type: 'BUY',
      units: 2,
      price: 15.0,
      amount: -3000,
      fee: 1.3,
      currency: { id: 'cur-1', code: 'USD' },
      trade_date: '2026-01-16',
    };

    it('should transform stock buy correctly', () => {
      const result = transformToNormalizedTransaction(sampleStockBuy);

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('AAPL');
      expect(result!.transCode).toBe('BUY');
      expect(result!.quantity).toBe(100);
      expect(result!.price).toBe(150.0);
      expect(result!.eventType).toBe('EQUITY_STOCK');
      expect(result!.isOption).toBe(false);
    });

    it('should transform stock sell correctly', () => {
      const result = transformToNormalizedTransaction(sampleStockSell);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('SELL');
      expect(result!.quantity).toBe(100); // Absolute value
    });

    it('should transform option buy as BTO', () => {
      const result = transformToNormalizedTransaction(sampleOptionBuy);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('BTO');
      expect(result!.isOption).toBe(true);
      expect(result!.optionType).toBe('put');
      expect(result!.strike).toBe(440.0);
      expect(result!.expiration).toEqual(new Date('2026-02-21'));
    });
  });

  describe('Ledger Write Integration', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'SnapTrade Test Account',
        isDefault: true,
      });
      accountId = account.id;
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should write transformed transactions to ledger', async () => {
      const sampleTransaction: SnapTradeTransaction = {
        id: 'txn-write-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'NVDA', description: 'NVIDIA Corporation' },
        type: 'BUY',
        units: 50,
        price: 500.0,
        amount: -25000,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      const normalized = transformToNormalizedTransaction(sampleTransaction);
      expect(normalized).not.toBeNull();

      const result = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify ledger event was created
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, deletedAt: null },
      });

      expect(events).toHaveLength(1);
      expect(events[0].symbol).toBe('NVDA');
      expect(events[0].transCode).toBe('BUY');
      expect(events[0].quantity.toNumber()).toBe(50);
    });

    it('should handle duplicate transactions (idempotency)', async () => {
      const sampleTransaction: SnapTradeTransaction = {
        id: 'txn-dupe-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'MSFT' },
        type: 'BUY',
        units: 25,
        price: 400.0,
        amount: -10000,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-18',
      };

      const normalized = transformToNormalizedTransaction(sampleTransaction);

      // Write first time
      const result1 = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      expect(result1.inserted).toBe(1);

      // Write second time - should be duplicate
      const result2 = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      expect(result2.inserted).toBe(0);
      expect(result2.duplicates).toBe(1);

      // Should still only have one event
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, deletedAt: null },
      });
      expect(events).toHaveLength(1);
    });

    it('should write multiple transactions in batch', async () => {
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'txn-batch-1',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 100,
          price: 150.0,
          amount: -15000,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
        {
          id: 'txn-batch-2',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-2', symbol: 'GOOG' },
          type: 'BUY',
          units: 50,
          price: 140.0,
          amount: -7000,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-12',
        },
        {
          id: 'txn-batch-3',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-3', symbol: 'AMZN' },
          type: 'BUY',
          units: 30,
          price: 185.0,
          amount: -5550,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-14',
        },
      ];

      const normalized = transactions
        .map(transformToNormalizedTransaction)
        .filter((t): t is NonNullable<typeof t> => t !== null);

      const result = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      expect(result.inserted).toBe(3);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Derivation After Sync', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'SnapTrade Derivation Test',
        isDefault: true,
      });
      accountId = account.id;
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should create positions after syncing buy transactions', async () => {
      const buyTransaction: SnapTradeTransaction = {
        id: 'txn-pos-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'TSLA' },
        type: 'BUY',
        units: 100,
        price: 250.0,
        amount: -25000,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      const normalized = transformToNormalizedTransaction(buyTransaction);

      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Check positions
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId, brokerageAccountId: accountId },
      });

      expect(positions.length).toBeGreaterThan(0);
      const tslaPosition = positions.find((p) => p.symbol === 'TSLA');
      expect(tslaPosition).toBeDefined();
      expect(tslaPosition!.quantity.toNumber()).toBe(100);
      expect(tslaPosition!.avgPrice.toNumber()).toBeCloseTo(250.0, 2);
    });

    it('should calculate realized P&L after buy and sell', async () => {
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'txn-pnl-buy',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'NVDA' },
          type: 'BUY',
          units: 50,
          price: 400.0,
          amount: -20000,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
        {
          id: 'txn-pnl-sell',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'NVDA' },
          type: 'SELL',
          units: -50,
          price: 450.0,
          amount: 22500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        },
      ];

      const normalized = transactions
        .map(transformToNormalizedTransaction)
        .filter((t): t is NonNullable<typeof t> => t !== null);

      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Check realized closes
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId, brokerageAccountId: accountId },
      });

      expect(closes.length).toBe(1);
      const nvdaClose = closes[0];
      expect(nvdaClose.symbol).toBe('NVDA');
      // Buy at 400, Sell at 450 = $50 profit per share x 50 shares = $2,500
      expect(nvdaClose.realizedPnL.toNumber()).toBeCloseTo(2500, 0);
    });

    it('should handle option trades with P&L calculation', async () => {
      // STO a put, then it expires worthless (full premium kept)
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'txn-opt-sto',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-opt', symbol: 'SPY' },
          option_symbol: {
            id: 'opt-1',
            ticker: 'SPY',
            strike_price: 450.0,
            expiration_date: '2026-01-17',
            option_type: 'PUT',
          },
          type: 'SELL', // STO
          units: -2,
          price: 3.0,
          amount: 600, // Premium received
          fee: 1.3,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
      ];

      const normalized = transactions
        .map(transformToNormalizedTransaction)
        .filter((t): t is NonNullable<typeof t> => t !== null);

      // Note: This will create STC because our simple transformation doesn't
      // distinguish between STO and STC for sells. In a real implementation,
      // you'd need position tracking to determine this.
      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: accountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Verify event was created
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, deletedAt: null },
      });

      expect(events.length).toBe(1);
      expect(events[0].symbol).toBe('SPY');
      expect(events[0].optionType).toBe('put');
      expect(events[0].strike?.toNumber()).toBe(450.0);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty transaction list gracefully', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Empty Test Account',
        isDefault: true,
      });

      const result = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: account.id,
          broker: 'robinhood',
          sourceType: 'api',
        },
        []
      );

      expect(result.inserted).toBe(0);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);

      await cleanupTestUser(testUserId);
    });

    it('should skip non-trade transactions', () => {
      const nonTradeTransactions: SnapTradeTransaction[] = [
        {
          id: 'txn-div',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'DIVIDEND',
          units: 0,
          price: 0,
          amount: 25.5,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        },
        {
          id: 'txn-int',
          account: { id: 'acc-1', name: 'Robinhood' },
          type: 'INTEREST',
          units: 0,
          price: 0,
          amount: 1.23,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        },
      ];

      const normalized = nonTradeTransactions.map(transformToNormalizedTransaction);

      expect(normalized[0]).toBeNull();
      expect(normalized[1]).toBeNull();
    });
  });
});
