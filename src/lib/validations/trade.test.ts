/**
 * Tests for trade validation schemas.
 *
 * Covers:
 * - Stock trade validation
 * - Option trade validation
 * - Edge cases and error messages
 */

import { describe, it, expect } from 'vitest';
import {
  createStockTradeSchema,
  createOptionTradeSchema,
  optionLegSchema,
} from './trade';

describe('createStockTradeSchema', () => {
  it('should validate a valid stock trade', () => {
    const validTrade = {
      type: 'stock',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 100,
      entryPrice: 150.5,
    };

    const result = createStockTradeSchema.safeParse(validTrade);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe('AAPL');
      expect(result.data.quantity).toBe(100);
    }
  });

  it('should convert ticker to uppercase', () => {
    const trade = {
      type: 'stock',
      ticker: 'aapl',
      entryDate: '2024-01-15',
      quantity: 100,
      entryPrice: 150,
    };

    const result = createStockTradeSchema.safeParse(trade);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe('AAPL');
    }
  });

  it('should reject invalid ticker symbols', () => {
    const trade = {
      type: 'stock',
      ticker: 'AAPL123', // Contains numbers
      entryDate: '2024-01-15',
      quantity: 100,
      entryPrice: 150,
    };

    const result = createStockTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });

  it('should reject negative quantity', () => {
    const trade = {
      type: 'stock',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: -10,
      entryPrice: 150,
    };

    const result = createStockTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });

  it('should reject negative entry price', () => {
    const trade = {
      type: 'stock',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 100,
      entryPrice: -150,
    };

    const result = createStockTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });

  it('should allow optional notes', () => {
    const trade = {
      type: 'stock',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 100,
      entryPrice: 150,
      openingNotes: 'Test trade',
    };

    const result = createStockTradeSchema.safeParse(trade);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.openingNotes).toBe('Test trade');
    }
  });
});

describe('optionLegSchema', () => {
  it('should validate a valid option leg', () => {
    const validLeg = {
      legType: 'call',
      action: 'buy',
      strike: 150,
      expiration: '2024-02-15',
      premium: 5.0,
      quantity: 1,
    };

    const result = optionLegSchema.safeParse(validLeg);

    expect(result.success).toBe(true);
  });

  it('should reject invalid leg type', () => {
    const leg = {
      legType: 'invalid',
      action: 'buy',
      strike: 150,
      expiration: '2024-02-15',
      premium: 5.0,
      quantity: 1,
    };

    const result = optionLegSchema.safeParse(leg);

    expect(result.success).toBe(false);
  });

  it('should reject invalid action', () => {
    const leg = {
      legType: 'call',
      action: 'hold', // Invalid
      strike: 150,
      expiration: '2024-02-15',
      premium: 5.0,
      quantity: 1,
    };

    const result = optionLegSchema.safeParse(leg);

    expect(result.success).toBe(false);
  });

  it('should reject negative strike price', () => {
    const leg = {
      legType: 'call',
      action: 'buy',
      strike: -150,
      expiration: '2024-02-15',
      premium: 5.0,
      quantity: 1,
    };

    const result = optionLegSchema.safeParse(leg);

    expect(result.success).toBe(false);
  });

  it('should reject negative premium', () => {
    const leg = {
      legType: 'call',
      action: 'buy',
      strike: 150,
      expiration: '2024-02-15',
      premium: -5.0,
      quantity: 1,
    };

    const result = optionLegSchema.safeParse(leg);

    expect(result.success).toBe(false);
  });
});

describe('createOptionTradeSchema', () => {
  it('should validate a valid option trade', () => {
    const validTrade = {
      type: 'option',
      strategy: 'long_call',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 1,
      entryPrice: 500,
      optionLegs: [
        {
          legType: 'call',
          action: 'buy',
          strike: 150,
          expiration: '2024-02-15',
          premium: 5.0,
          quantity: 1,
        },
      ],
    };

    const result = createOptionTradeSchema.safeParse(validTrade);

    expect(result.success).toBe(true);
  });

  it('should require at least one option leg', () => {
    const trade = {
      type: 'option',
      strategy: 'long_call',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 1,
      entryPrice: 500,
      optionLegs: [],
    };

    const result = createOptionTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });

  it('should reject more than 4 legs', () => {
    const trade = {
      type: 'option',
      strategy: 'custom',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 1,
      entryPrice: 500,
      optionLegs: Array(5).fill({
        legType: 'call',
        action: 'buy',
        strike: 150,
        expiration: '2024-02-15',
        premium: 5.0,
        quantity: 1,
      }),
    };

    const result = createOptionTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });

  it('should reject invalid strategy', () => {
    const trade = {
      type: 'option',
      strategy: 'invalid_strategy',
      ticker: 'AAPL',
      entryDate: '2024-01-15',
      quantity: 1,
      entryPrice: 500,
      optionLegs: [
        {
          legType: 'call',
          action: 'buy',
          strike: 150,
          expiration: '2024-02-15',
          premium: 5.0,
          quantity: 1,
        },
      ],
    };

    const result = createOptionTradeSchema.safeParse(trade);

    expect(result.success).toBe(false);
  });
});
