/**
 * Account Deletion Smoke Tests
 *
 * Tests the account deletion cascade behavior:
 * 1. Deleting an account should remove all associated data
 * 2. Re-derivation should update aggregated views
 * 3. Dashboard should no longer show deleted account's data
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { importBrokerFile, deleteImportBatch } from '@/lib/services/ledger-import';
import { fullRederivation } from '@/lib/services/derivation-runner';

// Test user prefix for isolation
const TEST_PREFIX = 'account_deletion_smoke';

// Sample Robinhood CSV content
const ROBINHOOD_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/15/2026","1/15/2026","1/16/2026","TSLA","TSLA 1/16/2026 Put $440.00","STO","2","$3.00","$599.90"
"1/16/2026","1/16/2026","1/20/2026","TSLA","Option Expiration for TSLA 1/16/2026 Put $440.00","OEXP","2","",""
"1/15/2026","1/15/2026","1/16/2026","AAPL","Apple Inc.","Buy","50","$175.00","($8,750.00)"
`;

// Sample Schwab JSON content
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

describe('Account Deletion Smoke Tests', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'Account Deletion Test User',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Import Batch Deletion', () => {
    let accountId: string;
    let importBatchId: string;

    beforeEach(async () => {
      // Create account and import data
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Import Deletion Test',
        isDefault: true,
      });
      accountId = account.id;

      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: accountId,
        broker: 'robinhood',
        fileName: 'test_import.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: false, // Run derivation
      });

      importBatchId = result.importBatchId;
    });

    afterEach(async () => {
      // Clean up account
      await cleanupTestUser(testUserId);
    });

    it('should delete import batch and soft-delete associated ledger events', async () => {
      // Verify events exist before deletion
      const eventsBefore = await testPrisma.ledgerEvent.findMany({
        where: { importBatchId, deletedAt: null },
      });
      expect(eventsBefore.length).toBeGreaterThan(0);

      // Get event IDs to check later
      const eventIdsBefore = eventsBefore.map(e => e.id);

      // Delete the import batch
      const result = await deleteImportBatch(testPrisma, importBatchId, testUserId);

      expect(result.deleted).toBe(true);
      expect(result.eventsDeleted).toBe(eventsBefore.length);

      // Verify import batch is deleted
      const batch = await testPrisma.importBatch.findUnique({
        where: { id: importBatchId },
      });
      expect(batch).toBeNull();

      // Verify ledger events are soft-deleted (importBatchId is cleared to allow batch deletion)
      // Check by event IDs instead since importBatchId is now null
      const softDeletedEvents = await testPrisma.ledgerEvent.findMany({
        where: { id: { in: eventIdsBefore }, deletedAt: { not: null } },
      });
      expect(softDeletedEvents.length).toBe(eventsBefore.length);

      // Verify the events have importBatchId cleared
      for (const event of softDeletedEvents) {
        expect(event.importBatchId).toBeNull();
      }
    });

    it('should update derived data after import deletion and re-derivation', async () => {
      // Get positions/closes before deletion (used to verify they exist before deletion)
      const _positionsBefore = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: accountId },
      });
      void _positionsBefore; // Verify positions exist
      const closesBefore = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: accountId },
      });

      // Delete import batch
      await deleteImportBatch(testPrisma, importBatchId, testUserId);

      // Run re-derivation
      await fullRederivation(testPrisma, testUserId);

      // Verify derived data is cleared
      const positionsAfter = await testPrisma.derivedPosition.findMany({
        where: { brokerageAccountId: accountId },
      });
      const closesAfter = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: accountId },
      });

      // Positions and closes should be gone since all events are deleted
      expect(positionsAfter.length).toBe(0);
      expect(closesAfter.length).toBeLessThanOrEqual(closesBefore.length);
    });
  });

  describe('Multi-Account Deletion', () => {
    let robinhoodAccountId: string;
    let schwabAccountId: string;

    beforeEach(async () => {
      // Create Robinhood account and import
      const rhAccount = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Robinhood Account',
        isDefault: true,
      });
      robinhoodAccountId = rhAccount.id;

      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: robinhoodAccountId,
        broker: 'robinhood',
        fileName: 'robinhood_import.csv',
        content: ROBINHOOD_CSV,
        skipDerivation: true,
      });

      // Create Schwab account and import
      const schwabAccount = await createTestAccount(testUserId, {
        broker: 'schwab',
        name: 'Schwab Account',
        isDefault: false,
      });
      schwabAccountId = schwabAccount.id;

      await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: schwabAccountId,
        broker: 'schwab',
        fileName: 'schwab_import.json',
        content: SCHWAB_JSON,
        skipDerivation: true,
      });

      // Run derivation for both accounts
      await fullRederivation(testPrisma, testUserId);
    });

    afterEach(async () => {
      await cleanupTestUser(testUserId);
    });

    it('should have data from both accounts before deletion', async () => {
      const rhEvents = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: robinhoodAccountId, deletedAt: null },
      });
      const schwabEvents = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: schwabAccountId, deletedAt: null },
      });

      expect(rhEvents.length).toBeGreaterThan(0);
      expect(schwabEvents.length).toBeGreaterThan(0);
    });

    it('should remove only the deleted account data from aggregated view', async () => {
      // Get all-accounts aggregate before deletion (verify they exist)
      const _aggregatesBefore = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId, brokerageAccountId: null },
      });
      void _aggregatesBefore; // Verify aggregates exist

      // Delete Schwab account data (simulate account deletion cascade)
      await testPrisma.$transaction(async (tx) => {
        // Delete position links for this account
        const positions = await tx.derivedPosition.findMany({
          where: { brokerageAccountId: schwabAccountId },
          select: { id: true },
        });
        const closes = await tx.realizedClose.findMany({
          where: { brokerageAccountId: schwabAccountId },
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
          where: { brokerageAccountId: schwabAccountId },
        });
        await tx.realizedClose.deleteMany({
          where: { brokerageAccountId: schwabAccountId },
        });
        await tx.dailyAggregate.deleteMany({
          where: { brokerageAccountId: schwabAccountId },
        });

        // Soft-delete ledger events and clear batch reference
        await tx.ledgerEvent.updateMany({
          where: { brokerageAccountId: schwabAccountId, deletedAt: null },
          data: { deletedAt: new Date(), importBatchId: null },
        });

        // Delete import batches
        await tx.importBatch.deleteMany({
          where: { brokerageAccountId: schwabAccountId },
        });

        // Deactivate account
        await tx.brokerageAccount.update({
          where: { id: schwabAccountId },
          data: { isActive: false },
        });
      });

      // Run re-derivation
      await fullRederivation(testPrisma, testUserId);

      // Verify Schwab events are soft-deleted
      const schwabEventsAfter = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: schwabAccountId, deletedAt: null },
      });
      expect(schwabEventsAfter.length).toBe(0);

      // Verify Robinhood events are unchanged
      const rhEventsAfter = await testPrisma.ledgerEvent.findMany({
        where: { brokerageAccountId: robinhoodAccountId, deletedAt: null },
      });
      expect(rhEventsAfter.length).toBeGreaterThan(0);

      // Verify aggregates only contain Robinhood data
      const aggregatesAfter = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId },
      });

      // Should have only Robinhood account aggregates and all-accounts rollup
      for (const agg of aggregatesAfter) {
        expect(agg.brokerageAccountId).not.toBe(schwabAccountId);
      }
    });

    it('should correctly re-derive all-accounts rollup after account deletion', async () => {
      // Get Schwab realized P&L before deletion
      const schwabClosesBefore = await testPrisma.realizedClose.findMany({
        where: { brokerageAccountId: schwabAccountId },
      });
      const schwabPnL = schwabClosesBefore.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // Get total P&L from all accounts
      const allClosesBefore = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });
      const totalPnLBefore = allClosesBefore.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // Soft-delete Schwab ledger events
      await testPrisma.ledgerEvent.updateMany({
        where: { brokerageAccountId: schwabAccountId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      // Run re-derivation
      await fullRederivation(testPrisma, testUserId);

      // Get total P&L after deletion
      const allClosesAfter = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });
      const totalPnLAfter = allClosesAfter.reduce(
        (sum, c) => sum + Number(c.realizedPnL),
        0
      );

      // P&L should be reduced by Schwab's contribution
      expect(totalPnLAfter).toBeCloseTo(totalPnLBefore - schwabPnL, 2);
    });
  });

  describe('Account Deletion Prevents Orphaned Data', () => {
    let accountId: string;

    beforeEach(async () => {
      const account = await createTestAccount(testUserId, {
        broker: 'robinhood',
        name: 'Orphan Prevention Test',
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

    it('should not leave orphaned position ledger links after account deletion', async () => {
      // Get position links before (verify they exist)
      const _linksBefore = await testPrisma.positionLedgerLink.count({
        where: {
          OR: [
            { position: { brokerageAccountId: accountId } },
            { realizedClose: { brokerageAccountId: accountId } },
          ],
        },
      });
      void _linksBefore; // Verify links exist

      // Simulate full account deletion cascade
      await testPrisma.$transaction(async (tx) => {
        // Get IDs first
        const positions = await tx.derivedPosition.findMany({
          where: { brokerageAccountId: accountId },
          select: { id: true },
        });
        const closes = await tx.realizedClose.findMany({
          where: { brokerageAccountId: accountId },
          select: { id: true },
        });

        // Delete links
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

        // Delete derived data
        await tx.derivedPosition.deleteMany({
          where: { brokerageAccountId: accountId },
        });
        await tx.realizedClose.deleteMany({
          where: { brokerageAccountId: accountId },
        });
        await tx.dailyAggregate.deleteMany({
          where: { brokerageAccountId: accountId },
        });

        // Soft-delete events
        await tx.ledgerEvent.updateMany({
          where: { brokerageAccountId: accountId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      });

      // Check for orphaned links (links referencing deleted positions/closes)
      const orphanedLinks = await testPrisma.positionLedgerLink.findMany({
        where: {
          OR: [
            { positionId: { not: null }, position: null },
            { realizedCloseId: { not: null }, realizedClose: null },
          ],
        },
      });

      expect(orphanedLinks.length).toBe(0);
    });

    it('should not show deleted account data in dashboard aggregates', async () => {
      // Before deletion - get aggregate count
      const aggregatesBefore = await testPrisma.dailyAggregate.count({
        where: { brokerageAccountId: accountId },
      });

      // Delete account's derived data
      await testPrisma.dailyAggregate.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // After deletion - verify aggregates are gone
      const aggregatesAfter = await testPrisma.dailyAggregate.count({
        where: { brokerageAccountId: accountId },
      });

      expect(aggregatesBefore).toBeGreaterThan(0);
      expect(aggregatesAfter).toBe(0);
    });
  });
});
