'use client';

/**
 * P&L Over Time Chart Component
 *
 * Dark-themed chart with time period filters.
 * Features orange line, dot markers, and gradient fill with zero line.
 */

import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type ScriptableContext,
} from 'chart.js';
import { TrendingUp, TrendingDown, Sparkles, Rocket, Target, Zap, Trophy, AlertTriangle } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatSignedCurrency } from '@/lib/utils';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartDataPoint {
  date: string;
  realizedPnL: number;
  cumulativePnL: number;
  tradeCount: number;
  winCount: number;
  dailyWinRate: number;
}

interface PnLChartProps {
  data: ChartDataPoint[];
}

type TimePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: 'YTD', label: 'YTD' },
  { key: 'ALL', label: 'ALL' },
];

/**
 * Get date range for a time period
 */
function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case '1D':
      // Today only
      break;
    case '1W':
      start.setDate(start.getDate() - 7);
      break;
    case '1M':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3M':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6M':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1Y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'YTD':
      start.setMonth(0, 1);
      break;
    case 'ALL':
      start.setFullYear(2000, 0, 1);
      break;
  }

  return { start, end };
}

/**
 * Format date for display based on period
 */
function formatDateLabel(dateStr: string, period: TimePeriod): string {
  const date = new Date(dateStr);

  if (period === '1D') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (period === '1W') {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  if (period === '1M' || period === '3M') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}


/**
 * Motivational messages for different states
 */
const MOTIVATIONAL_MESSAGES = {
  noTrades: [
    { icon: Rocket, title: "Ready for Takeoff", subtitle: "Your trading journey starts with one trade" },
    { icon: Target, title: "Set Your Sights", subtitle: "Every expert was once a beginner" },
    { icon: Sparkles, title: "Fresh Start", subtitle: "The market awaits your first move" },
  ],
  fewTrades: [
    { icon: Zap, title: "Building Momentum", subtitle: "Great traders are made one trade at a time" },
    { icon: TrendingUp, title: "Growing Strong", subtitle: "Keep tracking, keep improving" },
    { icon: Target, title: "On Track", subtitle: "Consistency is the key to success" },
  ],
  winning: [
    { icon: Sparkles, title: "On Fire!", subtitle: "Your strategy is working" },
    { icon: Rocket, title: "Crushing It", subtitle: "Keep up the great work" },
  ],
  losing: [
    { icon: Target, title: "Stay Focused", subtitle: "Every setback is a setup for a comeback" },
    { icon: Zap, title: "Keep Learning", subtitle: "Losses teach more than wins" },
  ],
};


export function PnLChart({ data }: PnLChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1M');

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const { start, end } = getDateRange(selectedPeriod);
    return data.filter(d => {
      const date = new Date(d.date);
      return date >= start && date <= end;
    });
  }, [data, selectedPeriod]);

  // Recalculate cumulative P&L for filtered period
  const chartData = useMemo(() => {
    return filteredData.reduce<Array<typeof filteredData[number] & { periodCumulativePnL: number }>>((acc, d) => {
      const prevCumulative = acc.length > 0 ? acc[acc.length - 1].periodCumulativePnL : 0;
      acc.push({ ...d, periodCumulativePnL: prevCumulative + d.realizedPnL });
      return acc;
    }, []);
  }, [filteredData]);

  // Determine if we have actual trading data
  const hasData = chartData.length > 0 && chartData.some(d => d.tradeCount > 0);
  const totalTrades = chartData.reduce((sum, d) => sum + d.tradeCount, 0);

  // Calculate period statistics
  const periodPnL = hasData ? chartData[chartData.length - 1]?.periodCumulativePnL || 0 : 0;

  // Find best and worst trading days (only days with trades)
  const tradingDays = chartData.filter(d => d.tradeCount > 0);
  const bestDay = tradingDays.length > 0
    ? tradingDays.reduce((best, d) => d.realizedPnL > best.realizedPnL ? d : best, tradingDays[0])
    : null;
  const worstDay = tradingDays.length > 0
    ? tradingDays.reduce((worst, d) => d.realizedPnL < worst.realizedPnL ? d : worst, tradingDays[0])
    : null;

  // Determine trend
  const isPositive = periodPnL >= 0;

  // Calculate period-specific advanced stats
  const periodWins = tradingDays.filter(d => d.realizedPnL > 0).length;
  const periodLosses = tradingDays.filter(d => d.realizedPnL < 0).length;
  const avgPnLPerTrade = totalTrades > 0 ? periodPnL / totalTrades : 0;

  // Calculate average win/loss for the period
  const winningDays = tradingDays.filter(d => d.realizedPnL > 0);
  const losingDays = tradingDays.filter(d => d.realizedPnL < 0);
  const avgWinDay = winningDays.length > 0
    ? winningDays.reduce((sum, d) => sum + d.realizedPnL, 0) / winningDays.length
    : 0;
  const avgLossDay = losingDays.length > 0
    ? losingDays.reduce((sum, d) => sum + d.realizedPnL, 0) / losingDays.length
    : 0;

  // Calculate expectancy: (win% * avgWin) - (loss% * |avgLoss|)
  const expectancy = tradingDays.length > 0
    ? ((periodWins / tradingDays.length) * avgWinDay) + ((periodLosses / tradingDays.length) * avgLossDay)
    : 0;

  // Calculate current streak (consecutive winning or losing days from most recent)
  const calculateStreak = () => {
    if (tradingDays.length === 0) return { type: 'none' as const, count: 0 };
    const sortedDays = [...tradingDays].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const firstDay = sortedDays[0];
    const streakType = firstDay.realizedPnL >= 0 ? 'win' as const : 'loss' as const;
    let count = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const isWin = sortedDays[i].realizedPnL >= 0;
      if ((streakType === 'win' && isWin) || (streakType === 'loss' && !isWin)) {
        count++;
      } else {
        break;
      }
    }
    return { type: streakType, count };
  };
  const currentStreak = calculateStreak();

  // Chart colors - orange/coral line like the reference
  const lineColor = '#ff6b35';

  // Get motivational message - stable across renders
  const motivation = useMemo(() => {
    const messages = !hasData || totalTrades === 0
      ? MOTIVATIONAL_MESSAGES.noTrades
      : totalTrades < 5
      ? MOTIVATIONAL_MESSAGES.fewTrades
      : periodPnL > 0
      ? MOTIVATIONAL_MESSAGES.winning
      : MOTIVATIONAL_MESSAGES.losing;
    // Use a stable index based on data length to avoid flickering
    return messages[data.length % messages.length];
  }, [hasData, totalTrades, periodPnL, data.length]);

  // Generate placeholder data for empty state (smooth wave)
  const placeholderLabels = useMemo(() => {
    const labels: string[] = [];
    const count = selectedPeriod === '1D' ? 24 : selectedPeriod === '1W' ? 7 : 30;
    for (let i = 0; i < count; i++) {
      labels.push(`${i}`);
    }
    return labels;
  }, [selectedPeriod]);

  const placeholderData = useMemo(() => {
    const count = placeholderLabels.length;
    return placeholderLabels.map((_, i) => {
      // Create a gentle wave pattern
      return Math.sin((i / count) * Math.PI * 2) * 100 + 500;
    });
  }, [placeholderLabels]);

  // Calculate min/max for determining zero line position
  const dataMin = hasData ? Math.min(...chartData.map(d => d.periodCumulativePnL)) : 0;
  const dataMax = hasData ? Math.max(...chartData.map(d => d.periodCumulativePnL)) : 0;
  const dataRange = dataMax - dataMin || 1;
  const zeroPosition = dataMax > 0 && dataMin < 0 ? dataMax / dataRange : dataMax >= 0 ? 1 : 0;

  // Create gradient for fill - green above zero, dark/red below zero
  const getGradient = (ctx: CanvasRenderingContext2D, chartArea: { top: number; bottom: number }) => {
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

    if (dataMin >= 0) {
      // All positive - green gradient
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
      gradient.addColorStop(0.7, 'rgba(34, 197, 94, 0.1)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0.05)');
    } else if (dataMax <= 0) {
      // All negative - dark red gradient
      gradient.addColorStop(0, 'rgba(82, 82, 91, 0.3)');
      gradient.addColorStop(1, 'rgba(82, 82, 91, 0.6)');
    } else {
      // Mixed - green above zero line, dark below
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
      gradient.addColorStop(zeroPosition * 0.9, 'rgba(34, 197, 94, 0.15)');
      gradient.addColorStop(zeroPosition, 'rgba(82, 82, 91, 0.2)');
      gradient.addColorStop(1, 'rgba(82, 82, 91, 0.5)');
    }
    return gradient;
  };

  const chartLabels = hasData
    ? chartData.map(d => formatDateLabel(d.date, selectedPeriod))
    : placeholderLabels;

  const chartValues = hasData
    ? chartData.map(d => d.periodCumulativePnL)
    : placeholderData;

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'P&L',
        data: chartValues,
        borderColor: hasData ? lineColor : '#52525b',
        backgroundColor: hasData
          ? (context: ScriptableContext<'line'>) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) return 'rgba(82, 82, 91, 0.3)';
              return getGradient(ctx, chartArea);
            }
          : 'rgba(82, 82, 91, 0.2)',
        fill: true,
        tension: 0.3,
        pointRadius: hasData ? 4 : 0,
        pointBackgroundColor: lineColor,
        pointBorderColor: lineColor,
        pointBorderWidth: 0,
        pointHoverRadius: hasData ? 6 : 0,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: '#18181b',
        pointHoverBorderWidth: 3,
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    animation: {
      duration: 500,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: hasData,
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(items) {
            if (!items.length || !hasData) return '';
            const index = items[0].dataIndex;
            const dayData = chartData[index];
            if (!dayData) return items[0].label;
            const date = new Date(dayData.date);
            return date.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
          },
          label: function(context) {
            const value = context.parsed.y ?? 0;
            return formatSignedCurrency(value);
          },
          afterLabel: function(context) {
            if (!hasData) return '';
            const index = context.dataIndex;
            const dayData = chartData[index];
            if (!dayData || dayData.tradeCount === 0) return '';
            return `${dayData.tradeCount} trade${dayData.tradeCount > 1 ? 's' : ''} · ${dayData.dailyWinRate.toFixed(0)}% win`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: selectedPeriod === '1D' ? 6 : selectedPeriod === '1W' ? 7 : 6,
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: 8,
        },
        border: {
          display: false,
        },
      },
      y: {
        display: true,
        position: 'left',
        grid: {
          color: 'rgba(63, 63, 70, 0.5)',
          lineWidth: 1,
        },
        ticks: {
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: 8,
          callback: function(value) {
            const numValue = Number(value);
            if (Math.abs(numValue) >= 1000) {
              return `$${(numValue / 1000).toFixed(0)}K`;
            }
            return `$${numValue.toFixed(0)}`;
          },
        },
        border: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="p-3 sm:p-4">
        {/* Title with help */}
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            P&L Over Time
          </h2>
          <HelpTooltip
            title="P&L Chart"
            description="Track your profit and loss over time. Use the filters to view different time periods. The chart shows your cumulative P&L for the selected period."
          />
        </div>

        {/* Time Period Filters */}
        <div className="flex flex-wrap gap-1.5">
          {TIME_PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedPeriod(key)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-zinc-400 dark:focus:ring-offset-zinc-900 dark:focus:ring-zinc-500",
                selectedPeriod === key
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Section */}
      <div className="px-0 pb-2">
        <div className="h-64 sm:h-72 relative">
          <Line data={lineChartData} options={options} />

          {/* Empty State Overlay */}
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80">
              <div className="text-center px-6">
                <div className={cn(
                  "w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center",
                  "bg-zinc-100 dark:bg-zinc-800"
                )}>
                  <motivation.icon className="h-7 w-7 text-zinc-500" />
                </div>
                <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
                  {motivation.title}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {motivation.subtitle}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Row - Only show when we have data */}
      {hasData && totalTrades > 0 && (
        <div className="border-t border-zinc-200 px-3 sm:px-4 py-2.5 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 sm:gap-6">
              <div>
                <span className="text-zinc-500">Period P&L</span>
                <span className={cn(
                  "ml-1.5 font-semibold",
                  isPositive ? "text-emerald-500 dark:text-emerald-400" : "text-orange-500 dark:text-orange-400"
                )}>
                  {formatSignedCurrency(periodPnL, true)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Trades</span>
                <span className="ml-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                  {totalTrades}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Win Rate</span>
                <span className="ml-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                  {chartData.reduce((sum, d) => sum + d.winCount, 0) > 0
                    ? `${((chartData.reduce((sum, d) => sum + d.winCount, 0) / totalTrades) * 100).toFixed(0)}%`
                    : '0%'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-orange-500 dark:text-orange-400" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Best/Worst Day Stats - Only show when we have trading days */}
      {hasData && tradingDays.length > 0 && (bestDay || worstDay) && (
        <div className="border-t border-zinc-200 px-3 sm:px-4 py-2.5 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-4">
            {/* Best Day */}
            {bestDay && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Best Day</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                    {formatSignedCurrency(bestDay.realizedPnL)}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {new Date(bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}{bestDay.tradeCount} trade{bestDay.tradeCount > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Worst Day */}
            {worstDay && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Worst Day</p>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 truncate">
                    {formatSignedCurrency(worstDay.realizedPnL)}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {new Date(worstDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}{worstDay.tradeCount} trade{worstDay.tradeCount > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advanced Metrics Row */}
      {hasData && totalTrades >= 3 && (
        <div className="border-t border-zinc-200 px-3 sm:px-4 py-2.5 dark:border-zinc-800">
          <div className="grid grid-cols-4 gap-3 text-center">
            {/* Avg P&L per Trade */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">Avg/Trade</p>
              <p className={cn(
                "text-sm font-semibold",
                avgPnLPerTrade >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {formatSignedCurrency(avgPnLPerTrade, true)}
              </p>
            </div>

            {/* Expectancy */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">Expectancy</p>
              <p className={cn(
                "text-sm font-semibold",
                expectancy >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {formatSignedCurrency(expectancy, true)}
              </p>
            </div>

            {/* Green/Red Days */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">Days</p>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <span className="text-emerald-500">{periodWins}</span>
                <span className="text-zinc-400 mx-1">/</span>
                <span className="text-red-500">{periodLosses}</span>
              </p>
            </div>

            {/* Current Streak */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">Streak</p>
              {currentStreak.type === 'none' ? (
                <p className="text-sm font-semibold text-zinc-400">—</p>
              ) : (
                <p className={cn(
                  "text-sm font-semibold",
                  currentStreak.type === 'win' ? "text-emerald-500" : "text-red-500"
                )}>
                  {currentStreak.count} {currentStreak.type === 'win' ? 'W' : 'L'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
