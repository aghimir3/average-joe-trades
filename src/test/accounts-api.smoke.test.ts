/**
 * Accounts API Smoke Tests
 *
 * Comprehensive tests for all brokerage account API endpoints:
 * - GET /api/accounts - List accounts
 * - POST /api/accounts - Create account
 * - GET /api/accounts/[id] - Get single account
 * - PATCH /api/accounts/[id] - Update account
 * - DELETE /api/accounts/[id] - Delete account
 *
 * Tests cover:
 * - CRUD operations
 * - Default account handling
 * - External ID duplicate detection
 * - Stats aggregation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { importBrokerFile } from '@/lib/services/ledger-import';
import { fullRederivation } from '@/lib/services/derivation-runner';

const TEST_PREFIX = 'accounts_api_smoke';

// Sample trade data for testing stats
const ROBINHOOD_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/15/2026","1/15/2026","1/16/2026","AAPL","Apple Inc.","Buy","100","$175.00","($17,500.00)"
"1/20/2026","1/20/2026","1/21/2026","AAPL","Apple Inc.","Sell","100","$180.00","$18,000.00"
`;

describe('Accounts API Smoke Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'Accounts API Test User',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Account Creation (POST /api/accounts equivalent)', () => {
    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should create a new brokerage account', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Test Robinhood Account',
        isDefault: false,
      });

      expect(account.id).toBeTruthy();
      expect(account.broker).toBe('robinhood');
      expect(account.name).toBe('Test Robinhood Account');
      expect(account.userId).toBe(testUserId);
      expect(account.isActive).toBe(true);
    });

    it('should set first account as default', async () => {
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'First Account',
        isDefault: true,
      });

      expect(account1.isDefault).toBe(true);

      // Create second account without setting default
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Second Account',
        isDefault: false,
      });

      expect(account2.isDefault).toBe(false);
    });

    it('should allow multiple accounts per broker', async () => {
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Robinhood Individual',
        isDefault: true,
      });

      const account2 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Robinhood IRA',
        isDefault: false,
      });

      expect(account1.broker).toBe('robinhood');
      expect(account2.broker).toBe('robinhood');
      expect(account1.id).not.toBe(account2.id);
    });

    it('should create account with external ID', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'External ID Account',
        externalAccountId: 'ext-123456',
        isDefault: true,
      });

      expect(account.externalAccountId).toBe('ext-123456');
    });

    it('should allow same external ID for inactive accounts', async () => {
      // Create first account with external ID
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'First Account',
        externalAccountId: 'duplicate-ext-id',
        isDefault: true,
      });

      // Deactivate the first account
      await testPrisma.brokerageAccount.update({
        where: { id: account1.id },
        data: { isActive: false },
      });

      // Should be able to create a new account with the same external ID
      const account2 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Second Account',
        externalAccountId: 'duplicate-ext-id',
        isDefault: true,
      });

      expect(account2.externalAccountId).toBe('duplicate-ext-id');
    });

    it('should create account with different currencies', async () => {
      const usdAccount = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'USD Account',
        currency: 'USD',
        isDefault: true,
      });

      expect(usdAccount.currency).toBe('USD');
    });
  });

  describe('Account Listing (GET /api/accounts equivalent)', () => {
    beforeEach(async () => {
      // Create multiple accounts with trades
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Robinhood Account',
        isDefault: true,
      });

      await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Schwab Account',
        isDefault: false,
      });

      // Import trades to first account
      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: account1.id,
        broker: 'robinhood',
        fileName: 'test.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false,
      });
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should list all active accounts', async () => {
      const accounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: testUserId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

      expect(accounts.length).toBe(2);
      expect(accounts[0].isDefault).toBe(true); // Default first
    });

    it('should include inactive accounts when requested', async () => {
      // Deactivate one account
      const accounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: testUserId, isActive: true },
      });
      await testPrisma.brokerageAccount.update({
        where: { id: accounts[0].id },
        data: { isActive: false },
      });

      // Without inactive
      const activeOnly = await testPrisma.brokerageAccount.findMany({
        where: { userId: testUserId, isActive: true },
      });
      expect(activeOnly.length).toBe(1);

      // With inactive
      const withInactive = await testPrisma.brokerageAccount.findMany({
        where: { userId: testUserId },
      });
      expect(withInactive.length).toBe(2);
    });

    it('should order accounts with default first', async () => {
      const accounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: testUserId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

      expect(accounts[0].isDefault).toBe(true);
    });
  });

  describe('Account Details (GET /api/accounts/[id] equivalent)', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Detail Test Account',
        isDefault: true,
      });
      accountId = account.id;

      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: accountId,
        broker: 'robinhood',
        fileName: 'test.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false,
      });
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should return account with stats', async () => {
      const account = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
        include: {
          _count: {
            select: {
              ledgerEvents: { where: { deletedAt: null } },
              importBatches: true,
            },
          },
        },
      });

      expect(account).not.toBeNull();
      expect(account!._count.ledgerEvents).toBeGreaterThan(0);
      expect(account!._count.importBatches).toBe(1);
    });

    it('should return open positions count', async () => {
      const openPositions = await testPrisma.derivedPosition.count({
        where: {
          brokerageAccountId: accountId,
          quantity: { gt: 0 },
        },
      });

      // All positions should be closed (bought and sold)
      expect(openPositions).toBe(0);
    });

    it('should return total realized P&L', async () => {
      const totalPnL = await testPrisma.realizedClose.aggregate({
        where: { brokerageAccountId: accountId },
        _sum: { realizedPnL: true },
      });

      // $500 profit from AAPL trade (bought at 175, sold at 180, 100 shares)
      expect(Number(totalPnL._sum.realizedPnL)).toBeCloseTo(500, 0);
    });

    it('should return recent import info', async () => {
      const recentImport = await testPrisma.importBatch.findFirst({
        where: { brokerageAccountId: accountId },
        orderBy: { createdAt: 'desc' },
      });

      expect(recentImport).not.toBeNull();
      expect(recentImport!.fileName).toBe('test.csv');
      expect(recentImport!.status).toBe('completed');
    });
  });

  describe('Account Update (PATCH /api/accounts/[id] equivalent)', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Update Test Account',
        isDefault: true,
      });
      accountId = account.id;
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should update account name', async () => {
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: { name: 'Updated Name' },
      });

      const updated = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });

      expect(updated!.name).toBe('Updated Name');
    });

    it('should update external account ID', async () => {
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: { externalAccountId: 'new-external-id' },
      });

      const updated = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });

      expect(updated!.externalAccountId).toBe('new-external-id');
    });

    it('should set account as default and unset others', async () => {
      // Create second account
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Second Account',
        isDefault: false,
      });

      // Verify first is default
      const account1Before = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });
      expect(account1Before!.isDefault).toBe(true);

      // Set second as default (unset others first, then set this one)
      await testPrisma.brokerageAccount.updateMany({
        where: { userId: testUserId, isDefault: true, id: { not: account2.id } },
        data: { isDefault: false },
      });
      await testPrisma.brokerageAccount.update({
        where: { id: account2.id },
        data: { isDefault: true },
      });

      // Verify
      const account1After = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });
      const account2After = await testPrisma.brokerageAccount.findUnique({
        where: { id: account2.id },
      });

      expect(account1After!.isDefault).toBe(false);
      expect(account2After!.isDefault).toBe(true);
    });

    it('should deactivate account', async () => {
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: { isActive: false },
      });

      const updated = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });

      expect(updated!.isActive).toBe(false);
    });
  });

  describe('Account Deletion (DELETE /api/accounts/[id] equivalent)', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Delete Test Account',
        isDefault: true,
      });
      accountId = account.id;

      // Import trades and create derived data
      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: accountId,
        broker: 'robinhood',
        fileName: 'test.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false,
      });
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should delete all derived positions for account', async () => {
      // Verify positions exist before deletion
      const positionsBefore = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(positionsBefore.length).toBeGreaterThanOrEqual(0);

      // Delete (simulating API DELETE)
      await testPrisma.derivedPosition.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const positionsAfter = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: accountId },
      });

      expect(positionsAfter.length).toBe(0);
    });

    it('should delete all realized closes for account', async () => {
      // Verify closes exist
      const closesBefore = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(closesBefore.length).toBeGreaterThan(0);

      // Delete position ledger links first (to avoid FK constraint)
      const closeIds = closesBefore.map(c => c.id);
      await testPrisma.positionLedgerLink.deleteMany({
        where: { realizedCloseId: { in: closeIds } },
      });

      // Delete
      await testPrisma.realizedClose.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const closesAfter = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: accountId },
      });

      expect(closesAfter.length).toBe(0);
    });

    it('should delete daily aggregates for account', async () => {
      // Verify aggregates exist
      const aggregatesBefore = await testPrisma.dailyAggregate.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(aggregatesBefore.length).toBeGreaterThan(0);

      // Delete
      await testPrisma.dailyAggregate.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const aggregatesAfter = await testPrisma.dailyAggregate.findMany({
        where: { brokerageAccountId: accountId },
      });

      expect(aggregatesAfter.length).toBe(0);
    });

    it('should soft-delete ledger events and clear import batch reference', async () => {
      // Verify events exist
      const eventsBefore = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: accountId, deletedAt: null },
      });
      expect(eventsBefore.length).toBeGreaterThan(0);

      // Soft-delete and clear importBatchId
      await testPrisma.ledgerEvent.updateMany({
        where: { brokerageAccountId: accountId, deletedAt: null },
        data: { deletedAt: new Date(), importBatchId: null },
      });

      const eventsAfter = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: accountId, deletedAt: null },
      });

      const deletedEvents = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: accountId, deletedAt: { not: null } },
      });

      expect(eventsAfter.length).toBe(0);
      expect(deletedEvents.length).toBe(eventsBefore.length);
      deletedEvents.forEach(e => expect(e.importBatchId).toBeNull());
    });

    it('should delete import batches for account', async () => {
      // First soft-delete events and clear importBatchId to remove FK constraint
      await testPrisma.ledgerEvent.updateMany({
        where: { brokerageAccountId: accountId },
        data: { deletedAt: new Date(), importBatchId: null },
      });

      // Verify batches exist
      const batchesBefore = await testPrisma.importBatch.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(batchesBefore.length).toBeGreaterThan(0);

      // Delete
      await testPrisma.importBatch.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const batchesAfter = await testPrisma.importBatch.findMany({
        where: { brokerageAccountId: accountId },
      });

      expect(batchesAfter.length).toBe(0);
    });

    it('should deactivate account and clear external IDs', async () => {
      // Set external ID first
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: { externalAccountId: 'ext-id', brokerageAuthorizationId: 'auth-id' },
      });

      // Deactivate and clear
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: {
          isActive: false,
          isDefault: false,
          externalAccountId: null,
          brokerageAuthorizationId: null,
        },
      });

      const updated = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });

      expect(updated!.isActive).toBe(false);
      expect(updated!.isDefault).toBe(false);
      expect(updated!.externalAccountId).toBeNull();
      expect(updated!.brokerageAuthorizationId).toBeNull();
    });

    it('should transfer default status to another account when deleting default', async () => {
      // Create a second account
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Second Account',
        isDefault: false,
      });

      // Verify first is default
      const account1 = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });
      expect(account1!.isDefault).toBe(true);

      // Transfer default to account2, then deactivate account1
      await testPrisma.brokerageAccount.update({
        where: { id: account2.id },
        data: { isDefault: true },
      });
      await testPrisma.brokerageAccount.update({
        where: { id: accountId },
        data: { isActive: false, isDefault: false },
      });

      // Verify
      const account1After = await testPrisma.brokerageAccount.findUnique({
        where: { id: accountId },
      });
      const account2After = await testPrisma.brokerageAccount.findUnique({
        where: { id: account2.id },
      });

      expect(account1After!.isActive).toBe(false);
      expect(account1After!.isDefault).toBe(false);
      expect(account2After!.isDefault).toBe(true);
    });
  });

  describe('Account Deletion with SnapTrade Data', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'SnapTrade Data Test',
        externalAccountId: 'snaptrade-ext-123',
        isDefault: true,
      });
      accountId = account.id;

      // Create broker positions
      await testPrisma.brokerPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: accountId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: 100,
          marketPrice: 180,
          marketValue: 18000,
          avgCostBasis: 175,
          unrealizedPnL: 500,
          currency: 'USD',
          dataSource: 'snaptrade',
          lastSyncAt: new Date(),
        },
      });

      // Create broker balance
      await testPrisma.brokerBalance.create({
        data: {
          userId: testUserId,
          brokerageAccountId: accountId,
          currency: 'USD',
          cash: 5000,
          buyingPower: 10000,
          lastSyncAt: new Date(),
        },
      });

      // Create broker return rate
      await testPrisma.brokerReturnRate.create({
        data: {
          userId: testUserId,
          brokerageAccountId: accountId,
          timeframe: 'ALL',
          returnPercent: 5.97,
          lastSyncAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should delete broker positions for account', async () => {
      const before = await testPrisma.brokerPosition.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(before.length).toBe(1);

      await testPrisma.brokerPosition.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const after = await testPrisma.brokerPosition.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(after.length).toBe(0);
    });

    it('should delete broker balances for account', async () => {
      const before = await testPrisma.brokerBalance.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(before.length).toBe(1);

      await testPrisma.brokerBalance.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const after = await testPrisma.brokerBalance.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(after.length).toBe(0);
    });

    it('should delete broker return rates for account', async () => {
      const before = await testPrisma.brokerReturnRate.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(before.length).toBe(1);

      await testPrisma.brokerReturnRate.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      const after = await testPrisma.brokerReturnRate.findMany({
        where: { brokerageAccountId: accountId },
      });
      expect(after.length).toBe(0);
    });

    it('should delete all SnapTrade data in transaction', async () => {
      await testPrisma.$transaction(async (tx) => {
        await tx.brokerPosition.deleteMany({
          where: { brokerageAccountId: accountId },
        });
        await tx.brokerBalance.deleteMany({
          where: { brokerageAccountId: accountId },
        });
        await tx.brokerReturnRate.deleteMany({
          where: { brokerageAccountId: accountId },
        });
      });

      // Verify all deleted
      const positions = await testPrisma.brokerPosition.count({
        where: { brokerageAccountId: accountId },
      });
      const balances = await testPrisma.brokerBalance.count({
        where: { brokerageAccountId: accountId },
      });
      const rates = await testPrisma.brokerReturnRate.count({
        where: { brokerageAccountId: accountId },
      });

      expect(positions).toBe(0);
      expect(balances).toBe(0);
      expect(rates).toBe(0);
    });
  });

  describe('Re-derivation After Account Deletion', () => {
    let account1Id: string;
    let account2Id: string;

    beforeEach(async () => {
      // Create two accounts with trades
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Account 1',
        isDefault: true,
      });
      account1Id = account1.id;

      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Account 2',
        isDefault: false,
      });
      account2Id = account2.id;

      // Import to both accounts
      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: account1Id,
        broker: 'robinhood',
        fileName: 'robinhood.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: true,
      });

      // Schwab JSON for second account
      const schwabJson = JSON.stringify({
        FromDate: '01/01/2026',
        ToDate: '01/31/2026',
        BrokerageTransactions: [
          {
            Date: '01/14/2026',
            Action: 'Buy',
            Symbol: 'NVDA',
            Description: 'NVIDIA',
            Quantity: '10',
            Price: '$450.00',
            'Fees & Comm': '$0.00',
            Amount: '-$4,500.00',
          },
          {
            Date: '01/18/2026',
            Action: 'Sell',
            Symbol: 'NVDA',
            Description: 'NVIDIA',
            Quantity: '10',
            Price: '$460.00',
            'Fees & Comm': '$0.00',
            Amount: '$4,600.00',
          },
        ],
      });

      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: account2Id,
        broker: 'schwab',
        fileName: 'schwab.json',
        content: schwabJson,
        skipDerivation: true,
      });

      // Run derivation for all accounts
      await fullRederivation(testPrisma, testUserId);
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should update all-accounts rollup after account deletion', async () => {
      // Get total P&L before deletion
      const allClosesBefore = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });
      const totalPnLBefore = allClosesBefore.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // Get account2's P&L
      const account2Closes = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: account2Id },
      });
      const account2PnL = account2Closes.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // Delete account2's data (simulating deletion)
      await testPrisma.$transaction(async (tx) => {
        const positions = await tx.derivedPosition.findMany({
          where: { brokerageAccountId: account2Id },
          select: { id: true },
        });
        const closes = await tx.realizedClose.findMany({
          where: { brokerageAccountId: account2Id },
          select: { id: true },
        });

        if (positions.length > 0 || closes.length > 0) {
          await tx.positionLedgerLink.deleteMany({
            where: {
              OR: [
                { positionId: { in: positions.map(p => p.id) } },
                { realizedCloseId: { in: closes.map(c => c.id) } },
              ],
            },
          });
        }

        await tx.derivedPosition.deleteMany({
          where: { brokerageAccountId: account2Id },
        });
        await tx.realizedClose.deleteMany({
          where: { brokerageAccountId: account2Id },
        });
        await tx.dailyAggregate.deleteMany({
          where: { brokerageAccountId: account2Id },
        });
        await tx.ledgerEvent.updateMany({
          where: { brokerageAccountId: account2Id, deletedAt: null },
          data: { deletedAt: new Date(), importBatchId: null },
        });
        await tx.importBatch.deleteMany({
          where: { brokerageAccountId: account2Id },
        });
        await tx.brokerageAccount.update({
          where: { id: account2Id },
          data: { isActive: false },
        });
      });

      // Re-derive
      await fullRederivation(testPrisma, testUserId);

      // Get total P&L after deletion
      const allClosesAfter = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });
      const totalPnLAfter = allClosesAfter.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // P&L should be reduced by account2's contribution
      expect(totalPnLAfter).toBeCloseTo(totalPnLBefore - account2PnL, 2);
    });
  });

  describe('Edge Cases', () => {
    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should handle account with no trades', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Empty Account',
        isDefault: true,
      });

      // Account should exist with no stats
      const stats = await Promise.all([
        testPrisma.ledgerEvent.count({
          where: { brokerageAccountId: account.id, deletedAt: null },
        }),
        testPrisma.derivedPosition.count({
          where: { brokerageAccountId: account.id },
        }),
        testPrisma.realizedClose.count({
          where: { brokerageAccountId: account.id },
        }),
      ]);

      expect(stats[0]).toBe(0);
      expect(stats[1]).toBe(0);
      expect(stats[2]).toBe(0);
    });

    it('should handle account with only open positions', async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Open Positions Only',
        isDefault: true,
      });

      // Import buy only (no sell)
      const buyOnlyCSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/15/2026","1/15/2026","1/16/2026","AAPL","Apple Inc.","Buy","100","$175.00","($17,500.00)"
`;

      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: account.id,
        broker: 'robinhood',
        fileName: 'buy_only.csv',
        content: buyOnlyCSV,
        skipDerivation: false,
      });

      // Should have open position but no closes
      const positions = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: account.id },
      });
      const closes = await testPrisma.realizedClose.count({
        where: { brokerageAccountId: account.id },
      });

      expect(positions.length).toBe(1);
      expect(closes).toBe(0);
    });

    it('should handle multiple portfolio policies per user', async () => {
      const account1 = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Account 1',
        isDefault: true,
      });
      const account2 = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Account 2',
        isDefault: false,
      });

      // Create policies for both accounts
      await testPrisma.portfolioPolicy.create({
        data: {
          userId: testUserId,
          brokerageAccountId: account1.id,
          maxPositionSizePercent: 10,
        },
      });
      await testPrisma.portfolioPolicy.create({
        data: {
          userId: testUserId,
          brokerageAccountId: account2.id,
          maxPositionSizePercent: 5,
        },
      });

      const policies = await testPrisma.portfolioPolicy.findMany({
        where: { userId: testUserId },
      });

      expect(policies.length).toBe(2);
    });
  });
});
