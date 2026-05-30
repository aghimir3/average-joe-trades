'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Ticker Calendar Component
 *
 * Displays daily premium collected from wheel trades (CC/CSP) for a specific ticker.
 * Used within Ticker Deep Dive to show calendar view of a ticker's wheel strategy performance.
 *
 * This is essentially the Wheel Calendar filtered to one symbol.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, TrendingUp, X, Target, Clock, Calendar } from 'lucide-react';
import { BaseCalendar } from '@/components/calendar';
import type {
  WheelCalendarDay,
  WheelWeekSummary,
  WheelCalendarSummary,
  CalendarWeek,
} from '@/components/calendar';
import { cn, formatSignedCurrency } from '@/lib/utils';

interface TickerWheelCalendarData {
  type: 'wheel';
  year: number;
  month: number;
  symbol: string | null;
  days: WheelCalendarDay[];
  summary: WheelCalendarSummary;
}

async function fetchTickerWheelCalendar(
  year: number,
  month: number,
  symbol: string,
  accountId?: string | null
): Promise<TickerWheelCalendarData> {
  const params = new URLSearchParams({
    type: 'wheel',
    year: String(year),
    month: String(month),
    symbol,
  });
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }

  const response = await fetch(`/api/dashboard/calendar?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch ticker wheel calendar');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

interface TickerCalendarProps {
  symbol: string;
  accountId?: string | null;
}

export function TickerCalendar({ symbol, accountId }: TickerCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<WheelCalendarDay | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<{
    week: CalendarWeek<WheelCalendarDay>;
    summary: WheelWeekSummary;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickerWheelCalendar', year, month, symbol, accountId],
    queryFn: () => fetchTickerWheelCalendar(year, month, symbol, accountId),
    enabled: !!symbol,
  });

  // Navigation handlers
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

  // Calculate week summary
  const calculateWeekSummary = (week: CalendarWeek<WheelCalendarDay>): WheelWeekSummary => {
    const days = week.days.filter((d): d is WheelCalendarDay => d !== null && d.hasActivity);

    return {
      totalPremium: days.reduce((sum, d) => sum + d.premiumCollected, 0),
      ccPremium: days.reduce((sum, d) => sum + d.ccPremium, 0),
      cspPremium: days.reduce((sum, d) => sum + d.cspPremium, 0),
      tradeCount: days.reduce((sum, d) => sum + d.tradeCount, 0),
      ccCount: days.reduce((sum, d) => sum + d.ccCount, 0),
      cspCount: days.reduce((sum, d) => sum + d.cspCount, 0),
      assignments: days.reduce((sum, d) => sum + d.assignmentCount, 0),
      expirations: days.reduce((sum, d) => sum + d.expirationCount, 0),
      tradingDays: days.length,
    };
  };

  // Check if a date is in the future
  const isFutureDate = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr + 'T12:00:00');
    return date > today;
  };

  // Render day cell
  const renderDayCell = (
    day: WheelCalendarDay | null,
    isToday: boolean,
    onClick?: () => void
  ) => {
    if (!day) {
      return <div className="min-h-12 sm:min-h-20" />;
    }

    const isFuture = isFutureDate(day.date);
    const premium = day.premiumCollected ?? 0;
    const hasPremium = premium !== 0;
    const isLoss = premium < 0;
    const hasAssignment = (day.assignmentCount ?? 0) > 0;
    const hasExpiration = (day.expirationCount ?? 0) > 0;
    const hasActivity = day.hasActivity;

    return (
      <button
        onClick={onClick}
        disabled={!hasActivity}
        className={cn(
          'w-full min-h-12 sm:min-h-20 p-0.5 sm:p-2 rounded-lg transition-all text-center relative',
          isToday && 'ring-2 ring-indigo-400 dark:ring-indigo-500',
          hasActivity && 'cursor-pointer hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600',
          !hasActivity && 'cursor-default',
          hasActivity && hasPremium && !isLoss && 'bg-violet-50 dark:bg-violet-900/20',
          hasActivity && isLoss && 'bg-red-50 dark:bg-red-900/20',
          hasActivity && hasAssignment && !hasPremium && 'bg-amber-50 dark:bg-amber-900/20',
          !hasActivity && !isFuture && 'bg-zinc-50 dark:bg-zinc-800/50',
        )}
      >
        <div
          className={cn(
            'text-xs sm:text-sm font-medium',
            isToday && 'text-indigo-600 dark:text-indigo-400',
            !isToday && hasActivity && 'text-zinc-600 dark:text-zinc-400',
            !isToday && !hasActivity && 'text-zinc-400 dark:text-zinc-500'
          )}
        >
          {day.day}
        </div>

        {hasActivity && hasPremium && (
          <div className={cn(
            'text-[10px] sm:text-xs font-bold mt-0.5 truncate',
            isLoss
              ? 'text-red-600 dark:text-red-400'
              : 'text-violet-600 dark:text-violet-400'
          )}>
            {formatSignedCurrency(premium, true)}
          </div>
        )}

        {hasActivity && (
          <div className="text-[9px] sm:text-[10px] text-zinc-400 mt-0.5">
            {(day.ccCount ?? 0) > 0 && (day.cspCount ?? 0) > 0
              ? `${day.ccCount}C · ${day.cspCount}P`
              : (day.ccCount ?? 0) > 0
                ? `${day.ccCount} CC`
                : (day.cspCount ?? 0) > 0
                  ? `${day.cspCount} CSP`
                  : ''}
          </div>
        )}

        {(hasAssignment || hasExpiration) && (
          <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 flex items-center gap-0.5">
            {hasExpiration && (
              <span className="text-[8px] sm:text-xs text-emerald-500 font-bold">✓</span>
            )}
            {hasAssignment && (
              <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-500 fill-amber-500" />
            )}
          </div>
        )}
      </button>
    );
  };

  // Render week cell
  const renderWeekCell = (
    week: CalendarWeek<WheelCalendarDay>,
    summary: WheelWeekSummary,
    onClick?: () => void
  ) => {
    const hasActivity = summary.tradeCount > 0;
    const hasPremium = summary.totalPremium !== 0;
    const isWeekLoss = summary.totalPremium < 0;

    return (
      <button
        onClick={onClick}
        disabled={!hasActivity}
        className={cn(
          'w-full min-h-12 sm:min-h-20 p-0.5 sm:p-2 rounded-lg flex flex-col items-center justify-center transition-all',
          hasActivity && hasPremium && !isWeekLoss && 'bg-violet-100 dark:bg-violet-900/30 cursor-pointer hover:ring-2 hover:ring-violet-300 dark:hover:ring-violet-600',
          hasActivity && isWeekLoss && 'bg-red-100 dark:bg-red-900/30 cursor-pointer hover:ring-2 hover:ring-red-300 dark:hover:ring-red-600',
          hasActivity && !hasPremium && 'bg-zinc-100 dark:bg-zinc-800 cursor-pointer hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600',
          !hasActivity && 'bg-zinc-50 dark:bg-zinc-800/30 cursor-default'
        )}
      >
        {hasActivity ? (
          <>
            <div
              className={cn(
                'text-[10px] sm:text-xs font-bold',
                isWeekLoss
                  ? 'text-red-700 dark:text-red-300'
                  : hasPremium
                    ? 'text-violet-700 dark:text-violet-300'
                    : 'text-zinc-600 dark:text-zinc-400'
              )}
            >
              {formatSignedCurrency(summary.totalPremium, true)}
            </div>
            <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {summary.tradeCount} trades
            </div>
            <div className="hidden sm:block text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {summary.ccCount}C · {summary.cspCount}P
            </div>
          </>
        ) : (
          <span className="text-[10px] text-zinc-400">—</span>
        )}
      </button>
    );
  };

  // Render summary
  const renderSummary = () => {
    if (!data) return null;

    const { summary } = data;

    return (
      <div className="px-2 py-1.5 sm:px-4 sm:py-2.5">
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-violet-50 dark:bg-violet-900/20 text-[10px] sm:text-xs font-medium">
            <span className="text-violet-600 dark:text-violet-400">{formatSignedCurrency(summary.totalPremium)}</span>
            <span className="text-violet-500 dark:text-violet-300">premium</span>
          </div>
          <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] sm:text-xs font-medium">
            <span className="text-zinc-500">{summary.totalTrades}</span>
            <span className="text-zinc-400">trades ({summary.ccCount} CC, {summary.cspCount} CSP)</span>
          </div>
          <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-[10px] sm:text-xs font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">{summary.expirations}</span>
            <span className="text-emerald-500 dark:text-emerald-300">expired</span>
          </div>
          <div className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-[10px] sm:text-xs font-medium">
            <span className="text-amber-600 dark:text-amber-400">{summary.assignments}</span>
            <span className="text-amber-500 dark:text-amber-300">assigned</span>
          </div>
        </div>
      </div>
    );
  };

  if (!symbol) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 p-8 text-center">
        <Calendar className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">Select a ticker to view its wheel calendar</p>
      </div>
    );
  }

  return (
    <>
      <BaseCalendar
        year={year}
        month={month}
        days={data?.days ?? []}
        isLoading={isLoading}
        error={error ? 'Failed to load ticker calendar' : null}
        onPreviousMonth={goToPreviousMonth}
        onNextMonth={goToNextMonth}
        onCurrentMonth={goToCurrentMonth}
        renderDayCell={renderDayCell}
        renderWeekCell={renderWeekCell}
        renderSummary={renderSummary}
        calculateWeekSummary={calculateWeekSummary}
        onDayClick={(day) => day.hasActivity && setSelectedDay(day)}
        onWeekClick={(week, summary) => summary.tradeCount > 0 && setSelectedWeek({ week, summary })}
        title={`${symbol} Wheel Calendar`}
        subtitle={
          data
            ? `${formatSignedCurrency(data.summary.totalPremium)} this month`
            : undefined
        }
        helpTooltip={{
          title: 'Ticker Wheel Calendar',
          description: `Shows daily premium collected from covered calls and cash-secured puts for ${symbol}. Click a day or week to see trade details.`,
        }}
      />

      {/* Day Detail Modal */}
      {selectedDay && (
        <DayModal day={selectedDay} symbol={symbol} onClose={() => setSelectedDay(null)} />
      )}

      {/* Week Detail Modal */}
      {selectedWeek && (
        <WeekModal
          week={selectedWeek.week}
          summary={selectedWeek.summary}
          symbol={symbol}
          onClose={() => setSelectedWeek(null)}
        />
      )}
    </>
  );
}

// ============================================================
// Day Modal
// ============================================================

interface DayModalProps {
  day: WheelCalendarDay;
  symbol: string;
  onClose: () => void;
}

function DayModal({ day, symbol, onClose }: DayModalProps) {
  const formattedDate = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-br from-violet-500 to-violet-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{symbol}</span>
              <Zap className="h-4 w-4" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-white/80 text-sm">{formattedDate}</p>
          <div className="mt-4 text-center">
            <p className="text-3xl font-bold">{formatSignedCurrency(day.premiumCollected)}</p>
            <p className="text-white/80 text-sm">Premium Collected</p>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
                {day.ccCount}
              </p>
              <p className="text-[10px] text-zinc-500">CC</p>
            </div>
            <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
                {day.cspCount}
              </p>
              <p className="text-[10px] text-zinc-500">CSP</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {day.expirationCount}
              </p>
              <p className="text-[10px] text-zinc-500">Expired</p>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {day.assignmentCount}
              </p>
              <p className="text-[10px] text-zinc-500">Assigned</p>
            </div>
          </div>
        </div>

        {/* Trades List */}
        <div className="p-4 overflow-y-auto max-h-64">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Trades ({day.trades.length})
          </h4>
          <div className="space-y-2">
            {day.trades.map((trade) => (
              <div
                key={trade.id}
                className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      trade.strategy === 'covered_call'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                    )}
                  >
                    {trade.strategy === 'covered_call' ? 'Covered Call' : 'Cash-Secured Put'}
                  </span>
                  <span className="font-bold text-violet-600 dark:text-violet-400">
                    {formatSignedCurrency(trade.premium)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                  <span>${trade.strike} strike</span>
                  <span>·</span>
                  <span>Exp {trade.expiration}</span>
                  <span>·</span>
                  <span
                    className={cn(
                      trade.closeReason === 'expired' && 'text-emerald-600',
                      trade.closeReason === 'assigned' && 'text-amber-600',
                      trade.closeReason === 'normal' && 'text-zinc-500'
                    )}
                  >
                    {trade.closeReason === 'expired'
                      ? 'Expired'
                      : trade.closeReason === 'assigned'
                        ? 'Assigned'
                        : 'Closed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Week Modal
// ============================================================

interface WeekModalProps {
  week: CalendarWeek<WheelCalendarDay>;
  summary: WheelWeekSummary;
  symbol: string;
  onClose: () => void;
}

function WeekModal({ week, summary, symbol, onClose }: WeekModalProps) {
  const startDate = new Date(week.weekStart + 'T12:00:00');
  const endDate = new Date(week.weekEnd + 'T12:00:00');

  const dateRange = `${startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} - ${endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-br from-violet-500 to-violet-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{symbol}</span>
              <TrendingUp className="h-4 w-4" />
              <span className="text-white/80">Week Summary</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1">{dateRange}</p>
          <div className="mt-4 text-center">
            <p className="text-3xl font-bold">{formatSignedCurrency(summary.totalPremium)}</p>
            <p className="text-white/80 text-sm">Weekly Premium</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-center">
              <Target className="h-4 w-4 text-violet-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
                {summary.tradeCount}
              </p>
              <p className="text-xs text-zinc-500">Total Trades</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
              <Clock className="h-4 w-4 text-zinc-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                {summary.tradingDays}
              </p>
              <p className="text-xs text-zinc-500">Active Days</p>
            </div>
          </div>
        </div>

        {/* Strategy Breakdown */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Strategy Breakdown
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Covered Calls ({summary.ccCount})
              </span>
              <span className="font-bold text-blue-700 dark:text-blue-300">
                {formatSignedCurrency(summary.ccPremium)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <span className="text-sm text-purple-700 dark:text-purple-300">
                Cash-Secured Puts ({summary.cspCount})
              </span>
              <span className="font-bold text-purple-700 dark:text-purple-300">
                {formatSignedCurrency(summary.cspPremium)}
              </span>
            </div>
          </div>
        </div>

        {/* Outcomes */}
        <div className="p-4">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Outcomes
          </h4>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {summary.expirations} expired
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400">⚡</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {summary.assignments} assigned
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
