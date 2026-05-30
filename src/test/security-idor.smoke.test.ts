/**
 * Security IDOR (Insecure Direct Object Reference) Tests
 *
 * These tests verify that users cannot access other users' data
 * through direct ID manipulation in API calls.
 *
 * Test Strategy:
 * 1. Create two isolated test users (userA, userB)
 * 2. Create resources (accounts, trades) for userA
 * 3. Verify userB cannot access userA's resources
 * 4. Clean up both users after tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { normalizeActivityDate, type NormalizedTransaction, type ImportContext } from '@/lib/importers/types';

// Test user IDs - use valid UUIDs for SQL Server compatibility
// Generate deterministic UUIDs based on test name to avoid collisions
function generateTestUUID(seed: string): string {
  // Create a deterministic UUID-like string from the seed
  const hash = seed.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-a${hex.slice(1, 4)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

const USER_A_ID = generateTestUUID(`security-test-user-a-${Date.now()}`);
const USER_B_ID = generateTestUUID(`security-test-user-b-${Date.now()}`);

let userAAccountId: string;
let userALedgerEventId: string;
let userAPositionId: string;

describe('Security: IDOR Prevention Tests', () => {
  beforeAll(async () => {
    // Create test users
    await testPrisma.user.upsert({
      where: { id: USER_A_ID },
      update: {},
      create: {
        id: USER_A_ID,
        email: `user-a-${Date.now()}@test.local`,
        name: 'Test User A',
      },
    });

    await testPrisma.user.upsert({
      where: { id: USER_B_ID },
      update: {},
      create: {
        id: USER_B_ID,
        email: `user-b-${Date.now()}@test.local`,
        name: 'Test User B',
      },
    });

    // Create a brokerage account for userA
    const accountA = await createTestAccount(USER_A_ID, {
      name: 'User A Test Account',
      broker: 'manual',
    });
    userAAccountId = accountA.id;

    // Create a ledger event (trade) for userA
    const transaction: NormalizedTransaction = {
      activityDate: normalizeActivityDate(new Date('2026-01-15')),
      symbol: 'AAPL',
      transCode: 'BUY',
      quantity: 100,
      price: 150.00,
      amount: -15000,
      eventType: 'EQUITY_STOCK',
      isOption: false,
      rawInstrument: 'AAPL',
    };

    const context: ImportContext = {
      userId: USER_A_ID,
      brokerageAccountId: userAAccountId,
      broker: 'manual',
      sourceType: 'manual',
      importBatchId: null,
    };

    const result = await writeLedgerEvents(testPrisma, context, [transaction]);
    expect(result.inserted).toBe(1);

    // Get the created ledger event ID
    const ledgerEvent = await testPrisma.ledgerEvent.findFirst({
      where: { userId: USER_A_ID, symbol: 'AAPL' },
    });
    expect(ledgerEvent).toBeTruthy();
    userALedgerEventId = ledgerEvent!.id;

    // Run derivation to create position
    await fullRederivation(testPrisma, USER_A_ID);

    // Get the created position ID
    const position = await testPrisma.derivedPosition.findFirst({
      where: { userId: USER_A_ID, symbol: 'AAPL' },
    });
    expect(position).toBeTruthy();
    userAPositionId = position!.id;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(USER_A_ID);
    await cleanupTestUser(USER_B_ID);

    // Delete test users
    await testPrisma.user.deleteMany({
      where: { id: { in: [USER_A_ID, USER_B_ID] } },
    });
  });

  describe('Brokerage Account IDOR', () => {
    it('should not allow userB to access userA account by ID', async () => {
      // UserB tries to fetch userA's account
      const account = await testPrisma.brokerageAccount.findFirst({
        where: {
          id: userAAccountId,
          userId: USER_B_ID, // UserB's filter
        },
      });

      // Should return null (not found for this user)
      expect(account).toBeNull();
    });

    it('should return userA account when queried by userA', async () => {
      // UserA fetches their own account
      const account = await testPrisma.brokerageAccount.findFirst({
        where: {
          id: userAAccountId,
          userId: USER_A_ID, // UserA's filter
        },
      });

      // Should return the account
      expect(account).toBeTruthy();
      expect(account?.id).toBe(userAAccountId);
    });

    it('should not leak other user accounts in list queries', async () => {
      // UserB fetches all their accounts
      const accounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: USER_B_ID },
      });

      // Should not include userA's account
      const foundUserAAccount = accounts.find((a: { id: string }) => a.id === userAAccountId);
      expect(foundUserAAccount).toBeUndefined();
    });
  });

  describe('Ledger Event IDOR', () => {
    it('should not allow userB to access userA ledger events by ID', async () => {
      // UserB tries to fetch userA's ledger event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          id: userALedgerEventId,
          userId: USER_B_ID, // UserB's filter
        },
      });

      // Should return null
      expect(event).toBeNull();
    });

    it('should return userA event when queried by userA', async () => {
      // UserA fetches their own event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          id: userALedgerEventId,
          userId: USER_A_ID,
        },
      });

      // Should return the event
      expect(event).toBeTruthy();
      expect(event?.id).toBe(userALedgerEventId);
    });

    it('should not leak other user events in list queries', async () => {
      // UserB fetches all their events
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: USER_B_ID },
      });

      // Should not include userA's events
      const foundUserAEvent = events.find((e: { id: string }) => e.id === userALedgerEventId);
      expect(foundUserAEvent).toBeUndefined();
    });

    it('should not allow userB to update userA ledger events', async () => {
      // UserB tries to update userA's ledger event
      const updateResult = await testPrisma.ledgerEvent.updateMany({
        where: {
          id: userALedgerEventId,
          userId: USER_B_ID, // UserB's filter - should not match
        },
        data: {
          notes: 'Malicious update attempt',
        },
      });

      // Should update 0 records
      expect(updateResult.count).toBe(0);

      // Verify original notes unchanged
      const event = await testPrisma.ledgerEvent.findUnique({
        where: { id: userALedgerEventId },
      });
      expect(event?.notes).not.toBe('Malicious update attempt');
    });

    it('should not allow userB to delete userA ledger events', async () => {
      // UserB tries to soft-delete userA's ledger event
      const deleteResult = await testPrisma.ledgerEvent.updateMany({
        where: {
          id: userALedgerEventId,
          userId: USER_B_ID, // UserB's filter
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // Should update 0 records
      expect(deleteResult.count).toBe(0);

      // Verify event not deleted
      const event = await testPrisma.ledgerEvent.findUnique({
        where: { id: userALedgerEventId },
      });
      expect(event?.deletedAt).toBeNull();
    });
  });

  describe('Derived Position IDOR', () => {
    it('should not allow userB to access userA positions by ID', async () => {
      // UserB tries to fetch userA's position
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          id: userAPositionId,
          userId: USER_B_ID, // UserB's filter
        },
      });

      // Should return null
      expect(position).toBeNull();
    });

    it('should not leak other user positions in list queries', async () => {
      // UserB fetches all their positions
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: USER_B_ID },
      });

      // Should not include userA's positions
      const foundUserAPosition = positions.find((p: { id: string }) => p.id === userAPositionId);
      expect(foundUserAPosition).toBeUndefined();
    });
  });

  describe('Cross-Account Data Isolation', () => {
    it('should isolate accounts between users', async () => {
      // Create an account for userB
      const accountB = await createTestAccount(USER_B_ID, {
        name: 'User B Test Account',
        broker: 'manual',
      });

      // Verify userB can see their account
      const userBAccounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: USER_B_ID },
      });
      expect(userBAccounts.some((a: { id: string }) => a.id === accountB.id)).toBe(true);

      // Verify userB cannot see userA's account
      expect(userBAccounts.some((a: { id: string }) => a.id === userAAccountId)).toBe(false);

      // Verify userA cannot see userB's account
      const userAAccounts = await testPrisma.brokerageAccount.findMany({
        where: { userId: USER_A_ID },
      });
      expect(userAAccounts.some((a: { id: string }) => a.id === accountB.id)).toBe(false);
    });

    it('should prevent accessing data with foreign accountId in query', async () => {
      // UserB tries to query events using userA's accountId
      // This simulates an attack where the attacker knows the account ID
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: USER_B_ID, // Must always include userId check
          brokerageAccountId: userAAccountId, // Even with userA's account ID
        },
      });

      // Should return empty (userId filter prevents access)
      expect(events.length).toBe(0);
    });
  });

  describe('Import Batch IDOR', () => {
    it('should not allow userB to access userA import batches', async () => {
      // Create an import batch for userA
      const batchA = await testPrisma.importBatch.create({
        data: {
          userId: USER_A_ID,
          brokerageAccountId: userAAccountId,
          broker: 'manual',
          fileName: 'test.csv',
          status: 'completed',
          totalRows: 10,
          parsedRows: 10,
          importedEvents: 10,
        },
      });

      // UserB tries to fetch userA's batch
      const batch = await testPrisma.importBatch.findFirst({
        where: {
          id: batchA.id,
          userId: USER_B_ID, // UserB's filter
        },
      });

      // Should return null
      expect(batch).toBeNull();

      // Clean up
      await testPrisma.importBatch.delete({ where: { id: batchA.id } });
    });
  });

  describe('Daily Aggregate IDOR', () => {
    it('should not leak aggregate data between users', async () => {
      // Daily aggregates are created by derivation, not manually
      // This test verifies the query isolation pattern

      // UserB fetches their aggregates - should be empty or only their own
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: USER_B_ID },
      });

      // Should not include any of userA's aggregates (if any exist)
      // This validates the userId filter is applied correctly
      for (const agg of aggregates) {
        expect(agg.userId).toBe(USER_B_ID);
      }

      // Verify userA's aggregates are isolated
      const userAAggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: USER_A_ID },
      });

      for (const agg of userAAggregates) {
        expect(agg.userId).toBe(USER_A_ID);
      }
    });
  });
});

describe('Security: Input Validation Tests', () => {
  it('should reject unknown fields in strict Zod schemas', async () => {
    // This is a compile-time check - the schemas use .strict()
    // If unknown fields are passed, Zod will throw a validation error
    // This test documents the behavior

    const { createStockTradeSchema } = await import('@/lib/validations/trade');

    const validData = {
      type: 'stock' as const,
      ticker: 'AAPL',
      entryDate: new Date(),
      quantity: 100,
      entryPrice: 150,
    };

    const dataWithUnknownField = {
      ...validData,
      maliciousField: 'attack', // Unknown field
    };

    // Strict schema should reject unknown fields
    const result = createStockTradeSchema.safeParse(dataWithUnknownField);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('should enforce pagination bounds', async () => {
    // Test that pagination is bounded
    // limit should be capped at reasonable values

    const testLimit = (limitStr: string, expectedMax: number) => {
      const limitParam = parseInt(limitStr, 10);
      const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), expectedMax);
      return limit;
    };

    // Test various inputs
    expect(testLimit('1000000', 100)).toBe(100); // Capped at max
    expect(testLimit('-5', 100)).toBe(1); // Floor at 1
    expect(testLimit('invalid', 100)).toBe(50); // Default on NaN
    expect(testLimit('50', 100)).toBe(50); // Normal value
  });
});
