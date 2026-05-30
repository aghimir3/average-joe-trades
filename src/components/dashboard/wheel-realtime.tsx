'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Wheel Realtime Component
 *
 * Shows unrealized P&L for open option positions from SnapTrade real-time data.
 * Clean, modern card design with:
 * - Call/Put type indicator
 * - Strike and expiration info
 * - Prominent P&L display
 *
 * Uses horizontal scrolling 3-row grid for space-efficient browsing.
 * Only renders when user has real-time data and open option positions.
 */

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, formatSignedCurrency, formatPercent } from '@/lib/utils';
import { HelpTooltip } from '@/components/ui/help-tooltip';

interface PositionHealth {
  symbol: string;
  positionType: 'stock' | 'option' | 'future';
  quantity: number;
  marketPrice: number | null;
  marketValue: number | null;
  avgCostBasis: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  optionType?: string | null;
  strike?: number | null;
  expiration?: string | null;
}

interface RealtimePortfolioData {
  positions: PositionHealth[];
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

// Use formatSignedCurrency(value, true) directly for P&L displays

function formatExpiration(expiration: string): string {
  const date = new Date(expiration);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysToExpiration(expiration: string): number {
  const expDate = new Date(expiration);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

interface WheelRealtimeProps {
  accountId?: string | null;
}

export function WheelRealtime({ accountId }: WheelRealtimeProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['realtimePortfolio', accountId],
    queryFn: () => fetchRealtimeData(accountId),
    staleTime: 60000,
  });

  // Don't render if no real-time data available
  if (!data?.hasRealTimeData) {
    return null;
  }

  // Filter for option positions
  const optionPositions = data.positions.filter(p => p.positionType === 'option');

  // Don't render if no option positions
  if (optionPositions.length === 0) {
    return null;
  }

  // Sort by absolute unrealized P&L (largest movers first)
  const sortedPositions = [...optionPositions].sort((a, b) => {
    const aVal = Math.abs(a.unrealizedPnL ?? 0);
    const bVal = Math.abs(b.unrealizedPnL ?? 0);
    return bVal - aVal;
  });

  // Separate calls and puts
  const calls = sortedPositions.filter(p => p.optionType === 'call');
  const puts = sortedPositions.filter(p => p.optionType === 'put');

  // Calculate totals
  const totalUnrealizedPnL = sortedPositions.reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0);
  const callsUnrealizedPnL = calls.reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0);
  const putsUnrealizedPnL = puts.reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0);

  // Count expiring soon (within 7 days)
  const expiringSoon = sortedPositions.filter(p => {
    if (!p.expiration) return false;
    const days = getDaysToExpiration(p.expiration);
    return days >= 0 && days <= 7;
  }).length;

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -280, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 280, behavior: 'smooth' });
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 shadow-sm">
              <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Open Options
                </h2>
                <HelpTooltip
                  title="Open Options"
                  description="Real-time unrealized P&L for your open option positions. Swipe or use arrows to browse all positions."
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {calls.length} call{calls.length !== 1 ? 's' : ''} · {puts.length} put{puts.length !== 1 ? 's' : ''}
                {expiringSoon > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2">
                    · {expiringSoon} expiring soon
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Scroll buttons */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={scrollLeft}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={scrollRight}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="grid grid-cols-3 gap-2">
          {/* Total Unrealized */}
          <div className={cn(
            "p-2.5 rounded-xl",
            totalUnrealizedPnL >= 0
              ? "bg-rh-green/10"
              : "bg-rh-red/10"
          )}>
            <div className="flex items-center gap-1 mb-0.5">
              <DollarSign className={cn(
                "h-3 w-3",
                totalUnrealizedPnL >= 0 ? "text-rh-green" : "text-rh-red"
              )} />
              <span className={cn(
                "text-[10px] font-medium",
                totalUnrealizedPnL >= 0 ? "text-rh-green" : "text-rh-red"
              )}>Total</span>
            </div>
            <p className={cn(
              "text-base sm:text-lg font-bold",
              totalUnrealizedPnL >= 0 ? "text-rh-green" : "text-rh-red"
            )}>
              {formatSignedCurrency(totalUnrealizedPnL)}
            </p>
          </div>

          {/* Calls */}
          <div className={cn(
            "p-2.5 rounded-xl",
            callsUnrealizedPnL >= 0
              ? "bg-rh-green/10"
              : "bg-rh-red/10"
          )}>
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                Calls
              </span>
            </div>
            <p className={cn(
              "text-base sm:text-lg font-bold",
              callsUnrealizedPnL >= 0 ? "text-rh-green" : "text-rh-red"
            )}>
              {formatSignedCurrency(callsUnrealizedPnL)}
            </p>
          </div>

          {/* Puts */}
          <div className={cn(
            "p-2.5 rounded-xl",
            putsUnrealizedPnL >= 0
              ? "bg-rh-green/10"
              : "bg-rh-red/10"
          )}>
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="h-3 w-3 text-purple-600 dark:text-purple-400" />
              <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300">
                Puts
              </span>
            </div>
            <p className={cn(
              "text-base sm:text-lg font-bold",
              putsUnrealizedPnL >= 0 ? "text-rh-green" : "text-rh-red"
            )}>
              {formatSignedCurrency(putsUnrealizedPnL)}
            </p>
          </div>
        </div>
      </div>

      {/* 3-Row Grid with hidden scrollbar */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto p-4 sm:p-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div
            className="grid grid-flow-col auto-cols-max gap-2.5"
            style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}
          >
            {sortedPositions.map((position, idx) => {
              const isPositive = (position.unrealizedPnL ?? 0) >= 0;
              const daysToExp = position.expiration ? getDaysToExpiration(position.expiration) : null;
              const isExpiringSoon = daysToExp !== null && daysToExp >= 0 && daysToExp <= 7;
              const isCall = position.optionType === 'call';
              const pnlValue = position.unrealizedPnL ?? 0;
              const pnlPct = position.unrealizedPnLPct ?? 0;

              return (
                <div
                  key={`${position.symbol}-${position.optionType}-${position.strike}-${position.expiration}-${idx}`}
                  className="w-40 sm:w-44 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {/* Top Row: Symbol with Call/Put badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        isCall
                          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400"
                      )}>
                        {isCall ? 'C' : 'P'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {position.symbol}
                        </p>
                      </div>
                    </div>
                    {isExpiringSoon && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 shrink-0">
                        {daysToExp}d
                      </span>
                    )}
                  </div>

                  {/* Details Row */}
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2 truncate">
                    {position.quantity} ct · ${position.strike}
                    {position.expiration && ` · ${formatExpiration(position.expiration)}`}
                  </p>

                  {/* P&L Display */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn(
                      "text-lg font-bold tabular-nums",
                      isPositive ? "text-rh-green" : "text-rh-red"
                    )}>
                      {formatSignedCurrency(pnlValue)}
                    </span>
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      isPositive ? "text-rh-green/80" : "text-rh-red/80"
                    )}>
                      {formatPercent(pnlPct)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scroll hint gradients */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-white dark:from-zinc-900 to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-white dark:from-zinc-900 to-transparent pointer-events-none" />
      </div>

      {/* Mobile swipe hint */}
      <div className="sm:hidden px-4 pb-3 text-center">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          ← Swipe to see all {sortedPositions.length} options →
        </p>
      </div>
    </div>
  );
}
