/**
 * Tests for close trade validation schemas.
 *
 * Covers:
 * - Stock trade closing validation
 * - Option trade closing validation
 * - Edge cases and error messages
 * - Date validation
 * - Price/premium validation
 */

import { describe, it, expect } from 'vitest';
import {
  closeStockTradeSchema,
  closeOptionTradeSchema,
  closeFutureTradeSchema,
} from './close-trade';

describe('closeStockTradeSchema', () => {
  it('should validate a valid stock trade close', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
      closingNotes: 'Profit target reached',
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exitPrice).toBe(155.75);
      expect(result.data.closingNotes).toBe('Profit target reached');
    }
  });

  it('should validate without optional notes', () => {
    const closeWithoutNotes = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
    };

    const result = closeStockTradeSchema.safeParse(closeWithoutNotes);

    expect(result.success).toBe(true);
  });

  it('should allow null notes', () => {
    const closeWithNullNotes = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
      closingNotes: null,
    };

    const result = closeStockTradeSchema.safeParse(closeWithNullNotes);

    expect(result.success).toBe(true);
  });

  it('should reject negative exit price', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      exitPrice: -100,
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('positive');
    }
  });

  it('should reject zero exit price', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      exitPrice: 0,
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });

  it('should accept prices with 2 decimal places', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 123.45,
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should accept prices with 4 decimal places', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 123.4567,
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should reject prices with more than 4 decimal places', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      exitPrice: 123.45678,
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('4 decimal places');
    }
  });

  it('should require exit date', () => {
    const invalidClose = {
      exitPrice: 155.75,
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });

  it('should require exit price', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });

  it('should reject notes longer than 5000 characters', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
      closingNotes: 'a'.repeat(5001),
    };

    const result = closeStockTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('too long');
    }
  });

  it('should accept notes exactly 5000 characters', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
      closingNotes: 'a'.repeat(5000),
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should coerce date strings to Date objects', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 155.75,
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exitDate).toBeInstanceOf(Date);
    }
  });

  it('should coerce numeric strings to numbers', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: '155.75',
    };

    const result = closeStockTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.exitPrice).toBe('number');
      expect(result.data.exitPrice).toBe(155.75);
    }
  });
});

describe('closeOptionTradeSchema', () => {
  it('should validate a valid option trade close with single leg', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 8.5,
        },
      ],
      closingNotes: 'Closed for profit',
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optionLegs).toHaveLength(1);
      expect(result.data.optionLegs[0].exitPremium).toBe(8.5);
    }
  });

  it('should validate a valid option trade close with multiple legs', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 8.5,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          exitPremium: 2.0,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optionLegs).toHaveLength(2);
    }
  });

  it('should validate without optional notes', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 8.5,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should reject missing option legs', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      optionLegs: [],
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('At least one');
    }
  });

  it('should reject negative exit premium', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: -5.0,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('cannot be negative');
    }
  });

  it('should allow zero exit premium (expired worthless)', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 0,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should accept premiums with 2 decimal places', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 12.34,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should accept premiums with 4 decimal places', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 12.3456,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should reject premiums with more than 4 decimal places', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 12.34567,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('4 decimal places');
    }
  });

  it('should reject invalid UUID for leg id', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: 'not-a-uuid',
          exitPremium: 8.5,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid');
    }
  });

  it('should accept valid UUIDs for leg id', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 8.5,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
  });

  it('should require exit date', () => {
    const invalidClose = {
      optionLegs: [
        {
          id: 'leg-123',
          exitPremium: 8.5,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });

  it('should reject notes longer than 5000 characters', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 8.5,
        },
      ],
      closingNotes: 'a'.repeat(5001),
    };

    const result = closeOptionTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });

  it('should coerce numeric strings to numbers for exit premiums', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: '8.50',
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.optionLegs[0].exitPremium).toBe('number');
      expect(result.data.optionLegs[0].exitPremium).toBe(8.5);
    }
  });

  it('should handle multiple legs with various exit premiums', () => {
    const validClose = {
      exitDate: '2024-01-20',
      optionLegs: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          exitPremium: 10.0,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          exitPremium: 0,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          exitPremium: 5.25,
        },
      ],
    };

    const result = closeOptionTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optionLegs).toHaveLength(3);
      expect(result.data.optionLegs[0].exitPremium).toBe(10.0);
      expect(result.data.optionLegs[1].exitPremium).toBe(0);
      expect(result.data.optionLegs[2].exitPremium).toBe(5.25);
    }
  });
});

describe('closeFutureTradeSchema', () => {
  it('should validate a valid futures trade close', () => {
    const validClose = {
      exitDate: '2024-01-20',
      exitPrice: 4321.75,
      closingNotes: 'Closed after target hit',
    };

    const result = closeFutureTradeSchema.safeParse(validClose);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exitPrice).toBe(4321.75);
      expect(result.data.closingNotes).toBe('Closed after target hit');
    }
  });

  it('should reject invalid futures close data', () => {
    const invalidClose = {
      exitDate: '2024-01-20',
      exitPrice: 0,
    };

    const result = closeFutureTradeSchema.safeParse(invalidClose);

    expect(result.success).toBe(false);
  });
});
