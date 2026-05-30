'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Cash Flow Analytics Component
 *
 * Dedicated module for tracking account cash flows including:
 * - Deposits/Contributions
 * - Withdrawals
 * - Dividends
 * - Interest
 * - Fees
 * - Transfers
 *
 * Includes SnapTrade sync integration for real-time data.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  CircleDollarSign,
  Percent,
  Receipt,
  ArrowRightLeft,
  Banknote,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatCompactCurrency, formatCurrency, formatSignedCurrency } from '@/lib/utils';

// Types
interface CashFlowCategory {
  total: number;
  count: number;
  items: Array<{
    date: string;
    amount: number;
    description: string;
    symbol?: string;
  }>;
}

interface PeriodCashFlow {
  contributions: CashFlowCategory;
  withdrawals: CashFlowCategory;
  dividends: CashFlowCategory;
  interest: CashFlowCategory;
  fees: CashFlowCategory;
  transfers: CashFlowCategory;
  netCashFlow: number;
}

interface CashFlowData {
  timeframes: {
    monthly: PeriodCashFlow;
    quarterly: PeriodCashFlow;
    ytd: PeriodCashFlow;
    last12m: PeriodCashFlow;
    lastyear: PeriodCashFlow;
    allTime: PeriodCashFlow;
    customRange: PeriodCashFlow | null;
  };
  periodLabels: {
    monthly: string;
    quarterly: string;
    ytd: string;
    last12m: string;
    lastyear: string;
    allTime: string;
  };
}

type CashFlowTimeframe = 'monthly' | 'quarterly' | 'ytd' | 'last12m' | 'lastyear' | 'allTime';

const TIMEFRAME_CONFIG: Array<{
  id: CashFlowTimeframe;
  label: string;
  shortLabel: string;
}> = [
  { id: 'monthly', label: 'This Month', shortLabel: 'Month' },
  { id: 'quarterly', label: 'This Quarter', shortLabel: 'Qtr' },
  { id: 'ytd', label: 'Year to Date', shortLabel: 'YTD' },
  { id: 'last12m', label: 'Last 12 Months', shortLabel: '12M' },
  { id: 'lastyear', label: 'Last Year', shortLabel: 'LY' },
  { id: 'allTime', label: 'All Time', shortLabel: 'All' },
];

async function fetchCashFlow(accountId: string | null): Promise<CashFlowData> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);

  const url = `/api/dashboard/cash-flow${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch cash flow data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

async function syncSnapTradeTransactions(): Promise<{ synced: number }> {
  const response = await fetch('/api/sync/transactions', { method: 'POST' });
  if (!response.ok) {
    throw new Error('Failed to sync transactions');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}


// Glass Card Component
function GlassCard({
  children,
  className,
  gradient,
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: 'emerald' | 'red' | 'blue' | 'purple' | 'amber' | 'zinc';
}) {
  const gradientStyles = {
    emerald: 'bg-linear-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    red: 'bg-linear-to-br from-red-500/10 to-red-500/5 border-red-500/20',
    blue: 'bg-linear-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20',
    purple: 'bg-linear-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20',
    amber: 'bg-linear-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20',
    zinc: 'bg-zinc-800/50 border-zinc-700/50',
  };

  return (
    <div
      className={cn(
        'rounded-xl border backdrop-blur-sm transition-all duration-300',
        gradient ? gradientStyles[gradient] : 'bg-zinc-900/50 border-white/5',
        className
      )}
    >
      {children}
    </div>
  );
}

// Cash Flow Stat Card
function CashFlowStatCard({
  title,
  value,
  count,
  icon: Icon,
  gradient,
  subtitle,
}: {
  title: string;
  value: number;
  count: number;
  icon: React.ElementType;
  gradient: 'emerald' | 'red' | 'blue' | 'purple' | 'amber' | 'zinc';
  subtitle?: string;
}) {
  const iconColors = {
    emerald: 'text-emerald-400 bg-emerald-500/20',
    red: 'text-red-400 bg-red-500/20',
    blue: 'text-blue-400 bg-blue-500/20',
    purple: 'text-purple-400 bg-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/20',
    zinc: 'text-zinc-400 bg-zinc-700',
  };

  const textColors = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    zinc: 'text-zinc-300',
  };

  return (
    <GlassCard className="p-4" gradient={gradient}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('p-2 rounded-lg', iconColors[gradient])}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              {title}
            </span>
          </div>
          <p className={cn('text-2xl font-bold', textColors[gradient])}>
            {formatCompactCurrency(value)}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {count} {subtitle || `transaction${count !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

interface CashFlowAnalyticsProps {
  accountId?: string | null;
  hasSnapTradeConnection?: boolean;
}

export function CashFlowAnalytics({ accountId, hasSnapTradeConnection }: CashFlowAnalyticsProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<CashFlowTimeframe>('ytd');
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cashFlow', accountId],
    queryFn: () => fetchCashFlow(accountId ?? null),
  });

  const syncMutation = useMutation({
    mutationFn: syncSnapTradeTransactions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['tradeMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  const currentCashFlow: PeriodCashFlow | null = data
    ? (data.timeframes[selectedTimeframe] as PeriodCashFlow || data.timeframes.ytd)
    : null;

  const periodLabel = data
    ? (data.periodLabels[selectedTimeframe] || '')
    : '';

  const totalIn = currentCashFlow
    ? currentCashFlow.contributions.total + currentCashFlow.dividends.total + Math.max(0, currentCashFlow.interest.total)
    : 0;

  const totalOut = currentCashFlow
    ? currentCashFlow.withdrawals.total + currentCashFlow.fees.total
    : 0;

  // Check if there's any cash flow data at all (across all time)
  const allTimeCashFlow = data?.timeframes.allTime;
  const hasAnyCashFlowData = allTimeCashFlow && (
    allTimeCashFlow.contributions.count > 0 ||
    allTimeCashFlow.withdrawals.count > 0 ||
    allTimeCashFlow.dividends.count > 0 ||
    allTimeCashFlow.interest.count > 0 ||
    allTimeCashFlow.fees.count > 0 ||
    allTimeCashFlow.transfers.count > 0
  );

  // Don't render if there's no data at all (not loading, not error, just no data)
  if (!isLoading && !error && data && !hasAnyCashFlowData) {
    return null;
  }

  if (error) {
    return (
      <GlassCard className="p-6 text-center" gradient="red">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 text-sm">Failed to load cash flow data</p>
        <button
          onClick={() => refetch()}
          className="mt-3 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </GlassCard>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-linear-to-br from-emerald-500/20 to-blue-500/20">
              <Wallet className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">Cash Flow Analytics</h3>
                <HelpTooltip
                  title="Cash Flow Analytics"
                  description="Track all cash movements in your account including deposits, withdrawals, dividends, interest, and fees. Sync from SnapTrade to get the latest data."
                />
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{periodLabel}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {hasSnapTradeConnection && (
              <button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'bg-linear-to-r from-emerald-600/90 to-blue-600/90 text-white',
                  'hover:from-emerald-500 hover:to-blue-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', syncMutation.isPending && 'animate-spin')} />
                {syncMutation.isPending ? 'Syncing...' : 'Sync from Broker'}
              </button>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Sync Success Message */}
        {syncMutation.isSuccess && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
            <Sparkles className="h-3.5 w-3.5" />
            Synced successfully! Cash flow data updated.
          </div>
        )}
      </div>

      {/* Timeframe Selector */}
      <div className="p-2 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {TIMEFRAME_CONFIG.map(({ id, label, shortLabel }) => (
            <button
              key={id}
              onClick={() => setSelectedTimeframe(id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selectedTimeframe === id
                  ? 'bg-linear-to-r from-emerald-600/80 to-blue-600/80 text-white'
                  : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50'
              )}
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : !currentCashFlow ? (
          <div className="text-center py-8">
            <Wallet className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No cash flow data available</p>
            <p className="text-xs text-zinc-500 mt-1">
              {hasSnapTradeConnection
                ? 'Click "Sync from Broker" to fetch your cash flow data'
                : 'Connect a brokerage account to track cash flows'}
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards - Two Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Money In Column */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-zinc-200">Money In</span>
                </div>
                <div className="space-y-3">
                  <CashFlowStatCard
                    title="Deposits"
                    value={currentCashFlow.contributions.total}
                    count={currentCashFlow.contributions.count}
                    icon={PiggyBank}
                    gradient="emerald"
                    subtitle={`contribution${currentCashFlow.contributions.count !== 1 ? 's' : ''}`}
                  />
                  <CashFlowStatCard
                    title="Dividends"
                    value={currentCashFlow.dividends.total}
                    count={currentCashFlow.dividends.count}
                    icon={CircleDollarSign}
                    gradient="blue"
                    subtitle={`payment${currentCashFlow.dividends.count !== 1 ? 's' : ''}`}
                  />
                  <CashFlowStatCard
                    title="Interest"
                    value={Math.max(0, currentCashFlow.interest.total)}
                    count={currentCashFlow.interest.count}
                    icon={Percent}
                    gradient="purple"
                    subtitle={`credit${currentCashFlow.interest.count !== 1 ? 's' : ''}`}
                  />
                </div>
              </div>

              {/* Money Out Column */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpRight className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-semibold text-zinc-200">Money Out</span>
                </div>
                <div className="space-y-3">
                  <CashFlowStatCard
                    title="Withdrawals"
                    value={currentCashFlow.withdrawals.total}
                    count={currentCashFlow.withdrawals.count}
                    icon={Banknote}
                    gradient="red"
                    subtitle={`withdrawal${currentCashFlow.withdrawals.count !== 1 ? 's' : ''}`}
                  />
                  <CashFlowStatCard
                    title="Fees & Taxes"
                    value={currentCashFlow.fees.total}
                    count={currentCashFlow.fees.count}
                    icon={Receipt}
                    gradient="amber"
                    subtitle={`charge${currentCashFlow.fees.count !== 1 ? 's' : ''}`}
                  />
                  <CashFlowStatCard
                    title="Transfers"
                    value={currentCashFlow.transfers.total}
                    count={currentCashFlow.transfers.count}
                    icon={ArrowRightLeft}
                    gradient="zinc"
                    subtitle={`internal transfer${currentCashFlow.transfers.count !== 1 ? 's' : ''}`}
                  />
                </div>
              </div>
            </div>

            {/* Net Cash Flow Summary */}
            <div className="pt-4 border-t border-zinc-800">
              <div className="grid grid-cols-3 gap-3">
                {/* Total In */}
                <GlassCard className="p-4" gradient="emerald">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400 uppercase">Total In</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">
                    {formatSignedCurrency(totalIn, true)}
                  </p>
                </GlassCard>

                {/* Total Out */}
                <GlassCard className="p-4" gradient="red">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-medium text-red-400 uppercase">Total Out</span>
                  </div>
                  <p className="text-xl font-bold text-red-400">
                    -{formatCompactCurrency(totalOut)}
                  </p>
                </GlassCard>

                {/* Net Flow */}
                <GlassCard
                  className="p-4"
                  gradient={currentCashFlow.netCashFlow >= 0 ? 'emerald' : 'red'}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {currentCashFlow.netCashFlow >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    )}
                    <span className={cn(
                      'text-xs font-medium uppercase',
                      currentCashFlow.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      Net Flow
                    </span>
                  </div>
                  <p className={cn(
                    'text-xl font-bold',
                    currentCashFlow.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {formatSignedCurrency(currentCashFlow.netCashFlow, true)}
                  </p>
                </GlassCard>
              </div>

              {/* Detailed breakdown tooltip */}
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Net: {formatCurrency(totalIn)} in - {formatCurrency(totalOut)} out = {formatCurrency(currentCashFlow.netCashFlow)}
                </span>
              </div>
            </div>

            {/* Empty State for period */}
            {currentCashFlow.contributions.count === 0 &&
             currentCashFlow.withdrawals.count === 0 &&
             currentCashFlow.dividends.count === 0 &&
             currentCashFlow.interest.count === 0 &&
             currentCashFlow.fees.count === 0 &&
             currentCashFlow.transfers.count === 0 && (
              <div className="mt-6 text-center py-6 border-t border-zinc-800">
                <Calendar className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No cash flow activity in this period</p>
                <p className="text-xs text-zinc-500 mt-1">Try selecting a different timeframe</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
