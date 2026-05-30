/**
 * Shared Calendar Types
 *
 * TypeScript interfaces and types used across all calendar components
 * (Trading Calendar, Wheel Calendar, Ticker Calendar).
 */

import type { ReactNode } from 'react';

/**
 * Base day data that all calendars must provide.
 * Specific calendars extend this with their own fields.
 */
export interface BaseCalendarDay {
  date: string;           // ISO date string (YYYY-MM-DD)
  day: number;            // Day of month (1-31)
  hasActivity: boolean;   // Whether this day is clickable
}

/**
 * Week data computed by BaseCalendar.
 */
export interface CalendarWeek<TDay extends BaseCalendarDay> {
  days: (TDay | null)[];  // 7 days, null for padding
  weekIndex: number;      // 0-based week index in month
  weekStart: string;      // First actual day's date (YYYY-MM-DD)
  weekEnd: string;        // Last actual day's date (YYYY-MM-DD)
}

/**
 * Color scheme configuration for calendar cells.
 */
export interface CalendarColorScheme {
  positive: {
    bg: string;
    text: string;
    border?: string;
  };
  negative: {
    bg: string;
    text: string;
    border?: string;
  };
  neutral: {
    bg: string;
    text: string;
    border?: string;
  };
  accent?: {
    bg: string;
    text: string;
    border?: string;
  };
}

/**
 * Default color schemes for different calendar types.
 */
export const COLOR_SCHEMES = {
  /** Trading Calendar: Green profit, Red loss */
  trading: {
    positive: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    negative: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
    },
    neutral: {
      bg: 'bg-zinc-50 dark:bg-zinc-800/50',
      text: 'text-zinc-400 dark:text-zinc-500',
      border: 'border-zinc-200 dark:border-zinc-700',
    },
    accent: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-500 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
  },
  /** Wheel Calendar: Violet/purple theme */
  wheel: {
    positive: {
      bg: 'bg-violet-50 dark:bg-violet-900/20',
      text: 'text-violet-600 dark:text-violet-400',
      border: 'border-violet-200 dark:border-violet-800',
    },
    negative: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
    },
    neutral: {
      bg: 'bg-zinc-50 dark:bg-zinc-800/50',
      text: 'text-zinc-400 dark:text-zinc-500',
      border: 'border-zinc-200 dark:border-zinc-700',
    },
    accent: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-500 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
  },
} as const;

/**
 * Help tooltip configuration.
 */
export interface CalendarHelpTooltip {
  title: string;
  description: string;
}

/**
 * Props for the BaseCalendar component.
 */
export interface BaseCalendarProps<TDay extends BaseCalendarDay, TWeekSummary> {
  // Data
  year: number;
  month: number;
  days: TDay[];

  // Loading/error states
  isLoading?: boolean;
  error?: string | null;

  // Navigation handlers
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;

  // Custom renderers (composition pattern)
  renderDayCell: (day: TDay | null, isToday: boolean, onClick?: () => void) => ReactNode;
  renderWeekCell: (week: CalendarWeek<TDay>, summary: TWeekSummary, onClick?: () => void) => ReactNode;
  renderSummary?: () => ReactNode;

  // Week summary calculator
  calculateWeekSummary: (week: CalendarWeek<TDay>) => TWeekSummary;

  // Event handlers
  onDayClick?: (day: TDay) => void;
  onWeekClick?: (week: CalendarWeek<TDay>, summary: TWeekSummary) => void;

  // Configuration
  title: string;
  subtitle?: string;
  helpTooltip?: CalendarHelpTooltip;
  className?: string;

  // Account filtering (optional)
  accountId?: string | null;
}

// ============================================================
// Trading Calendar Types (for pnl-calendar.tsx)
// ============================================================

export interface TradingCalendarDay extends BaseCalendarDay {
  realizedPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  stockPnL: number;
  optionPnL: number;
  isProfit: boolean;
  isLoss: boolean;
  openPositionCount: number;
  openPositions: TradingOpenPosition[];
}

export interface TradingOpenPosition {
  id: string;
  ledgerEventId: string | null;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
}

export interface TradingWeekSummary {
  weekPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  tradingDays: number;
}

// ============================================================
// Wheel Calendar Types
// ============================================================

export interface WheelCalendarDay extends BaseCalendarDay {
  premiumCollected: number;
  ccPremium: number;
  cspPremium: number;
  tradeCount: number;
  ccCount: number;
  cspCount: number;
  assignmentCount: number;
  expirationCount: number;
  earlyCloseCount: number;
  trades: WheelTrade[];
}

export interface WheelTrade {
  id: string;
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: number;
  expiration: string;
  premium: number;
  closeReason: 'expired' | 'assigned' | 'normal';
  openDate: string;
  closeDate: string;
}

export interface WheelWeekSummary {
  totalPremium: number;
  ccPremium: number;
  cspPremium: number;
  tradeCount: number;
  ccCount: number;
  cspCount: number;
  assignments: number;
  expirations: number;
  tradingDays: number;
}

export interface WheelCalendarSummary {
  totalPremium: number;
  ccPremium: number;
  cspPremium: number;
  totalTrades: number;
  ccCount: number;
  cspCount: number;
  assignments: number;
  expirations: number;
  tradingDays: number;
  premiumDays: number;
}

// ============================================================
// Ticker Calendar Types
// ============================================================

export interface TickerCalendarDay extends BaseCalendarDay {
  symbol: string;
  realizedPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  isProfit: boolean;
  isLoss: boolean;
  positionOpened: boolean;
  trades: TickerTrade[];
}

export interface TickerTrade {
  id: string;
  type: 'stock' | 'option';
  side: 'long' | 'short';
  strategy: string | null;
  strike: number | null;
  expiration: string | null;
  quantity: number;
  openPrice: number;
  closePrice: number | null;
  realizedPnL: number | null;
  closeReason: string | null;
  openDate: string;
  closeDate: string | null;
}

export interface TickerWeekSummary {
  weekPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  tradingDays: number;
}

export interface TickerCalendarSummary {
  symbol: string;
  totalPnL: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  tradingDays: number;
  profitDays: number;
  lossDays: number;
}
