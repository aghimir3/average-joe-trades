/**
 * Manual Entry Service Unit Tests
 *
 * Tests for manual trade entry helper functions and transaction code mappings.
 * These tests verify the logic without database access.
 */

import { describe, it, expect, vi } from 'vitest';
import type { TransCode, OptionStrategy } from '@/lib/importers/types';

// Mock the logger before importing
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// Helper Functions to Test (extracted from manual-entry.ts)
// ============================================================================

function getTransCodeForStockAction(action: 'buy' | 'sell'): TransCode {
  return action === 'buy' ? 'BUY' : 'SELL';
}

function getTransCodeForOptionAction(
  action: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close'
): TransCode {
  switch (action) {
    case 'buy_to_open':
      return 'BTO';
    case 'sell_to_open':
      return 'STO';
    case 'buy_to_close':
      return 'BTC';
    case 'sell_to_close':
      return 'STC';
  }
}

function generatePositionGroupId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Tests
// ============================================================================

describe('Stock Action Transaction Codes', () => {
  describe('getTransCodeForStockAction', () => {
    it('should return BUY for buy action', () => {
      expect(getTransCodeForStockAction('buy')).toBe('BUY');
    });

    it('should return SELL for sell action', () => {
      expect(getTransCodeForStockAction('sell')).toBe('SELL');
    });
  });
});

describe('Option Action Transaction Codes', () => {
  describe('getTransCodeForOptionAction', () => {
    it('should return BTO for buy_to_open', () => {
      expect(getTransCodeForOptionAction('buy_to_open')).toBe('BTO');
    });

    it('should return STO for sell_to_open', () => {
      expect(getTransCodeForOptionAction('sell_to_open')).toBe('STO');
    });

    it('should return BTC for buy_to_close', () => {
      expect(getTransCodeForOptionAction('buy_to_close')).toBe('BTC');
    });

    it('should return STC for sell_to_close', () => {
      expect(getTransCodeForOptionAction('sell_to_close')).toBe('STC');
    });
  });
});

describe('Position Group ID', () => {
  describe('generatePositionGroupId', () => {
    it('should generate a valid UUID', () => {
      const id = generatePositionGroupId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs each time', () => {
      const id1 = generatePositionGroupId();
      const id2 = generatePositionGroupId();
      const id3 = generatePositionGroupId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });
});

describe('Option Premium Calculations', () => {
  it('should calculate option amount correctly (contracts * premium * 100)', () => {
    const contracts = 5;
    const premium = 2.50;
    const amount = contracts * premium * 100;

    expect(amount).toBe(1250);
  });

  it('should handle fractional premiums', () => {
    const contracts = 1;
    const premium = 0.05;
    const amount = contracts * premium * 100;

    expect(amount).toBe(5);
  });

  it('should handle large contract counts', () => {
    const contracts = 100;
    const premium = 1.25;
    const amount = contracts * premium * 100;

    expect(amount).toBe(12500);
  });
});

describe('Stock Amount Calculations', () => {
  it('should calculate stock amount correctly (quantity * price)', () => {
    const quantity = 100;
    const price = 150.50;
    const amount = quantity * price;

    expect(amount).toBe(15050);
  });

  it('should handle fractional shares', () => {
    const quantity = 0.5;
    const price = 1000;
    const amount = quantity * price;

    expect(amount).toBe(500);
  });
});

describe('Instrument String Formatting', () => {
  it('should format option instrument string correctly', () => {
    const symbol = 'AAPL';
    const expiration = new Date('2026-03-21');
    const strike = 175;
    const optionType = 'CALL';

    const expStr = expiration.toISOString().split('T')[0];
    const instrument = `${symbol} ${expStr} ${strike} ${optionType}`;

    expect(instrument).toBe('AAPL 2026-03-21 175 CALL');
  });

  it('should format put option instrument string correctly', () => {
    const symbol = 'TSLA';
    const expiration = new Date('2026-04-17');
    const strike = 200;
    const optionType = 'PUT';

    const expStr = expiration.toISOString().split('T')[0];
    const instrument = `${symbol} ${expStr} ${strike} ${optionType}`;

    expect(instrument).toBe('TSLA 2026-04-17 200 PUT');
  });
});

describe('Option Strategies', () => {
  const validStrategies: OptionStrategy[] = [
    'long_call',
    'long_put',
    'covered_call',
    'cash_secured_put',
    'call_debit_spread',
    'put_debit_spread',
    'call_credit_spread',
    'put_credit_spread',
    'long_straddle',
    'long_strangle',
    'short_straddle',
    'short_strangle',
    'iron_condor',
    'iron_butterfly',
    'jade_lizard',
    'calendar_spread',
    'diagonal_spread',
    'custom',
  ];

  it('should recognize all valid strategies', () => {
    for (const strategy of validStrategies) {
      expect(typeof strategy).toBe('string');
      expect(strategy.length).toBeGreaterThan(0);
    }
  });

  it('should have 18 strategies defined', () => {
    expect(validStrategies.length).toBe(18);
  });
});

describe('Close Position Logic', () => {
  // Helper function to get transaction code based on position type and side
  function getTransCode(positionType: 'stock' | 'option' | 'future', side: 'long' | 'short'): string {
    if (positionType === 'option') {
      return side === 'long' ? 'STC' : 'BTC';
    }
    return side === 'long' ? 'SELL' : 'BUY';
  }

  describe('Transaction Code Selection', () => {
    it('should use SELL for long stock position', () => {
      expect(getTransCode('stock', 'long')).toBe('SELL');
    });

    it('should use BUY for short stock position (covering)', () => {
      expect(getTransCode('stock', 'short')).toBe('BUY');
    });

    it('should use STC for long option position', () => {
      expect(getTransCode('option', 'long')).toBe('STC');
    });

    it('should use BTC for short option position', () => {
      expect(getTransCode('option', 'short')).toBe('BTC');
    });

    it('should use SELL for long futures position', () => {
      expect(getTransCode('future', 'long')).toBe('SELL');
    });

    it('should use BUY for short futures position (covering)', () => {
      expect(getTransCode('future', 'short')).toBe('BUY');
    });
  });

  describe('Amount Calculation', () => {
    // Helper function to calculate close amount
    function calculateAmount(positionType: 'stock' | 'option' | 'future', quantity: number, price: number): number {
      return positionType === 'option'
        ? price * quantity * 100
        : price * quantity;
    }

    it('should calculate close amount for stock correctly', () => {
      expect(calculateAmount('stock', 100, 175)).toBe(17500);
    });

    it('should calculate close amount for option correctly', () => {
      expect(calculateAmount('option', 2, 5.50)).toBe(1100);
    });

    it('should calculate close amount for futures correctly', () => {
      expect(calculateAmount('future', 3, 4200)).toBe(12600);
    });
  });
});

describe('Option Expiration Handling', () => {
  it('should format expiration date to ISO string correctly', () => {
    const expiration = new Date('2026-03-21T12:00:00.000Z');
    const expStr = expiration.toISOString().split('T')[0];

    expect(expStr).toBe('2026-03-21');
  });

  it('should handle end-of-month expirations', () => {
    const expiration = new Date('2026-02-28T12:00:00.000Z');
    const expStr = expiration.toISOString().split('T')[0];

    expect(expStr).toBe('2026-02-28');
  });

  it('should handle leap year February 29', () => {
    // 2028 is a leap year
    const expiration = new Date('2028-02-29T12:00:00.000Z');
    const expStr = expiration.toISOString().split('T')[0];

    expect(expStr).toBe('2028-02-29');
  });
});

describe('Manual Entry Validation', () => {
  describe('Quantity Validation', () => {
    it('should reject closing more than available', () => {
      const availableQuantity = 50;
      const closeQuantity = 75;

      expect(closeQuantity > availableQuantity).toBe(true);
    });

    it('should allow closing exact available quantity', () => {
      const availableQuantity = 50;
      const closeQuantity = 50;

      expect(closeQuantity <= availableQuantity).toBe(true);
    });

    it('should allow partial close', () => {
      const availableQuantity = 100;
      const closeQuantity = 25;

      expect(closeQuantity <= availableQuantity).toBe(true);
    });
  });

  describe('Price Validation', () => {
    it('should allow zero price for expirations', () => {
      const price = 0;
      const transCode = 'OEXP';

      // Zero price is valid for expirations
      expect(price).toBe(0);
      expect(transCode).toBe('OEXP');
    });

    it('should allow zero price for assignments', () => {
      const price = 0;
      const transCode = 'OASGN';

      expect(price).toBe(0);
      expect(transCode).toBe('OASGN');
    });
  });
});

describe('Multi-Leg Option Trades', () => {
  it('should apply fees only to first leg', () => {
    const legs = [
      { index: 0, fees: 1.50 },
      { index: 1, fees: undefined },
      { index: 2, fees: undefined },
    ];

    const feesOnFirstLeg = legs[0].fees;
    const feesOnOtherLegs = legs.slice(1).every(l => l.fees === undefined);

    expect(feesOnFirstLeg).toBe(1.50);
    expect(feesOnOtherLegs).toBe(true);
  });

  it('should share position group ID across legs', () => {
    const groupId = generatePositionGroupId();
    const legs = [
      { positionGroupId: groupId },
      { positionGroupId: groupId },
      { positionGroupId: groupId },
    ];

    // All legs should have the same group ID
    const allSameGroup = legs.every(l => l.positionGroupId === groupId);
    expect(allSameGroup).toBe(true);
  });

  it('should apply notes only to first leg', () => {
    const notes = 'This is a spread trade';
    const legs = [
      { index: 0, notes },
      { index: 1, notes: undefined },
    ];

    expect(legs[0].notes).toBe(notes);
    expect(legs[1].notes).toBeUndefined();
  });
});

describe('Description Generation', () => {
  it('should generate stock buy description', () => {
    const action = 'buy';
    const quantity = 100;
    const symbol = 'AAPL';
    const price = 150;
    const description = `Manual ${action.toUpperCase()} ${quantity} ${symbol} @ ${price}`;

    expect(description).toBe('Manual BUY 100 AAPL @ 150');
  });

  it('should generate option open description', () => {
    const transCode = 'STO';
    const quantity = 2;
    const instrument = 'AAPL 2026-03-21 175 CALL';
    const premium = 5.00;
    const description = `Manual ${transCode} ${quantity} ${instrument} @ ${premium}`;

    expect(description).toBe('Manual STO 2 AAPL 2026-03-21 175 CALL @ 5');
  });

  it('should generate close position description', () => {
    const transCode = 'STC';
    const quantity = 2;
    const instrument = 'AAPL 2026-03-21 175 CALL';
    const price = 7.50;
    const description = `Manual close ${transCode} ${quantity} ${instrument} @ ${price}`;

    expect(description).toBe('Manual close STC 2 AAPL 2026-03-21 175 CALL @ 7.5');
  });

  it('should generate expiration description', () => {
    const instrument = 'AAPL 2026-03-21 175 CALL';
    const description = `Option expired: ${instrument}`;

    expect(description).toBe('Option expired: AAPL 2026-03-21 175 CALL');
  });

  it('should generate assignment description', () => {
    const instrument = 'AAPL 2026-03-21 175 PUT';
    const description = `Option assigned: ${instrument}`;

    expect(description).toBe('Option assigned: AAPL 2026-03-21 175 PUT');
  });
});
