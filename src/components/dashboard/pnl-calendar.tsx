'use client';

import { parseApiJson, apiData, apiDataOr } from '@/lib/api/client';


/**
 * P&L Calendar Component
 *
 * Enhanced calendar view with:
 * - Daily P&L color-coded display
 * - Trade count, win rate, and open positions per day
 * - Day details popup with edit/close actions
 */

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  TrendingUp,
  TrendingDown,
  Target,
  Briefcase,
  LogOut,
  Pencil,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { formatSignedCurrency } from '@/lib/utils';

interface OpenPosition {
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

interface CalendarDay {
  date: string;
  day: number;
  realizedPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  isProfit: boolean;
  isLoss: boolean;
  openPositionCount: number;
  openPositions: OpenPosition[];
}

interface CalendarData {
  year: number;
  month: number;
  days: CalendarDay[];
  summary: {
    totalPnL: number;
    tradingDays: number;
    profitDays: number;
    lossDays: number;
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    totalOpenPositions: number;
    winRate: number;
  };
}

interface DayTrade {
  id: string;
  ledgerEventId: string | null;
  closeEventId: string | null;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  openPrice: number;
  closePrice: number | null;
  realizedPnL: number | null;
  closeReason: string | null;
  optionType?: string | null;
  strike?: number | null;
  strategy?: string | null;
  status: 'open' | 'closed';
}

async function fetchCalendarData(year: number, month: number, accountId?: string | null): Promise<CalendarData> {
  const params = new URLSearchParams({
    year: year.toString(),
    month: month.toString(),
  });
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const response = await fetch(`/api/dashboard/calendar?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch calendar data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

async function fetchDayTrades(date: string, accountId?: string | null): Promise<DayTrade[]> {
  const params = new URLSearchParams({ date, status: 'all', limit: '50' });
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const response = await fetch(`/api/dashboard/trades?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch day trades');
  }
  const result = await parseApiJson(response);
  return apiDataOr(result, []);
}

async function fetchWeekTrades(startDate: string, endDate: string, accountId?: string | null): Promise<DayTrade[]> {
  const params = new URLSearchParams({ startDate, endDate, status: 'closed', limit: '200' });
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const response = await fetch(`/api/dashboard/trades?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch week trades');
  }
  const result = await parseApiJson(response);
  return apiDataOr(result, []);
}

// formatSignedCurrency imported from @/lib/utils (use compact=true for K/M notation)

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PnLCalendarProps {
  accountId?: string | null;
}

export function PnLCalendar({ accountId }: PnLCalendarProps) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<{
    weekIndex: number;
    days: (CalendarDay | null)[];
    weekPnL: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    tradingDays: number;
    winRate: number;
    weekStart: string;
    weekEnd: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardCalendar', year, month, accountId],
    queryFn: () => fetchCalendarData(year, month, accountId),
  });

  const { data: dayTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['dayTrades', selectedDay?.date, accountId],
    queryFn: () => fetchDayTrades(selectedDay!.date, accountId),
    enabled: !!selectedDay,
  });

  const { data: weekTrades, isLoading: weekTradesLoading } = useQuery({
    queryKey: ['weekTrades', selectedWeek?.weekStart, selectedWeek?.weekEnd, accountId],
    queryFn: () => fetchWeekTrades(selectedWeek!.weekStart, selectedWeek!.weekEnd, accountId),
    enabled: !!selectedWeek,
  });

  // Calculate biggest winner and loser tickers for the week
  const weekTickerStats = weekTrades ? (() => {
    const tickerPnL = new Map<string, number>();
    for (const trade of weekTrades) {
      if (trade.realizedPnL !== null) {
        const current = tickerPnL.get(trade.symbol) || 0;
        tickerPnL.set(trade.symbol, current + trade.realizedPnL);
      }
    }
    const entries = Array.from(tickerPnL.entries());
    if (entries.length === 0) return { biggestWinner: null, biggestLoser: null };

    entries.sort((a, b) => b[1] - a[1]);
    const biggestWinner = entries[0][1] > 0 ? { symbol: entries[0][0], pnl: entries[0][1] } : null;
    const biggestLoser = entries[entries.length - 1][1] < 0 ? { symbol: entries[entries.length - 1][0], pnl: entries[entries.length - 1][1] } : null;

    return { biggestWinner, biggestLoser };
  })() : { biggestWinner: null, biggestLoser: null };

  const goToPreviousMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToCurrentMonth = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // Calculate calendar grid
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Create map of day -> data
  const dayDataMap = new Map<number, CalendarDay>();
  if (data?.days) {
    for (const day of data.days) {
      dayDataMap.set(day.day, day);
    }
  }

  // Build calendar grid
  const calendarGrid: (CalendarDay | null)[] = [];

  // Empty cells before first day
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarGrid.push(null);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarGrid.push(dayDataMap.get(day) || {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      day,
      realizedPnL: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      isProfit: false,
      isLoss: false,
      openPositionCount: 0,
      openPositions: [],
    });
  }

  // Group calendar into weeks and calculate weekly totals
  interface WeekData {
    days: (CalendarDay | null)[];
    weekPnL: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    tradingDays: number;
    winRate: number;
  }
  const weeks: WeekData[] = [];
  for (let i = 0; i < calendarGrid.length; i += 7) {
    const weekDays = calendarGrid.slice(i, i + 7);
    // Pad the last week if needed
    while (weekDays.length < 7) {
      weekDays.push(null);
    }
    const weekPnL = weekDays.reduce((sum, day) => sum + (day?.realizedPnL || 0), 0);
    const tradeCount = weekDays.reduce((sum, day) => sum + (day?.tradeCount || 0), 0);
    const winCount = weekDays.reduce((sum, day) => sum + (day?.winCount || 0), 0);
    const lossCount = weekDays.reduce((sum, day) => sum + (day?.lossCount || 0), 0);
    const tradingDays = weekDays.filter(day => day && day.tradeCount > 0).length;
    const winRate = tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0;
    weeks.push({ days: weekDays, weekPnL, tradeCount, winCount, lossCount, tradingDays, winRate });
  }

  const handleDayClick = (dayData: CalendarDay | null) => {
    if (dayData && (dayData.tradeCount > 0 || dayData.openPositionCount > 0)) {
      setSelectedDay(dayData);
    }
  };

  const handleWeekClick = (week: WeekData, weekIndex: number) => {
    if (week.tradeCount === 0) return;

    // Find the first and last actual days in the week
    const actualDays = week.days.filter((d): d is CalendarDay => d !== null);
    if (actualDays.length === 0) return;

    const firstDay = actualDays[0];
    const lastDay = actualDays[actualDays.length - 1];

    setSelectedWeek({
      weekIndex,
      days: week.days,
      weekPnL: week.weekPnL,
      tradeCount: week.tradeCount,
      winCount: week.winCount,
      lossCount: week.lossCount,
      tradingDays: week.tradingDays,
      winRate: week.winRate,
      weekStart: firstDay.date,
      weekEnd: lastDay.date,
    });
  };

  const handleCloseTrade = (tradeId: string) => {
    router.push(`/trade/close?positionId=${tradeId}`);
  };

  const handleEditTrade = (ledgerEventId: string | null, type: string, closeEventId?: string | null) => {
    if (!ledgerEventId) {
      console.warn('No ledger event ID available for editing');
      return;
    }
    const tradeType = type === 'option' ? 'option' : 'stock';
    const closeParam = closeEventId ? `?closeEventId=${closeEventId}` : '';
    router.push(`/trade/edit/${tradeType}/${ledgerEventId}${closeParam}`);
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          Trading Calendar
        </h2>
        <p className="text-red-500 text-center py-8">Failed to load calendar data</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-2 sm:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 sm:p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
              <Calendar className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  <span className="hidden sm:inline">Trading </span>Calendar
                </h2>
                {data?.summary && (
                  <p className={`text-xs sm:text-sm font-medium ${data.summary.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                    {formatSignedCurrency(data.summary.totalPnL)}<span className="hidden sm:inline"> this month</span>
                  </p>
                )}
              </div>
              <HelpTooltip
                title="Trading Calendar"
                description="Visual overview of your daily trading performance. Green days are profitable, red days are losses. Blue dots indicate open positions. Click any day with activity to see details or close positions."
              />
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              onClick={goToPreviousMonth}
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-9 sm:w-9"
            >
              <ChevronLeft className="h-4 sm:h-5 w-4 sm:w-5 text-zinc-500" />
            </Button>
            <Button
              onClick={goToCurrentMonth}
              variant="ghost"
              className="px-1.5 sm:px-3 h-7 sm:h-9 text-xs sm:text-sm"
            >
              {MONTH_SHORT[month - 1]} {year}
            </Button>
            <Button
              onClick={goToNextMonth}
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-9 sm:w-9"
            >
              <ChevronRight className="h-4 sm:h-5 w-4 sm:w-5 text-zinc-500" />
            </Button>
          </div>
        </div>

        {/* Month Summary Stats */}
        {data?.summary && (
          <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-2 sm:mb-3">
            <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] sm:text-xs font-medium">
              <span className="text-zinc-500">{data.summary.tradingDays}</span>
              <span className="text-zinc-400 hidden sm:inline">trading </span><span className="text-zinc-400">days</span>
            </div>
            <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-[10px] sm:text-xs font-medium">
              <span className="text-emerald-600 dark:text-emerald-400">{data.summary.profitDays}</span>
              <span className="text-emerald-500 dark:text-emerald-300">green</span>
            </div>
            <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-[10px] sm:text-xs font-medium">
              <span className="text-red-600 dark:text-red-400">{data.summary.lossDays}</span>
              <span className="text-red-500 dark:text-red-300">red</span>
            </div>
            <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-[10px] sm:text-xs font-medium">
              <Target className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-600 dark:text-blue-400">{data.summary.winRate}%</span>
              <span className="text-blue-500 dark:text-blue-300 hidden sm:inline">win rate</span>
            </div>
            {data.summary.totalOpenPositions > 0 && (
              <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-[10px] sm:text-xs font-medium">
                <Briefcase className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-purple-600 dark:text-purple-400" />
                <span className="text-purple-600 dark:text-purple-400">{data.summary.totalOpenPositions}</span>
                <span className="text-purple-500 dark:text-purple-300">open</span>
              </div>
            )}
          </div>
        )}

        {/* Calendar Grid */}
        {isLoading ? (
          <div className="grid grid-cols-8 gap-1">
            {DAY_NAMES.map((day, idx) => (
              <div key={idx} className="text-center text-xs font-medium text-zinc-400 py-2">
                <span className="sm:hidden">{day}</span>
                <span className="hidden sm:inline">{DAY_NAMES_FULL[idx]}</span>
              </div>
            ))}
            <div className="text-center text-xs font-medium text-zinc-400 py-2">
              <span className="sm:hidden">Wk</span>
              <span className="hidden sm:inline">Week</span>
            </div>
            {Array.from({ length: 5 }).map((_, weekIdx) => (
              <Fragment key={weekIdx}>
                {Array.from({ length: 7 }).map((_, dayIdx) => (
                  <Skeleton key={`${weekIdx}-${dayIdx}`} className="min-h-12 sm:min-h-20 rounded-lg" />
                ))}
                <Skeleton key={`week-${weekIdx}`} className="min-h-12 sm:min-h-20 rounded-lg" />
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="flex flex-col min-h-80 sm:min-h-120">
            {/* Day headers + Week column */}
            <div className="grid grid-cols-8 gap-1 mb-1">
              {DAY_NAMES.map((day, idx) => (
                <div key={idx} className="text-center text-xs font-medium text-zinc-400 py-2">
                  <span className="sm:hidden">{day}</span>
                  <span className="hidden sm:inline">{DAY_NAMES_FULL[idx]}</span>
                </div>
              ))}
              <div className="text-center text-xs font-medium text-zinc-400 py-2">
                <span className="sm:hidden">Wk</span>
                <span className="hidden sm:inline">Week</span>
              </div>
            </div>

            {/* Calendar weeks with totals - flex-1 to fill available space */}
            <div className="flex-1 flex flex-col gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-8 gap-1 flex-1">
                {/* Week days */}
                {week.days.map((dayData, dayIndex) => {
                  const isToday = dayData &&
                    dayData.day === now.getDate() &&
                    month === now.getMonth() + 1 &&
                    year === now.getFullYear();

                  const hasActivity = dayData && (dayData.tradeCount > 0 || dayData.openPositionCount > 0);

                  return (
                    <button
                      key={dayIndex}
                      onClick={() => handleDayClick(dayData)}
                      disabled={!hasActivity}
                      className={`
                        min-h-12 sm:min-h-20 p-0.5 sm:p-2 rounded-lg text-center text-sm relative transition-all
                        ${dayData === null ? 'bg-transparent cursor-default' : ''}
                        ${hasActivity ? 'cursor-pointer hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600' : 'cursor-default'}
                        ${dayData?.isProfit ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}
                        ${dayData?.isLoss ? 'bg-red-50 dark:bg-red-900/20' : ''}
                        ${dayData && !dayData.isProfit && !dayData.isLoss && dayData.openPositionCount > 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                        ${dayData && !dayData.isProfit && !dayData.isLoss && dayData.openPositionCount === 0 ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}
                        ${isToday ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : ''}
                      `}
                    >
                      {dayData && (
                        <>
                          <div className={`text-xs sm:text-sm font-medium ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {dayData.day}
                          </div>
                          {dayData.tradeCount > 0 && (
                            <>
                              <div className={`text-[10px] sm:text-xs font-bold mt-0.5 truncate ${dayData.isProfit ? 'text-emerald-600 dark:text-emerald-400' : dayData.isLoss ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'}`}>
                                {formatSignedCurrency(dayData.realizedPnL, true)}
                              </div>
                              <div className="text-[9px] sm:text-[10px] text-zinc-400 mt-0.5">
                                {dayData.tradeCount} · {dayData.winRate}%
                              </div>
                            </>
                          )}
                          {dayData.openPositionCount > 0 && dayData.tradeCount === 0 && (
                            <div className="text-[10px] sm:text-xs text-blue-500 dark:text-blue-400 mt-1">
                              {dayData.openPositionCount} open
                            </div>
                          )}
                          {dayData.openPositionCount > 0 && (
                            <div className="absolute top-1 right-1">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}

                {/* Weekly total column - clickable */}
                <button
                  onClick={() => handleWeekClick(week, weekIndex)}
                  disabled={week.tradeCount === 0}
                  className={`min-h-12 sm:min-h-20 p-0.5 sm:p-2 rounded-lg flex flex-col items-center justify-center transition-all ${
                    week.tradeCount > 0
                      ? week.weekPnL > 0
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 hover:ring-2 hover:ring-emerald-300 dark:hover:ring-emerald-600 cursor-pointer'
                        : week.weekPnL < 0
                          ? 'bg-red-100 dark:bg-red-900/30 hover:ring-2 hover:ring-red-300 dark:hover:ring-red-600 cursor-pointer'
                          : 'bg-zinc-100 dark:bg-zinc-800 hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600 cursor-pointer'
                      : 'bg-zinc-50 dark:bg-zinc-800/30 cursor-default'
                  }`}
                >
                  {week.tradeCount > 0 ? (
                    <>
                      <div className={`text-[10px] sm:text-xs font-bold ${
                        week.weekPnL > 0
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : week.weekPnL < 0
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {formatSignedCurrency(week.weekPnL, true)}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {week.tradeCount} · {week.winRate}%
                      </div>
                      <div className="hidden sm:flex text-[9px] text-zinc-400 gap-1 mt-0.5">
                        <span className="text-emerald-600 dark:text-emerald-400">{week.winCount}W</span>
                        <span className="text-red-600 dark:text-red-400">{week.lossCount}L</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-zinc-400">—</div>
                  )}
                </button>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedDay(null)}
          />

          {/* Modal */}
          <div className="relative w-full sm:max-w-lg max-h-[85vh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {new Date(selectedDay.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    {selectedDay.tradeCount > 0 && (
                      <p className={`text-sm font-medium ${selectedDay.isProfit ? 'text-emerald-600 dark:text-emerald-400' : selectedDay.isLoss ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
                        {formatSignedCurrency(selectedDay.realizedPnL)}
                      </p>
                    )}
                    {selectedDay.tradeCount > 0 && (
                      <span className="text-xs text-zinc-400">
                        {selectedDay.tradeCount} closed · {selectedDay.winRate}% win rate
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() => setSelectedDay(null)}
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                >
                  <X className="h-5 w-5 text-zinc-500" />
                </Button>
              </div>

              {/* Summary Pills */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {selectedDay.winCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{selectedDay.winCount} wins</span>
                  </div>
                )}
                {selectedDay.lossCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20">
                    <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">{selectedDay.lossCount} losses</span>
                  </div>
                )}
                {selectedDay.openPositionCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20">
                    <Briefcase className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{selectedDay.openPositionCount} opened</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[65vh] p-4">
              {tradesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Open Positions Section */}
                  {selectedDay.openPositions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                        Positions Opened
                      </h4>
                      <div className="space-y-2">
                        {selectedDay.openPositions.map((pos) => (
                          <div
                            key={pos.id}
                            className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                                    {pos.symbol}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    pos.type === 'option'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  }`}>
                                    {pos.type}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                    OPEN
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {pos.side === 'short' ? '-' : ''}{pos.quantity} {pos.type === 'option' ? 'contract' : 'share'}{pos.quantity !== 1 ? 's' : ''}
                                  {pos.side === 'short' && ' (short)'}
                                  {' '}@ ${pos.avgPrice.toFixed(2)}
                                  {pos.strategy && ` · ${pos.strategy.replace(/_/g, ' ')}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {pos.ledgerEventId && (
                                  <Button
                                    onClick={() => handleEditTrade(pos.ledgerEventId, pos.type)}
                                    variant="secondary"
                                    size="icon"
                                    className="h-9 w-9"
                                    title="Edit Entry"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  onClick={() => handleCloseTrade(pos.id)}
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 border-orange-200 bg-orange-100 hover:bg-orange-200 dark:border-orange-800 dark:bg-orange-900/30 dark:hover:bg-orange-900/50"
                                  title="Close Position"
                                >
                                  <LogOut className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Closed Trades Section */}
                  {dayTrades && dayTrades.filter(t => t.status === 'closed').length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                        Closed Trades
                      </h4>
                      <div className="space-y-2">
                        {dayTrades.filter(t => t.status === 'closed').map((trade) => (
                          <div
                            key={trade.id}
                            className={`p-4 rounded-xl ${
                              trade.realizedPnL && trade.realizedPnL > 0
                                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                : trade.realizedPnL && trade.realizedPnL < 0
                                  ? 'bg-red-50 dark:bg-red-900/20'
                                  : 'bg-zinc-50 dark:bg-zinc-800'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                                    {trade.symbol}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    trade.type === 'option'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  }`}>
                                    {trade.type}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {trade.side === 'short' ? '-' : ''}{trade.quantity} {trade.type === 'option' ? 'contract' : 'share'}{trade.quantity !== 1 ? 's' : ''}
                                  {trade.side === 'short' && ' (short)'}
                                  {' '}· ${trade.openPrice.toFixed(2)} → ${trade.closePrice?.toFixed(2) ?? 'N/A'}
                                  {trade.strategy && ` · ${trade.strategy.replace(/_/g, ' ')}`}
                                </p>
                              </div>
                              <div className="flex items-start gap-3">
                                {trade.ledgerEventId && (
                                  <Button
                                    onClick={() => handleEditTrade(trade.ledgerEventId, trade.type, trade.closeEventId)}
                                    variant="secondary"
                                    size="icon"
                                    className="h-9 w-9"
                                    title="Edit Trade"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <div className="text-right">
                                  <p className={`font-bold ${
                                    trade.realizedPnL && trade.realizedPnL > 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : trade.realizedPnL && trade.realizedPnL < 0
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-zinc-500'
                                  }`}>
                                    {trade.realizedPnL ? formatSignedCurrency(trade.realizedPnL) : '$0.00'}
                                  </p>
                                  <p className="text-xs text-zinc-400 capitalize">{trade.closeReason}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {(!dayTrades || dayTrades.length === 0) && selectedDay.openPositions.length === 0 && (
                    <p className="text-center text-zinc-500 py-8">No activity for this day</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Week Summary Modal */}
      {selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedWeek(null)}
          />

          {/* Modal */}
          <div className="relative w-full sm:max-w-lg max-h-[85vh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Week Summary
                  </h3>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {new Date(selectedWeek.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(selectedWeek.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <Button
                  onClick={() => setSelectedWeek(null)}
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                >
                  <X className="h-5 w-5 text-zinc-500" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[65vh] p-5">
              {/* Main P&L */}
              <div className={`text-center p-6 rounded-2xl mb-4 ${
                selectedWeek.weekPnL > 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : selectedWeek.weekPnL < 0
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'bg-zinc-50 dark:bg-zinc-800'
              }`}>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">Weekly P&L</p>
                <p className={`text-3xl font-bold ${
                  selectedWeek.weekPnL > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : selectedWeek.weekPnL < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                }`}>
                  {formatSignedCurrency(selectedWeek.weekPnL)}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Trades</p>
                  <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedWeek.tradeCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Win Rate</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{selectedWeek.winRate}%</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Wins</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{selectedWeek.winCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-center">
                  <p className="text-xs text-red-600 dark:text-red-400 mb-1">Losses</p>
                  <p className="text-lg font-bold text-red-700 dark:text-red-300">{selectedWeek.lossCount}</p>
                </div>
              </div>

              {/* Biggest Winner & Loser */}
              {(weekTickerStats.biggestWinner || weekTickerStats.biggestLoser) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {weekTickerStats.biggestWinner && (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Top Winner</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        {weekTickerStats.biggestWinner.symbol}
                      </p>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatSignedCurrency(weekTickerStats.biggestWinner.pnl)}
                      </p>
                    </div>
                  )}
                  {weekTickerStats.biggestLoser && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="text-xs font-medium text-red-600 dark:text-red-400">Top Loser</span>
                      </div>
                      <p className="text-lg font-bold text-red-700 dark:text-red-300">
                        {weekTickerStats.biggestLoser.symbol}
                      </p>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {formatSignedCurrency(weekTickerStats.biggestLoser.pnl)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {weekTradesLoading && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              )}

              {/* Daily Breakdown */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">Daily Breakdown</h4>
                <div className="space-y-2">
                  {selectedWeek.days.map((day, idx) => {
                    if (!day || day.tradeCount === 0) return null;
                    const dayOfWeek = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = new Date(day.date).getDate();
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedWeek(null);
                          handleDayClick(day);
                        }}
                        className={`w-full p-3 rounded-xl flex items-center justify-between transition-all hover:ring-2 ${
                          day.isProfit
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 hover:ring-emerald-300 dark:hover:ring-emerald-600'
                            : day.isLoss
                              ? 'bg-red-50 dark:bg-red-900/20 hover:ring-red-300 dark:hover:ring-red-600'
                              : 'bg-zinc-50 dark:bg-zinc-800 hover:ring-zinc-300 dark:hover:ring-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-center min-w-10">
                            <p className="text-xs text-zinc-400">{dayOfWeek}</p>
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{dayNum}</p>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-zinc-500">
                              {day.tradeCount} trade{day.tradeCount !== 1 ? 's' : ''} · {day.winRate}% win
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className={`font-bold ${
                            day.isProfit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : day.isLoss
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-zinc-500'
                          }`}>
                            {formatSignedCurrency(day.realizedPnL)}
                          </p>
                          <ChevronRight className="h-4 w-4 text-zinc-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Average Stats */}
              {selectedWeek.tradingDays > 0 && (
                <div className="mt-4 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400">Avg P&L per Trading Day</p>
                      <p className={`text-lg font-bold ${
                        selectedWeek.weekPnL >= 0
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatSignedCurrency(selectedWeek.weekPnL / selectedWeek.tradingDays)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400">Trading Days</p>
                      <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{selectedWeek.tradingDays}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
