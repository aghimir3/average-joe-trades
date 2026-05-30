/**
 * Trading Days Utility
 *
 * Calculates trading days (business days) excluding weekends and US stock market holidays.
 * Used for accurate holding period calculations in the trading journal.
 */

/**
 * US Stock Market Holidays (NYSE/NASDAQ)
 * These are observed holidays - if a holiday falls on a weekend, the observed day is used.
 *
 * Fixed holidays:
 * - New Year's Day (Jan 1)
 * - Juneteenth (Jun 19) - since 2021
 * - Independence Day (Jul 4)
 * - Christmas Day (Dec 25)
 *
 * Floating holidays:
 * - Martin Luther King Jr. Day (3rd Monday of January)
 * - Presidents' Day (3rd Monday of February)
 * - Good Friday (Friday before Easter)
 * - Memorial Day (last Monday of May)
 * - Labor Day (1st Monday of September)
 * - Thanksgiving Day (4th Thursday of November)
 */

/**
 * Get the observed date for a holiday (handles weekend adjustments)
 */
function getObservedDate(year: number, month: number, day: number): Date {
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay();

  // If Saturday, observe on Friday
  if (dayOfWeek === 6) {
    return new Date(year, month, day - 1);
  }
  // If Sunday, observe on Monday
  if (dayOfWeek === 0) {
    return new Date(year, month, day + 1);
  }
  return date;
}

/**
 * Get nth weekday of a month (e.g., 3rd Monday)
 */
function getNthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7);
  day += (n - 1) * 7;
  return new Date(year, month, day);
}

/**
 * Get last weekday of a month (e.g., last Monday of May)
 */
function getLastWeekday(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastDayOfWeek = lastDay.getDay();
  const diff = (lastDayOfWeek - weekday + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * Get Good Friday (Friday before Easter)
 */
function getGoodFriday(year: number): Date {
  const easter = getEasterSunday(year);
  return new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
}

/**
 * Format date as YYYY-MM-DD string (local time)
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get all US stock market holidays for a given year
 */
function getMarketHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  const addHoliday = (date: Date) => {
    holidays.add(formatDateKey(date));
  };

  // New Year's Day (Jan 1)
  addHoliday(getObservedDate(year, 0, 1));

  // Martin Luther King Jr. Day (3rd Monday of January)
  addHoliday(getNthWeekday(year, 0, 1, 3));

  // Presidents' Day (3rd Monday of February)
  addHoliday(getNthWeekday(year, 1, 1, 3));

  // Good Friday
  addHoliday(getGoodFriday(year));

  // Memorial Day (last Monday of May)
  addHoliday(getLastWeekday(year, 4, 1));

  // Juneteenth (Jun 19) - observed since 2021
  if (year >= 2021) {
    addHoliday(getObservedDate(year, 5, 19));
  }

  // Independence Day (Jul 4)
  addHoliday(getObservedDate(year, 6, 4));

  // Labor Day (1st Monday of September)
  addHoliday(getNthWeekday(year, 8, 1, 1));

  // Thanksgiving Day (4th Thursday of November)
  addHoliday(getNthWeekday(year, 10, 4, 4));

  // Christmas Day (Dec 25)
  addHoliday(getObservedDate(year, 11, 25));

  return holidays;
}

// Cache holidays by year for performance
const holidayCache = new Map<number, Set<string>>();

function getHolidaysForYear(year: number): Set<string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getMarketHolidays(year));
  }
  return holidayCache.get(year)!;
}

/**
 * Check if a date is a trading day (not weekend, not holiday)
 */
export function isTradingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Holiday check - use local date components
  const dateStr = formatDateKey(date);
  const holidays = getHolidaysForYear(date.getFullYear());

  return !holidays.has(dateStr);
}

/**
 * Calculate the number of trading days between two dates (inclusive of start, exclusive of end)
 * This counts only weekdays that are not market holidays.
 */
export function getTradingDaysBetween(startDate: Date, endDate: Date): number {
  // Create new dates using local year/month/day at midnight local time
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  // Ensure start is before end
  if (start >= end) {
    return 0;
  }

  let tradingDays = 0;
  const current = new Date(start);

  while (current < end) {
    if (isTradingDay(current)) {
      tradingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return tradingDays;
}

/**
 * Get the number of trading days a position has been held.
 * Calculates from the entry date to today (exclusive of today).
 */
export function getTradingDaysHeld(firstEntryDate: string | Date): number {
  const entryDate = typeof firstEntryDate === 'string' ? new Date(firstEntryDate) : firstEntryDate;
  const today = new Date();

  return getTradingDaysBetween(entryDate, today);
}
