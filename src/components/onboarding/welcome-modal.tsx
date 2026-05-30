/**
 * Welcome Modal Component
 *
 * Shows when a user has no brokerage accounts, prompting them to create their first one.
 * Full-screen modal with a friendly onboarding experience.
 * Supports SnapTrade connection for Robinhood/Schwab/Fidelity/IBKR and CSV/JSON import for brokers.
 */

'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  ChevronRight,
  Loader2,
  Wallet,
  TrendingUp,
  BarChart3,
  PieChart,
  CheckCircle2,
  RefreshCw,
  Zap,
  Upload,
  FileSpreadsheet,
  FileJson,
  Edit2,
  Info,
  HelpCircle,
  ExternalLink,
  Eye,
  X,
  ArrowLeft,
  Clock,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { BROKER_LIST, type BrokerKey } from '@/lib/constants/brokers';
import { getBrokerSyncInfo, SYNC_PROGRESS_STEPS, type SnapTradeSyncStatus } from '@/lib/constants/snaptrade-sync';

// Use shared broker configuration
const BROKERS = [...BROKER_LIST].sort((a, b) => {
  if (a.id === 'manual') return -1;
  if (b.id === 'manual') return 1;
  return 0;
});

interface WelcomeModalProps {
  onComplete: () => void;
}

async function createAccount(data: { name: string; broker: string }): Promise<{ id: string }> {
  const response = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      isDefault: true,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to create account'));
  }

  return apiData(await parseApiJson(response));
}

interface SnapTradeAccount {
  id: string;
  name: string;
  number: string;
  institutionName: string;
  isSynced: boolean;
  transactionCount: number;
  snaptradeSync?: {
    isInitialSyncComplete: boolean;
    firstTransactionDate: string | null;
    lastSuccessfulSync: string | null;
    status: SnapTradeSyncStatus;
  };
}

interface SnapTradeStatus {
  configured: boolean;
  isConnected: boolean;
  hasCredentials?: boolean;
  recentConnectionAttempts?: Record<string, { lastAttemptAt: string; count: number }>;
  connections?: Array<{
    id: string;
    brokerageName: string;
    brokerageSlug?: string;
    brokerageDisplayName?: string;
    connectionName?: string;
    createdDate?: string | null;
    disabled?: boolean;
    type?: string;
  }>;
  accounts: SnapTradeAccount[];
}

interface ImportPreview {
  summary: {
    totalRows: number;
    toImport: number;
    duplicates: number;
    byType: { stocks: number; options: number };
  };
  sampleTrades: Array<{
    ticker: string;
    type: string;
    quantity: number;
    entryPrice: string;
  }>;
}

interface ImportResult {
  success: boolean;
  importBatchId: string;
  inserted: number;
  duplicates: number;
  skippedRows: number;
}

async function getConnectionLink(broker: string): Promise<string> {
  const response = await fetch('/api/sync/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      broker,
      redirectUri: `${window.location.origin}/dashboard?snaptrade_connected=true`,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to get connection link'));
  }

  const result = await parseApiJson(response);
  return apiData<{ connectionLink: string }>(result).connectionLink;
}

async function fetchSnapTradeStatus(): Promise<SnapTradeStatus> {
  const response = await fetch('/api/sync/connect');
  if (!response.ok) {
    throw new Error('Failed to fetch connection status');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

async function syncTransactions(accountIds: string[]): Promise<void> {
  const response = await fetch('/api/sync/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snaptradeAccountIds: accountIds,
      refresh: true,
      forceDerivation: true,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to sync transactions'));
  }
}

async function previewFile(file: File, broker: string): Promise<ImportPreview> {
  const content = await file.text();
  const res = await fetch('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, content, skipDuplicates: true, broker }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to preview file'));
  }
  return apiData(await parseApiJson(res));
}

async function importFile(file: File, brokerageAccountId: string, broker: string): Promise<ImportResult> {
  const content = await file.text();
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, content, brokerageAccountId, broker }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to import file'));
  }
  return apiData(await parseApiJson(res));
}

type StepType = 'welcome' | 'select-broker' | 'connect-method' | 'connecting' | 'select-accounts' | 'syncing' | 'import-file' | 'importing' | 'manual-setup' | 'success';
type BrokerId = BrokerKey;

// Step progress indicator
const STEPS = [
  { key: 'select-broker', label: 'Choose Broker' },
  { key: 'connect-method', label: 'Connect' },
  { key: 'import', label: 'Import Data' },
  { key: 'success', label: 'Done' },
] as const;

const STEP_METADATA: Record<
  StepType,
  {
    label: string;
    title: string;
    description: string;
  }
> = {
  welcome: {
    label: 'Welcome',
    title: 'Set up your trading workspace',
    description: 'Start with manual entry, or connect/import from your broker. Most users finish in about 2 minutes.',
  },
  'select-broker': {
    label: 'Step 1',
    title: 'Choose your setup path',
    description: 'Start with manual entry or pick a broker connection. You can add more brokers later.',
  },
  'connect-method': {
    label: 'Step 2',
    title: 'Choose import method',
    description: 'Auto-sync is easiest, but file import also works great.',
  },
  connecting: {
    label: 'Connecting',
    title: 'Opening secure broker link',
    description: 'You are being redirected to authorize read-only access.',
  },
  'select-accounts': {
    label: 'Step 3',
    title: 'Select accounts to sync',
    description: 'Choose which connected accounts to bring into your journal.',
  },
  syncing: {
    label: 'Syncing',
    title: 'Sync in progress',
    description: 'Fetching transactions and calculating your positions.',
  },
  'import-file': {
    label: 'Step 3',
    title: 'Upload trade file',
    description: 'Preview before import so you know exactly what will be added.',
  },
  importing: {
    label: 'Importing',
    title: 'Import in progress',
    description: 'Validating file rows and deriving your portfolio state.',
  },
  'manual-setup': {
    label: 'Step 3',
    title: 'Create manual account',
    description: 'Track trades manually now, then connect or import later if you want.',
  },
  success: {
    label: 'Complete',
    title: 'You are ready',
    description: 'Your workspace is set up. Next step is reviewing dashboard insights.',
  },
};

function getStepIndex(step: StepType): number {
  if (step === 'welcome') return -1;
  if (step === 'select-broker') return 0;
  if (step === 'connect-method' || step === 'connecting') return 1;
  if (step === 'select-accounts' || step === 'syncing' || step === 'import-file' || step === 'importing' || step === 'manual-setup') return 2;
  if (step === 'success') return 3;
  return 0;
}

function StepIndicator({ currentStep }: { currentStep: StepType }) {
  const stepIndex = getStepIndex(currentStep);
  if (stepIndex < 0) return null;

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 sm:mb-6">
      {STEPS.map((s, i) => {
        const isActive = i === stepIndex;
        const isComplete = i < stepIndex;
        return (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium transition-all',
                  isComplete
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-white text-zinc-900 ring-2 ring-white/50'
                      : 'bg-white/20 text-white/60'
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  'text-[9px] sm:text-[10px] mt-0.5 sm:mt-1 whitespace-nowrap',
                  isActive ? 'text-white font-medium' : 'text-white/60'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-5 sm:w-8 h-0.5 mb-3 sm:mb-4',
                  isComplete ? 'bg-emerald-500' : 'bg-white/20'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<StepType>('welcome');
  const [selectedBroker, setSelectedBroker] = useState<BrokerId | null>(null);
  const [accountName, setAccountName] = useState('');
  const [selectedSnapTradeAccounts, setSelectedSnapTradeAccounts] = useState<Set<string>>(new Set());
  const hasCheckedRedirect = useRef(false);

  // File import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);

  // Check for SnapTrade redirect on mount
  useEffect(() => {
    if (hasCheckedRedirect.current) return;
    hasCheckedRedirect.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const justConnected = urlParams.get('snaptrade_connected') === 'true';

    if (justConnected) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);

      setTimeout(() => {
        setStep('select-accounts');
        setSelectedBroker('robinhood');
      }, 0);
    }
  }, []);

  // Fetch SnapTrade status
  const {
    data: snapTradeStatus,
    isLoading: isLoadingStatus,
    error: snapTradeStatusError,
    refetch: refetchSnapTradeStatus,
  } = useQuery({
    queryKey: ['snaptrade-status-welcome'],
    queryFn: fetchSnapTradeStatus,
    enabled: step === 'select-accounts' || step === 'connecting',
    refetchInterval: step === 'connecting' ? 2000 : false,
  });

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
    },
  });

  const connectMutation = useMutation({
    mutationFn: getConnectionLink,
    onSuccess: (connectionLink) => {
      window.location.href = connectionLink;
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncTransactions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      setStep('success');
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({ file, broker }: { file: File; broker: string }) => previewFile(file, broker),
    onSuccess: (data) => setPreview(data),
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, broker, accountId }: { file: File; broker: string; accountId: string }) => {
      const result = await importFile(file, accountId, broker);
      return result;
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      setStep('success');
    },
  });

  const selectedBrokerInfo = BROKERS.find((b) => b.id === selectedBroker);

  // File handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedBrokerInfo?.supportsFileImport && selectedBrokerInfo.fileExtension) {
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = selectedBrokerInfo.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        setFileValidationError(`Please select a ${selectedBrokerInfo.fileType} file for ${selectedBrokerInfo.name}.`);
        return;
      }
      setFileValidationError(null);
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
    if (file && selectedBrokerInfo?.supportsFileImport && selectedBrokerInfo.fileExtension) {
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = selectedBrokerInfo.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        setFileValidationError(`Please select a ${selectedBrokerInfo.fileType} file for ${selectedBrokerInfo.name}.`);
        return;
      }
      setFileValidationError(null);
      setSelectedFile(file);
      setPreview(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedBroker || !selectedBrokerInfo) return;

    setStep('importing');
    try {
      // Create account first
      const account = await createMutation.mutateAsync({
        name: accountName || `${selectedBrokerInfo.name} Account`,
        broker: selectedBroker,
      });

      // Then import file
      await importMutation.mutateAsync({
        file: selectedFile,
        broker: selectedBroker,
        accountId: account.id,
      });
    } catch {
      // Error handled by mutation
      setStep('import-file');
    }
  };

  const handleCreateManualAccount = async () => {
    if (!accountName.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: accountName.trim(),
        broker: 'manual',
      });
      setStep('success');
    } catch {
      // Error handled by mutation
    }
  };

  const resetFileState = () => {
    setSelectedFile(null);
    setPreview(null);
    setImportResult(null);
    setFileValidationError(null);
    previewMutation.reset();
    importMutation.reset();
  };

  const isBlockingStep = step === 'syncing' || step === 'importing';
  const showSkipAction = step !== 'success' && !isBlockingStep;
  const stepMeta = STEP_METADATA[step];
  const selectedBrokerConfig = selectedBroker ? BROKERS.find((broker) => broker.id === selectedBroker) ?? null : null;
  const selectedBrokerCta = selectedBrokerConfig
    ? selectedBrokerConfig.id === 'manual'
      ? 'Create Manual Account'
      : selectedBrokerConfig.supportsSync
        ? 'Choose Connect Method'
        : selectedBrokerConfig.supportsFileImport
          ? `Import ${selectedBrokerConfig.fileType ?? 'File'}`
          : 'Continue'
    : 'Continue';

  // Keep step transitions predictable by resetting the scroll position.
  // On mobile the outer container scrolls; on desktop the card content scrolls.
  useEffect(() => {
    const isMobile = window.innerWidth < 640;
    const target = isMobile ? outerRef.current : scrollContainerRef.current;
    if (!target || typeof target.scrollTo !== 'function') return;
    target.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  return (
    <div
      ref={outerRef}
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 sm:bg-zinc-950/95 sm:backdrop-blur-sm p-0 sm:p-6"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl">
        <Card className="flex w-full flex-col border-0 sm:border border-zinc-800 bg-zinc-950 sm:bg-zinc-950/90 shadow-none sm:shadow-2xl rounded-none sm:rounded-xl sm:max-h-[calc(100dvh-3rem)] sm:overflow-hidden">
          <CardHeader className="shrink-0 sm:border-b sm:border-zinc-800/80 px-4 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
            <div className="flex items-center sm:items-start justify-between gap-3">
              <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0 sm:space-y-2 min-w-0">
                <Badge
                  variant="secondary"
                  className="w-fit bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 shrink-0 text-[10px] sm:text-xs"
                >
                  {stepMeta.label}
                </Badge>
                <CardTitle className="text-base sm:text-2xl text-white truncate sm:whitespace-normal">{stepMeta.title}</CardTitle>
                <CardDescription className="text-zinc-400 max-w-2xl hidden sm:block">
                  {stepMeta.description}
                </CardDescription>
              </div>
              {showSkipAction && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onComplete}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 shrink-0 text-xs px-2 sm:px-3 sm:border sm:border-zinc-700 sm:text-zinc-300 sm:hover:bg-zinc-800"
                >
                  Skip
                  <span className="hidden sm:inline">&nbsp;for now</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent
            ref={scrollContainerRef}
            className="min-h-0 flex-1 sm:overflow-y-auto sm:overscroll-contain p-4 sm:p-6 pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Welcome Step */}
        {step === 'welcome' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-xl sm:rounded-2xl border border-zinc-800 bg-linear-to-br from-zinc-900 to-zinc-950 p-4 sm:p-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="inline-flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                  <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-300" />
                </div>
                <div className="space-y-1.5 sm:space-y-2 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-white">Welcome to Average Joe Trades</h1>
                  <p className="text-sm sm:text-base text-zinc-400">
                    Set up accounts, import history, and unlock dashboard + AI insights.
                  </p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-0.5 sm:pt-1">
                    <Badge className="bg-zinc-800 text-zinc-200 border-zinc-700 text-[10px] sm:text-xs">~2 min setup</Badge>
                    <Badge className="bg-zinc-800 text-zinc-200 border-zinc-700 text-[10px] sm:text-xs">Read-only access</Badge>
                    <Badge className="bg-zinc-800 text-zinc-200 border-zinc-700 text-[10px] sm:text-xs">Options + stocks</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
                <div className="mb-1.5 sm:mb-2 inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-emerald-500/15">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-zinc-100">Track P&L</p>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 sm:mt-1 hidden sm:block">FIFO positions and realized closes are auto-calculated.</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
                <div className="mb-1.5 sm:mb-2 inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-blue-500/15">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-zinc-100">Performance</p>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 sm:mt-1 hidden sm:block">See win rate, drawdowns, and trade-quality patterns.</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
                <div className="mb-1.5 sm:mb-2 inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-violet-500/15">
                  <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-violet-400" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-zinc-100">AI Insights</p>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 sm:mt-1 hidden sm:block">Action cards explain what to do next and why.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <Button
                size="lg"
                onClick={() => setStep('select-broker')}
                className="sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white order-first"
              >
                Get started
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedBroker('manual');
                  setAccountName('');
                  setStep('manual-setup');
                }}
                className="sm:flex-1 border-emerald-700 text-emerald-300 hover:bg-emerald-950/40"
              >
                Start with manual entry
              </Button>
              <Button
                variant="ghost"
                onClick={onComplete}
                className="sm:flex-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              >
                Explore dashboard first
              </Button>
            </div>
          </div>
        )}

        {/* Select Broker Step */}
        {step === 'select-broker' && (
          <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-0">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-1 sm:space-y-2 sm:block hidden">
              <h2 className="text-lg sm:text-2xl font-bold text-white">Choose Your Setup Path</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Pick a broker or start with manual entry. You can add more later.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:hidden">
              <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                Manual first supported
              </Badge>
              <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px]">
                Auto-sync optional
              </Badge>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-linear-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-900/30 p-3 sm:p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Selected Path</p>
              {selectedBrokerConfig ? (
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-white">{selectedBrokerConfig.name}</p>
                    <p className="text-xs sm:text-sm text-zinc-400">
                      {selectedBrokerConfig.id === 'manual'
                        ? 'Start immediately with manual trades, then connect/import later.'
                        : selectedBrokerConfig.supportsSync
                          ? 'Next you will choose auto-sync or file import.'
                          : 'Next you will upload a trade history file.'}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                    Ready
                  </Badge>
                </div>
              ) : (
                <p className="mt-2 text-xs sm:text-sm text-zinc-400">
                  Pick any path below. You can add more brokers and methods later from Accounts/Import.
                </p>
              )}
            </div>

            {/* Broker Options */}
            <div className="space-y-2 sm:space-y-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/35 p-2 sm:p-3">
              {BROKERS.map((broker) => (
                <button
                  key={broker.id}
                  onClick={() => setSelectedBroker(broker.id)}
                  className={cn(
                    'group w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left',
                    'sm:hover:-translate-y-0.5 motion-reduce:sm:hover:translate-y-0',
                    selectedBroker === broker.id
                      ? 'border-emerald-500/90 ring-1 ring-emerald-400/30 shadow-lg shadow-emerald-950/25 bg-linear-to-br from-emerald-500/15 via-emerald-500/8 to-zinc-900'
                      : 'border-zinc-800 bg-linear-to-br from-zinc-900 to-zinc-900/75 hover:border-zinc-700 hover:bg-zinc-900'
                  )}
                >
                  <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0', broker.color)}>
                    {broker.id === 'manual' ? (
                      <Edit2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    ) : (
                      <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-white">{broker.name}</p>
                    <p className="text-xs sm:text-sm text-zinc-400 line-clamp-1 sm:line-clamp-none">{broker.description}</p>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                      {broker.supportsSync && (
                        <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-500/20 text-blue-400">
                          <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          Auto-sync
                        </span>
                      )}
                      {broker.supportsFileImport && broker.fileType && (
                        <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-zinc-700 text-zinc-300">
                          {broker.fileType === 'JSON' ? (
                            <FileJson className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          ) : (
                            <FileSpreadsheet className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          )}
                          {broker.fileType}
                        </span>
                      )}
                      {broker.id === 'manual' && (
                        <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/20 text-emerald-300">
                          Quick start
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {selectedBroker === broker.id && (
                      <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500" />
                    )}
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 sm:h-5 sm:w-5 transition-all',
                        selectedBroker === broker.id
                          ? 'text-emerald-300 translate-x-0.5'
                          : 'text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5'
                      )}
                    />
                  </div>
                </button>
              ))}
            </div>

            {/* Help tip */}
            <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-linear-to-r from-blue-500/12 to-zinc-900 border border-blue-500/25">
              <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-blue-300">
                <span className="font-medium">Not sure?</span>{' '}
                <span className="text-blue-400/80">We recommend SnapTrade auto-sync for the easiest setup.</span>
              </p>
            </div>

            {/* Navigation */}
            <div className="sticky bottom-[max(0.25rem,env(safe-area-inset-bottom))] sm:static z-20 -mx-1 px-1 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 bg-linear-to-t from-zinc-950 via-zinc-950/95 to-transparent backdrop-blur-sm">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/90 p-2 shadow-xl shadow-black/30 sm:border-none sm:bg-transparent sm:p-0 sm:shadow-none">
                <div className="flex gap-2 sm:gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep('welcome')}
                    className="flex-1 h-11 sm:h-10 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedBroker) {
                        const broker = BROKERS.find((b) => b.id === selectedBroker);
                        if (broker?.id === 'manual') {
                          setAccountName('');
                          setStep('manual-setup');
                        } else if (broker?.supportsSync) {
                          setStep('connect-method');
                        } else if (broker?.supportsFileImport) {
                          setAccountName(broker.name);
                          resetFileState();
                          setStep('import-file');
                        }
                      }
                    }}
                    disabled={!selectedBroker}
                    className="flex-1 h-11 sm:h-10 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {selectedBrokerCta}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connect Method Step (for Robinhood) */}
        {step === 'connect-method' && selectedBrokerInfo && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-1.5 sm:space-y-2">
              <div
                className={cn(
                  'w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-4',
                  selectedBrokerInfo.color
                )}
              >
                <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Connect {selectedBrokerInfo.name}</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Choose how to import your transactions
              </p>
            </div>

            {/* Connection Options */}
            <div className="space-y-3">
              {/* SnapTrade Option */}
              {selectedBrokerInfo.supportsSync && (
                <button
                  onClick={() => {
                    if (selectedBroker) {
                      connectMutation.mutate(selectedBroker);
                    }
                  }}
                  disabled={connectMutation.isPending}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Zap className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">Connect with SnapTrade</p>
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Securely link your account for automatic trade imports. Read-only access, your credentials are never stored.
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> Auto-sync trades
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Bank-level security
                      </span>
                    </div>
                  </div>
                  {connectMutation.isPending && (
                    <Loader2 className="h-5 w-5 text-emerald-400 animate-spin shrink-0" />
                  )}
                </button>
              )}

              {/* File Import Option */}
              {selectedBrokerInfo.supportsFileImport && (
                <button
                  onClick={() => {
                    setAccountName(selectedBrokerInfo.name);
                    resetFileState();
                    setStep('import-file');
                  }}
                  disabled={connectMutation.isPending}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-zinc-700 bg-zinc-900 hover:border-zinc-600 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                    {selectedBrokerInfo.fileType === 'JSON' ? (
                      <FileJson className="h-6 w-6 text-zinc-400" />
                    ) : (
                      <FileSpreadsheet className="h-6 w-6 text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Import {selectedBrokerInfo.fileType} File</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      Upload your transaction history export from {selectedBrokerInfo.name}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Upload className="h-3 w-3" /> Manual upload
                      </span>
                      <span className="flex items-center gap-1">
                        {selectedBrokerInfo.fileExtension} file
                      </span>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Error Message */}
            {connectMutation.isError && (
              <p className="text-sm text-red-400 text-center">
                {connectMutation.error.message}
              </p>
            )}

            {/* Back Button */}
            <Button
              variant="outline"
              onClick={() => setStep('select-broker')}
              disabled={connectMutation.isPending}
              className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        )}

        {/* Import File Step */}
        {step === 'import-file' && selectedBrokerInfo && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-1.5 sm:space-y-2">
              <div
                className={cn(
                  'w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-4',
                  selectedBrokerInfo.color
                )}
              >
                {selectedBrokerInfo.fileType === 'JSON' ? (
                  <FileJson className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                ) : (
                  <FileSpreadsheet className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Import {selectedBrokerInfo.fileType} File</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Upload transaction history from {selectedBrokerInfo.name}
              </p>
            </div>

            {/* Account Name Input */}
            <div className="space-y-2">
              <Label htmlFor="account-name-import" className="text-sm font-medium text-zinc-300">
                Account Name
              </Label>
              <Input
                id="account-name-import"
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={`e.g., ${selectedBrokerInfo.name} Individual`}
                className="border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
              />
            </div>

            {/* Instructions Toggle */}
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-left"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">
                  How do I export from {selectedBrokerInfo.name}?
                </span>
              </div>
              <ChevronRight className={cn(
                'h-5 w-5 text-blue-400 transition-transform',
                showInstructions && 'rotate-90'
              )} />
            </button>

            {/* Instructions Panel */}
            {showInstructions && selectedBrokerInfo.instructions.length > 0 && (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Export Instructions for {selectedBrokerInfo.name}
                  </h3>
                  {selectedBrokerInfo.helpUrl && (
                    <a
                      href={selectedBrokerInfo.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      Open {selectedBrokerInfo.name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <ol className="space-y-2">
                  {selectedBrokerInfo.instructions.map((instruction, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-zinc-300 pt-0.5">{instruction}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-3">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/90">
                    Select the maximum date range available to import all your historical trades.
                    You can re-import the same file later - duplicates are automatically detected.
                  </p>
                </div>
              </div>
            )}

            {/* Drop Zone */}
            <div
              className={cn(
                'relative border-2 border-dashed rounded-xl p-5 sm:p-8 text-center transition-all',
                dragActive
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                  : 'border-zinc-700 hover:border-zinc-600'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept={selectedBrokerInfo.fileExtension || undefined}
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center',
                  dragActive ? 'bg-emerald-500/20' : 'bg-zinc-800'
                )}>
                  <Upload className={cn(
                    'h-6 w-6',
                    dragActive ? 'text-emerald-400' : 'text-zinc-400'
                  )} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    {selectedFile ? selectedFile.name : `Drop your ${selectedBrokerInfo.fileType} file here`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    or click to browse - {selectedBrokerInfo.fileExtension} files only
                  </p>
                </div>
              </div>
            </div>

            {fileValidationError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-300">{fileValidationError}</p>
              </div>
            )}

            {/* File Selected - Preview Button */}
            {selectedFile && !preview && (
              <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3">
                  {selectedBrokerInfo.fileType === 'JSON' ? (
                    <FileJson className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    className="text-zinc-400 hover:text-white"
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
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{previewMutation.error.message}</p>
              </div>
            )}

            {/* Preview Result */}
            {preview && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-semibold text-emerald-300">Import Preview</h3>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 bg-zinc-900 rounded-lg text-center">
                    <p className="text-xl font-bold text-emerald-400">{preview.summary.toImport}</p>
                    <p className="text-[10px] text-zinc-500">To Import</p>
                  </div>
                  <div className="p-2 bg-zinc-900 rounded-lg text-center">
                    <p className="text-xl font-bold text-orange-400">{preview.summary.duplicates}</p>
                    <p className="text-[10px] text-zinc-500">Duplicates</p>
                  </div>
                  <div className="p-2 bg-zinc-900 rounded-lg text-center">
                    <p className="text-xl font-bold text-blue-400">{preview.summary.byType.stocks}</p>
                    <p className="text-[10px] text-zinc-500">Stocks</p>
                  </div>
                  <div className="p-2 bg-zinc-900 rounded-lg text-center">
                    <p className="text-xl font-bold text-purple-400">{preview.summary.byType.options}</p>
                    <p className="text-[10px] text-zinc-500">Options</p>
                  </div>
                </div>

                {preview.sampleTrades.length > 0 && (
                  <div className="space-y-1 max-h-20 overflow-y-auto">
                    {preview.sampleTrades.slice(0, 3).map((trade, i) => (
                      <div key={i} className="text-xs p-2 bg-zinc-900 rounded flex items-center justify-between">
                        <span className="font-semibold text-white">{trade.ticker}</span>
                        <span className="text-zinc-400">{trade.type} - {trade.quantity} @ ${trade.entryPrice}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Import Error */}
            {importMutation.isError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{importMutation.error.message}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  resetFileState();
                  if (selectedBrokerInfo?.supportsSync) {
                    setStep('connect-method');
                  } else {
                    setStep('select-broker');
                  }
                }}
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={!preview || preview.summary.toImport === 0 || !accountName.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                Import {preview?.summary.toImport || 0} Trades
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Manual Setup Step */}
        {step === 'manual-setup' && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-1.5 sm:space-y-2">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-4 bg-zinc-600">
                <Edit2 className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Create Manual Account</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Track trades from any broker manually
              </p>
            </div>

            {/* Account Name Input */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="account-name-manual" className="text-sm font-medium text-zinc-300">
                Account Name
              </Label>
              <Input
                id="account-name-manual"
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., My Trading Account, IRA"
                className="border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
                autoFocus
              />
              <p className="text-xs text-zinc-500">
                You can change this later in settings
              </p>
            </div>

            {/* Features */}
            <div className="p-3 sm:p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 sm:space-y-3">
              <h3 className="text-xs sm:text-sm font-semibold text-white">What you can do with manual entry:</h3>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center sm:items-start gap-2.5 sm:gap-3">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-zinc-300">Record trades one by one</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 hidden sm:block">Add stock and option trades with all details</p>
                  </div>
                </div>
                <div className="flex items-center sm:items-start gap-2.5 sm:gap-3">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-zinc-300">Automatic P&L tracking</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 hidden sm:block">Position matching and profit calculations handled for you</p>
                  </div>
                </div>
                <div className="flex items-center sm:items-start gap-2.5 sm:gap-3">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-zinc-300">Full analytics access</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 hidden sm:block">Same dashboards and insights as imported accounts</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip */}
            <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-blue-300">
                You can always import a file or connect via SnapTrade later.
              </p>
            </div>

            {/* Error Message */}
            {createMutation.isError && (
              <p className="text-sm text-red-400 text-center">
                {createMutation.error.message}
              </p>
            )}

            {/* Navigation */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('select-broker')}
                disabled={createMutation.isPending}
                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleCreateManualAccount}
                disabled={!accountName.trim() || createMutation.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Account
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Select Accounts Step (after SnapTrade connection) */}
        {step === 'select-accounts' && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-1.5 sm:space-y-2">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-4 bg-emerald-500">
                <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-white">Account Connected!</h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Select accounts to sync trades from
              </p>
            </div>

            {/* Loading State */}
            {isLoadingStatus && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
              </div>
            )}

            {!isLoadingStatus && snapTradeStatusError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-300">Could not load connected accounts</p>
                  <p className="text-red-400/80 mt-1 text-xs">
                    We could not fetch your broker accounts right now. Retry or reconnect to continue.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => refetchSnapTradeStatus()}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setStep('connect-method')}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      Reconnect
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Account List */}
            {!isLoadingStatus && !snapTradeStatusError && snapTradeStatus?.accounts && (
              <div className="space-y-2">
                {snapTradeStatus.connections?.some(conn => conn.disabled) && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-red-300">Connection disabled - reauth required</p>
                      <p className="text-red-400/80 mt-1 text-xs">
                        SnapTrade reports your broker connection is disabled. Reconnect to resume syncing.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setStep('connect-method')}
                        className="mt-3 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      >
                        Reconnect
                      </Button>
                    </div>
                  </div>
                )}
                {snapTradeStatus.accounts.length === 0 ? (
                  (() => {
                    const activeConnections = (snapTradeStatus.connections || []).filter(conn => !conn.disabled);
                    if (activeConnections.length > 0) {
                      const connection = activeConnections[0];
                      const brokerName = connection.brokerageDisplayName || connection.brokerageName || 'Brokerage';
                      const brokerInfo = getBrokerSyncInfo(brokerName);

                      return (
                        <div className="text-center py-6 space-y-4">
                          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-emerald-500/20">
                            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-zinc-200 font-semibold">Connection saved</p>
                            <p className="text-zinc-400 text-sm mt-2">
                              We can see your {brokerName} connection in SnapTrade, but accounts haven&apos;t been delivered yet.
                            </p>
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-left">
                            <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-sm">
                              <p className="font-medium text-amber-300">
                                Initial sync can take {brokerInfo.typicalSyncTime}
                              </p>
                              <p className="text-amber-400/80 mt-1 text-xs">
                                We&apos;ll keep checking for accounts. If nothing appears after the expected window, reconnect or contact support.
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-center gap-3">
                            <Button
                              variant="outline"
                              onClick={() => refetchSnapTradeStatus()}
                              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                            >
                              Check Connection
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setStep('connect-method')}
                              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                            >
                              Reconnect
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="text-center py-6">
                        <p className="text-zinc-400">No accounts found. Please try connecting again.</p>
                        <Button
                          variant="outline"
                          onClick={() => setStep('connect-method')}
                          className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                          Try Again
                        </Button>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    {snapTradeStatus.accounts.map((account) => {
                      const syncStatus = account.snaptradeSync?.status || 'syncing';
                      const isReady = syncStatus === 'ready';
                      const isFetching = syncStatus === 'syncing';
                      const brokerInfo = getBrokerSyncInfo(account.institutionName);

                      return (
                        <button
                          key={account.id}
                          onClick={() => {
                            const newSelected = new Set(selectedSnapTradeAccounts);
                            if (newSelected.has(account.id)) {
                              newSelected.delete(account.id);
                            } else {
                              newSelected.add(account.id);
                            }
                            setSelectedSnapTradeAccounts(newSelected);
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left',
                            selectedSnapTradeAccounts.has(account.id)
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                          )}
                        >
                          <div className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                            isReady ? 'bg-emerald-500' : 'bg-amber-500'
                          )}>
                            {isFetching ? (
                              <Clock className="h-5 w-5 text-white" />
                            ) : (
                              <Wallet className="h-5 w-5 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{account.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-zinc-400">{account.institutionName}</p>
                              {isReady && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Ready
                                </span>
                              )}
                              {isFetching && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ~{brokerInfo.typicalSyncTime}
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                              selectedSnapTradeAccounts.has(account.id)
                                ? 'border-emerald-500 bg-emerald-500'
                                : 'border-zinc-600'
                            )}
                          >
                            {selectedSnapTradeAccounts.has(account.id) && (
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {/* Fetching accounts notice */}
                    {snapTradeStatus.accounts.some(a => a.snaptradeSync?.status === 'syncing') && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-3">
                        <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-300">Fetching from your broker...</p>
                          <p className="text-amber-400/80 mt-1 text-xs">
                            Your broker is sending transaction history. You can sync now with available data, or wait for the full history.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Multi-account tip */}
                    {snapTradeStatus.accounts.length > 1 && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-3">
                        <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-300">Multiple accounts detected</p>
                          <p className="text-blue-400/80 mt-1 text-xs">
                            Select which accounts you want to sync. Each account&apos;s P&L will be tracked separately.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Sync Button */}
            {!isLoadingStatus && snapTradeStatus?.accounts && snapTradeStatus.accounts.length > 0 && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onComplete}
                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Skip for Now
                </Button>
                <Button
                  onClick={() => {
                    if (selectedSnapTradeAccounts.size > 0) {
                      setStep('syncing');
                      syncMutation.mutate(Array.from(selectedSnapTradeAccounts));
                    }
                  }}
                  disabled={selectedSnapTradeAccounts.size === 0 || syncMutation.isPending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  Sync {selectedSnapTradeAccounts.size > 0 ? `${selectedSnapTradeAccounts.size} Account${selectedSnapTradeAccounts.size !== 1 ? 's' : ''}` : 'Accounts'}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Syncing/Importing Step */}
        {(step === 'syncing' || step === 'importing') && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-3 sm:space-y-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto bg-emerald-500/10">
                <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 text-emerald-500 animate-spin" />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <h2 className="text-lg sm:text-2xl font-bold text-white">
                  {step === 'syncing' ? 'Syncing Your Trades' : 'Importing Your Trades'}
                </h2>
                <p className="text-sm sm:text-base text-zinc-400">
                  {step === 'syncing'
                    ? 'Fetching transactions and calculating positions...'
                    : 'Processing your file and importing transactions...'
                  }
                </p>
              </div>
            </div>

            {/* Progress Steps */}
            {!syncMutation.isError && !importMutation.isError && (
              <div className="max-w-xs mx-auto space-y-2">
                {(step === 'syncing' ? SYNC_PROGRESS_STEPS : [
                  { id: 'read', label: 'Reading file', description: 'Loading file contents...' },
                  { id: 'parse', label: 'Parsing transactions', description: 'Extracting trade data...' },
                  { id: 'validate', label: 'Validating data', description: 'Checking for errors...' },
                  { id: 'save', label: 'Saving to database', description: 'Writing transactions...' },
                  { id: 'derive', label: 'Calculating positions', description: 'Computing P&L...' },
                ]).map((syncStep, i) => {
                  // Show first step as done, second as active, rest pending
                  const isComplete = i === 0;
                  const isCurrent = i === 1;
                  const isPending = i > 1;

                  return (
                    <div
                      key={syncStep.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-lg transition-colors',
                        isCurrent && 'bg-emerald-500/10'
                      )}
                    >
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                        isComplete && 'bg-emerald-500',
                        isCurrent && 'bg-emerald-500/30',
                        isPending && 'bg-zinc-700'
                      )}>
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                        ) : (
                          <span className="text-xs text-zinc-500">{i + 1}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          'text-sm font-medium',
                          isComplete && 'text-emerald-400',
                          isCurrent && 'text-white',
                          isPending && 'text-zinc-500'
                        )}>
                          {syncStep.label}
                        </span>
                        {isCurrent && (
                          <p className="text-xs text-zinc-400 mt-0.5">{syncStep.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tip during sync */}
            {!syncMutation.isError && !importMutation.isError && step === 'syncing' && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  This may take a few moments for accounts with large transaction histories. Your data is being securely transferred and processed.
                </p>
              </div>
            )}

            {/* Error Message */}
            {(syncMutation.isError || importMutation.isError) && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-300">Sync failed</p>
                    <p className="text-xs text-red-400/80 mt-1">
                      {syncMutation.error?.message || importMutation.error?.message}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(step === 'syncing' ? 'select-accounts' : 'import-file')}
                    className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (step === 'syncing') {
                        syncMutation.mutate(Array.from(selectedSnapTradeAccounts));
                      }
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="space-y-4 sm:space-y-6">
            <StepIndicator currentStep={step} />
            <div className="text-center space-y-3 sm:space-y-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto bg-emerald-500">
                <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <h2 className="text-lg sm:text-2xl font-bold text-white">
                  {importResult ? 'Import Complete!' : syncMutation.isSuccess ? 'Sync Complete!' : 'Account Created!'}
                </h2>
                <p className="text-zinc-400">
                  {importResult
                    ? `Successfully imported ${importResult.inserted} trades.`
                    : syncMutation.isSuccess
                      ? 'Your trades have been synced successfully.'
                      : 'Your account is ready. You can now start adding trades.'
                  }
                </p>
              </div>
            </div>

            {/* Import Stats */}
            {importResult && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importResult.inserted}</p>
                  <p className="text-xs text-zinc-400">Imported</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-center">
                  <p className="text-2xl font-bold text-orange-400">{importResult.duplicates}</p>
                  <p className="text-xs text-zinc-400">Duplicates</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-center">
                  <p className="text-2xl font-bold text-zinc-400">{importResult.skippedRows}</p>
                  <p className="text-xs text-zinc-400">Skipped</p>
                </div>
              </div>
            )}

            {/* What's Next */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <h3 className="text-sm font-semibold text-white mb-3">What&apos;s next?</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                    1
                  </div>
                  <p className="text-sm text-zinc-300">View your trading dashboard and analytics</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                    2
                  </div>
                  <p className="text-sm text-zinc-300">Add more accounts or import additional files</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                    3
                  </div>
                  <p className="text-sm text-zinc-300">Track your P&L and improve your trading</p>
                </div>
              </div>
            </div>

            <Button
              onClick={onComplete}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-base sm:text-lg py-5 sm:py-6"
            >
              Go to Dashboard
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
