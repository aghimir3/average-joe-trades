/**
 * Add Account Wizard Dialog
 *
 * Multi-step dialog for adding brokerage accounts via SnapTrade sync,
 * file import, or manual entry. Extracted from accounts-client.tsx.
 */

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Briefcase,
  Edit2,
  Loader2,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  Link2,
  Zap,
  FileSpreadsheet,
  FileJson,
  RefreshCw,
  Eye,
  ChevronRight,
  Info,
  X,
  Timer,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SUPPORTED_BROKERS, type BrokerKey } from '@/lib/constants/brokers';
import { getBrokerSyncInfo } from '@/lib/constants/snaptrade-sync';
import {
  createAccount,
  connectSnapTrade,
  fetchSnapTradeStatus,
  importFile,
  previewFile,
  setLoginNickname,
  syncTransactions,
} from './api';
import { getBrokerInfo, toSyncBroker } from './broker';
import type {
  BrokerageAccount,
  ImportPreview,
  ImportResult,
  SnapTradeStatus,
  SyncResult,
  WizardStep,
} from './types';

interface AddAccountWizardProps {
  open: boolean;
  onClose: () => void;
  initialStep?: WizardStep;
  initialBroker?: BrokerKey | null;
  accounts: BrokerageAccount[];
  snapTradeStatus: SnapTradeStatus | undefined;
  refetchSnapTradeStatus: () => Promise<unknown>;
  loginNicknames: Record<string, string>;
  refetchLoginNicknames: () => void;
}

export function AddAccountWizard({
  open,
  onClose,
  initialStep,
  initialBroker,
  accounts,
  snapTradeStatus,
  refetchSnapTradeStatus,
  loginNicknames,
  refetchLoginNicknames,
}: AddAccountWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(initialStep ?? 'select-broker');
  const [selectedBroker, setSelectedBroker] = useState<BrokerKey | null>(initialBroker ?? null);
  const [accountName, setAccountName] = useState('');

  // File import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // SnapTrade state
  const [selectedSnaptradeAccounts, setSelectedSnaptradeAccounts] = useState<Set<string>>(new Set());
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Login nickname editing state
  const [editingNicknameAuthId, setEditingNicknameAuthId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');

  // Capture current time when wizard opens (avoids impure Date.now() during render)
  const [now, setNow] = useState(Date.now);

  // Sync initialStep/initialBroker when the wizard opens (React "set state during render" pattern)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setWizardStep(initialStep ?? 'select-broker');
    setSelectedBroker(initialBroker ?? null);
    setNow(Date.now);
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
    },
  });

  const connectMutation = useMutation({
    mutationFn: (broker?: string) => connectSnapTrade(broker),
    onSuccess: (redirectUrl) => {
      // Navigate in same window for full-screen experience (like onboarding)
      window.location.href = redirectUrl;
    },
  });

  const syncMutation = useMutation({
    mutationFn: (options: { snaptradeAccountIds: string[]; refresh?: boolean; forceDerivation?: boolean }) => syncTransactions(options),
    onSuccess: (data) => {
      setSyncResult(data);
      setWizardStep('success');
      refetchSnapTradeStatus();
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({ file, broker }: { file: File; broker: string }) => previewFile(file, broker),
    onSuccess: (data) => setPreview(data),
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, broker }: { file: File; broker: string }) => {
      // Create account first
      const account = await createAccount({
        broker,
        name: accountName || `${getBrokerInfo(broker).label} Account`,
        isDefault: accounts.length === 0,
      });
      // Then import file
      const result = await importFile(file, account.id, broker);
      return { account, result };
    },
    onSuccess: ({ result }) => {
      setImportResult(result);
      setWizardStep('success');
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const refreshAccountsMutation = useMutation({
    mutationFn: () => fetchSnapTradeStatus({ refresh: true }),
    onSuccess: () => {
      refetchSnapTradeStatus();
    },
  });

  const setNicknameMutation = useMutation({
    mutationFn: ({ authId, nickname }: { authId: string; nickname: string }) =>
      setLoginNickname(authId, nickname),
    onSuccess: () => {
      refetchLoginNicknames();
    },
  });

  // Reset wizard
  const resetWizard = () => {
    setWizardStep('select-broker');
    setSelectedBroker(null);
    setAccountName('');
    setSelectedFile(null);
    setPreview(null);
    setImportResult(null);
    setSyncResult(null);
    setSelectedSnaptradeAccounts(new Set());
    createMutation.reset();
    importMutation.reset();
    syncMutation.reset();
    previewMutation.reset();
    connectMutation.reset();
    refreshAccountsMutation.reset();
  };

  const closeWizard = () => {
    onClose();
    resetWizard();
  };

  // File handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedBroker) {
      const brokerConfig = SUPPORTED_BROKERS[selectedBroker];
      if (!brokerConfig.supportsFileImport || !brokerConfig.fileExtension) return;
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = brokerConfig.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        alert(`Please select a ${brokerConfig.fileType} file for ${brokerConfig.label}`);
        return;
      }
      setSelectedFile(file);
      setPreview(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && selectedBroker) {
      const brokerConfig = SUPPORTED_BROKERS[selectedBroker];
      if (!brokerConfig.supportsFileImport || !brokerConfig.fileExtension) return;
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = brokerConfig.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        alert(`Please select a ${brokerConfig.fileType} file for ${brokerConfig.label}`);
        return;
      }
      setSelectedFile(file);
      setPreview(null);
    }
  };

  const brokerConfig = selectedBroker ? SUPPORTED_BROKERS[selectedBroker] : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeWizard()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Step 1: Select Broker */}
        {wizardStep === 'select-broker' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Add Brokerage Account</DialogTitle>
              <DialogDescription>
                Select your broker to get started. We currently support Robinhood and Charles Schwab.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              {Object.entries(SUPPORTED_BROKERS).map(([key, broker]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedBroker(key as BrokerKey);
                    // For manual entry only, go directly to manual setup
                    if (!broker.supportsSync && !broker.supportsFileImport) {
                      setWizardStep('manual-setup');
                    } else {
                      setWizardStep('connection-method');
                    }
                  }}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
                    'hover:shadow-md hover:scale-[1.01]',
                    'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                  )}
                >
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', broker.color)}>
                    <Briefcase className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{broker.label}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{broker.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {broker.supportsSync && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400">
                          <Zap className="h-3 w-3" />
                          Real-time Sync
                        </span>
                      )}
                      {broker.supportsFileImport && broker.fileType && (
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          broker.bgColor, broker.textColor
                        )}>
                          <FileText className="h-3 w-3" />
                          {broker.fileType} Import
                        </span>
                      )}
                      {broker.supportsManualEntry && !broker.supportsFileImport && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          <Edit2 className="h-3 w-3" />
                          Manual Entry
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-400" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Connection Method */}
        {wizardStep === 'connection-method' && brokerConfig && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWizardStep('select-broker')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-xl">Connect {brokerConfig.label}</DialogTitle>
                  <DialogDescription>
                    Choose how you want to import your transactions
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Account Name Input */}
              <div className="space-y-2">
                <Label htmlFor="account-name">Account Name</Label>
                <Input
                  id="account-name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={`e.g., ${brokerConfig.label} Individual, IRA`}
                />
                <p className="text-xs text-zinc-500">A friendly name to identify this account</p>
              </div>

              {/* Connection Options */}
              <div className="grid gap-3">
                {/* SnapTrade Option (Robinhood only) */}
                {brokerConfig.supportsSync && (
                  <button
                    type="button"
                    onClick={() => setWizardStep('connect-snaptrade')}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                      'hover:shadow-md border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                      <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        Connect via SnapTrade
                        <span className="text-xs font-normal px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded">
                          Recommended
                        </span>
                      </h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Securely connect for automatic transaction sync. Read-only access.
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Auto-sync
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Real-time
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Secure
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-blue-400" />
                  </button>
                )}

                {/* File Import Option */}
                {brokerConfig.supportsFileImport && (
                  <button
                    type="button"
                    onClick={() => setWizardStep('import-file')}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                      'hover:shadow-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      {brokerConfig.fileType === 'JSON' ? (
                        <FileJson className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Import {brokerConfig.fileType} File
                      </h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Upload a transaction history export from {brokerConfig.label}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          Manual upload
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {brokerConfig.fileExtension} file
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </button>
                )}

                {/* Manual Entry Option */}
                {brokerConfig.supportsManualEntry && (
                  <button
                    type="button"
                    onClick={() => setWizardStep('manual-setup')}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                      'hover:shadow-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      <Edit2 className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Manual Entry Only
                      </h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Create an account and enter trades manually
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Edit2 className="h-3 w-3" />
                          Add trades one by one
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Step 3a: Connect SnapTrade */}
        {wizardStep === 'connect-snaptrade' && brokerConfig && (() => {
          // Filter accounts to only show those matching the selected broker
          const brokerInstitutionNames: Record<string, string[]> = {
            robinhood: ['Robinhood'],
            schwab: ['Charles Schwab', 'Schwab'],
            fidelity: ['Fidelity'],
            interactive_brokers: ['Interactive Brokers', 'IBKR'],
          };
          const matchingInstitutions = brokerInstitutionNames[selectedBroker || ''] || [];
            const matchingAccounts = (snapTradeStatus?.accounts || []).filter((acc) =>
              matchingInstitutions.some((name) =>
                acc.institutionName?.toLowerCase().includes(name.toLowerCase())
              )
            );
            const unsyncedMatchingAccounts = matchingAccounts.filter((acc) => !acc.isSynced);
            const matchingConnections = (snapTradeStatus?.connections || []).filter((conn) => {
              const connName = `${conn.brokerageDisplayName || conn.brokerageName || conn.brokerageSlug || ''}`;
              return matchingInstitutions.some((name) =>
                connName.toLowerCase().includes(name.toLowerCase())
              );
            });
            const activeMatchingConnections = matchingConnections.filter((conn) => !conn.disabled);
            const disabledMatchingConnections = matchingConnections.filter((conn) => conn.disabled);
            const hasBrokerAccounts = matchingAccounts.length > 0;
            const hasBrokerConnection = activeMatchingConnections.length > 0;
            const hasDisabledConnection = disabledMatchingConnections.length > 0;
            const recentAttempt = selectedBroker
              ? snapTradeStatus?.recentConnectionAttempts?.[selectedBroker]
              : undefined;
            const attemptDate = recentAttempt?.lastAttemptAt
              ? new Date(recentAttempt.lastAttemptAt)
              : null;
            const attemptHoursAgo = attemptDate
              ? Math.max(1, Math.round((now - attemptDate.getTime()) / (1000 * 60 * 60)))
              : null;
            const shouldShowPending = !hasBrokerAccounts && (hasBrokerConnection || !!recentAttempt);
            const connectionCreatedDate = activeMatchingConnections[0]?.createdDate
              ? new Date(activeMatchingConnections[0]!.createdDate as string)
              : null;
            const connectionHoursAgo = connectionCreatedDate
              ? Math.max(1, Math.round((now - connectionCreatedDate.getTime()) / (1000 * 60 * 60)))
              : null;
            const brokerSyncInfo = getBrokerSyncInfo(brokerConfig.label);

          // Group unsynced accounts by brokerageAuthorizationId for visual grouping
          const accountsByAuthId = unsyncedMatchingAccounts.reduce<Record<string, typeof unsyncedMatchingAccounts>>((acc, account) => {
            const authId = account.brokerageAuthorizationId || 'unknown';
            if (!acc[authId]) {
              acc[authId] = [];
            }
            acc[authId].push(account);
            return acc;
          }, {});
          const authorizationGroups = Object.entries(accountsByAuthId);
          const hasMultipleLogins = authorizationGroups.length > 1;

          return (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWizardStep('connection-method')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-xl">Connect {brokerConfig.label}</DialogTitle>
                  <DialogDescription>
                    Securely link your account for automatic sync
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-6">
                {hasDisabledConnection && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                          Connection disabled — reauth required
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          SnapTrade reports your {brokerConfig.label} connection is disabled. This usually means the
                          broker session expired or access was revoked. Reconnect to resume syncing.
                        </p>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            onClick={() => {
                              connectMutation.mutate(toSyncBroker(selectedBroker));
                            }}
                            disabled={connectMutation.isPending}
                            className={cn(brokerConfig.color, 'text-white hover:opacity-90')}
                          >
                            {connectMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Opening...
                              </>
                            ) : (
                              <>
                                <Link2 className="h-4 w-4 mr-2" />
                                Reconnect {brokerConfig.label}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {hasBrokerAccounts ? (
                  // Already connected to this specific broker - show accounts to sync
                  <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        Connected to {brokerConfig.label}
                      </span>
                    </div>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80 mb-3">
                      Select accounts to sync:
                      {hasMultipleLogins && (
                        <span className="block mt-1 text-emerald-500 dark:text-emerald-500">
                          You have {authorizationGroups.length} separate logins connected.
                        </span>
                      )}
                    </p>
                    <div className="space-y-4">
                      {authorizationGroups.map(([authId, groupAccounts], groupIndex) => (
                        <div key={authId} className="space-y-2">
                          {hasMultipleLogins && (
                            <div className="flex items-center gap-2 pb-1 border-b border-emerald-200/50 dark:border-emerald-800/50">
                              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                {groupIndex + 1}
                              </div>
                              {editingNicknameAuthId === authId ? (
                                <form
                                  className="flex items-center gap-1"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (nicknameInput.trim()) {
                                      setNicknameMutation.mutate({ authId, nickname: nicknameInput.trim() });
                                    }
                                    setEditingNicknameAuthId(null);
                                    setNicknameInput('');
                                  }}
                                >
                                  <Input
                                    autoFocus
                                    className="h-6 w-24 text-xs px-2"
                                    placeholder="Nickname"
                                    value={nicknameInput}
                                    onChange={(e) => setNicknameInput(e.target.value)}
                                    maxLength={50}
                                    onBlur={() => {
                                      if (nicknameInput.trim()) {
                                        setNicknameMutation.mutate({ authId, nickname: nicknameInput.trim() });
                                      }
                                      setEditingNicknameAuthId(null);
                                      setNicknameInput('');
                                    }}
                                  />
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                  onClick={() => {
                                    setEditingNicknameAuthId(authId);
                                    setNicknameInput(loginNicknames[authId] || '');
                                  }}
                                  title="Click to edit nickname"
                                >
                                  {loginNicknames[authId] || `Login ${groupIndex + 1}`}
                                  <Edit2 className="h-3 w-3 opacity-50" />
                                </button>
                              )}
                              <span className="text-xs text-emerald-500/70 dark:text-emerald-400/50">
                                ({groupAccounts.length} account{groupAccounts.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                          )}
                          {groupAccounts.map((account) => {
                            const isSnapTradeSyncing = account.snaptradeSync?.status === 'syncing';
                            const isReady = account.snaptradeSync?.isInitialSyncComplete ?? false;

                            return (
                              <label
                                key={account.id}
                                className={cn(
                                  'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                                  isSnapTradeSyncing
                                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                                    : selectedSnaptradeAccounts.has(account.id)
                                      ? 'bg-emerald-100 dark:bg-emerald-900/50'
                                      : 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSnaptradeAccounts.has(account.id)}
                                  onChange={(e) => {
                                    const newSet = new Set(selectedSnaptradeAccounts);
                                    if (e.target.checked) {
                                      newSet.add(account.id);
                                    } else {
                                      newSet.delete(account.id);
                                    }
                                    setSelectedSnaptradeAccounts(newSet);
                                  }}
                                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                      {account.name}
                                    </p>
                                    {(() => {
                                      const accountBrokerSyncInfo = getBrokerSyncInfo(account.institutionName);
                                      if (isSnapTradeSyncing) {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 animate-pulse">
                                            <Timer className="h-3 w-3" />
                                            ~{accountBrokerSyncInfo.typicalSyncTime}
                                          </span>
                                        );
                                      } else if (isReady) {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Ready
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                  <p className="text-xs text-zinc-500">
                                    {account.institutionName} • {account.number}
                                    {isSnapTradeSyncing && (
                                      <span className="ml-1 text-amber-600 dark:text-amber-400">• Syncing from broker</span>
                                    )}
                                    {!isSnapTradeSyncing && isReady && account.snaptradeSync?.firstTransactionDate && (
                                      <span className="ml-1">• History from {new Date(account.snaptradeSync.firstTransactionDate).toLocaleDateString()}</span>
                                    )}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                      {unsyncedMatchingAccounts.length === 0 && (
                        <p className="text-sm text-zinc-500 text-center py-4">
                          All {brokerConfig.label} accounts are already synced
                        </p>
                      )}
                    </div>

                    {/* Warning for accounts still syncing from broker */}
                    {(() => {
                      const accountsStillSyncing = unsyncedMatchingAccounts.filter(
                        a => a.snaptradeSync?.status === 'syncing' && selectedSnaptradeAccounts.has(a.id)
                      );

                      if (accountsStillSyncing.length > 0) {
                        // Get broker info for better messaging
                        const syncingBrokerSyncInfo = getBrokerSyncInfo(accountsStillSyncing[0].institutionName);

                        return (
                          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Timer className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                  {accountsStillSyncing.length === 1
                                    ? `Fetching data from ${syncingBrokerSyncInfo.name}`
                                    : `Fetching data for ${accountsStillSyncing.length} accounts`}
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                  {syncingBrokerSyncInfo.hasDelayedSync
                                    ? `${syncingBrokerSyncInfo.name} typically takes ${syncingBrokerSyncInfo.typicalSyncTime} for first-time sync. You can sync now with available data or wait for complete history.`
                                    : `Usually takes ${syncingBrokerSyncInfo.typicalSyncTime}. You can sync now with available data or wait for complete history.`
                                  }
                                </p>
                                {syncingBrokerSyncInfo.waitingTips.length > 0 && (
                                  <ul className="mt-2 space-y-1">
                                    {syncingBrokerSyncInfo.waitingTips.slice(0, 2).map((tip, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-xs text-amber-600/80 dark:text-amber-400/80">
                                        <CheckCircle2 className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                                        <span>{tip}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Check status & refresh buttons */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetchSnapTradeStatus()}
                        className="text-zinc-500 hover:text-zinc-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Check sync status
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => refreshAccountsMutation.mutate()}
                              disabled={refreshAccountsMutation.isPending}
                              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                            >
                              {refreshAccountsMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {refreshAccountsMutation.isPending ? 'Refreshing...' : 'Refresh Accounts'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>Ask your broker for the latest account list. Use this if you created new accounts (e.g., IRA, crypto) after your initial connection.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {/* Option to connect another account (e.g., spouse's account) */}
                  <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                        <Plus className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                          Connect Another {brokerConfig.label} Account
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Add a different {brokerConfig.label} login (e.g., spouse&apos;s account) to get a combined view of all holdings.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Only pass broker if it's a valid sync broker
                            connectMutation.mutate(toSyncBroker(selectedBroker));
                          }}
                          disabled={connectMutation.isPending}
                          className="text-violet-600 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-950/30"
                        >
                          {connectMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                          )}
                          Connect Another Login
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* What sync does - info box */}
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        <p className="font-medium mb-1">What happens when you sync:</p>
                        <ul className="text-xs space-y-0.5 text-blue-600/80 dark:text-blue-400/80">
                          <li>• Fetches latest transactions from your broker</li>
                          <li>• Imports new trades into your journal</li>
                          <li>• Recalculates positions and P&L</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={closeWizard}>
                      Cancel
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => {
                              if (selectedSnaptradeAccounts.size > 0) {
                                setWizardStep('processing');
                                syncMutation.mutate({ snaptradeAccountIds: Array.from(selectedSnaptradeAccounts), refresh: true, forceDerivation: true });
                              }
                            }}
                            disabled={selectedSnaptradeAccounts.size === 0 || syncMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {syncMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Sync {selectedSnaptradeAccounts.size} Account{selectedSnaptradeAccounts.size !== 1 ? 's' : ''}
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>Fetch latest transactions, import new trades, and recalculate all positions and P&L</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </DialogFooter>
                </div>
                ) : shouldShowPending ? (
                  // Connection attempt detected but no accounts yet
                  <div className="space-y-6">
                    <div className="text-center py-4">
                      <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {hasBrokerConnection ? 'Connection saved' : 'Connection received'}
                      </h3>
                      <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-2">
                        {hasBrokerConnection
                          ? `We can see your ${brokerConfig.label} connection in SnapTrade, but no accounts have been delivered yet.`
                          : `We haven&apos;t received any ${brokerConfig.label} accounts yet. If you just connected, it can take a bit to show up.`}
                      </p>
                      {connectionHoursAgo !== null && hasBrokerConnection && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Connection created: {connectionHoursAgo} hour{connectionHoursAgo === 1 ? '' : 's'} ago
                        </p>
                      )}
                      {attemptHoursAgo !== null && !hasBrokerConnection && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Last connection attempt: {attemptHoursAgo} hour{attemptHoursAgo === 1 ? '' : 's'} ago
                        </p>
                      )}
                    </div>

                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <Timer className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                            {brokerSyncInfo.hasDelayedSync
                              ? `${brokerSyncInfo.name} initial sync can take ${brokerSyncInfo.typicalSyncTime}`
                              : `Initial sync usually takes ${brokerSyncInfo.typicalSyncTime}`}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            We&apos;ll keep checking for accounts. If nothing appears after the expected window, reconnect or contact support.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => refetchSnapTradeStatus()}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Check Connection
                      </Button>
                      <Button
                        onClick={() => {
                          connectMutation.mutate(toSyncBroker(selectedBroker));
                        }}
                        disabled={connectMutation.isPending}
                        className={cn(brokerConfig.color, 'text-white hover:opacity-90')}
                      >
                        {connectMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-2" />
                            Reconnect {brokerConfig.label}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Not connected - show connect flow
                  <div className="space-y-6">
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                      <Link2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                      {selectedBroker === 'interactive_brokers'
                        ? 'Connect your Interactive Brokers account via Third-Party Reports.'
                        : `You'll be redirected to SnapTrade to securely connect your ${brokerConfig.label} account.`}
                    </p>
                  </div>

                  {/* Steps - broker-specific */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3">
                    {(selectedBroker === 'interactive_brokers' ? [
                      { step: 1, text: 'Click Connect below' },
                      { step: 2, text: 'Log in to IBKR Client Portal' },
                      { step: 3, text: 'Go to Performance & Reports → Third-Party Reports' },
                      { step: 4, text: 'Enable SnapTrade and copy your Token + Query ID' },
                      { step: 5, text: 'Enter credentials in SnapTrade and return here' },
                    ] : [
                      { step: 1, text: 'Click Connect below' },
                      { step: 2, text: `Log in to ${brokerConfig.label}` },
                      { step: 3, text: 'Authorize read-only access' },
                      { step: 4, text: 'Return here to sync' },
                    ]).map(({ step, text }) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600">
                          {step}
                        </div>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">{text}</span>
                      </div>
                    ))}
                  </div>

                  {/* IBKR-specific note about initial sync delay */}
                  {selectedBroker === 'interactive_brokers' && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        <strong>Note:</strong> IBKR uses Third-Party Reports, not OAuth. Initial data sync takes 24-48 hours after enabling SnapTrade access in your IBKR account.
                      </p>
                    </div>
                  )}

                  {/* Security badges */}
                  <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Read-only
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Bank-level security
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Disconnect anytime
                    </span>
                  </div>

                  {connectMutation.isError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {connectMutation.error.message}
                      </p>
                    </div>
                  )}

                  {connectMutation.isSuccess && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                        SnapTrade window opened. Complete the connection, then click below.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchSnapTradeStatus()}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Check Connection
                      </Button>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={closeWizard}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        // Only pass broker if it's a valid sync broker
                        connectMutation.mutate(toSyncBroker(selectedBroker));
                      }}
                      disabled={connectMutation.isPending}
                      className={cn(brokerConfig.color, 'text-white hover:opacity-90')}
                    >
                      {connectMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 mr-2" />
                          Connect {brokerConfig.label}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          </>
          );
        })()}

        {/* Step 3b: Import File */}
        {wizardStep === 'import-file' && brokerConfig && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWizardStep('connection-method')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-xl">Import {brokerConfig.fileType}</DialogTitle>
                  <DialogDescription>
                    Upload your transaction history from {brokerConfig.label}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    How to export from {brokerConfig.label}
                  </span>
                </div>
                <ol className="space-y-1">
                  {brokerConfig.instructions.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-600/80 dark:text-blue-400/80">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-xs font-semibold flex items-center justify-center">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Drop Zone */}
              <div
                className={cn(
                  'relative border-2 border-dashed rounded-xl p-8 text-center transition-all',
                  dragActive
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 scale-[1.01]'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept={brokerConfig.fileExtension || undefined}
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    dragActive ? 'bg-emerald-100' : 'bg-zinc-100 dark:bg-zinc-800'
                  )}>
                    <Upload className={cn(
                      'h-6 w-6',
                      dragActive ? 'text-emerald-600' : 'text-zinc-400'
                    )} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {selectedFile ? selectedFile.name : `Drop your ${brokerConfig.fileType} file here`}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">or click to browse</p>
                  </div>
                </div>
              </div>

              {/* File Selected - Preview */}
              {selectedFile && !preview && (
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {brokerConfig.fileType === 'JSON' ? (
                      <FileJson className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => previewMutation.mutate({ file: selectedFile, broker: selectedBroker! })}
                      disabled={previewMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {previewMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Analyzing
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-1.5" />
                          Preview
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Preview Error */}
              {previewMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {previewMutation.error.message}
                  </p>
                </div>
              )}

              {/* Preview Result */}
              {preview && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="h-5 w-5 text-emerald-600" />
                    <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
                      Import Preview
                    </h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-xl font-bold text-emerald-600">{preview.summary.toImport}</p>
                      <p className="text-[10px] text-zinc-500">To Import</p>
                    </div>
                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-xl font-bold text-orange-500">{preview.summary.duplicates}</p>
                      <p className="text-[10px] text-zinc-500">Duplicates</p>
                    </div>
                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-xl font-bold text-blue-600">{preview.summary.byType.stocks}</p>
                      <p className="text-[10px] text-zinc-500">Stocks</p>
                    </div>
                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg text-center">
                      <p className="text-xl font-bold text-purple-600">{preview.summary.byType.options}</p>
                      <p className="text-[10px] text-zinc-500">Options</p>
                    </div>
                  </div>

                  {/* Sample trades */}
                  {preview.sampleTrades.length > 0 && (
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {preview.sampleTrades.slice(0, 3).map((trade, i) => (
                        <div key={i} className="text-xs p-2 bg-white dark:bg-zinc-900 rounded flex items-center justify-between">
                          <span className="font-semibold">{trade.ticker}</span>
                          <span className="text-zinc-500">{trade.type} · {trade.quantity} @ ${trade.entryPrice}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Import Error */}
              {importMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {importMutation.error.message}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeWizard}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedFile && selectedBroker) {
                      setWizardStep('processing');
                      importMutation.mutate({ file: selectedFile, broker: selectedBroker });
                    }
                  }}
                  disabled={!preview || preview.summary.toImport === 0 || importMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${preview?.summary.toImport || 0} Trades`
                  )}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* Step 3c: Manual Setup */}
        {wizardStep === 'manual-setup' && brokerConfig && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Go back based on broker type
                    if (brokerConfig.supportsSync || brokerConfig.supportsFileImport) {
                      setWizardStep('connection-method');
                    } else {
                      setWizardStep('select-broker');
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-xl">Create {brokerConfig.label === 'Manual Entry' ? '' : brokerConfig.label} Account</DialogTitle>
                  <DialogDescription>
                    Set up an account for manual trade entry
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-account-name">Account Name</Label>
                <Input
                  id="manual-account-name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={`e.g., ${brokerConfig.label === 'Manual Entry' ? 'My Brokerage' : brokerConfig.label} Individual, IRA`}
                />
                <p className="text-xs text-zinc-500">A friendly name to identify this account</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Add trades manually
                    </p>
                    <p className="text-xs text-zinc-500">
                      Record stock and option trades one at a time
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Track P&L automatically
                    </p>
                    <p className="text-xs text-zinc-500">
                      Position matching and profit calculations handled for you
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Import later (optional)
                    </p>
                    <p className="text-xs text-zinc-500">
                      You can always import a file or connect via SnapTrade later
                    </p>
                  </div>
                </div>
              </div>

              {createMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {createMutation.error.message}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeWizard}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!accountName.trim()) {
                      return;
                    }
                    try {
                      await createMutation.mutateAsync({
                        broker: selectedBroker!,
                        name: accountName.trim(),
                        isDefault: accounts.length === 0,
                      });
                      setWizardStep('success');
                      setImportResult(null);
                      setSyncResult(null);
                    } catch {
                      // Error handled by mutation
                    }
                  }}
                  disabled={!accountName.trim() || createMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* Step 4: Processing */}
        {wizardStep === 'processing' && (
          <div className="py-12 text-center">
            <div className="relative mx-auto w-16 h-16 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-200 dark:border-emerald-800" />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              {importMutation.isPending ? 'Importing Transactions...' : 'Syncing Transactions...'}
            </h3>
            <p className="text-sm text-zinc-500">
              This may take a moment. Please don&apos;t close this dialog.
            </p>
          </div>
        )}

        {/* Step 5: Success */}
        {wizardStep === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
                {importResult ? 'Import Complete!' : syncResult ? 'Sync Complete!' : 'Account Created!'}
              </DialogTitle>
            </DialogHeader>

            <div className="py-6 space-y-4">
              {importResult && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-emerald-600">{importResult.inserted}</p>
                    <p className="text-xs text-zinc-500">Imported</p>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-500">{importResult.duplicates}</p>
                    <p className="text-xs text-zinc-500">Duplicates</p>
                  </div>
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-center">
                    <p className="text-2xl font-bold text-zinc-500">{importResult.skippedRows}</p>
                    <p className="text-xs text-zinc-500">Skipped</p>
                  </div>
                </div>
              )}

              {syncResult && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-emerald-600">{syncResult.stats.totalImported}</p>
                    <p className="text-xs text-zinc-500">Imported</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-600">{syncResult.stats.accountsSynced}</p>
                    <p className="text-xs text-zinc-500">Accounts</p>
                  </div>
                </div>
              )}

              {/* Manual account created - no import/sync result */}
              {!importResult && !syncResult && (
                <div className="text-center space-y-4">
                  <p className="text-sm text-zinc-500">
                    Your account has been created. You can now add trades manually.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/trade/new/stock">
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Stock Trade
                      </Button>
                    </Link>
                    <Link href="/trade/new/option/long_call">
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Option Trade
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {importResult && (
                  <Link href={`/import/report/${importResult.importBatchId}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <FileText className="h-4 w-4 mr-2" />
                      View Report
                    </Button>
                  </Link>
                )}
                <Button
                  onClick={() => {
                    closeWizard();
                    router.push('/dashboard');
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
