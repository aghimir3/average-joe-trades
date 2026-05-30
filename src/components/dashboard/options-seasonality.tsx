/**
 * Options Seasonality & Timing Component
 *
 * Analyzes trading patterns by day of week and month/quarter.
 * Part of the Options Analytics section.
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  Sun,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Sparkles,
  RefreshCcw,
} from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatCurrency, formatCompactCurrency, chartTooltipStyle } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DayStats {
  day: string;
  dayNum: number;
  entryCount: number;
  exitCount: number;
  entryPnL: number;
  exitPnL: number;
  entryWinRate: number;
  exitWinRate: number;
}

interface MonthStats {
  month: string;
  monthNum: number;
  tradeCount: number;
  totalPnL: number;
  winRate: number;
  avgPnL: number;
}

interface QuarterStats {
  quarter: string;
  quarterNum: number;
  tradeCount: number;
  totalPnL: number;
  winRate: number;
}

interface SeasonalityData {
  summary: {
    totalTrades: number;
    totalPnL: number;
    winRate: number;
  };
  dayOfWeek: {
    byDay: DayStats[];
    bestEntryDay: { day: string; winRate: number; count: number } | null;
    bestExitDay: { day: string; winRate: number; count: number } | null;
  };
  seasonality: {
    byMonth: MonthStats[];
    bestMonth: { month: string; pnl: number; winRate: number } | null;
    worstMonth: { month: string; pnl: number; winRate: number } | null;
    byQuarter: QuarterStats[];
  };
}

interface OptionsSeasonalityProps {
  accountId: string | null;
}

const COLORS = {
  emerald: '#10b981',
  red: '#ef4444',
};

const QUARTER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

// ============================================================================
// Sub-Components
// ============================================================================

function InsightCard({
  insight,
  type = 'info',
}: {
  insight: string;
  type?: 'success' | 'warning' | 'info';
}) {
  const styles = {
    success: 'from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800/30',
    warning: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/30',
    info: 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800/30',
  };

  const iconColors = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  const textColors = {
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-blue-700 dark:text-blue-300',
  };

  return (
    <div className={cn('p-4 rounded-xl bg-linear-to-br border', styles[type])}>
      <div className="flex items-start gap-3">
        <Sparkles className={cn('h-5 w-5 mt-0.5 shrink-0', iconColors[type])} />
        <p className={cn('text-sm font-medium', textColors[type])}>{insight}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Day of Week
// ============================================================================

function DayOfWeekTab({ data }: { data: SeasonalityData }) {
  const [viewMode, setViewMode] = useState<'entry' | 'exit'>('entry');

  if (data.dayOfWeek.byDay.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sun className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No day of week data available</p>
      </div>
    );
  }

  const chartData = data.dayOfWeek.byDay.map(d => ({
    ...d,
    count: viewMode === 'entry' ? d.entryCount : d.exitCount,
    winRate: viewMode === 'entry' ? d.entryWinRate : d.exitWinRate,
    pnl: viewMode === 'entry' ? d.entryPnL : d.exitPnL,
  }));

  const bestDay = viewMode === 'entry' ? data.dayOfWeek.bestEntryDay : data.dayOfWeek.bestExitDay;

  return (
    <div className="space-y-6">
      {/* Best Day Insight */}
      {bestDay && (
        <InsightCard
          insight={`Best day to ${viewMode === 'entry' ? 'open' : 'close'} trades: ${bestDay.day} with ${bestDay.winRate}% win rate (${bestDay.count} trades)`}
          type="success"
        />
      )}

      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('entry')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'entry'
              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          )}
        >
          <TrendingUp className="h-4 w-4 inline mr-2" />
          Entry Days
        </button>
        <button
          onClick={() => setViewMode('exit')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'exit'
              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          )}
        >
          <TrendingDown className="h-4 w-4 inline mr-2" />
          Exit Days
        </button>
      </div>

      {/* Day Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {chartData.filter(d => d.count > 0).map((day) => (
          <div
            key={day.day}
            className={cn(
              'p-4 rounded-xl border transition-all',
              day.winRate >= 60
                ? 'border-emerald-200 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-900/10'
                : day.winRate >= 50
                ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                : 'border-red-200 dark:border-red-800/30 bg-red-50/30 dark:bg-red-900/10'
            )}
          >
            <p className="text-xs text-zinc-500 mb-1">{day.day}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{day.count}</p>
            <p className="text-xs text-zinc-500">trades</p>

            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Win</span>
                <span className={cn(
                  'text-sm font-semibold',
                  day.winRate >= 50 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {day.winRate}%
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-zinc-500">P&L</span>
                <span className={cn(
                  'text-xs font-medium',
                  day.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {formatCompactCurrency(day.pnl)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Win Rate Chart */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
          {viewMode === 'entry' ? 'Entry' : 'Exit'} Win Rate by Day
        </h3>
        <div className="h-52 sm:h-48">
          <Bar
            data={{
              labels: chartData.filter(d => d.count > 0).map(d => d.day.slice(0, 3)),
              datasets: [{
                data: chartData.filter(d => d.count > 0).map(d => d.winRate),
                backgroundColor: chartData.filter(d => d.count > 0).map(d =>
                  d.winRate >= 50 ? COLORS.emerald : COLORS.red
                ),
                borderRadius: 4,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...chartTooltipStyle,
                  callbacks: {
                    title: (items) => items[0]?.label || '',
                    label: (ctx) => `Win Rate: ${ctx.raw}%`,
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { font: { size: 9 } },
                },
                y: {
                  min: 0,
                  max: 100,
                  grid: { color: 'rgba(161, 161, 170, 0.2)' },
                  ticks: {
                    font: { size: 10 },
                    callback: (v) => `${v}%`,
                  },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Seasonality
// ============================================================================

function SeasonalityTab({ data }: { data: SeasonalityData }) {
  if (data.seasonality.byMonth.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarDays className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No seasonality data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Best/Worst Month Insight */}
      {(data.seasonality.bestMonth || data.seasonality.worstMonth) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.seasonality.bestMonth && (
            <div className="p-4 rounded-xl bg-linear-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200 dark:border-emerald-800/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">Best Month</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{data.seasonality.bestMonth.month}</p>
              <p className="text-sm text-emerald-600/80">
                {formatCurrency(data.seasonality.bestMonth.pnl)} · {data.seasonality.bestMonth.winRate}% win rate
              </p>
            </div>
          )}

          {data.seasonality.worstMonth && (
            <div className="p-4 rounded-xl bg-linear-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <span className="font-semibold text-red-700 dark:text-red-300">Worst Month</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{data.seasonality.worstMonth.month}</p>
              <p className="text-sm text-red-600/80">
                {formatCurrency(data.seasonality.worstMonth.pnl)} · {data.seasonality.worstMonth.winRate}% win rate
              </p>
            </div>
          )}
        </div>
      )}

      {/* Monthly P&L Chart */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
          Monthly Performance
        </h3>
        <div className="h-72 sm:h-64">
          <Bar
            data={{
              labels: data.seasonality.byMonth.map(m => m.month.slice(0, 3)),
              datasets: [{
                data: data.seasonality.byMonth.map(m => m.totalPnL),
                backgroundColor: data.seasonality.byMonth.map(m =>
                  m.totalPnL >= 0 ? COLORS.emerald : COLORS.red
                ),
                borderRadius: 4,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...chartTooltipStyle,
                  callbacks: {
                    title: (items) => items[0]?.label || '',
                    label: (ctx) => {
                      const idx = ctx.dataIndex;
                      const month = data.seasonality.byMonth[idx];
                      return [
                        `P&L: ${formatCurrency(month.totalPnL)}`,
                        `Win Rate: ${month.winRate}%`,
                      ];
                    },
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { font: { size: 9 } },
                },
                y: {
                  grid: { color: 'rgba(161, 161, 170, 0.2)' },
                  ticks: {
                    font: { size: 10 },
                    callback: (v) => formatCompactCurrency(v as number),
                  },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Quarterly Breakdown */}
      {data.seasonality.byQuarter.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
            Quarterly Performance
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.seasonality.byQuarter.map((q, idx) => (
              <div
                key={q.quarter}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700"
                style={{ borderLeftColor: QUARTER_COLORS[idx], borderLeftWidth: '4px' }}
              >
                <p className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">{q.quarter}</p>
                <p className={cn(
                  'text-xl font-bold',
                  q.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {formatCompactCurrency(q.totalPnL)}
                </p>
                <div className="mt-2 text-xs text-zinc-500">
                  <span>{q.tradeCount} trades</span>
                  <span className="mx-1">·</span>
                  <span>{q.winRate}% win</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Table */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
          Monthly Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="text-left py-2 px-2 font-medium text-zinc-500">Month</th>
                <th className="text-right py-2 px-2 font-medium text-zinc-500">Trades</th>
                <th className="text-right py-2 px-2 font-medium text-zinc-500">P&L</th>
                <th className="text-right py-2 px-2 font-medium text-zinc-500">Win %</th>
                <th className="text-right py-2 px-2 font-medium text-zinc-500">Avg P&L</th>
              </tr>
            </thead>
            <tbody>
              {data.seasonality.byMonth.map(m => (
                <tr key={m.month} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <td className="py-2 px-2 font-medium text-zinc-900 dark:text-zinc-100">{m.month}</td>
                  <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">{m.tradeCount}</td>
                  <td className={cn(
                    'py-2 px-2 text-right font-medium',
                    m.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-500'
                  )}>
                    {formatCurrency(m.totalPnL)}
                  </td>
                  <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">{m.winRate}%</td>
                  <td className={cn(
                    'py-2 px-2 text-right',
                    m.avgPnL >= 0 ? 'text-emerald-600' : 'text-red-500'
                  )}>
                    {formatCurrency(m.avgPnL)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OptionsSeasonality({ accountId }: OptionsSeasonalityProps) {
  const [activeTab, setActiveTab] = useState<string>('dayofweek');
  const [timeframe, setTimeframe] = useState<string>('all');

  const { data, isLoading, error, refetch } = useQuery<SeasonalityData>({
    queryKey: ['options-seasonality', accountId, timeframe],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set('brokerageAccountId', accountId);
      if (timeframe !== 'all') params.set('timeframe', timeframe);

      const res = await fetch(`/api/dashboard/options-timing?${params}`);
      if (!res.ok) throw new Error('Failed to fetch seasonality data');
      return apiData<SeasonalityData>(await parseApiJson(res));
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-red-500 text-center">Failed to load seasonality data</p>
      </div>
    );
  }

  const analytics = data;

  if (analytics.summary.totalTrades === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-cyan-500 to-teal-600">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Seasonality & Timing</h2>
              <p className="text-xs text-zinc-500">Discover your best trading days and months</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
            <CalendarDays className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            No Options Trades Yet
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Start trading options to discover your best days and months.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-cyan-500 to-teal-600">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Seasonality & Timing</h2>
              <p className="text-xs text-zinc-500">
                {analytics.summary.totalTrades} trades · {analytics.summary.winRate}% win rate
              </p>
            </div>
            <HelpTooltip
              title="Seasonality & Timing"
              description="Analyze your trading patterns by day of week and monthly/quarterly performance."
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            >
              <option value="all">All Time</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="90d">90 Days</option>
              <option value="ytd">YTD</option>
              <option value="1y">1 Year</option>
            </select>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-11 w-full justify-start gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 min-w-max rounded-lg">
            <TabsTrigger
              value="dayofweek"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <Sun className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span>Day of Week</span>
            </TabsTrigger>
            <TabsTrigger
              value="seasonality"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <CalendarDays className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span>Monthly</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-4 sm:p-6">
          <TabsContent value="dayofweek" className="m-0">
            <DayOfWeekTab data={analytics} />
          </TabsContent>
          <TabsContent value="seasonality" className="m-0">
            <SeasonalityTab data={analytics} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
