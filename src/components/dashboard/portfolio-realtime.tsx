'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Portfolio Realtime Component
 *
 * Displays real-time portfolio metrics for SnapTrade-connected accounts:
 * - Total P&L (Realized + Unrealized)
 * - Today's portfolio change
 * - Unrealized P&L
 *
 * Only renders when user has real-time data from connected brokerages.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn, formatSignedCurrency, formatPercent } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  realizedPnL: number;
  totalPnL: number;
  todaysChange: number;
  todaysChangePct: number;
  allocation: AllocationBreakdown;
  lastSyncAt: string | null;
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

// Use formatSignedCurrency(value, true) directly for compact P&L displays

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface PortfolioRealtimeProps {
  accountId?: string | null;
}

async function syncPositions(accountId?: string | null): Promise<boolean> {
  try {
    const response = await fetch('/api/sync/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, force: true }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function PortfolioRealtime({ accountId }: PortfolioRealtimeProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['realtimePortfolio', accountId],
    queryFn: () => fetchRealtimeData(accountId),
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });

  const handleSyncPositions = async () => {
    setIsSyncing(true);
    try {
      const success = await syncPositions(accountId);
      if (success) {
        // Refetch all related queries
        await Promise.all([
          refetch(),
          queryClient.invalidateQueries({ queryKey: ['dashboardPositions'] }),
          queryClient.invalidateQueries({ queryKey: ['positions'] }),
        ]);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't render if no real-time data available
  if (!data?.hasRealTimeData) {
    return null;
  }

  const totalPnLPositive = data.totalPnL >= 0;
  const unrealizedPositive = data.totalUnrealizedPnL >= 0;
  const todaysChangePositive = data.todaysChange >= 0;

  // Check if data is stale (more than 30 minutes old)
  const isStale = data.lastSyncAt
    ? (Date.now() - new Date(data.lastSyncAt).getTime()) > 30 * 60 * 1000
    : false;

  // Format cash display (handle negative/margin)
  const cashDisplay = data.totalCash < 0
    ? `${Math.abs(data.totalCash).toLocaleString('en-US', { maximumFractionDigits: 0 })} margin`
    : `${data.totalCash.toLocaleString('en-US', { maximumFractionDigits: 0 })} cash`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Compact Header Bar */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Clock className={cn("h-3.5 w-3.5", isStale && "text-amber-500")} />
          <span className={isStale ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
            {data.lastSyncAt ? `Updated ${formatRelativeTime(data.lastSyncAt)}` : 'Not synced'}
          </span>
          {isStale && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              STALE
            </span>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSyncPositions}
                disabled={isSyncing || isRefetching}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                  isSyncing
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50",
                  "disabled:opacity-50"
                )}
              >
                <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium">Refresh Positions</p>
              <p className="text-xs text-zinc-400 mt-1">
                Fetches the latest position data from your brokerage.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Main Stats Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total P&L (Realized + Unrealized) */}
          <div className={cn(
            "p-4 rounded-xl border",
            totalPnLPositive
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
          )}>
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className={cn(
                "h-4 w-4",
                totalPnLPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )} />
              <span className={cn(
                "text-xs font-medium",
                totalPnLPositive
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-red-700 dark:text-red-300"
              )}>Total P&L</span>
            </div>
            <p className={cn(
              "text-2xl font-bold",
              totalPnLPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}>
              {formatSignedCurrency(data.totalPnL, true)}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              Realized + Unrealized
            </p>
          </div>

          {/* Today's Change - Use red for losses */}
          <div className={cn(
            "p-4 rounded-xl border",
            todaysChangePositive
              ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
          )}>
            <div className="flex items-center gap-2 mb-1.5">
              {todaysChangePositive ? (
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span className={cn(
                "text-xs font-medium",
                todaysChangePositive
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-red-700 dark:text-red-300"
              )}>Today</span>
            </div>
            <p className={cn(
              "text-2xl font-bold",
              todaysChangePositive
                ? "text-blue-600 dark:text-blue-400"
                : "text-red-600 dark:text-red-400"
            )}>
              {formatSignedCurrency(data.todaysChange, true)}
            </p>
            <p className={cn(
              "text-xs font-medium mt-1",
              todaysChangePositive
                ? "text-blue-600/70 dark:text-blue-400/70"
                : "text-red-600/70 dark:text-red-400/70"
            )}>
              {formatPercent(data.todaysChangePct)}
            </p>
          </div>

          {/* Unrealized P&L - Use red for losses */}
          <div className={cn(
            "p-4 rounded-xl border",
            unrealizedPositive
              ? "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
          )}>
            <div className="flex items-center gap-2 mb-1.5">
              {unrealizedPositive ? (
                <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span className={cn(
                "text-xs font-medium",
                unrealizedPositive
                  ? "text-violet-700 dark:text-violet-300"
                  : "text-red-700 dark:text-red-300"
              )}>Unrealized</span>
            </div>
            <p className={cn(
              "text-2xl font-bold",
              unrealizedPositive
                ? "text-violet-600 dark:text-violet-400"
                : "text-red-600 dark:text-red-400"
            )}>
              {formatSignedCurrency(data.totalUnrealizedPnL, true)}
            </p>
            <p className={cn(
              "text-xs font-medium mt-1",
              unrealizedPositive
                ? "text-violet-600/70 dark:text-violet-400/70"
                : "text-red-600/70 dark:text-red-400/70"
            )}>
              {formatPercent(data.totalUnrealizedPnLPct)}
            </p>
          </div>

          {/* Portfolio Value */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Portfolio Value
              </span>
            </div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              ${data.totalMarketValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className={cn(
              "text-[10px] mt-1",
              data.totalCash < 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-500 dark:text-zinc-400"
            )}>
              {data.positionCount} position{data.positionCount !== 1 ? 's' : ''} · ${cashDisplay}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
