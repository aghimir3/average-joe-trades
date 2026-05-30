/**
 * Import Client Component
 *
 * Modern, broker-first interface for importing trades.
 * Users select their broker first, then choose between:
 * - CSV/JSON file upload
 * - Real-time sync (for supported brokers like Robinhood)
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  ArrowRight,
  FileSpreadsheet,
  Building2,
  ChevronDown,
  RefreshCw,
  Link2,
  Zap,
  ArrowLeft,
  CloudDownload,
  Unlink,
  HelpCircle,
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
import { BROKER_CONFIG } from './lib/constants';
import type { BrokerKey } from './lib/types';
import {
  deleteImport,
  fetchImportHistory,
  fetchBrokerageAccounts,
  fetchSnapTradeStatus,
} from './lib/api';
import { SyncTab } from './sync-tab';
import { FileImportTab } from './file-import-tab';

const logger = createChildLogger({ module: 'import-client' });

export function ImportClient() {
  const queryClient = useQueryClient();

  // View state
  const [selectedBroker, setSelectedBroker] = useState<BrokerKey | null>(null);
  const [importMethod, setImportMethod] = useState<'file' | 'sync' | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  // Queries
  const { data: allAccounts = [] } = useQuery({
    queryKey: ['brokerage-accounts'],
    queryFn: fetchBrokerageAccounts,
  });

  const { data: snapTradeStatus } = useQuery({
    queryKey: ['snaptrade-status'],
    queryFn: () => fetchSnapTradeStatus(),
    staleTime: 30000,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['import-history'],
    queryFn: fetchImportHistory,
  });

  // Filter accounts for selected broker
  const brokerAccounts = selectedBroker
    ? allAccounts.filter((a) => a.broker === selectedBroker)
    : [];

  // Broker config for selected broker
  const brokerConfig = selectedBroker ? BROKER_CONFIG[selectedBroker] : null;

  // Delete import mutation (used in Step 1 import history)
  const deleteMutation = useMutation({
    mutationFn: deleteImport,
    onSuccess: () => {
      logger.info({ batchId: deletingBatchId }, 'Import deleted');
      setDeletingBatchId(null);
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
    onError: (error: Error) => {
      logger.error({ error }, 'Delete failed');
    },
  });

  // Handlers
  const handleBrokerSelect = (broker: BrokerKey) => {
    setSelectedBroker(broker);
    // Auto-select 'sync' method if broker only supports sync (no file import)
    const brokerCfg = BROKER_CONFIG[broker];
    if (brokerCfg.supportsSync && !brokerCfg.fileType) {
      setImportMethod('sync');
    } else {
      setImportMethod(null);
    }
  };

  const handleBack = () => {
    if (importMethod) {
      setImportMethod(null);
    } else {
      setSelectedBroker(null);
    }
  };

  const handleDelete = (batchId: string) => {
    setDeletingBatchId(batchId);
    deleteMutation.mutate(batchId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ==================== RENDER ====================

  // Step 1: Broker Selection
  if (!selectedBroker) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Import Trades</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Select your broker to get started
            </p>
          </div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Manage Accounts
          </Link>
        </div>

        {/* Broker Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(BROKER_CONFIG).map(([key, broker]) => {
            const brokerKey = key as BrokerKey;
            const hasAccount = allAccounts.some((a) => a.broker === brokerKey);
            const isSupported = broker.supported;

            return (
              <button
                key={key}
                onClick={() => isSupported && handleBrokerSelect(brokerKey)}
                disabled={!isSupported}
                className={cn(
                  'relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 transition-all text-left',
                  isSupported
                    ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
                    : 'cursor-not-allowed opacity-50',
                  isSupported && hasAccount
                    ? `${broker.borderColor} ${broker.bgColor}`
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                )}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className={cn('w-4 h-4 rounded-full shrink-0', broker.color)} />
                  <span className={cn(
                    'font-semibold',
                    isSupported ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'
                  )}>
                    {broker.name}
                  </span>
                  {hasAccount && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {isSupported && broker.fileType && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      broker.bgColor, broker.textColor
                    )}>
                      {broker.fileType} Import
                    </span>
                  )}
                  {broker.supportsSync && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                      Real-time Sync
                    </span>
                  )}
                  {!isSupported && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      Coming Soon
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Help & Instructions */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <details className="group">
            <summary className="flex items-center justify-between px-4 sm:px-5 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">Help & Instructions</span>
              </div>
              <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 sm:px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4 text-sm">
              {/* Linking Accounts */}
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-emerald-500" />
                  How to Link a Brokerage Account
                </h3>
                <ol className="list-decimal list-inside space-y-1 text-zinc-600 dark:text-zinc-400 ml-1">
                  <li>Click on a supported broker above (e.g., Robinhood, Charles Schwab)</li>
                  <li>Choose <strong>&quot;Real-time Sync&quot;</strong> for automatic imports via SnapTrade</li>
                  <li>Log in to your brokerage in the popup window and authorize access</li>
                  <li>Select which accounts to sync and click &quot;Sync&quot;</li>
                </ol>
              </div>

              {/* Unlinking Accounts */}
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 flex items-center gap-2">
                  <Unlink className="h-4 w-4 text-red-500" />
                  How to Unlink / Fresh Start
                </h3>
                <ol className="list-decimal list-inside space-y-1 text-zinc-600 dark:text-zinc-400 ml-1">
                  <li>Go to the <Link href="/accounts" className="text-blue-500 hover:underline font-medium">Accounts</Link> page</li>
                  <li>Find the account you want to disconnect</li>
                  <li>Click the <strong>three dots menu (⋮)</strong> on the account card</li>
                  <li>Select <strong>&quot;Disconnect &amp; Delete All Trades&quot;</strong></li>
                  <li>This removes all synced data - you can then re-link for a fresh start</li>
                </ol>
              </div>

              {/* Managing Sync */}
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-500" />
                  Managing Your Sync
                </h3>
                <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400 ml-1">
                  <li><strong>Sync</strong> - Imports new transactions from cached data (fast, use daily)</li>
                  <li><strong>Force Refresh</strong> - Fetches fresh data from broker (use if trades are missing)</li>
                  <li>Duplicates are automatically skipped - sync as often as you like</li>
                  <li>Transaction history may have up to 1-day delay from your broker</li>
                </ul>
              </div>

              {/* File Import */}
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  CSV/JSON File Import
                </h3>
                <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400 ml-1">
                  <li>Download your transaction history from your broker&apos;s website</li>
                  <li>Robinhood: Account → Statements &amp; History → Download CSV</li>
                  <li>Schwab: History → Export → JSON format</li>
                  <li>Upload the file and preview before importing</li>
                </ul>
              </div>

              {/* Troubleshooting */}
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Troubleshooting
                </h3>
                <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400 ml-1">
                  <li><strong>Missing trades?</strong> Try &quot;Force Refresh&quot; or wait 24 hours for broker sync</li>
                  <li><strong>Wrong data?</strong> Disconnect and re-link for a fresh import</li>
                  <li><strong>Unknown basis issues?</strong> Visit the <Link href="/issues" className="text-blue-500 hover:underline font-medium">Issues</Link> page to resolve or dismiss</li>
                </ul>
              </div>
            </div>
          </details>
        </div>

        {/* Import History */}
        {history.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Recent Imports</h2>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {history.slice(0, 5).map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                >
                  <Link
                    href={`/import/report/${batch.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    {batch.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : batch.status === 'failed' ? (
                      <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                    ) : batch.status === 'processing' ? (
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <Clock className="h-5 w-5 text-zinc-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {batch.fileName}
                      </p>
                      <p className="text-xs text-zinc-500">{formatDate(batch.createdAt)}</p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-semibold text-emerald-600">{batch.importedTrades}</p>
                        <p className="text-[10px] text-zinc-500">imported</p>
                      </div>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Import?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete &quot;{batch.fileName}&quot; and all{' '}
                            <strong>{batch.importedTrades} associated trades</strong>. This cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(batch.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {deletingBatchId === batch.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              'Delete Import'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Import Method Selection (for broker with sync support)
  if (selectedBroker && !importMethod && brokerConfig?.supportsSync) {
    const hasAccounts = brokerAccounts.length > 0;
    // Check if connected to THIS specific broker (not just any broker)
    const brokerInstitutionNamesForMethod: Record<string, string[]> = {
      robinhood: ['Robinhood'],
      schwab: ['Charles Schwab', 'Schwab'],
      fidelity: ['Fidelity'],
      interactive_brokers: ['Interactive Brokers', 'IBKR'],
    };
    const matchingInstitutionsForMethod = brokerInstitutionNamesForMethod[selectedBroker] || [];
    const isConnected = (snapTradeStatus?.accounts || []).some((acc) =>
      matchingInstitutionsForMethod.some((name) =>
        acc.institutionName?.toLowerCase().includes(name.toLowerCase())
      )
    );

    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Import from {brokerConfig.name}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Choose how you want to import your trades
            </p>
          </div>
        </div>

        {/* No Account Warning */}
        {!hasAccounts && (
          <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  No {brokerConfig.name} Account Found
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Create a {brokerConfig.name} brokerage account first to import your trades.
                </p>
              </div>
              <Link href="/accounts">
                <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                  Create Account
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Import Method Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Real-time Sync Card */}
          <button
            onClick={() => setImportMethod('sync')}
            disabled={!hasAccounts}
            className={cn(
              'relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 transition-all text-left',
              hasAccounts
                ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'
                : 'cursor-not-allowed opacity-50 border-zinc-200 dark:border-zinc-800'
            )}
          >
            {isConnected && (
              <div className="absolute top-3 right-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
              </div>
            )}

            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>

            <div>
              <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                Real-time Sync
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Connect your account for automatic, real-time transaction sync
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <CloudDownload className="h-3 w-3" />
                Auto-sync
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <RefreshCw className="h-3 w-3" />
                Real-time
              </span>
            </div>
          </button>

          {/* File Upload Card - only show if broker supports file import */}
          {brokerConfig.fileType && (
            <button
              onClick={() => setImportMethod('file')}
              disabled={!hasAccounts}
              className={cn(
                'relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 transition-all text-left',
                hasAccounts
                  ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  : 'cursor-not-allowed opacity-50 border-zinc-200 dark:border-zinc-800'
              )}
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
              </div>

              <div>
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
                  {brokerConfig.fileType} Import
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Upload a {brokerConfig.fileType} export file from {brokerConfig.name}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <Upload className="h-3 w-3" />
                  Manual upload
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <FileText className="h-3 w-3" />
                  {brokerConfig.fileExtension} file
                </span>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Step 3a: Real-time Sync Flow
  if (selectedBroker && importMethod === 'sync' && brokerConfig) {
    return (
      <SyncTab
        selectedBroker={selectedBroker}
        brokerConfig={brokerConfig}
        onBack={handleBack}
        onSwitchToFile={() => setImportMethod('file')}
      />
    );
  }

  // Step 3b: File Upload Flow (for both sync-supporting and non-sync brokers)
  if (selectedBroker && (importMethod === 'file' || !brokerConfig?.supportsSync) && brokerConfig) {
    return (
      <FileImportTab
        selectedBroker={selectedBroker}
        brokerConfig={brokerConfig}
        brokerAccounts={brokerAccounts}
        onBack={handleBack}
      />
    );
  }

  // Fallback - shouldn't reach here
  return null;
}
