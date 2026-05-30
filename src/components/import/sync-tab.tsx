'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Building2,
  Info,
  RefreshCw,
  Link2,
  Zap,
  Unlink,
  Timer,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { createChildLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BROKER_CONFIG, DATE_RANGE_OPTIONS } from './lib/constants';
import type {
  BrokerKey,
  DateRangePreset,
  SnapTradeAccount,
  SnapTradeStatus,
  SyncResult,
} from './lib/types';
import {
  connectSnapTrade,
  disconnectAccount,
  fetchSnapTradeStatus,
  fetchLoginNicknames,
  syncTransactions,
} from './lib/api';

const logger = createChildLogger({ module: 'sync-tab' });

interface SyncTabProps {
  selectedBroker: BrokerKey;
  brokerConfig: typeof BROKER_CONFIG[BrokerKey];
  onBack: () => void;
  onSwitchToFile: () => void;
}

export function SyncTab({ selectedBroker, brokerConfig, onBack, onSwitchToFile }: SyncTabProps) {
  const queryClient = useQueryClient();

  // State
  const [selectedSnaptradeAccounts, setSelectedSnaptradeAccounts] = useState<Set<string>>(new Set());
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [staleCleanupSummary, setStaleCleanupSummary] = useState<{
    deletedCount: number;
    totalCount: number;
    failures: string[];
    deregisterFromSnapTrade: boolean;
  } | null>(null);
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('everything');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Get effective date range based on preset or custom selection
  const getEffectiveDateRange = () => {
    if (dateRangePreset === 'custom') {
      return {
        startDate: customStartDate || null,
        endDate: customEndDate || null,
      };
    }
    const option = DATE_RANGE_OPTIONS.find(o => o.value === dateRangePreset);
    return option ? option.getRange() : { startDate: null, endDate: null };
  };

  // Queries
  const { data: snapTradeStatus, refetch: refetchSnapTradeStatus } = useQuery({
    queryKey: ['snaptrade-status'],
    queryFn: () => fetchSnapTradeStatus(),
    staleTime: 30000,
  });

  const { data: loginNicknames = {} } = useQuery({
    queryKey: ['login-nicknames'],
    queryFn: fetchLoginNicknames,
    staleTime: 60000,
  });

  // Mutations
  const connectMutation = useMutation({
    mutationFn: (broker?: string) => connectSnapTrade(broker),
    onSuccess: (redirectUrl) => {
      // Navigate in same window for full-screen experience (like onboarding)
      window.location.href = redirectUrl;
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Failed to connect brokerage');
    },
  });

  const syncMutation = useMutation({
    mutationFn: (options: { snaptradeAccountIds: string[]; refresh?: boolean; startDate?: string | null; endDate?: string | null }) =>
      syncTransactions(options),
    onSuccess: (data) => {
      logger.info({ stats: data.stats }, 'Sync completed');
      setSyncResult(data);
      refetchSnapTradeStatus();
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Sync failed');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: ({ brokerageAccountId, deregisterFromSnapTrade }: { brokerageAccountId: string; deregisterFromSnapTrade: boolean }) =>
      disconnectAccount(brokerageAccountId, deregisterFromSnapTrade),
    onSuccess: (data) => {
      logger.info({ deleted: data.deleted, snaptradeDeregistered: data.snaptradeDeregistered }, 'Account disconnected');
      refetchSnapTradeStatus();
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Disconnect failed');
    },
  });

  const unlinkStaleAccountsMutation = useMutation({
    mutationFn: async ({
      accounts,
      deregisterFromSnapTrade,
    }: {
      accounts: NonNullable<SnapTradeStatus['orphanedAccounts']>;
      deregisterFromSnapTrade: boolean;
    }) => {
      let deletedCount = 0;
      const failures: string[] = [];

      for (const account of accounts) {
        try {
          await disconnectAccount(account.brokerageAccountId, deregisterFromSnapTrade);
          deletedCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failures.push(`${account.brokerageAccountName}: ${message}`);
        }
      }

      return {
        deletedCount,
        totalCount: accounts.length,
        failures,
        deregisterFromSnapTrade,
      };
    },
    onMutate: () => {
      setStaleCleanupSummary(null);
    },
    onSuccess: (result) => {
      setStaleCleanupSummary(result);
      if (result.failures.length > 0) {
        logger.warn(
          {
            deletedCount: result.deletedCount,
            totalCount: result.totalCount,
            failures: result.failures,
            deregisterFromSnapTrade: result.deregisterFromSnapTrade,
          },
          'Stale account unlink completed with failures'
        );
      } else {
        logger.info(
          {
            deletedCount: result.deletedCount,
            totalCount: result.totalCount,
            deregisterFromSnapTrade: result.deregisterFromSnapTrade,
          },
          'Stale accounts unlinked successfully'
        );
      }
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Unlink stale accounts failed');
    },
    onSettled: () => {
      refetchSnapTradeStatus();
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
  });

  // Computed values
  const brokerInstitutionNames: Record<string, string[]> = {
    robinhood: ['Robinhood'],
    schwab: ['Charles Schwab', 'Schwab'],
    fidelity: ['Fidelity'],
    interactive_brokers: ['Interactive Brokers', 'IBKR'],
  };
  const matchingInstitutions = brokerInstitutionNames[selectedBroker] || [];
  const filteredSnapTradeAccounts = (snapTradeStatus?.accounts || []).filter((acc) =>
    matchingInstitutions.some((name) =>
      acc.institutionName?.toLowerCase().includes(name.toLowerCase())
    )
  );
  const orphanedMatchingAccounts = (snapTradeStatus?.orphanedAccounts || []).filter(
    (account) => account.broker === selectedBroker
  );
  const isConnected = filteredSnapTradeAccounts.length > 0;
  const totalKnownAccounts = filteredSnapTradeAccounts.length + orphanedMatchingAccounts.length;

  // Group accounts by brokerageAuthorizationId for visual grouping
  const accountsByAuthId = filteredSnapTradeAccounts.reduce<Record<string, SnapTradeAccount[]>>((acc, account) => {
    const authId = account.brokerageAuthorizationId || 'unknown';
    if (!acc[authId]) {
      acc[authId] = [];
    }
    acc[authId].push(account);
    return acc;
  }, {});
  const authorizationGroups = Object.entries(accountsByAuthId);
  const hasMultipleConnections = authorizationGroups.length > 1;

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {brokerConfig.name} Real-time Sync
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isConnected ? 'Sync transactions from your connected account' : 'Connect your account to enable sync'}
          </p>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-6">
          {isConnected ? (
            <div className="space-y-6">
              {/* Connected Status & Account Selection */}
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Connected to {brokerConfig.name}
                  </span>
                  {snapTradeStatus?.lastSyncAt && (
                    <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70 ml-auto">
                      Last sync: {new Date(snapTradeStatus.lastSyncAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mb-3">
                  Select accounts to sync. Synced accounts show transaction counts.
                  {totalKnownAccounts > 0 && (
                    <span className="block mt-1">
                      Connected now: {filteredSnapTradeAccounts.length} of {totalKnownAccounts} known {brokerConfig.name} account{totalKnownAccounts === 1 ? '' : 's'}.
                    </span>
                  )}
                  {hasMultipleConnections && (
                    <span className="block mt-1 text-emerald-500 dark:text-emerald-500">
                      You have {authorizationGroups.length} separate logins connected.
                    </span>
                  )}
                </p>
                {orphanedMatchingAccounts.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      {orphanedMatchingAccounts.length} previously linked account{orphanedMatchingAccounts.length === 1 ? '' : 's'} are not currently connected
                    </p>
                    <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
                      Existing trades remain in your journal. Use &quot;Connect Another Login&quot; with the missing brokerage login to resume live sync for these accounts.
                    </p>
                    <div className="mt-2 space-y-1">
                      {orphanedMatchingAccounts.slice(0, 4).map((account) => (
                        <p key={account.brokerageAccountId} className="text-xs text-amber-700/80 dark:text-amber-400/80">
                          {account.brokerageAccountName} ({account.transactionCount} imported transactions)
                        </p>
                      ))}
                      {orphanedMatchingAccounts.length > 4 && (
                        <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
                          +{orphanedMatchingAccounts.length - 4} more account{orphanedMatchingAccounts.length - 4 === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                            disabled={unlinkStaleAccountsMutation.isPending}
                          >
                            <Unlink className="h-3.5 w-3.5 mr-1.5" />
                            Unlink Stale Accounts
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unlink stale accounts?</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-3">
                                <p>
                                  This will permanently delete these {orphanedMatchingAccounts.length} stale account
                                  {orphanedMatchingAccounts.length === 1 ? '' : 's'} and all associated trades.
                                </p>
                                <p>
                                  You can choose:
                                  <strong> Unlink Only</strong> (local delete) or
                                  <strong> Unlink + Deregister</strong> (also remove related SnapTrade authorization when possible).
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Deregistering can affect other accounts that share the same brokerage login.
                                </p>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel disabled={unlinkStaleAccountsMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                unlinkStaleAccountsMutation.mutate({
                                  accounts: orphanedMatchingAccounts,
                                  deregisterFromSnapTrade: false,
                                })
                              }
                              disabled={unlinkStaleAccountsMutation.isPending}
                              className="bg-slate-600 hover:bg-slate-700"
                            >
                              {unlinkStaleAccountsMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Unlinking...
                                </>
                              ) : (
                                'Unlink Only'
                              )}
                            </AlertDialogAction>
                            <AlertDialogAction
                              onClick={() =>
                                unlinkStaleAccountsMutation.mutate({
                                  accounts: orphanedMatchingAccounts,
                                  deregisterFromSnapTrade: true,
                                })
                              }
                              disabled={unlinkStaleAccountsMutation.isPending}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              {unlinkStaleAccountsMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Deregistering...
                                </>
                              ) : (
                                'Unlink + Deregister'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {staleCleanupSummary && (
                      <div
                        className={cn(
                          'mt-3 rounded-md border px-2.5 py-2 text-xs',
                          staleCleanupSummary.failures.length === 0
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                        )}
                      >
                        <p>
                          {staleCleanupSummary.deletedCount}/{staleCleanupSummary.totalCount} stale account
                          {staleCleanupSummary.totalCount === 1 ? '' : 's'} unlinked
                          {staleCleanupSummary.deregisterFromSnapTrade ? ' with deregistration' : ''}.
                        </p>
                        {staleCleanupSummary.failures.length > 0 && (
                          <p className="mt-1">
                            Failed: {staleCleanupSummary.failures.slice(0, 2).join(' | ')}
                            {staleCleanupSummary.failures.length > 2
                              ? ` (+${staleCleanupSummary.failures.length - 2} more)`
                              : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-4">
                  {authorizationGroups.map(([authId, accounts], groupIndex) => (
                    <div key={authId} className={hasMultipleConnections ? 'space-y-2' : 'space-y-2'}>
                      {hasMultipleConnections && (
                        <div className="flex items-center gap-2 pb-1 border-b border-emerald-200/50 dark:border-emerald-800/50">
                          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {groupIndex + 1}
                          </div>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {loginNicknames[authId] || `Login ${groupIndex + 1}`}
                          </span>
                          <span className="text-xs text-emerald-500/70 dark:text-emerald-400/50">
                            ({accounts.length} account{accounts.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      )}
                      {accounts.map((account) => {
                    const isSelected = selectedSnaptradeAccounts.has(account.id);
                    const syncStatus = account.snaptradeSync?.status;
                    const isSnapTradeSyncing = syncStatus === 'syncing';
                    const isLimited = syncStatus === 'limited';
                    const isReady = syncStatus === 'ready';

                    return (
                      <div
                        key={account.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg transition-colors',
                          isSelected
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700'
                            : isSnapTradeSyncing
                              ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                              : isLimited
                                ? 'bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700'
                                : 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 border border-transparent'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSelected = new Set(selectedSnaptradeAccounts);
                            if (e.target.checked) {
                              newSelected.add(account.id);
                            } else {
                              newSelected.delete(account.id);
                            }
                            setSelectedSnaptradeAccounts(newSelected);
                          }}
                          className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <Building2 className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              isSnapTradeSyncing
                                ? 'text-amber-600 dark:text-amber-400'
                                : isLimited
                                  ? 'text-zinc-500 dark:text-zinc-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            )} />
                            <span className={cn(
                              'font-medium truncate',
                              isSnapTradeSyncing
                                ? 'text-amber-700 dark:text-amber-300'
                                : isLimited
                                  ? 'text-zinc-600 dark:text-zinc-400'
                                  : 'text-emerald-700 dark:text-emerald-300'
                            )}>
                              {account.name}
                            </span>
                            {account.isSynced ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Synced
                              </span>
                            ) : isSnapTradeSyncing ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 animate-pulse">
                                <Timer className="h-3 w-3" />
                                Fetching from broker...
                              </span>
                            ) : isLimited ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                                <AlertCircle className="h-3 w-3" />
                                Limited Data
                              </span>
                            ) : isReady ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Ready
                              </span>
                            ) : null}
                          </div>
                          <p className={cn(
                            'text-xs truncate',
                            isSnapTradeSyncing
                              ? 'text-amber-600/70 dark:text-amber-400/70'
                              : isLimited
                                ? 'text-zinc-500 dark:text-zinc-400'
                                : 'text-emerald-600/70 dark:text-emerald-400/70'
                          )}>
                            {account.institutionName} • {account.number}
                            {account.isSynced && account.transactionCount > 0 && (
                              <span className="ml-2">• {account.transactionCount} transactions</span>
                            )}
                            {isSnapTradeSyncing && (
                              <span className="ml-2">• Data is being synced from your broker</span>
                            )}
                            {isLimited && (
                              <span className="ml-2">• Transaction history unavailable for this account type</span>
                            )}
                            {!account.isSynced && isReady && account.snaptradeSync?.firstTransactionDate && (
                              <span className="ml-2">• History from {new Date(account.snaptradeSync.firstTransactionDate).toLocaleDateString()}</span>
                            )}
                          </p>
                        </div>
                        {/* Refresh button for syncing accounts */}
                        {isSnapTradeSyncing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            onClick={() => refetchSnapTradeStatus()}
                            title="Check if sync is complete"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {account.isSynced && account.brokerageAccountId && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                                disabled={disconnectMutation.isPending}
                              >
                                <Unlink className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Disconnect Account?</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-3">
                                    <p>
                                      This will permanently delete the &quot;{account.brokerageAccountName || account.name}&quot; account
                                      and all <strong>{account.transactionCount} associated transactions</strong>.
                                      This cannot be undone.
                                    </p>
                                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                                        Also deregister from SnapTrade?
                                      </p>
                                      <p className="text-xs text-amber-600 dark:text-amber-400">
                                        Choose <strong>&quot;Deregister&quot;</strong> to fully remove this brokerage connection from SnapTrade.
                                        This allows you to reconnect fresh later. Your other connected brokerages will not be affected.
                                      </p>
                                    </div>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => disconnectMutation.mutate({ brokerageAccountId: account.brokerageAccountId!, deregisterFromSnapTrade: false })}
                                  className="bg-slate-600 hover:bg-slate-700"
                                >
                                  {disconnectMutation.isPending ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Disconnecting...
                                    </>
                                  ) : (
                                    'Disconnect Only'
                                  )}
                                </AlertDialogAction>
                                <AlertDialogAction
                                  onClick={() => disconnectMutation.mutate({ brokerageAccountId: account.brokerageAccountId!, deregisterFromSnapTrade: true })}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {disconnectMutation.isPending ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Deregistering...
                                    </>
                                  ) : (
                                    'Deregister from SnapTrade'
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    );
                  })}
                    </div>
                  ))}
                </div>
                {selectedSnaptradeAccounts.size > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      {selectedSnaptradeAccounts.size} new account{selectedSnaptradeAccounts.size !== 1 ? 's' : ''} selected to sync
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedSnaptradeAccounts(new Set())}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </div>

              {/* Sync Actions */}
              {(() => {
                // Only sync checked accounts
                const hasSelectedAccounts = selectedSnaptradeAccounts.size > 0;

                // Check for selected accounts that are still syncing from the broker
                const accountsStillSyncing = filteredSnapTradeAccounts.filter(
                  a => a.snaptradeSync?.status === 'syncing' && selectedSnaptradeAccounts.has(a.id)
                );

                return (
                  <div className="flex flex-col gap-3">
                    {/* Warning: selected accounts still syncing from broker */}
                    {accountsStillSyncing.length > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Timer className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                              {accountsStillSyncing.length === 1
                                ? `"${accountsStillSyncing[0].name}" is still syncing`
                                : `${accountsStillSyncing.length} selected accounts are still syncing`}
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              {brokerConfig.name} is sending transaction history to SnapTrade. This can take a few minutes for accounts with lots of history.
                              Click <strong>Force Refresh</strong> to speed up the sync, or wait and try again.
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-7 px-2 text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                              onClick={() => refetchSnapTradeStatus()}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              Check Status
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No selection warning */}
                    {!hasSelectedAccounts && (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Select the accounts you want to sync by checking the boxes above.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Date Range Selection */}
                    {hasSelectedAccounts && (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="h-4 w-4 text-zinc-500" />
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date Range</span>
                        </div>

                        {/* Preset buttons */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {DATE_RANGE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDateRangePreset(option.value)}
                              className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                                dateRangePreset === option.value
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600',
                                option.forceRefresh && dateRangePreset === option.value && 'ring-2 ring-amber-400 ring-offset-1'
                              )}
                            >
                              {option.label}
                              {option.forceRefresh && (
                                <Zap className="inline-block h-3 w-3 ml-1 text-amber-500" />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Custom date range inputs */}
                        {dateRangePreset === 'custom' && (
                          <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                Start Date
                              </label>
                              <DatePicker
                                value={customStartDate}
                                onChange={setCustomStartDate}
                                placeholder="Select start date"
                                maxDate={customEndDate || new Date().toISOString().split('T')[0]}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                End Date
                              </label>
                              <DatePicker
                                value={customEndDate}
                                onChange={setCustomEndDate}
                                placeholder="Select end date"
                                minDate={customStartDate}
                                maxDate={new Date().toISOString().split('T')[0]}
                              />
                            </div>
                          </div>
                        )}

                        {/* Show selected range info */}
                        {dateRangePreset !== 'everything' && dateRangePreset !== 'custom' && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                            {(() => {
                              const range = getEffectiveDateRange();
                              if (range.startDate && range.endDate) {
                                return `Syncing transactions from ${range.startDate} to ${range.endDate}`;
                              }
                              return null;
                            })()}
                          </p>
                        )}
                        {dateRangePreset === 'everything' && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                            Syncing all available transaction history
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => {
                                // Only sync checked accounts with selected date range
                                const { startDate, endDate } = getEffectiveDateRange();
                                // Check if the selected preset should force refresh from broker
                                const selectedOption = DATE_RANGE_OPTIONS.find(o => o.value === dateRangePreset);
                                const shouldForceRefresh = selectedOption?.forceRefresh ?? false;
                                syncMutation.mutate({
                                  refresh: shouldForceRefresh,
                                  snaptradeAccountIds: Array.from(selectedSnaptradeAccounts),
                                  startDate,
                                  endDate,
                                });
                              }}
                              disabled={syncMutation.isPending || disconnectMutation.isPending || !hasSelectedAccounts}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                              size="lg"
                            >
                              {syncMutation.isPending ? (
                                <>
                                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-5 w-5 mr-2" />
                                  {selectedSnaptradeAccounts.size > 0
                                    ? `Sync ${selectedSnaptradeAccounts.size} Account${selectedSnaptradeAccounts.size !== 1 ? 's' : ''}`
                                    : 'Select Accounts to Sync'}
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Import new transactions from cached broker data and recalculate positions & P&L</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                // Force refresh: discover new accounts + fetch latest data from broker
                                // First trigger account discovery (finds new sub-accounts added after initial link)
                                await fetchSnapTradeStatus({ refresh: true });
                                refetchSnapTradeStatus();
                                // Then sync transactions for checked accounts
                                const { startDate, endDate } = getEffectiveDateRange();
                                syncMutation.mutate({
                                  refresh: true,
                                  snaptradeAccountIds: Array.from(selectedSnaptradeAccounts),
                                  startDate,
                                  endDate,
                                });
                              }}
                              disabled={syncMutation.isPending || disconnectMutation.isPending || !hasSelectedAccounts}
                              size="lg"
                            >
                              <Zap className="h-5 w-5 mr-2" />
                              Force Refresh
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Discover new accounts and request fresh data directly from your broker. Use this if new accounts or recent trades are missing.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Info section */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-zinc-600 dark:text-zinc-400">
                          <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Sync vs Force Refresh:</p>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <RefreshCw className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                              <span><strong>Sync</strong> - Imports new transactions from cached data and recalculates your positions & P&L</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Zap className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                              <span><strong>Force Refresh</strong> - Requests fresh data directly from your broker before importing (use if recent trades are missing)</span>
                            </div>
                          </div>
                          <p className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                            <strong>Note:</strong> Duplicates are always skipped - it&apos;s safe to sync as often as you want.
                          </p>
                          <p className="mt-2 text-amber-600 dark:text-amber-400">
                            <strong>⚠️ Data Delay:</strong> Transaction history from your broker may have up to a 1-day delay via SnapTrade.
                            If today&apos;s trades aren&apos;t showing, try again tomorrow.
                          </p>
                          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">👥 Multiple Logins</p>
                            <p className="mb-2">
                              You can connect multiple logins from the same broker - perfect for tracking your accounts alongside a spouse or family member.
                            </p>
                            <ul className="list-disc list-inside space-y-1 ml-1 mb-2">
                              <li>Click <strong>&quot;Connect Another Login&quot;</strong> to add another person&apos;s brokerage</li>
                              <li>Each login is shown as <strong>&quot;Login 1&quot;</strong>, <strong>&quot;Login 2&quot;</strong>, etc.</li>
                              <li>All accounts sync to a single dashboard for a complete view</li>
                              <li>You can rename accounts on the <strong>Accounts</strong> page to identify them easily</li>
                            </ul>
                          </div>
                          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">🔄 Need a Fresh Start?</p>
                            <p className="mb-2">
                              To unlink and relink a brokerage account (useful if data seems incorrect or you want to re-import everything):
                            </p>
                            <ol className="list-decimal list-inside space-y-1 ml-1">
                              <li>Go to <strong>Accounts</strong> page from the top navigation</li>
                              <li>Click the <strong>three dots menu (⋮)</strong> on the account you want to reset</li>
                              <li>Select <strong>&quot;Disconnect &amp; Delete All Trades&quot;</strong></li>
                              <li>Return here and click <strong>&quot;Add Account&quot;</strong> to reconnect</li>
                            </ol>
                            <p className="mt-2 text-zinc-500">
                              This only affects the selected account - other logins and accounts remain untouched.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Disconnect Error */}
              {disconnectMutation.isError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-200">Disconnect Failed</p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                        {disconnectMutation.error.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sync Result */}
              {syncResult && (
                <div
                  className={cn(
                    'p-4 rounded-lg border',
                    syncResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {syncResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span
                      className={cn(
                        'font-semibold',
                        syncResult.success
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-red-700 dark:text-red-300'
                      )}
                    >
                      {syncResult.message}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-600">{syncResult.stats.accountsSynced}</p>
                      <p className="text-xs text-zinc-500">Accounts</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-2xl font-bold text-emerald-600">{syncResult.stats.totalImported}</p>
                      <p className="text-xs text-zinc-500">Imported</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-2xl font-bold text-orange-500">{syncResult.stats.totalDuplicates}</p>
                      <p className="text-xs text-zinc-500">Duplicates</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-600">{syncResult.stats.newAccountsCreated}</p>
                      <p className="text-xs text-zinc-500">New Accounts</p>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    {/* View Import Reports for each account */}
                    {syncResult.accounts.length > 0 && (
                      <div className="flex-1">
                        {syncResult.accounts.length === 1 ? (
                          <Link href={`/import/report/${syncResult.accounts[0].importBatchId}`}>
                            <Button variant="outline" className="w-full">
                              <FileText className="h-4 w-4 mr-2" />
                              View Import Report
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => onBack()}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Import History
                          </Button>
                        )}
                      </div>
                    )}
                    {syncResult.stats.totalImported > 0 && (
                      <Link href="/dashboard" className="flex-1">
                        <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                          View Dashboard
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Sync Error */}
              {syncMutation.isError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-200">Sync Failed</p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                        {syncMutation.error.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Not Connected - Step by Step Guide */}
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                  <Link2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Connect Your {brokerConfig.name} Account
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mb-4">
                  Securely link your {brokerConfig.name} account to automatically sync your trades.
                </p>
              </div>

              {/* How it works */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
                  How it works:
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                      1
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Click Connect</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">A secure window will open</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                      2
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Log in to {brokerConfig.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Enter your {brokerConfig.name} credentials in the SnapTrade portal</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                      3
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Authorize Read Access</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Allow read-only access to your transaction history</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      4
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Done! Sync Your Trades</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Return here and click Sync to import your transactions</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security badges */}
              <div className="flex items-center justify-center gap-6 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Read-only access
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Bank-level security
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Disconnect anytime
                </span>
              </div>

              {/* Connect Button */}
              <div className="text-center">
                <Button
                  onClick={() => connectMutation.mutate(selectedBroker)}
                  disabled={connectMutation.isPending}
                  size="lg"
                  className={cn(brokerConfig.color, 'text-white hover:opacity-90 px-8')}
                >
                  {connectMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Opening SnapTrade...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-5 w-5 mr-2" />
                      Connect {brokerConfig.name}
                    </>
                  )}
                </Button>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
                  Powered by SnapTrade - a secure brokerage data aggregator
                </p>
              </div>

              {/* Connect Success Message */}
              {connectMutation.isSuccess && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Loader2 className="h-5 w-5 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">SnapTrade Window Opened</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                        Complete the login in the popup window. Once done, click the button below to check your connection status.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => refetchSnapTradeStatus()}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Check Connection Status
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Connect Error */}
              {connectMutation.isError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-red-800 dark:text-red-200">Connection Failed</p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                        {connectMutation.error.message}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            connectMutation.reset();
                            connectMutation.mutate(selectedBroker);
                          }}
                        >
                          Try Again
                        </Button>
                        {brokerConfig.fileType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSwitchToFile()}
                          >
                            Use File Upload Instead
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
