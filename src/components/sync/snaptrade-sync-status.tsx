/**
 * SnapTrade Sync Status Component
 *
 * Provides clear, intuitive feedback during the SnapTrade sync process.
 * Shows broker-specific wait times, progress steps, and actionable guidance.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  FileSpreadsheet,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getBrokerSyncInfo,
  getSyncStatusDisplay,
  SYNC_PROGRESS_STEPS,
  MULTI_ACCOUNT_MESSAGES,
  type SnapTradeSyncStatus,
} from '@/lib/constants/snaptrade-sync';

// ============================================================================
// Types
// ============================================================================

interface SnapTradeAccount {
  id: string;
  name: string;
  number: string;
  institutionName: string;
  isSynced: boolean;
  transactionCount: number;
  brokerageAccountId?: string | null;
  snaptradeSync?: {
    isInitialSyncComplete: boolean;
    firstTransactionDate: string | null;
    lastSuccessfulSync: string | null;
    status: SnapTradeSyncStatus;
  };
}

interface SyncStatusCardProps {
  /** Connected SnapTrade accounts */
  accounts: SnapTradeAccount[];
  /** Broker key (e.g., 'robinhood', 'schwab') */
  broker: string;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Current step index during sync (0-4) */
  syncStep?: number;
  /** Callback when user clicks refresh */
  onRefresh?: () => void;
  /** Whether refresh is loading */
  isRefreshing?: boolean;
  /** Callback when user clicks sync */
  onSync?: (accountIds: string[]) => void;
  /** Show multi-account guidance */
  showMultiAccountGuide?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

interface AccountSyncStatusProps {
  account: SnapTradeAccount;
  broker: string;
  onSync?: () => void;
  isSyncing?: boolean;
}

// ============================================================================
// Account Sync Status Badge
// ============================================================================

function AccountSyncStatusBadge({ account, broker }: { account: SnapTradeAccount; broker: string }) {
  const status = account.snaptradeSync?.status || 'syncing';
  const display = getSyncStatusDisplay(status, broker);

  const colorClasses = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const icons = {
    check: <CheckCircle2 className="h-3 w-3" />,
    clock: <Clock className="h-3 w-3" />,
    loader: <Loader2 className="h-3 w-3 animate-spin" />,
    alert: <AlertCircle className="h-3 w-3" />,
  };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', colorClasses[display.color])}>
      {icons[display.icon]}
      {display.label}
    </span>
  );
}

// ============================================================================
// Account Row Component
// ============================================================================

function AccountRow({ account, broker, onSync, isSyncing }: AccountSyncStatusProps) {
  const status = account.snaptradeSync?.status || 'syncing';
  const brokerInfo = getBrokerSyncInfo(broker);

  const isReady = status === 'ready';
  const isFetching = status === 'syncing';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          isReady ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
        )}>
          <Zap className={cn(
            'h-5 w-5',
            isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {account.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <AccountSyncStatusBadge account={account} broker={broker} />
            {account.transactionCount > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {account.transactionCount} transactions
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isReady && onSync && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isSyncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync
          </button>
        )}
        {isFetching && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ~{brokerInfo.typicalSyncTime}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sync Progress Steps Component
// ============================================================================

function SyncProgressSteps({ currentStep }: { currentStep: number }) {
  return (
    <div className="space-y-2">
      {SYNC_PROGRESS_STEPS.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        const isPending = index > currentStep;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg transition-colors',
              isCurrent && 'bg-blue-50 dark:bg-blue-900/20'
            )}
          >
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
              isComplete && 'bg-emerald-500',
              isCurrent && 'bg-blue-500',
              isPending && 'bg-zinc-200 dark:bg-zinc-700'
            )}>
              {isComplete ? (
                <CheckCircle2 className="h-4 w-4 text-white" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : (
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(
                'text-sm font-medium',
                isComplete && 'text-emerald-600 dark:text-emerald-400',
                isCurrent && 'text-blue-600 dark:text-blue-400',
                isPending && 'text-zinc-400 dark:text-zinc-500'
              )}>
                {step.label}
              </p>
              {isCurrent && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Multi-Account Guidance Component
// ============================================================================

function MultiAccountGuide({ broker, accountCount }: { broker: string; accountCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const brokerInfo = getBrokerSyncInfo(broker);
  const messages = MULTI_ACCOUNT_MESSAGES;

  if (accountCount <= 1 && !brokerInfo.multiAccountTip) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {accountCount > 1 ? messages.sameLogin.title : messages.addAnother.title}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-blue-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-500" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {accountCount > 1 ? messages.sameLogin.description : messages.addAnother.description}
          </p>
          {brokerInfo.multiAccountTip && (
            <div className="flex items-start gap-2 p-2 rounded bg-white/50 dark:bg-zinc-800/50">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {brokerInfo.multiAccountTip}
              </p>
            </div>
          )}
          <p className="text-xs text-blue-500 dark:text-blue-500 italic">
            Tip: {accountCount > 1 ? messages.sameLogin.tip : messages.addAnother.tip}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Broker Waiting Tips Component
// ============================================================================

function BrokerWaitingTips({ broker }: { broker: string }) {
  const brokerInfo = getBrokerSyncInfo(broker);

  if (!brokerInfo.hasDelayedSync && brokerInfo.waitingTips.length <= 1) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
          {brokerInfo.hasDelayedSync ? 'Extended Wait Time' : 'While You Wait'}
        </span>
      </div>
      <p className="text-sm text-amber-600 dark:text-amber-400">
        {brokerInfo.syncDescription}
      </p>
      <ul className="space-y-1">
        {brokerInfo.waitingTips.map((tip, index) => (
          <li key={index} className="flex items-start gap-2 text-xs text-amber-600/80 dark:text-amber-400/80">
            <CheckCircle2 className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      {brokerInfo.hasDelayedSync && (
        <div className="flex items-center gap-2 pt-2 border-t border-amber-200 dark:border-amber-800">
          <Link
            href="/import"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
          >
            <FileSpreadsheet className="h-3 w-3" />
            Import CSV Instead
          </Link>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Sync Status Card Component
// ============================================================================

export function SnapTradeSyncStatusCard({
  accounts,
  broker,
  isSyncing,
  syncStep = 0,
  onRefresh,
  isRefreshing,
  onSync,
  showMultiAccountGuide = true,
  compact = false,
}: SyncStatusCardProps) {
  const [pollCount, setPollCount] = useState(0);
  const brokerInfo = getBrokerSyncInfo(broker);

  // Count accounts by status
  const readyAccounts = accounts.filter(a => a.snaptradeSync?.status === 'ready');
  const syncingAccounts = accounts.filter(a => a.snaptradeSync?.status === 'syncing');
  const limitedAccounts = accounts.filter(a => a.snaptradeSync?.status === 'limited');

  const allReady = readyAccounts.length === accounts.length && accounts.length > 0;
  const anyFetching = syncingAccounts.length > 0;
  const anyLimited = limitedAccounts.length > 0;

  // Auto-poll when accounts are syncing
  useEffect(() => {
    if (anyFetching && onRefresh && !isRefreshing) {
      const pollInterval = brokerInfo.hasDelayedSync ? 30000 : 10000; // 30s for IBKR, 10s for others
      const timer = setTimeout(() => {
        onRefresh();
        setPollCount(c => c + 1);
      }, pollInterval);
      return () => clearTimeout(timer);
    }
  }, [anyFetching, onRefresh, isRefreshing, pollCount, brokerInfo.hasDelayedSync]);

  // Active sync progress view
  if (isSyncing) {
    return (
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
            <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-800 dark:text-blue-200">
              Syncing {brokerInfo.name} Transactions
            </h3>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              This may take a few moments...
            </p>
          </div>
        </div>
        <SyncProgressSteps currentStep={syncStep} />
      </div>
    );
  }

  // Compact mode - just show status badges
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {allReady && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} ready
          </span>
        )}
        {anyFetching && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Fetching from broker...
          </span>
        )}
        {anyLimited && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <AlertCircle className="h-3 w-3" />
            {limitedAccounts.length} limited
          </span>
        )}
      </div>
    );
  }

  // Full card view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {brokerInfo.name} Accounts
          </h3>
          {isRefreshing && (
            <Loader2 className="h-4 w-4 text-zinc-400 animate-spin" />
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            Refresh
          </button>
        )}
      </div>

      {/* Account List */}
      <div className="space-y-2">
        {accounts.map(account => (
          <AccountRow
            key={account.id}
            account={account}
            broker={broker}
            onSync={onSync ? () => onSync([account.id]) : undefined}
            isSyncing={isSyncing}
          />
        ))}
      </div>

      {/* Waiting Tips (shown when any accounts are fetching) */}
      {anyFetching && <BrokerWaitingTips broker={broker} />}

      {/* Multi-Account Guide */}
      {showMultiAccountGuide && (
        <MultiAccountGuide broker={broker} accountCount={accounts.length} />
      )}

      {/* Sync All Button (shown when multiple accounts are ready) */}
      {readyAccounts.length > 1 && onSync && (
        <button
          onClick={() => onSync(readyAccounts.map(a => a.id))}
          disabled={isSyncing}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Sync All {readyAccounts.length} Accounts
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Export individual components for flexibility
// ============================================================================

export { AccountSyncStatusBadge, SyncProgressSteps, MultiAccountGuide, BrokerWaitingTips };
