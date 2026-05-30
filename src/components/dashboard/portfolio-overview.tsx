'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';


/**
 * Portfolio Overview Component
 *
 * Displays unified portfolio data from SnapTrade API and manual entries.
 * Shows real-time positions, balances, and return rates with data source indicators.
 *
 * Features:
 * - Unified view merging SnapTrade positions + derived manual positions
 * - Data source badges (SnapTrade vs Manual)
 * - Sync freshness indicators with manual refresh
 * - Account-level balance and return rate display
 * - Real-time unrealized P&L from brokerages
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  Link2,
  PenLine,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Percent,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatCompactCurrency, formatPercent } from '@/lib/utils';

interface UnifiedPosition {
  id: string;
  symbol: string;
  positionType: 'stock' | 'option';
  quantity: number;
  avgCostBasis: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  dataSource: 'snaptrade' | 'derived';
  brokerageAccountId: string;
  brokerageAccountName: string;
  lastSyncAt: string | null;
  isStale: boolean;
  currency: string;
}

interface PositionSummary {
  totalPositions: number;
  stockPositions: number;
  optionPositions: number;
  totalMarketValue: number;
  totalUnrealizedPnL: number;
  needsRefresh: boolean;
}

interface BalanceData {
  brokerageAccountId: string;
  brokerageAccountName: string;
  currency: string;
  cash: number | null;
  buyingPower: number | null;
  lastSyncAt: string;
}

interface ReturnRateData {
  brokerageAccountId: string;
  brokerageAccountName: string;
  timeframe: string;
  returnPercent: number;
  lastSyncAt: string;
}

interface AccountReturnRates {
  accountName: string;
  rates: Record<string, number>;
  lastSyncAt: string;
}


function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
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

function DataSourceBadge({ source, isStale }: { source: 'snaptrade' | 'derived'; isStale: boolean }) {
  if (source === 'snaptrade') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
          isStale
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        )}
      >
        <Link2 className="h-2.5 w-2.5" />
        {isStale ? 'Stale' : 'Live'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
      <PenLine className="h-2.5 w-2.5" />
      Manual
    </span>
  );
}

function PositionRow({ position }: { position: UnifiedPosition }) {
  const isPositive = (position.unrealizedPnL ?? 0) >= 0;
  const isOption = position.positionType === 'option';

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'p-1.5 rounded-lg',
            isOption
              ? position.optionType === 'call'
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-purple-100 dark:bg-purple-900/30'
              : isPositive
                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                : 'bg-red-100 dark:bg-red-900/30'
          )}
        >
          {isOption ? (
            <Zap
              className={cn(
                'h-4 w-4',
                position.optionType === 'call'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-purple-600 dark:text-purple-400'
              )}
            />
          ) : isPositive ? (
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {position.symbol}
              {isOption && position.strike && (
                <span className="text-zinc-500 ml-1">
                  ${position.strike} {position.optionType?.toUpperCase()}
                </span>
              )}
            </p>
            <DataSourceBadge source={position.dataSource} isStale={position.isStale} />
          </div>
          <p className="text-xs text-zinc-500">
            {position.quantity} {isOption ? 'contract' : 'share'}
            {position.quantity !== 1 ? 's' : ''} @ {formatCurrency(position.avgCostBasis)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
          {formatCurrency(position.marketValue)}
        </p>
        {position.unrealizedPnL !== null && (
          <p
            className={cn(
              'text-xs font-medium',
              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatCurrency(position.unrealizedPnL)} ({formatPercent(position.unrealizedPnLPct)})
          </p>
        )}
      </div>
    </div>
  );
}

export function PortfolioOverview() {
  const queryClient = useQueryClient();
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Fetch unified positions
  const {
    data: positionsData,
    isLoading: positionsLoading,
    error: positionsError,
  } = useQuery({
    queryKey: ['unified-positions'],
    queryFn: async () => {
      const res = await fetch('/api/sync/positions');
      if (!res.ok) throw new Error('Failed to fetch positions');
      const json = await parseApiJson(res);
      return apiData<{ positions: UnifiedPosition[]; summary: PositionSummary }>(json);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

  // Fetch balances
  const { data: balancesData, isLoading: balancesLoading } = useQuery({
    queryKey: ['unified-balances'],
    queryFn: async () => {
      const res = await fetch('/api/sync/balances');
      if (!res.ok) throw new Error('Failed to fetch balances');
      const json = await parseApiJson(res);
      return apiData<{
        balances: BalanceData[];
        totals: Record<string, { cash: number; buyingPower: number }>;
      }>(json);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch return rates
  const { data: returnRatesData, isLoading: returnRatesLoading } = useQuery({
    queryKey: ['unified-return-rates'],
    queryFn: async () => {
      const res = await fetch('/api/sync/performance');
      if (!res.ok) throw new Error('Failed to fetch performance');
      const json = await parseApiJson(res);
      return apiData<{
        returnRates: ReturnRateData[];
        byAccount: Record<string, AccountReturnRates>;
      }>(json);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        // Throw with the API error message for better user feedback
        throw new Error(apiMessage(data, 'Failed to sync'));
      }
      return apiData<{ synced?: boolean; message?: string }>(data);
    },
    onSuccess: () => {
      // Invalidate all related queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['unified-positions'] });
      queryClient.invalidateQueries({ queryKey: ['unified-balances'] });
      queryClient.invalidateQueries({ queryKey: ['unified-return-rates'] });
    },
  });

  const isLoading = positionsLoading || balancesLoading || returnRatesLoading;
  const positions = positionsData?.positions ?? [];
  const summary = positionsData?.summary;
  const balances = balancesData?.balances ?? [];
  const balanceTotals = balancesData?.totals ?? {};
  const returnRatesByAccount = returnRatesData?.byAccount ?? {};

  const hasPositions = positions.length > 0;
  const hasLiveData = positions.some((p) => p.dataSource === 'snaptrade');
  const displayPositions = showAllPositions ? positions : positions.slice(0, 5);

  // Group positions by account
  const positionsByAccount = positions.reduce(
    (acc, pos) => {
      if (!acc[pos.brokerageAccountId]) {
        acc[pos.brokerageAccountId] = {
          name: pos.brokerageAccountName,
          positions: [],
        };
      }
      acc[pos.brokerageAccountId].positions.push(pos);
      return acc;
    },
    {} as Record<string, { name: string; positions: UnifiedPosition[] }>
  );

  const toggleAccount = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Portfolio Overview</h2>
            <p className="text-sm text-zinc-500">Loading positions...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
          <div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
          <div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (positionsError) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Portfolio Overview</h2>
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load positions</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Portfolio Overview</h2>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span>
                {summary?.totalPositions ?? 0} position{(summary?.totalPositions ?? 0) !== 1 ? 's' : ''}
              </span>
              {hasLiveData && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Live data
                  </span>
                </>
              )}
            </div>
          </div>
          <HelpTooltip
            title="Portfolio Overview"
            description="Shows unified positions from connected brokerages (live data) and manual entries. Click sync to refresh data from your connected accounts."
          />
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync'}
        </Button>
      </div>

      {/* Summary Stats */}
      {hasPositions && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {/* Total Market Value */}
          <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Market Value</span>
            </div>
            <p className="text-xl font-bold text-zinc-700 dark:text-zinc-300">
              {formatCompactCurrency(summary?.totalMarketValue)}
            </p>
          </div>

          {/* Unrealized P&L */}
          <div
            className={cn(
              'p-4 rounded-xl',
              (summary?.totalUnrealizedPnL ?? 0) >= 0
                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                : 'bg-red-50 dark:bg-red-900/20'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {(summary?.totalUnrealizedPnL ?? 0) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span
                className={cn(
                  'text-xs font-medium',
                  (summary?.totalUnrealizedPnL ?? 0) >= 0
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-red-700 dark:text-red-300'
                )}
              >
                Unrealized P&L
              </span>
            </div>
            <p
              className={cn(
                'text-xl font-bold',
                (summary?.totalUnrealizedPnL ?? 0) >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {formatCompactCurrency(summary?.totalUnrealizedPnL)}
            </p>
          </div>

          {/* Cash Balance */}
          {Object.keys(balanceTotals).length > 0 && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Cash</span>
              </div>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatCompactCurrency(balanceTotals['USD']?.cash ?? 0)}
              </p>
            </div>
          )}

          {/* Return Rates */}
          {Object.keys(returnRatesByAccount).length > 0 && (
            <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">YTD Return</span>
              </div>
              {(() => {
                // Get first account's 1Y or ALL return
                const firstAccount = Object.values(returnRatesByAccount)[0];
                const ytdReturn = firstAccount?.rates['1Y'] ?? firstAccount?.rates['ALL'];
                const isPositive = (ytdReturn ?? 0) >= 0;
                return (
                  <p
                    className={cn(
                      'text-xl font-bold',
                      isPositive ? 'text-purple-600 dark:text-purple-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {formatPercent(ytdReturn)}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Positions List */}
      {hasPositions ? (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Open Positions
          </h3>

          {/* Simple flat list for few positions */}
          {Object.keys(positionsByAccount).length <= 1 ? (
            <div className="space-y-2">
              {displayPositions.map((position) => (
                <PositionRow key={position.id} position={position} />
              ))}
              {positions.length > 5 && (
                <button
                  onClick={() => setShowAllPositions(!showAllPositions)}
                  className="w-full py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center justify-center gap-1"
                >
                  {showAllPositions ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Show {positions.length - 5} more
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            // Grouped by account for multiple accounts
            <div className="space-y-3">
              {Object.entries(positionsByAccount).map(([accountId, { name, positions: accountPositions }]) => {
                const isExpanded = expandedAccounts.has(accountId);
                const accountBalance = balances.find((b) => b.brokerageAccountId === accountId);
                const accountReturnRates = returnRatesByAccount[accountId];
                const totalValue = accountPositions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
                const hasLive = accountPositions.some((p) => p.dataSource === 'snaptrade');

                return (
                  <div
                    key={accountId}
                    className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleAccount(accountId)}
                      className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{name}</p>
                          {hasLive && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                              <Link2 className="h-2.5 w-2.5" />
                              Connected
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                            {formatCompactCurrency(totalValue)}
                          </p>
                          <p className="text-xs text-zinc-500">{accountPositions.length} positions</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-zinc-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 space-y-2">
                        {/* Account stats */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {accountBalance && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs">
                              <Wallet className="h-3 w-3" />
                              Cash: {formatCurrency(accountBalance.cash)}
                            </span>
                          )}
                          {accountReturnRates && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs">
                              <Percent className="h-3 w-3" />
                              YTD: {formatPercent(accountReturnRates.rates['1Y'] ?? accountReturnRates.rates['ALL'])}
                            </span>
                          )}
                          {hasLive && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(accountPositions[0]?.lastSyncAt ?? null)}
                            </span>
                          )}
                        </div>

                        {/* Positions */}
                        {accountPositions.map((position) => (
                          <PositionRow key={position.id} position={position} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <div className="text-center">
            <p className="text-zinc-400 dark:text-zinc-500">No open positions</p>
            <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">
              Connect a brokerage or add manual trades
            </p>
          </div>
        </div>
      )}

      {/* Sync status */}
      {syncMutation.isSuccess && syncMutation.data?.synced && (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {syncMutation.data.message ?? 'Positions synced successfully'}
        </div>
      )}
      {syncMutation.isSuccess && syncMutation.data && !syncMutation.data.synced && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <CheckCircle2 className="h-4 w-4" />
          {syncMutation.data.message ?? 'Positions are up to date'}
        </div>
      )}
      {syncMutation.isError && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {syncMutation.error instanceof Error ? syncMutation.error.message : 'Failed to sync positions'}
        </div>
      )}
    </div>
  );
}
