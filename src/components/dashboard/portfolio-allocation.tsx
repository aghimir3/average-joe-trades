'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

/**
 * Portfolio Allocation Component
 *
 * Displays asset allocation breakdown for SnapTrade-connected accounts:
 * - Stocks vs Options vs Cash allocation
 * - Visual bar chart representation
 * - Allocation percentages and values
 * - Buying power and market exposure metrics
 *
 * Only renders when user has real-time data from connected brokerages.
 */

import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Wallet,
  PieChart,
  DollarSign,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';
import { cn, formatCompactCurrency, formatSignedCurrency } from '@/lib/utils';
import { HelpTooltip } from '@/components/ui/help-tooltip';

interface AllocationBreakdown {
  stocks: { value: number; count: number; percentage: number };
  options: { value: number; count: number; percentage: number };
  futures: { value: number; count: number; percentage: number };
  cash: { value: number; percentage: number };
}

interface RealtimePortfolioData {
  totalMarketValue: number;
  totalCash: number;
  totalBuyingPower: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPct: number;
  allocation: AllocationBreakdown;
  positionCount: number;
  hasRealTimeData: boolean;
}

async function fetchRealtimeData(accountId?: string | null): Promise<RealtimePortfolioData | null> {
  const params = new URLSearchParams();
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const url = `/api/dashboard/realtime${params.toString() ? `?${params}` : ''}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const result = await parseApiJson(response);
    return apiData(result);
  } catch {
    return null;
  }
}


interface PortfolioAllocationProps {
  accountId?: string | null;
}

export function PortfolioAllocation({ accountId }: PortfolioAllocationProps) {
  const { data } = useQuery({
    queryKey: ['realtimePortfolio', accountId],
    queryFn: () => fetchRealtimeData(accountId),
    staleTime: 60000,
  });

  // Don't render if no real-time data available
  if (!data?.hasRealTimeData) {
    return null;
  }

  const { allocation } = data;
  const totalValue = data.totalMarketValue + data.totalCash;
  const hasFutures = allocation.futures.count > 0 || allocation.futures.value > 0;

  // Only show if we have meaningful allocation data
  if (totalValue <= 0) {
    return null;
  }

  // Calculate invested vs cash ratio
  const investedPercentage = ((data.totalMarketValue / totalValue) * 100).toFixed(0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
            <PieChart className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Portfolio Allocation
              </h2>
              <HelpTooltip
                title="Portfolio Allocation"
                description="Shows how your portfolio is distributed across stocks, options, futures, and cash based on real-time brokerage data."
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatCompactCurrency(totalValue)} total | {data.positionCount} positions
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Allocation Bar */}
        <div>
          <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
            {allocation.stocks.percentage > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${allocation.stocks.percentage}%` }}
                title={`Stocks: ${allocation.stocks.percentage.toFixed(1)}%`}
              />
            )}
            {allocation.options.percentage > 0 && (
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${allocation.options.percentage}%` }}
                title={`Options: ${allocation.options.percentage.toFixed(1)}%`}
              />
            )}
            {allocation.futures.percentage > 0 && (
              <div
                className="h-full bg-amber-500 transition-all duration-500"
                style={{ width: `${allocation.futures.percentage}%` }}
                title={`Futures: ${allocation.futures.percentage.toFixed(1)}%`}
              />
            )}
            {allocation.cash.percentage > 0 && (
              <div
                className="h-full bg-zinc-400 dark:bg-zinc-500 transition-all duration-500"
                style={{ width: `${allocation.cash.percentage}%` }}
                title={`Cash: ${allocation.cash.percentage.toFixed(1)}%`}
              />
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Stocks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Options</span>
            </div>
            {hasFutures && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Futures</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Cash</span>
            </div>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className={cn(
          'grid grid-cols-2 gap-2',
          hasFutures ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
        )}>
          {/* Stocks */}
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                Stocks
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {allocation.stocks.percentage.toFixed(0)}%
            </p>
            <p className="text-[9px] sm:text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
              {formatCompactCurrency(allocation.stocks.value)}
            </p>
          </div>

          {/* Options */}
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center gap-1 mb-1">
              <Zap className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                Options
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400">
              {allocation.options.percentage.toFixed(0)}%
            </p>
            <p className="text-[9px] sm:text-[10px] text-blue-600/70 dark:text-blue-400/70">
              {formatCompactCurrency(allocation.options.value)}
            </p>
          </div>

          {hasFutures && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-1 mb-1">
                <BarChart3 className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  Futures
                </span>
              </div>
              <p className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">
                {allocation.futures.percentage.toFixed(0)}%
              </p>
              <p className="text-[9px] sm:text-[10px] text-amber-600/70 dark:text-amber-400/70">
                {formatCompactCurrency(allocation.futures.value)}
              </p>
            </div>
          )}

          {/* Cash */}
          <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <div className="flex items-center gap-1 mb-1">
              <Wallet className="h-3 w-3 text-zinc-600 dark:text-zinc-400" />
              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                Cash
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-zinc-700 dark:text-zinc-300">
              {allocation.cash.percentage.toFixed(0)}%
            </p>
            <p className="text-[9px] sm:text-[10px] text-zinc-500">
              {formatCompactCurrency(allocation.cash.value)}
            </p>
          </div>
        </div>

        {/* Unrealized P&L Banner */}
        <div className={cn(
          "p-3 rounded-xl",
          data.totalUnrealizedPnL >= 0
            ? "bg-emerald-50 dark:bg-emerald-900/20"
            : "bg-red-50 dark:bg-red-900/20"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {data.totalUnrealizedPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Unrealized P&L
              </span>
            </div>
            <div className="text-right">
              <p className={cn(
                "text-lg font-bold tabular-nums",
                data.totalUnrealizedPnL >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}>
                {formatSignedCurrency(data.totalUnrealizedPnL, true)}
              </p>
              <p className={cn(
                "text-[10px] font-medium tabular-nums",
                data.totalUnrealizedPnL >= 0
                  ? "text-emerald-600/70 dark:text-emerald-400/70"
                  : "text-red-600/70 dark:text-red-400/70"
              )}>
                {data.totalUnrealizedPnLPct >= 0 ? '+' : ''}{data.totalUnrealizedPnLPct.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Additional Metrics - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Buying Power */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
              <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Buying Power</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {formatCompactCurrency(data.totalBuyingPower)}
              </p>
            </div>
          </div>

          {/* Market Value */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Market Value</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {formatCompactCurrency(data.totalMarketValue)}
              </p>
            </div>
          </div>

          {/* Market Exposure */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className={cn(
              "p-1.5 rounded-lg",
              Number(investedPercentage) > 80
                ? "bg-amber-100 dark:bg-amber-900/30"
                : "bg-violet-100 dark:bg-violet-900/30"
            )}>
              <ShieldCheck className={cn(
                "h-3.5 w-3.5",
                Number(investedPercentage) > 80
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-violet-600 dark:text-violet-400"
              )} />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Invested</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {investedPercentage}%
              </p>
            </div>
          </div>

          {/* Cash Available */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700">
              <Wallet className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Cash</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {formatCompactCurrency(data.totalCash)}
              </p>
            </div>
          </div>
        </div>

        {/* Position counts footer */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400 dark:text-zinc-500 pt-1">
          <span>{allocation.stocks.count} stock positions</span>
          <span>|</span>
          <span>{allocation.options.count} option contracts</span>
          {hasFutures && (
            <>
              <span>|</span>
              <span>{allocation.futures.count} futures contracts</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}




