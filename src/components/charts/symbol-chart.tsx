/**
 * Symbol Chart Component
 *
 * High-level data-fetching wrapper around TradingViewChart.
 * Fetches OHLCV data via TanStack Query and converts app types to chart format.
 * Default export for dynamic() import with ssr: false.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { parseApiJson, apiData } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { TradingViewChart } from './tradingview-chart';
import {
  barsToLWCandlestick,
  barsToLWVolume,
  tradesToMarkers,
  getChartTheme,
  type TradeMarkerInput,
  type PriceLineInput,
} from '@/lib/charts/tradingview-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL' | 'custom';

interface PriceHistoryBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceHistoryResponse {
  bars: PriceHistoryBar[];
  stale: boolean;
  source: string;
  dataAsOf: string | null;
}

interface SymbolChartProps {
  symbol: string;
  startDate?: string;
  endDate?: string;
  defaultTimeRange?: TimeRange;
  showTimeControls?: boolean;
  trades?: TradeMarkerInput[];
  priceLines?: PriceLineInput[];
  showVolume?: boolean;
  height?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'YTD', value: 'YTD' },
  { label: 'ALL', value: 'ALL' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDateRange(
  range: TimeRange,
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const now = new Date();
  const end = endDate ?? now.toISOString().slice(0, 10);

  if (range === 'custom' && startDate) {
    // Normalize to YYYY-MM-DD (startDate may be an ISO timestamp)
    const normalized = startDate.length > 10 ? startDate.slice(0, 10) : startDate;
    return { start: normalized, end };
  }

  const d = new Date(end);
  switch (range) {
    case '1W':
      d.setDate(d.getDate() - 7);
      break;
    case '1M':
      d.setMonth(d.getMonth() - 1);
      break;
    case '3M':
      d.setMonth(d.getMonth() - 3);
      break;
    case '6M':
      d.setMonth(d.getMonth() - 6);
      break;
    case '1Y':
      d.setFullYear(d.getFullYear() - 1);
      break;
    case 'YTD':
      d.setMonth(0, 1);
      break;
    case 'ALL':
      d.setFullYear(d.getFullYear() - 2);
      break;
  }
  return { start: d.toISOString().slice(0, 10), end };
}

async function fetchPriceHistory(
  symbol: string,
  start: string,
  end: string
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ symbol, start, end, interval: '1d' });
  const res = await fetch(`/api/market/price-history?${params}`);
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error('Failed to fetch price history');
  return apiData<PriceHistoryResponse>(payload);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SymbolChart({
  symbol,
  startDate,
  endDate,
  defaultTimeRange = '3M',
  showTimeControls = true,
  trades,
  priceLines,
  showVolume = true,
  height = 300,
  className,
}: SymbolChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [timeRange, setTimeRange] = useState<TimeRange>(
    startDate ? 'custom' : defaultTimeRange
  );

  const { start, end } = computeDateRange(timeRange, startDate, endDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ['priceHistory', symbol, start, end],
    queryFn: () => fetchPriceHistory(symbol, start, end),
    staleTime: 5 * 60 * 1000,
    enabled: !!symbol,
  });

  const theme = getChartTheme(isDark);
  const candlestickData = data ? barsToLWCandlestick(data.bars) : [];
  const volumeData = data && showVolume
    ? barsToLWVolume(data.bars, theme.volumeUp, theme.volumeDown)
    : undefined;
  const chartMarkers = trades ? tradesToMarkers(trades) : undefined;

  if (error) {
    return (
      <div className={cn('flex items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-sm', className)} style={{ height }}>
        Failed to load chart
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Time range controls */}
      {showTimeControls && (
        <div className="flex items-center gap-1 overflow-x-auto flex-nowrap pb-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                timeRange === tr.value
                  ? 'bg-emerald-500 text-white'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      )}

      {/* Chart or loading skeleton */}
      {isLoading || !data ? (
        <div
          className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse"
          style={{ height }}
        />
      ) : (
        <TradingViewChart
          candlestickData={candlestickData}
          volumeData={volumeData}
          markers={chartMarkers}
          priceLines={priceLines}
          height={height}
          isDark={isDark}
        />
      )}

      {/* Data freshness */}
      {data?.stale && (
        <p className="text-[11px] text-amber-500 dark:text-amber-400">
          Data may be delayed (as of {data.dataAsOf ? new Date(data.dataAsOf).toLocaleString() : 'unknown'})
        </p>
      )}
    </div>
  );
}

export default SymbolChart;
