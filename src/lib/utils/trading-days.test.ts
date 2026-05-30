/**
 * Trading Days Utility Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isTradingDay,
  getTradingDaysBetween,
  getTradingDaysHeld,
} from './trading-days';

describe('Trading Days Utility', () => {
  describe('isTradingDay', () => {
    it('should return false for Saturday', () => {
      // January 18, 2025 is a Saturday
      expect(isTradingDay(new Date(2025, 0, 18))).toBe(false);
    });

    it('should return false for Sunday', () => {
      // January 19, 2025 is a Sunday
      expect(isTradingDay(new Date(2025, 0, 19))).toBe(false);
    });

    it('should return true for a regular Monday', () => {
      // January 6, 2025 is a Monday (not a holiday)
      expect(isTradingDay(new Date(2025, 0, 6))).toBe(true);
    });

    it('should return false for New Year Day (observed)', () => {
      // January 1, 2025 is Wednesday - New Year's Day
      expect(isTradingDay(new Date(2025, 0, 1))).toBe(false);
    });

    it('should return false for MLK Day', () => {
      // January 20, 2025 is MLK Day (3rd Monday of January)
      expect(isTradingDay(new Date(2025, 0, 20))).toBe(false);
    });

    it('should return false for Presidents Day', () => {
      // February 17, 2025 is Presidents Day (3rd Monday of February)
      expect(isTradingDay(new Date(2025, 1, 17))).toBe(false);
    });

    it('should return false for Good Friday', () => {
      // April 18, 2025 is Good Friday
      expect(isTradingDay(new Date(2025, 3, 18))).toBe(false);
    });

    it('should return false for Memorial Day', () => {
      // May 26, 2025 is Memorial Day (last Monday of May)
      expect(isTradingDay(new Date(2025, 4, 26))).toBe(false);
    });

    it('should return false for Juneteenth', () => {
      // June 19, 2025 is Thursday - Juneteenth
      expect(isTradingDay(new Date(2025, 5, 19))).toBe(false);
    });

    it('should return false for Independence Day', () => {
      // July 4, 2025 is Friday
      expect(isTradingDay(new Date(2025, 6, 4))).toBe(false);
    });

    it('should return false for Labor Day', () => {
      // September 1, 2025 is Labor Day (1st Monday of September)
      expect(isTradingDay(new Date(2025, 8, 1))).toBe(false);
    });

    it('should return false for Thanksgiving', () => {
      // November 27, 2025 is Thanksgiving (4th Thursday of November)
      expect(isTradingDay(new Date(2025, 10, 27))).toBe(false);
    });

    it('should return false for Christmas', () => {
      // December 25, 2025 is Thursday
      expect(isTradingDay(new Date(2025, 11, 25))).toBe(false);
    });

    it('should handle observed holidays (weekend adjustment)', () => {
      // July 4, 2026 is Saturday, observed on Friday July 3
      expect(isTradingDay(new Date(2026, 6, 3))).toBe(false);
      // July 4 itself (Saturday) is not a trading day anyway
      expect(isTradingDay(new Date(2026, 6, 4))).toBe(false);
    });
  });

  describe('getTradingDaysBetween', () => {
    it('should return 0 for same day', () => {
      const date = new Date(2025, 0, 15);
      expect(getTradingDaysBetween(date, date)).toBe(0);
    });

    it('should return 0 when start is after end', () => {
      const start = new Date(2025, 0, 15);
      const end = new Date(2025, 0, 10);
      expect(getTradingDaysBetween(start, end)).toBe(0);
    });

    it('should count only weekdays in a simple week', () => {
      // Monday Jan 6 to Friday Jan 10, 2025 (no holidays)
      const start = new Date(2025, 0, 6);
      const end = new Date(2025, 0, 11); // Saturday (exclusive)
      expect(getTradingDaysBetween(start, end)).toBe(5);
    });

    it('should exclude weekends', () => {
      // Friday Jan 10 to Monday Jan 13, 2025
      const start = new Date(2025, 0, 10);
      const end = new Date(2025, 0, 13);
      // Friday is counted, Sat/Sun not, Monday is end (exclusive)
      expect(getTradingDaysBetween(start, end)).toBe(1);
    });

    it('should exclude holidays', () => {
      // Week including MLK Day (Jan 20, 2025)
      // Jan 13 (Mon) to Jan 21 (Tue):
      // Trading days: 13, 14, 15, 16, 17 (5 days)
      // Jan 18-19 weekend, Jan 20 MLK Day, Jan 21 exclusive
      const start = new Date(2025, 0, 13);
      const end = new Date(2025, 0, 21);
      expect(getTradingDaysBetween(start, end)).toBe(5);

      // Include the MLK Day period specifically
      // Jan 17 (Fri) to Jan 22 (Wed): 17, 21 = 2 trading days (18-19 weekend, 20 MLK)
      const start2 = new Date(2025, 0, 17);
      const end2 = new Date(2025, 0, 22);
      expect(getTradingDaysBetween(start2, end2)).toBe(2);
    });

    it('should handle multi-week periods', () => {
      // 2 full weeks: Jan 6-17, 2025 (no holidays in this period)
      const start = new Date(2025, 0, 6);
      const end = new Date(2025, 0, 18); // Saturday
      expect(getTradingDaysBetween(start, end)).toBe(10);
    });

    it('should handle period with multiple holidays', () => {
      // November 2025: includes Thanksgiving (Nov 27)
      // Nov 24 (Mon) to Nov 29 (Sat) = 5 weekdays - 1 Thanksgiving = 4
      const start = new Date(2025, 10, 24);
      const end = new Date(2025, 10, 29);
      expect(getTradingDaysBetween(start, end)).toBe(4);
    });
  });

  describe('getTradingDaysHeld', () => {
    it('should accept string date', () => {
      const result = getTradingDaysHeld('2025-01-06');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should accept Date object', () => {
      const result = getTradingDaysHeld(new Date(2025, 0, 6));
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for today', () => {
      const today = new Date();
      const result = getTradingDaysHeld(today);
      expect(result).toBe(0);
    });
  });
});
