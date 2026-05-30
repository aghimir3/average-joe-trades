'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Ticker Performance Component
 *
 * Displays top performers and needs improvement sections with timeframe filtering.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Calendar, BarChart3 } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatSignedCurrency } from '@/lib/utils';

type Timeframe = 'all' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'ytd' | 'last12m' | 'lastyear';

interface TickerPerformanceData {
  symbol: string;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
}

interface PerformanceApiResponse {
  topPerformers: TickerPerformanceData[];
  needsImprovement: TickerPerformanceData[];
}

const TIMEFRAME_CONFIG: Array<{
  id: Timeframe;
  label: string;
  shortLabel: string;
}> = [
  { id: 'all', label: 'All Time', shortLabel: 'All' },
  { id: 'daily', label: 'Today', shortLabel: 'Day' },
  { id: 'weekly', label: 'This Week', shortLabel: 'Week' },
  { id: 'monthly', label: 'This Month', shortLabel: 'Month' },
  { id: 'quarterly', label: 'This Quarter', shortLabel: 'Qtr' },
  { id: 'ytd', label: 'Year to Date', shortLabel: 'YTD' },
  { id: 'last12m', label: 'Last 12 Months', shortLabel: '12M' },
  { id: 'lastyear', label: 'Last Year', shortLabel: 'LY' },
];

function getPeriodDates(timeframe: Timeframe): { startDate?: string; endDate?: string } {
  if (timeframe === 'all') {
    return {};
  }

  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarterly': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterMonth, 1);
      break;
    }
    case 'ytd':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last12m':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'lastyear':
      // Previous calendar year (Jan 1 to Dec 31)
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      return {
        startDate: startDate.toISOString(),
        endDate: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).toISOString(),
      };
    default:
      return {};
  }

  return {
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
  };
}

function getTimeframeLabel(timeframe: Timeframe): string {
  const now = new Date();

  switch (timeframe) {
    case 'all':
      return 'All Time';
    case 'daily':
      return now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    case 'weekly': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diff);
      return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    case 'monthly':
      return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    case 'quarterly':
      return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    case 'ytd':
      return `${now.getFullYear()} Year to Date`;
    case 'last12m':
      return 'Last 12 Months';
    case 'lastyear':
      return `${now.getFullYear() - 1}`;
    default:
      return '';
  }
}

async function fetchTickerPerformance(
  accountId: string | null,
  timeframe: Timeframe
): Promise<PerformanceApiResponse> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);

  const { startDate, endDate } = getPeriodDates(timeframe);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const url = `/api/dashboard/performance${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch ticker performance');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}


interface TickerPerformanceProps {
  accountId?: string | null;
}

export function TickerPerformance({ accountId }: TickerPerformanceProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickerPerformance', accountId, selectedTimeframe],
    queryFn: () => fetchTickerPerformance(accountId ?? null, selectedTimeframe),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Unable to load ticker performance</p>
      </div>
    );
  }

  const { topPerformers, needsImprovement } = data;
  const periodLabel = getTimeframeLabel(selectedTimeframe);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Ticker Performance
          </h3>
          <HelpTooltip
            title="Ticker Performance"
            description="See which tickers are making you the most money and which ones need attention. Filter by time period to analyze your recent performance."
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {periodLabel}
        </p>
      </div>

      {/* Timeframe Selector */}
      <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {TIMEFRAME_CONFIG.map(({ id, label, shortLabel }) => (
            <button
              key={id}
              onClick={() => setSelectedTimeframe(id)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selectedTimeframe === id
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700/50'
              )}
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Performers */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-rh-green" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Top Performers
              </h2>
            </div>

            {topPerformers.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No profitable trades in this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topPerformers.map((ticker, index) => (
                  <div
                    key={ticker.symbol}
                    className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rh-green text-white text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {ticker.symbol}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {ticker.tradeCount} trade{ticker.tradeCount !== 1 ? 's' : ''} · {ticker.winRate}% win
                        </p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-rh-green">
                      {formatSignedCurrency(ticker.totalPnL)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Needs Improvement */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="h-5 w-5 text-rh-red" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Needs Improvement
              </h2>
            </div>

            {needsImprovement.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No losing trades in this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsImprovement.map((ticker, index) => (
                  <div
                    key={ticker.symbol}
                    className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rh-red text-white text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {ticker.symbol}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {ticker.tradeCount} trade{ticker.tradeCount !== 1 ? 's' : ''} · {ticker.winRate}% win
                        </p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-rh-red">
                      {formatSignedCurrency(ticker.totalPnL)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {(topPerformers.length > 0 || needsImprovement.length > 0) && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rh-green" />
                <span>{topPerformers.length} profitable ticker{topPerformers.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rh-red" />
                <span>{needsImprovement.length} losing ticker{needsImprovement.length !== 1 ? 's' : ''}</span>
              </div>
              {topPerformers.length > 0 && (
                <div className="ml-auto">
                  Total from top 5: <span className="font-semibold text-rh-green">
                    {formatSignedCurrency(topPerformers.reduce((sum, t) => sum + t.totalPnL, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
