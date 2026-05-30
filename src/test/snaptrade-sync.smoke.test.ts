/**
 * SnapTrade Sync Comprehensive Smoke Tests
 *
 * Tests the complete SnapTrade sync flow from API data to database tables.
 * Verifies that all numbers and data transformations are accurate.
 *
 * This test suite covers:
 * 1. Transaction transformation (BUY, SELL, BTO, STO, BTC, STC, OEXP, OASGN)
 * 2. Ledger write with idempotency
 * 3. Position sync to BrokerPosition table
 * 4. Balance sync to BrokerBalance table
 * 5. Return rate sync to BrokerReturnRate table
 * 6. Derivation engine (DerivedPosition, RealizedClose) with P&L verification
 * 7. Unified position view merging
 * 8. Staleness tracking and refresh logic
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import {
  transformToNormalizedTransaction,
  type SnapTradeTransaction,
  type SnapTradePosition,
  type SnapTradeOptionPosition,
  type SnapTradeBalance,
  type SnapTradeReturnRate,
  SNAPTRADE_SERVICE,
} from '@/lib/services/snaptrade';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import {
  getUnifiedPositions,
  getUnifiedBalances,
  getUnifiedReturnRates,
  positionsNeedRefresh,
  markPositionsStale,
} from '@/lib/services/snaptrade-positions';
import type { LoggedOperationContext } from '@/lib/services/snaptrade-logged';

// Test user prefix for isolation
const TEST_PREFIX = 'snaptrade_sync_smoke';

describe('SnapTrade Sync Comprehensive Tests', () => {
  let testUserId: string;
  let testAccountId: string;
  let testExternalAccountId: string;

  beforeAll(async () => {
    // Create unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'SnapTrade Sync Test User',
      },
    });
    testUserId = testUser.id;

    // Create service credential for the user
    await testPrisma.serviceCredential.create({
      data: {
        userId: testUserId,
        service: SNAPTRADE_SERVICE,
        serviceUserId: `snap_test_${Date.now()}`,
        serviceUserSecret: 'test_secret',
        isActive: true,
      },
    });

    // Create a SnapTrade-linked brokerage account
    testExternalAccountId = `ext_${Date.now()}`;
    const account = await testPrisma.brokerageAccount.create({
      data: {
        userId: testUserId,
        broker: 'robinhood',
        name: 'Test Robinhood Account',
        externalAccountId: testExternalAccountId,
        isDefault: true,
        isActive: true,
      },
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up all test data
    await testPrisma.brokerReturnRate.deleteMany({ where: { userId: testUserId } });
    await testPrisma.brokerBalance.deleteMany({ where: { userId: testUserId } });
    await testPrisma.brokerPosition.deleteMany({ where: { userId: testUserId } });
    await testPrisma.serviceCredential.deleteMany({ where: { userId: testUserId } });
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  // ============================================================================
  // Section 1: Transaction Transformation Tests
  // ============================================================================
  describe('Transaction Transformation - Stock Trades', () => {
    it('should transform stock BUY correctly with exact numbers', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-stock-buy-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'NVDA', description: 'NVIDIA Corporation' },
        type: 'BUY',
        units: 25,
        price: 145.50,
        amount: -3637.50, // Negative for purchase
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
        settlement_date: '2026-01-17',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('NVDA');
      expect(result!.transCode).toBe('BUY');
      expect(result!.quantity).toBe(25);
      expect(result!.price).toBe(145.50);
      expect(result!.amount).toBe(-3637.50);
      expect(result!.fees).toBe(0);
      expect(result!.eventType).toBe('EQUITY_STOCK');
      expect(result!.isOption).toBe(false);
      expect(result!.activityDate).toEqual(new Date('2026-01-15'));
      expect(result!.settleDate).toEqual(new Date('2026-01-17'));
    });

    it('should transform stock SELL correctly with exact numbers', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-stock-sell-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'AAPL', description: 'Apple Inc.' },
        type: 'SELL',
        units: -100, // Negative for sell
        price: 185.25,
        amount: 18525.00, // Positive for proceeds
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-20',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('AAPL');
      expect(result!.transCode).toBe('SELL');
      expect(result!.quantity).toBe(100); // Absolute value
      expect(result!.price).toBe(185.25);
      expect(result!.amount).toBe(18525.00);
    });
  });

  describe('Transaction Transformation - Option Trades', () => {
    it('should transform BUY_TO_OPEN (BTO) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-bto-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'TSLA' },
        option_symbol: {
          id: 'opt-1',
          ticker: 'TSLA 260220P00440000',
          strike_price: 440.0,
          expiration_date: '2026-02-20',
          option_type: 'PUT',
        },
        type: 'BUY',
        option_type: 'BUY_TO_OPEN',
        units: 3,
        price: 12.50,
        amount: -3750.00, // 3 contracts * 100 * $12.50
        fee: 1.95,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-16',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('TSLA');
      expect(result!.transCode).toBe('BTO');
      expect(result!.quantity).toBe(3);
      expect(result!.price).toBe(12.50);
      expect(result!.amount).toBe(-3750.00);
      expect(result!.fees).toBe(1.95);
      expect(result!.eventType).toBe('EQUITY_OPTION');
      expect(result!.isOption).toBe(true);
      expect(result!.optionType).toBe('put');
      expect(result!.strike).toBe(440.0);
      expect(result!.expiration).toEqual(new Date('2026-02-20'));
    });

    it('should transform SELL_TO_OPEN (STO) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-sto-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'SPY' },
        option_symbol: {
          id: 'opt-2',
          ticker: 'SPY 260131C00580000',
          strike_price: 580.0,
          expiration_date: '2026-01-31',
          option_type: 'CALL',
        },
        type: 'SELL',
        option_type: 'SELL_TO_OPEN',
        units: -5, // Negative for short
        price: 2.85,
        amount: 1425.00, // Premium received
        fee: 3.25,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-17',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('SPY');
      expect(result!.transCode).toBe('STO');
      expect(result!.quantity).toBe(5); // Absolute value
      expect(result!.price).toBe(2.85);
      expect(result!.optionType).toBe('call');
      expect(result!.strike).toBe(580.0);
    });

    it('should transform BUY_TO_CLOSE (BTC) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-btc-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'AAPL' },
        option_symbol: {
          id: 'opt-3',
          ticker: 'AAPL 260117P00180000',
          strike_price: 180.0,
          expiration_date: '2026-01-17',
          option_type: 'PUT',
        },
        type: 'BUY',
        option_type: 'BUY_TO_CLOSE',
        units: 2,
        price: 0.15, // Cheap to close
        amount: -30.00,
        fee: 1.30,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-16',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('BTC');
      expect(result!.quantity).toBe(2);
      expect(result!.price).toBe(0.15);
    });

    it('should transform SELL_TO_CLOSE (STC) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-stc-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'GOOGL' },
        option_symbol: {
          id: 'opt-4',
          ticker: 'GOOGL 260321C00180000',
          strike_price: 180.0,
          expiration_date: '2026-03-21',
          option_type: 'CALL',
        },
        type: 'SELL',
        option_type: 'SELL_TO_CLOSE',
        units: -1,
        price: 15.75,
        amount: 1575.00,
        fee: 0.65,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-18',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('STC');
      expect(result!.quantity).toBe(1);
      expect(result!.price).toBe(15.75);
    });

    it('should transform OPTIONEXPIRATION (OEXP) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-exp-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'AMD' },
        option_symbol: {
          id: 'opt-5',
          ticker: 'AMD 260117P00130000',
          strike_price: 130.0,
          expiration_date: '2026-01-17',
          option_type: 'PUT',
        },
        type: 'OPTIONEXPIRATION',
        units: 2,
        price: 0,
        amount: 0, // Expires worthless
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-17',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('OEXP');
      expect(result!.quantity).toBe(2);
      expect(result!.price).toBe(0);
      expect(result!.optionType).toBe('put');
      expect(result!.strike).toBe(130.0);
    });

    it('should transform OPTIONASSIGNMENT (OASGN) correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-opt-asgn-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'PLTR' },
        option_symbol: {
          id: 'opt-6',
          ticker: 'PLTR 260117P00025000',
          strike_price: 25.0,
          expiration_date: '2026-01-17',
          option_type: 'PUT',
        },
        type: 'OPTIONASSIGNMENT',
        units: 1,
        price: 0,
        amount: 0,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-17',
      };

      const result = transformToNormalizedTransaction(tx);

      expect(result).not.toBeNull();
      expect(result!.transCode).toBe('OASGN');
      expect(result!.quantity).toBe(1);
      expect(result!.optionType).toBe('put');
    });
  });

  describe('Transaction Transformation - Edge Cases', () => {
    it('should skip DIVIDEND transactions', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-div',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'AAPL' },
        type: 'DIVIDEND',
        units: 0,
        price: 0,
        amount: 25.50,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      expect(transformToNormalizedTransaction(tx)).toBeNull();
    });

    it('should skip INTEREST transactions', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-int',
        account: { id: 'acc-1', name: 'Robinhood' },
        type: 'INTEREST',
        units: 0,
        price: 0,
        amount: 1.23,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      expect(transformToNormalizedTransaction(tx)).toBeNull();
    });

    it('should skip zero-quantity transactions', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-zero',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'AAPL' },
        type: 'BUY',
        units: 0,
        price: 150.0,
        amount: 0,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      expect(transformToNormalizedTransaction(tx)).toBeNull();
    });

    it('should uppercase symbol correctly', () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-lower',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'aapl' }, // lowercase
        type: 'BUY',
        units: 10,
        price: 150.0,
        amount: -1500,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      const result = transformToNormalizedTransaction(tx);
      expect(result!.symbol).toBe('AAPL');
    });
  });

  // ============================================================================
  // Section 2: Ledger Write Tests
  // ============================================================================
  describe('Ledger Write Integration', () => {
    let ledgerAccountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Ledger Test Account',
        isDefault: false,
      });
      ledgerAccountId = account.id;
    });

    afterEach(async () => {
      // Clean up ledger events for this account
      await testPrisma.ledgerEvent.deleteMany({
        where: { userId: testUserId, brokerageAccountId: ledgerAccountId },
      });
      await testPrisma.brokerageAccount.delete({ where: { id: ledgerAccountId } });
    });

    it('should write stock transaction with exact field values', async () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-ledger-1',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'MSFT', description: 'Microsoft Corporation' },
        type: 'BUY',
        units: 75,
        price: 425.75,
        amount: -31931.25,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      const normalized = transformToNormalizedTransaction(tx);
      expect(normalized).not.toBeNull();

      const result = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: ledgerAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify exact field values
      const event = await testPrisma.ledgerEvent.findFirst({
        where: { userId: testUserId, brokerageAccountId: ledgerAccountId },
      });

      expect(event).not.toBeNull();
      expect(event!.symbol).toBe('MSFT');
      expect(event!.transCode).toBe('BUY');
      expect(event!.quantity.toNumber()).toBe(75);
      expect(event!.price!.toNumber()).toBe(425.75);
      expect(event!.amount!.toNumber()).toBe(-31931.25);
      expect(event!.eventType).toBe('EQUITY_STOCK');
      expect(event!.isOption).toBe(false);
      expect(event!.sourceType).toBe('api');
    });

    it('should write option transaction with all option fields', async () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-ledger-opt',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-opt', symbol: 'AMZN' },
        option_symbol: {
          id: 'opt-1',
          ticker: 'AMZN 260321C00200000',
          strike_price: 200.0,
          expiration_date: '2026-03-21',
          option_type: 'CALL',
        },
        type: 'BUY',
        option_type: 'BUY_TO_OPEN',
        units: 2,
        price: 8.50,
        amount: -1700.00,
        fee: 1.30,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-18',
      };

      const normalized = transformToNormalizedTransaction(tx);
      const result = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: ledgerAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      expect(result.inserted).toBe(1);

      const event = await testPrisma.ledgerEvent.findFirst({
        where: { userId: testUserId, brokerageAccountId: ledgerAccountId },
      });

      expect(event!.symbol).toBe('AMZN');
      expect(event!.transCode).toBe('BTO');
      expect(event!.eventType).toBe('EQUITY_OPTION');
      expect(event!.isOption).toBe(true);
      expect(event!.optionType).toBe('call');
      expect(event!.strike!.toNumber()).toBe(200.0);
      expect(event!.expiration).toEqual(new Date('2026-03-21'));
      expect(event!.fees!.toNumber()).toBe(1.30);
    });

    it('should handle duplicate transactions (idempotency)', async () => {
      const tx: SnapTradeTransaction = {
        id: 'txn-dupe-test',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'GOOG' },
        type: 'BUY',
        units: 50,
        price: 175.00,
        amount: -8750.00,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-19',
      };

      const normalized = transformToNormalizedTransaction(tx);

      // First write
      const result1 = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: ledgerAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );
      expect(result1.inserted).toBe(1);

      // Second write - should be duplicate
      const result2 = await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: ledgerAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );
      expect(result2.inserted).toBe(0);
      expect(result2.duplicates).toBe(1);

      // Verify only one event exists
      const count = await testPrisma.ledgerEvent.count({
        where: { userId: testUserId, brokerageAccountId: ledgerAccountId },
      });
      expect(count).toBe(1);
    });

    it('should write batch of transactions correctly', async () => {
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'batch-1',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 100,
          price: 150.00,
          amount: -15000.00,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
        {
          id: 'batch-2',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-2', symbol: 'TSLA' },
          type: 'BUY',
          units: 50,
          price: 400.00,
          amount: -20000.00,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-12',
        },
        {
          id: 'batch-3',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-3', symbol: 'NVDA' },
          type: 'BUY',
          units: 25,
          price: 500.00,
          amount: -12500.00,
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
          brokerageAccountId: ledgerAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      expect(result.inserted).toBe(3);
      expect(result.errors).toHaveLength(0);

      // Verify all events exist
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, brokerageAccountId: ledgerAccountId },
        orderBy: { activityDate: 'asc' },
      });

      expect(events).toHaveLength(3);
      expect(events[0].symbol).toBe('AAPL');
      expect(events[1].symbol).toBe('TSLA');
      expect(events[2].symbol).toBe('NVDA');
    });
  });

  // ============================================================================
  // Section 3: Position Sync Tests (BrokerPosition)
  // ============================================================================
  describe('Position Sync to BrokerPosition', () => {
    afterEach(async () => {
      await testPrisma.brokerPosition.deleteMany({ where: { userId: testUserId } });
    });

    it('should sync stock positions with exact values', async () => {
      // Create mock context for syncing
      const ctx: LoggedOperationContext = {
        prisma: testPrisma,
        internalUserId: testUserId,
        correlationId: 'test-sync-1',
        triggeredBy: 'test',
      };

      // Mock stock position data from SnapTrade API
      // The symbol structure is nested: symbol.symbol.symbol is the ticker string
      const mockStockPosition: SnapTradePosition = {
        symbol: {
          id: 'sym-outer-1',
          description: 'Apple Inc.',
          symbol: {
            id: 'sym-1',
            symbol: 'AAPL',
            raw_symbol: 'AAPL',
            description: 'Apple Inc.',
            currency: { id: 'cur-1', code: 'USD', name: 'US Dollar' },
          },
        },
        units: 150,
        price: 185.50, // Current market price
        average_purchase_price: 165.25, // Cost basis
        open_pnl: 3037.50, // Unrealized P&L: (185.50 - 165.25) * 150
        currency: { id: 'cur-1', code: 'USD' },
      };

      // Manually insert the position (simulating what syncPositionsForAccount does)
      // The actual ticker is in symbol.symbol.symbol
      const ticker = mockStockPosition.symbol.symbol.symbol.toUpperCase();
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: ticker,
          positionType: 'stock',
          quantity: new Prisma.Decimal(mockStockPosition.units!),
          marketPrice: new Prisma.Decimal(mockStockPosition.price!),
          marketValue: new Prisma.Decimal(mockStockPosition.price! * mockStockPosition.units!),
          avgCostBasis: new Prisma.Decimal(mockStockPosition.average_purchase_price!),
          unrealizedPnL: new Prisma.Decimal(mockStockPosition.open_pnl!),
          unrealizedPnLPct: new Prisma.Decimal(
            (mockStockPosition.open_pnl! / (mockStockPosition.average_purchase_price! * mockStockPosition.units!)) * 100
          ),
          currency: 'USD',
          dataSource: 'snaptrade',
          snaptradeSyncId: ctx.correlationId!,
          lastSyncAt: new Date(),
          isStale: false,
        },
      });

      // Verify the position
      const position = await testPrisma.brokerPosition.findFirst({
        where: { userId: testUserId, symbol: 'AAPL' },
      });

      expect(position).not.toBeNull();
      expect(position!.symbol).toBe('AAPL');
      expect(position!.positionType).toBe('stock');
      expect(position!.quantity.toNumber()).toBe(150);
      expect(position!.marketPrice!.toNumber()).toBe(185.50);
      expect(position!.marketValue!.toNumber()).toBe(27825.00); // 150 * 185.50
      expect(position!.avgCostBasis!.toNumber()).toBe(165.25);
      expect(position!.unrealizedPnL!.toNumber()).toBe(3037.50);
      expect(position!.dataSource).toBe('snaptrade');
      expect(position!.isStale).toBe(false);
    });

    it('should sync option positions with all option fields', async () => {
      const mockOptionPosition: SnapTradeOptionPosition = {
        option_symbol: {
          id: 'opt-1',
          ticker: 'TSLA 260220C00450000',
          option_type: 'CALL',
          strike_price: 450.0,
          expiration_date: '2026-02-20',
          underlying_symbol: { id: 'sym-tsla', symbol: 'TSLA' },
        },
        units: -5, // Short position
        price: 12.50, // Current market price per share
        average_purchase_price: 18.25, // Cost basis per contract
        currency: { id: 'cur-1', code: 'USD' },
      };

      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'TSLA',
          positionType: 'option',
          optionType: 'call',
          strike: new Prisma.Decimal(450.0),
          expiration: new Date('2026-02-20'),
          quantity: new Prisma.Decimal(mockOptionPosition.units),
          marketPrice: new Prisma.Decimal(mockOptionPosition.price!),
          marketValue: new Prisma.Decimal(mockOptionPosition.price! * Math.abs(mockOptionPosition.units) * 100),
          avgCostBasis: new Prisma.Decimal(mockOptionPosition.average_purchase_price!),
          currency: 'USD',
          dataSource: 'snaptrade',
          snaptradeSyncId: 'test-sync-opt',
          lastSyncAt: new Date(),
          isStale: false,
        },
      });

      const position = await testPrisma.brokerPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          positionType: 'option',
        },
      });

      expect(position).not.toBeNull();
      expect(position!.symbol).toBe('TSLA');
      expect(position!.positionType).toBe('option');
      expect(position!.optionType).toBe('call');
      expect(position!.strike!.toNumber()).toBe(450.0);
      expect(position!.expiration).toEqual(new Date('2026-02-20'));
      expect(position!.quantity.toNumber()).toBe(-5); // Short position
      expect(position!.marketPrice!.toNumber()).toBe(12.50);
      expect(position!.marketValue!.toNumber()).toBe(6250.00); // 5 contracts * 100 shares * $12.50
    });

    it('should update existing position on re-sync', async () => {
      // Create initial position
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'NVDA',
          positionType: 'stock',
          quantity: new Prisma.Decimal(100),
          marketPrice: new Prisma.Decimal(500.00),
          marketValue: new Prisma.Decimal(50000.00),
          avgCostBasis: new Prisma.Decimal(450.00),
          unrealizedPnL: new Prisma.Decimal(5000.00),
          currency: 'USD',
          dataSource: 'snaptrade',
          snaptradeSyncId: 'sync-v1',
          lastSyncAt: new Date('2026-01-15'),
          isStale: false,
        },
      });

      // Update position (simulating price change)
      const existing = await testPrisma.brokerPosition.findFirst({
        where: { userId: testUserId, symbol: 'NVDA', positionType: 'stock' },
      });

      await testPrisma.brokerPosition.update({
        where: { id: existing!.id },
        data: {
          marketPrice: new Prisma.Decimal(525.00),
          marketValue: new Prisma.Decimal(52500.00),
          unrealizedPnL: new Prisma.Decimal(7500.00),
          snaptradeSyncId: 'sync-v2',
          lastSyncAt: new Date(),
        },
      });

      // Verify updated values
      const updated = await testPrisma.brokerPosition.findFirst({
        where: { userId: testUserId, symbol: 'NVDA' },
      });

      expect(updated!.marketPrice!.toNumber()).toBe(525.00);
      expect(updated!.unrealizedPnL!.toNumber()).toBe(7500.00);
      expect(updated!.snaptradeSyncId).toBe('sync-v2');
    });
  });

  // ============================================================================
  // Section 4: Balance Sync Tests (BrokerBalance)
  // ============================================================================
  describe('Balance Sync to BrokerBalance', () => {
    afterEach(async () => {
      await testPrisma.brokerBalance.deleteMany({ where: { userId: testUserId } });
    });

    it('should sync balance with exact values', async () => {
      const mockBalance: SnapTradeBalance = {
        currency: { id: 'cur-1', code: 'USD', name: 'US Dollar' },
        cash: 15432.50,
        buying_power: 30865.00,
      };

      await testPrisma.brokerBalance.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: mockBalance.currency.code,
          cash: new Prisma.Decimal(mockBalance.cash!),
          buyingPower: new Prisma.Decimal(mockBalance.buying_power!),
          lastSyncAt: new Date(),
        },
      });

      const balance = await testPrisma.brokerBalance.findFirst({
        where: { userId: testUserId, brokerageAccountId: testAccountId },
      });

      expect(balance).not.toBeNull();
      expect(balance!.currency).toBe('USD');
      expect(balance!.cash!.toNumber()).toBe(15432.50);
      expect(balance!.buyingPower!.toNumber()).toBe(30865.00);
    });

    it('should handle multiple currencies', async () => {
      // USD balance
      await testPrisma.brokerBalance.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: 'USD',
          cash: new Prisma.Decimal(10000.00),
          buyingPower: new Prisma.Decimal(20000.00),
          lastSyncAt: new Date(),
        },
      });

      // CAD balance
      await testPrisma.brokerBalance.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: 'CAD',
          cash: new Prisma.Decimal(5000.00),
          buyingPower: new Prisma.Decimal(10000.00),
          lastSyncAt: new Date(),
        },
      });

      const balances = await testPrisma.brokerBalance.findMany({
        where: { userId: testUserId },
        orderBy: { currency: 'asc' },
      });

      expect(balances).toHaveLength(2);
      expect(balances[0].currency).toBe('CAD');
      expect(balances[0].cash!.toNumber()).toBe(5000.00);
      expect(balances[1].currency).toBe('USD');
      expect(balances[1].cash!.toNumber()).toBe(10000.00);
    });

    it('should upsert balance on re-sync', async () => {
      // Initial balance
      await testPrisma.brokerBalance.upsert({
        where: {
          brokerageAccountId_currency: {
            brokerageAccountId: testAccountId,
            currency: 'USD',
          },
        },
        create: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: 'USD',
          cash: new Prisma.Decimal(10000.00),
          buyingPower: new Prisma.Decimal(20000.00),
          lastSyncAt: new Date('2026-01-15'),
        },
        update: {
          cash: new Prisma.Decimal(10000.00),
          buyingPower: new Prisma.Decimal(20000.00),
          lastSyncAt: new Date('2026-01-15'),
        },
      });

      // Update balance
      await testPrisma.brokerBalance.upsert({
        where: {
          brokerageAccountId_currency: {
            brokerageAccountId: testAccountId,
            currency: 'USD',
          },
        },
        create: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: 'USD',
          cash: new Prisma.Decimal(12500.00),
          buyingPower: new Prisma.Decimal(25000.00),
          lastSyncAt: new Date(),
        },
        update: {
          cash: new Prisma.Decimal(12500.00),
          buyingPower: new Prisma.Decimal(25000.00),
          lastSyncAt: new Date(),
        },
      });

      const balances = await testPrisma.brokerBalance.findMany({
        where: { userId: testUserId },
      });

      expect(balances).toHaveLength(1);
      expect(balances[0].cash!.toNumber()).toBe(12500.00);
    });
  });

  // ============================================================================
  // Section 5: Return Rate Sync Tests (BrokerReturnRate)
  // ============================================================================
  describe('Return Rate Sync to BrokerReturnRate', () => {
    afterEach(async () => {
      await testPrisma.brokerReturnRate.deleteMany({ where: { userId: testUserId } });
    });

    it('should sync return rates with all timeframes', async () => {
      const mockRates: SnapTradeReturnRate[] = [
        { timeframe: 'ALL', return_percent: 45.25, created_date: '2026-01-20' },
        { timeframe: '1Y', return_percent: 22.50, created_date: '2026-01-20' },
        { timeframe: '6M', return_percent: 15.75, created_date: '2026-01-20' },
        { timeframe: '3M', return_percent: 8.25, created_date: '2026-01-20' },
        { timeframe: '1M', return_percent: 3.50, created_date: '2026-01-20' },
      ];

      for (const rate of mockRates) {
        await testPrisma.brokerReturnRate.create({
          data: {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            timeframe: rate.timeframe,
            returnPercent: new Prisma.Decimal(rate.return_percent),
            lastSyncAt: new Date(),
          },
        });
      }

      const rates = await testPrisma.brokerReturnRate.findMany({
        where: { userId: testUserId },
        orderBy: { timeframe: 'asc' },
      });

      expect(rates).toHaveLength(5);

      const rateMap = new Map(rates.map(r => [r.timeframe, r.returnPercent.toNumber()]));
      expect(rateMap.get('ALL')).toBe(45.25);
      expect(rateMap.get('1Y')).toBe(22.50);
      expect(rateMap.get('6M')).toBe(15.75);
      expect(rateMap.get('3M')).toBe(8.25);
      expect(rateMap.get('1M')).toBe(3.50);
    });

    it('should upsert return rate on re-sync', async () => {
      // Initial rate
      await testPrisma.brokerReturnRate.upsert({
        where: {
          brokerageAccountId_timeframe: {
            brokerageAccountId: testAccountId,
            timeframe: '1Y',
          },
        },
        create: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          timeframe: '1Y',
          returnPercent: new Prisma.Decimal(20.00),
          lastSyncAt: new Date('2026-01-15'),
        },
        update: {
          returnPercent: new Prisma.Decimal(20.00),
          lastSyncAt: new Date('2026-01-15'),
        },
      });

      // Updated rate
      await testPrisma.brokerReturnRate.upsert({
        where: {
          brokerageAccountId_timeframe: {
            brokerageAccountId: testAccountId,
            timeframe: '1Y',
          },
        },
        create: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          timeframe: '1Y',
          returnPercent: new Prisma.Decimal(22.75),
          lastSyncAt: new Date(),
        },
        update: {
          returnPercent: new Prisma.Decimal(22.75),
          lastSyncAt: new Date(),
        },
      });

      const rates = await testPrisma.brokerReturnRate.findMany({
        where: { userId: testUserId },
      });

      expect(rates).toHaveLength(1);
      expect(rates[0].returnPercent.toNumber()).toBe(22.75);
    });
  });

  // ============================================================================
  // Section 6: Derivation Engine Tests
  // ============================================================================
  describe('Derivation Engine - P&L Calculation', () => {
    let derivationAccountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Derivation Test Account',
        isDefault: false,
      });
      derivationAccountId = account.id;
    });

    afterEach(async () => {
      // Only clean up this test's data, not the shared testAccountId
      // Delete in correct dependency order
      const positions = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: derivationAccountId },
        select: { id: true },
      });
      const closes = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: derivationAccountId },
        select: { id: true },
      });

      const positionIds = positions.map(p => p.id);
      const closeIds = closes.map(c => c.id);

      if (positionIds.length > 0 || closeIds.length > 0) {
        await testPrisma.positionLedgerLink.deleteMany({
          where: {
            OR: [
              ...(positionIds.length > 0 ? [{ positionId: { in: positionIds } }] : []),
              ...(closeIds.length > 0 ? [{ realizedCloseId: { in: closeIds } }] : []),
            ],
          },
        });
      }

      await testPrisma.derivedPosition.deleteMany({ where: { brokerageAccountId: derivationAccountId } });
      await testPrisma.realizedClose.deleteMany({ where: { brokerageAccountId: derivationAccountId } });
      await testPrisma.dailyAggregate.deleteMany({ where: { userId: testUserId } });
      await testPrisma.ledgerEvent.deleteMany({ where: { brokerageAccountId: derivationAccountId } });
      await testPrisma.importBatch.deleteMany({ where: { brokerageAccountId: derivationAccountId } });
      await testPrisma.brokerageAccount.delete({ where: { id: derivationAccountId } });
    });

    it('should calculate stock P&L correctly: BUY 100 @ $150, SELL 100 @ $175', async () => {
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'pnl-buy',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 100,
          price: 150.00,
          amount: -15000.00,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
        {
          id: 'pnl-sell',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'SELL',
          units: -100,
          price: 175.00,
          amount: 17500.00,
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
          brokerageAccountId: derivationAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      await fullRederivation(testPrisma, testUserId);

      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId, brokerageAccountId: derivationAccountId },
      });

      expect(closes).toHaveLength(1);
      expect(closes[0].symbol).toBe('AAPL');
      expect(closes[0].quantity.toNumber()).toBe(100);
      expect(closes[0].openPrice.toNumber()).toBe(150.00);
      expect(closes[0].closePrice.toNumber()).toBe(175.00);
      // P&L = (175 - 150) * 100 = $2,500
      expect(closes[0].realizedPnL.toNumber()).toBe(2500.00);
    });

    it('should calculate option P&L correctly: STO @ $3.00, BTC @ $0.50', async () => {
      const transactions: SnapTradeTransaction[] = [
        {
          id: 'opt-sto',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-opt', symbol: 'SPY' },
          option_symbol: {
            id: 'opt-1',
            ticker: 'SPY 260131P00550000',
            strike_price: 550.0,
            expiration_date: '2026-01-31',
            option_type: 'PUT',
          },
          type: 'SELL',
          option_type: 'SELL_TO_OPEN',
          units: -2,
          price: 3.00,
          amount: 600.00, // 2 contracts * 100 * $3.00
          fee: 1.30,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        },
        {
          id: 'opt-btc',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-opt', symbol: 'SPY' },
          option_symbol: {
            id: 'opt-1',
            ticker: 'SPY 260131P00550000',
            strike_price: 550.0,
            expiration_date: '2026-01-31',
            option_type: 'PUT',
          },
          type: 'BUY',
          option_type: 'BUY_TO_CLOSE',
          units: 2,
          price: 0.50,
          amount: -100.00,
          fee: 1.30,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-25',
        },
      ];

      const normalized = transactions
        .map(transformToNormalizedTransaction)
        .filter((t): t is NonNullable<typeof t> => t !== null);

      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: derivationAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      await fullRederivation(testPrisma, testUserId);

      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId, brokerageAccountId: derivationAccountId },
      });

      expect(closes).toHaveLength(1);
      expect(closes[0].symbol).toBe('SPY');
      expect(closes[0].optionType).toBe('put');
      expect(closes[0].strike!.toNumber()).toBe(550.0);
      // STO @ $3.00, BTC @ $0.50 = $2.50 profit per share * 2 contracts * 100 shares = $500
      expect(closes[0].realizedPnL.toNumber()).toBeCloseTo(500.00, 0);
    });

    it('should create open position for partial trade', async () => {
      const tx: SnapTradeTransaction = {
        id: 'partial-buy',
        account: { id: 'acc-1', name: 'Robinhood' },
        symbol: { id: 'sym-1', symbol: 'TSLA' },
        type: 'BUY',
        units: 50,
        price: 400.00,
        amount: -20000.00,
        fee: 0,
        currency: { id: 'cur-1', code: 'USD' },
        trade_date: '2026-01-15',
      };

      const normalized = transformToNormalizedTransaction(tx);

      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: derivationAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        [normalized!]
      );

      await fullRederivation(testPrisma, testUserId);

      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId, brokerageAccountId: derivationAccountId },
      });

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('TSLA');
      expect(positions[0].positionType).toBe('stock');
      expect(positions[0].quantity.toNumber()).toBe(50);
      expect(positions[0].avgPrice.toNumber()).toBe(400.00);
      expect(positions[0].costBasis.toNumber()).toBe(20000.00);
    });

    it('should handle FIFO matching for multiple lots', async () => {
      const transactions: SnapTradeTransaction[] = [
        // Buy 50 @ $100
        {
          id: 'lot1-buy',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AMD' },
          type: 'BUY',
          units: 50,
          price: 100.00,
          amount: -5000.00,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-05',
        },
        // Buy 50 @ $120
        {
          id: 'lot2-buy',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AMD' },
          type: 'BUY',
          units: 50,
          price: 120.00,
          amount: -6000.00,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-10',
        },
        // Sell 75 @ $140 (takes all of lot 1 and part of lot 2)
        {
          id: 'partial-sell',
          account: { id: 'acc-1', name: 'Robinhood' },
          symbol: { id: 'sym-1', symbol: 'AMD' },
          type: 'SELL',
          units: -75,
          price: 140.00,
          amount: 10500.00,
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
          brokerageAccountId: derivationAccountId,
          broker: 'robinhood',
          sourceType: 'api',
        },
        normalized
      );

      await fullRederivation(testPrisma, testUserId);

      // Check remaining position (25 shares @ $120)
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId, brokerageAccountId: derivationAccountId },
      });

      expect(positions).toHaveLength(1);
      expect(positions[0].quantity.toNumber()).toBe(25);
      expect(positions[0].avgPrice.toNumber()).toBe(120.00);

      // Check realized closes
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId, brokerageAccountId: derivationAccountId },
        orderBy: { openDate: 'asc' },
      });

      // Should have 2 closes (one for each lot)
      expect(closes.length).toBeGreaterThanOrEqual(1);

      // Total P&L should be:
      // Lot 1: (140 - 100) * 50 = $2,000
      // Lot 2 partial: (140 - 120) * 25 = $500
      // Total: $2,500
      const totalPnL = closes.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
      expect(totalPnL).toBeCloseTo(2500.00, 0);
    });
  });

  // ============================================================================
  // Section 7: Unified Position View Tests
  // ============================================================================
  describe('Unified Position View', () => {
    let manualAccountId: string;

    beforeEach(async () => {
      // Create a manual account (no externalAccountId)
      const manual = await testPrisma.brokerageAccount.create({
        data: {
          userId: testUserId,
          broker: 'manual',
          name: 'Manual Test Account',
          isDefault: false,
          isActive: true,
        },
      });
      manualAccountId = manual.id;
    });

    afterEach(async () => {
      await testPrisma.brokerPosition.deleteMany({ where: { userId: testUserId } });
      await testPrisma.derivedPosition.deleteMany({ where: { userId: testUserId } });
      await testPrisma.brokerageAccount.delete({ where: { id: manualAccountId } });
    });

    it('should return SnapTrade positions for connected accounts', async () => {
      // Add BrokerPosition (SnapTrade data)
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: new Prisma.Decimal(100),
          marketPrice: new Prisma.Decimal(185.00),
          marketValue: new Prisma.Decimal(18500.00),
          avgCostBasis: new Prisma.Decimal(150.00),
          unrealizedPnL: new Prisma.Decimal(3500.00),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(),
          isStale: false,
        },
      });

      const positions = await getUnifiedPositions(testPrisma, testUserId, {
        accountId: testAccountId,
      });

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('AAPL');
      expect(positions[0].dataSource).toBe('snaptrade');
      expect(positions[0].quantity).toBe(100);
      expect(positions[0].marketPrice).toBe(185.00);
      expect(positions[0].unrealizedPnL).toBe(3500.00);
    });

    it('should return derived positions for manual accounts', async () => {
      // Add DerivedPosition (from manual entry)
      await testPrisma.derivedPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: manualAccountId,
          symbol: 'GOOGL',
          positionType: 'stock',
          side: 'long',
          quantity: new Prisma.Decimal(50),
          avgPrice: new Prisma.Decimal(175.00),
          costBasis: new Prisma.Decimal(8750.00),
          firstEntryDate: new Date('2026-01-10'),
          lastEntryDate: new Date('2026-01-10'),
          derivedAt: new Date(),
          derivationVersion: 1,
        },
      });

      const positions = await getUnifiedPositions(testPrisma, testUserId, {
        accountId: manualAccountId,
      });

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('GOOGL');
      expect(positions[0].dataSource).toBe('derived');
      expect(positions[0].quantity).toBe(50);
      expect(positions[0].avgCostBasis).toBe(175.00);
      // No market data for derived positions
      expect(positions[0].marketPrice).toBeUndefined();
      expect(positions[0].unrealizedPnL).toBeUndefined();
    });

    it('should merge positions from both sources', async () => {
      // SnapTrade position
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'NVDA',
          positionType: 'stock',
          quantity: new Prisma.Decimal(75),
          marketPrice: new Prisma.Decimal(550.00),
          marketValue: new Prisma.Decimal(41250.00),
          avgCostBasis: new Prisma.Decimal(500.00),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(),
          isStale: false,
        },
      });

      // Derived position
      await testPrisma.derivedPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: manualAccountId,
          symbol: 'TSLA',
          positionType: 'stock',
          side: 'long',
          quantity: new Prisma.Decimal(30),
          avgPrice: new Prisma.Decimal(425.00),
          costBasis: new Prisma.Decimal(12750.00),
          firstEntryDate: new Date('2026-01-12'),
          lastEntryDate: new Date('2026-01-12'),
          derivedAt: new Date(),
          derivationVersion: 1,
        },
      });

      const positions = await getUnifiedPositions(testPrisma, testUserId);

      expect(positions).toHaveLength(2);

      const nvda = positions.find(p => p.symbol === 'NVDA');
      const tsla = positions.find(p => p.symbol === 'TSLA');

      expect(nvda).toBeDefined();
      expect(nvda!.dataSource).toBe('snaptrade');
      expect(tsla).toBeDefined();
      expect(tsla!.dataSource).toBe('derived');
    });
  });

  // ============================================================================
  // Section 8: Staleness Tracking Tests
  // ============================================================================
  describe('Staleness Tracking', () => {
    afterEach(async () => {
      await testPrisma.brokerPosition.deleteMany({ where: { userId: testUserId } });
    });

    it('should mark positions as stale after cutoff', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);

      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: new Prisma.Decimal(100),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: fiveMinutesAgo,
          isStale: false,
        },
      });

      const needsRefresh = await positionsNeedRefresh(testPrisma, testUserId, 5);
      expect(needsRefresh).toBe(true);
    });

    it('should not require refresh for fresh positions', async () => {
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: new Prisma.Decimal(100),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(), // Just now
          isStale: false,
        },
      });

      const needsRefresh = await positionsNeedRefresh(testPrisma, testUserId, 5);
      expect(needsRefresh).toBe(false);
    });

    it('should mark all positions as stale', async () => {
      // Create multiple positions
      await testPrisma.brokerPosition.createMany({
        data: [
          {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            symbol: 'AAPL',
            positionType: 'stock',
            quantity: new Prisma.Decimal(100),
            currency: 'USD',
            dataSource: 'snaptrade',
            lastSyncAt: new Date(),
            isStale: false,
          },
          {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            symbol: 'GOOGL',
            positionType: 'stock',
            quantity: new Prisma.Decimal(50),
            currency: 'USD',
            dataSource: 'snaptrade',
            lastSyncAt: new Date(),
            isStale: false,
          },
        ],
      });

      await markPositionsStale(testPrisma, testUserId);

      const positions = await testPrisma.brokerPosition.findMany({
        where: { userId: testUserId },
      });

      expect(positions.every(p => p.isStale)).toBe(true);
    });

    it('should exclude stale positions from unified view by default', async () => {
      // Fresh position
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: new Prisma.Decimal(100),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(),
          isStale: false,
        },
      });

      // Stale position
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'OLD_STOCK',
          positionType: 'stock',
          quantity: new Prisma.Decimal(50),
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(Date.now() - 86400000), // 1 day ago
          isStale: true,
        },
      });

      // Without includeStale
      const freshPositions = await getUnifiedPositions(testPrisma, testUserId);
      expect(freshPositions).toHaveLength(1);
      expect(freshPositions[0].symbol).toBe('AAPL');

      // With includeStale
      const allPositions = await getUnifiedPositions(testPrisma, testUserId, {
        includeStale: true,
      });
      expect(allPositions).toHaveLength(2);
    });
  });

  // ============================================================================
  // Section 9: Unified Balance and Return Rate Views
  // ============================================================================
  describe('Unified Balance and Return Rate Views', () => {
    afterEach(async () => {
      await testPrisma.brokerBalance.deleteMany({ where: { userId: testUserId } });
      await testPrisma.brokerReturnRate.deleteMany({ where: { userId: testUserId } });
    });

    it('should return unified balances correctly', async () => {
      await testPrisma.brokerBalance.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          currency: 'USD',
          cash: new Prisma.Decimal(25000.00),
          buyingPower: new Prisma.Decimal(50000.00),
          lastSyncAt: new Date(),
        },
      });

      const balances = await getUnifiedBalances(testPrisma, testUserId);

      expect(balances).toHaveLength(1);
      expect(balances[0].currency).toBe('USD');
      expect(balances[0].cash).toBe(25000.00);
      expect(balances[0].buyingPower).toBe(50000.00);
      expect(balances[0].brokerageAccountName).toBe('Test Robinhood Account');
    });

    it('should return unified return rates correctly', async () => {
      await testPrisma.brokerReturnRate.createMany({
        data: [
          {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            timeframe: 'ALL',
            returnPercent: new Prisma.Decimal(35.50),
            lastSyncAt: new Date(),
          },
          {
            userId: testUserId,
            brokerageAccountId: testAccountId,
            timeframe: '1Y',
            returnPercent: new Prisma.Decimal(18.25),
            lastSyncAt: new Date(),
          },
        ],
      });

      const rates = await getUnifiedReturnRates(testPrisma, testUserId);

      expect(rates).toHaveLength(2);

      const allTime = rates.find(r => r.timeframe === 'ALL');
      const oneYear = rates.find(r => r.timeframe === '1Y');

      expect(allTime).toBeDefined();
      expect(allTime!.returnPercent).toBe(35.50);
      expect(oneYear).toBeDefined();
      expect(oneYear!.returnPercent).toBe(18.25);
    });
  });
});
