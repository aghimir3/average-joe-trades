'use client';

/**
 * CalendarMonthlyView — Monthly P&L calendar grid.
 *
 * 8-column grid: Sun-Sat + Week Summary. Each day cell shows
 * individual ticker P&L entries with color coding, plus daily totals.
 * Week summary column shows running total, DT/ST split, and win rate.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSignedCurrency, formatCompactCurrency } from '@/lib/utils';
import {
  CALENDAR_QUERY_KEYS,
  CALENDAR_STALE_TIME,
  fetchCalendarDailyDetail,
} from './lib/api';
import type { DayDetail, WeekSummary } from './lib/types';

interface CalendarMonthlyViewProps {
  year: number;
  month: number;
  accountId: string | null;
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_HEADERS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Build a 2D grid of weeks × 7 days for the given month */
function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDow = firstDay.getUTCDay(); // 0=Sun

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(startDow).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

/** Compact signed format for mobile: +$1.2K / -$348 */
function compactSigned(val: number): string {
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '-';
  // formatCompactCurrency returns with $ and sign, so strip and re-sign for consistency
  if (abs >= 1000) {
    const compact = formatCompactCurrency(abs); // always positive abs → "$1.2K"
    return `${sign}${compact}`;
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

/** Max tickers to show: 3 on mobile, 5 on desktop (controlled via CSS) */
const MOBILE_TICKER_LIMIT = 3;
const DESKTOP_TICKER_LIMIT = 5;

function DayCell({ day, dayData }: { day: number | null; dayData?: DayDetail }) {
  if (day === null) {
    return <div className="min-h-[60px] sm:min-h-[100px] bg-zinc-50/50 dark:bg-zinc-900/20" />;
  }

  const tickers = dayData?.tickers ?? [];
  const hasTrades = dayData && dayData.tradeCount > 0;

  return (
    <div className="min-h-[60px] sm:min-h-[100px] p-0.5 sm:p-1.5 flex flex-col">
      {/* Day number */}
      <span className="text-[10px] sm:text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-0.5">
        {day}
      </span>

      {/* Ticker entries */}
      {tickers.length > 0 && (
        <div className="flex-1 space-y-0 sm:space-y-0.5 overflow-hidden">
          {tickers.slice(0, DESKTOP_TICKER_LIMIT).map((t, i) => (
            <div
              key={`${t.symbol}-${i}`}
              className={cn(
                'flex items-baseline justify-between gap-0.5 sm:gap-1 text-[10px] sm:text-xs leading-tight',
                i >= MOBILE_TICKER_LIMIT && 'hidden sm:flex',
              )}
            >
              <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[3ch] sm:max-w-none">
                {t.symbol.slice(0, 2)}
                <span className="hidden sm:inline">{t.symbol.slice(2)}</span>
              </span>
              <span
                className={cn(
                  'tabular-nums font-medium shrink-0',
                  t.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                )}
              >
                {t.pnl >= 0 ? '' : '-'}{Math.abs(Math.round(t.pnl)).toLocaleString()}
              </span>
            </div>
          ))}
          {/* Mobile: +N more (accounts for mobile limit) */}
          {tickers.length > MOBILE_TICKER_LIMIT && (
            <span className="text-[9px] text-zinc-400 sm:hidden">
              +{tickers.length - MOBILE_TICKER_LIMIT} more
            </span>
          )}
          {/* Desktop: +N more (accounts for desktop limit) */}
          {tickers.length > DESKTOP_TICKER_LIMIT && (
            <span className="text-[10px] text-zinc-400 hidden sm:block">
              +{tickers.length - DESKTOP_TICKER_LIMIT} more
            </span>
          )}
        </div>
      )}

      {/* Daily total */}
      {hasTrades && (
        <div className="mt-auto pt-0.5 sm:pt-1 border-t border-zinc-100 dark:border-zinc-800">
          <span
            className={cn(
              'text-[10px] sm:text-xs font-semibold tabular-nums block',
              dayData.dailyTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}
          >
            {/* Mobile: compact, no "Total:" prefix */}
            <span className="sm:hidden">{compactSigned(dayData.dailyTotal)}</span>
            {/* Desktop: full format with prefix */}
            <span className="hidden sm:inline">Total: {formatSignedCurrency(dayData.dailyTotal)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function WeekSummaryCell({ summary }: { summary?: WeekSummary }) {
  if (!summary || summary.tradeCount === 0) {
    return <div className="min-h-[80px] sm:min-h-[100px]" />;
  }

  return (
    <div className="min-h-[80px] sm:min-h-[100px] p-1.5 flex flex-col gap-0.5 text-xs">
      {/* Running total */}
      <div className="flex justify-between">
        <span className="text-zinc-500">Total:</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            summary.runningTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {formatSignedCurrency(summary.runningTotal)}
        </span>
      </div>

      {/* Week P&L */}
      <div className="flex justify-between">
        <span className="text-zinc-500">Wk:</span>
        <span
          className={cn(
            'font-medium tabular-nums',
            summary.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {formatSignedCurrency(summary.totalPnL)}
        </span>
      </div>

      {/* DT/ST split */}
      {(summary.daytradePnL !== 0 || summary.swingtradePnL !== 0) && (
        <>
          <div className="flex justify-between">
            <span className="text-blue-500">DT:</span>
            <span className={cn('tabular-nums', summary.daytradePnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {formatSignedCurrency(summary.daytradePnL)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-500">ST:</span>
            <span className={cn('tabular-nums', summary.swingtradePnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {formatSignedCurrency(summary.swingtradePnL)}
            </span>
          </div>
        </>
      )}

      {/* Win rate */}
      <div className="flex justify-between mt-auto">
        <span className="text-zinc-500">Win:</span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{summary.winRate}%</span>
      </div>
    </div>
  );
}

/** Compact horizontal week summaries for mobile (replaces the hidden Summary column) */
function MobileWeekSummaries({ weekSummaries }: { weekSummaries: WeekSummary[] }) {
  const activeSummaries = weekSummaries.filter(s => s.tradeCount > 0);
  if (activeSummaries.length === 0) return null;

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {activeSummaries.map((s) => (
        <div key={s.weekNumber} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
          <span className="text-zinc-500 font-medium">Wk {s.weekNumber}</span>
          <div className="flex items-center gap-3">
            <span className={cn('tabular-nums font-semibold', s.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {compactSigned(s.totalPnL)}
            </span>
            {s.daytradePnL !== 0 && (
              <span className={cn('tabular-nums text-blue-500')}>
                DT:{compactSigned(s.daytradePnL)}
              </span>
            )}
            {s.swingtradePnL !== 0 && (
              <span className={cn('tabular-nums text-amber-500')}>
                ST:{compactSigned(s.swingtradePnL)}
              </span>
            )}
            <span className="text-zinc-500">{s.winRate}%W</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarMonthlyView({ year, month, accountId }: CalendarMonthlyViewProps) {
  const { data, isLoading } = useQuery({
    queryKey: CALENDAR_QUERY_KEYS.dailyDetail(year, month, accountId),
    queryFn: () => fetchCalendarDailyDetail(year, month, accountId),
    staleTime: CALENDAR_STALE_TIME,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-8">
        <div className="flex items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading calendar...</span>
        </div>
      </div>
    );
  }

  const days = data?.days ?? [];
  const weekSummaries = data?.weekSummaries ?? [];

  // Build day lookup
  const dayMap = new Map(days.map(d => [d.day, d]));

  // Build calendar grid
  const weeks = buildCalendarGrid(year, month);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-7 sm:grid-cols-8 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
        {DAY_HEADERS.map((header, i) => (
          <div
            key={header}
            className="px-0.5 sm:px-1.5 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            <span className="hidden sm:inline">{header}</span>
            <span className="sm:hidden">{DAY_HEADERS_SHORT[i]}</span>
          </div>
        ))}
        <div className="hidden sm:block px-1.5 py-2 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 border-l border-zinc-200 dark:border-zinc-700">
          Summary
        </div>
      </div>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => (
        <div
          key={weekIdx}
          className={cn(
            'grid grid-cols-7 sm:grid-cols-8',
            weekIdx < weeks.length - 1 && 'border-b border-zinc-200 dark:border-zinc-700',
          )}
        >
          {week.map((day, dayIdx) => (
            <div
              key={`${weekIdx}-${dayIdx}`}
              className={cn(
                dayIdx < 6 && 'border-r border-zinc-100 dark:border-zinc-800',
              )}
            >
              <DayCell day={day} dayData={day ? dayMap.get(day) : undefined} />
            </div>
          ))}
          {/* Week summary column — hidden on mobile */}
          <div className="hidden sm:block border-l border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/20">
            <WeekSummaryCell summary={weekSummaries[weekIdx]} />
          </div>
        </div>
      ))}

      {/* Mobile week summaries — shown below the grid on mobile only */}
      <div className="sm:hidden border-t border-zinc-200 dark:border-zinc-700">
        <MobileWeekSummaries weekSummaries={weekSummaries} />
      </div>
    </div>
  );
}
