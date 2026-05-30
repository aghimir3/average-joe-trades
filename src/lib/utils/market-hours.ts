/**
 * Market Hours Utility
 *
 * Provides functions to detect US stock market hours for smart auto-refresh.
 * Uses Eastern Time (America/New_York) for all calculations.
 */

// NYSE/NASDAQ market holidays for 2025-2026
// Source: NYSE holiday calendar
const MARKET_HOLIDAYS: string[] = [
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

// Early close days (1:00 PM ET close)
const EARLY_CLOSE_DAYS: string[] = [
  '2025-07-03', // Day before Independence Day
  '2025-11-28', // Day after Thanksgiving
  '2025-12-24', // Christmas Eve
  '2026-11-27', // Day after Thanksgiving
  '2026-12-24', // Christmas Eve
];

export type MarketStatus = 'open' | 'closed' | 'premarket' | 'afterhours';

/**
 * Get the current time in Eastern timezone
 */
function getEasternTime(date: Date = new Date()): {
  hours: number;
  minutes: number;
  dayOfWeek: number;
  dateString: string;
} {
  const eastern = new Date(
    date.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  return {
    hours: eastern.getHours(),
    minutes: eastern.getMinutes(),
    dayOfWeek: eastern.getDay(), // 0 = Sunday, 6 = Saturday
    dateString: eastern.toISOString().split('T')[0],
  };
}

/**
 * Convert hours and minutes to total minutes since midnight
 */
function toMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

/**
 * Check if a given date is a market holiday
 */
export function isMarketHoliday(date: Date = new Date()): boolean {
  const { dateString } = getEasternTime(date);
  return MARKET_HOLIDAYS.includes(dateString);
}

/**
 * Check if today is an early close day (1:00 PM ET)
 */
export function isEarlyCloseDay(date: Date = new Date()): boolean {
  const { dateString } = getEasternTime(date);
  return EARLY_CLOSE_DAYS.includes(dateString);
}

/**
 * Check if regular market hours are currently active
 * Regular hours: Mon-Fri 9:30 AM - 4:00 PM ET (or 1:00 PM on early close days)
 */
export function isMarketOpen(date: Date = new Date()): boolean {
  const { hours, minutes, dayOfWeek, dateString } = getEasternTime(date);

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Holiday check
  if (MARKET_HOLIDAYS.includes(dateString)) {
    return false;
  }

  const currentMinutes = toMinutes(hours, minutes);
  const openMinutes = toMinutes(9, 30); // 9:30 AM

  // Early close days close at 1:00 PM
  const closeMinutes = EARLY_CLOSE_DAYS.includes(dateString)
    ? toMinutes(13, 0) // 1:00 PM
    : toMinutes(16, 0); // 4:00 PM

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/**
 * Check if extended hours trading is available
 * Pre-market: Mon-Fri 4:00 AM - 9:30 AM ET
 * After-hours: Mon-Fri 4:00 PM - 8:00 PM ET
 */
export function isExtendedHoursOpen(date: Date = new Date()): boolean {
  const { hours, minutes, dayOfWeek, dateString } = getEasternTime(date);

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Holiday check
  if (MARKET_HOLIDAYS.includes(dateString)) {
    return false;
  }

  const currentMinutes = toMinutes(hours, minutes);

  // Pre-market: 4:00 AM - 9:30 AM
  const preMarketOpen = toMinutes(4, 0);
  const preMarketClose = toMinutes(9, 30);

  // After-hours: 4:00 PM - 8:00 PM
  const afterHoursOpen = toMinutes(16, 0);
  const afterHoursClose = toMinutes(20, 0);

  const isPreMarket =
    currentMinutes >= preMarketOpen && currentMinutes < preMarketClose;
  const isAfterHours =
    currentMinutes >= afterHoursOpen && currentMinutes < afterHoursClose;

  return isPreMarket || isAfterHours;
}

/**
 * Get the current market status
 */
export function getMarketStatus(date: Date = new Date()): MarketStatus {
  const { hours, minutes, dayOfWeek, dateString } = getEasternTime(date);

  // Weekend or holiday = closed
  if (
    dayOfWeek === 0 ||
    dayOfWeek === 6 ||
    MARKET_HOLIDAYS.includes(dateString)
  ) {
    return 'closed';
  }

  const currentMinutes = toMinutes(hours, minutes);

  // Regular hours
  const openMinutes = toMinutes(9, 30);
  const closeMinutes = EARLY_CLOSE_DAYS.includes(dateString)
    ? toMinutes(13, 0)
    : toMinutes(16, 0);

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return 'open';
  }

  // Pre-market: 4:00 AM - 9:30 AM
  if (currentMinutes >= toMinutes(4, 0) && currentMinutes < openMinutes) {
    return 'premarket';
  }

  // After-hours: 4:00 PM - 8:00 PM
  if (currentMinutes >= closeMinutes && currentMinutes < toMinutes(20, 0)) {
    return 'afterhours';
  }

  return 'closed';
}

/**
 * Get the next market open time
 * Returns the next regular market open (9:30 AM ET on a trading day)
 */
export function getNextMarketOpen(date: Date = new Date()): Date {
  const eastern = new Date(
    date.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  // Start from current date
  const checkDate = new Date(eastern);

  // If we're already past market open today, start from tomorrow
  const { hours, minutes } = getEasternTime(date);
  const currentMinutes = toMinutes(hours, minutes);
  const openMinutes = toMinutes(9, 30);

  if (currentMinutes >= openMinutes) {
    checkDate.setDate(checkDate.getDate() + 1);
  }

  // Find next trading day (up to 10 days ahead to cover long weekends)
  for (let i = 0; i < 10; i++) {
    const dayOfWeek = checkDate.getDay();
    const dateString = checkDate.toISOString().split('T')[0];

    // Skip weekends and holidays
    if (
      dayOfWeek !== 0 &&
      dayOfWeek !== 6 &&
      !MARKET_HOLIDAYS.includes(dateString)
    ) {
      // Found a trading day - set to 9:30 AM ET
      checkDate.setHours(9, 30, 0, 0);
      return checkDate;
    }

    checkDate.setDate(checkDate.getDate() + 1);
  }

  // Fallback: just return next day at 9:30 AM
  checkDate.setHours(9, 30, 0, 0);
  return checkDate;
}

/**
 * Get the market close time for today (or null if market is closed)
 */
export function getMarketCloseTime(date: Date = new Date()): Date | null {
  const { dayOfWeek, dateString } = getEasternTime(date);

  // Weekend or holiday = no close time
  if (
    dayOfWeek === 0 ||
    dayOfWeek === 6 ||
    MARKET_HOLIDAYS.includes(dateString)
  ) {
    return null;
  }

  const eastern = new Date(
    date.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  // Early close or regular close
  if (EARLY_CLOSE_DAYS.includes(dateString)) {
    eastern.setHours(13, 0, 0, 0);
  } else {
    eastern.setHours(16, 0, 0, 0);
  }

  return eastern;
}

/**
 * Format time remaining until market open/close
 */
export function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'now';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return `${days}d ${diffHours % 24}h`;
  }

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMinutes}m`;
  }

  return `${diffMinutes}m`;
}

/**
 * Check if we should auto-refresh prices
 * Returns true during regular market hours or extended hours
 */
export function shouldAutoRefresh(
  includeExtendedHours: boolean = false
): boolean {
  if (isMarketOpen()) {
    return true;
  }

  if (includeExtendedHours && isExtendedHoursOpen()) {
    return true;
  }

  return false;
}
