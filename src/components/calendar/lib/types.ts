/**
 * Shared types for the Trading Calendar feature.
 */

// ============================================================================
// Trade Log Types
// ============================================================================

export type TradeType = 'daytrade' | 'swingtrade';

export interface CalendarTrade {
  id: string;
  tradeNumber: number;
  closeDate: string;
  openDate: string;
  symbol: string;
  displaySymbol: string;
  tradeType: TradeType;
  isOverridden: boolean;
  quantity: number;
  entryTotal: number;
  exitTotal: number;
  holdingDays: number;
  returnDollars: number;
  returnPercent: number;
  isWin: boolean;
  closeType: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
}

export interface CalendarTradesPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CalendarMonthSummary {
  totalPnL: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  daytradeCount: number;
  swingtradeCount: number;
}

export interface CalendarTradesResponse {
  trades: CalendarTrade[];
  pagination: CalendarTradesPagination;
  monthSummary: CalendarMonthSummary;
}

// ============================================================================
// Daily Detail / Calendar Grid Types
// ============================================================================

export interface TickerPnL {
  symbol: string;
  pnl: number;
  tradeType: TradeType;
}

export interface DayDetail {
  date: string;
  day: number;
  tickers: TickerPnL[];
  dailyTotal: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  daytradePnL: number;
  swingtradePnL: number;
}

export interface WeekSummary {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  totalPnL: number;
  runningTotal: number;
  daytradePnL: number;
  swingtradePnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface CalendarDailyDetailResponse {
  days: DayDetail[];
  weekSummaries: WeekSummary[];
}
