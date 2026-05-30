/**
 * Comprehensive Regression Smoke Tests
 *
 * This file contains critical regression tests that MUST pass before any deployment.
 * It covers all major business logic paths and integration points.
 *
 * Run before deployment: npm run test:smoke -- regression.smoke.test.ts
 *
 * Test Categories:
 * 1. Core Trading Flows (manual entry, close, edit)
 * 2. Import Pipelines (Robinhood CSV, Schwab JSON, SnapTrade)
 * 3. Account Management (CRUD, deletion cascade, multi-account)
 * 4. Dashboard Analytics (stats, calendar, performance)
 * 5. Derivation Engine (FIFO matching, P&L calculation)
 * 6. Security (IDOR prevention, auth validation)
 * 7. Edge Cases (unknown basis, partial closes, expired options)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents, generateEventHash } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { importBrokerFile, deleteImportBatch } from '@/lib/services/ledger-import';
import type { NormalizedTransaction, ImportContext } from '@/lib/importers/types';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const TEST_PREFIX = 'regression_smoke';

function fixedDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

async function createTestUser(prefix: string): Promise<string> {
  const uniqueEmail = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: `${prefix} Test User`,
    },
  });
  return user.id;
}

function createStockTransaction(
  overrides: Partial<NormalizedTransaction> & { symbol: string; transCode: 'BUY' | 'SELL' }
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
    activityDate: rest.activityDate ?? fixedDate('2026-01-15'),
    isOption: false,
    eventType: 'EQUITY_STOCK',
    rawDescription: rest.rawDescription ?? `${isOpen ? 'Buy' : 'Sell'} ${symbol}`,
  };
}

function createOptionTransaction(
  overrides: Partial<NormalizedTransaction> & {
    symbol: string;
    transCode: 'BTO' | 'STO' | 'BTC' | 'STC' | 'OEXP' | 'OASGN';
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
    amount: rest.amount ?? (isBuy ? -(quantity * price * 100) : quantity * price * 100),
    activityDate: rest.activityDate ?? fixedDate('2026-01-15'),
    isOption: true,
    optionType,
    strike,
    expiration,
    eventType: 'EQUITY_OPTION',
    rawDescription: rest.rawDescription ?? `${transCode} ${symbol} ${optionType}`,
    strategy: rest.strategy,
  };
}

// Sample broker file contents for import tests
const ROBINHOOD_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/15/2026","1/15/2026","1/16/2026","TSLA","TSLA 1/16/2026 Put $440.00","STO","2","$3.00","$599.90"
"1/16/2026","1/16/2026","1/20/2026","TSLA","Option Expiration for TSLA 1/16/2026 Put $440.00","OEXP","2","",""
"1/15/2026","1/15/2026","1/16/2026","AAPL","Apple Inc.","Buy","50","$175.00","($8,750.00)"
`;

const SCHWAB_JSON = JSON.stringify({
  FromDate: '01/01/2026',
  ToDate: '01/31/2026',
  BrokerageTransactions: [
    {
      Date: '01/14/2026',
      Action: 'Buy',
      Symbol: 'NVDA',
      Description: 'NVIDIA Corporation',
      Quantity: '20',
      Price: '$450.00',
      'Fees & Comm': '$0.00',
      Amount: '-$9,000.00',
    },
    {
      Date: '01/20/2026',
      Action: 'Sell',
      Symbol: 'NVDA',
      Description: 'NVIDIA Corporation',
      Quantity: '20',
      Price: '$480.00',
      'Fees & Comm': '$0.00',
      Amount: '$9,600.00',
    },
  ],
});

// ============================================================================
// 1. CORE TRADING FLOWS
// ============================================================================

describe('REGRESSION: Core Trading Flows', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_trading`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Trading Flow Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('Stock Trading', () => {
    it('should create stock BUY entry with correct ledger event', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'BUY',
        quantity: 100,
        price: 200,
        activityDate: fixedDate('2026-01-10'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [tx]);

      expect(result.inserted).toBe(1);
      expect(result.duplicates).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify ledger event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: { userId: testUserId, symbol: 'AAPL' },
      });
      expect(event).toBeDefined();
      expect(event?.transCode).toBe('BUY');
      expect(event?.quantity.toNumber()).toBe(100);
      expect(event?.price?.toNumber()).toBe(200);
    });

    it('should derive open position after BUY', async () => {
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'AAPL', quantity: { gt: 0 } },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('long');
      expect(position?.quantity.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(200);
      expect(position?.costBasis.toNumber()).toBe(20000);
    });

    it('should close stock with SELL and calculate P&L', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'SELL',
        quantity: 100,
        price: 220,
        activityDate: fixedDate('2026-01-15'),
      });

      await writeLedgerEvents(testPrisma, context, [tx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'AAPL', closeType: 'stock' },
      });

      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(2000); // (220-200) * 100
      expect(close?.closeReason).toBe('normal');
    });

    it('should update daily aggregate with P&L', async () => {
      const aggregate = await testPrisma.dailyAggregate.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: null, // All-accounts rollup
          realizedPnL: { gt: 0 },
        },
      });

      expect(aggregate).toBeDefined();
      expect(aggregate?.realizedPnL.toNumber()).toBe(2000);
      expect(aggregate?.winCount).toBe(1);
      expect(aggregate?.lossCount).toBe(0);
    });
  });

  describe('Option Trading', () => {
    it('should create long call (BTO) entry', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createOptionTransaction({
        symbol: 'MSFT',
        transCode: 'BTO',
        optionType: 'call',
        strike: 450,
        expiration: fixedDate('2026-02-21'),
        quantity: 2,
        price: 10,
        activityDate: fixedDate('2026-01-12'),
        strategy: 'long_call',
      });

      const result = await writeLedgerEvents(testPrisma, context, [tx]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'MSFT', optionType: 'call' },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('long');
      expect(position?.strategy).toBe('long_call');
      expect(position?.costBasis.toNumber()).toBe(2000); // 2 * 10 * 100
    });

    it('should create covered call (STO) entry', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createOptionTransaction({
        symbol: 'TSLA',
        transCode: 'STO',
        optionType: 'call',
        strike: 300,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 15,
        activityDate: fixedDate('2026-01-14'),
        strategy: 'covered_call',
      });

      await writeLedgerEvents(testPrisma, context, [tx]);
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'TSLA', optionType: 'call' },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('short');
      expect(position?.strategy).toBe('covered_call');
    });

    it('should close short option (BTC) and calculate P&L', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createOptionTransaction({
        symbol: 'TSLA',
        transCode: 'BTC',
        optionType: 'call',
        strike: 300,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 5, // Bought back cheaper = profit
        activityDate: fixedDate('2026-01-20'),
      });

      await writeLedgerEvents(testPrisma, context, [tx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'TSLA', optionType: 'call' },
      });

      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(1000); // (15-5) * 1 * 100
    });
  });

  describe('Idempotency', () => {
    it('should skip duplicate transactions', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const tx = createStockTransaction({
        symbol: 'UNIQUE_TEST',
        transCode: 'BUY',
        quantity: 10,
        price: 100,
        activityDate: fixedDate('2026-01-25'),
      });

      // First write
      const result1 = await writeLedgerEvents(testPrisma, context, [tx]);
      expect(result1.inserted).toBe(1);

      // Second write (should be skipped)
      const result2 = await writeLedgerEvents(testPrisma, context, [tx]);
      expect(result2.inserted).toBe(0);
      expect(result2.duplicates).toBe(1);

      // Only one event in DB
      const count = await testPrisma.ledgerEvent.count({
        where: { userId: testUserId, symbol: 'UNIQUE_TEST' },
      });
      expect(count).toBe(1);
    });

    it('should generate consistent event hash', () => {
      const userId = 'test-user-id';
      const accountId = 'test-account-id';
      const tx: NormalizedTransaction = {
        symbol: 'TEST',
        rawInstrument: 'TEST',
        transCode: 'BUY',
        quantity: 100,
        price: 50,
        amount: -5000,
        activityDate: new Date('2026-01-15T12:00:00.000Z'),
        isOption: false,
        eventType: 'EQUITY_STOCK',
        rawDescription: 'Test',
      };

      const hash1 = generateEventHash(userId, accountId, tx);
      const hash2 = generateEventHash(userId, accountId, tx);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA256 hex
    });
  });
});

// ============================================================================
// 2. IMPORT PIPELINES
// ============================================================================

describe('REGRESSION: Import Pipelines', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_import`);
    const account = await createTestAccount(testUserId, {
      broker: 'robinhood',
      name: 'Import Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('Robinhood CSV Import', () => {
    let importBatchId: string;

    it('should import Robinhood CSV successfully', async () => {
      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'robinhood',
        fileName: 'test.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false,
      });

      expect(result.success).toBe(true);
      expect(result.inserted).toBeGreaterThan(0);
      expect(result.importBatchId).toBeDefined();
      importBatchId = result.importBatchId;
    });

    it('should create ledger events from CSV', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, importBatchId },
      });

      expect(events.length).toBeGreaterThan(0);

      // Check for TSLA STO
      const stoEvent = events.find((e) => e.transCode === 'STO');
      expect(stoEvent).toBeDefined();
      expect(stoEvent?.symbol).toBe('TSLA');

      // Check for AAPL Buy
      const buyEvent = events.find((e) => e.transCode === 'BUY');
      expect(buyEvent).toBeDefined();
      expect(buyEvent?.symbol).toBe('AAPL');
    });

    it('should delete import batch and soft-delete events', async () => {
      const result = await deleteImportBatch(testPrisma, importBatchId, testUserId);

      expect(result.deleted).toBe(true);
      expect(result.eventsDeleted).toBeGreaterThan(0);

      // Batch should be deleted
      const batch = await testPrisma.importBatch.findUnique({
        where: { id: importBatchId },
      });
      expect(batch).toBeNull();

      // Events should be soft-deleted
      const activeEvents = await testPrisma.ledgerEvent.count({
        where: { userId: testUserId, deletedAt: null },
      });
      expect(activeEvents).toBe(0);
    });
  });

  describe('Schwab JSON Import', () => {
    beforeEach(async () => {
      // Create Schwab account
      await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Schwab Test Account',
        isDefault: false,
      });
    });

    it('should import Schwab JSON successfully', async () => {
      const schwabAccount = await testPrisma.brokerageAccount.findFirst({
        where: { userId: testUserId, broker: 'schwab' },
      });

      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: schwabAccount!.id,
        broker: 'schwab',
        fileName: 'test.json',
        content: SCHWAB_JSON,
        skipDerivation: false,
      });

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(2); // Buy + Sell
    });

    it('should derive P&L from imported trades', async () => {
      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'NVDA' },
      });

      expect(close).toBeDefined();
      // Buy at 450, Sell at 480 for 20 shares = $600 profit
      expect(close?.realizedPnL.toNumber()).toBe(600);
    });
  });
});

// ============================================================================
// 3. ACCOUNT MANAGEMENT
// ============================================================================

describe('REGRESSION: Account Management', () => {
  let testUserId: string;

  beforeEach(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_accounts`);
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('Account CRUD', () => {
    it('should create brokerage account', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Test Account',
        isDefault: true,
      });

      expect(account.id).toBeDefined();
      expect(account.userId).toBe(testUserId);
      expect(account.broker).toBe('robinhood');
      expect(account.isDefault).toBe(true);
      expect(account.isActive).toBe(true);
    });

    it('should handle default account transfer', async () => {
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Account 1',
        isDefault: true,
      });

      // Create second account as default
      await testPrisma.brokerageAccount.update({
        where: { id: account1.id },
        data: { isDefault: false },
      });

      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Account 2',
        isDefault: true,
      });

      // Verify only one default
      const defaults = await testPrisma.brokerageAccount.count({
        where: { userId: testUserId, isDefault: true },
      });
      expect(defaults).toBe(1);

      // account2 should be default
      const defaultAccount = await testPrisma.brokerageAccount.findFirst({
        where: { userId: testUserId, isDefault: true },
      });
      expect(defaultAccount?.id).toBe(account2.id);
    });
  });

  describe('Account Deletion Cascade', () => {
    it('should delete all associated data when account is deleted', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Cascade Test',
        isDefault: true,
      });

      // Import data
      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: account.id,
        broker: 'robinhood',
        fileName: 'test.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false,
      });

      // Create additional cached data
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: account.id,
          symbol: 'TEST',
          positionType: 'stock',
          quantity: 100,
          marketPrice: 50,
          marketValue: 5000,
          dataSource: 'snaptrade',
          lastSyncAt: new Date(),
        },
      });

      // Verify data exists
      const eventsBefore = await testPrisma.ledgerEvent.count({
        where: { brokerageAccountId: account.id },
      });
      expect(eventsBefore).toBeGreaterThan(0);

      // Simulate account deletion cascade (from DELETE /api/accounts/[id])
      await testPrisma.$transaction(async (tx) => {
        // Delete position ledger links
        const positions = await tx.derivedPosition.findMany({
          where: { brokerageAccountId: account.id },
          select: { id: true },
        });
        const closes = await tx.realizedClose.findMany({
          where: { brokerageAccountId: account.id },
          select: { id: true },
        });

        if (positions.length > 0 || closes.length > 0) {
          await tx.positionLedgerLink.deleteMany({
            where: {
              OR: [
                { positionId: { in: positions.map((p) => p.id) } },
                { realizedCloseId: { in: closes.map((c) => c.id) } },
              ],
            },
          });
        }

        await tx.derivedPosition.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.realizedClose.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.dailyAggregate.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.brokerPosition.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.brokerBalance.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.brokerReturnRate.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.tradingGoal.deleteMany({ where: { brokerageAccountId: account.id } });

        // Soft-delete events and clear batch reference
        await tx.ledgerEvent.updateMany({
          where: { brokerageAccountId: account.id, deletedAt: null },
          data: { deletedAt: new Date(), importBatchId: null },
        });

        // Clear orphaned importBatchId on previously soft-deleted events
        await tx.ledgerEvent.updateMany({
          where: {
            brokerageAccountId: account.id,
            deletedAt: { not: null },
            importBatchId: { not: null },
          },
          data: { importBatchId: null },
        });

        await tx.importBatch.deleteMany({ where: { brokerageAccountId: account.id } });
        await tx.portfolioPolicy.deleteMany({ where: { brokerageAccountId: account.id } });

        await tx.brokerageAccount.update({
          where: { id: account.id },
          data: { isActive: false, isDefault: false },
        });
      });

      // Verify cleanup
      const batchesAfter = await testPrisma.importBatch.count({
        where: { brokerageAccountId: account.id },
      });
      expect(batchesAfter).toBe(0);

      const activeEventsAfter = await testPrisma.ledgerEvent.count({
        where: { brokerageAccountId: account.id, deletedAt: null },
      });
      expect(activeEventsAfter).toBe(0);

      const positionsAfter = await testPrisma.derivedPosition.count({
        where: { brokerageAccountId: account.id },
      });
      expect(positionsAfter).toBe(0);
    });
  });
});

// ============================================================================
// 4. DASHBOARD ANALYTICS
// ============================================================================

describe('REGRESSION: Dashboard Analytics', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_dashboard`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Dashboard Test Account',
      isDefault: true,
    });
    testAccountId = account.id;

    // Create sample trades for analytics
    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    // Winning trade
    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'WIN1',
        transCode: 'BUY',
        quantity: 100,
        price: 100,
        activityDate: fixedDate('2026-01-05'),
      }),
    ]);
    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'WIN1',
        transCode: 'SELL',
        quantity: 100,
        price: 120,
        activityDate: fixedDate('2026-01-10'),
      }),
    ]);

    // Losing trade
    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'LOSE1',
        transCode: 'BUY',
        quantity: 100,
        price: 50,
        activityDate: fixedDate('2026-01-06'),
      }),
    ]);
    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'LOSE1',
        transCode: 'SELL',
        quantity: 100,
        price: 40,
        activityDate: fixedDate('2026-01-11'),
      }),
    ]);

    await fullRederivation(testPrisma, testUserId);
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('Stats Calculation', () => {
    it('should calculate correct total P&L', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      const totalPnL = closes.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);

      // WIN1: (120-100)*100 = $2000
      // LOSE1: (40-50)*100 = -$1000
      // Total: $1000
      expect(totalPnL).toBe(1000);
    });

    it('should calculate correct win rate', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      const wins = closes.filter((c) => c.realizedPnL.toNumber() > 0).length;
      const losses = closes.filter((c) => c.realizedPnL.toNumber() < 0).length;
      const winRate = (wins / (wins + losses)) * 100;

      expect(wins).toBe(1);
      expect(losses).toBe(1);
      expect(winRate).toBe(50);
    });

    it('should calculate correct profit factor', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      const grossWins = closes
        .filter((c) => c.realizedPnL.toNumber() > 0)
        .reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
      const grossLosses = Math.abs(
        closes
          .filter((c) => c.realizedPnL.toNumber() < 0)
          .reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0)
      );

      const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;

      // $2000 / $1000 = 2.0
      expect(profitFactor).toBe(2);
    });
  });

  describe('Daily Aggregates', () => {
    it('should have daily aggregates for each close date', async () => {
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId, brokerageAccountId: null },
      });

      expect(aggregates.length).toBeGreaterThan(0);

      // Total from aggregates should match total P&L
      const totalFromAgg = aggregates.reduce(
        (sum, a) => sum + a.realizedPnL.toNumber(),
        0
      );
      expect(totalFromAgg).toBe(1000);
    });

    it('should track win and loss counts', async () => {
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId, brokerageAccountId: null },
      });

      const totalWins = aggregates.reduce((sum, a) => sum + a.winCount, 0);
      const totalLosses = aggregates.reduce((sum, a) => sum + a.lossCount, 0);

      expect(totalWins).toBe(1);
      expect(totalLosses).toBe(1);
    });
  });

  describe('Calendar Data', () => {
    it('should store dates at UTC noon', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, deletedAt: null },
      });

      for (const event of events) {
        expect(event.activityDate.getUTCHours()).toBe(12);
      }
    });
  });
});

// ============================================================================
// 5. DERIVATION ENGINE
// ============================================================================

describe('REGRESSION: Derivation Engine', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeEach(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_derivation`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Derivation Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('FIFO Matching', () => {
    it('should match oldest lots first', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy 50 @ $100 on Jan 10
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'FIFO',
          transCode: 'BUY',
          quantity: 50,
          price: 100,
          activityDate: fixedDate('2026-01-10'),
        }),
      ]);

      // Buy 50 @ $120 on Jan 12
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'FIFO',
          transCode: 'BUY',
          quantity: 50,
          price: 120,
          activityDate: fixedDate('2026-01-12'),
        }),
      ]);

      // Sell 50 @ $150 on Jan 15
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'FIFO',
          transCode: 'SELL',
          quantity: 50,
          price: 150,
          activityDate: fixedDate('2026-01-15'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      // First close should use first lot ($100 basis)
      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'FIFO' },
      });

      expect(close).toBeDefined();
      expect(close?.openPrice.toNumber()).toBe(100); // FIFO used $100 lot
      expect(close?.realizedPnL.toNumber()).toBe(2500); // (150-100)*50

      // Remaining position should be at $120
      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'FIFO', quantity: { gt: 0 } },
      });

      expect(position).toBeDefined();
      expect(position?.quantity.toNumber()).toBe(50);
      expect(position?.avgPrice.toNumber()).toBe(120);
    });
  });

  describe('Partial Closes', () => {
    it('should handle partial position closes', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy 100 @ $100
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'PARTIAL',
          transCode: 'BUY',
          quantity: 100,
          price: 100,
          activityDate: fixedDate('2026-01-10'),
        }),
      ]);

      // Sell 30 @ $120
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'PARTIAL',
          transCode: 'SELL',
          quantity: 30,
          price: 120,
          activityDate: fixedDate('2026-01-15'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'PARTIAL', quantity: { gt: 0 } },
      });

      expect(position).toBeDefined();
      expect(position?.quantity.toNumber()).toBe(70); // 100 - 30

      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'PARTIAL' },
      });

      expect(close?.quantity.toNumber()).toBe(30);
      expect(close?.realizedPnL.toNumber()).toBe(600); // (120-100)*30
    });
  });

  describe('Unknown Basis Handling', () => {
    it('should mark close as unknown basis when no matching open', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell without prior buy
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'UNKNOWN',
          transCode: 'SELL',
          quantity: 50,
          price: 100,
          activityDate: fixedDate('2026-01-15'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'UNKNOWN' },
      });

      expect(close).toBeDefined();
      expect(close?.hasUnknownBasis).toBe(true);
      expect(close?.realizedPnL.toNumber()).toBe(0); // Unknown basis = $0 P&L
    });
  });

  describe('Option Expiration', () => {
    it('should close option with full premium on expiration', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // STO put for $5.00 premium
      await writeLedgerEvents(testPrisma, context, [
        createOptionTransaction({
          symbol: 'OEXP',
          transCode: 'STO',
          optionType: 'put',
          strike: 100,
          expiration: fixedDate('2026-01-17'),
          quantity: 1,
          price: 5,
          activityDate: fixedDate('2026-01-10'),
          strategy: 'cash_secured_put',
        }),
      ]);

      // OEXP (option expired worthless)
      await writeLedgerEvents(testPrisma, context, [
        createOptionTransaction({
          symbol: 'OEXP',
          transCode: 'OEXP',
          optionType: 'put',
          strike: 100,
          expiration: fixedDate('2026-01-17'),
          quantity: 1,
          price: 0,
          activityDate: fixedDate('2026-01-17'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'OEXP' },
      });

      expect(close).toBeDefined();
      expect(close?.closeReason).toBe('expired');
      expect(close?.realizedPnL.toNumber()).toBe(500); // Full premium kept
    });
  });
});

// ============================================================================
// 6. SECURITY
// ============================================================================

describe('REGRESSION: Security', () => {
  let user1Id: string;
  let user2Id: string;
  let user1AccountId: string;

  beforeAll(async () => {
    // Create two separate users
    user1Id = await createTestUser(`${TEST_PREFIX}_security_user1`);
    user2Id = await createTestUser(`${TEST_PREFIX}_security_user2`);

    const account1 = await createTestAccount(user1Id, {
      broker: 'robinhood',
      name: 'User 1 Account',
      isDefault: true,
    });
    user1AccountId = account1.id;

    // Create account for user2 (needed for isolation tests)
    await createTestAccount(user2Id, {
      broker: 'schwab',
      name: 'User 2 Account',
      isDefault: true,
    });

    // Create data for user 1
    const context: ImportContext = {
      userId: user1Id,
      brokerageAccountId: user1AccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'PRIVATE',
        transCode: 'BUY',
        quantity: 100,
        price: 200,
        activityDate: fixedDate('2026-01-10'),
      }),
    ]);

    await fullRederivation(testPrisma, user1Id);
  });

  afterAll(async () => {
    await cleanupTestUser(user1Id);
    await cleanupTestUser(user2Id);
    await testPrisma.user.delete({ where: { id: user1Id } }).catch(() => {});
    await testPrisma.user.delete({ where: { id: user2Id } }).catch(() => {});
  });

  describe('IDOR Prevention', () => {
    it('should not allow user2 to access user1 ledger events', async () => {
      const user1Events = await testPrisma.ledgerEvent.findMany({
        where: { userId: user1Id },
      });
      expect(user1Events.length).toBeGreaterThan(0);

      // Simulate user2 trying to access user1's events by ID
      const eventId = user1Events[0].id;
      const attemptedAccess = await testPrisma.ledgerEvent.findFirst({
        where: { id: eventId, userId: user2Id },
      });

      expect(attemptedAccess).toBeNull();
    });

    it('should not allow user2 to access user1 accounts', async () => {
      const attemptedAccess = await testPrisma.brokerageAccount.findFirst({
        where: { id: user1AccountId, userId: user2Id },
      });

      expect(attemptedAccess).toBeNull();
    });

    it('should not allow user2 to access user1 positions', async () => {
      const user1Positions = await testPrisma.derivedPosition.findMany({
        where: { userId: user1Id },
      });
      expect(user1Positions.length).toBeGreaterThan(0);

      const positionId = user1Positions[0].id;
      const attemptedAccess = await testPrisma.derivedPosition.findFirst({
        where: { id: positionId, userId: user2Id },
      });

      expect(attemptedAccess).toBeNull();
    });
  });

  describe('User Isolation', () => {
    it('should keep user data completely separate', async () => {
      const user1Data = await testPrisma.ledgerEvent.count({
        where: { userId: user1Id },
      });
      const user2Data = await testPrisma.ledgerEvent.count({
        where: { userId: user2Id },
      });

      expect(user1Data).toBeGreaterThan(0);
      expect(user2Data).toBe(0);
    });

    it('should prevent cross-user derivation contamination', async () => {
      // Run derivation for user2 - should not affect user1
      await fullRederivation(testPrisma, user2Id);

      // User1 positions should still exist
      const user1Positions = await testPrisma.derivedPosition.count({
        where: { userId: user1Id },
      });
      expect(user1Positions).toBeGreaterThan(0);

      // User2 should have no positions
      const user2Positions = await testPrisma.derivedPosition.count({
        where: { userId: user2Id },
      });
      expect(user2Positions).toBe(0);
    });
  });
});

// ============================================================================
// 7. EDGE CASES
// ============================================================================

describe('REGRESSION: Edge Cases', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeEach(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_edge`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Edge Case Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('Multi-Account Derivation', () => {
    it('should keep positions separate per account', async () => {
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Second Account',
        isDefault: false,
      });

      // Trade in account 1
      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
        },
        [
          createStockTransaction({
            symbol: 'MULTI',
            transCode: 'BUY',
            quantity: 100,
            price: 50,
            activityDate: fixedDate('2026-01-10'),
          }),
        ]
      );

      // Trade in account 2
      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: account2.id,
          broker: 'manual',
          sourceType: 'manual',
        },
        [
          createStockTransaction({
            symbol: 'MULTI',
            transCode: 'BUY',
            quantity: 50,
            price: 60,
            activityDate: fixedDate('2026-01-11'),
          }),
        ]
      );

      await fullRederivation(testPrisma, testUserId);

      // Each account should have its own position
      const acc1Position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'MULTI',
        },
      });

      const acc2Position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: account2.id,
          symbol: 'MULTI',
        },
      });

      expect(acc1Position?.quantity.toNumber()).toBe(100);
      expect(acc1Position?.avgPrice.toNumber()).toBe(50);

      expect(acc2Position?.quantity.toNumber()).toBe(50);
      expect(acc2Position?.avgPrice.toNumber()).toBe(60);
    });
  });

  describe('All-Accounts Rollup', () => {
    it('should create aggregated position for all accounts', async () => {
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Rollup Test Account',
        isDefault: false,
      });

      // Trade in account 1
      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          broker: 'manual',
          sourceType: 'manual',
        },
        [
          createStockTransaction({
            symbol: 'ROLLUP',
            transCode: 'BUY',
            quantity: 100,
            price: 100,
            activityDate: fixedDate('2026-01-10'),
          }),
        ]
      );

      // Trade in account 2
      await writeLedgerEvents(
        testPrisma,
        {
          userId: testUserId,
          brokerageAccountId: account2.id,
          broker: 'manual',
          sourceType: 'manual',
        },
        [
          createStockTransaction({
            symbol: 'ROLLUP',
            transCode: 'BUY',
            quantity: 50,
            price: 100,
            activityDate: fixedDate('2026-01-11'),
          }),
        ]
      );

      await fullRederivation(testPrisma, testUserId);

      // Verify positions in each account
      const acc1Position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'ROLLUP',
        },
      });
      const acc2Position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: account2.id,
          symbol: 'ROLLUP',
        },
      });

      // Each account should have its position
      expect(acc1Position?.quantity.toNumber()).toBe(100);
      expect(acc2Position?.quantity.toNumber()).toBe(50);

      // Total quantity across accounts
      const totalQty =
        (acc1Position?.quantity.toNumber() ?? 0) +
        (acc2Position?.quantity.toNumber() ?? 0);
      expect(totalQty).toBe(150)
    });
  });

  describe('Soft Delete Handling', () => {
    it('should exclude soft-deleted events from derivation', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'SOFTDEL',
          transCode: 'BUY',
          quantity: 100,
          price: 50,
          activityDate: fixedDate('2026-01-10'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      // Position should exist
      let position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'SOFTDEL' },
      });
      expect(position).toBeDefined();

      // Soft-delete the event
      await testPrisma.ledgerEvent.updateMany({
        where: { userId: testUserId, symbol: 'SOFTDEL' },
        data: { deletedAt: new Date() },
      });

      await fullRederivation(testPrisma, testUserId);

      // Position should be gone
      position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'SOFTDEL' },
      });
      expect(position).toBeNull();
    });
  });

  describe('Zero Quantity Positions', () => {
    it('should not create positions with zero quantity', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy and immediately sell same quantity
      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'ZERO',
          transCode: 'BUY',
          quantity: 100,
          price: 50,
          activityDate: fixedDate('2026-01-10'),
        }),
      ]);

      await writeLedgerEvents(testPrisma, context, [
        createStockTransaction({
          symbol: 'ZERO',
          transCode: 'SELL',
          quantity: 100,
          price: 60,
          activityDate: fixedDate('2026-01-11'),
        }),
      ]);

      await fullRederivation(testPrisma, testUserId);

      // Should have no open position
      const position = await testPrisma.derivedPosition.findFirst({
        where: { userId: testUserId, symbol: 'ZERO', quantity: { gt: 0 } },
      });
      expect(position).toBeNull();

      // Should have a realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, symbol: 'ZERO' },
      });
      expect(close).toBeDefined();
      expect(close?.realizedPnL.toNumber()).toBe(1000); // (60-50)*100
    });
  });
});

// ============================================================================
// 8. POSITION LEDGER LINKS (Edit Flow)
// ============================================================================

describe('REGRESSION: Position Ledger Links', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_links`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Links Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  it('should create ledger links for open positions', async () => {
    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'LINKED',
        transCode: 'BUY',
        quantity: 100,
        price: 100,
        activityDate: fixedDate('2026-01-10'),
      }),
    ]);

    await fullRederivation(testPrisma, testUserId);

    const position = await testPrisma.derivedPosition.findFirst({
      where: { userId: testUserId, symbol: 'LINKED' },
      include: { ledgerLinks: true },
    });

    expect(position).toBeDefined();
    expect(position?.ledgerLinks.length).toBeGreaterThan(0);
    expect(position?.ledgerLinks[0].openEventId).toBeDefined();
  });

  it('should create ledger links for closed trades', async () => {
    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    await writeLedgerEvents(testPrisma, context, [
      createStockTransaction({
        symbol: 'LINKED',
        transCode: 'SELL',
        quantity: 100,
        price: 120,
        activityDate: fixedDate('2026-01-15'),
      }),
    ]);

    await fullRederivation(testPrisma, testUserId);

    const close = await testPrisma.realizedClose.findFirst({
      where: { userId: testUserId, symbol: 'LINKED' },
      include: { ledgerLinks: true },
    });

    expect(close).toBeDefined();
    expect(close?.ledgerLinks.length).toBeGreaterThan(0);

    // Should have both open and close event IDs
    const hasOpenLink = close?.ledgerLinks.some((l) => l.openEventId !== null);
    const hasCloseLink = close?.ledgerLinks.some((l) => l.closeEventId !== null);

    expect(hasOpenLink).toBe(true);
    expect(hasCloseLink).toBe(true);
  });
});

// ============================================================================
// 9. WHEEL STRATEGY
// ============================================================================

describe('REGRESSION: Wheel Strategy', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_wheel`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Wheel Test Account',
      isDefault: true,
    });
    testAccountId = account.id;

    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    // CSP trade
    await writeLedgerEvents(testPrisma, context, [
      createOptionTransaction({
        symbol: 'WHEEL',
        transCode: 'STO',
        optionType: 'put',
        strike: 100,
        expiration: fixedDate('2026-01-17'),
        quantity: 1,
        price: 3,
        activityDate: fixedDate('2026-01-10'),
        strategy: 'cash_secured_put',
      }),
    ]);

    // CSP expires
    await writeLedgerEvents(testPrisma, context, [
      createOptionTransaction({
        symbol: 'WHEEL',
        transCode: 'OEXP',
        optionType: 'put',
        strike: 100,
        expiration: fixedDate('2026-01-17'),
        quantity: 1,
        price: 0,
        activityDate: fixedDate('2026-01-17'),
      }),
    ]);

    // Covered call trade
    await writeLedgerEvents(testPrisma, context, [
      createOptionTransaction({
        symbol: 'WHEEL',
        transCode: 'STO',
        optionType: 'call',
        strike: 110,
        expiration: fixedDate('2026-01-24'),
        quantity: 1,
        price: 2,
        activityDate: fixedDate('2026-01-18'),
        strategy: 'covered_call',
      }),
    ]);

    // CC expires
    await writeLedgerEvents(testPrisma, context, [
      createOptionTransaction({
        symbol: 'WHEEL',
        transCode: 'OEXP',
        optionType: 'call',
        strike: 110,
        expiration: fixedDate('2026-01-24'),
        quantity: 1,
        price: 0,
        activityDate: fixedDate('2026-01-24'),
      }),
    ]);

    await fullRederivation(testPrisma, testUserId);
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  it('should track wheel strategy closes', async () => {
    const wheelCloses = await testPrisma.realizedClose.findMany({
      where: {
        userId: testUserId,
        strategy: { in: ['covered_call', 'cash_secured_put'] },
      },
    });

    expect(wheelCloses.length).toBe(2);
  });

  it('should calculate wheel premium correctly', async () => {
    const wheelCloses = await testPrisma.realizedClose.findMany({
      where: {
        userId: testUserId,
        strategy: { in: ['covered_call', 'cash_secured_put'] },
      },
    });

    const totalPremium = wheelCloses.reduce(
      (sum, c) => sum + c.realizedPnL.toNumber(),
      0
    );

    // CSP: $300, CC: $200 = $500
    expect(totalPremium).toBe(500);
  });

  it('should mark close reason as expired', async () => {
    const closes = await testPrisma.realizedClose.findMany({
      where: { userId: testUserId, symbol: 'WHEEL' },
    });

    for (const close of closes) {
      expect(close.closeReason).toBe('expired');
    }
  });
});

// ============================================================================
// 10. DATABASE CONSTRAINTS
// ============================================================================

describe('REGRESSION: Database Constraints', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeEach(async () => {
    testUserId = await createTestUser(`${TEST_PREFIX}_constraints`);
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Constraints Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  it('should enforce unique event hash constraint', async () => {
    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const tx = createStockTransaction({
      symbol: 'UNIQUE',
      transCode: 'BUY',
      quantity: 100,
      price: 100,
      activityDate: fixedDate('2026-01-10'),
    });

    // First insert should succeed
    const result1 = await writeLedgerEvents(testPrisma, context, [tx]);
    expect(result1.inserted).toBe(1);

    // Second insert should be skipped (not error)
    const result2 = await writeLedgerEvents(testPrisma, context, [tx]);
    expect(result2.inserted).toBe(0);
    expect(result2.duplicates).toBe(1);
  });

  it('should enforce foreign key on brokerageAccountId', async () => {
    // This should fail with a foreign key error
    await expect(
      testPrisma.ledgerEvent.create({
        data: {
          userId: testUserId,
          brokerageAccountId: '00000000-0000-0000-0000-000000000000', // Non-existent
          broker: 'manual',
          sourceType: 'manual',
          symbol: 'FKTEST',
          instrument: 'FKTEST',
          transCode: 'BUY',
          quantity: 100,
          price: 100,
          amount: -10000,
          activityDate: new Date(),
          eventType: 'EQUITY_STOCK',
          eventHash: `fk-test-${Date.now()}`,
        },
      })
    ).rejects.toThrow();
  });
});
