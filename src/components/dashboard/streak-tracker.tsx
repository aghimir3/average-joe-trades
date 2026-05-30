'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Streak Tracker Component
 *
 * Displays current win/loss streak and historical streak statistics.
 * Shows recent trades with win/loss indicators.
 */

import { useQuery } from '@tanstack/react-query';
import { Flame, TrendingDown, Trophy, BarChart3, RefreshCw, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatSignedCurrency } from '@/lib/utils';

interface StreakInfo {
  type: 'win' | 'loss' | 'none';
  count: number;
  startDate: string | null;
  trades: Array<{
    id: string;
    symbol: string;
    pnl: number;
    date: string;
  }>;
}

interface StreaksData {
  currentStreak: StreakInfo;
  longestWinStreak: StreakInfo;
  longestLossStreak: StreakInfo;
  totalStreaks: {
    winStreaks: number;
    lossStreaks: number;
    avgWinStreakLength: number;
    avgLossStreakLength: number;
  };
  recentTrades: Array<{
    id: string;
    symbol: string;
    pnl: number;
    date: string;
    isWin: boolean;
  }>;
  streakMetrics: {
    currentStreakPnL: number;
    recoveryRate: number;
    maxConsecutiveGreenDays: number;
  };
}

interface StreakTrackerProps {
  accountId?: string | null;
}

async function fetchStreaks(accountId?: string | null): Promise<StreaksData> {
  const params = new URLSearchParams();
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const url = `/api/dashboard/streaks${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch streaks');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}


export function StreakTracker({ accountId }: StreakTrackerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardStreaks', accountId],
    queryFn: () => fetchStreaks(accountId),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Unable to load streak data</p>
      </div>
    );
  }

  const { currentStreak, longestWinStreak, longestLossStreak, totalStreaks, recentTrades, streakMetrics } = data;

  const isOnFire = currentStreak.type === 'win' && currentStreak.count >= 3;
  const isSlumping = currentStreak.type === 'loss' && currentStreak.count >= 3;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Flame
          className={cn(
            'h-5 w-5',
            isOnFire ? 'text-orange-500' : isSlumping ? 'text-blue-500' : 'text-zinc-500'
          )}
        />
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Win/Loss Streaks</h3>
        <HelpTooltip
          title="Win/Loss Streaks"
          description="Track your consecutive winning and losing trades. The 'Recovery Rate' shows how often you bounce back with a win after a loss."
        />
      </div>

      {/* Current Streak - Hero Display */}
      <div
        className={cn(
          'rounded-lg p-4 mb-4',
          currentStreak.type === 'win'
            ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/50'
            : currentStreak.type === 'loss'
              ? 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800/50'
              : 'bg-zinc-100 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700/50'
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">Current Streak</p>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-3xl font-bold',
                  currentStreak.type === 'win'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : currentStreak.type === 'loss'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                )}
              >
                {currentStreak.count}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {currentStreak.type === 'win'
                  ? 'wins in a row'
                  : currentStreak.type === 'loss'
                    ? 'losses in a row'
                    : 'no streak'}
              </span>
            </div>
            {currentStreak.startDate && (
              <p className="text-xs text-zinc-500 mt-1">Since {currentStreak.startDate}</p>
            )}
          </div>

          {/* Streak Badge */}
          {isOnFire && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 border border-orange-300 dark:bg-orange-900/30 dark:border-orange-700/50">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">On Fire!</span>
            </div>
          )}
          {isSlumping && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 border border-blue-300 dark:bg-blue-900/30 dark:border-blue-700/50">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Keep Going</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Trades Visual */}
      {recentTrades.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2">Recent Trades</p>
          <div className="flex gap-1">
            {recentTrades.slice(0, 10).map((trade, idx) => (
              <div
                key={trade.id}
                className={cn(
                  'w-6 h-6 rounded flex items-center justify-center text-xs font-medium',
                  trade.isWin
                    ? 'bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700/50'
                    : 'bg-red-100 text-red-600 border border-red-300 dark:bg-red-900/50 dark:text-red-400 dark:border-red-700/50',
                  idx === 0 && 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900',
                  idx === 0 && trade.isWin ? 'ring-emerald-500/50' : 'ring-red-500/50'
                )}
                title={`${trade.symbol}: ${formatSignedCurrency(trade.pnl)} on ${trade.date}`}
              >
                {trade.isWin ? 'W' : 'L'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid - Row 1: Best/Worst Streaks */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Longest Win Streak */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Trophy className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Best Win Streak</span>
          </div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{longestWinStreak.count}</p>
          <p className="text-xs text-zinc-500">Avg: {totalStreaks.avgWinStreakLength}</p>
        </div>

        {/* Longest Loss Streak */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Worst Loss Streak</span>
          </div>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{longestLossStreak.count}</p>
          <p className="text-xs text-zinc-500">Avg: {totalStreaks.avgLossStreakLength}</p>
        </div>
      </div>

      {/* Stats Grid - Row 2: Streak Counts */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Total Win Streaks */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Win Streaks</span>
          </div>
          <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{totalStreaks.winStreaks}</p>
        </div>

        {/* Total Loss Streaks */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Loss Streaks</span>
          </div>
          <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{totalStreaks.lossStreaks}</p>
        </div>
      </div>

      {/* Additional Metrics - Row 3 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Recovery Rate */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Recovery Rate</span>
          </div>
          <p className={cn(
            'text-lg font-bold',
            streakMetrics.recoveryRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-200'
          )}>
            {streakMetrics.recoveryRate}%
          </p>
          <p className="text-xs text-zinc-500">Win after loss</p>
        </div>

        {/* Max Green Days */}
        <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Best Green Run</span>
          </div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {streakMetrics.maxConsecutiveGreenDays}
          </p>
          <p className="text-xs text-zinc-500">Profitable days</p>
        </div>
      </div>

      {/* Current Streak P&L (if in a streak) */}
      {currentStreak.type !== 'none' && currentStreak.count > 0 && (
        <div className={cn(
          'mt-3 rounded-lg p-3 text-center',
          currentStreak.type === 'win'
            ? 'bg-emerald-50 dark:bg-emerald-900/20'
            : 'bg-red-50 dark:bg-red-900/20'
        )}>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Streak P&L</p>
          <p className={cn(
            'text-xl font-bold',
            streakMetrics.currentStreakPnL >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          )}>
            {formatSignedCurrency(streakMetrics.currentStreakPnL)}
          </p>
        </div>
      )}
    </div>
  );
}
