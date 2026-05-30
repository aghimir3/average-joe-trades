'use client';

/**
 * Portfolio Summary Component
 *
 * Compact summary card showing open positions overview.
 * Links to the full /positions page for detailed management.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  TrendingUp,
  Zap,
  AlertTriangle,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { formatCompactCurrency } from '@/lib/utils';

interface StockPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  firstEntryDate: string;
}

interface OptionPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
}

interface FuturePosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  firstEntryDate: string;
}

interface PortfolioSummary {
  stockCount: number;
  optionCount: number;
  futureCount: number;
  stockCostBasis: number;
  optionCostBasis: number;
  futureCostBasis: number;
  totalCostBasis: number;
}

interface PortfolioSummaryCardProps {
  stocks: StockPosition[];
  options: OptionPosition[];
  futures: FuturePosition[];
  summary: PortfolioSummary;
}


function getDaysToExpiration(expiration: string | null): number | null {
  if (!expiration) return null;
  const expDate = new Date(expiration);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function PortfolioSummaryCard({ stocks, options, futures, summary }: PortfolioSummaryCardProps) {
  const hasPositions = stocks.length > 0 || options.length > 0 || futures.length > 0;

  // Count options expiring soon (within 2 weeks)
  const optionsExpiringSoon = options.filter(opt => {
    const days = getDaysToExpiration(opt.expiration);
    return days !== null && days <= 14;
  }).length;

  // Calculate additional metrics
  const metrics = useMemo(() => {
    // Unique symbols
    const uniqueSymbols = new Set([
      ...stocks.map(s => s.symbol),
      ...options.map(o => o.symbol),
      ...futures.map(f => f.symbol),
    ]).size;

    // Calls vs Puts count
    const callCount = options.filter(o => o.optionType === 'call').length;
    const putCount = options.filter(o => o.optionType === 'put').length;

    return { uniqueSymbols, callCount, putCount };
  }, [stocks, options, futures]);

  // Get top symbols (by cost basis)
    const topStocks = [...stocks]
      .sort((a, b) => b.costBasis - a.costBasis)
      .slice(0, 3);

  // Get unique option symbols
  const uniqueOptionSymbols = [...new Set(options.map(o => o.symbol))];

  if (!hasPositions) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
              <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Open Positions
              </h2>
              <p className="text-sm text-zinc-500">Your current holdings</p>
            </div>
            <HelpTooltip
              title="Open Positions"
              description="Shows a summary of your open stock and option positions. Click to view and manage all positions."
            />
          </div>
        </div>
        <div className="flex items-center justify-center py-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <div className="text-center">
            <p className="text-zinc-400 dark:text-zinc-500">
              No open positions
            </p>
            <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">
              Add trades to build your portfolio
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
            <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Open Positions
              </h2>
              <HelpTooltip
                title="Open Positions"
                description="Shows a summary of your open stock and option positions. Click to view and manage all positions."
              />
            </div>
            <p className="text-sm text-zinc-500">
              {metrics.uniqueSymbols} symbol{metrics.uniqueSymbols !== 1 ? 's' : ''} · {formatCompactCurrency(summary.totalCostBasis)} invested
            </p>
          </div>
        </div>
        <Link
          href="/positions"
          className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
        >
          View All
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Stocks</span>
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.stockCount}
          </p>
          <p className="text-xs text-emerald-700/60 dark:text-emerald-400/60 mt-0.5">
            {formatCompactCurrency(summary.stockCostBasis)}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Options</span>
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {summary.optionCount}
          </p>
          <p className="text-xs text-blue-700/60 dark:text-blue-400/60 mt-0.5">
            {formatCompactCurrency(summary.optionCostBasis)}
          </p>
        </div>

        {summary.futureCount > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Futures</span>
            </div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {summary.futureCount}
            </p>
            <p className="text-xs text-amber-700/60 dark:text-amber-400/60 mt-0.5">
              {formatCompactCurrency(summary.futureCostBasis)}
            </p>
          </div>
        )}

        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Total</span>
          </div>
          <p className="text-xl font-bold text-zinc-700 dark:text-zinc-300">
            {formatCompactCurrency(summary.totalCostBasis)}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            invested
          </p>
        </div>

        {optionsExpiringSoon > 0 ? (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Expiring</span>
            </div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {optionsExpiringSoon}
            </p>
            <p className="text-xs text-amber-700/60 dark:text-amber-400/60 mt-0.5">
              within 2 weeks
            </p>
          </div>
        ) : options.length > 0 ? (
          <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">C / P</span>
            </div>
            <p className="text-xl font-bold">
              <span className="text-green-600 dark:text-green-400">{metrics.callCount}</span>
              <span className="text-zinc-400 mx-1">/</span>
              <span className="text-red-600 dark:text-red-400">{metrics.putCount}</span>
            </p>
            <p className="text-xs text-purple-700/60 dark:text-purple-400/60 mt-0.5">
              calls / puts
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Symbols</span>
            </div>
            <p className="text-xl font-bold text-zinc-700 dark:text-zinc-300">
              {metrics.uniqueSymbols}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              unique tickers
            </p>
          </div>
        )}
      </div>

      {/* Quick Preview */}
      <div className="space-y-2">
        {/* Top Stock Positions */}
        {topStocks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {topStocks.map((stock) => (
              <div
                key={stock.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
              >
                <TrendingUp className="h-3 w-3" />
                <span className="text-sm font-medium">{stock.symbol}</span>
                <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                  {stock.quantity} shares
                </span>
              </div>
            ))}
            {stocks.length > 3 && (
              <span className="inline-flex items-center px-2 py-1.5 text-xs text-zinc-500">
                +{stocks.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Top Option Symbols */}
        {uniqueOptionSymbols.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {uniqueOptionSymbols.slice(0, 4).map((symbol) => {
              const symbolOptions = options.filter(o => o.symbol === symbol);
              return (
                <div
                  key={symbol}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                >
                  <Zap className="h-3 w-3" />
                  <span className="text-sm font-medium">{symbol}</span>
                  <span className="text-xs text-blue-600/70 dark:text-blue-400/70">
                    {symbolOptions.length} contract{symbolOptions.length !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
            {uniqueOptionSymbols.length > 4 && (
              <span className="inline-flex items-center px-2 py-1.5 text-xs text-zinc-500">
                +{uniqueOptionSymbols.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* View All Link - Mobile */}
      <Link
        href="/positions"
        className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-medium text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors sm:hidden"
      >
        Manage Positions
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
