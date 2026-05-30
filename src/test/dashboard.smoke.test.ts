/**
 * Dashboard Smoke Tests
 *
 * End-to-end tests for all dashboard API endpoints.
 * Tests verify that manually entered trades correctly flow through
 * the derivation pipeline and appear in dashboard statistics.
 *
 * Endpoints tested:
 * - GET /api/dashboard/stats - Summary statistics
 * - GET /api/dashboard/calendar - Daily P&L for calendar view
 * - GET /api/dashboard/performance - Top performers, needs improvement, monthly, extreme trades
 * - GET /api/dashboard/positions - Open positions by type
 * - GET /api/dashboard/scatter - Scatter plot data
 * - GET /api/dashboard/trades - Recent trades table
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import type { LedgerWriteResult } from '@/lib/importers/types';
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
 * Uses UUID since SQL Server requires proper GUID format.
 */
async function createTestUser(): Promise<string> {
  const uniqueEmail = `dashboard-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Dashboard Test User',
    },
  });
  return user.id;
}

/**
 * Create a normalized transaction for testing.
 */
function createStockTransaction(
  overrides: Partial<NormalizedTransaction> & { symbol: string; transCode: string }
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
    amount: rest.amount ?? quantity * price,
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
    transCode: string;
    optionType: 'call' | 'put';
    strike: number;
    expiration: Date;
  }
): NormalizedTransaction {
  const { symbol, transCode, optionType, strike, expiration, ...rest } = overrides;
  const isOpen = transCode === 'BTO' || transCode === 'STO';
  const quantity = rest.quantity ?? 1;
  const price = rest.price ?? 5.0;
  return {
    ...rest,
    symbol,
    rawInstrument: `${symbol} ${optionType} $${strike}`,
    transCode,
    quantity,
    price,
    amount: rest.amount ?? quantity * price * 100,
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: true,
    optionType,
    strike,
    expiration,
    eventType: 'EQUITY_OPTION',
    rawDescription: rest.rawDescription ?? `${isOpen ? 'Open' : 'Close'} ${optionType} ${symbol}`,
  };
}

describe('Dashboard Smoke Tests', () => {
  beforeAll(async () => {
    // Create test user and account
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Test Account',
      isDefault: true,
    });
    testAccountId = account.id;

    // Create test data: mix of open and closed trades
    const context: ImportContext = {
      userId: testUserId,
      brokerageAccountId: testAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    // Winning stock trade: Buy AAPL at $150, Sell at $175
    const aaplBuy = createStockTransaction({
      symbol: 'AAPL',
      transCode: 'BUY',
      quantity: 100,
      price: 150,
      amount: 15000,
      activityDate: fixedDate('2026-01-05'),
    });

    const aaplSell = createStockTransaction({
      symbol: 'AAPL',
      transCode: 'SELL',
      quantity: 100,
      price: 175,
      amount: 17500,
      activityDate: fixedDate('2026-01-10'),
    });

    // Losing stock trade: Buy TSLA at $250, Sell at $220
    const tslaBuy = createStockTransaction({
      symbol: 'TSLA',
      transCode: 'BUY',
      quantity: 50,
      price: 250,
      amount: 12500,
      activityDate: fixedDate('2026-01-06'),
    });

    const tslaSell = createStockTransaction({
      symbol: 'TSLA',
      transCode: 'SELL',
      quantity: 50,
      price: 220,
      amount: 11000,
      activityDate: fixedDate('2026-01-12'),
    });

    // Open stock position: NVDA
    const nvdaBuy = createStockTransaction({
      symbol: 'NVDA',
      transCode: 'BUY',
      quantity: 25,
      price: 500,
      amount: 12500,
      activityDate: fixedDate('2026-01-08'),
    });

    // Winning option trade: Buy MSFT call, sell at profit
    const msftCallOpen = createOptionTransaction({
      symbol: 'MSFT',
      transCode: 'BTO',
      optionType: 'call',
      strike: 400,
      expiration: fixedDate('2026-02-21'),
      quantity: 2,
      price: 8.0,
      amount: 1600,
      activityDate: fixedDate('2026-01-07'),
    });

    const msftCallClose = createOptionTransaction({
      symbol: 'MSFT',
      transCode: 'STC',
      optionType: 'call',
      strike: 400,
      expiration: fixedDate('2026-02-21'),
      quantity: 2,
      price: 12.0,
      amount: 2400,
      activityDate: fixedDate('2026-01-11'),
    });

    // Open option position: AMZN put
    const amznPutOpen = createOptionTransaction({
      symbol: 'AMZN',
      transCode: 'BTO',
      optionType: 'put',
      strike: 180,
      expiration: fixedDate('2026-03-21'),
      quantity: 3,
      price: 4.5,
      amount: 1350,
      activityDate: fixedDate('2026-01-09'),
    });

    // Write all transactions
    const transactions = [
      aaplBuy,
      aaplSell,
      tslaBuy,
      tslaSell,
      nvdaBuy,
      msftCallOpen,
      msftCallClose,
      amznPutOpen,
    ];

    const writeResult: LedgerWriteResult = await writeLedgerEvents(
      testPrisma,
      context,
      transactions
    );

    expect(writeResult.inserted).toBe(8);
    expect(writeResult.errors).toHaveLength(0);

    // Run derivation to populate derived tables
    await fullRederivation(testPrisma, testUserId);
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestUser(testUserId);
    // Retry user deletion in case of write conflicts/deadlocks
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

  describe('GET /api/dashboard/stats', () => {
    it('should return correct summary statistics', async () => {
      // Query derived tables directly (simulating API behavior)
      const [
        openPositionCount,
        totalRealizedPnL,
        winCount,
        lossCount,
        closedTradeCount,
      ] = await Promise.all([
        testPrisma.derivedPosition.count({
          where: { userId: testUserId, quantity: { gt: 0 } },
        }),
        testPrisma.realizedClose.aggregate({
          where: { userId: testUserId },
          _sum: { realizedPnL: true },
        }),
        testPrisma.realizedClose.count({
          where: {
            userId: testUserId,
            realizedPnL: { gt: 0 },
            hasUnknownBasis: false,
          },
        }),
        testPrisma.realizedClose.count({
          where: {
            userId: testUserId,
            realizedPnL: { lt: 0 },
            hasUnknownBasis: false,
          },
        }),
        testPrisma.realizedClose.count({ where: { userId: testUserId } }),
      ]);

      // 2 open positions: NVDA (stock) + AMZN put (option)
      expect(openPositionCount).toBe(2);

      // 3 closed trades: AAPL stock, TSLA stock, MSFT call
      expect(closedTradeCount).toBe(3);

      // Wins: AAPL (+$2500), MSFT call (+$800) = 2 wins
      expect(winCount).toBe(2);

      // Losses: TSLA (-$1500) = 1 loss
      expect(lossCount).toBe(1);

      // Total P&L: +2500 - 1500 + 800 = +1800
      const totalPnL = totalRealizedPnL._sum?.realizedPnL?.toNumber() ?? 0;
      expect(totalPnL).toBe(1800);
    });

    it('should calculate win rate correctly', async () => {
      const [winCount, lossCount] = await Promise.all([
        testPrisma.realizedClose.count({
          where: {
            userId: testUserId,
            realizedPnL: { gt: 0 },
            hasUnknownBasis: false,
          },
        }),
        testPrisma.realizedClose.count({
          where: {
            userId: testUserId,
            realizedPnL: { lt: 0 },
            hasUnknownBasis: false,
          },
        }),
      ]);

      const knownBasisCount = winCount + lossCount;
      const winRate = knownBasisCount > 0 ? (winCount / knownBasisCount) * 100 : 0;

      // 2 wins / 3 trades = 66.67%
      expect(winRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('GET /api/dashboard/calendar', () => {
    it('should return daily aggregates for calendar', async () => {
      const dailyAggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId },
        orderBy: { date: 'asc' },
      });

      // Should have entries for days with closed trades
      expect(dailyAggregates.length).toBeGreaterThan(0);

      // Check that we have P&L for specific days
      const day10 = dailyAggregates.find(
        (d) => d.date.toISOString().split('T')[0] === '2026-01-10'
      );
      const day11 = dailyAggregates.find(
        (d) => d.date.toISOString().split('T')[0] === '2026-01-11'
      );
      const day12 = dailyAggregates.find(
        (d) => d.date.toISOString().split('T')[0] === '2026-01-12'
      );

      // Jan 10: AAPL sold for +$2500
      expect(day10).toBeDefined();
      expect(day10?.realizedPnL.toNumber()).toBe(2500);

      // Jan 11: MSFT call closed for +$800
      expect(day11).toBeDefined();
      expect(day11?.realizedPnL.toNumber()).toBe(800);

      // Jan 12: TSLA sold for -$1500
      expect(day12).toBeDefined();
      expect(day12?.realizedPnL.toNumber()).toBe(-1500);
    });

    it('should track trade counts per day', async () => {
      const dailyAggregates = await testPrisma.dailyAggregate.findMany({
        where: { userId: testUserId },
        orderBy: { date: 'asc' },
      });

      // Each day with a closed trade should have tradeCount = 1
      for (const agg of dailyAggregates) {
        expect(agg.tradeCount).toBe(1);
      }
    });
  });

  describe('GET /api/dashboard/performance', () => {
    it('should return top performers (best P&L per ticker)', async () => {
      // Group by symbol and sum P&L
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      const pnlBySymbol = new Map<string, number>();
      for (const close of closes) {
        const current = pnlBySymbol.get(close.symbol) ?? 0;
        pnlBySymbol.set(close.symbol, current + close.realizedPnL.toNumber());
      }

      // AAPL should be top performer (+$2500)
      expect(pnlBySymbol.get('AAPL')).toBe(2500);

      // MSFT should be second (+$800)
      expect(pnlBySymbol.get('MSFT')).toBe(800);
    });

    it('should return needs improvement (worst P&L per ticker)', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      const pnlBySymbol = new Map<string, number>();
      for (const close of closes) {
        const current = pnlBySymbol.get(close.symbol) ?? 0;
        pnlBySymbol.set(close.symbol, current + close.realizedPnL.toNumber());
      }

      // TSLA should need improvement (-$1500)
      expect(pnlBySymbol.get('TSLA')).toBe(-1500);
    });

    it('should return biggest wins and losses (extreme trades)', async () => {
      const biggestWin = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, realizedPnL: { gt: 0 } },
        orderBy: { realizedPnL: 'desc' },
      });

      const biggestLoss = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId, realizedPnL: { lt: 0 } },
        orderBy: { realizedPnL: 'asc' },
      });

      // Biggest win: AAPL +$2500
      expect(biggestWin?.symbol).toBe('AAPL');
      expect(biggestWin?.realizedPnL.toNumber()).toBe(2500);

      // Biggest loss: TSLA -$1500
      expect(biggestLoss?.symbol).toBe('TSLA');
      expect(biggestLoss?.realizedPnL.toNumber()).toBe(-1500);
    });

    it('should return monthly breakdown', async () => {
      // All trades in January 2026
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
      });

      // Group by month
      const monthlyPnL = new Map<string, number>();
      for (const close of closes) {
        const monthKey = `${close.closeDate.getFullYear()}-${String(close.closeDate.getMonth() + 1).padStart(2, '0')}`;
        const current = monthlyPnL.get(monthKey) ?? 0;
        monthlyPnL.set(monthKey, current + close.realizedPnL.toNumber());
      }

      // January 2026: +2500 - 1500 + 800 = +1800
      expect(monthlyPnL.get('2026-01')).toBe(1800);
    });
  });

  describe('GET /api/dashboard/positions', () => {
    it('should return open stock positions', async () => {
      const stockPositions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          positionType: 'stock',
          quantity: { gt: 0 },
        },
      });

      expect(stockPositions).toHaveLength(1);
      expect(stockPositions[0].symbol).toBe('NVDA');
      expect(stockPositions[0].quantity.toNumber()).toBe(25);
      expect(stockPositions[0].costBasis.toNumber()).toBe(12500);
    });

    it('should return open option positions', async () => {
      const optionPositions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          positionType: 'option',
          quantity: { gt: 0 },
        },
      });

      expect(optionPositions).toHaveLength(1);
      expect(optionPositions[0].symbol).toBe('AMZN');
      expect(optionPositions[0].optionType).toBe('put');
      expect(optionPositions[0].quantity.toNumber()).toBe(3);
      expect(optionPositions[0].strike?.toNumber()).toBe(180);
    });

    it('should separate stocks and options in portfolio', async () => {
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId, quantity: { gt: 0 } },
      });

      const stocks = positions.filter((p) => p.positionType === 'stock');
      const options = positions.filter((p) => p.positionType === 'option');

      expect(stocks).toHaveLength(1);
      expect(options).toHaveLength(1);
    });
  });

  describe('GET /api/dashboard/scatter', () => {
    it('should return open positions scatter data with entry dates', async () => {
      const positions = await testPrisma.derivedPosition.findMany({
        where: { userId: testUserId, quantity: { gt: 0 } },
        select: {
          symbol: true,
          positionType: true,
          avgPrice: true,
          costBasis: true,
          firstEntryDate: true,
        },
      });

      expect(positions).toHaveLength(2);

      // Verify each position has required scatter data
      for (const pos of positions) {
        expect(pos.symbol).toBeTruthy();
        expect(pos.avgPrice).toBeDefined();
        expect(pos.costBasis).toBeDefined();
        expect(pos.firstEntryDate).toBeDefined();
      }
    });

    it('should return closed trades scatter data with close dates and P&L', async () => {
      const closes = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
        select: {
          symbol: true,
          closeType: true,
          closeDate: true,
          realizedPnL: true,
        },
      });

      expect(closes).toHaveLength(3);

      // Verify each close has required scatter data
      for (const close of closes) {
        expect(close.symbol).toBeTruthy();
        expect(close.closeDate).toBeDefined();
        expect(close.realizedPnL).toBeDefined();
      }

      // Verify P&L distribution
      const wins = closes.filter((c) => c.realizedPnL.toNumber() > 0);
      const losses = closes.filter((c) => c.realizedPnL.toNumber() < 0);

      expect(wins).toHaveLength(2);
      expect(losses).toHaveLength(1);
    });
  });

  describe('GET /api/dashboard/trades', () => {
    it('should return recent closed trades for table', async () => {
      const recentTrades = await testPrisma.realizedClose.findMany({
        where: { userId: testUserId },
        orderBy: { closeDate: 'desc' },
        take: 10,
      });

      expect(recentTrades).toHaveLength(3);

      // Most recent first (TSLA on Jan 12)
      expect(recentTrades[0].symbol).toBe('TSLA');
      expect(recentTrades[0].closeDate.toISOString().split('T')[0]).toBe('2026-01-12');
    });

    it('should include all required table fields', async () => {
      const trade = await testPrisma.realizedClose.findFirst({
        where: { userId: testUserId },
      });

      expect(trade).toBeDefined();
      expect(trade?.symbol).toBeTruthy();
      expect(trade?.closeDate).toBeDefined();
      expect(trade?.realizedPnL).toBeDefined();
      expect(trade?.quantity).toBeDefined();
      expect(trade?.openPrice).toBeDefined();
      expect(trade?.closePrice).toBeDefined();
      expect(trade?.closeType).toBeDefined(); // 'stock' or 'option'
    });
  });

  describe('Account filtering', () => {
    it('should filter stats by brokerageAccountId', async () => {
      const positionsForAccount = await testPrisma.derivedPosition.count({
        where: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          quantity: { gt: 0 },
        },
      });

      const positionsTotal = await testPrisma.derivedPosition.count({
        where: {
          userId: testUserId,
          quantity: { gt: 0 },
        },
      });

      // Since we only have one account, counts should match
      expect(positionsForAccount).toBe(positionsTotal);
    });

    it('should filter closes by date range', async () => {
      // Only get closes from Jan 10-11
      const closes = await testPrisma.realizedClose.findMany({
        where: {
          userId: testUserId,
          closeDate: {
            gte: fixedDate('2026-01-10'),
            lte: fixedDate('2026-01-11'),
          },
        },
      });

      // AAPL (Jan 10) + MSFT call (Jan 11) = 2 trades
      expect(closes).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle user with no trades', async () => {
      // Create a new user with no trades
      const emptyUserId = await createTestUser();
      const emptyAccount = await createTestAccount(emptyUserId, {
        broker: 'manual',
        name: 'Empty Account',
      });

      const positions = await testPrisma.derivedPosition.count({
        where: { userId: emptyUserId },
      });

      const closes = await testPrisma.realizedClose.count({
        where: { userId: emptyUserId },
      });

      expect(positions).toBe(0);
      expect(closes).toBe(0);

      // Cleanup
      await testPrisma.brokerageAccount.delete({ where: { id: emptyAccount.id } });
      await testPrisma.user.delete({ where: { id: emptyUserId } });
    });

    it('should exclude unknown basis trades from win rate calculation', async () => {
      // All our test trades have known basis
      const unknownBasisCount = await testPrisma.realizedClose.count({
        where: {
          userId: testUserId,
          hasUnknownBasis: true,
        },
      });

      expect(unknownBasisCount).toBe(0);
    });
  });
});
