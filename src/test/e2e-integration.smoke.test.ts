/**
 * End-to-End Integration Smoke Tests
 *
 * Comprehensive tests that verify the complete flow from trade entry
 * through derivation to dashboard display for all trade types.
 *
 * This test suite validates:
 * 1. Stock trades (long/short)
 * 2. Option strategies (long call, long put, covered call, cash-secured put)
 * 3. Close trade flow for all types
 * 4. Dashboard reflection (stats, calendar, trades, positions)
 * 5. Timezone handling for dates
 *
 * Each test creates trades, runs derivation, and verifies dashboard data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import type { NormalizedTransaction, ImportContext } from '@/lib/importers/types';

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
  const uniqueEmail = `e2e-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'E2E Integration Test User',
    },
  });
  return user.id;
}

/**
 * Create a normalized stock transaction for testing.
 */
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
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: true,
    optionType,
    strike,
    expiration,
    eventType: 'EQUITY_OPTION',
    rawDescription: rest.rawDescription ?? `${transCode} ${symbol} ${optionType}`,
    strategy: rest.strategy,
  };
}

describe('E2E Integration Smoke Tests', () => {
  beforeAll(async () => {
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'E2E Integration Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    await cleanupTestUser(testUserId);
    // Retry user deletion in case of write conflicts
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

  describe('1. Stock Trade Entry and Dashboard Reflection', () => {
    it('should create stock BUY and reflect in open positions', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Enter stock trade
      const transaction = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'BUY',
        quantity: 100,
        price: 200.00,
        activityDate: fixedDate('2026-01-14'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Run derivation
      await fullRederivation(testPrisma, testUserId);

      // Verify position exists
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.symbol).toBe('AAPL');
      expect(position?.quantity.toNumber()).toBe(100);
      expect(position?.avgPrice.toNumber()).toBe(200);
      expect(position?.costBasis.toNumber()).toBe(20000);
      expect(position?.side).toBe('long');

      // Verify calendar shows the open position on entry date
      // The entry date should be stored correctly at noon UTC
      const entryDate = position?.firstEntryDate;
      expect(entryDate?.toISOString().split('T')[0]).toBe('2026-01-14');
    });

    it('should close stock and reflect in realized P&L (winning trade)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell stock at profit
      const transaction = createStockTransaction({
        symbol: 'AAPL',
        transCode: 'SELL',
        quantity: 100,
        price: 220.00,
        activityDate: fixedDate('2026-01-18'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      // Position should be closed
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull();

      // Verify realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          closeType: 'stock',
        },
      });

      expect(close).toBeDefined();
      expect(close?.quantity.toNumber()).toBe(100);
      expect(close?.openPrice.toNumber()).toBe(200);
      expect(close?.closePrice.toNumber()).toBe(220);
      // P&L = (220 - 200) * 100 = $2000
      expect(close?.realizedPnL.toNumber()).toBe(2000);
      expect(close?.closeReason).toBe('normal');

      // Verify daily aggregate
      const aggregate = await testPrisma.dailyAggregate.findFirst({
        where: {
          userId: testUserId,
          brokerageAccountId: null, // All accounts rollup
        },
        orderBy: { date: 'desc' },
      });

      expect(aggregate).toBeDefined();
      expect(aggregate?.realizedPnL.toNumber()).toBe(2000);
      expect(aggregate?.winCount).toBe(1);
      expect(aggregate?.lossCount).toBe(0);
    });
  });

  describe('2. Long Call Entry and Close', () => {
    it('should create long call and reflect in open positions', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'MSFT',
        transCode: 'BTO',
        optionType: 'call',
        strike: 450,
        expiration: fixedDate('2026-02-21'),
        quantity: 2,
        price: 10.00,
        activityDate: fixedDate('2026-01-15'),
        strategy: 'long_call',
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          positionType: 'option',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('long');
      expect(position?.quantity.toNumber()).toBe(2);
      expect(position?.avgPrice.toNumber()).toBe(10);
      expect(position?.strike?.toNumber()).toBe(450);
      expect(position?.costBasis.toNumber()).toBe(2000); // 2 * 10 * 100
      expect(position?.strategy).toBe('long_call');
    });

    it('should close long call at profit and reflect in dashboard', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'MSFT',
        transCode: 'STC',
        optionType: 'call',
        strike: 450,
        expiration: fixedDate('2026-02-21'),
        quantity: 2,
        price: 15.00, // Profit
        activityDate: fixedDate('2026-01-20'),
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      // Position should be closed
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull();

      // Verify realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // Long call P&L = (15 - 10) * 2 * 100 = $1000
      expect(close?.realizedPnL.toNumber()).toBe(1000);
      expect(close?.closeReason).toBe('normal');
    });
  });

  describe('3. Long Put Entry and Close', () => {
    it('should create long put and close at loss', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Open long put
      const openTx = createOptionTransaction({
        symbol: 'NVDA',
        transCode: 'BTO',
        optionType: 'put',
        strike: 800,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 20.00,
        activityDate: fixedDate('2026-01-16'),
        strategy: 'long_put',
      });

      await writeLedgerEvents(testPrisma, context, [openTx]);
      await fullRederivation(testPrisma, testUserId);

      // Verify position
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NVDA',
          optionType: 'put',
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('long');
      expect(position?.strategy).toBe('long_put');

      // Close at loss
      const closeTx = createOptionTransaction({
        symbol: 'NVDA',
        transCode: 'STC',
        optionType: 'put',
        strike: 800,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 12.00, // Loss
        activityDate: fixedDate('2026-01-22'),
      });

      await writeLedgerEvents(testPrisma, context, [closeTx]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NVDA',
          optionType: 'put',
        },
      });

      expect(close).toBeDefined();
      // Long put P&L = (12 - 20) * 1 * 100 = -$800
      expect(close?.realizedPnL.toNumber()).toBe(-800);
    });
  });

  describe('4. Covered Call (Short Call) Entry and Close', () => {
    it('should create covered call and reflect as short position', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'TSLA',
        transCode: 'STO',
        optionType: 'call',
        strike: 300,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 15.00,
        activityDate: fixedDate('2026-01-17'),
        strategy: 'covered_call',
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          optionType: 'call',
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('short');
      expect(position?.quantity.toNumber()).toBe(1);
      expect(position?.avgPrice.toNumber()).toBe(15);
      expect(position?.strategy).toBe('covered_call');
      // Short option cost basis is premium received
      expect(position?.costBasis.toNumber()).toBe(1500);
    });

    it('should close covered call at profit (bought back cheaper)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'TSLA',
        transCode: 'BTC',
        optionType: 'call',
        strike: 300,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 5.00, // Bought back cheaper = profit
        activityDate: fixedDate('2026-01-25'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // Short option P&L = (entry - exit) * qty * 100 = (15 - 5) * 1 * 100 = $1000
      expect(close?.realizedPnL.toNumber()).toBe(1000);
    });
  });

  describe('5. Cash-Secured Put (CSP) Entry and Close', () => {
    it('should create CSP and reflect as short put position', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'AMD',
        transCode: 'STO',
        optionType: 'put',
        strike: 150,
        expiration: fixedDate('2026-03-15'),
        quantity: 2,
        price: 8.00,
        activityDate: fixedDate('2026-01-18'),
        strategy: 'cash_secured_put',
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);
      expect(result.inserted).toBe(1);

      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AMD',
          optionType: 'put',
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('short');
      expect(position?.quantity.toNumber()).toBe(2);
      expect(position?.strategy).toBe('cash_secured_put');
      expect(position?.costBasis.toNumber()).toBe(1600); // 2 * 8 * 100
    });

    it('should close CSP at loss (bought back more expensive)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'AMD',
        transCode: 'BTC',
        optionType: 'put',
        strike: 150,
        expiration: fixedDate('2026-03-15'),
        quantity: 2,
        price: 12.00, // Loss - bought back higher
        activityDate: fixedDate('2026-01-28'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AMD',
          optionType: 'put',
        },
      });

      expect(close).toBeDefined();
      // Short option P&L = (entry - exit) * qty * 100 = (8 - 12) * 2 * 100 = -$800
      expect(close?.realizedPnL.toNumber()).toBe(-800);
    });
  });

  describe('6. Dashboard Stats Reflection', () => {
    it('should calculate correct summary statistics', async () => {
      // Get all realized closes
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // Calculate expected values
      const totalPnL = closes.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
      const wins = closes.filter((c) => c.realizedPnL.toNumber() > 0).length;
      const losses = closes.filter((c) => c.realizedPnL.toNumber() < 0).length;

      // At this point we have:
      // AAPL stock: +$2000
      // MSFT call: +$1000
      // NVDA put: -$800
      // TSLA CC: +$1000
      // AMD CSP: -$800
      // Total: $2400, 3 wins, 2 losses (GOOGL not yet closed)

      expect(totalPnL).toBe(2400);
      expect(wins).toBe(3);
      expect(losses).toBe(2);

      const winRate = (wins / (wins + losses)) * 100;
      expect(winRate).toBe(60);
    });

    it('should have correct daily aggregates for each close date', async () => {
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: {
          userId: testUserId,
          brokerageAccountId: null, // All accounts rollup
        },
        orderBy: { date: 'asc' },
      });

      expect(aggregates.length).toBeGreaterThan(0);

      // Verify total from all aggregates matches total P&L at this point
      const totalFromAggregates = aggregates.reduce(
        (sum, a) => sum + a.realizedPnL.toNumber(),
        0
      );
      expect(totalFromAggregates).toBe(2400);
    });
  });

  describe('7. Calendar Date Verification', () => {
    it('should store dates correctly at UTC noon', async () => {
      // Verify that all ledger events have dates at UTC noon
      const events = await testPrisma.ledgerEvent.findMany({
        where: { userId: testUserId, deletedAt: null },
      });

      for (const event of events) {
        const hours = event.activityDate.getUTCHours();
        expect(hours).toBe(12); // Should be noon UTC
      }
    });

    it('should match calendar day to activity date correctly', async () => {
      // Get a realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId },
      });

      expect(close).toBeDefined();

      // Get the daily aggregate for that date
      const dateStr = close!.closeDate.toISOString().split('T')[0];
      const aggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId, brokerageAccountId: null },
      });

      const matchingAggregate = aggregates.find(
        (a) => a.date.toISOString().split('T')[0] === dateStr
      );

      expect(matchingAggregate).toBeDefined();
      // The day number should match
      expect(matchingAggregate?.date.getUTCDate()).toBe(close!.closeDate.getUTCDate());
    });
  });

  describe('8. Position Ledger Links for Edit Flow', () => {
    it('should create ledger links for open positions', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create a new open position
      const transaction = createStockTransaction({
        symbol: 'GOOGL',
        transCode: 'BUY',
        quantity: 50,
        price: 180.00,
        activityDate: fixedDate('2026-01-30'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      // Check that position has a ledger link with openEventId
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'GOOGL',
          quantity: { gt: 0 },
        },
        include: {
          ledgerLinks: {
            where: { openEventId: { not: null } },
            take: 1,
          },
        },
      });

      expect(position).toBeDefined();
      expect(position?.ledgerLinks.length).toBeGreaterThan(0);
      expect(position?.ledgerLinks[0].openEventId).toBeDefined();

      // Verify the linked ledger event exists
      const event = await testPrisma.ledgerEvent.findFirst({
        where: { id: position!.ledgerLinks[0].openEventId! },
      });
      expect(event).toBeDefined();
      expect(event?.symbol).toBe('GOOGL');
    });

    it('should create ledger links for closed trades with both open and close event IDs', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Close the GOOGL position
      const transaction = createStockTransaction({
        symbol: 'GOOGL',
        transCode: 'SELL',
        quantity: 50,
        price: 190.00,
        activityDate: fixedDate('2026-01-31'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      // Check realized close has ledger links
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'GOOGL',
        },
        include: {
          ledgerLinks: true,
        },
      });

      expect(close).toBeDefined();
      expect(close?.ledgerLinks.length).toBeGreaterThan(0);

      // Should have link with openEventId (partial_open type)
      const openLink = close?.ledgerLinks.find((l) => l.openEventId !== null);
      expect(openLink).toBeDefined();

      // Should have link with closeEventId (close type)
      const closeLink = close?.ledgerLinks.find((l) => l.closeEventId !== null);
      expect(closeLink).toBeDefined();
    });
  });

  describe('9. Wheel Strategy Dashboard Integration', () => {
    it('should track wheel strategy trades (CC and CSP)', async () => {
      // Query for wheel strategy closes (covered_call and cash_secured_put)
      const wheelCloses = await testPrisma.realizedClose.findMany({
        where: {
          userId: testUserId,
          strategy: { in: ['covered_call', 'cash_secured_put'] },
        },
      });

      // We created TSLA CC and AMD CSP
      expect(wheelCloses.length).toBe(2);

      // Calculate wheel premium
      const wheelPnL = wheelCloses.reduce(
        (sum, c) => sum + c.realizedPnL.toNumber(),
        0
      );
      // TSLA CC: +$1000, AMD CSP: -$800 = +$200
      expect(wheelPnL).toBe(200);
    });

    it('should track short positions in current positions', async () => {
      // Verify no open short positions (all were closed)
      const shortPositions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          side: 'short',
          quantity: { gt: 0 },
        },
      });

      expect(shortPositions.length).toBe(0);
    });
  });

  describe('10. Scatter Plot Data', () => {
    it('should provide open positions with required fields for scatter', async () => {
      const positions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          quantity: { gt: 0 },
        },
        select: {
          symbol: true,
          positionType: true,
          avgPrice: true,
          costBasis: true,
          firstEntryDate: true,
          side: true,
        },
      });

      // We have GOOGL open
      expect(positions.length).toBe(0); // GOOGL was closed in test 8

      // Verify all positions have required fields
      for (const pos of positions) {
        expect(pos.symbol).toBeTruthy();
        expect(pos.avgPrice).toBeDefined();
        expect(pos.costBasis).toBeDefined();
        expect(pos.firstEntryDate).toBeDefined();
        expect(pos.side).toBeTruthy();
      }
    });

    it('should provide closed trades with required fields for scatter', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
        select: {
          symbol: true,
          closeType: true,
          closeDate: true,
          realizedPnL: true,
          openDate: true,
        },
      });

      expect(closes.length).toBeGreaterThan(0);

      // Verify all closes have required fields
      for (const close of closes) {
        expect(close.symbol).toBeTruthy();
        expect(close.closeType).toBeTruthy();
        expect(close.closeDate).toBeDefined();
        expect(close.realizedPnL).toBeDefined();
        expect(close.openDate).toBeDefined();
      }
    });
  });

  describe('11. Recent Trades Table Data', () => {
    it('should return trades sorted by close date descending', async () => {
      const trades = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
        orderBy: { closeDate: 'desc' },
        take: 10,
      });

      expect(trades.length).toBeGreaterThan(0);

      // Verify descending order
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i - 1].closeDate.getTime()).toBeGreaterThanOrEqual(
          trades[i].closeDate.getTime()
        );
      }
    });

    it('should include ledger links for edit navigation', async () => {
      const trades = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
        include: {
          ledgerLinks: {
            select: { openEventId: true, closeEventId: true, linkType: true },
          },
        },
        take: 5,
      });

      for (const trade of trades) {
        // Each closed trade should have links
        expect(trade.ledgerLinks.length).toBeGreaterThan(0);

        // Should have at least one link with openEventId
        const hasOpenLink = trade.ledgerLinks.some((l) => l.openEventId !== null);
        expect(hasOpenLink).toBe(true);

        // Should have at least one link with closeEventId
        const hasCloseLink = trade.ledgerLinks.some((l) => l.closeEventId !== null);
        expect(hasCloseLink).toBe(true);
      }
    });
  });

  describe('12. Performance Data', () => {
    it('should identify top performers by P&L', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // Group by symbol
      const pnlBySymbol = new Map<string, number>();
      for (const close of closes) {
        const current = pnlBySymbol.get(close.symbol) ?? 0;
        pnlBySymbol.set(close.symbol, current + close.realizedPnL.toNumber());
      }

      // Find best performer
      let bestSymbol = '';
      let bestPnL = -Infinity;
      for (const [symbol, pnl] of pnlBySymbol) {
        if (pnl > bestPnL) {
          bestPnL = pnl;
          bestSymbol = symbol;
        }
      }

      // AAPL had +$2000, which is highest
      expect(bestSymbol).toBe('AAPL');
      expect(bestPnL).toBe(2000);
    });

    it('should identify worst performers by P&L', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // Group by symbol
      const pnlBySymbol = new Map<string, number>();
      for (const close of closes) {
        const current = pnlBySymbol.get(close.symbol) ?? 0;
        pnlBySymbol.set(close.symbol, current + close.realizedPnL.toNumber());
      }

      // Find worst performer
      let worstSymbol = '';
      let worstPnL = Infinity;
      for (const [symbol, pnl] of pnlBySymbol) {
        if (pnl < worstPnL) {
          worstPnL = pnl;
          worstSymbol = symbol;
        }
      }

      // Both NVDA and AMD had -$800
      expect(worstPnL).toBe(-800);
      expect(['NVDA', 'AMD']).toContain(worstSymbol);
    });

    it('should provide monthly breakdown', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // Group by month
      const monthlyPnL = new Map<string, number>();
      for (const close of closes) {
        const monthKey = `${close.closeDate.getFullYear()}-${String(
          close.closeDate.getMonth() + 1
        ).padStart(2, '0')}`;
        const current = monthlyPnL.get(monthKey) ?? 0;
        monthlyPnL.set(monthKey, current + close.realizedPnL.toNumber());
      }

      // All trades in January 2026
      // AAPL: +$2000, MSFT: +$1000, NVDA: -$800, TSLA: +$1000, AMD: -$800, GOOGL: +$500 = $2900
      expect(monthlyPnL.get('2026-01')).toBe(2900);
    });
  });
});
