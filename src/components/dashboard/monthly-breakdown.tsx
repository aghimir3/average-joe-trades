'use client';

/**
 * Monthly Performance Breakdown Component
 *
 * Modern card-based display of monthly trading performance.
 * Shows 6 months by default with ability to expand to show all.
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { CalendarDays, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Filter, ArrowUpDown, X, ChevronRight, BarChart3, Target, Layers } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Button } from '@/components/ui/button';
import { formatSignedCurrency } from '@/lib/utils';

interface MonthlyData {
  month: string;
  totalPnL: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  avgTradeSizeStock: number;
  avgTradeSizeOption: number;
  stockTradeCount: number;
  optionTradeCount: number;
}

interface MonthlyBreakdownProps {
  data: MonthlyData[];
}

// formatCurrency with + sign for P&L = formatSignedCurrency from utils
// formatCompactCurrency with + sign for P&L = formatSignedCurrency(..., true) from utils

// Number of months to show per page
const MONTHS_PER_PAGE = 6;

type SortOption = 'date' | 'pnl' | 'trades' | 'winrate';
type FilterOption = 'all' | 'profitable' | 'losing';
type DateRangeOption = 'all' | '6m' | '12m' | 'ytd' | 'custom';

function getDateRangeStart(option: DateRangeOption, customStart?: string): string | null {
  if (option === 'all') return null;
  if (option === 'custom' && customStart) return customStart;

  const now = new Date();
  let startDate: Date;

  switch (option) {
    case '6m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case '12m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case 'ytd':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }

  return `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

function formatMonthFull(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

/**
 * Modal for detailed month stats
 */
function MonthDetailModal({
  month,
  onClose,
}: {
  month: MonthlyData;
  onClose: () => void;
}) {
  const breakeven = month.tradeCount - month.wins - month.losses;
  const avgDailyPnL = month.totalPnL / 21; // ~21 trading days per month
  const winPercent = month.tradeCount > 0 ? (month.wins / month.tradeCount) * 100 : 0;
  const lossPercent = month.tradeCount > 0 ? (month.losses / month.tradeCount) * 100 : 0;
  const breakevenPercent = month.tradeCount > 0 ? (breakeven / month.tradeCount) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 ${
          month.totalPnL > 0
            ? 'bg-emerald-500 dark:bg-emerald-600'
            : month.totalPnL < 0
              ? 'bg-red-500 dark:bg-red-600'
              : 'bg-zinc-500 dark:bg-zinc-600'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/20">
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {formatMonthFull(month.month)}
                </h3>
                <p className="text-white/80 text-sm">
                  {month.tradeCount} trades
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-3xl font-bold text-white">
              {formatSignedCurrency(month.totalPnL)}
            </p>
            <p className="text-white/80 text-sm">Total P&L</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4 space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
              <Target className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {month.winRate.toFixed(0)}%
              </p>
              <p className="text-xs text-zinc-500">Win Rate</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
              <BarChart3 className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className={`text-lg font-bold ${avgDailyPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatSignedCurrency(avgDailyPnL, true)}
              </p>
              <p className="text-xs text-zinc-500">Avg/Day</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-center">
              <Layers className="h-4 w-4 text-violet-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {month.tradeCount}
              </p>
              <p className="text-xs text-zinc-500">Trades</p>
            </div>
          </div>

          {/* Win/Loss Distribution */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Trade Results
            </h4>
            {/* Visual Bar */}
            <div className="flex h-3 rounded-full overflow-hidden mb-3">
              <div
                className="bg-emerald-500"
                style={{ width: `${winPercent}%` }}
                title={`${month.wins} wins`}
              />
              <div
                className="bg-zinc-300 dark:bg-zinc-600"
                style={{ width: `${breakevenPercent}%` }}
                title={`${breakeven} breakeven`}
              />
              <div
                className="bg-red-500"
                style={{ width: `${lossPercent}%` }}
                title={`${month.losses} losses`}
              />
            </div>
            {/* Legend */}
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{month.wins}</span> wins
                </span>
              </div>
              {breakeven > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold">{breakeven}</span> even
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-red-600 dark:text-red-400">{month.losses}</span> losses
                </span>
              </div>
            </div>
          </div>

          {/* Asset Breakdown */}
          {(month.stockTradeCount > 0 || month.optionTradeCount > 0) && (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Asset Breakdown
              </h4>
              <div className="space-y-3">
                {month.stockTradeCount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Stocks</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {month.stockTradeCount} trades
                      </p>
                      {month.avgTradeSizeStock > 0 && (
                        <p className="text-base font-bold text-blue-600 dark:text-blue-400">
                          ${month.avgTradeSizeStock.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          <span className="text-xs font-normal text-zinc-500 ml-1">avg</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {month.optionTradeCount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Options</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {month.optionTradeCount} trades
                      </p>
                      {month.avgTradeSizeOption > 0 && (
                        <p className="text-base font-bold text-purple-600 dark:text-purple-400">
                          ${month.avgTradeSizeOption.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          <span className="text-xs font-normal text-zinc-500 ml-1">avg</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonthlyBreakdown({ data }: MonthlyBreakdownProps) {
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortAsc, setSortAsc] = useState(false); // Default descending (newest first)
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [dateRange, setDateRange] = useState<DateRangeOption>('all');
  const [selectedMonth, setSelectedMonth] = useState<MonthlyData | null>(null);

  // Swipe gesture state
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = [...data];

    // Apply date range filter
    const rangeStart = getDateRangeStart(dateRange);
    if (rangeStart) {
      filtered = filtered.filter(m => m.month >= rangeStart);
    }

    // Apply profit/loss filter
    if (filterBy === 'profitable') {
      filtered = filtered.filter(m => m.totalPnL > 0);
    } else if (filterBy === 'losing') {
      filtered = filtered.filter(m => m.totalPnL < 0);
    }

    // Apply sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = a.month.localeCompare(b.month);
          break;
        case 'pnl':
          cmp = a.totalPnL - b.totalPnL;
          break;
        case 'trades':
          cmp = a.tradeCount - b.tradeCount;
          break;
        case 'winrate':
          cmp = a.winRate - b.winRate;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [data, sortBy, sortAsc, filterBy, dateRange]);

  // Pagination
  const totalPages = Math.ceil(processedData.length / MONTHS_PER_PAGE);
  const startIndex = page * MONTHS_PER_PAGE;
  const visibleData = processedData.slice(startIndex, startIndex + MONTHS_PER_PAGE);
  const hasMore = processedData.length > MONTHS_PER_PAGE;

  const toggleSort = (newSort: SortOption) => {
    if (sortBy === newSort) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(newSort);
      setSortAsc(newSort === 'date' ? false : true); // Date defaults to desc, others to asc
    }
  };

  // Swipe handlers for mobile pagination
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0 && page < totalPages - 1) {
        // Swipe left - go to next (older) page
        setPage(p => p + 1);
      } else if (diff < 0 && page > 0) {
        // Swipe right - go to previous (newer) page
        setPage(p => p - 1);
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }, [page, totalPages]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/30">
            <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Monthly Performance
          </h2>
          <HelpTooltip
            title="Monthly Performance"
            description="Breakdown of your trading performance by month. Shows total P&L, trade count, and win rate for each month."
          />
        </div>
        <div className="flex items-center justify-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <p className="text-zinc-400 dark:text-zinc-500">
            No trading data yet
          </p>
        </div>
      </div>
    );
  }

  // Calculate totals from filtered data
  const totals = processedData.reduce(
    (acc, m) => ({
      pnl: acc.pnl + m.totalPnL,
      trades: acc.trades + m.tradeCount,
      wins: acc.wins + m.wins,
      losses: acc.losses + m.losses,
    }),
    { pnl: 0, trades: 0, wins: 0, losses: 0 }
  );

  // Calculate profitable/losing months
  const profitableMonths = data.filter(m => m.totalPnL > 0).length;
  const losingMonths = data.filter(m => m.totalPnL < 0).length;

  const totalWinRate = (totals.wins + totals.losses) > 0
    ? (totals.wins / (totals.wins + totals.losses)) * 100
    : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/30">
            <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Monthly Performance
            </h2>
            <p className="text-sm text-zinc-500">
              <span className="text-emerald-600 dark:text-emerald-400">{profitableMonths}</span> green · <span className="text-red-600 dark:text-red-400">{losingMonths}</span> red months
            </p>
          </div>
          <HelpTooltip
            title="Monthly Performance"
            description="Breakdown of your trading performance by month. Shows total P&L, trade count, and win rate for each month."
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Total Summary - Desktop */}
          <div className="hidden sm:flex items-center gap-4 mr-2">
            <div className="text-right">
              <p className="text-xs text-zinc-400">Total P&L</p>
              <p className={`text-lg font-bold ${totals.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {formatSignedCurrency(totals.pnl, true)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">Win Rate</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {totalWinRate.toFixed(0)}%
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="ghost"
            size="icon"
            className={showFilters ? 'bg-zinc-100 dark:bg-zinc-800' : ''}
          >
            <Filter className="h-4 w-4 text-zinc-500" />
          </Button>
        </div>
      </div>

      {/* Mobile Summary */}
      <div className="sm:hidden flex gap-3 mb-4">
        <div className="flex-1 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
          <p className="text-xs text-zinc-400">Total P&L</p>
          <p className={`text-lg font-bold ${totals.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {formatSignedCurrency(totals.pnl, true)}
          </p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
          <p className="text-xs text-zinc-400">Win Rate</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {totalWinRate.toFixed(0)}%
          </p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
          <p className="text-xs text-zinc-400">Trades</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {totals.trades}
          </p>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2 mb-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
          {/* Date Range Presets */}
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 mr-1 self-center">Range:</span>
            {(['all', '6m', '12m', 'ytd'] as const).map((range) => (
              <button
                key={range}
                onClick={() => { setDateRange(range); setPage(0); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-amber-500 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                {range === 'all' ? 'All' : range === '6m' ? '6M' : range === '12m' ? '12M' : 'YTD'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Profit/Loss Filter */}
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={() => { setFilterBy('all'); setPage(0); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBy === 'all'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                All ({data.length})
              </button>
              <button
                onClick={() => { setFilterBy('profitable'); setPage(0); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-x border-zinc-200 dark:border-zinc-700 ${
                  filterBy === 'profitable'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Green ({profitableMonths})
              </button>
              <button
                onClick={() => { setFilterBy('losing'); setPage(0); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBy === 'losing'
                    ? 'bg-red-500 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Red ({losingMonths})
              </button>
            </div>

            {/* Sort */}
            <div className="flex gap-1">
              <button
                onClick={() => toggleSort('date')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sortBy === 'date'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                <ArrowUpDown className="h-3 w-3" />
                Date
              </button>
              <button
                onClick={() => toggleSort('pnl')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sortBy === 'pnl'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                <ArrowUpDown className="h-3 w-3" />
                P&L
              </button>
              <button
                onClick={() => toggleSort('winrate')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sortBy === 'winrate'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
              >
                <ArrowUpDown className="h-3 w-3" />
                Win%
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Month Cards - with swipe support on mobile */}
      <div
        className="space-y-2 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {visibleData.map((month) => (
          <button
            key={month.month}
            onClick={() => setSelectedMonth(month)}
            className={`w-full p-4 rounded-xl transition-colors text-left cursor-pointer ${
              month.totalPnL > 0
                ? 'bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                : month.totalPnL < 0
                  ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                  : 'bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  month.totalPnL > 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : month.totalPnL < 0
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-zinc-200 dark:bg-zinc-700'
                }`}>
                  {month.totalPnL >= 0 ? (
                    <TrendingUp className={`h-4 w-4 ${month.totalPnL > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`} />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                    <span className="sm:hidden">{formatMonth(month.month)}</span>
                    <span className="hidden sm:inline">{formatMonthFull(month.month)}</span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {month.tradeCount} trade{month.tradeCount !== 1 ? 's' : ''} ·{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">{month.wins}W</span>
                    {' / '}
                    <span className="text-red-600 dark:text-red-400">{month.losses}L</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    month.totalPnL > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : month.totalPnL < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-zinc-500'
                  }`}>
                    <span className="sm:hidden">{formatSignedCurrency(month.totalPnL, true)}</span>
                    <span className="hidden sm:inline">{formatSignedCurrency(month.totalPnL)}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    {month.winRate.toFixed(0)}% win rate
                    {(month.avgTradeSizeStock > 0 || month.avgTradeSizeOption > 0) && (
                      <span className="hidden sm:inline">
                        {month.avgTradeSizeStock > 0 && ` · S $${month.avgTradeSizeStock.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        {month.avgTradeSizeOption > 0 && ` · O $${month.avgTradeSizeOption.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 hidden sm:block" />
              </div>
            </div>
          </button>
        ))}

        {/* Pagination */}
        {hasMore && (
          <>
            {/* Mobile: Swipe dots indicator */}
            <div className="sm:hidden flex items-center justify-center gap-1.5 pt-3">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === page
                      ? 'w-4 bg-amber-500'
                      : 'w-2 bg-zinc-300 dark:bg-zinc-600'
                  }`}
                  aria-label={`Go to page ${i + 1}`}
                />
              ))}
            </div>
            <p className="sm:hidden text-center text-xs text-zinc-400 mt-1">
              Swipe to navigate
            </p>

            {/* Desktop: Button pagination */}
            <div className="hidden sm:flex items-center justify-between pt-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  page === 0
                    ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                    : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                }`}
              >
                <ChevronUp className="h-4 w-4 -rotate-90" />
                Newer
              </button>
              <span className="text-xs text-zinc-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  page >= totalPages - 1
                    ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                    : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                }`}
              >
                Older
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          </>
        )}

        {/* Empty filtered state */}
        {processedData.length === 0 && (
          <div className="flex items-center justify-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <div className="text-center">
              <p className="text-zinc-400 dark:text-zinc-500">
                No months match your filter
              </p>
              <button
                onClick={() => setFilterBy('all')}
                className="text-xs text-amber-600 dark:text-amber-400 mt-2 hover:underline"
              >
                Show all months
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Month Detail Modal */}
      {selectedMonth && (
        <MonthDetailModal
          month={selectedMonth}
          onClose={() => setSelectedMonth(null)}
        />
      )}
    </div>
  );
}
