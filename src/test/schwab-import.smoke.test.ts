/**
 * Schwab Import Smoke Tests
 *
 * Tests the full import pipeline from Schwab JSON to ledger to derivation.
 * Uses real database to verify end-to-end flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { importBrokerFile, getImportHistory } from '@/lib/services/ledger-import';
import { fullRederivation } from '@/lib/services/derivation-runner';

// Test user prefix for isolation
const TEST_PREFIX = 'schwab_smoke';

// Sample Schwab JSON content based on actual Schwab export format
const SAMPLE_SCHWAB_JSON = JSON.stringify({
  FromDate: '01/01/2026',
  ToDate: '01/20/2026',
  TotalTransactionsAmount: '$3,000.00',
  BrokerageTransactions: [
    {
      Date: '01/20/2026',
      Action: 'Buy to Open',
      Symbol: 'IBIT 02/20/2026 52.50 P',
      Description: 'PUT ISHR BITCOIN TR ETF $52.5 EXP 02/20/26',
      Quantity: '5',
      Price: '$3.25',
      'Fees & Comm': '$3.30',
      Amount: '-$1,628.30',
      ItemIssueId: '128406523',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/20/2026',
      Action: 'Sell to Close',
      Symbol: 'RKT 02/20/2026 22.00 C',
      Description: 'CALL ROCKET COMPANIES CL$22 EXP 02/20/26',
      Quantity: '10',
      Price: '$1.62',
      'Fees & Comm': '$6.64',
      Amount: '$1,613.36',
      ItemIssueId: '126202746',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/16/2026',
      Action: 'Sell to Close',
      Symbol: 'MSTR 02/20/2026 160.00 C',
      Description: 'CALL STRATEGY INC $160 EXP 02/20/26',
      Quantity: '1',
      Price: '$19.50',
      'Fees & Comm': '$0.66',
      Amount: '$1,949.34',
      ItemIssueId: '111984701',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/14/2026',
      Action: 'Buy to Open',
      Symbol: 'RKT 02/20/2026 22.00 C',
      Description: 'CALL ROCKET COMPANIES CL$22 EXP 02/20/26',
      Quantity: '6',
      Price: '$2.26',
      'Fees & Comm': '$3.97',
      Amount: '-$1,359.97',
      ItemIssueId: '126202746',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/14/2026',
      Action: 'Journaled Shares',
      Symbol: 'DXYZ',
      Description: 'DESTINY TECH ...100 INC',
      Quantity: '-20',
      Price: '$29.73',
      'Fees & Comm': '',
      Amount: '',
      ItemIssueId: '83263595',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/13/2026',
      Action: 'Buy',
      Symbol: 'DXYZ',
      Description: 'DESTINY TECH ...100 INC',
      Quantity: '20',
      Price: '$29.825',
      'Fees & Comm': '',
      Amount: '-$596.50',
      ItemIssueId: '83263595',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/13/2026',
      Action: 'Journal',
      Symbol: '',
      Description: 'JOURNAL TO ...163',
      Quantity: '',
      Price: '',
      'Fees & Comm': '',
      Amount: '-$650.00',
      ItemIssueId: '0',
      AcctgRuleCd: '1',
    },
    {
      Date: '01/13/2026',
      Action: 'Buy to Open',
      Symbol: 'MSTR 02/20/2026 160.00 C',
      Description: 'CALL STRATEGY INC $160 EXP 02/20/26',
      Quantity: '1',
      Price: '$18.80',
      'Fees & Comm': '$0.66',
      Amount: '-$1,880.66',
      ItemIssueId: '111984701',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/10/2026',
      Action: 'Sell',
      Symbol: 'TSLA',
      Description: 'TESLA INC',
      Quantity: '50',
      Price: '$420.50',
      'Fees & Comm': '$0.00',
      Amount: '$21,025.00',
      ItemIssueId: '88160101',
      AcctgRuleCd: '2',
    },
    {
      Date: '01/08/2026',
      Action: 'Buy',
      Symbol: 'TSLA',
      Description: 'TESLA INC',
      Quantity: '50',
      Price: '$395.25',
      'Fees & Comm': '$0.00',
      Amount: '-$19,762.50',
      ItemIssueId: '88160101',
      AcctgRuleCd: '2',
    },
    {
      Date: '12/15/2025',
      Action: 'Expired',
      Symbol: 'SPY 12/15/2025 480.00 P',
      Description: 'PUT SPDR S&P 500 ETF $480 EXP 12/15/25',
      Quantity: '-2',
      Price: '',
      'Fees & Comm': '',
      Amount: '',
      ItemIssueId: '78901234',
      AcctgRuleCd: '2',
    },
    {
      Date: '12/01/2025',
      Action: 'Sell to Open',
      Symbol: 'SPY 12/15/2025 480.00 P',
      Description: 'PUT SPDR S&P 500 ETF $480 EXP 12/15/25',
      Quantity: '2',
      Price: '$1.50',
      'Fees & Comm': '$1.32',
      Amount: '$298.68',
      ItemIssueId: '78901234',
      AcctgRuleCd: '2',
    },
    {
      Date: '11/20/2025',
      Action: 'MoneyLink Transfer',
      Symbol: '',
      Description: 'MONEYLINK TRANSFER',
      Quantity: '',
      Price: '',
      'Fees & Comm': '',
      Amount: '$5,000.00',
      ItemIssueId: '0',
      AcctgRuleCd: '1',
    },
    {
      Date: '11/15/2025',
      Action: 'Credit Interest',
      Symbol: '',
      Description: 'CREDIT INTEREST',
      Quantity: '',
      Price: '',
      'Fees & Comm': '',
      Amount: '$12.50',
      ItemIssueId: '0',
      AcctgRuleCd: '1',
    },
  ],
});

describe('Schwab Import Smoke Tests', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    // Create a unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'Schwab Import Test User',
      },
    });
    testUserId = testUser.id;

    // Create a Schwab brokerage account
    const account = await createTestAccount(testUserId, {
      broker: 'schwab',
      name: 'Test Schwab Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Basic Schwab Import Flow', () => {
    it('should import Schwab JSON and create ledger events', async () => {
      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'schwab',
        fileName: 'schwab_trades.json',
        content: SAMPLE_SCHWAB_JSON,
        skipDerivation: true,
      });

      expect(result.success).toBe(true);
      expect(result.inserted).toBeGreaterThan(0);
      // Should skip: Journaled Shares, Journal, MoneyLink Transfer, Credit Interest
      expect(result.skippedRows).toBeGreaterThan(0);

      // Verify ledger events were created
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          deletedAt: null,
        },
      });

      expect(events.length).toBe(result.inserted);

      // Verify we have stock and option transactions
      const stockEvents = events.filter((e) => !e.isOption);
      const optionEvents = events.filter((e) => e.isOption);

      expect(stockEvents.length).toBeGreaterThan(0);
      expect(optionEvents.length).toBeGreaterThan(0);
    });

    it('should skip duplicate transactions on re-import', async () => {
      // Import the same file again
      const result = await importBrokerFile(testPrisma, {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'schwab',
        fileName: 'schwab_trades.json',
        content: SAMPLE_SCHWAB_JSON,
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
      expect(latestBatch.broker).toBe('schwab');
    });
  });

  describe('Schwab Option Symbol Parsing', () => {
    it('should correctly parse Schwab option symbols', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          isOption: true,
          deletedAt: null,
        },
      });

      // Verify BTO (buy to open) for put
      const ibitPut = events.find(
        (e) => e.symbol === 'IBIT' && e.transCode === 'BTO' && e.optionType === 'put'
      );
      expect(ibitPut).toBeDefined();
      if (ibitPut) {
        expect(ibitPut.strike?.toNumber()).toBe(52.5);
        expect(ibitPut.quantity.toNumber()).toBe(5);
      }

      // Verify STC (sell to close) for call
      const rktCall = events.find((e) => e.symbol === 'RKT' && e.transCode === 'STC');
      expect(rktCall).toBeDefined();
      if (rktCall) {
        expect(rktCall.optionType).toBe('call');
        expect(rktCall.strike?.toNumber()).toBe(22);
        expect(rktCall.quantity.toNumber()).toBe(10);
      }

      // Verify STO (sell to open)
      const spyPut = events.find((e) => e.symbol === 'SPY' && e.transCode === 'STO');
      expect(spyPut).toBeDefined();
      if (spyPut) {
        expect(spyPut.optionType).toBe('put');
        expect(spyPut.strike?.toNumber()).toBe(480);
      }

      // Verify OEXP (option expiration)
      const expiredSpy = events.find((e) => e.symbol === 'SPY' && e.transCode === 'OEXP');
      expect(expiredSpy).toBeDefined();
      if (expiredSpy) {
        expect(expiredSpy.optionType).toBe('put');
      }
    });
  });

  describe('Schwab Stock Transactions', () => {
    it('should parse stock buy and sell transactions correctly', async () => {
      const tslaEvents = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          isOption: false,
          deletedAt: null,
        },
      });

      expect(tslaEvents.length).toBe(2); // Buy and Sell

      const buyEvent = tslaEvents.find((e) => e.transCode === 'BUY');
      const sellEvent = tslaEvents.find((e) => e.transCode === 'SELL');

      expect(buyEvent).toBeDefined();
      expect(sellEvent).toBeDefined();

      if (buyEvent) {
        expect(buyEvent.quantity.toNumber()).toBe(50);
        expect(buyEvent.price?.toNumber()).toBeCloseTo(395.25, 2);
        expect(buyEvent.amount?.toNumber()).toBeCloseTo(-19762.5, 2);
      }

      if (sellEvent) {
        expect(sellEvent.quantity.toNumber()).toBe(50);
        expect(sellEvent.price?.toNumber()).toBeCloseTo(420.5, 2);
        expect(sellEvent.amount?.toNumber()).toBeCloseTo(21025, 2);
      }
    });

    it('should parse stock with decimal prices', async () => {
      const dxyzEvents = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          symbol: 'DXYZ',
          isOption: false,
          deletedAt: null,
        },
      });

      expect(dxyzEvents.length).toBe(1); // Only Buy (Journaled Shares skipped)

      const buyEvent = dxyzEvents[0];
      expect(buyEvent.transCode).toBe('BUY');
      expect(buyEvent.quantity.toNumber()).toBe(20);
      expect(buyEvent.price?.toNumber()).toBeCloseTo(29.825, 3);
    });
  });

  describe('Schwab Skipped Transactions', () => {
    it('should skip non-trade transactions', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          deletedAt: null,
        },
      });

      // Verify no Journal, Journaled Shares, MoneyLink, or Credit Interest events
      const journalEvents = events.filter((e) => e.description?.includes('JOURNAL'));
      const moneyLinkEvents = events.filter((e) => e.description?.includes('MONEYLINK'));
      const interestEvents = events.filter((e) => e.description?.includes('CREDIT INTEREST'));

      expect(journalEvents.length).toBe(0);
      expect(moneyLinkEvents.length).toBe(0);
      expect(interestEvents.length).toBe(0);
    });
  });

  describe('Schwab Derivation After Import', () => {
    it('should derive positions and P&L from imported events', async () => {
      // Run full derivation
      const derivationResult = await fullRederivation(testPrisma, testUserId);

      expect(derivationResult).toBeDefined();
      expect(derivationResult.allAccountsSummary).toBeDefined();

      // Check for derived positions (open trades)
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId },
      });

      // IBIT Put BTO should create an open position
      const ibitPosition = positions.find((p) => p.symbol === 'IBIT');
      expect(ibitPosition).toBeDefined();

      // Check for realized closes
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // TSLA Buy/Sell should create a realized close
      const tslaClosed = closes.find((c) => c.symbol === 'TSLA' && c.closeType === 'stock');
      expect(tslaClosed).toBeDefined();
      if (tslaClosed) {
        // Buy at 395.25, Sell at 420.50 = $25.25 profit per share x 50 shares = $1,262.50
        expect(tslaClosed.realizedPnL?.toNumber()).toBeCloseTo(1262.5, 0);
      }

      // SPY STO + OEXP should create realized close (premium kept) if present
      const spyClosed = closes.find((c) => c.symbol === 'SPY' && c.closeType === 'option');
      if (spyClosed) {
        // Sold for $1.50 x 100 x 2 = $300 (minus fees)
        expect(spyClosed.realizedPnL?.toNumber()).toBeGreaterThan(0);
      }

      // Should have at least some realized closes from our sample data
      expect(closes.length).toBeGreaterThan(0);
    });
  });

  describe('Schwab Price Parsing Edge Cases', () => {
    it('should handle various Schwab price formats', async () => {
      const events = await testPrisma.ledgerEvent.findMany({
        where: {
          userId: testUserId,
          deletedAt: null,
        },
      });

      // Verify prices are parsed correctly
      for (const event of events) {
        // All trade events should have a price
        if (['BUY', 'SELL', 'BTO', 'STO', 'BTC', 'STC'].includes(event.transCode)) {
          expect(event.price).not.toBeNull();
          expect(event.price?.toNumber()).toBeGreaterThan(0);
        }

        // Fees should be parsed (may be 0)
        if (event.fees !== null) {
          expect(event.fees.toNumber()).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});

describe('Schwab Real File Import', () => {
  let testUserId: string;
  let testAccountId: string;
  let schwabContent: string | null = null;

  beforeAll(async () => {
    // Try to load the actual Schwab_Data.json file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'Schwab_Data.json');
      if (fs.existsSync(filePath)) {
        schwabContent = fs.readFileSync(filePath, 'utf-8');
      }
    } catch {
      // File doesn't exist or can't be read
      schwabContent = null;
    }

    // Create a unique test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_real_${Date.now()}@test.com`,
        name: 'Schwab Real File Test User',
      },
    });
    testUserId = testUser.id;

    // Create a Schwab brokerage account
    const account = await createTestAccount(testUserId, {
      broker: 'schwab',
      name: 'Test Schwab Real Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  it('should import real Schwab_Data.json file if available', async () => {
    if (!schwabContent) {
      console.log('Schwab_Data.json not found, skipping real file test');
      return;
    }

    const result = await importBrokerFile(testPrisma, {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'schwab',
      fileName: 'Schwab_Data.json',
      content: schwabContent,
      skipDerivation: false, // Run full derivation
    });

    expect(result.success).toBe(true);
    expect(result.inserted).toBeGreaterThan(0);

    console.log('Real Schwab file import results:', {
      totalRows: result.totalRows,
      inserted: result.inserted,
      duplicates: result.duplicates,
      skipped: result.skippedRows,
      errors: result.errors?.length || 0,
      warnings: result.warnings?.length || 0,
    });

    // Verify events were created
    const events = await testPrisma.ledgerEvent.findMany({
      where: {
        userId: testUserId,
        deletedAt: null,
      },
    });

    expect(events.length).toBe(result.inserted);

    // Log summary by transaction type
    const byTransCode: Record<string, number> = {};
    for (const event of events) {
      byTransCode[event.transCode] = (byTransCode[event.transCode] || 0) + 1;
    }
    console.log('Events by transaction code:', byTransCode);

    // Verify derivation ran
    const positions = await testPrisma.derivedPosition.findMany({
      where: { userId: testUserId },
    });

    const closes = await testPrisma.realizedClose.findMany({
      where: { userId: testUserId },
    });

    console.log('Derivation results:', {
      openPositions: positions.length,
      realizedCloses: closes.length,
    });
  });
});
