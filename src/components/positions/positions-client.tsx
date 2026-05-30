'use client';

import { parseApiJson, apiData, apiDataOr, apiMessage } from '@/lib/api/client';


/**
 * Positions Client Component - Modern 2026 Revamp
 *
 * A completely redesigned positions page featuring:
 * - Mobile-first responsive design
 * - Modern card-based UI with smooth animations
 * - Intuitive tab navigation
 * - Real-time price display from SnapTrade
 * - Beautiful loading states and empty states
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Briefcase,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Activity,
  Search,
  X,
  Wifi,
  Timer,
  Wallet,
  LayoutGrid,
  List,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Bitcoin,
  Coins,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountSelector } from '@/components/accounts/account-selector';
import { OpenOrdersCard } from '@/components/positions/open-orders-card';
import { cn, formatCurrency, formatCompactCurrency, formatPercent } from '@/lib/utils';
import { getMarketStatus, type MarketStatus } from '@/lib/utils/market-hours';

// Feature flag for crypto support - set to false to easily revert crypto functionality
const CRYPTO_ENABLED = true;

// Types
interface UnifiedPosition {
  symbol: string;
  positionType: 'stock' | 'option' | 'future' | 'crypto';
  quantity: number;
  avgCostBasis: number;
  optionType?: string;
  strike?: number;
  expiration?: string;
  marketPrice?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;
  previousPrice?: number;
  priceChangeAbs?: number;
  priceChangePct?: number;
  dataSource: 'snaptrade' | 'derived';
  brokerageAccountId: string;
  brokerageAccountName: string;
  lastSyncAt?: string;
  isStale: boolean;
}

interface UnifiedBalance {
  brokerageAccountId: string;
  brokerageAccountName: string;
  currency: string;
  cash: number | null;
  buyingPower: number | null;
  lastSyncAt: string;
}

interface UnifiedReturnRate {
  brokerageAccountId: string;
  brokerageAccountName: string;
  timeframe: string;
  returnPercent: number;
  lastSyncAt: string;
}

interface StablecoinHolding {
  symbol: string;
  quantity: number;
  marketValue: number;
  brokerageAccountId: string;
  brokerageAccountName: string;
  lastSyncAt?: string;
}

interface SnapTradePositionsData {
  positions: UnifiedPosition[];
  balances: UnifiedBalance[];
  returnRates: UnifiedReturnRate[];
  stablecoinHoldings: StablecoinHolding[];
  summary: {
    totalPositions: number;
    stockPositions: number;
    optionPositions: number;
    futurePositions: number;
    totalMarketValue: number;
    totalUnrealizedPnL: number;
    totalCash: number;
    totalBuyingPower: number;
    totalStablecoinBalance: number;
    needsRefresh: boolean;
  };
}

interface BrokerageAccount {
  id: string;
  name: string;
  broker: string;
  externalAccountId?: string | null;
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
  accounts: Array<{
    id: string;
    name: string;
    institutionName: string;
    isSynced: boolean;
    brokerageAccountId: string | null;
    snaptradeSync?: {
      isInitialSyncComplete: boolean;
      firstTransactionDate: string | null;
      lastSuccessfulSync: string | null;
      status: 'ready' | 'syncing' | 'limited';
    };
  }>;
}

// API Functions
async function fetchSnapTradeStatus(): Promise<SnapTradeStatus | null> {
  try {
    const response = await fetch('/api/sync/connect');
    if (!response.ok) return null;
    const data = await parseApiJson(response);
    return apiData(data);
  } catch {
    return null;
  }
}

async function fetchUnifiedPositions(accountId?: string): Promise<SnapTradePositionsData> {
  const url = accountId ? `/api/sync/positions?accountId=${accountId}` : '/api/sync/positions';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch positions');
  const result = await parseApiJson(response);
  return apiData(result);
}

async function fetchAccounts(): Promise<BrokerageAccount[]> {
  const response = await fetch('/api/accounts');
  if (!response.ok) throw new Error('Failed to fetch accounts');
  const result = await parseApiJson(response);
  return apiDataOr(result, []);
}

// Formatting Utilities (formatCurrency, formatCompactCurrency, formatPercent imported from @/lib/utils)

function formatExpiration(expiration: string | null | undefined): string {
  if (!expiration) return 'N/A';
  const date = new Date(expiration);
  // Use UTC timezone to avoid off-by-one issues from local timezone conversion
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getDaysToExpiration(expiration: string | null | undefined): number | null {
  if (!expiration) return null;
  const expDate = new Date(expiration);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getExpirationWarning(expiration: string | null | undefined): 'urgent' | 'warning' | null {
  const days = getDaysToExpiration(expiration);
  if (days === null) return null;
  if (days <= 7) return 'urgent';
  if (days <= 14) return 'warning';
  return null;
}

type TabOption = 'all' | 'stocks' | 'options' | 'futures' | 'crypto';
type SortOption = 'symbol' | 'value' | 'pnl' | 'change';
type ViewMode = 'cards' | 'list';


export function PositionsClient() {
  const queryClient = useQueryClient();
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();

  // UI State
  const [activeTab, setActiveTab] = useState<TabOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showFilters, setShowFilters] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(() => getMarketStatus());
  const [alertFilter, setAlertFilter] = useState<'expiring' | 'losers' | null>(null);

  // Data Fetching
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const { data: snapTradeStatus, refetch: refetchSnapTradeStatus } = useQuery({
    queryKey: ['snaptrade-status'],
    queryFn: fetchSnapTradeStatus,
    staleTime: 30000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.accounts) return false;
      const hasSyncingAccounts = data.accounts.some(a => a.snaptradeSync?.status === 'syncing');
      return hasSyncingAccounts ? 10000 : false;
    },
  });

  const {
    data: positionsData,
    isLoading,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ['unified-positions', selectedAccountId],
    queryFn: () => fetchUnifiedPositions(selectedAccountId || undefined),
  });

  // Auto-select single account for better UX
  // When user has only one account, automatically select it instead of "All Accounts"
  useEffect(() => {
    if (accounts && accounts.length === 1 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId, setSelectedAccountId]);

  // Sync Mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const snapTradeAccount = snapTradeStatus?.accounts?.find(
        a => a.brokerageAccountId === selectedAccountId
      );

      if (snapTradeAccount) {
        const transRes = await fetch('/api/sync/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snaptradeAccountIds: [snapTradeAccount.id] }),
        });
        if (!transRes.ok) {
          console.warn('Transaction sync failed');
        }
      }

      const posRes = await fetch('/api/sync/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, accountId: selectedAccountId }),
      });
      const posData = await parseApiJson(posRes);
      if (!posRes.ok) throw new Error(apiMessage(posData, 'Failed to sync'));
      return posData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-positions'] });
      queryClient.invalidateQueries({ queryKey: ['snaptrade-status'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Also refetch open orders
      queryClient.refetchQueries({ queryKey: ['open-orders'] });
    },
  });

  // Derived State
  const selectedAccount = accounts?.find(a => a.id === selectedAccountId);
  const hasSnapTradeConnection = selectedAccount?.externalAccountId != null;
  const selectedSnapTradeAccount = hasSnapTradeConnection && snapTradeStatus?.accounts
    ? snapTradeStatus.accounts.find(a => a.brokerageAccountId === selectedAccountId)
    : null;
  const isAccountSyncing = selectedSnapTradeAccount?.snaptradeSync?.status === 'syncing';

  // Update market status every minute
  useEffect(() => {
    const interval = setInterval(() => setMarketStatus(getMarketStatus()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Process positions - memoize to avoid dependency warnings
  const allPositions = useMemo(() => positionsData?.positions || [], [positionsData?.positions]);
  const allBalances = useMemo(() => positionsData?.balances || [], [positionsData?.balances]);
  const allReturnRates = useMemo(() => positionsData?.returnRates || [], [positionsData?.returnRates]);
  const stablecoinHoldings = useMemo(() => positionsData?.stablecoinHoldings || [], [positionsData?.stablecoinHoldings]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalMarketValue = allPositions.reduce((sum, p) => sum + (p.marketValue || p.avgCostBasis * p.quantity), 0);
    const totalUnrealizedPnL = allPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    // Calculate today's change (sum of price changes since last sync, weighted by quantity)
    const todaysChange = allPositions.reduce((sum, p) => {
      if (p.priceChangeAbs == null) return sum;
      // For options, multiply by 100 (contract multiplier)
      const multiplier = p.positionType === 'option' ? 100 : 1;
      return sum + (p.priceChangeAbs * Math.abs(p.quantity) * multiplier);
    }, 0);
    const prevValue = totalMarketValue - todaysChange;
    const todaysChangePct = prevValue !== 0 ? (todaysChange / prevValue) * 100 : 0;

    // Separate positive cash from margin (negative cash)
    const totalCashRaw = allBalances.reduce((sum, b) => sum + (b.cash || 0), 0);
    const cashBalance = totalCashRaw >= 0 ? totalCashRaw : 0;
    const marginUsed = totalCashRaw < 0 ? Math.abs(totalCashRaw) : 0;

    // Stablecoin total
    const totalStablecoin = stablecoinHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    return {
      totalPositions: allPositions.length,
      stockCount: allPositions.filter(p => p.positionType === 'stock').length,
      optionCount: allPositions.filter(p => p.positionType === 'option').length,
      futureCount: allPositions.filter(p => p.positionType === 'future').length,
      cryptoCount: allPositions.filter(p => p.positionType === 'crypto').length,
      totalMarketValue,
      totalUnrealizedPnL,
      todaysChange,
      todaysChangePct,
      cashBalance,
      marginUsed,
      totalStablecoin,
      totalBuyingPower: allBalances.reduce((sum, b) => sum + (b.buyingPower || 0), 0),
      snapTradeCount: allPositions.filter(p => p.dataSource === 'snaptrade').length,
      lastSyncAt: allPositions[0]?.lastSyncAt,
    };
  }, [allPositions, allBalances, stablecoinHoldings]);

  const tabOptions = useMemo(() => {
    const options: TabOption[] = ['all', 'stocks', 'options'];
    if (summary.futureCount > 0) options.push('futures');
    if (CRYPTO_ENABLED) options.push('crypto');
    return options;
  }, [summary.futureCount]);

  const effectiveTab = useMemo(() => (
    tabOptions.includes(activeTab) ? activeTab : 'all'
  ), [activeTab, tabOptions]);

  // Filter and sort positions
  const processedPositions = useMemo(() => {
    const filtered = allPositions.filter(p => {
      if (searchTerm && !p.symbol.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (effectiveTab === 'stocks' && p.positionType !== 'stock') return false;
      if (effectiveTab === 'options' && p.positionType !== 'option') return false;
      if (effectiveTab === 'futures' && p.positionType !== 'future') return false;
      if (effectiveTab === 'crypto' && p.positionType !== 'crypto') return false;
      return true;
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'value':
          cmp = (a.marketValue || a.avgCostBasis * a.quantity) - (b.marketValue || b.avgCostBasis * b.quantity);
          break;
        case 'pnl':
          cmp = (a.unrealizedPnL || 0) - (b.unrealizedPnL || 0);
          break;
        case 'change':
          cmp = (a.priceChangePct || 0) - (b.priceChangePct || 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [allPositions, searchTerm, effectiveTab, sortBy, sortAsc]);

  // Return rates by timeframe
  const returnRates = useMemo(() => {
    const ratesByTimeframe = new Map<string, number[]>();
    for (const rate of allReturnRates) {
      const existing = ratesByTimeframe.get(rate.timeframe) || [];
      existing.push(rate.returnPercent);
      ratesByTimeframe.set(rate.timeframe, existing);
    }
    return ratesByTimeframe;
  }, [allReturnRates]);

  const getAverageReturn = (timeframe: string): number | null => {
    const rates = returnRates.get(timeframe);
    if (!rates?.length) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  };

  // Position Alerts - expiring options and big losers
  const positionAlerts = useMemo(() => {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Options expiring within 7 days
    const expiringOptions = allPositions.filter(p => {
      if (p.positionType !== 'option' || !p.expiration) return false;
      const expDate = new Date(p.expiration);
      return expDate <= oneWeekFromNow && expDate >= now;
    });

    // Positions down more than 25%
    const bigLosers = allPositions.filter(p => {
      if (p.unrealizedPnLPct == null) return false;
      return p.unrealizedPnLPct <= -25;
    });

    return {
      expiringOptions,
      bigLosers,
      hasAlerts: expiringOptions.length > 0 || bigLosers.length > 0,
    };
  }, [allPositions]);

  // Apply alert filter to processed positions
  const displayPositions = useMemo(() => {
    if (!alertFilter) return processedPositions;
    if (alertFilter === 'expiring') {
      return processedPositions.filter(p => positionAlerts.expiringOptions.some(e =>
        e.symbol === p.symbol && e.strike === p.strike && e.expiration === p.expiration
      ));
    }
    if (alertFilter === 'losers') {
      return processedPositions.filter(p => positionAlerts.bigLosers.some(l =>
        l.symbol === p.symbol && l.positionType === p.positionType
      ));
    }
    return processedPositions;
  }, [processedPositions, alertFilter, positionAlerts]);

  // Loading State
  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        {/* Hero Skeleton */}
        <Skeleton className="h-40 w-full rounded-2xl" />
        {/* Tabs Skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
        {/* Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const pnlIsPositive = summary.totalUnrealizedPnL >= 0;

  return (
    <TooltipProvider>
      <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AccountSelector
              selectedAccountId={selectedAccountId}
              onAccountChange={setSelectedAccountId}
              className="w-full sm:w-auto"
              compact
            />
            {/* Market Status */}
            <div className={cn(
              'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              marketStatus === 'open'
                ? 'bg-rh-green/15 text-rh-green'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full',
                marketStatus === 'open' ? 'bg-rh-green animate-pulse' : 'bg-zinc-400'
              )} />
              {marketStatus === 'open' ? 'Market Open' : 'Market Closed'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Toggle - Desktop */}
            <div className="hidden md:flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={() => setViewMode('cards')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'cards'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 transition-colors border-l border-zinc-200 dark:border-zinc-700',
                  viewMode === 'list'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchPositions()}
              disabled={isLoading}
              className="h-9 w-9"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>

            {/* Sync Button */}
            {hasSnapTradeConnection && selectedAccountId && (
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className={cn(
                  'h-9 gap-2',
                  isAccountSyncing
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-rh-green hover:bg-rh-green-hover'
                )}
              >
                {syncMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : isAccountSyncing ? (
                  <Timer className="h-4 w-4 animate-pulse" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {syncMutation.isPending ? 'Syncing' : isAccountSyncing ? 'Fetching' : 'Sync'}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Sync Status Alerts */}
        {isAccountSyncing && !syncMutation.isPending && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 animate-in slide-in-from-top duration-300">
            <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
            <div className="flex-1">
              <p className="font-medium text-amber-700 dark:text-amber-300">Syncing with broker</p>
              <p className="text-sm text-amber-600/70 dark:text-amber-400/70">Data may be incomplete until sync finishes</p>
            </div>
            <button
              onClick={() => refetchSnapTradeStatus()}
              className="text-sm text-amber-700 dark:text-amber-300 hover:underline"
            >
              Check status
            </button>
          </div>
        )}

        {syncMutation.isSuccess && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rh-green/10 border border-rh-green/30 animate-in slide-in-from-top duration-300">
            <CheckCircle2 className="h-5 w-5 text-rh-green" />
            <span className="text-rh-green">Positions synced successfully</span>
          </div>
        )}

        {syncMutation.isError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rh-red/10 border border-rh-red/30 animate-in slide-in-from-top duration-300">
            <AlertCircle className="h-5 w-5 text-rh-red" />
            <span className="text-rh-red">
              {syncMutation.error instanceof Error ? syncMutation.error.message : 'Sync failed'}
            </span>
          </div>
        )}

        {/* Hero Card - Portfolio Overview */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-zinc-900 to-zinc-800 dark:from-zinc-800 dark:to-zinc-900 p-4 sm:p-6 text-white">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '32px 32px'
            }} />
          </div>

          <div className="relative z-10">
            {/* Top Row: Value & Change */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-zinc-400 text-sm mb-1">Portfolio Value</p>
                <p className="text-4xl sm:text-5xl font-bold tracking-tight">
                  {formatCompactCurrency(summary.totalMarketValue)}
                </p>
                {summary.lastSyncAt && (
                  <p className="text-zinc-500 text-xs mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {formatRelativeTime(summary.lastSyncAt)}
                  </p>
                )}
              </div>

              {/* P&L Badges - Stack on mobile */}
              <div className="flex flex-row gap-2 sm:gap-3">
                {/* Today's Change */}
                {summary.todaysChange !== 0 && (
                  <div className={cn(
                    'px-3 sm:px-4 py-2 rounded-xl flex-1 sm:flex-none',
                    summary.todaysChange >= 0
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-red-500/20 text-red-400'
                  )}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {summary.todaysChange >= 0 ? (
                        <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                      <span className="text-lg sm:text-xl font-bold">
                        {summary.todaysChange >= 0 ? '+' : ''}{formatCompactCurrency(summary.todaysChange)}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs opacity-70 mt-0.5 sm:mt-1">
                      Today ({summary.todaysChangePct >= 0 ? '+' : ''}{summary.todaysChangePct.toFixed(1)}%)
                    </p>
                  </div>
                )}

                {/* Unrealized P&L */}
                <div className={cn(
                  'px-3 sm:px-4 py-2 rounded-xl flex-1 sm:flex-none',
                  pnlIsPositive
                    ? 'bg-rh-green/20 text-rh-green'
                    : 'bg-rh-red/20 text-rh-red'
                )}>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {pnlIsPositive ? (
                      <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    )}
                    <span className="text-lg sm:text-xl font-bold">
                      {pnlIsPositive ? '+' : ''}{formatCompactCurrency(summary.totalUnrealizedPnL)}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs opacity-70 mt-0.5 sm:mt-1">Unrealized</p>
                </div>
              </div>
            </div>

            {/* Bottom Row: Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-4">
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                  <Briefcase className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Positions
                </div>
                <p className="text-lg sm:text-xl font-semibold">{summary.totalPositions}</p>
              </div>
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                  <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Stocks
                </div>
                <p className="text-lg sm:text-xl font-semibold">{summary.stockCount}</p>
              </div>
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Options
                </div>
                <p className="text-lg sm:text-xl font-semibold">{summary.optionCount}</p>
              </div>
              {summary.futureCount > 0 && (
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-amber-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                    <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    Futures
                  </div>
                  <p className="text-lg sm:text-xl font-semibold">{summary.futureCount}</p>
                </div>
              )}
              <div className="bg-rh-green/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 text-rh-green text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                  <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Buying Power
                </div>
                <p className="text-lg sm:text-xl font-semibold text-rh-green">{formatCompactCurrency(summary.totalBuyingPower)}</p>
              </div>
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                  <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Cash
                </div>
                <p className="text-lg sm:text-xl font-semibold">{formatCompactCurrency(summary.cashBalance)}</p>
              </div>
              {/* Margin - only show if using margin */}
              {summary.marginUsed > 0 && (
                <div className="bg-red-500/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-red-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                    <CreditCard className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    Margin
                  </div>
                  <p className="text-lg sm:text-xl font-semibold text-red-400">-{formatCompactCurrency(summary.marginUsed)}</p>
                </div>
              )}
              {/* Stablecoins - only show if user has any */}
              {summary.totalStablecoin > 0 && (
                <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                    <Coins className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    Stablecoins
                  </div>
                  <p className="text-lg sm:text-xl font-semibold">{formatCompactCurrency(summary.totalStablecoin)}</p>
                </div>
              )}
            </div>

            {/* Returns Row */}
            {allReturnRates.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="text-zinc-400 text-xs font-medium">Broker Returns</span>
                  <div className="flex items-center gap-4">
                    {['1M', '3M', '6M', '1Y', 'ALL'].map(tf => {
                      const returnPct = getAverageReturn(tf);
                      if (returnPct === null) return null;
                      const positive = returnPct >= 0;
                      return (
                        <div key={tf} className="text-center">
                          <p className="text-[10px] text-zinc-500">{tf}</p>
                          <p className={cn(
                            'text-sm font-semibold',
                            positive ? 'text-rh-green' : 'text-rh-red'
                          )}>
                            {positive ? '+' : ''}{returnPct.toFixed(1)}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Open Orders */}
        <OpenOrdersCard
          accountId={selectedAccountId}
          hasSnapTradeConnection={hasSnapTradeConnection || summary.snapTradeCount > 0}
        />

        {/* Current Positions Section Header */}
        <div className="flex items-center gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Current Positions
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your active holdings across all asset types
            </p>
          </div>
        </div>

        {/* Position Alerts - only show when there are alerts */}
        {positionAlerts.hasAlerts && (
          <div className="flex flex-wrap items-center gap-2">
            {positionAlerts.expiringOptions.length > 0 && (
              <button
                onClick={() => setAlertFilter(alertFilter === 'expiring' ? null : 'expiring')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  alertFilter === 'expiring'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {positionAlerts.expiringOptions.length} expiring this week
                {alertFilter === 'expiring' && <X className="h-3 w-3 ml-1" />}
              </button>
            )}
            {positionAlerts.bigLosers.length > 0 && (
              <button
                onClick={() => setAlertFilter(alertFilter === 'losers' ? null : 'losers')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  alertFilter === 'losers'
                    ? 'bg-red-500 text-white shadow-md'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                )}
              >
                <TrendingDown className="h-3.5 w-3.5" />
                {positionAlerts.bigLosers.length} down &gt;25%
                {alertFilter === 'losers' && <X className="h-3 w-3 ml-1" />}
              </button>
            )}
            {alertFilter && (
              <button
                onClick={() => setAlertFilter(null)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
              >
                Show all
              </button>
            )}
          </div>
        )}

        {/* Tabs & Search */}
        <div className="space-y-3 sm:space-y-4">
          {/* Tabs */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide min-w-0 -mx-1 px-1 snap-x snap-mandatory scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
              {tabOptions.map(tab => {
                const count = tab === 'all' ? summary.totalPositions :
                              tab === 'stocks' ? summary.stockCount :
                              tab === 'options' ? summary.optionCount :
                              tab === 'futures' ? summary.futureCount :
                              tab === 'crypto' ? summary.cryptoCount : 0;
                const isActive = effectiveTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 snap-start',
                      isActive
                        ? tab === 'stocks'
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                          : tab === 'options'
                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                            : tab === 'futures'
                              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                              : tab === 'crypto'
                              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                              : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    )}
                  >
                    {tab === 'stocks' && <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    {tab === 'options' && <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    {tab === 'futures' && <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    {tab === 'crypto' && <Bitcoin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    {tab === 'all' && <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    <span className="capitalize">{tab}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter Toggle - Mobile */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'sm:hidden p-2 rounded-lg transition-colors',
                showFilters
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              )}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>

          {/* Search & Sort */}
          <div className={cn(
            'flex flex-col sm:flex-row gap-3',
            !showFilters && 'hidden sm:flex'
          )}>
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search symbols..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rh-green focus:border-transparent transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide snap-x scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
              {([
                { key: 'value', label: 'Value' },
                { key: 'pnl', label: 'P&L' },
                { key: 'change', label: 'Change' },
                { key: 'symbol', label: 'A-Z' },
              ] as { key: SortOption; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    if (sortBy === key) setSortAsc(!sortAsc);
                    else { setSortBy(key); setSortAsc(false); }
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    sortBy === key
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  )}
                >
                  {sortBy === key && (
                    sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Count */}
        {(searchTerm || effectiveTab !== 'all' || alertFilter) && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">
              Showing {displayPositions.length} of {allPositions.length} positions
              {alertFilter && (
                <span className="ml-1">
                  ({alertFilter === 'expiring' ? 'expiring soon' : 'big losers'})
                </span>
              )}
            </span>
            <button
              onClick={() => { setSearchTerm(''); setActiveTab('all'); setAlertFilter(null); }}
              className="text-rh-green font-medium hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Positions Grid/List */}
        {displayPositions.length === 0 ? (
          <EmptyState activeTab={effectiveTab} searchTerm={searchTerm} />
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayPositions.map((position, index) => (
              <PositionCard key={`${position.symbol}-${position.positionType}-${position.strike}-${index}`} position={position} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
              <div className="col-span-4">Position</div>
              <div className="col-span-2 text-right">Quantity</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Value</div>
              <div className="col-span-2 text-right">P&L</div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {displayPositions.map((position, index) => (
                <PositionListItem key={`${position.symbol}-${position.positionType}-${position.strike}-${index}`} position={position} />
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// Position Card Component
function PositionCard({ position }: { position: UnifiedPosition }) {
  const isStock = position.positionType === 'stock';
  const isOption = position.positionType === 'option';
  const isFuture = position.positionType === 'future';
  const isCrypto = position.positionType === 'crypto';
  const isLive = position.dataSource === 'snaptrade';
  const hasMarketData = position.marketPrice != null;
  const pnlPositive = (position.unrealizedPnL || 0) >= 0;
  const expWarning = isOption ? getExpirationWarning(position.expiration) : null;
  const daysToExp = isOption ? getDaysToExpiration(position.expiration) : null;
  const quantityLabel = isOption || isFuture ? 'contracts' : isCrypto ? 'coins' : 'shares';

  return (
    <div className={cn(
      'group relative rounded-xl border p-4 transition-all hover:shadow-lg',
      position.isStale && 'opacity-60',
      // Expiration warning takes priority
      expWarning === 'urgent'
        ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
        : expWarning === 'warning'
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10'
          // Option cards get purple tint, futures get amber, stocks get blue
          : isOption
            ? 'border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/10 hover:border-purple-300 dark:hover:border-purple-700'
            : isFuture
              ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/10 hover:border-amber-300 dark:hover:border-amber-700'
              : isCrypto
                ? 'border-orange-200 dark:border-orange-800/50 bg-orange-50/30 dark:bg-orange-950/10 hover:border-orange-300 dark:hover:border-orange-700'
                : isStock
                  ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10 hover:border-blue-300 dark:hover:border-blue-700'
                  : 'border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/10 hover:border-purple-300 dark:hover:border-purple-700'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm',
            isStock
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : isFuture
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                : isCrypto
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                  : position.optionType === 'call'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
          )}>
            {isStock ? <TrendingUp className="h-5 w-5" /> : isFuture ? <Activity className="h-5 w-5" /> : isCrypto ? <Bitcoin className="h-5 w-5" /> : position.optionType === 'call' ? 'C' : 'P'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{position.symbol}</span>
              {isLive && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rh-green/15 text-rh-green">
                  LIVE
                </span>
              )}
            </div>
            {isOption && (
              <p className="text-xs text-zinc-500">
                ${position.strike} {position.optionType?.toUpperCase()} | {formatExpiration(position.expiration)}
              </p>
            )}
            {isFuture && (
              <p className="text-xs text-zinc-500">
                Futures contract
              </p>
            )}
            {isCrypto && (
              <p className="text-xs text-zinc-500">
                Crypto asset
              </p>
            )}
          </div>
        </div>

        {/* Expiration Warning */}
        {expWarning && (
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-medium flex items-center gap-1',
            expWarning === 'urgent'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          )}>
            <AlertTriangle className="h-3 w-3" />
            {daysToExp}d
          </span>
        )}
      </div>

      {/* Quantity & Price */}
      <div className="flex items-center justify-between text-sm mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-zinc-500 text-xs">Qty</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {Math.abs(position.quantity)} {quantityLabel}
            {position.quantity < 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                SHORT
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-zinc-500 text-xs">Price</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{formatCurrency(isOption ? position.avgCostBasis / 100 : position.avgCostBasis)}</span>
            {hasMarketData && (
              <>
                <span className="text-zinc-300">-&gt;</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(position.marketPrice!)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Value & P&L */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-zinc-500 text-xs">Market Value</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {hasMarketData ? formatCurrency(position.marketValue!) : formatCurrency(position.avgCostBasis * position.quantity)}
          </p>
        </div>
        {hasMarketData && position.unrealizedPnL != null && (
          <div className={cn(
            'text-right px-3 py-1.5 rounded-lg',
            pnlPositive
              ? 'bg-rh-green/15 text-rh-green'
              : 'bg-rh-red/15 text-rh-red'
          )}>
            <p className="font-semibold">
              {pnlPositive ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
            </p>
            <p className="text-xs opacity-70">
              {formatPercent(position.unrealizedPnLPct || 0)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Position List Item Component
function PositionListItem({ position }: { position: UnifiedPosition }) {
  const isStock = position.positionType === 'stock';
  const isOption = position.positionType === 'option';
  const isFuture = position.positionType === 'future';
  const isCrypto = position.positionType === 'crypto';
  const isLive = position.dataSource === 'snaptrade';
  const hasMarketData = position.marketPrice != null;
  const pnlPositive = (position.unrealizedPnL || 0) >= 0;

  return (
    <div className={cn(
      'grid grid-cols-12 gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors',
      position.isStale && 'opacity-60'
    )}>
      {/* Position Info */}
      <div className="col-span-12 sm:col-span-4 flex items-center gap-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
          isStock
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : isFuture
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
              : isCrypto
                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                : position.optionType === 'call'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
        )}>
          {isStock ? (
            <TrendingUp className="h-4 w-4" />
          ) : isFuture ? (
            <Activity className="h-4 w-4" />
          ) : isCrypto ? (
            <Bitcoin className="h-4 w-4" />
          ) : (
            position.optionType === 'call' ? 'C' : 'P'
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{position.symbol}</span>
            {isLive && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rh-green/15 text-rh-green">
                LIVE
              </span>
            )}
          </div>
          {isOption && (
            <p className="text-xs text-zinc-500 truncate">
              ${position.strike} {position.optionType?.toUpperCase()} | {formatExpiration(position.expiration)}
            </p>
          )}
          {isFuture && (
            <p className="text-xs text-zinc-500 truncate">Futures contract</p>
          )}
          {isCrypto && (
            <p className="text-xs text-zinc-500 truncate">Crypto asset</p>
          )}
        </div>
      </div>

      {/* Quantity */}
      <div className="col-span-3 sm:col-span-2 flex items-center justify-end sm:justify-end">
        <span className="text-sm text-zinc-900 dark:text-zinc-100">
          {Math.abs(position.quantity)}
          {position.quantity < 0 && (
            <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              S
            </span>
          )}
        </span>
      </div>

      {/* Price */}
      <div className="col-span-3 sm:col-span-2 flex items-center justify-end">
        <span className="text-sm text-zinc-900 dark:text-zinc-100">
          {hasMarketData ? formatCurrency(position.marketPrice!) : formatCurrency(isOption ? position.avgCostBasis / 100 : position.avgCostBasis)}
        </span>
      </div>

      {/* Value */}
      <div className="col-span-3 sm:col-span-2 flex items-center justify-end">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {hasMarketData ? formatCurrency(position.marketValue!) : formatCurrency(position.avgCostBasis * position.quantity)}
        </span>
      </div>

      {/* P&L */}
      <div className="col-span-3 sm:col-span-2 flex items-center justify-end">
        {hasMarketData && position.unrealizedPnL != null ? (
          <span className={cn(
            'text-sm font-medium',
            pnlPositive ? 'text-rh-green' : 'text-rh-red'
          )}>
            {pnlPositive ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
          </span>
        ) : (
          <span className="text-sm text-zinc-400">-</span>
        )}
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({ activeTab, searchTerm }: { activeTab: TabOption; searchTerm: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        {searchTerm ? (
          <Search className="h-8 w-8 text-zinc-400" />
        ) : activeTab === 'stocks' ? (
          <TrendingUp className="h-8 w-8 text-blue-400" />
        ) : activeTab === 'options' ? (
          <Zap className="h-8 w-8 text-purple-400" />
        ) : activeTab === 'futures' ? (
          <Activity className="h-8 w-8 text-amber-400" />
        ) : (
          <Briefcase className="h-8 w-8 text-zinc-400" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
        {searchTerm
          ? 'No matches found'
          : `No ${activeTab === 'all' ? 'positions' : activeTab} yet`}
      </h3>
      <p className="text-zinc-500 max-w-sm">
        {searchTerm
          ? `Try a different search term or clear the filter.`
          : activeTab === 'stocks'
            ? 'Your stock positions will appear here once you have some.'
            : activeTab === 'options'
              ? 'Your option contracts will appear here once you open some.'
              : activeTab === 'futures'
                ? 'Your futures contracts will appear here once you open some.'
              : 'Connect your brokerage or import trades to see your positions.'}
      </p>
    </div>
  );
}
