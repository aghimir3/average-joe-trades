/**
 * Manual Option Entry Smoke Tests
 *
 * End-to-end tests for option trade creation, validation, and ledger integration.
 * Tests verify that manually entered option trades correctly flow through
 * the ledger write and derivation pipeline.
 *
 * Covers:
 * - Long call/put entry (BTO)
 * - Short call/put entry (STO) - covered calls, CSPs
 * - Option closing transactions (STC, BTC)
 * - Option expiration (OEXP)
 * - Option assignment (OASGN)
 * - Multi-leg strategies
 * - Wheel strategy tracking
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
  const uniqueEmail = `manual-option-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const user = await testPrisma.user.create({
    data: {
      email: uniqueEmail,
      name: 'Manual Option Test User',
    },
  });
  return user.id;
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
    amount: rest.amount ?? (isBuy ? -quantity * price * 100 : quantity * price * 100),
    activityDate: rest.activityDate ?? fixedDate('2026-01-10'),
    isOption: true,
    optionType,
    strike,
    expiration,
    eventType: 'EQUITY_OPTION',
    rawDescription: rest.rawDescription ?? `${transCode} ${symbol} ${optionType}`,
  };
}

describe('Manual Option Entry Smoke Tests', () => {
  beforeAll(async () => {
    testUserId = await createTestUser();
    const account = await createTestAccount(testUserId, {
      broker: 'manual',
      name: 'Manual Option Test Account',
      isDefault: true,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
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

  describe('Long Call Entry', () => {
    it('should create a BTO ledger event for long call', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'AAPL',
        transCode: 'BTO',
        optionType: 'call',
        strike: 200,
        expiration: fixedDate('2026-02-21'),
        quantity: 2,
        price: 8.50,
        activityDate: fixedDate('2026-01-15'),
        strategy: 'long_call',
      });

      const result = await writeLedgerEvents(testPrisma, context, [transaction]);

      expect(result.inserted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify ledger event
      const event = await testPrisma.ledgerEvent.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          transCode: 'BTO',
          deletedAt: null,
        },
      });

      expect(event).toBeDefined();
      expect(event?.isOption).toBe(true);
      expect(event?.optionType).toBe('call');
      expect(event?.strike?.toNumber()).toBe(200);
    });

    it('should derive a long call position', async () => {
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          positionType: 'option',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('long');
      expect(position?.quantity.toNumber()).toBe(2);
      expect(position?.avgPrice.toNumber()).toBe(8.5);
      // Cost basis = 2 contracts * $8.50 * 100 = $1700
      expect(position?.costBasis.toNumber()).toBe(1700);
      expect(position?.strike?.toNumber()).toBe(200);
    });

    it('should calculate P&L when closing long call at profit', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell to close at higher premium
      const transaction = createOptionTransaction({
        symbol: 'AAPL',
        transCode: 'STC',
        optionType: 'call',
        strike: 200,
        expiration: fixedDate('2026-02-21'),
        quantity: 2,
        price: 12.00, // Higher than entry
        activityDate: fixedDate('2026-01-20'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      // Position should be closed
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          optionType: 'call',
          strike: { equals: 200 },
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull();

      // Check realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AAPL',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // P&L = (12.00 - 8.50) * 2 * 100 = $700
      expect(close?.realizedPnL.toNumber()).toBe(700);
    });
  });

  describe('Long Put Entry', () => {
    it('should create and close a long put at loss', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy put
      const buyPut = createOptionTransaction({
        symbol: 'MSFT',
        transCode: 'BTO',
        optionType: 'put',
        strike: 400,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 15.00,
        activityDate: fixedDate('2026-01-18'),
        strategy: 'long_put',
      });

      await writeLedgerEvents(testPrisma, context, [buyPut]);
      await fullRederivation(testPrisma, testUserId);

      // Verify position exists
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          optionType: 'put',
        },
      });
      expect(position).toBeDefined();
      expect(position?.side).toBe('long');

      // Sell at loss
      const sellPut = createOptionTransaction({
        symbol: 'MSFT',
        transCode: 'STC',
        optionType: 'put',
        strike: 400,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 10.00, // Loss
        activityDate: fixedDate('2026-01-25'),
      });

      await writeLedgerEvents(testPrisma, context, [sellPut]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'MSFT',
          optionType: 'put',
        },
      });

      // P&L = (10.00 - 15.00) * 1 * 100 = -$500
      expect(close?.realizedPnL.toNumber()).toBe(-500);
    });
  });

  describe('Short Option (Covered Call)', () => {
    it('should create a short call position from STO', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const transaction = createOptionTransaction({
        symbol: 'NVDA',
        transCode: 'STO',
        optionType: 'call',
        strike: 900,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 25.00,
        activityDate: fixedDate('2026-01-22'),
        strategy: 'covered_call',
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NVDA',
          optionType: 'call',
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('short');
      expect(position?.quantity.toNumber()).toBe(1);
      // Short options show premium received as positive cost basis
      expect(position?.costBasis.toNumber()).toBe(2500); // 25 * 100
    });

    it('should calculate profit when buying back covered call cheaper', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy to close at lower premium
      const transaction = createOptionTransaction({
        symbol: 'NVDA',
        transCode: 'BTC',
        optionType: 'call',
        strike: 900,
        expiration: fixedDate('2026-02-28'),
        quantity: 1,
        price: 10.00, // Cheaper than sold
        activityDate: fixedDate('2026-02-01'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'NVDA',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      // Short option profit: (entry - exit) * qty * 100 = (25 - 10) * 1 * 100 = $1500
      expect(close?.realizedPnL.toNumber()).toBe(1500);
    });
  });

  describe('Cash-Secured Put (CSP)', () => {
    it('should create and track a cash-secured put', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell put
      const transaction = createOptionTransaction({
        symbol: 'TSLA',
        transCode: 'STO',
        optionType: 'put',
        strike: 200,
        expiration: fixedDate('2026-03-15'),
        quantity: 2,
        price: 8.00,
        activityDate: fixedDate('2026-01-25'),
        strategy: 'cash_secured_put',
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'TSLA',
          optionType: 'put',
        },
      });

      expect(position).toBeDefined();
      expect(position?.side).toBe('short');
      expect(position?.strategy).toBe('cash_secured_put');
    });
  });

  describe('Option Expiration', () => {
    it('should handle option expiration (OEXP)', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Create a new option position
      const buyOption = createOptionTransaction({
        symbol: 'AMD',
        transCode: 'BTO',
        optionType: 'call',
        strike: 180,
        expiration: fixedDate('2026-01-31'),
        quantity: 1,
        price: 3.00,
        activityDate: fixedDate('2026-01-20'),
      });

      await writeLedgerEvents(testPrisma, context, [buyOption]);
      await fullRederivation(testPrisma, testUserId);

      // Option expires worthless
      const expiration = createOptionTransaction({
        symbol: 'AMD',
        transCode: 'OEXP',
        optionType: 'call',
        strike: 180,
        expiration: fixedDate('2026-01-31'),
        quantity: 1,
        price: 0,
        amount: 0,
        activityDate: fixedDate('2026-01-31'),
      });

      await writeLedgerEvents(testPrisma, context, [expiration]);
      await fullRederivation(testPrisma, testUserId);

      // Check that position is closed
      const position = await testPrisma.derivedPosition.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AMD',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });
      expect(position).toBeNull();

      // Check realized close
      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'AMD',
          optionType: 'call',
        },
      });

      expect(close).toBeDefined();
      expect(close?.closeReason).toBe('expired');
      // Lost entire premium: -$300
      expect(close?.realizedPnL.toNumber()).toBe(-300);
    });
  });

  describe('Option Assignment', () => {
    it('should handle option assignment (OASGN) for short put', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell put
      const sellPut = createOptionTransaction({
        symbol: 'META',
        transCode: 'STO',
        optionType: 'put',
        strike: 500,
        expiration: fixedDate('2026-02-15'),
        quantity: 1,
        price: 20.00,
        activityDate: fixedDate('2026-01-28'),
        strategy: 'cash_secured_put',
      });

      await writeLedgerEvents(testPrisma, context, [sellPut]);
      await fullRederivation(testPrisma, testUserId);

      // Assignment
      const assignment = createOptionTransaction({
        symbol: 'META',
        transCode: 'OASGN',
        optionType: 'put',
        strike: 500,
        expiration: fixedDate('2026-02-15'),
        quantity: 1,
        price: 0, // Assignment closes at 0
        amount: 0,
        activityDate: fixedDate('2026-02-10'),
      });

      await writeLedgerEvents(testPrisma, context, [assignment]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'META',
          optionType: 'put',
        },
      });

      expect(close).toBeDefined();
      expect(close?.closeReason).toBe('assigned');
      // Short put assigned - full premium kept: $2000
      expect(close?.realizedPnL.toNumber()).toBe(2000);
    });
  });

  describe('Multi-leg Strategy', () => {
    it('should handle iron condor legs separately', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      const positionGroupId = crypto.randomUUID();

      // Iron condor has 4 legs
      const legs = [
        // Buy put (lower strike) - protection
        createOptionTransaction({
          symbol: 'SPY',
          transCode: 'BTO',
          optionType: 'put',
          strike: 450,
          expiration: fixedDate('2026-02-21'),
          quantity: 1,
          price: 2.00,
          activityDate: fixedDate('2026-01-28'),
          positionGroupId,
        }),
        // Sell put (higher strike) - credit
        createOptionTransaction({
          symbol: 'SPY',
          transCode: 'STO',
          optionType: 'put',
          strike: 460,
          expiration: fixedDate('2026-02-21'),
          quantity: 1,
          price: 4.00,
          activityDate: fixedDate('2026-01-28'),
          positionGroupId,
        }),
        // Sell call (lower strike) - credit
        createOptionTransaction({
          symbol: 'SPY',
          transCode: 'STO',
          optionType: 'call',
          strike: 490,
          expiration: fixedDate('2026-02-21'),
          quantity: 1,
          price: 4.00,
          activityDate: fixedDate('2026-01-28'),
          positionGroupId,
        }),
        // Buy call (higher strike) - protection
        createOptionTransaction({
          symbol: 'SPY',
          transCode: 'BTO',
          optionType: 'call',
          strike: 500,
          expiration: fixedDate('2026-02-21'),
          quantity: 1,
          price: 2.00,
          activityDate: fixedDate('2026-01-28'),
          positionGroupId,
        }),
      ];

      const result = await writeLedgerEvents(testPrisma, context, legs);
      expect(result.inserted).toBe(4);

      await fullRederivation(testPrisma, testUserId);

      // Should have 4 separate positions
      const positions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          symbol: 'SPY',
        },
      });

      expect(positions.length).toBe(4);

      // Check we have both long and short positions
      const longPositions = positions.filter((p) => p.side === 'long');
      const shortPositions = positions.filter((p) => p.side === 'short');

      expect(longPositions.length).toBe(2);
      expect(shortPositions.length).toBe(2);
    });
  });

  describe('Instrument Key Matching', () => {
    it('should only match options with same symbol, type, strike, and expiration', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Buy two calls with different strikes
      const transactions = [
        createOptionTransaction({
          symbol: 'AMZN',
          transCode: 'BTO',
          optionType: 'call',
          strike: 180,
          expiration: fixedDate('2026-03-21'),
          quantity: 1,
          price: 10.00,
          activityDate: fixedDate('2026-02-01'),
        }),
        createOptionTransaction({
          symbol: 'AMZN',
          transCode: 'BTO',
          optionType: 'call',
          strike: 190, // Different strike
          expiration: fixedDate('2026-03-21'),
          quantity: 1,
          price: 6.00,
          activityDate: fixedDate('2026-02-01'),
        }),
      ];

      await writeLedgerEvents(testPrisma, context, transactions);
      await fullRederivation(testPrisma, testUserId);

      // Should have 2 separate positions
      const positions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          symbol: 'AMZN',
          optionType: 'call',
        },
      });

      expect(positions.length).toBe(2);

      // Close only the 180 strike
      const closeTransaction = createOptionTransaction({
        symbol: 'AMZN',
        transCode: 'STC',
        optionType: 'call',
        strike: 180,
        expiration: fixedDate('2026-03-21'),
        quantity: 1,
        price: 12.00,
        activityDate: fixedDate('2026-02-10'),
      });

      await writeLedgerEvents(testPrisma, context, [closeTransaction]);
      await fullRederivation(testPrisma, testUserId);

      // Should have 1 position remaining (190 strike)
      const remainingPositions = await testPrisma.derivedPosition.findMany({
        where: {
          userId: testUserId,
          symbol: 'AMZN',
          optionType: 'call',
          quantity: { gt: 0 },
        },
      });

      expect(remainingPositions.length).toBe(1);
      expect(remainingPositions[0].strike?.toNumber()).toBe(190);
    });
  });

  describe('Unknown Basis for Options', () => {
    it('should create unknown basis close when closing without matching open', async () => {
      const context: ImportContext = {
        userId: testUserId,
        brokerageAccountId: testAccountId,
        broker: 'manual',
        sourceType: 'manual',
      };

      // Sell to close without ever opening
      const transaction = createOptionTransaction({
        symbol: 'COIN',
        transCode: 'STC',
        optionType: 'put',
        strike: 100,
        expiration: fixedDate('2026-04-15'),
        quantity: 1,
        price: 5.00,
        activityDate: fixedDate('2026-02-15'),
      });

      await writeLedgerEvents(testPrisma, context, [transaction]);
      await fullRederivation(testPrisma, testUserId);

      const close = await testPrisma.realizedClose.findFirst({
        where: {
          userId: testUserId,
          symbol: 'COIN',
        },
      });

      expect(close).toBeDefined();
      expect(close?.hasUnknownBasis).toBe(true);
      expect(close?.realizedPnL.toNumber()).toBe(0);
    });
  });
});
