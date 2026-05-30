/**
 * Options Rolls Analysis Component
 *
 * Analyzes roll patterns and effectiveness.
 * Part of the Options Analytics section.
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useQuery } from '@tanstack/react-query';
import {
  Repeat,
  Target,
  Clock,
  ArrowRightLeft,
  AlertTriangle,
  Sparkles,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatCurrency, formatCompactCurrency } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface RollStats {
  totalRolls: number;
  successfulRolls: number;
  successRate: number;
  avgRollCredit: number;
  totalRollPnL: number;
  avgDaysExtended: number;
}

interface RollBySymbol {
  symbol: string;
  rollCount: number;
  successRate: number;
  totalCredit: number;
}

interface RollsData {
  summary: {
    totalTrades: number;
    totalPnL: number;
    winRate: number;
  };
  rolls: {
    stats: RollStats | null;
    bySymbol: RollBySymbol[];
    insight: string | null;
  };
}

interface OptionsRollsProps {
  accountId: string | null;
}


// ============================================================================
// Sub-Components
// ============================================================================

function InsightCard({
  insight,
  type = 'info',
}: {
  insight: string;
  type?: 'success' | 'warning' | 'info';
}) {
  const styles = {
    success: 'from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800/30',
    warning: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/30',
    info: 'from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 border-rose-200 dark:border-rose-800/30',
  };

  const iconColors = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-rose-600 dark:text-rose-400',
  };

  const textColors = {
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-rose-700 dark:text-rose-300',
  };

  return (
    <div className={cn('p-4 rounded-xl bg-linear-to-br border', styles[type])}>
      <div className="flex items-start gap-3">
        <Sparkles className={cn('h-5 w-5 mt-0.5 shrink-0', iconColors[type])} />
        <p className={cn('text-sm font-medium', textColors[type])}>{insight}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OptionsRolls({ accountId }: OptionsRollsProps) {
  const { data, isLoading, error, refetch } = useQuery<RollsData>({
    queryKey: ['options-rolls', accountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set('brokerageAccountId', accountId);

      const res = await fetch(`/api/dashboard/options-timing?${params}`);
      if (!res.ok) throw new Error('Failed to fetch rolls data');
      return apiData<RollsData>(await parseApiJson(res));
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-red-500 text-center">Failed to load rolls data</p>
      </div>
    );
  }

  const analytics = data;
  const stats = analytics.rolls.stats;

  // Empty state - no rolls detected
  if (!stats) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-linear-to-br from-rose-500 to-pink-600">
                <Repeat className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Roll Analysis</h2>
                <p className="text-xs text-zinc-500">Track your option roll effectiveness</p>
              </div>
              <HelpTooltip
                title="Roll Analysis"
                description="Rolls are detected when you close a position and open a new one on the same underlying within 2 days. This helps track if rolling positions is working for you."
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
            <Repeat className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            No Rolls Detected
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Rolls are detected when you close a position and open a new one on the same underlying within 2 days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-rose-500 to-pink-600">
              <Repeat className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Roll Analysis</h2>
              <p className="text-xs text-zinc-500">
                {stats.totalRolls} rolls detected · {stats.successRate}% success rate
              </p>
            </div>
            <HelpTooltip
              title="Roll Analysis"
              description="Rolls are detected when you close a position and open a new one on the same underlying within 2 days. A successful roll is when the final P&L is positive."
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Insight */}
        {analytics.rolls.insight && (
          <InsightCard
            insight={analytics.rolls.insight}
            type={stats.successRate >= 60 ? 'success' : stats.successRate < 50 ? 'warning' : 'info'}
          />
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-linear-to-br from-rose-50/50 to-pink-50/50 dark:from-rose-900/10 dark:to-pink-900/10">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft className="h-4 w-4 text-rose-600" />
              <span className="text-xs text-zinc-500">Total Rolls</span>
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalRolls}</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-zinc-500">Success Rate</span>
            </div>
            <p className={cn(
              'text-3xl font-bold',
              stats.successRate >= 60 ? 'text-emerald-600' :
              stats.successRate >= 50 ? 'text-amber-600' : 'text-red-500'
            )}>
              {stats.successRate}%
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {stats.successfulRolls} of {stats.totalRolls} successful
            </p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-rose-600" />
              <span className="text-xs text-zinc-500">Avg Days Extended</span>
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.avgDaysExtended}</p>
          </div>
        </div>

        {/* P&L Stats */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
            Roll P&L Summary
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500">Total Roll P&L</p>
              <p className={cn(
                'text-2xl font-bold',
                stats.totalRollPnL >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                {formatCurrency(stats.totalRollPnL)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Avg Credit per Roll</p>
              <p className={cn(
                'text-2xl font-bold',
                stats.avgRollCredit >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                {formatCurrency(stats.avgRollCredit)}
              </p>
            </div>
          </div>
        </div>

        {/* Rolls by Symbol */}
        {analytics.rolls.bySymbol.length > 0 && (
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">
              Most Rolled Symbols
            </h3>
            <div className="space-y-3">
              {analytics.rolls.bySymbol.map((s, idx) => (
                <div key={s.symbol} className="p-3 rounded-lg bg-zinc-50/50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
                  {/* Symbol Header Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 w-4">{idx + 1}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{s.symbol}</span>
                    </div>
                    <span className={cn(
                      'text-sm font-bold',
                      s.totalCredit >= 0 ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      {formatCompactCurrency(s.totalCredit)}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-2">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        s.successRate >= 60 ? 'bg-emerald-500' :
                        s.successRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      )}
                      style={{ width: `${s.successRate}%` }}
                    />
                  </div>
                  {/* Stats Row */}
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{s.rollCount} rolls</span>
                    <span className={cn(
                      'font-medium',
                      s.successRate >= 60 ? 'text-emerald-600' :
                      s.successRate >= 50 ? 'text-amber-600' : 'text-red-500'
                    )}>
                      {s.successRate}% success
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning if low success rate */}
        {stats.successRate < 50 && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-300">Consider Your Roll Strategy</p>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">
                  With only {stats.successRate}% of rolls being successful, you may want to reconsider when and how you roll positions.
                  Consider rolling earlier or accepting losses instead of extending losing trades.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
