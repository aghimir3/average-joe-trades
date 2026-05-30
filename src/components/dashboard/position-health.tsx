'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

/**
 * Position Health Component
 *
 * Displays unrealized P&L and performance for each position
 * from SnapTrade real-time data. Clean, modern card design with:
 * - Symbol avatar with first letter
 * - Position details (shares/contracts @ price)
 * - Prominent P&L display with percentage
 *
 * Uses horizontal scrolling 3-row grid for space-efficient browsing.
 * Only renders when user has real-time data from connected brokerages.
 */

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  Zap,
  ChevronLeft,
  ChevronRight,
  Activity,
  BarChart3,
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
  priceChangeAbs: number | null;
  priceChangePct: number | null;
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

interface PositionHealthListProps {
  accountId?: string | null;
}

export function PositionHealthList({ accountId }: PositionHealthListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['realtimePortfolio', accountId],
    queryFn: () => fetchRealtimeData(accountId),
    staleTime: 60000,
  });

  // Don't render if no real-time data available
  if (!data?.hasRealTimeData || data.positions.length === 0) {
    return null;
  }

  // Sort positions by absolute unrealized P&L (largest movers first)
  const sortedPositions = [...data.positions].sort((a, b) => {
    const aVal = Math.abs(a.unrealizedPnL ?? 0);
    const bVal = Math.abs(b.unrealizedPnL ?? 0);
    return bVal - aVal;
  });

  // Calculate summary
  const winners = sortedPositions.filter(p => (p.unrealizedPnL ?? 0) > 0).length;
  const losers = sortedPositions.filter(p => (p.unrealizedPnL ?? 0) < 0).length;

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
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-900/30">
              <Activity className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Position Health
                </h2>
                <HelpTooltip
                  title="Position Health"
                  description="Shows unrealized P&L for each of your positions based on current market prices. Swipe or use arrows to browse all positions."
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="text-emerald-600 dark:text-emerald-400">{winners} winning</span>
                {' | '}
                <span className="text-red-600 dark:text-red-400">{losers} losing</span>
                {' | '}
                <span>{sortedPositions.length} total</span>
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
              const isOption = position.positionType === 'option';
              const isFuture = position.positionType === 'future';
              const pnlValue = position.unrealizedPnL ?? 0;
              const pnlPct = position.unrealizedPnLPct ?? 0;
              const quantityLabel = isOption || isFuture ? 'ct' : 'sh';

              return (
                <div
                  key={`${position.symbol}-${position.optionType}-${position.strike}-${position.expiration}-${idx}`}
                  className="w-40 sm:w-44 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {/* Top Row: Symbol with icon */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      isOption
                        ? "bg-blue-100 dark:bg-blue-900/50"
                        : isFuture
                          ? "bg-amber-100 dark:bg-amber-900/50"
                          : "bg-violet-100 dark:bg-violet-900/50"
                    )}>
                      {isOption ? (
                        <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      ) : isFuture ? (
                        <BarChart3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <TrendingUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {position.symbol}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        {position.quantity} {quantityLabel} @ ${position.marketPrice?.toFixed(2) ?? '-'}
                      </p>
                    </div>
                  </div>

                  {/* P&L Display */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn(
                      "text-lg font-bold tabular-nums",
                      isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    )}>
                      {formatSignedCurrency(pnlValue)}
                    </span>
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      isPositive
                        ? "text-emerald-500/80 dark:text-emerald-400/70"
                        : "text-red-500/80 dark:text-red-400/70"
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
          {`<- Swipe to see all ${sortedPositions.length} positions ->`}
        </p>
      </div>
    </div>
  );
}




