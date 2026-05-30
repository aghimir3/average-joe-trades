/**
 * Accounts Client Component
 *
 * Modern, wizard-style interface for managing brokerage accounts.
 * Only supports Robinhood (CSV + SnapTrade) and Schwab (JSON).
 * Forces users to either connect via SnapTrade or import a file.
 */

'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Building2,
  Trash2,
  Star,
  Edit2,
  Loader2,
  TrendingUp,
  TrendingDown,
  FileText,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Link2,
  RefreshCw,
  X,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatCurrency } from '@/lib/utils';
import { SUPPORTED_BROKERS, type BrokerKey } from '@/lib/constants/brokers';
import {
  connectSnapTrade,
  deleteAccount,
  fetchAccounts,
  fetchLoginNicknames,
  fetchSnapTradeStatus,
  syncTransactions,
  updateAccount,
} from './api';
import { getBrokerInfo } from './broker';
import type {
  BrokerageAccount,
  SyncResult,
  UpdateAccountData,
  WizardStep,
} from './types';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { SyncAllDialog } from './sync-all-dialog';
import { EditAccountDialog } from './edit-account-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { OrphanedAccountsBanner } from './orphaned-accounts-banner';
import { AddAccountWizard } from './add-account-wizard';

// Loading skeleton for accounts
function AccountsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-1.5 w-full" />
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-20 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AccountsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState<WizardStep>('select-broker');
  const [wizardInitialBroker, setWizardInitialBroker] = useState<BrokerKey | null>(null);

  // Edit/Delete state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BrokerageAccount | null>(null);
  const [formName, setFormName] = useState('');
  const [formExternalId, setFormExternalId] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Delete trades by date range state
  const [deleteTradesDialogOpen, setDeleteTradesDialogOpen] = useState(false);
  const [deleteTradesAccount, setDeleteTradesAccount] = useState<BrokerageAccount | null>(null);

  // Sync All state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<SyncResult | null>(null);
  const [syncAllError, setSyncAllError] = useState<string | null>(null);
  const [syncAllDialogOpen, setSyncAllDialogOpen] = useState(false);
  const [syncAllStartDate, setSyncAllStartDate] = useState('');
  const [syncAllEndDate, setSyncAllEndDate] = useState('');


  // Queries
  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: ['brokerage-accounts'],
    queryFn: fetchAccounts,
  });

  const { data: snapTradeStatus, refetch: refetchSnapTradeStatus } = useQuery({
    queryKey: ['snaptrade-status'],
    queryFn: () => fetchSnapTradeStatus(),
    staleTime: 30000,
  });

  const { data: loginNicknames = {}, refetch: refetchLoginNicknames } = useQuery({
    queryKey: ['login-nicknames'],
    queryFn: fetchLoginNicknames,
    staleTime: 60000,
  });

  // Handle SnapTrade OAuth callback - open wizard to show newly connected accounts
  useEffect(() => {
    const connected = searchParams.get('connected');
    const broker = searchParams.get('broker') as BrokerKey | null;

    if (connected === 'true' && snapTradeStatus) {
      // Refetch status to get newly connected accounts
      refetchSnapTradeStatus().then(() => {
        // Open wizard and navigate to connect-snaptrade step
        if (broker && SUPPORTED_BROKERS[broker]) {
          setWizardInitialBroker(broker);
          setWizardInitialStep('connect-snaptrade');
        } else {
          setWizardInitialStep('select-broker');
        }
        setWizardOpen(true);
      });

      // Clear the URL params to prevent re-triggering
      router.replace('/accounts', { scroll: false });
    }
  }, [searchParams, snapTradeStatus, refetchSnapTradeStatus, router]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountData }) => updateAccount(id, data),
    onSuccess: (updatedAccount) => {
      queryClient.setQueryData<BrokerageAccount[]>(['brokerage-accounts'], (current = []) =>
        current.map((account) =>
          account.id === updatedAccount.id
            ? { ...account, ...updatedAccount, stats: account.stats }
            : account
        )
      );
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      setEditDialogOpen(false);
      setSelectedAccount(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      setDeleteDialogOpen(false);
      setSelectedAccount(null);
    },
  });

  const connectMutation = useMutation({
    mutationFn: (broker?: string) => connectSnapTrade(broker),
    onSuccess: (redirectUrl) => {
      // Navigate in same window for full-screen experience (like onboarding)
      window.location.href = redirectUrl;
    },
  });


  const orphanedAccounts = snapTradeStatus?.orphanedAccounts ?? [];
  const orphanedAccountById = new Map(
    orphanedAccounts.map((account) => [account.brokerageAccountId, account])
  );
  const disabledConnectionIds = new Set(
    (snapTradeStatus?.connections ?? [])
      .filter((connection) => connection.disabled)
      .map((connection) => connection.id)
  );

  const syncableLinkedAccounts = (snapTradeStatus?.accounts ?? []).filter((account) => {
    if (!account.brokerageAccountId) return false;
    if (
      account.brokerageAuthorizationId
      && disabledConnectionIds.has(account.brokerageAuthorizationId)
    ) {
      return false;
    }
    if (orphanedAccountById.has(account.brokerageAccountId)) return false;
    return true;
  });

  const linkedSnapTradeAccountIds = syncableLinkedAccounts.map((account) => account.id);
  const hasLinkedSnapTradeAccounts = linkedSnapTradeAccountIds.length > 0;
  const disconnectedLinkedAccountCount = orphanedAccounts.length + ((snapTradeStatus?.accounts ?? []).filter((account) => {
    if (!account.brokerageAccountId) return false;
    return Boolean(
      account.brokerageAuthorizationId
      && disabledConnectionIds.has(account.brokerageAuthorizationId)
    );
  }).length);

  const handleRelinkBroker = (broker: string) => {
    const supportedBroker = broker in SUPPORTED_BROKERS ? (broker as BrokerKey) : null;
    const brokerForApi =
      supportedBroker && SUPPORTED_BROKERS[supportedBroker].supportsSync
        ? supportedBroker
        : undefined;
    connectMutation.mutate(brokerForApi);
  };

  // Open the Sync All dialog
  const openSyncAllDialog = () => {
    // Set default date range: last 2 years
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2);
    setSyncAllStartDate(startDate.toISOString().split('T')[0]);
    setSyncAllEndDate(endDate.toISOString().split('T')[0]);
    setSyncAllDialogOpen(true);
  };

  // Handler to sync all linked SnapTrade accounts
  const handleSyncAll = async () => {
    if (!hasLinkedSnapTradeAccounts) {
      setSyncAllDialogOpen(false);
      setSyncAllResult(null);
      setSyncAllError(
        disconnectedLinkedAccountCount > 0
          ? 'All linked accounts are currently disconnected. Relink them to run Sync All.'
          : 'No connected linked accounts available for Sync All.'
      );
      return;
    }

    setSyncAllDialogOpen(false);
    setIsSyncingAll(true);
    setSyncAllError(null);
    setSyncAllResult(null);

    try {
      const result = await syncTransactions({
        snaptradeAccountIds: linkedSnapTradeAccountIds,
        refresh: true, // Force refresh from brokers first
        forceDerivation: true, // Re-derive positions even if no new transactions
        startDate: syncAllStartDate || undefined,
        endDate: syncAllEndDate || undefined,
      });
      setSyncAllResult(result);
      refetchSnapTradeStatus();
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setSyncAllError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const openDeleteTradesDialog = (account: BrokerageAccount) => {
    setDeleteTradesAccount(account);
    setDeleteTradesDialogOpen(true);
  };

  const closeDeleteTradesDialog = () => {
    setDeleteTradesDialogOpen(false);
    setDeleteTradesAccount(null);
  };

  const openWizard = () => {
    setWizardInitialStep('select-broker');
    setWizardInitialBroker(null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
  };

  // Edit account handlers
  const openEditDialog = (account: BrokerageAccount) => {
    setSelectedAccount(account);
    setFormName(account.name);
    setFormExternalId(account.externalAccountId || '');
    setFormIsDefault(account.isDefault);
    setEditDialogOpen(true);
  };

  const handleEdit = () => {
    if (!selectedAccount || !formName.trim()) return;
    updateMutation.mutate({
      id: selectedAccount.id,
      data: {
        name: formName.trim(),
        externalAccountId: formExternalId.trim() || undefined,
        isDefault: formIsDefault,
      },
    });
  };

  const handleSetDefault = (account: BrokerageAccount) => {
    if (account.isDefault) return;
    updateMutation.mutate({ id: account.id, data: { isDefault: true } });
  };

  // Loading state
  if (isLoading) {
    return <AccountsSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Failed to load accounts. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Accounts
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Connect your trading accounts to import transactions
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasLinkedSnapTradeAccounts && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={openSyncAllDialog}
                    disabled={isSyncingAll}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    {isSyncingAll ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {isSyncingAll ? 'Syncing...' : 'Sync All'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Force sync {linkedSnapTradeAccountIds.length} connected linked account{linkedSnapTradeAccountIds.length !== 1 ? 's' : ''}
                    {disconnectedLinkedAccountCount > 0
                      ? ` (skips ${disconnectedLinkedAccountCount} disconnected)`
                      : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button onClick={openWizard} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Sync All Result/Error Banner */}
      {(syncAllResult || syncAllError) && (
        <div className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm",
          syncAllError
            ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
            : "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
        )}>
          {syncAllError ? (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Sync failed: {syncAllError}</span>
            </>
          ) : syncAllResult ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Synced {syncAllResult.stats.accountsSynced} account{syncAllResult.stats.accountsSynced !== 1 ? 's' : ''}
                {syncAllResult.stats.totalImported > 0 && (
                  <> · {syncAllResult.stats.totalImported} new transaction{syncAllResult.stats.totalImported !== 1 ? 's' : ''}</>
                )}
                {syncAllResult.stats.totalImported === 0 && ' · No new transactions'}
              </span>
            </>
          ) : null}
          <button
            onClick={() => { setSyncAllResult(null); setSyncAllError(null); }}
            className="ml-auto p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <OrphanedAccountsBanner
        orphanedAccounts={orphanedAccounts}
        onRelinkBroker={handleRelinkBroker}
        isRelinking={connectMutation.isPending}
      />

      {/* Empty State */}
      {accounts.length === 0 && (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16">
            <div className="text-center max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-linear-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center mb-6">
                <Building2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                No Accounts Yet
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-8">
                Connect your brokerage account to start tracking your trades. We support Robinhood and Charles Schwab.
              </p>
              <Button onClick={openWizard} size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts Grid */}
      {accounts.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2">
          {accounts.map((account) => {
            const brokerInfo = getBrokerInfo(account.broker);
            const pnlIsPositive = account.stats.totalRealizedPnL >= 0;
            const isSupportedBroker = account.broker in SUPPORTED_BROKERS;
            const orphanedAccount = orphanedAccountById.get(account.id);
            const isDisconnected = !!orphanedAccount;

            return (
              <Card
                key={account.id}
                className={cn(
                  'relative transition-all duration-200 hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50',
                  account.isDefault && 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950'
                )}
              >
                {/* Broker Color Accent */}
                <div className={cn('h-1 rounded-t-lg', brokerInfo.color)} />

                <CardHeader className="pb-3 pt-4">
                  {/* Header row with account info and action buttons */}
                  <div className="flex items-center gap-2">
                    {/* Broker Icon */}
                    <div
                      className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0',
                        brokerInfo.color
                      )}
                    >
                      <Briefcase className="h-4 w-4 text-white" />
                    </div>

                    {/* Account Name - takes remaining space */}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                        {account.name}
                      </CardTitle>
                    </div>

                    {/* Actions Menu - always visible */}
                    <div className="flex items-center shrink-0">
                      {!account.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSetDefault(account)}
                          className="h-7 w-7 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          title="Set as default"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(account)}
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        title="Edit account"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedAccount(account);
                          setDeleteDialogOpen(true);
                        }}
                        className="h-7 w-7 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        disabled={accounts.length === 1}
                        title={accounts.length === 1 ? 'Cannot delete your only account' : 'Delete account'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Broker label and badges row */}
                  <CardDescription className="flex items-center gap-1.5 mt-1.5 ml-11">
                    <span>{brokerInfo.label}</span>
                    {account.isDefault && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-full uppercase tracking-wider">
                        Default
                      </span>
                    )}
                    {isDisconnected ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Disconnected
                      </span>
                    ) : account.externalAccountId ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full">
                        <Link2 className="h-2.5 w-2.5" />
                        Connected
                      </span>
                    ) : null}
                    {!isSupportedBroker && (
                      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-full">
                        Legacy
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-5">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Total P&L</p>
                      <p
                        className={cn(
                          'text-lg font-bold flex items-center gap-1.5',
                          pnlIsPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {pnlIsPositive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {formatCurrency(account.stats.totalRealizedPnL)}
                      </p>
                    </div>
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Open Positions</p>
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {account.stats.openPositionCount}
                      </p>
                    </div>
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Transactions</p>
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {account.stats.ledgerEventCount}
                      </p>
                    </div>
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Imports</p>
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {account.stats.importBatchCount}
                      </p>
                    </div>
                  </div>

                  {isDisconnected && (
                    <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Live sync is disconnected for this account. Relink to sync new trades.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRelinkBroker(account.broker)}
                          disabled={connectMutation.isPending}
                          className="h-7 shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          {connectMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Link2 className="h-3.5 w-3.5 mr-1" />
                              Relink
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="flex gap-3 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <Link href={`/dashboard?account=${account.id}`} className="flex-1">
                      <Button variant="outline" className="w-full h-10 font-medium">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Dashboard
                      </Button>
                    </Link>
                    <Link href={`/import?account=${account.id}`} className="flex-1">
                      <Button variant="outline" className="w-full h-10 font-medium">
                        <FileText className="h-4 w-4 mr-2" />
                        Import
                      </Button>
                    </Link>
                  </div>

                  {/* Delete Trades Action - only show if account has trades */}
                  {account.stats.ledgerEventCount > 0 && (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteTradesDialog(account)}
                        className="w-full text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Delete Trades by Date Range
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddAccountWizard
        open={wizardOpen}
        onClose={closeWizard}
        initialStep={wizardInitialStep}
        initialBroker={wizardInitialBroker}
        accounts={accounts}
        snapTradeStatus={snapTradeStatus}
        refetchSnapTradeStatus={refetchSnapTradeStatus}
        loginNicknames={loginNicknames}
        refetchLoginNicknames={refetchLoginNicknames}
      />


      <EditAccountDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        account={selectedAccount}
        formName={formName}
        formExternalId={formExternalId}
        formIsDefault={formIsDefault}
        onFormNameChange={setFormName}
        onFormExternalIdChange={setFormExternalId}
        onFormIsDefaultChange={setFormIsDefault}
        onSave={handleEdit}
        isPending={updateMutation.isPending}
        error={updateMutation.error}
      />

      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        account={selectedAccount}
        onConfirm={() => selectedAccount && deleteMutation.mutate(selectedAccount.id)}
        isPending={deleteMutation.isPending}
      />

      <BulkDeleteDialog
        open={deleteTradesDialogOpen}
        account={deleteTradesAccount}
        onClose={closeDeleteTradesDialog}
      />

      <SyncAllDialog
        open={syncAllDialogOpen}
        onOpenChange={setSyncAllDialogOpen}
        linkedAccountCount={linkedSnapTradeAccountIds.length}
        disconnectedAccountCount={disconnectedLinkedAccountCount}
        startDate={syncAllStartDate}
        endDate={syncAllEndDate}
        onStartDateChange={setSyncAllStartDate}
        onEndDateChange={setSyncAllEndDate}
        onSync={handleSyncAll}
      />
    </div>
  );
}
