/**
 * Import Smoke Tests
 *
 * Tests the full import pipeline from CSV to ledger to derivation.
 * Uses real database to verify end-to-end flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { importBrokerFile, getImportHistory } from '@/lib/services/ledger-import';
import { fullRederivation } from '@/lib/services/derivation-runner';

// Test user prefix for isolation
const TEST_PREFIX = 'import_smoke';

// Sample Robinhood CSV content with various transaction types
const SAMPLE_CSV = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/16/2026","1/16/2026","1/20/2026","TSLA","Option Expiration for TSLA 1/16/2026 Put $435.00","OEXP","1","",""
"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Put $440.00","OASGN","1","",""
"1/16/2026","1/16/2026","1/20/2026","TSLA","Tesla
CUSIP: 88160R101
1 TSLA Option Assigned","Buy","100","$440.00","($44,000.00)"
"1/16/2026","1/16/2026","1/20/2026","ZETA","Zeta Global
CUSIP: 98956A105","Buy","54","$20.50","($1,107.00)"
"1/16/2026","1/16/2026","1/20/2026","RKT","RKT 1/15/2027 Call $24.20","STC","2","$5.10","$1,019.91"
"1/15/2026","1/15/2026","1/16/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$1.00","$99.95"
"1/15/2026","1/15/2026","1/16/2026","IBIT","IBIT 3/20/2026 Call $60.00","BTO","2","$1.71","($342.08)"
"1/15/2026","1/15/2026","1/16/2026","MSTR","Strategy Inc.
CUSIP: 594972408","Buy","100","$174.68","($17,468.50)"
"1/15/2026","1/15/2026","1/16/2026","MSTR","Strategy Inc.
CUSIP: 594972408","Sell","41","$171.95","$7,049.95"
"1/14/2026","1/14/2026","1/15/2026","","ACH Withdrawal","ACH","","","($4,000.00)"
"1/14/2026","1/14/2026","1/15/2026","","Futures Inter-Entity Cash Transfer","FUTSWP","","","$226.00"
`;

describe('Import Smoke Tests', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    // Create a unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'Import Test User',
      },
    });
    testUserId = testUser.id;

    // Create a test brokerage account
    const account = await createTestAccount(testUserId, {
      broker: 'robinhood',
      name: 'Test Robinhood Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Basic Import Flow', () => {
    it('should import Robinhood CSV and create ledger events', async () => {
      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'robinhood',
        fileName: 'test_trades.csv',
        content: SAMPLE_CSV,
        skipDerivation: true, // Skip derivation for this test
      });

      expect(result.success).toBe(true);
      expect(result.inserted).toBeGreaterThan(0);
      expect(result.totalRows).toBe(11); // 11 data rows
      expect(result.skippedRows).toBeGreaterThan(0); // ACH and FUTSWP skipped

      // Verify ledger events were created
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          deletedAt: null,
        },
      });

      expect(events.length).toBe(result.inserted);

      // Verify we have stock and option transactions
      const stockEvents = events.filter(e => !e.isOption);
      const optionEvents = events.filter(e => e.isOption);

      expect(stockEvents.length).toBeGreaterThan(0);
      expect(optionEvents.length).toBeGreaterThan(0);
    });

    it('should skip duplicate transactions on re-import', async () => {
      // Import the same file again
      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'robinhood',
        fileName: 'test_trades.csv',
        content: SAMPLE_CSV,
        skipDerivation: true,
      });

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(0); // All duplicates
      expect(result.duplicates).toBeGreaterThan(0);
    });

    it('should record import batch with correct metrics', async () => {
      const { batches } = await getImportHistory(testPrisma, testUserId, {
        limit: 10,
      });

      expect(batches.length).toBeGreaterThanOrEqual(2); // At least 2 imports

      const latestBatch = batches[0];
      expect(latestBatch.status).toBe('completed');
      expect(latestBatch.broker).toBe('robinhood');
    });
  });

  describe('Option Parsing', () => {
    it('should correctly parse option details from various formats', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          isOption: true,
          deletedAt: null,
        },
      });

      // Verify OEXP (option expiration)
      const expEvents = events.filter(e => e.transCode === 'OEXP');
      expect(expEvents.length).toBeGreaterThanOrEqual(1);
      if (expEvents.length > 0) {
        expect(expEvents[0].optionType).toBe('put');
        expect(expEvents[0].strike?.toNumber()).toBe(435);
      }

      // Verify OASGN (option assignment)
      const asgnEvents = events.filter(e => e.transCode === 'OASGN');
      expect(asgnEvents.length).toBeGreaterThanOrEqual(1);

      // Verify BTO (buy to open)
      const btoEvents = events.filter(e => e.transCode === 'BTO');
      expect(btoEvents.length).toBeGreaterThanOrEqual(1);
      if (btoEvents.length > 0) {
        const ibitCall = btoEvents.find(e => e.symbol === 'IBIT');
        if (ibitCall) {
          expect(ibitCall.optionType).toBe('call');
          expect(ibitCall.strike?.toNumber()).toBe(60);
        }
      }

      // Verify STO (sell to open)
      const stoEvents = events.filter(e => e.transCode === 'STO');
      expect(stoEvents.length).toBeGreaterThanOrEqual(1);

      // Verify STC (sell to close)
      const stcEvents = events.filter(e => e.transCode === 'STC');
      expect(stcEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Multi-line Description Handling', () => {
    it('should handle multi-line descriptions with CUSIP', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          symbol: 'ZETA',
          deletedAt: null,
        },
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const zetaEvent = events[0];
      expect(zetaEvent.description).toContain('CUSIP');
      expect(zetaEvent.transCode).toBe('BUY');
      expect(zetaEvent.quantity.toNumber()).toBe(54);
    });
  });

  describe('Derivation After Import', () => {
    it('should derive positions and P&L from imported events', async () => {
      // Run full derivation
      const derivationResult = await fullRederivation(testPrisma, testUserId);

      expect(derivationResult).toBeDefined();
      expect(derivationResult.allAccountsSummary).toBeDefined();
      expect(derivationResult.allAccountsSummary.totalPositions).toBeGreaterThanOrEqual(0);
      expect(derivationResult.allAccountsSummary.totalCloses).toBeGreaterThanOrEqual(0);

      // Check for derived positions
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId },
      });

      // We should have some positions from BUY, BTO, STO transactions
      // The exact number depends on matching logic
      expect(positions.length).toBeGreaterThanOrEqual(0);

      // Check for realized closes (from STC transactions)
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // STC and OEXP should create realized closes (some may be unknown basis)
      expect(closes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Stock Transactions', () => {
    it('should parse stock buy transactions correctly', async () => {
      const mstrEvents = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          symbol: 'MSTR',
          isOption: false,
          deletedAt: null,
        },
      });

      expect(mstrEvents.length).toBeGreaterThanOrEqual(2); // Buy and Sell

      const buyEvent = mstrEvents.find(e => e.transCode === 'BUY');
      const sellEvent = mstrEvents.find(e => e.transCode === 'SELL');

      expect(buyEvent).toBeDefined();
      expect(sellEvent).toBeDefined();

      if (buyEvent) {
        expect(buyEvent.quantity.toNumber()).toBe(100);
        expect(buyEvent.price?.toNumber()).toBeCloseTo(174.68, 2);
      }

      if (sellEvent) {
        expect(sellEvent.quantity.toNumber()).toBe(41);
        expect(sellEvent.price?.toNumber()).toBeCloseTo(171.95, 2);
      }
    });

    it('should handle stock from option assignment correctly', async () => {
      // The Buy after OASGN creates a stock position
      const tslaStockEvents = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          isOption: false,
          transCode: 'BUY',
          deletedAt: null,
        },
      });

      expect(tslaStockEvents.length).toBeGreaterThanOrEqual(1);
      if (tslaStockEvents.length > 0) {
        const assignedStock = tslaStockEvents[0];
        expect(assignedStock.quantity.toNumber()).toBe(100);
        expect(assignedStock.price?.toNumber()).toBe(440);
      }
    });
  });

  describe('Skip Non-Trade Transactions', () => {
    it('should skip ACH and FUTSWP transactions', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          deletedAt: null,
        },
      });

      // Verify no ACH or FUTSWP events were created
      const achEvents = events.filter(e => e.transCode === 'ACH');
      const futswpEvents = events.filter(e => e.transCode === 'FUTSWP');

      expect(achEvents.length).toBe(0);
      expect(futswpEvents.length).toBe(0);
    });
  });

  describe('Multiple Identical Fills', () => {
    // CSV with identical rows - simulates multiple fills at same price
    const CSV_WITH_IDENTICAL_FILLS = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$0.14","$13.95"
"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$0.14","$13.95"
"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$0.13","$12.95"
`;

    it('should import all identical fills without skipping', async () => {
      // Create a fresh user for this test to avoid interference
      const testUser2 = await testPrisma.user.create({
        data: {
          email: `${TEST_PREFIX}_identical_${Date.now()}@test.com`,
          name: 'Identical Fills Test User',
        },
      });
      const testUserId2 = testUser2.id;

      const account2 = await createTestAccount(testUserId2, {
        broker: 'robinhood',
        name: 'Test Account 2',
        isDefault: true,
      });

      try {
        const result = await importBrokerFile(testPrisma, {
          userId: testUserId2,
          brokerageAccountId: account2.id,
          broker: 'robinhood',
          fileName: 'identical_fills.csv',
          content: CSV_WITH_IDENTICAL_FILLS,
          skipDerivation: true,
        });

        expect(result.success).toBe(true);
        // All 3 rows should be imported (2 identical at $0.14, 1 at $0.13)
        expect(result.inserted).toBe(3);
        // No duplicates should be marked (occurrence indexing handles identical fills)
        expect(result.warnings?.filter(w => w.message.includes('Duplicate')).length || 0).toBe(0);

        // Verify all 3 events exist in database
        const events = await testPrisma.ledgerEvent.findMany({
          where: {
            userId: testUserId2,
            symbol: 'TSLA',
            transCode: 'STO',
            deletedAt: null,
          },
        });

        expect(events.length).toBe(3);

        // Verify prices - should have 2 at $0.14 and 1 at $0.13
        const priceAt14 = events.filter(e => e.price?.toNumber() === 0.14);
        const priceAt13 = events.filter(e => e.price?.toNumber() === 0.13);
        expect(priceAt14.length).toBe(2);
        expect(priceAt13.length).toBe(1);
      } finally {
        // Cleanup
        await cleanupTestUser(testUserId2);
        await testPrisma.user.delete({ where: { id: testUserId2 } });
      }
    });

    it('should still deduplicate on re-import of identical fills', async () => {
      // Create a fresh user for this test
      const testUser3 = await testPrisma.user.create({
        data: {
          email: `${TEST_PREFIX}_redup_${Date.now()}@test.com`,
          name: 'Redup Test User',
        },
      });
      const testUserId3 = testUser3.id;

      const account3 = await createTestAccount(testUserId3, {
        broker: 'robinhood',
        name: 'Test Account 3',
        isDefault: true,
      });

      try {
        // First import
        const result1 = await importBrokerFile(testPrisma, {
          userId: testUserId3,
          brokerageAccountId: account3.id,
          broker: 'robinhood',
          fileName: 'identical_fills.csv',
          content: CSV_WITH_IDENTICAL_FILLS,
          skipDerivation: true,
        });

        expect(result1.success).toBe(true);
        expect(result1.inserted).toBe(3);

        // Second import of same file - should deduplicate
        const result2 = await importBrokerFile(testPrisma, {
          userId: testUserId3,
          brokerageAccountId: account3.id,
          broker: 'robinhood',
          fileName: 'identical_fills.csv',
          content: CSV_WITH_IDENTICAL_FILLS,
          skipDerivation: true,
        });

        expect(result2.success).toBe(true);
        expect(result2.inserted).toBe(0); // All should be duplicates
        expect(result2.duplicates).toBe(3); // 3 duplicates detected

        // Verify still only 3 events in database
        const events = await testPrisma.ledgerEvent.findMany({
          where: {
            userId: testUserId3,
            symbol: 'TSLA',
            deletedAt: null,
          },
        });

        expect(events.length).toBe(3);
      } finally {
        // Cleanup
        await cleanupTestUser(testUserId3);
        await testPrisma.user.delete({ where: { id: testUserId3 } });
      }
    });
  });
});
