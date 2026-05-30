'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Trade Size Analytics Component
 *
 * Displays average trade size and volume metrics across different timeframes.
 * Also includes Cash Flow Analysis showing contributions, withdrawals, dividends, etc.
 * Supports custom date range selection for detailed analysis.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Calendar,
  TrendingUp,
  Layers,
  ChevronRight,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  CircleDollarSign,
  Percent,
  Receipt,
  ArrowRightLeft,
  Banknote,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatCompactCurrency, formatSignedCurrency } from '@/lib/utils';

type Timeframe = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'ytd' | 'last12m' | 'lastyear' | 'custom';

interface PeriodMetrics {
  avgTradeSize: {
    stock: number;
    option: number;
    total: number;
  };
  volume: {
    capitalDeployed: {
      stock: number;
      option: number;
      total: number;
    };
    capitalReturned: {
      stock: number;
      option: number;
      total: number;
    };
    totalTraded: number;
  };
  tradeCount: {
    stock: number;
    option: number;
    total: number;
  };
}

interface TradeMetricsData {
  timeframes: {
    daily: PeriodMetrics;
    weekly: PeriodMetrics;
    monthly: PeriodMetrics;
    quarterly: PeriodMetrics;
    ytd: PeriodMetrics;
    last12m: PeriodMetrics;
    lastyear: PeriodMetrics;
    customRange: PeriodMetrics | null;
  };
  allTime: PeriodMetrics;
  periodLabels: {
    daily: string;
    weekly: string;
    monthly: string;
    quarterly: string;
    ytd: string;
    last12m: string;
    lastyear: string;
  };
}

// Cash Flow Types
interface CashFlowCategory {
  total: number;
  count: number;
  items: Array<{
    date: string;
    amount: number;
    description: string;
    symbol?: string;
  }>;
}

interface PeriodCashFlow {
  contributions: CashFlowCategory;
  withdrawals: CashFlowCategory;
  dividends: CashFlowCategory;
  interest: CashFlowCategory;
  fees: CashFlowCategory;
  transfers: CashFlowCategory;
  netCashFlow: number;
}

interface CashFlowData {
  timeframes: {
    monthly: PeriodCashFlow;
    quarterly: PeriodCashFlow;
    ytd: PeriodCashFlow;
    last12m: PeriodCashFlow;
    lastyear: PeriodCashFlow;
    allTime: PeriodCashFlow;
    customRange: PeriodCashFlow | null;
  };
  periodLabels: {
    monthly: string;
    quarterly: string;
    ytd: string;
    last12m: string;
    lastyear: string;
    allTime: string;
  };
}

async function fetchTradeMetrics(
  accountId: string | null,
  startDate?: string,
  endDate?: string
): Promise<TradeMetricsData> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const url = `/api/dashboard/trade-metrics${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch trade metrics');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

async function fetchCashFlow(
  accountId: string | null,
  startDate?: string,
  endDate?: string
): Promise<CashFlowData> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const url = `/api/dashboard/cash-flow${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch cash flow data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

// Use formatCompactCurrency directly for compact currency displays

const TIMEFRAME_CONFIG: Array<{
  id: Timeframe;
  label: string;
  shortLabel: string;
}> = [
  { id: 'daily', label: 'Today', shortLabel: 'Day' },
  { id: 'weekly', label: 'This Week', shortLabel: 'Week' },
  { id: 'monthly', label: 'This Month', shortLabel: 'Month' },
  { id: 'quarterly', label: 'This Quarter', shortLabel: 'Qtr' },
  { id: 'ytd', label: 'Year to Date', shortLabel: 'YTD' },
  { id: 'last12m', label: 'Last 12 Months', shortLabel: '12M' },
  { id: 'lastyear', label: 'Last Year', shortLabel: 'LY' },
  { id: 'custom', label: 'Custom Range', shortLabel: 'Custom' },
];

// Cash flow only has monthly+ timeframes
type CashFlowTimeframe = 'monthly' | 'quarterly' | 'ytd' | 'last12m' | 'lastyear' | 'allTime' | 'custom';

const CASH_FLOW_TIMEFRAME_CONFIG: Array<{
  id: CashFlowTimeframe;
  label: string;
  shortLabel: string;
}> = [
  { id: 'monthly', label: 'This Month', shortLabel: 'Month' },
  { id: 'quarterly', label: 'This Quarter', shortLabel: 'Qtr' },
  { id: 'ytd', label: 'Year to Date', shortLabel: 'YTD' },
  { id: 'last12m', label: 'Last 12 Months', shortLabel: '12M' },
  { id: 'lastyear', label: 'Last Year', shortLabel: 'LY' },
  { id: 'allTime', label: 'All Time', shortLabel: 'All' },
  { id: 'custom', label: 'Custom Range', shortLabel: 'Custom' },
];

type ViewMode = 'trades' | 'cashflow';

interface TradeSizeAnalyticsProps {
  accountId?: string | null;
}

export function TradeSizeAnalytics({ accountId }: TradeSizeAnalyticsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('trades');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('monthly');
  const [selectedCashFlowTimeframe, setSelectedCashFlowTimeframe] = useState<CashFlowTimeframe>('ytd');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tradeMetrics', accountId, appliedRange?.start, appliedRange?.end],
    queryFn: () => fetchTradeMetrics(accountId ?? null, appliedRange?.start, appliedRange?.end),
  });

  const { data: cashFlowData, isLoading: cashFlowLoading } = useQuery({
    queryKey: ['cashFlow', accountId, appliedRange?.start, appliedRange?.end],
    queryFn: () => fetchCashFlow(accountId ?? null, appliedRange?.start, appliedRange?.end),
    enabled: viewMode === 'cashflow',
  });

  const handleApplyCustomRange = () => {
    if (customStartDate && customEndDate) {
      setAppliedRange({ start: customStartDate, end: customEndDate });
      if (viewMode === 'trades') {
        setSelectedTimeframe('custom');
      } else {
        setSelectedCashFlowTimeframe('custom');
      }
      setShowCustomRange(false);
    }
  };

  const handleTimeframeChange = (timeframe: Timeframe) => {
    if (timeframe === 'custom') {
      setShowCustomRange(true);
    } else {
      setSelectedTimeframe(timeframe);
      setShowCustomRange(false);
    }
  };

  const handleCashFlowTimeframeChange = (timeframe: CashFlowTimeframe) => {
    if (timeframe === 'custom') {
      setShowCustomRange(true);
    } else {
      setSelectedCashFlowTimeframe(timeframe);
      setShowCustomRange(false);
    }
  };

  // Get current metrics based on selected timeframe
  const currentMetrics: PeriodMetrics | null = data
    ? (selectedTimeframe === 'custom' && data.timeframes.customRange
      ? data.timeframes.customRange
      : data.timeframes[selectedTimeframe as keyof typeof data.timeframes] as PeriodMetrics || data.timeframes.monthly)
    : null;

  const periodLabel = data
    ? (selectedTimeframe === 'custom' && appliedRange
      ? `${new Date(appliedRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(appliedRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : data.periodLabels[selectedTimeframe as keyof typeof data.periodLabels] || '')
    : '';

  // Get current cash flow based on selected timeframe
  const currentCashFlow: PeriodCashFlow | null = cashFlowData
    ? (selectedCashFlowTimeframe === 'custom' && cashFlowData.timeframes.customRange
      ? cashFlowData.timeframes.customRange
      : cashFlowData.timeframes[selectedCashFlowTimeframe as keyof typeof cashFlowData.timeframes] as PeriodCashFlow || cashFlowData.timeframes.ytd)
    : null;

  const cashFlowPeriodLabel = cashFlowData
    ? (selectedCashFlowTimeframe === 'custom' && appliedRange
      ? `${new Date(appliedRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(appliedRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : cashFlowData.periodLabels[selectedCashFlowTimeframe as keyof typeof cashFlowData.periodLabels] || '')
    : '';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header with View Toggle */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Trade Size & Volume
            </h3>
            <HelpTooltip
              title="Trade Size & Volume"
              description="Analyze your average trade size, volume, and cash flow across different time periods. Toggle between trade metrics and cash flow analysis."
            />
          </div>
          {/* View Mode Toggle */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
            <button
              onClick={() => setViewMode('trades')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                viewMode === 'trades'
                  ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              <span className="hidden sm:inline">Trades</span>
              <span className="sm:hidden">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </button>
            <button
              onClick={() => setViewMode('cashflow')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                viewMode === 'cashflow'
                  ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              <span className="hidden sm:inline">Cash Flow</span>
              <span className="sm:hidden">
                <Wallet className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {viewMode === 'trades' ? periodLabel : cashFlowPeriodLabel}
        </p>
      </div>

      {/* Timeframe Selector */}
      <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {viewMode === 'trades' ? (
            TIMEFRAME_CONFIG.map(({ id, label, shortLabel }) => (
              <button
                key={id}
                onClick={() => handleTimeframeChange(id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedTimeframe === id
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700/50'
                )}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{shortLabel}</span>
              </button>
            ))
          ) : (
            CASH_FLOW_TIMEFRAME_CONFIG.map(({ id, label, shortLabel }) => (
              <button
                key={id}
                onClick={() => handleCashFlowTimeframeChange(id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedCashFlowTimeframe === id
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700/50'
                )}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{shortLabel}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {showCustomRange && (
        <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleApplyCustomRange}
                disabled={!customStartDate || !customEndDate}
                size="sm"
                className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white"
              >
                <Search className="h-4 w-4 mr-1" />
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="p-4">
        {/* TRADES VIEW */}
        {viewMode === 'trades' && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error || !currentMetrics ? (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-500">Unable to load trade metrics</p>
              </div>
            ) : (
              <>
                {/* Trade Count Summary */}
                <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{currentMetrics.tradeCount.stock}</span> stock trades
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{currentMetrics.tradeCount.option}</span> option trades
                    </span>
                  </div>
                  <div className="ml-auto text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {currentMetrics.tradeCount.total} total closed trades
                  </div>
                </div>

                {/* Two Column Layout for Desktop */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: Average Trade Size */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="h-4 w-4 text-blue-500" />
                      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Average Trade Size
                      </h4>
                      <HelpTooltip
                        title="Average Trade Size"
                        description="The average amount of money you put into each trade. Calculated as: Capital Deployed ÷ Number of Trades. This shows how much capital you typically deploy per position."
                      />
                    </div>

                    <div className="space-y-3">
                      {/* Stocks Avg */}
                      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-100 dark:border-blue-800/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                              Stocks
                            </p>
                            <p className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-300">
                              {formatCompactCurrency(currentMetrics.avgTradeSize.stock)}
                            </p>
                            <p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1">
                              avg per trade · {currentMetrics.tradeCount.stock} trades
                            </p>
                          </div>
                          <div className="hidden sm:flex w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800/40 items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-blue-500" />
                          </div>
                        </div>
                      </div>

                      {/* Options Avg */}
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-100 dark:border-emerald-800/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                              Options
                            </p>
                            <p className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCompactCurrency(currentMetrics.avgTradeSize.option)}
                            </p>
                            <p className="text-xs text-emerald-500/70 dark:text-emerald-400/70 mt-1">
                              avg per trade · {currentMetrics.tradeCount.option} trades
                            </p>
                          </div>
                          <div className="hidden sm:flex w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-800/40 items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-emerald-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Capital Flow */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-4 w-4 text-purple-500" />
                      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Capital Flow
                      </h4>
                      <HelpTooltip
                        title="Capital Flow"
                        description="Capital Deployed = money you spent opening positions. Capital Returned = money you received closing positions. Net Flow = Returned minus Deployed (positive means you got more back than you put in)."
                      />
                    </div>

                    <div className="space-y-3">
                      {/* Capital Deployed */}
                      <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-100 dark:border-red-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowUpRight className="h-4 w-4 text-red-500" />
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">Capital Deployed</span>
                          <span className="text-[10px] text-red-400 dark:text-red-500">(money out)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-[10px] text-red-500/70 mb-0.5">Stocks</p>
                            <p className="text-base sm:text-lg font-bold text-red-700 dark:text-red-300">
                              {formatCompactCurrency(currentMetrics.volume.capitalDeployed.stock)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-red-500/70 mb-0.5">Options</p>
                            <p className="text-base sm:text-lg font-bold text-red-700 dark:text-red-300">
                              {formatCompactCurrency(currentMetrics.volume.capitalDeployed.option)}
                            </p>
                          </div>
                          <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-2 -m-1">
                            <p className="text-[10px] text-red-600 dark:text-red-400 mb-0.5">Total</p>
                            <p className="text-base sm:text-lg font-bold text-red-800 dark:text-red-200">
                              {formatCompactCurrency(currentMetrics.volume.capitalDeployed.total)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Capital Returned */}
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-100 dark:border-emerald-800/30">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Capital Returned</span>
                          <span className="text-[10px] text-emerald-400 dark:text-emerald-500">(money in)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-[10px] text-emerald-500/70 mb-0.5">Stocks</p>
                            <p className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCompactCurrency(currentMetrics.volume.capitalReturned.stock)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-500/70 mb-0.5">Options</p>
                            <p className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCompactCurrency(currentMetrics.volume.capitalReturned.option)}
                            </p>
                          </div>
                          <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-lg p-2 -m-1">
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5">Total</p>
                            <p className="text-base sm:text-lg font-bold text-emerald-800 dark:text-emerald-200">
                              {formatCompactCurrency(currentMetrics.volume.capitalReturned.total)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Summary Stats */}
                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Total Traded */}
                    <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-3 border border-purple-200 dark:border-purple-800/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-purple-500" />
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase">Total Traded</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-purple-700 dark:text-purple-300">
                        {formatCompactCurrency(currentMetrics.volume.totalTraded)}
                      </p>
                      <p className="text-[10px] text-purple-500/70">all activity combined</p>
                    </div>

                    {/* Net Capital Flow */}
                    {(() => {
                      const netFlow = currentMetrics.volume.capitalReturned.total - currentMetrics.volume.capitalDeployed.total;
                      const isPositive = netFlow >= 0;
                      return (
                        <div className={cn(
                          "rounded-lg p-3 border",
                          isPositive
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                        )}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className={cn("h-3.5 w-3.5", isPositive ? "text-emerald-500" : "text-red-500 rotate-180")} />
                            <span className={cn("text-[10px] font-medium uppercase", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                              Net Flow
                            </span>
                          </div>
                          <p className={cn("text-lg sm:text-xl font-bold", isPositive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                            {formatSignedCurrency(netFlow, true)}
                          </p>
                          <p className={cn("text-[10px]", isPositive ? "text-emerald-500/70" : "text-red-500/70")}>
                            {isPositive ? "returned more than deployed" : "deployed more than returned"}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Combined Avg Trade Size */}
                    <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Layers className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium uppercase">Overall Avg</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-zinc-800 dark:text-zinc-200">
                        {formatCompactCurrency(currentMetrics.avgTradeSize.total)}
                      </p>
                      <p className="text-[10px] text-zinc-500">per trade (all types)</p>
                    </div>

                    {/* Turnover Ratio */}
                    {(() => {
                      const deployed = currentMetrics.volume.capitalDeployed.total;
                      const turnover = deployed > 0
                        ? (currentMetrics.volume.capitalReturned.total / deployed * 100).toFixed(0)
                        : '0';
                      return (
                        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="h-3.5 w-3.5 text-zinc-500" />
                            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium uppercase">Return Rate</span>
                          </div>
                          <p className="text-lg sm:text-xl font-bold text-zinc-800 dark:text-zinc-200">
                            {turnover}%
                          </p>
                          <p className="text-[10px] text-zinc-500">capital returned vs deployed</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* All-Time Comparison */}
                {currentMetrics.tradeCount.total > 0 && data && data.allTime.tradeCount.total > 0 && selectedTimeframe !== 'custom' && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">vs All-Time Average</span>
                      <div className="flex items-center gap-1">
                        {currentMetrics.avgTradeSize.total > data.allTime.avgTradeSize.total ? (
                          <>
                            <ChevronRight className="h-3 w-3 text-emerald-500 -rotate-90" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {((currentMetrics.avgTradeSize.total / data.allTime.avgTradeSize.total - 1) * 100).toFixed(0)}% higher
                            </span>
                          </>
                        ) : currentMetrics.avgTradeSize.total < data.allTime.avgTradeSize.total ? (
                          <>
                            <ChevronRight className="h-3 w-3 text-red-500 rotate-90" />
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              {((1 - currentMetrics.avgTradeSize.total / data.allTime.avgTradeSize.total) * 100).toFixed(0)}% lower
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-500">Same as average</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      All-time avg: {formatCompactCurrency(data.allTime.avgTradeSize.total)} ({data.allTime.tradeCount.total} trades)
                    </p>
                  </div>
                )}

                {/* No Data State */}
                {currentMetrics.tradeCount.total === 0 && (
                  <div className="text-center py-6">
                    <Calendar className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No trades in this period</p>
                    <p className="text-xs text-zinc-400 mt-1">Try selecting a different timeframe</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* CASH FLOW VIEW */}
        {viewMode === 'cashflow' && (
          <>
            {cashFlowLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !currentCashFlow ? (
              <div className="text-center py-6">
                <Wallet className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No cash flow data available</p>
                <p className="text-xs text-zinc-400 mt-1">Cash flow events will appear here when tracked</p>
              </div>
            ) : (
              <>
                {/* Cash Flow Summary Row */}
                <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{currentCashFlow.contributions.count + currentCashFlow.dividends.count + currentCashFlow.interest.count}</span> deposits
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{currentCashFlow.withdrawals.count + currentCashFlow.fees.count}</span> withdrawals
                    </span>
                  </div>
                  <div className="ml-auto text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {currentCashFlow.contributions.count + currentCashFlow.withdrawals.count + currentCashFlow.dividends.count + currentCashFlow.interest.count + currentCashFlow.fees.count + currentCashFlow.transfers.count} total events
                  </div>
                </div>

                {/* Two Column Layout for Cash Flow */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: Money In */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Money In
                      </h4>
                      <HelpTooltip
                        title="Money In"
                        description="Cash coming into your account including deposits, contributions, dividends, and interest earned."
                      />
                    </div>

                    <div className="space-y-3">
                      {/* Contributions/Deposits */}
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-100 dark:border-emerald-800/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <PiggyBank className="h-4 w-4 text-emerald-500" />
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                Deposits
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCompactCurrency(currentCashFlow.contributions.total)}
                            </p>
                            <p className="text-xs text-emerald-500/70 dark:text-emerald-400/70 mt-1">
                              {currentCashFlow.contributions.count} contribution{currentCashFlow.contributions.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dividends */}
                      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-100 dark:border-blue-800/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CircleDollarSign className="h-4 w-4 text-blue-500" />
                              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                Dividends
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-300">
                              {formatCompactCurrency(currentCashFlow.dividends.total)}
                            </p>
                            <p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1">
                              {currentCashFlow.dividends.count} payment{currentCashFlow.dividends.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Interest */}
                      <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 p-4 border border-purple-100 dark:border-purple-800/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Percent className="h-4 w-4 text-purple-500" />
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                                Interest
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-purple-700 dark:text-purple-300">
                              {formatCompactCurrency(Math.max(0, currentCashFlow.interest.total))}
                            </p>
                            <p className="text-xs text-purple-500/70 dark:text-purple-400/70 mt-1">
                              {currentCashFlow.interest.count} credit{currentCashFlow.interest.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Money Out */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowUpRight className="h-4 w-4 text-red-500" />
                      <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Money Out
                      </h4>
                      <HelpTooltip
                        title="Money Out"
                        description="Cash leaving your account including withdrawals, fees, and margin interest."
                      />
                    </div>

                    <div className="space-y-3">
                      {/* Withdrawals */}
                      <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-100 dark:border-red-800/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Banknote className="h-4 w-4 text-red-500" />
                              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                Withdrawals
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-red-700 dark:text-red-300">
                              {formatCompactCurrency(currentCashFlow.withdrawals.total)}
                            </p>
                            <p className="text-xs text-red-500/70 dark:text-red-400/70 mt-1">
                              {currentCashFlow.withdrawals.count} withdrawal{currentCashFlow.withdrawals.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Fees */}
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 border border-amber-100 dark:border-amber-800/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Receipt className="h-4 w-4 text-amber-500" />
                              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                Fees & Taxes
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-amber-700 dark:text-amber-300">
                              {formatCompactCurrency(currentCashFlow.fees.total)}
                            </p>
                            <p className="text-xs text-amber-500/70 dark:text-amber-400/70 mt-1">
                              {currentCashFlow.fees.count} charge{currentCashFlow.fees.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Transfers */}
                      <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-4 border border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <ArrowRightLeft className="h-4 w-4 text-zinc-500" />
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                                Transfers
                              </p>
                            </div>
                            <p className="text-2xl sm:text-3xl font-bold text-zinc-700 dark:text-zinc-300">
                              {formatCompactCurrency(currentCashFlow.transfers.total)}
                            </p>
                            <p className="text-xs text-zinc-500/70 dark:text-zinc-400/70 mt-1">
                              {currentCashFlow.transfers.count} transfer{currentCashFlow.transfers.count !== 1 ? 's' : ''} (internal)
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Net Cash Flow Summary */}
                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Total Money In */}
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 border border-emerald-200 dark:border-emerald-800/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase">Total In</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCompactCurrency(currentCashFlow.contributions.total + currentCashFlow.dividends.total + Math.max(0, currentCashFlow.interest.total))}
                      </p>
                      <p className="text-[10px] text-emerald-500/70">deposits + dividends + interest</p>
                    </div>

                    {/* Total Money Out */}
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium uppercase">Total Out</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-red-700 dark:text-red-300">
                        {formatCompactCurrency(currentCashFlow.withdrawals.total + currentCashFlow.fees.total)}
                      </p>
                      <p className="text-[10px] text-red-500/70">withdrawals + fees</p>
                    </div>

                    {/* Net Cash Flow */}
                    {(() => {
                      const netFlow = currentCashFlow.netCashFlow;
                      const isPositive = netFlow >= 0;
                      return (
                        <div className={cn(
                          "rounded-lg p-3 border col-span-2",
                          isPositive
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                        )}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className={cn("h-3.5 w-3.5", isPositive ? "text-emerald-500" : "text-red-500 rotate-180")} />
                            <span className={cn("text-[10px] font-medium uppercase", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                              Net Cash Flow
                            </span>
                          </div>
                          <p className={cn("text-lg sm:text-xl font-bold", isPositive ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                            {formatSignedCurrency(netFlow, true)}
                          </p>
                          <p className={cn("text-[10px]", isPositive ? "text-emerald-500/70" : "text-red-500/70")}>
                            {isPositive ? "net inflow to account" : "net outflow from account"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* No Cash Flow Data State */}
                {currentCashFlow.contributions.count === 0 &&
                 currentCashFlow.withdrawals.count === 0 &&
                 currentCashFlow.dividends.count === 0 &&
                 currentCashFlow.interest.count === 0 &&
                 currentCashFlow.fees.count === 0 &&
                 currentCashFlow.transfers.count === 0 && (
                  <div className="text-center py-6">
                    <Wallet className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No cash flow activity in this period</p>
                    <p className="text-xs text-zinc-400 mt-1">Try selecting a different timeframe</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
