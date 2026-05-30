/**
 * Sync Banners
 * Dashboard sync status banners (daily sync, errors, transaction unavailable)
 */

'use client';

import Link from 'next/link';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Timer,
  RefreshCw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailySyncResult } from '../lib/dashboard-types';

// ============================================================================
// Types
// ============================================================================

interface DailySyncBannerProps {
  isLoading: boolean;
  result: DailySyncResult | null;
  error: string | null;
  onDismiss: () => void;
}

interface TransactionUnavailableBannerProps {
  onCheckStatus: () => void;
  isRefetching: boolean;
  onDismiss: () => void;
}

// ============================================================================
// Daily Sync Banner
// ============================================================================

export function DailySyncBanner({
  isLoading,
  result,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Errors handled by DailySyncErrorBanner
  error,
  onDismiss,
}: DailySyncBannerProps) {
  // Show while syncing or briefly after completion
  if (!isLoading && (!result?.syncTriggered || result.transactionsImported === undefined)) {
    return null;
  }

  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm">
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Syncing your accounts...</span>
        </>
      ) : result?.syncTriggered ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>
            Synced {result.accountsSynced} account{result.accountsSynced !== 1 ? 's' : ''}
            {result.transactionsImported !== undefined && result.transactionsImported > 0 && (
              <> · {result.transactionsImported} new transaction{result.transactionsImported !== 1 ? 's' : ''}</>
            )}
          </span>
        </>
      ) : null}
      <button
        onClick={onDismiss}
        className="ml-auto p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Daily Sync Error Banner
// ============================================================================

export function DailySyncErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>Daily sync failed: {error}</span>
      <button
        onClick={onDismiss}
        className="ml-auto p-1 rounded hover:bg-red-100 dark:hover:bg-red-800/50 transition-colors"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Transaction Unavailable Banner
// ============================================================================

export function TransactionUnavailableBanner({
  onCheckStatus,
  isRefetching,
  onDismiss,
}: TransactionUnavailableBannerProps) {
  return (
    <div className="relative flex flex-col gap-3 p-4 rounded-xl bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-200 dark:border-amber-800">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-amber-500 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        title="Dismiss this message"
      >
        <AlertCircle className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
          <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Transaction History Unavailable
          </h3>
          <p className="text-sm text-amber-700/80 dark:text-amber-300/80 mt-1">
            SnapTrade is still syncing transaction history from your brokerage. Some account types may have limited transaction data available.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span>Real-time positions available on the <Link href="/positions" className="underline hover:no-underline">Positions page</Link></span>
            </li>
            <li className="flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              <span>Dashboard P&L requires transaction history - you can import CSV files instead</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-11">
        <button
          onClick={onCheckStatus}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', isRefetching && 'animate-spin')} />
          Check Status
        </button>
        <Link
          href="/import"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
        >
          Import CSV
        </Link>
        <button
          onClick={onDismiss}
          className="text-xs text-amber-600/60 dark:text-amber-400/60 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
