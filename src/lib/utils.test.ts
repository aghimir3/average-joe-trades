/**
 * Utils Unit Tests
 *
 * Tests for the shared utility functions used across the application.
 * These functions are critical for consistent formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCompactCurrency,
  formatPercent,
  formatSignedCurrency,
  cn,
  getLocalDateString,
  localDateToUTC,
  utcToLocalDateString,
  chartTooltipStyle,
} from './utils';

describe('formatCurrency', () => {
  it('should format positive values with $ and commas', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('should format negative values with - prefix', () => {
    expect(formatCurrency(-500)).toBe('-$500.00');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle null', () => {
    expect(formatCurrency(null)).toBe('$0.00');
  });

  it('should handle undefined', () => {
    expect(formatCurrency(undefined)).toBe('$0.00');
  });

  it('should format large numbers with commas', () => {
    expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
  });

  it('should round to 2 decimal places', () => {
    expect(formatCurrency(123.456)).toBe('$123.46');
  });

  it('should pad with zeros for integer values', () => {
    expect(formatCurrency(100)).toBe('$100.00');
  });

  it('should handle very small values', () => {
    expect(formatCurrency(0.01)).toBe('$0.01');
  });

  it('should handle fractional cents (rounds)', () => {
    expect(formatCurrency(0.005)).toBe('$0.01');
    expect(formatCurrency(0.004)).toBe('$0.00');
  });
});

describe('formatCompactCurrency', () => {
  it('should format millions with M suffix', () => {
    expect(formatCompactCurrency(1500000)).toBe('$1.5M');
  });

  it('should format large thousands with K suffix (no decimal)', () => {
    expect(formatCompactCurrency(15000)).toBe('$15K');
  });

  it('should format smaller thousands with K suffix (with decimal)', () => {
    expect(formatCompactCurrency(1500)).toBe('$1.5K');
  });

  it('should use standard formatting for values under 1000', () => {
    expect(formatCompactCurrency(500)).toBe('$500.00');
  });

  it('should handle null', () => {
    expect(formatCompactCurrency(null)).toBe('$0');
  });

  it('should handle undefined', () => {
    expect(formatCompactCurrency(undefined)).toBe('$0');
  });

  it('should handle negative millions', () => {
    expect(formatCompactCurrency(-2500000)).toBe('-$2.5M');
  });

  it('should handle negative thousands', () => {
    expect(formatCompactCurrency(-25000)).toBe('-$25K');
  });

  it('should handle exactly 1 million', () => {
    expect(formatCompactCurrency(1000000)).toBe('$1.0M');
  });

  it('should handle exactly 10 thousand', () => {
    expect(formatCompactCurrency(10000)).toBe('$10K');
  });

  it('should handle exactly 1 thousand', () => {
    expect(formatCompactCurrency(1000)).toBe('$1.0K');
  });
});

describe('formatPercent', () => {
  it('should format positive values with + prefix', () => {
    expect(formatPercent(12.5)).toBe('+12.5%');
  });

  it('should format negative values with - prefix', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%');
  });

  it('should format zero with + prefix', () => {
    expect(formatPercent(0)).toBe('+0.0%');
  });

  it('should handle null', () => {
    expect(formatPercent(null)).toBe('0.0%');
  });

  it('should handle undefined', () => {
    expect(formatPercent(undefined)).toBe('0.0%');
  });

  it('should round to 1 decimal place', () => {
    expect(formatPercent(12.567)).toBe('+12.6%');
  });

  it('should handle 100%', () => {
    expect(formatPercent(100)).toBe('+100.0%');
  });

  it('should handle very small percentages', () => {
    expect(formatPercent(0.1)).toBe('+0.1%');
  });
});

describe('formatSignedCurrency', () => {
  describe('standard mode', () => {
    it('should format positive values with + prefix', () => {
      expect(formatSignedCurrency(1234.5)).toBe('+$1,234.50');
    });

    it('should format negative values with - prefix', () => {
      expect(formatSignedCurrency(-500)).toBe('-$500.00');
    });

    it('should format zero with + prefix', () => {
      expect(formatSignedCurrency(0)).toBe('+$0.00');
    });

    it('should handle null', () => {
      expect(formatSignedCurrency(null)).toBe('$0.00');
    });

    it('should handle undefined', () => {
      expect(formatSignedCurrency(undefined)).toBe('$0.00');
    });
  });

  describe('compact mode', () => {
    it('should format millions compactly', () => {
      expect(formatSignedCurrency(1500000, true)).toBe('+$1.5M');
    });

    it('should format thousands compactly', () => {
      expect(formatSignedCurrency(15000, true)).toBe('+$15.0K');
    });

    it('should use standard format for small values', () => {
      expect(formatSignedCurrency(500, true)).toBe('+$500.00');
    });

    it('should handle negative millions compactly', () => {
      expect(formatSignedCurrency(-2500000, true)).toBe('-$2.5M');
    });

    it('should handle negative thousands compactly', () => {
      expect(formatSignedCurrency(-25000, true)).toBe('-$25.0K');
    });
  });
});

describe('cn', () => {
  it('should combine multiple class strings', () => {
    expect(cn('px-4', 'py-2', 'bg-blue-500')).toBe('px-4 py-2 bg-blue-500');
  });

  it('should filter out falsy values', () => {
    expect(cn('base', false && 'conditional', 'end')).toBe('base end');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    expect(cn('base', isActive && 'active')).toBe('base active');
  });

  it('should merge conflicting Tailwind classes (later wins)', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
  });

  it('should handle undefined values', () => {
    expect(cn('base', undefined, 'end')).toBe('base end');
  });

  it('should handle null values', () => {
    expect(cn('base', null, 'end')).toBe('base end');
  });

  it('should handle arrays', () => {
    expect(cn(['px-4', 'py-2'])).toBe('px-4 py-2');
  });

  it('should handle objects', () => {
    expect(cn({ 'bg-blue-500': true, 'text-white': false })).toBe('bg-blue-500');
  });
});

describe('getLocalDateString', () => {
  it('should format date as YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 15); // Jan 15, 2026 local time
    expect(getLocalDateString(date)).toBe('2026-01-15');
  });

  it('should pad single-digit months', () => {
    const date = new Date(2026, 5, 5); // June 5, 2026
    expect(getLocalDateString(date)).toBe('2026-06-05');
  });

  it('should pad single-digit days', () => {
    const date = new Date(2026, 11, 9); // Dec 9, 2026
    expect(getLocalDateString(date)).toBe('2026-12-09');
  });

  it('should handle end of year', () => {
    const date = new Date(2026, 11, 31); // Dec 31, 2026
    expect(getLocalDateString(date)).toBe('2026-12-31');
  });

  it('should handle beginning of year', () => {
    const date = new Date(2026, 0, 1); // Jan 1, 2026
    expect(getLocalDateString(date)).toBe('2026-01-01');
  });

  it('should use current date when no argument provided', () => {
    const result = getLocalDateString();
    // Just verify format is correct
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('localDateToUTC', () => {
  it('should convert date string to UTC Date at noon', () => {
    const result = localDateToUTC('2026-01-15');

    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(0); // January
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('should handle single-digit month in input', () => {
    const result = localDateToUTC('2026-06-05');

    expect(result.getUTCMonth()).toBe(5); // June
    expect(result.getUTCDate()).toBe(5);
  });

  it('should handle end of year', () => {
    const result = localDateToUTC('2026-12-31');

    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(11); // December
    expect(result.getUTCDate()).toBe(31);
  });

  it('should handle leap year Feb 29', () => {
    const result = localDateToUTC('2028-02-29');

    expect(result.getUTCFullYear()).toBe(2028);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(29);
  });
});

describe('utcToLocalDateString', () => {
  it('should convert UTC Date to YYYY-MM-DD string', () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(utcToLocalDateString(date)).toBe('2026-01-15');
  });

  it('should handle string input', () => {
    expect(utcToLocalDateString('2026-01-15T12:00:00.000Z')).toBe('2026-01-15');
  });

  it('should handle ISO string input', () => {
    expect(utcToLocalDateString('2026-06-05T14:30:00.000Z')).toBe('2026-06-05');
  });

  it('should preserve date regardless of UTC time', () => {
    // Even at 23:59 UTC, should still return the UTC date
    const date = new Date(Date.UTC(2026, 0, 15, 23, 59, 59));
    expect(utcToLocalDateString(date)).toBe('2026-01-15');
  });

  it('should preserve date at midnight UTC', () => {
    const date = new Date(Date.UTC(2026, 0, 15, 0, 0, 0));
    expect(utcToLocalDateString(date)).toBe('2026-01-15');
  });
});

describe('chartTooltipStyle', () => {
  it('should have correct background color', () => {
    expect(chartTooltipStyle.backgroundColor).toBe('rgba(39, 39, 42, 0.95)');
  });

  it('should have correct title font settings', () => {
    expect(chartTooltipStyle.titleFont.size).toBe(13);
    expect(chartTooltipStyle.titleFont.weight).toBe('bold');
  });

  it('should have correct body font settings', () => {
    expect(chartTooltipStyle.bodyFont.size).toBe(12);
  });

  it('should have correct color scheme', () => {
    expect(chartTooltipStyle.titleColor).toBe('#fafafa');
    expect(chartTooltipStyle.bodyColor).toBe('#a1a1aa');
  });

  it('should have correct padding', () => {
    expect(chartTooltipStyle.padding).toBe(12);
  });

  it('should have correct corner radius', () => {
    expect(chartTooltipStyle.cornerRadius).toBe(8);
  });

  it('should hide display colors', () => {
    expect(chartTooltipStyle.displayColors).toBe(false);
  });
});

describe('Date Conversion Round-trip', () => {
  it('should preserve date through local -> UTC -> local conversion', () => {
    const original = '2026-01-15';
    const utcDate = localDateToUTC(original);
    const result = utcToLocalDateString(utcDate);

    expect(result).toBe(original);
  });

  it('should preserve various dates through round-trip', () => {
    const testDates = [
      '2026-01-01', // Start of year
      '2026-12-31', // End of year
      '2026-06-15', // Mid year
      '2028-02-29', // Leap year
    ];

    for (const original of testDates) {
      const utcDate = localDateToUTC(original);
      const result = utcToLocalDateString(utcDate);
      expect(result).toBe(original);
    }
  });
});

describe('Currency Formatting Edge Cases', () => {
  it('should handle NaN correctly', () => {
    expect(formatCurrency(NaN)).toBe('$NaN');
  });

  it('should handle Infinity', () => {
    expect(formatCurrency(Infinity)).toBe('$∞');
  });

  it('should handle negative Infinity', () => {
    expect(formatCurrency(-Infinity)).toBe('-$∞');
  });

  it('should handle very large numbers', () => {
    const result = formatCurrency(999999999.99);
    expect(result).toBe('$999,999,999.99');
  });

  it('should handle negative zero', () => {
    expect(formatCurrency(-0)).toBe('$0.00');
  });
});
