'use client';

/**
 * Scatter Plot Components
 *
 * Dark-themed scatter plots for open positions and closed trades distribution.
 * Includes time period filters for data exploration.
 *
 * Features:
 * - Outlier detection using IQR method
 * - Dynamic axis scaling to prevent outliers from compressing data
 * - Visual indicators for outliers beyond visible range
 */

import { useState } from 'react';
import { Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Briefcase, BarChart3, AlertTriangle } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn } from '@/lib/utils';

/**
 * Calculate axis bounds using IQR method to handle outliers
 * Returns min/max that excludes extreme outliers while keeping most data visible
 */
function calculateAxisBounds(
  values: number[],
  options: {
    includeZero?: boolean;
    padding?: number;
    minRange?: number;
  } = {}
): { min: number; max: number; outlierCount: { below: number; above: number } } {
  const { includeZero = false, padding = 0.1, minRange = 100 } = options;

  if (values.length === 0) {
    return { min: 0, max: 100, outlierCount: { below: 0, above: 0 } };
  }

  // Sort values for percentile calculation
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // For small datasets, just use actual min/max with padding
  if (n <= 5) {
    const dataMin = sorted[0];
    const dataMax = sorted[n - 1];
    const range = dataMax - dataMin || minRange;
    let min = dataMin - range * padding;
    let max = dataMax + range * padding;
    if (includeZero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    return { min, max, outlierCount: { below: 0, above: 0 } };
  }

  // Calculate quartiles
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Use 2.5x IQR for a more permissive outlier threshold
  const multiplier = 2.5;
  const lowerBound = q1 - iqr * multiplier;
  const upperBound = q3 + iqr * multiplier;

  // Count outliers
  const outlierCount = {
    below: values.filter(v => v < lowerBound).length,
    above: values.filter(v => v > upperBound).length,
  };

  // Find the actual min/max within bounds
  const inRangeValues = values.filter(v => v >= lowerBound && v <= upperBound);

  // If all values are outliers (edge case), use actual range
  if (inRangeValues.length === 0) {
    const dataMin = sorted[0];
    const dataMax = sorted[n - 1];
    const range = dataMax - dataMin || minRange;
    let min = dataMin - range * padding;
    let max = dataMax + range * padding;
    if (includeZero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    return { min, max, outlierCount: { below: 0, above: 0 } };
  }

  const visibleMin = Math.min(...inRangeValues);
  const visibleMax = Math.max(...inRangeValues);
  const range = visibleMax - visibleMin || minRange;

  let min = visibleMin - range * padding;
  let max = visibleMax + range * padding;

  // Extend slightly to include nearby outliers (within 1.5x of visible range)
  const extendedLower = min - range * 0.5;
  const extendedUpper = max + range * 0.5;

  // Include any outliers that are close to the visible range
  const nearbyOutliers = values.filter(
    v => (v < visibleMin && v >= extendedLower) || (v > visibleMax && v <= extendedUpper)
  );
  if (nearbyOutliers.length > 0) {
    const allVisible = [...inRangeValues, ...nearbyOutliers];
    min = Math.min(...allVisible) - range * padding;
    max = Math.max(...allVisible) + range * padding;
  }

  // Ensure zero is included for P&L charts
  if (includeZero) {
    min = Math.min(min, -range * 0.1);
    max = Math.max(max, range * 0.1);
  }

  return { min, max, outlierCount };
}

// Register Chart.js components
ChartJS.register(LinearScale, TimeScale, PointElement, Tooltip, Legend);

interface OpenPosition {
  id: string;
  symbol: string;
  type: string;
  avgPrice: number;
  costBasis: number;
  entryTimestamp: number;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  type: string;
  pnl: number;
  closeTimestamp: number;
  isWin: boolean;
  isLoss: boolean;
}

interface ScatterMeta {
  count: number;
  priceRange?: { min: number; max: number } | null;
  dateRange?: { min: string; max: string } | null;
  pnlRange?: { min: number; max: number } | null;
  wins?: number;
  losses?: number;
}

interface OpenPositionsScatterProps {
  points: OpenPosition[];
  meta: ScatterMeta;
}

interface ClosedTradesScatterProps {
  points: ClosedTrade[];
  meta: ScatterMeta;
}

type TimePeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'ALL' },
];

type AssetFilter = 'all' | 'stocks' | 'options' | 'futures';

const BASE_ASSET_FILTERS: { key: AssetFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'options', label: 'Options' },
];

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (period) {
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
    case 'ALL':
      start.setFullYear(2000, 0, 1);
      break;
  }

  return { start, end };
}

/**
 * Calculate x-axis (time) bounds from actual data with padding
 * This prevents empty space when data is concentrated in a small date range
 */
function calculateTimeBounds(
  timestamps: number[],
  options: { paddingPercent?: number; minDays?: number } = {}
): { min: number; max: number; spanDays: number } {
  const { paddingPercent = 0.1, minDays = 3 } = options;

  if (timestamps.length === 0) {
    const now = Date.now();
    return { min: now - 7 * 24 * 60 * 60 * 1000, max: now, spanDays: 7 };
  }

  const dataMin = Math.min(...timestamps);
  const dataMax = Math.max(...timestamps);
  const dataSpan = dataMax - dataMin;
  const minSpan = minDays * 24 * 60 * 60 * 1000;

  // Ensure minimum span for readability
  const effectiveSpan = Math.max(dataSpan, minSpan);
  const padding = effectiveSpan * paddingPercent;

  const min = dataMin - padding;
  const max = dataMax + padding;
  const spanDays = (max - min) / (24 * 60 * 60 * 1000);

  return { min, max, spanDays };
}

/**
 * Choose appropriate time unit based on data span
 */
function getTimeUnit(spanDays: number): 'day' | 'week' | 'month' {
  if (spanDays <= 14) return 'day';
  if (spanDays <= 90) return 'week';
  return 'month';
}

/**
 * Get max ticks based on span to prevent overcrowding
 */
function getMaxTicks(spanDays: number): number {
  if (spanDays <= 7) return 7;
  if (spanDays <= 30) return 6;
  if (spanDays <= 90) return 6;
  return 5;
}

/**
 * Calculate adaptive point size based on data count
 */
function getAdaptivePointSize(count: number): { radius: number; hoverRadius: number } {
  if (count <= 10) return { radius: 10, hoverRadius: 14 };
  if (count <= 30) return { radius: 8, hoverRadius: 12 };
  if (count <= 60) return { radius: 6, hoverRadius: 10 };
  if (count <= 100) return { radius: 5, hoverRadius: 8 };
  return { radius: 4, hoverRadius: 7 };
}

export function OpenPositionsScatter({ points }: OpenPositionsScatterProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('ALL');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const hasFutures = points.some(p => p.type === 'future');
  const assetFilters = hasFutures
    ? [...BASE_ASSET_FILTERS, { key: 'futures' as const, label: 'Futures' }]
    : BASE_ASSET_FILTERS;

  // Filter points by time period and asset type
  const { start, end } = getDateRange(selectedPeriod);
  let filteredPoints = points.filter(p => {
    const date = new Date(p.entryTimestamp);
    return date >= start && date <= end;
  });

  if (assetFilter === 'stocks') {
    filteredPoints = filteredPoints.filter(p => p.type === 'stock');
  } else if (assetFilter === 'options') {
    filteredPoints = filteredPoints.filter(p => p.type === 'option');
  } else if (assetFilter === 'futures') {
    filteredPoints = filteredPoints.filter(p => p.type === 'future');
  }

  const stockPoints = filteredPoints.filter(p => p.type === 'stock');
  const optionPoints = filteredPoints.filter(p => p.type === 'option');
  const futurePoints = filteredPoints.filter(p => p.type === 'future');

  // Calculate Y-axis bounds with outlier detection
  const allPrices = filteredPoints.map(p => p.avgPrice);
  const { min: yMin, max: yMax, outlierCount } = calculateAxisBounds(allPrices, {
    includeZero: false,
    padding: 0.15,
    minRange: 50,
  });

  // Calculate X-axis bounds from actual data (zoom to data)
  const allTimestamps = filteredPoints.map(p => p.entryTimestamp);
  const { min: xMin, max: xMax, spanDays } = calculateTimeBounds(allTimestamps, {
    paddingPercent: 0.08,
    minDays: 3,
  });

  // Choose appropriate time unit and tick count
  const timeUnit = getTimeUnit(spanDays);
  const maxTicks = getMaxTicks(spanDays);

  // Adaptive point sizing
  const { radius: pointRadius, hoverRadius: pointHoverRadius } = getAdaptivePointSize(filteredPoints.length);

  const chartData = {
    datasets: [
      {
        label: 'Stocks',
        data: stockPoints.map(p => ({
          x: p.entryTimestamp,
          y: p.avgPrice,
          symbol: p.symbol,
          costBasis: p.costBasis,
          entryDate: new Date(p.entryTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderColor: '#2563eb',
        borderWidth: 1.5,
        pointRadius,
        pointHoverRadius,
      },
      {
        label: 'Options',
        data: optionPoints.map(p => ({
          x: p.entryTimestamp,
          y: p.avgPrice,
          symbol: p.symbol,
          costBasis: p.costBasis,
          entryDate: new Date(p.entryTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(168, 85, 247, 0.85)',
        borderColor: '#9333ea',
        borderWidth: 1.5,
        pointRadius,
        pointHoverRadius,
      },
      ...(futurePoints.length > 0 ? [{
        label: 'Futures',
        data: futurePoints.map(p => ({
          x: p.entryTimestamp,
          y: p.avgPrice,
          symbol: p.symbol,
          costBasis: p.costBasis,
          entryDate: new Date(p.entryTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderColor: '#d97706',
        borderWidth: 1.5,
        pointRadius,
        pointHoverRadius,
      }] : []),
    ],
  };

  const options: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 16,
          font: { size: 11 },
          color: '#a1a1aa',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: function(context) {
            const point = context[0]?.raw as { entryDate: string } | undefined;
            return point?.entryDate ?? '';
          },
          label: function(context) {
            const point = context.raw as { symbol: string; y: number; costBasis: number };
            return [
              `${point.symbol}`,
              `Avg Price: $${point.y.toFixed(2)}`,
              `Cost Basis: $${point.costBasis.toFixed(2)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        min: xMin,
        max: xMax,
        time: {
          unit: timeUnit,
          tooltipFormat: 'MMM d, yyyy',
          displayFormats: {
            day: 'MMM d',
            week: 'MMM d',
            month: 'MMM',
          },
        },
        title: {
          display: true,
          text: 'Entry Date',
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: { top: 8 },
        },
        grid: { display: false },
        border: { display: false },
        ticks: {
          font: { size: 10 },
          color: '#71717a',
          maxTicksLimit: maxTicks,
          autoSkip: true,
          maxRotation: 0,
          source: 'auto',
        },
      },
      y: {
        min: yMin,
        max: yMax,
        title: {
          display: true,
          text: 'Cost Basis',
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: { bottom: 8 },
        },
        grid: { color: 'rgba(161, 161, 170, 0.15)' },
        border: { display: false },
        ticks: {
          font: { size: 11 },
          color: '#71717a',
          callback: function(value) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            return `$${numValue.toFixed(0)}`;
          },
        },
      },
    },
  };

  const totalOutliers = outlierCount.above + outlierCount.below;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Open Positions</h2>
            <HelpTooltip
              title="Open Positions Scatter"
              description="Visual distribution of your open positions by entry date and price. Each dot represents a position - hover to see details."
            />
          </div>
          <div className="flex items-center gap-2">
            {totalOutliers > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" title={`${totalOutliers} outlier${totalOutliers > 1 ? 's' : ''} outside visible range`}>
                <AlertTriangle className="h-3 w-3" />
                {totalOutliers}
              </span>
            )}
            <span className="text-xs text-zinc-500">{filteredPoints.length} positions</span>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Time Period Filters */}
          <div className="flex gap-1">
            {TIME_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedPeriod(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  selectedPeriod === key
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700" />

          {/* Asset Type Filters */}
          <div className="flex gap-1">
            {assetFilters.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setAssetFilter(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  assetFilter === key
                    ? key === 'stocks' ? "bg-blue-100 text-blue-600 border border-blue-300 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-700"
                    : key === 'options' ? "bg-purple-100 text-purple-600 border border-purple-300 dark:bg-purple-900/50 dark:text-purple-400 dark:border-purple-700"
                    : key === 'futures' ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700"
                    : "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-4">
        {filteredPoints.length === 0 ? (
          <div className="flex items-center justify-center py-16 bg-zinc-100 dark:bg-zinc-800/30 rounded-lg mx-2">
            <p className="text-sm text-zinc-500">No positions in this period</p>
          </div>
        ) : (
          <div className="h-72">
            <Scatter data={chartData} options={options} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ClosedTradesScatter({ points }: ClosedTradesScatterProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1M');
  const [resultFilter, setResultFilter] = useState<'all' | 'wins' | 'losses'>('all');

  // Filter points by time period and result type
  const { start, end } = getDateRange(selectedPeriod);
  let filteredPoints = points.filter(p => {
    const date = new Date(p.closeTimestamp);
    return date >= start && date <= end;
  });

  if (resultFilter === 'wins') {
    filteredPoints = filteredPoints.filter(p => p.isWin);
  } else if (resultFilter === 'losses') {
    filteredPoints = filteredPoints.filter(p => p.isLoss);
  }

  const winPoints = filteredPoints.filter(p => p.isWin);
  const lossPoints = filteredPoints.filter(p => p.isLoss);
  const breakeven = filteredPoints.filter(p => !p.isWin && !p.isLoss);

  // Calculate Y-axis bounds with outlier detection (include zero for P&L)
  const allPnL = filteredPoints.map(p => p.pnl);
  const { min: yMin, max: yMax, outlierCount } = calculateAxisBounds(allPnL, {
    includeZero: true,
    padding: 0.15,
    minRange: 500,
  });

  // Calculate X-axis bounds from actual data (zoom to data)
  const allTimestamps = filteredPoints.map(p => p.closeTimestamp);
  const { min: xMin, max: xMax, spanDays } = calculateTimeBounds(allTimestamps, {
    paddingPercent: 0.08,
    minDays: 3,
  });

  // Choose appropriate time unit and tick count
  const timeUnit = getTimeUnit(spanDays);
  const maxTicks = getMaxTicks(spanDays);

  // Adaptive point sizing
  const { radius: pointRadius, hoverRadius: pointHoverRadius } = getAdaptivePointSize(filteredPoints.length);
  const breakevenRadius = Math.max(3, pointRadius - 2);

  const chartData = {
    datasets: [
      {
        label: 'Wins',
        data: winPoints.map(p => ({
          x: p.closeTimestamp,
          y: p.pnl,
          symbol: p.symbol,
          type: p.type,
          closeDate: new Date(p.closeTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        borderColor: '#16a34a',
        borderWidth: 1.5,
        pointRadius,
        pointHoverRadius,
      },
      {
        label: 'Losses',
        data: lossPoints.map(p => ({
          x: p.closeTimestamp,
          y: p.pnl,
          symbol: p.symbol,
          type: p.type,
          closeDate: new Date(p.closeTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(239, 68, 68, 0.85)',
        borderColor: '#dc2626',
        borderWidth: 1.5,
        pointRadius,
        pointHoverRadius,
      },
      {
        label: 'Breakeven',
        data: breakeven.map(p => ({
          x: p.closeTimestamp,
          y: p.pnl,
          symbol: p.symbol,
          type: p.type,
          closeDate: new Date(p.closeTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        })),
        backgroundColor: 'rgba(113, 113, 122, 0.7)',
        borderColor: '#52525b',
        borderWidth: 1,
        pointRadius: breakevenRadius,
        pointHoverRadius: breakevenRadius + 3,
      },
    ],
  };

  const options: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 16,
          font: { size: 11 },
          color: '#a1a1aa',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(39, 39, 42, 0.95)',
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        titleColor: '#fafafa',
        bodyColor: '#a1a1aa',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: function(context) {
            const point = context[0]?.raw as { closeDate: string } | undefined;
            return point?.closeDate ?? '';
          },
          label: function(context) {
            const point = context.raw as { symbol: string; y: number; type: string };
            const pnlStr = point.y >= 0 ? `+$${point.y.toFixed(2)}` : `-$${Math.abs(point.y).toFixed(2)}`;
            return [
              `${point.symbol} (${point.type})`,
              `P&L: ${pnlStr}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        min: xMin,
        max: xMax,
        time: {
          unit: timeUnit,
          tooltipFormat: 'MMM d, yyyy',
          displayFormats: {
            day: 'MMM d',
            week: 'MMM d',
            month: 'MMM',
          },
        },
        title: {
          display: true,
          text: 'Close Date',
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: { top: 8 },
        },
        grid: { display: false },
        border: { display: false },
        ticks: {
          font: { size: 10 },
          color: '#71717a',
          maxTicksLimit: maxTicks,
          autoSkip: true,
          maxRotation: 0,
          source: 'auto',
        },
      },
      y: {
        min: yMin,
        max: yMax,
        title: {
          display: true,
          text: 'P&L ($)',
          font: { size: 11, weight: 500 },
          color: '#71717a',
          padding: { bottom: 8 },
        },
        grid: { color: 'rgba(161, 161, 170, 0.15)' },
        border: { display: false },
        ticks: {
          font: { size: 11 },
          color: '#71717a',
          callback: function(value) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            return numValue >= 0 ? `+$${numValue.toFixed(0)}` : `-$${Math.abs(numValue).toFixed(0)}`;
          },
        },
      },
    },
  };

  const filteredWins = filteredPoints.filter(p => p.isWin).length;
  const filteredLosses = filteredPoints.filter(p => p.isLoss).length;
  const totalOutliers = outlierCount.above + outlierCount.below;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Trade Distribution</h2>
            <HelpTooltip
              title="Closed Trades Distribution"
              description="Visual distribution of your closed trades by date and P&L. Green dots are wins, red are losses. Hover to see trade details."
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            {totalOutliers > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title={`${totalOutliers} outlier${totalOutliers > 1 ? 's' : ''} outside visible range`}>
                <AlertTriangle className="h-3 w-3" />
                {totalOutliers}
              </span>
            )}
            <span className="text-emerald-500">{filteredWins}W</span>
            <span className="text-zinc-600">/</span>
            <span className="text-red-500">{filteredLosses}L</span>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Time Period Filters */}
          <div className="flex gap-1">
            {TIME_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedPeriod(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  selectedPeriod === key
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700" />

          {/* Result Type Filters */}
          <div className="flex gap-1">
            <button
              onClick={() => setResultFilter('all')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                resultFilter === 'all'
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
              )}
            >
              All
            </button>
            <button
              onClick={() => setResultFilter('wins')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                resultFilter === 'wins'
                  ? "bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
              )}
            >
              Wins
            </button>
            <button
              onClick={() => setResultFilter('losses')}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                resultFilter === 'losses'
                  ? "bg-red-100 text-red-600 border border-red-300 dark:bg-red-900/50 dark:text-red-400 dark:border-red-700"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
              )}
            >
              Losses
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-4">
        {filteredPoints.length === 0 ? (
          <div className="flex items-center justify-center py-16 bg-zinc-100 dark:bg-zinc-800/30 rounded-lg mx-2">
            <p className="text-sm text-zinc-500">No trades in this period</p>
          </div>
        ) : (
          <div className="h-72">
            <Scatter data={chartData} options={options} />
          </div>
        )}
      </div>
    </div>
  );
}
