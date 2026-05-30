'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Time Analytics Dashboard Component
 *
 * Displays time-based trading insights:
 * - Average hold time on winners vs losers
 * - P&L by hour of entry/exit (if time data available)
 * - Hold time distribution visualization
 *
 * Features:
 * - Flippable x/y axes on charts
 * - Mobile-first responsive design
 * - Dark mode support
 */

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
  type ChartOptions,
} from 'chart.js';
import {
  Clock,
  Timer,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Calendar,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Info,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatSignedCurrency } from '@/lib/utils';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface HourlyStats {
  hour: number;
  label: string;
  entryCount: number;
  exitCount: number;
  entryPnL: number;
  exitPnL: number;
  avgEntryPnL: number;
  avgExitPnL: number;
}

interface HoldTimeDistribution {
  range: string;
  winCount: number;
  lossCount: number;
  totalPnL: number;
}

interface HoldTimeStats {
  avgHoldDaysWinners: number;
  avgHoldDaysLosers: number;
  avgHoldDaysAll: number;
  medianHoldDaysWinners: number;
  medianHoldDaysLosers: number;
  holdTimeDistribution: HoldTimeDistribution[];
}

interface TimeAnalyticsData {
  hourlyStats: HourlyStats[];
  holdTimeStats: HoldTimeStats;
  meta: {
    totalTrades: number;
    tradesWithTime: number;
    tradesWithEntryTime: number;
    tradesWithExitTime: number;
    percentWithTime: number;
  };
}

interface TimeAnalyticsProps {
  accountId: string | null;
}

async function fetchTimeAnalytics(accountId: string | null): Promise<TimeAnalyticsData> {
  const url = accountId
    ? `/api/dashboard/time-analytics?brokerageAccountId=${accountId}`
    : '/api/dashboard/time-analytics';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch time analytics');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

// Use formatSignedCurrency(value, true) directly for P&L displays

function formatDays(days: number): string {
  if (days === 0) return '0d';
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}m`;
}

// Get icon for time of day (based on local hour)
function getTimeOfDayIcon(hour: number) {
  if (hour >= 6 && hour < 12) return Sunrise;
  if (hour >= 12 && hour < 17) return Sun;
  if (hour >= 17 && hour < 21) return Sunset;
  return Moon;
}

/**
 * Convert UTC hour to local hour based on browser timezone.
 * The database stores times in UTC, so we need to convert to display in local time.
 */
function utcHourToLocalHour(utcHour: number): number {
  // Create a date object for today at the specified UTC hour
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0, 0));
  // Get the local hour from this date
  return utcDate.getHours();
}

/**
 * Format hour as local time label (e.g., "9 AM", "2 PM")
 */
function formatLocalHourLabel(utcHour: number): string {
  const localHour = utcHourToLocalHour(utcHour);
  if (localHour === 0) return '12 AM';
  if (localHour === 12) return '12 PM';
  return localHour < 12 ? `${localHour} AM` : `${localHour - 12} PM`;
}

type ChartView = 'entry' | 'exit';
type ChartOrientation = 'horizontal' | 'vertical';
type HoldChartMode = 'count' | 'pnl';

export function TimeAnalytics({ accountId }: TimeAnalyticsProps) {
  const [chartView, setChartView] = useState<ChartView>('entry');
  const [chartOrientation, setChartOrientation] = useState<ChartOrientation>('vertical');
  const [holdChartOrientation, setHoldChartOrientation] = useState<ChartOrientation>('vertical');
  const [holdChartMode, setHoldChartMode] = useState<HoldChartMode>('count');

  const { data, isLoading, error } = useQuery({
    queryKey: ['timeAnalytics', accountId],
    queryFn: () => fetchTimeAnalytics(accountId),
  });

  // Filter hourly stats to only show hours with data
  // React Compiler handles memoization automatically
  const filteredHourlyStats = data?.hourlyStats
    ? data.hourlyStats.filter(h => {
        if (chartView === 'entry') return h.entryCount > 0;
        return h.exitCount > 0;
      })
    : [];

  // Determine if we have enough time data to show hourly charts
  const hasTimeData = data?.meta && data.meta.percentWithTime >= 10;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Time Analytics
          </h2>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
        <p className="font-medium">Error loading time analytics</p>
        <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  if (!data || data.meta.totalTrades === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Time Analytics
          </h2>
          <HelpTooltip
            title="Time Analytics"
            description="Analyze your trading performance by time of day and hold duration. See which hours are most profitable and whether winners or losers are held longer."
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

  const { holdTimeStats, meta } = data;

  // Hourly P&L Chart Data - convert UTC hours to local timezone labels
  const hourlyChartData = {
    labels: filteredHourlyStats.map(h => formatLocalHourLabel(h.hour)),
    datasets: [
      {
        label: chartView === 'entry' ? 'Entry P&L' : 'Exit P&L',
        data: filteredHourlyStats.map(h =>
          chartView === 'entry' ? h.avgEntryPnL : h.avgExitPnL
        ),
        backgroundColor: filteredHourlyStats.map(h => {
          const pnl = chartView === 'entry' ? h.avgEntryPnL : h.avgExitPnL;
          return pnl >= 0
            ? 'rgba(34, 197, 94, 0.8)'
            : 'rgba(239, 68, 68, 0.8)';
        }),
        borderRadius: 4,
      },
    ],
  };

  const hourlyChartOptions: ChartOptions<'bar'> = {
    indexAxis: chartOrientation === 'horizontal' ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const idx = items[0].dataIndex;
            const hourData = filteredHourlyStats[idx];
            // Use local time label instead of UTC label
            return hourData ? formatLocalHourLabel(hourData.hour) : '';
          },
          label: (context) => {
            const idx = context.dataIndex;
            const hourData = filteredHourlyStats[idx];
            if (!hourData) return '';
            const count = chartView === 'entry' ? hourData.entryCount : hourData.exitCount;
            const totalPnL = chartView === 'entry' ? hourData.entryPnL : hourData.exitPnL;
            const avgPnL = chartView === 'entry' ? hourData.avgEntryPnL : hourData.avgExitPnL;
            return [
              `Trades: ${count}`,
              `Total P&L: ${formatSignedCurrency(totalPnL)}`,
              `Avg P&L: ${formatSignedCurrency(avgPnL)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 11 },
          color: '#71717a',
          maxRotation: chartOrientation === 'vertical' ? 45 : 0,
        },
      },
      y: {
        grid: { color: 'rgba(63, 63, 70, 0.3)' },
        ticks: {
          font: { size: 11 },
          color: '#71717a',
          callback: (value) => formatSignedCurrency(Number(value)),
        },
      },
    },
  };

  // Calculate win rates and P&L stats for each hold time range
  const holdDistEnhanced = holdTimeStats.holdTimeDistribution.map(d => {
    const total = d.winCount + d.lossCount;
    const winRate = total > 0 ? (d.winCount / total) * 100 : 0;
    const avgPnL = total > 0 ? d.totalPnL / total : 0;
    return { ...d, total, winRate, avgPnL };
  });

  // Hold Time Distribution Chart Data - Count mode
  const holdDistChartDataCount = {
    labels: holdDistEnhanced.map(d => d.range),
    datasets: [
      {
        label: 'Winners',
        data: holdDistEnhanced.map(d => d.winCount),
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Losers',
        data: holdDistEnhanced.map(d => d.lossCount),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  // Hold Time Distribution Chart Data - P&L mode (single bar per range)
  const holdDistChartDataPnL = {
    labels: holdDistEnhanced.map(d => d.range),
    datasets: [
      {
        label: 'Net P&L',
        data: holdDistEnhanced.map(d => d.totalPnL),
        backgroundColor: holdDistEnhanced.map(d =>
          d.totalPnL >= 0
            ? 'rgba(34, 197, 94, 0.8)'
            : 'rgba(239, 68, 68, 0.8)'
        ),
        borderRadius: 4,
      },
    ],
  };

  const holdDistChartData = holdChartMode === 'count' ? holdDistChartDataCount : holdDistChartDataPnL;

  const holdDistChartOptions: ChartOptions<'bar'> = {
    indexAxis: holdChartOrientation === 'horizontal' ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: holdChartMode === 'count',
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          padding: 16,
          font: { size: 11 },
          color: '#71717a',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const idx = items[0].dataIndex;
            const dist = holdDistEnhanced[idx];
            return dist ? `Hold: ${dist.range}` : '';
          },
          label: (context) => {
            const idx = context.dataIndex;
            const dist = holdDistEnhanced[idx];
            if (!dist) return '';

            if (holdChartMode === 'pnl') {
              return `Net P&L: ${formatSignedCurrency(dist.totalPnL)}`;
            }

            // Count mode - show the dataset value
            const value = context.raw as number;
            return `${context.dataset.label}: ${value}`;
          },
          afterBody: (items) => {
            if (!items.length) return [];
            const idx = items[0].dataIndex;
            const dist = holdDistEnhanced[idx];
            if (!dist) return [];

            const lines: string[] = [];
            lines.push('');
            lines.push(`Total trades: ${dist.total}`);
            lines.push(`Win rate: ${dist.winRate.toFixed(0)}%`);
            if (holdChartMode === 'count') {
              lines.push(`Net P&L: ${formatSignedCurrency(dist.totalPnL)}`);
            }
            lines.push(`Avg P&L/trade: ${formatSignedCurrency(dist.avgPnL)}`);
            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: holdChartMode === 'count',
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          color: '#71717a',
          maxRotation: holdChartOrientation === 'vertical' ? 45 : 0,
          ...(holdChartMode === 'pnl' && holdChartOrientation === 'horizontal'
            ? { callback: (value) => formatSignedCurrency(Number(value)) }
            : {}),
        },
      },
      y: {
        stacked: holdChartMode === 'count',
        grid: { color: 'rgba(63, 63, 70, 0.3)' },
        ticks: {
          font: { size: 11 },
          color: '#71717a',
          ...(holdChartMode === 'pnl' && holdChartOrientation === 'vertical'
            ? { callback: (value) => formatSignedCurrency(Number(value)) }
            : {}),
        },
      },
    },
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Time Analytics
          </h2>
          <p className="text-xs text-zinc-500">
            {meta.totalTrades} trades analyzed
          </p>
        </div>
        <HelpTooltip
          title="Time Analytics"
          description="Analyze your trading performance by time of day and hold duration. See which hours are most profitable and whether winners or losers are held longer."
        />
      </div>

      {/* Hold Time Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {/* Avg Hold - Winners */}
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-emerald-700 dark:text-emerald-300">Winners</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {holdTimeStats.avgHoldDaysWinners.toFixed(1)}d
          </p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
            avg hold
          </p>
        </div>

        {/* Avg Hold - Losers */}
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            <span className="text-xs text-red-700 dark:text-red-300">Losers</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">
            {holdTimeStats.avgHoldDaysLosers.toFixed(1)}d
          </p>
          <p className="text-xs text-red-600/70 dark:text-red-400/70">
            avg hold
          </p>
        </div>

        {/* Median Hold - Winners */}
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Median Win</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatDays(holdTimeStats.medianHoldDaysWinners)}
          </p>
          <p className="text-xs text-zinc-500">
            median hold
          </p>
        </div>

        {/* Median Hold - Losers */}
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Median Loss</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatDays(holdTimeStats.medianHoldDaysLosers)}
          </p>
          <p className="text-xs text-zinc-500">
            median hold
          </p>
        </div>
      </div>

      {/* Hold Time Insight */}
      {holdTimeStats.avgHoldDaysWinners !== holdTimeStats.avgHoldDaysLosers && (
        <div className={cn(
          "p-3 rounded-xl mb-4 text-sm",
          holdTimeStats.avgHoldDaysWinners > holdTimeStats.avgHoldDaysLosers
            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
        )}>
          <span className="font-medium">
            {holdTimeStats.avgHoldDaysWinners > holdTimeStats.avgHoldDaysLosers
              ? "You hold winners longer than losers"
              : "You hold losers longer than winners"}
          </span>
          <span className="text-xs ml-1 opacity-75">
            ({Math.abs(holdTimeStats.avgHoldDaysWinners - holdTimeStats.avgHoldDaysLosers).toFixed(1)} day difference)
          </span>
        </div>
      )}

      {/* Two-Column Layout for Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Hold Time Distribution */}
        {holdTimeStats.holdTimeDistribution.length > 0 && (
          <div className="lg:border-r lg:border-zinc-100 lg:dark:border-zinc-800 lg:pr-6 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Hold Time Distribution
              </h3>
              <div className="flex items-center gap-2">
                {/* Count/P&L Toggle */}
                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <button
                    onClick={() => setHoldChartMode('count')}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium transition-colors",
                      holdChartMode === 'count'
                        ? "bg-blue-500 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    )}
                  >
                    Count
                  </button>
                  <button
                    onClick={() => setHoldChartMode('pnl')}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium transition-colors border-l border-zinc-200 dark:border-zinc-700",
                      holdChartMode === 'pnl'
                        ? "bg-blue-500 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    )}
                  >
                    P&L
                  </button>
                </div>
                {/* Flip Axes */}
                <button
                  onClick={() => setHoldChartOrientation(prev =>
                    prev === 'vertical' ? 'horizontal' : 'vertical'
                  )}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Flip chart axes"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="h-52">
              <Bar data={holdDistChartData} options={holdDistChartOptions} />
            </div>

            {/* Sweet Spot Insight */}
            {(() => {
              const rangesWithTrades = holdDistEnhanced.filter(d => d.total >= 3);
              if (rangesWithTrades.length < 2) return null;

              // Find best range by P&L and by win rate
              const bestByPnL = [...rangesWithTrades].sort((a, b) => b.totalPnL - a.totalPnL)[0];
              const bestByWinRate = [...rangesWithTrades].sort((a, b) => b.winRate - a.winRate)[0];
              const worstByPnL = [...rangesWithTrades].sort((a, b) => a.totalPnL - b.totalPnL)[0];

              // Only show if there's meaningful data
              if (bestByPnL.totalPnL <= 0 && bestByWinRate.winRate < 50) return null;

              const hasWorst = worstByPnL.totalPnL < 0;

              return (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {/* Best Hold Time */}
                  <div className="p-2.5 rounded-xl bg-linear-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        Best Hold
                      </span>
                    </div>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {bestByPnL.range}
                    </p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                      {formatSignedCurrency(bestByPnL.totalPnL)} · {bestByPnL.winRate.toFixed(0)}% win
                    </p>
                  </div>

                  {/* Worst / Caution OR Best Win Rate */}
                  {hasWorst ? (
                    <div className="p-2.5 rounded-xl bg-linear-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-100 dark:border-red-800/30">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span className="text-[10px] font-medium text-red-700 dark:text-red-300">
                          Weakest Hold
                        </span>
                      </div>
                      <p className="text-base font-bold text-red-600 dark:text-red-400">
                        {worstByPnL.range}
                      </p>
                      <p className="text-[10px] text-red-600/80 dark:text-red-400/80">
                        {formatSignedCurrency(worstByPnL.totalPnL)} · {worstByPnL.winRate.toFixed(0)}% win
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Timer className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                          Best Win Rate
                        </span>
                      </div>
                      <p className="text-base font-bold text-blue-600 dark:text-blue-400">
                        {bestByWinRate.range}
                      </p>
                      <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80">
                        {bestByWinRate.winRate.toFixed(0)}% win · {bestByWinRate.total} trades
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Right Column: Hourly P&L Section */}
        <div className="flex flex-col">
          {hasTimeData ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  P&L by Hour
                  <span className="text-[10px] text-zinc-400 font-normal">
                    ({meta.percentWithTime}% time data)
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  {/* Entry/Exit Toggle */}
                  <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                      onClick={() => setChartView('entry')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        chartView === 'entry'
                          ? "bg-blue-500 text-white"
                          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      )}
                    >
                      Entry
                    </button>
                    <button
                      onClick={() => setChartView('exit')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors border-l border-zinc-200 dark:border-zinc-700",
                        chartView === 'exit'
                          ? "bg-blue-500 text-white"
                          : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      )}
                    >
                      Exit
                    </button>
                  </div>
                  {/* Flip Axes */}
                  <button
                    onClick={() => setChartOrientation(prev =>
                      prev === 'vertical' ? 'horizontal' : 'vertical'
                    )}
                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Flip chart axes"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {filteredHourlyStats.length > 0 ? (
                <div className="h-52">
                  <Bar data={hourlyChartData} options={hourlyChartOptions} />
                </div>
              ) : (
                <div className="h-52 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    No {chartView === 'entry' ? 'entry' : 'exit'} time data available
                  </p>
                </div>
              )}

              {/* Best/Worst Hours */}
              {filteredHourlyStats.length >= 3 && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {/* Best Hour */}
                  {(() => {
                    const stats = [...filteredHourlyStats].sort((a, b) => {
                      const aPnL = chartView === 'entry' ? a.avgEntryPnL : a.avgExitPnL;
                      const bPnL = chartView === 'entry' ? b.avgEntryPnL : b.avgExitPnL;
                      return bPnL - aPnL;
                    });
                    const best = stats[0];
                    const worst = stats[stats.length - 1];
                    const bestPnL = chartView === 'entry' ? best.avgEntryPnL : best.avgExitPnL;
                    const worstPnL = chartView === 'entry' ? worst.avgEntryPnL : worst.avgExitPnL;
                    // Use local hour for time of day icon
                    const BestIcon = getTimeOfDayIcon(utcHourToLocalHour(best.hour));
                    const WorstIcon = getTimeOfDayIcon(utcHourToLocalHour(worst.hour));

                    return (
                      <>
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <BestIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              Best {chartView === 'entry' ? 'Entry' : 'Exit'}
                            </span>
                          </div>
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                            {formatLocalHourLabel(best.hour)}
                          </p>
                          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                            {formatSignedCurrency(bestPnL)} avg
                          </p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <WorstIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                            <span className="text-[10px] font-medium text-red-700 dark:text-red-300">
                              Worst {chartView === 'entry' ? 'Entry' : 'Exit'}
                            </span>
                          </div>
                          <p className="text-base font-bold text-red-600 dark:text-red-400">
                            {formatLocalHourLabel(worst.hour)}
                          </p>
                          <p className="text-[10px] text-red-600/70 dark:text-red-400/70">
                            {formatSignedCurrency(worstPnL)} avg
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 h-full flex items-center">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-zinc-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Limited Time Data
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Only {meta.percentWithTime}% of your trades have entry/exit time data.
                    Hourly P&L analysis requires more time data from your brokerage.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
