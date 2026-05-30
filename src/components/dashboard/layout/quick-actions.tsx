/**
 * Quick Actions
 * Quick trade action buttons for the dashboard header
 */

'use client';

import Link from 'next/link';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
  RefreshCw,
  Upload,
  Timer,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface QuickActionsProps {
  isSnapTradeAccount: boolean;
  isAccountSyncing: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function QuickActions({
  isSnapTradeAccount,
  isAccountSyncing,
  isLoading,
  onRefresh,
}: QuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* Trade Buttons */}
      <Link
        href="/trade/new/stock"
        className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-medium border border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:active:bg-zinc-600 transition-colors"
      >
        <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
        <span>Stock</span>
      </Link>
      <Link
        href="/trade/new/option/long_call"
        className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-medium border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 active:bg-emerald-300 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 dark:active:bg-emerald-900/70 transition-colors"
      >
        <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4" />
        <span>Call</span>
      </Link>
      <Link
        href="/trade/new/option/long_put"
        className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-medium border border-red-300 bg-red-100 text-red-700 hover:bg-red-200 active:bg-red-300 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:active:bg-red-900/70 transition-colors"
      >
        <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4" />
        <span>Put</span>
      </Link>
      <Link
        href="/trade/new/option/covered_call"
        className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-medium border border-blue-300 bg-blue-100 text-blue-700 hover:bg-blue-200 active:bg-blue-300 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 dark:active:bg-blue-900/70 transition-colors"
      >
        <Activity className="h-3 w-3 sm:h-4 sm:w-4" />
        <span className="sm:hidden">CC</span>
        <span className="hidden sm:inline">Covered Call</span>
      </Link>
      <Link
        href="/trade/new/option/cash_secured_put"
        className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-medium border border-purple-300 bg-purple-100 text-purple-700 hover:bg-purple-200 active:bg-purple-300 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 dark:active:bg-purple-900/70 transition-colors"
      >
        <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
        <span className="sm:hidden">CSP</span>
        <span className="hidden sm:inline">Cash Secured Put</span>
      </Link>

      {/* Right-aligned actions */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Sync Data Link - directs users to import page for syncing */}
        {isSnapTradeAccount && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/import"
                  className={cn(
                    'inline-flex items-center justify-center h-7 sm:h-8 px-2.5 sm:px-3 rounded-full transition-colors shrink-0 gap-1.5',
                    isAccountSyncing
                      ? 'bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700'
                      : 'bg-zinc-100 text-zinc-700 border border-zinc-300 hover:bg-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700'
                  )}
                >
                  {isAccountSyncing ? (
                    <Timer className="h-3 w-3 sm:h-4 sm:w-4 animate-pulse" />
                  ) : (
                    <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="text-xs font-medium hidden sm:inline">
                    {isAccountSyncing ? 'Syncing...' : 'Import'}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">
                  {isAccountSyncing ? 'Broker sync in progress' : 'Sync more transactions'}
                </p>
                {isAccountSyncing ? (
                  <p className="text-xs text-amber-400 mt-1">
                    SnapTrade is fetching data from your broker. Visit Import page to check status.
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 mt-1">
                    Go to Import page to sync additional transactions from your brokerage
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Refresh Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:active:bg-zinc-600 transition-colors disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh dashboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
