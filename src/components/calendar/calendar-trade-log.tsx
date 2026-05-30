'use client';

/**
 * CalendarTradeLog — Trade log table for the calendar page.
 *
 * Shows closed trades for the selected month in a scrollable table
 * matching the user's Excel workbook format: #, Date, Symbol, Status,
 * Qty, Entry, Exit, Win/Loss, Holding Days, Return $, Return %.
 *
 * Client-side pagination: newest 5 trades per page with prev/next.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatSignedCurrency, formatPercent } from '@/lib/utils';
import {
  CALENDAR_QUERY_KEYS,
  CALENDAR_STALE_TIME,
  fetchCalendarTrades,
  updateTradeType,
} from './lib/api';
import type { CalendarTrade, TradeType } from './lib/types';

const PAGE_SIZE = 5;

interface CalendarTradeLogProps {
  year: number;
  month: number;
  accountId: string | null;
}

function TradeTypeBadge({
  trade,
  onToggle,
  isPending,
}: {
  trade: CalendarTrade;
  onToggle: (id: string, newType: TradeType) => void;
  isPending: boolean;
}) {
  const isDaytrade = trade.tradeType === 'daytrade';

  return (
    <button
      onClick={() => onToggle(trade.id, isDaytrade ? 'swingtrade' : 'daytrade')}
      disabled={isPending}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
        'hover:opacity-80 disabled:opacity-50',
        isDaytrade
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      )}
      title={`Click to change to ${isDaytrade ? 'Swingtrade' : 'Daytrade'}`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        isDaytrade ? 'DT' : 'ST'
      )}
    </button>
  );
}

export function CalendarTradeLog({ year, month, accountId }: CalendarTradeLogProps) {
  const queryClient = useQueryClient();

  // Reset to first page when month/account changes (render-phase reset)
  const resetKey = `${year}-${month}-${accountId}`;
  const [pageState, setPageState] = useState({ key: resetKey, page: 0 });
  if (pageState.key !== resetKey) {
    setPageState({ key: resetKey, page: 0 });
  }
  const page = pageState.page;
  const setPage = (updater: (p: number) => number) =>
    setPageState(prev => ({ ...prev, page: updater(prev.page) }));

  const { data, isLoading } = useQuery({
    queryKey: CALENDAR_QUERY_KEYS.trades(year, month, accountId),
    queryFn: () => fetchCalendarTrades(year, month, accountId),
    staleTime: CALENDAR_STALE_TIME,
  });

  const mutation = useMutation({
    mutationFn: ({ id, tradeType }: { id: string; tradeType: TradeType }) =>
      updateTradeType(id, tradeType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEYS.trades(year, month, accountId) });
      queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEYS.dailyDetail(year, month, accountId) });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-8">
        <div className="flex items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading trades...</span>
        </div>
      </div>
    );
  }

  const allTrades = data?.trades ?? [];
  const summary = data?.monthSummary;

  if (allTrades.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-8">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          No closed trades this month.
        </p>
      </div>
    );
  }

  // Newest first, then paginate
  const sorted = [...allTrades].reverse();
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const trades = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 overflow-hidden">
      {/* Summary bar */}
      {summary && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 text-xs">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {summary.totalTrades} trades
          </span>
          <span className={cn(summary.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400', 'font-medium')}>
            {formatSignedCurrency(summary.totalPnL)}
          </span>
          <span className="text-zinc-500">
            Win: {summary.winRate}%
          </span>
          <span className="text-blue-600 dark:text-blue-400">
            DT: {summary.daytradeCount}
          </span>
          <span className="text-amber-600 dark:text-amber-400">
            ST: {summary.swingtradeCount}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto scrollbar-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
              <th className="px-1.5 sm:px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">#</th>
              <th className="px-1.5 sm:px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Date</th>
              <th className="px-1.5 sm:px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Symbol</th>
              <th className="px-1.5 sm:px-3 py-2 text-center font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Status</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap hidden sm:table-cell">Qty</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap hidden md:table-cell">Entry</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap hidden md:table-cell">Exit</th>
              <th className="px-1.5 sm:px-3 py-2 text-center font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">W/L</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap hidden sm:table-cell">Days</th>
              <th className="px-1.5 sm:px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Return</th>
              <th className="px-1.5 sm:px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">%</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr
                key={trade.id}
                className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <td className="px-1.5 sm:px-3 py-2 text-zinc-400 dark:text-zinc-500 tabular-nums">
                  {trade.tradeNumber}
                </td>
                <td className="px-1.5 sm:px-3 py-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap tabular-nums">
                  {formatShortDate(trade.closeDate)}
                </td>
                <td className="px-1.5 sm:px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                  {trade.displaySymbol}
                </td>
                <td className="px-1.5 sm:px-3 py-2 text-center">
                  <TradeTypeBadge
                    trade={trade}
                    onToggle={(id, newType) => mutation.mutate({ id, tradeType: newType })}
                    isPending={mutation.isPending}
                  />
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 tabular-nums hidden sm:table-cell">
                  {trade.quantity}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 tabular-nums whitespace-nowrap hidden md:table-cell">
                  {formatCurrency(trade.entryTotal)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 tabular-nums whitespace-nowrap hidden md:table-cell">
                  {formatCurrency(trade.exitTotal)}
                </td>
                <td className="px-1.5 sm:px-3 py-2 text-center">
                  <span
                    className={cn(
                      'inline-flex px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold',
                      trade.isWin
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    )}
                  >
                    {trade.isWin ? 'Win' : 'Loss'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 tabular-nums hidden sm:table-cell">
                  {trade.holdingDays}
                </td>
                <td
                  className={cn(
                    'px-1.5 sm:px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap',
                    trade.returnDollars >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {formatSignedCurrency(trade.returnDollars)}
                </td>
                <td
                  className={cn(
                    'px-1.5 sm:px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap',
                    trade.returnPercent >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {formatPercent(trade.returnPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-md text-sm transition-colors',
                page === 0
                  ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700',
              )}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums min-w-[3rem] text-center">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-md text-sm transition-colors',
                page >= totalPages - 1
                  ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700',
              )}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format "2026-02-17" → "2/17" */
function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
}
