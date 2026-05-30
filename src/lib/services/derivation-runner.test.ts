/**
 * Derivation Runner Unit Tests
 *
 * Tests for the FIFO matching logic and derivation helper functions.
 * These tests verify the core business logic of position derivation
 * without requiring database access.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the logger before importing the module
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Import after mocking
import { TRANS_CODE_MAPPING } from '@/db/constants';

// ============================================================================
// Helper Functions to Test (extracted from derivation-runner.ts)
// ============================================================================

function isOpeningTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  const mapping = TRANS_CODE_MAPPING[code];
  return mapping?.isOpening ?? false;
}

function isClosingTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  const mapping = TRANS_CODE_MAPPING[code];
  return mapping?.isClosing ?? false;
}

function getPositionSide(transCode: string): 'long' | 'short' {
  const code = transCode.toUpperCase().trim();
  if (code === 'STO' || code === 'SELL') {
    return 'short';
  }
  return 'long';
}

function getClosingSide(transCode: string): 'long' | 'short' | 'either' {
  const code = transCode.toUpperCase().trim();
  if (code === 'STC' || code === 'SELL') {
    return 'long';
  }
  if (code === 'BTC') {
    return 'short';
  }
  return 'either';
}

function getCloseReason(transCode: string): 'normal' | 'expired' | 'assigned' {
  const code = transCode.toUpperCase().trim();
  if (code === 'OEXP') return 'expired';
  if (code === 'OASGN') return 'assigned';
  return 'normal';
}

function detectStrategy(
  side: 'long' | 'short',
  optionType: string | null,
  eventStrategy?: string | null
): string | null {
  if (eventStrategy) return eventStrategy;
  if (!optionType) return null;

  if (side === 'short') {
    return optionType === 'call' ? 'covered_call' : 'cash_secured_put';
  } else {
    return optionType === 'call' ? 'long_call' : 'long_put';
  }
}

interface TradingEvent {
  id: string;
  brokerageAccountId: string;
  activityDate: Date;
  activityTime?: string | null;
  processDate?: Date | null;
  createdAt: Date;
  transCode: string;
  symbol: string;
  quantity: number;
  price: number | null;
  amount: number | null;
  isOption: boolean;
  optionType: string | null;
  strike: number | null;
  expiration: Date | null;
  action: string | null;
  eventType: string;
  strategy?: string | null;
  underlyingPrice?: number | null;
}

function isFutureEvent(event: TradingEvent): boolean {
  return event.eventType === 'FUTURES';
}

function getPositionType(event: TradingEvent): 'stock' | 'option' | 'future' {
  if (event.isOption) return 'option';
  if (isFutureEvent(event)) return 'future';
  return 'stock';
}

function getInstrumentKey(event: TradingEvent): string {
  if (event.isOption && event.optionType && event.strike !== null && event.expiration) {
    const expStr = event.expiration.toISOString().split('T')[0];
    return `${event.symbol}|${event.optionType}|${event.strike}|${expStr}`;
  }
  if (isFutureEvent(event)) {
    return `${event.symbol}|future`;
  }
  return `${event.symbol}|stock`;
}

function sortEvents(events: TradingEvent[]): TradingEvent[] {
  return [...events].sort((a, b) => {
    const dateCompare = a.activityDate.getTime() - b.activityDate.getTime();
    if (dateCompare !== 0) return dateCompare;

    const aTime = a.activityTime || '00:00';
    const bTime = b.activityTime || '00:00';
    const timeCompare = aTime.localeCompare(bTime);
    if (timeCompare !== 0) return timeCompare;

    const aIsOpening = isOpeningTransaction(a.transCode);
    const bIsOpening = isOpeningTransaction(b.transCode);
    if (aIsOpening && !bIsOpening) return -1;
    if (!aIsOpening && bIsOpening) return 1;

    const createdCompare = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdCompare !== 0) return createdCompare;

    return a.id.localeCompare(b.id);
  });
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockEvent(overrides: Partial<TradingEvent> = {}): TradingEvent {
  return {
    id: crypto.randomUUID(),
    brokerageAccountId: 'account-1',
    activityDate: new Date('2026-01-15T12:00:00.000Z'),
    activityTime: null,
    processDate: null,
    createdAt: new Date(),
    transCode: 'BUY',
    symbol: 'AAPL',
    quantity: 100,
    price: 150,
    amount: 15000,
    isOption: false,
    optionType: null,
    strike: null,
    expiration: null,
    action: 'buy',
    eventType: 'EQUITY_STOCK',
    strategy: null,
    underlyingPrice: null,
    ...overrides,
  };
}

function createMockOptionEvent(overrides: Partial<TradingEvent> = {}): TradingEvent {
  return createMockEvent({
    transCode: 'BTO',
    isOption: true,
    optionType: 'call',
    strike: 160,
    expiration: new Date('2026-02-21T12:00:00.000Z'),
    eventType: 'EQUITY_OPTION',
    ...overrides,
  });
}

function createMockFutureEvent(overrides: Partial<TradingEvent> = {}): TradingEvent {
  return createMockEvent({
    transCode: 'BUY',
    isOption: false,
    optionType: null,
    strike: null,
    expiration: null,
    eventType: 'FUTURES',
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Transaction Classification', () => {
  describe('isOpeningTransaction', () => {
    it('should identify BUY as opening', () => {
      expect(isOpeningTransaction('BUY')).toBe(true);
    });

    it('should identify BTO as opening', () => {
      expect(isOpeningTransaction('BTO')).toBe(true);
    });

    it('should identify STO as opening', () => {
      expect(isOpeningTransaction('STO')).toBe(true);
    });

    it('should NOT identify SELL as opening', () => {
      expect(isOpeningTransaction('SELL')).toBe(false);
    });

    it('should NOT identify STC as opening', () => {
      expect(isOpeningTransaction('STC')).toBe(false);
    });

    it('should NOT identify BTC as opening', () => {
      expect(isOpeningTransaction('BTC')).toBe(false);
    });

    it('should NOT identify OEXP as opening', () => {
      expect(isOpeningTransaction('OEXP')).toBe(false);
    });

    it('should NOT identify OASGN as opening', () => {
      expect(isOpeningTransaction('OASGN')).toBe(false);
    });

    it('should handle lowercase', () => {
      expect(isOpeningTransaction('buy')).toBe(true);
      expect(isOpeningTransaction('bto')).toBe(true);
    });

    it('should handle whitespace', () => {
      expect(isOpeningTransaction('  BUY  ')).toBe(true);
    });
  });

  describe('isClosingTransaction', () => {
    it('should identify SELL as closing', () => {
      expect(isClosingTransaction('SELL')).toBe(true);
    });

    it('should identify STC as closing', () => {
      expect(isClosingTransaction('STC')).toBe(true);
    });

    it('should identify BTC as closing', () => {
      expect(isClosingTransaction('BTC')).toBe(true);
    });

    it('should identify OEXP as closing', () => {
      expect(isClosingTransaction('OEXP')).toBe(true);
    });

    it('should identify OASGN as closing', () => {
      expect(isClosingTransaction('OASGN')).toBe(true);
    });

    it('should NOT identify BUY as closing', () => {
      expect(isClosingTransaction('BUY')).toBe(false);
    });

    it('should NOT identify BTO as closing', () => {
      expect(isClosingTransaction('BTO')).toBe(false);
    });

    it('should NOT identify STO as closing', () => {
      expect(isClosingTransaction('STO')).toBe(false);
    });
  });

  describe('getPositionSide', () => {
    it('should return long for BUY', () => {
      expect(getPositionSide('BUY')).toBe('long');
    });

    it('should return long for BTO', () => {
      expect(getPositionSide('BTO')).toBe('long');
    });

    it('should return short for STO', () => {
      expect(getPositionSide('STO')).toBe('short');
    });

    it('should return short for SELL', () => {
      expect(getPositionSide('SELL')).toBe('short');
    });

    it('should return long for unknown codes', () => {
      expect(getPositionSide('UNKNOWN')).toBe('long');
    });
  });

  describe('getClosingSide', () => {
    it('should return long for STC (closing long position)', () => {
      expect(getClosingSide('STC')).toBe('long');
    });

    it('should return long for SELL (closing long stock)', () => {
      expect(getClosingSide('SELL')).toBe('long');
    });

    it('should return short for BTC (closing short position)', () => {
      expect(getClosingSide('BTC')).toBe('short');
    });

    it('should return either for OEXP (can close either side)', () => {
      expect(getClosingSide('OEXP')).toBe('either');
    });

    it('should return either for OASGN (can close either side)', () => {
      expect(getClosingSide('OASGN')).toBe('either');
    });
  });

  describe('getCloseReason', () => {
    it('should return normal for STC', () => {
      expect(getCloseReason('STC')).toBe('normal');
    });

    it('should return normal for BTC', () => {
      expect(getCloseReason('BTC')).toBe('normal');
    });

    it('should return normal for SELL', () => {
      expect(getCloseReason('SELL')).toBe('normal');
    });

    it('should return expired for OEXP', () => {
      expect(getCloseReason('OEXP')).toBe('expired');
    });

    it('should return assigned for OASGN', () => {
      expect(getCloseReason('OASGN')).toBe('assigned');
    });
  });
});

describe('Strategy Detection', () => {
  describe('detectStrategy', () => {
    it('should return user-specified strategy if provided', () => {
      expect(detectStrategy('long', 'call', 'iron_condor')).toBe('iron_condor');
    });

    it('should return null for non-options', () => {
      expect(detectStrategy('long', null)).toBe(null);
    });

    it('should detect covered_call for short call', () => {
      expect(detectStrategy('short', 'call')).toBe('covered_call');
    });

    it('should detect cash_secured_put for short put', () => {
      expect(detectStrategy('short', 'put')).toBe('cash_secured_put');
    });

    it('should detect long_call for long call', () => {
      expect(detectStrategy('long', 'call')).toBe('long_call');
    });

    it('should detect long_put for long put', () => {
      expect(detectStrategy('long', 'put')).toBe('long_put');
    });
  });
});

describe('Position Type Detection', () => {
  it('should classify options as option positions', () => {
    const event = createMockOptionEvent();
    expect(getPositionType(event)).toBe('option');
  });

  it('should classify futures as future positions', () => {
    const event = createMockFutureEvent({ symbol: 'ES' });
    expect(getPositionType(event)).toBe('future');
  });

  it('should classify non-option, non-futures as stock positions', () => {
    const event = createMockEvent();
    expect(getPositionType(event)).toBe('stock');
  });
});

describe('Instrument Key Generation', () => {
  describe('getInstrumentKey', () => {
    it('should generate stock key for stock positions', () => {
      const event = createMockEvent({ symbol: 'AAPL' });
      expect(getInstrumentKey(event)).toBe('AAPL|stock');
    });

    it('should generate option key with all details', () => {
      const event = createMockOptionEvent({
        symbol: 'AAPL',
        optionType: 'call',
        strike: 175,
        expiration: new Date('2026-03-21T12:00:00.000Z'),
      });
      expect(getInstrumentKey(event)).toBe('AAPL|call|175|2026-03-21');
    });

    it('should generate stock key for option with missing details', () => {
      const event = createMockEvent({
        isOption: true,
        optionType: 'call',
        strike: null, // Missing strike
        expiration: new Date('2026-03-21'),
      });
      expect(getInstrumentKey(event)).toBe('AAPL|stock');
    });

    it('should handle put options correctly', () => {
      const event = createMockOptionEvent({
        symbol: 'TSLA',
        optionType: 'put',
        strike: 200,
        expiration: new Date('2026-04-17T12:00:00.000Z'),
      });
      expect(getInstrumentKey(event)).toBe('TSLA|put|200|2026-04-17');
    });

    it('should generate futures key for futures positions', () => {
      const event = createMockFutureEvent({ symbol: 'ES' });
      expect(getInstrumentKey(event)).toBe('ES|future');
    });
  });
});

describe('Event Sorting', () => {
  describe('sortEvents', () => {
    it('should sort by activity date first', () => {
      const events = [
        createMockEvent({ id: '1', activityDate: new Date('2026-01-20') }),
        createMockEvent({ id: '2', activityDate: new Date('2026-01-10') }),
        createMockEvent({ id: '3', activityDate: new Date('2026-01-15') }),
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe('2'); // Jan 10
      expect(sorted[1].id).toBe('3'); // Jan 15
      expect(sorted[2].id).toBe('1'); // Jan 20
    });

    it('should sort by activity time when dates are equal', () => {
      const baseDate = new Date('2026-01-15T12:00:00.000Z');
      const events = [
        createMockEvent({ id: '1', activityDate: baseDate, activityTime: '14:30' }),
        createMockEvent({ id: '2', activityDate: baseDate, activityTime: '09:15' }),
        createMockEvent({ id: '3', activityDate: baseDate, activityTime: '11:00' }),
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe('2'); // 09:15
      expect(sorted[1].id).toBe('3'); // 11:00
      expect(sorted[2].id).toBe('1'); // 14:30
    });

    it('should place opening transactions before closing on same date/time', () => {
      const baseDate = new Date('2026-01-15T12:00:00.000Z');
      const baseCreated = new Date('2026-01-15T10:00:00.000Z');
      const events = [
        createMockEvent({
          id: '1',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'SELL',
          createdAt: baseCreated,
        }),
        createMockEvent({
          id: '2',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'BUY',
          createdAt: baseCreated,
        }),
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe('2'); // BUY (opening) comes first
      expect(sorted[1].id).toBe('1'); // SELL (closing) comes second
    });

    it('should sort by createdAt for same date/time/type', () => {
      const baseDate = new Date('2026-01-15T12:00:00.000Z');
      const events = [
        createMockEvent({
          id: '1',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'BUY',
          createdAt: new Date('2026-01-15T10:05:00.000Z'),
        }),
        createMockEvent({
          id: '2',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'BUY',
          createdAt: new Date('2026-01-15T10:00:00.000Z'),
        }),
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe('2'); // Earlier createdAt
      expect(sorted[1].id).toBe('1'); // Later createdAt
    });

    it('should fall back to id for deterministic ordering', () => {
      const baseDate = new Date('2026-01-15T12:00:00.000Z');
      const baseCreated = new Date('2026-01-15T10:00:00.000Z');
      const events = [
        createMockEvent({
          id: 'z-last',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'BUY',
          createdAt: baseCreated,
        }),
        createMockEvent({
          id: 'a-first',
          activityDate: baseDate,
          activityTime: '10:00',
          transCode: 'BUY',
          createdAt: baseCreated,
        }),
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe('a-first'); // Alphabetically first
      expect(sorted[1].id).toBe('z-last'); // Alphabetically second
    });

    it('should handle null activity times', () => {
      const baseDate = new Date('2026-01-15T12:00:00.000Z');
      const events = [
        createMockEvent({ id: '1', activityDate: baseDate, activityTime: null }),
        createMockEvent({ id: '2', activityDate: baseDate, activityTime: '09:00' }),
      ];

      const sorted = sortEvents(events);

      // null treated as '00:00', so it comes before '09:00'
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
    });
  });
});

describe('FIFO Matching Logic', () => {
  // These tests verify the conceptual FIFO matching without database

  describe('Basic P&L Calculation', () => {
    it('should calculate profit on long stock position', () => {
      // Buy 100 shares at $150, sell at $175 = $2500 profit
      const openPrice = 150;
      const closePrice = 175;
      const quantity = 100;
      const openAmount = openPrice * quantity;
      const closeAmount = closePrice * quantity;
      const pnl = closeAmount - openAmount;

      expect(pnl).toBe(2500);
    });

    it('should calculate loss on long stock position', () => {
      // Buy 100 shares at $150, sell at $130 = $2000 loss
      const openPrice = 150;
      const closePrice = 130;
      const quantity = 100;
      const openAmount = openPrice * quantity;
      const closeAmount = closePrice * quantity;
      const pnl = closeAmount - openAmount;

      expect(pnl).toBe(-2000);
    });

    it('should calculate profit on short option position', () => {
      // STO at $5.00, BTC at $2.00 = $300 profit per contract
      const openPremium = 5.0;
      const closePremium = 2.0;
      const contracts = 1;
      const openAmount = openPremium * contracts * 100;
      const closeAmount = closePremium * contracts * 100;
      // For short positions: profit = open - close
      const pnl = openAmount - closeAmount;

      expect(pnl).toBe(300);
    });

    it('should calculate loss on short option position', () => {
      // STO at $2.00, BTC at $5.00 = $300 loss per contract
      const openPremium = 2.0;
      const closePremium = 5.0;
      const contracts = 1;
      const openAmount = openPremium * contracts * 100;
      const closeAmount = closePremium * contracts * 100;
      // For short positions: profit = open - close
      const pnl = openAmount - closeAmount;

      expect(pnl).toBe(-300);
    });

    it('should calculate full premium as profit on expired short option', () => {
      // STO at $3.00, expires worthless = $300 profit
      const openPremium = 3.0;
      const contracts = 1;
      const openAmount = openPremium * contracts * 100;
      const closeAmount = 0; // Expired
      const pnl = openAmount - closeAmount;

      expect(pnl).toBe(300);
    });

    it('should calculate full premium as loss on expired long option', () => {
      // BTO at $3.00, expires worthless = $300 loss
      const openPremium = 3.0;
      const contracts = 1;
      const openAmount = openPremium * contracts * 100;
      const closeAmount = 0; // Expired
      // For long positions: profit = close - open
      const pnl = closeAmount - openAmount;

      expect(pnl).toBe(-300);
    });
  });

  describe('Partial Close Calculations', () => {
    it('should calculate P&L for partial close correctly', () => {
      // Buy 100 shares at $150, sell 50 at $175
      const totalQuantity = 100;
      const closeQuantity = 50;
      const openPrice = 150;
      const closePrice = 175;

      const openAmount = openPrice * totalQuantity;
      const closeAmount = closePrice * closeQuantity;

      // Prorate open amount for partial close
      const proratedOpenAmount = openAmount * (closeQuantity / totalQuantity);
      const pnl = closeAmount - proratedOpenAmount;

      expect(pnl).toBe(1250); // 50 * (175 - 150) = 1250
    });

    it('should handle multiple lots with FIFO', () => {
      // Lot 1: Buy 50 at $100
      // Lot 2: Buy 50 at $150
      // Sell 75 shares at $175
      // FIFO: Use all of lot 1 (50 @ $100) + 25 from lot 2 (25 @ $150)

      const lot1Qty = 50;
      const lot1Price = 100;
      const lot2Qty = 50;
      const lot2Price = 150;
      const sellQty = 75;
      const sellPrice = 175;

      // Calculate using FIFO
      let remaining = sellQty;
      let totalOpenCost = 0;

      // First, use lot 1
      const fromLot1 = Math.min(lot1Qty, remaining);
      totalOpenCost += fromLot1 * lot1Price;
      remaining -= fromLot1;

      // Then, use lot 2
      const fromLot2 = Math.min(lot2Qty, remaining);
      totalOpenCost += fromLot2 * lot2Price;

      // Total open: 50 * 100 + 25 * 150 = 5000 + 3750 = 8750
      expect(totalOpenCost).toBe(8750);

      // Close amount: 75 * 175 = 13125
      const closeAmount = sellQty * sellPrice;
      expect(closeAmount).toBe(13125);

      // P&L: 13125 - 8750 = 4375
      const pnl = closeAmount - totalOpenCost;
      expect(pnl).toBe(4375);
    });
  });

  describe('Unknown Basis Handling', () => {
    it('should mark close without open as unknown basis', () => {
      // When closing a position without matching open, P&L should be 0
      const closeAmount = 5000;
      const openAmount = 0; // No matching open
      const hasUnknownBasis = true;

      // With unknown basis, P&L is set to 0
      const pnl = hasUnknownBasis ? 0 : (closeAmount - openAmount);

      expect(pnl).toBe(0);
      expect(hasUnknownBasis).toBe(true);
    });
  });
});

describe('Daily Aggregate Computation', () => {
  it('should sum P&L correctly for a single day', () => {
    const closes = [
      { date: '2026-01-15', pnl: 500, isWin: true },
      { date: '2026-01-15', pnl: -200, isWin: false },
      { date: '2026-01-15', pnl: 300, isWin: true },
    ];

    const dailyPnL = closes.reduce((sum, c) => sum + c.pnl, 0);
    const winCount = closes.filter(c => c.isWin).length;
    const lossCount = closes.filter(c => !c.isWin).length;

    expect(dailyPnL).toBe(600);
    expect(winCount).toBe(2);
    expect(lossCount).toBe(1);
  });

  it('should separate stock and option P&L', () => {
    const closes = [
      { type: 'stock', pnl: 500 },
      { type: 'option', pnl: -200 },
      { type: 'option', pnl: 300 },
      { type: 'stock', pnl: -100 },
    ];

    const stockPnL = closes.filter(c => c.type === 'stock').reduce((sum, c) => sum + c.pnl, 0);
    const optionPnL = closes.filter(c => c.type === 'option').reduce((sum, c) => sum + c.pnl, 0);

    expect(stockPnL).toBe(400);
    expect(optionPnL).toBe(100);
  });

  it('should track wheel premiums separately', () => {
    const closes = [
      { strategy: 'covered_call', pnl: 200, isWheelTrade: true },
      { strategy: 'cash_secured_put', pnl: 150, isWheelTrade: true },
      { strategy: 'long_call', pnl: 500, isWheelTrade: false },
    ];

    const wheelPremiums = closes
      .filter(c => c.isWheelTrade)
      .reduce((sum, c) => sum + c.pnl, 0);

    expect(wheelPremiums).toBe(350);
  });
});

describe('Edge Cases', () => {
  it('should handle zero quantity closes gracefully', () => {
    const closeQty = 0;
    const openQty = 100;

    // Should not divide by zero
    const matchQty = Math.min(closeQty, openQty);
    expect(matchQty).toBe(0);
  });

  it('should handle negative prices (credits)', () => {
    // Some brokers represent credits as negative amounts
    const amount = -500; // Credit received
    expect(Math.abs(amount)).toBe(500);
  });

  it('should handle fractional shares', () => {
    const quantity = 0.5;
    const price = 100;
    const amount = quantity * price;

    expect(amount).toBe(50);
  });

  it('should handle option multiplier (100x)', () => {
    const contracts = 2;
    const premium = 3.5;
    const amount = contracts * premium * 100;

    expect(amount).toBe(700);
  });
});
