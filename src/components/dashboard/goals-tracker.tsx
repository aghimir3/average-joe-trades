'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Goals Tracker Component
 *
 * Displays and manages weekly/monthly P&L goals with progress tracking.
 * Supports two modes: Overall P&L Goals and Premium Goals (for wheel strategists).
 * Allows users to set, update, and remove goals.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, X, Check, Calendar, Flame, Edit2, DollarSign, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency } from '@/lib/utils';

type GoalType = 'weekly' | 'monthly' | 'premium_weekly' | 'premium_monthly';

interface GoalProgress {
  goalType: GoalType;
  targetPnL: number;
  currentPnL: number;
  progress: number;
  isAchieved: boolean;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  tradesInPeriod: number;
  winsInPeriod: number;
  streak: number;
}

interface GoalsData {
  goals: GoalProgress[];
  history: {
    weekly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    monthly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    premium_weekly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    premium_monthly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
  };
}

async function fetchGoals(accountId?: string | null): Promise<GoalsData> {
  const params = new URLSearchParams();
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const url = `/api/dashboard/goals${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch goals');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

async function createGoal(data: { goalType: string; targetPnL: number; brokerageAccountId?: string | null }): Promise<void> {
  const response = await fetch('/api/dashboard/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goalType: data.goalType,
      targetPnL: data.targetPnL,
      brokerageAccountId: data.brokerageAccountId ?? null, // Explicit null for aggregate
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to create goal');
  }
}

async function deleteGoal(data: { goalType: string; brokerageAccountId?: string | null }): Promise<void> {
  const params = new URLSearchParams({ type: data.goalType });
  if (data.brokerageAccountId) {
    params.set('brokerageAccountId', data.brokerageAccountId);
  }
  const response = await fetch(`/api/dashboard/goals?${params}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete goal');
  }
}

// formatCurrency imported from @/lib/utils

function GoalCard({
  goal,
  onEdit,
  onDelete,
  isPremium = false,
}: {
  goal: GoalProgress;
  onEdit: () => void;
  onDelete: () => void;
  isPremium?: boolean;
}) {
  const progressCapped = Math.min(goal.progress, 100);
  const isOverAchieved = goal.progress > 100;

  // Display friendly goal type name
  const displayType = goal.goalType.replace('premium_', '');

  return (
    <div
      className={cn(
        'rounded-lg p-4 border',
        goal.isAchieved
          ? isPremium
            ? 'bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800/50'
            : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/50'
          : 'bg-zinc-100 border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700/50'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 capitalize">
              {displayType} Goal
            </span>
            {goal.isAchieved && (
              <span
                className={cn(
                  'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded',
                  isPremium
                    ? 'text-violet-600 bg-violet-100 dark:text-violet-400 dark:bg-violet-900/30'
                    : 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30'
                )}
              >
                <Check className="h-3 w-3" />
                Achieved
              </span>
            )}
            {goal.streak > 0 && (
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">
                <Flame className="h-3 w-3" />
                {goal.streak} streak
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {goal.periodStart} to {goal.periodEnd}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700 dark:hover:bg-zinc-700/50 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            title="Edit goal"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-zinc-200 text-zinc-500 hover:text-red-500 dark:hover:bg-zinc-700/50 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
            title="Remove goal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Display */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1">
          <span
            className={cn(
              'text-2xl font-bold',
              goal.currentPnL >= 0
                ? isPremium
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatCurrency(goal.currentPnL)}
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">/ {formatCurrency(goal.targetPnL)}</span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              goal.isAchieved
                ? isPremium
                  ? 'bg-violet-500'
                  : 'bg-emerald-500'
                : goal.currentPnL >= 0
                  ? isPremium
                    ? 'bg-violet-400'
                    : 'bg-blue-500'
                  : 'bg-red-500'
            )}
            style={{ width: `${progressCapped}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-1">
          <span
            className={cn(
              'text-xs',
              isOverAchieved
                ? isPremium
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500'
            )}
          >
            {goal.progress.toFixed(0)}% {isOverAchieved && '(exceeded!)'}
          </span>
          <span className="text-xs text-zinc-500">
            {goal.daysRemaining} day{goal.daysRemaining !== 1 ? 's' : ''} left
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span>{goal.tradesInPeriod} trades</span>
        <span>{goal.winsInPeriod} wins</span>
        {goal.tradesInPeriod > 0 && (
          <span>{((goal.winsInPeriod / goal.tradesInPeriod) * 100).toFixed(0)}% win rate</span>
        )}
      </div>
    </div>
  );
}

function AddGoalForm({
  goalType,
  onSubmit,
  onCancel,
  isLoading,
  initialValue,
  isPremium = false,
}: {
  goalType: GoalType;
  onSubmit: (amount: number) => void;
  onCancel: () => void;
  isLoading: boolean;
  initialValue?: number;
  isPremium?: boolean;
}) {
  const [amount, setAmount] = useState(initialValue?.toString() ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0) {
      onSubmit(value);
    }
  };

  // Display friendly goal type name
  const displayType = goalType.replace('premium_', '');

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-zinc-100 border border-zinc-200 p-4 dark:bg-zinc-800/50 dark:border-zinc-700/50">
      <div className="flex items-center gap-2 mb-3">
        {isPremium ? (
          <TrendingUp className="h-4 w-4 text-violet-500 dark:text-violet-400" />
        ) : (
          <Target className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        )}
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 capitalize">
          {initialValue ? 'Edit' : 'Set'} {displayType} {isPremium ? 'Premium' : ''} Goal
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400">$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={isPremium ? '200' : '500'}
            min="1"
            step="1"
            className="w-full pl-7 pr-3 py-2 rounded-lg bg-white border border-zinc-300 text-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-200"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !amount || parseFloat(amount) <= 0}
          className={cn(
            'px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
            isPremium ? 'bg-violet-600 hover:bg-violet-500' : 'bg-blue-600 hover:bg-blue-500'
          )}
        >
          {isLoading ? '...' : 'Set'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg bg-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function HistoryPreview({
  history,
  hasWeeklyGoal,
  hasMonthlyGoal,
  isPremium = false,
}: {
  history: {
    weekly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
    monthly: Array<{ period: string; target: number; actual: number; achieved: boolean }>;
  };
  hasWeeklyGoal: boolean;
  hasMonthlyGoal: boolean;
  isPremium?: boolean;
}) {
  if ((!hasWeeklyGoal || history.weekly.length === 0) && (!hasMonthlyGoal || history.monthly.length === 0)) {
    return null;
  }

  // Calculate summary stats
  const weeklyAchieved = history.weekly.filter(p => p.achieved).length;
  const monthlyAchieved = history.monthly.filter(p => p.achieved).length;

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">Recent History</span>
        <span className="text-[10px] text-zinc-400">
          {hasWeeklyGoal && history.weekly.length > 0 && `${weeklyAchieved}/${history.weekly.length} weekly`}
          {hasWeeklyGoal && hasMonthlyGoal && history.weekly.length > 0 && history.monthly.length > 0 && ' · '}
          {hasMonthlyGoal && history.monthly.length > 0 && `${monthlyAchieved}/${history.monthly.length} monthly`}
        </span>
      </div>

      <div className="space-y-2">
        {hasWeeklyGoal && history.weekly.length > 0 && (
          <div>
            <span className="text-xs text-zinc-500 block mb-1">Weekly</span>
            <div className="flex gap-1 flex-wrap">
              {history.weekly.slice(0, 12).map((period) => (
                <div
                  key={period.period}
                  className={cn(
                    'w-5 h-5 rounded text-xs flex items-center justify-center cursor-help',
                    period.achieved
                      ? isPremium
                        ? 'bg-violet-100 text-violet-600 border border-violet-300 dark:bg-violet-900/50 dark:text-violet-400 dark:border-violet-700/50'
                        : 'bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700/50'
                      : 'bg-zinc-200 text-zinc-500 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700/50'
                  )}
                  title={`${period.period}\n${formatCurrency(period.actual)} / ${formatCurrency(period.target)}\n${period.target > 0 ? Math.round((period.actual / period.target) * 100) : 0}% achieved`}
                >
                  {period.achieved ? <Check className="h-3 w-3" /> : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMonthlyGoal && history.monthly.length > 0 && (
          <div>
            <span className="text-xs text-zinc-500 block mb-1">Monthly</span>
            <div className="flex gap-1 flex-wrap">
              {history.monthly.slice(0, 12).map((period) => (
                <div
                  key={period.period}
                  className={cn(
                    'w-5 h-5 rounded text-xs flex items-center justify-center cursor-help',
                    period.achieved
                      ? isPremium
                        ? 'bg-violet-100 text-violet-600 border border-violet-300 dark:bg-violet-900/50 dark:text-violet-400 dark:border-violet-700/50'
                        : 'bg-emerald-100 text-emerald-600 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700/50'
                      : 'bg-zinc-200 text-zinc-500 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700/50'
                  )}
                  title={`${period.period}\n${formatCurrency(period.actual)} / ${formatCurrency(period.target)}\n${period.target > 0 ? Math.round((period.actual / period.target) * 100) : 0}% achieved`}
                >
                  {period.achieved ? <Check className="h-3 w-3" /> : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface GoalsTrackerProps {
  accountId?: string | null;
}

export function GoalsTracker({ accountId }: GoalsTrackerProps) {
  const queryClient = useQueryClient();
  const [editingGoal, setEditingGoal] = useState<GoalType | null>(null);
  const [addingGoal, setAddingGoal] = useState<GoalType | null>(null);
  const [activeTab, setActiveTab] = useState<'pnl' | 'premium'>('pnl');

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardGoals', accountId],
    queryFn: () => fetchGoals(accountId),
  });

  const createMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardGoals'] });
      setAddingGoal(null);
      setEditingGoal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardGoals'] });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Unable to load goals data</p>
      </div>
    );
  }

  // P&L Goals
  const weeklyGoal = data.goals.find((g) => g.goalType === 'weekly');
  const monthlyGoal = data.goals.find((g) => g.goalType === 'monthly');
  const hasWeeklyGoal = !!weeklyGoal;
  const hasMonthlyGoal = !!monthlyGoal;

  // Premium Goals
  const premiumWeeklyGoal = data.goals.find((g) => g.goalType === 'premium_weekly');
  const premiumMonthlyGoal = data.goals.find((g) => g.goalType === 'premium_monthly');
  const hasPremiumWeeklyGoal = !!premiumWeeklyGoal;
  const hasPremiumMonthlyGoal = !!premiumMonthlyGoal;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-zinc-500" />
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Trading Goals</h3>
        <HelpTooltip
          title="Trading Goals"
          description="Set P&L or Premium targets. P&L Goals track all trades. Premium Goals track only options premium from covered calls and cash-secured puts (wheel strategy)."
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pnl' | 'premium')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-3 h-9">
          <TabsTrigger value="pnl" className="text-xs sm:text-sm data-[state=active]:bg-blue-500 data-[state=active]:text-white">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            P&L Goals
          </TabsTrigger>
          <TabsTrigger value="premium" className="text-xs sm:text-sm data-[state=active]:bg-violet-500 data-[state=active]:text-white">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Premium Goals
          </TabsTrigger>
        </TabsList>

        {/* P&L Goals Tab */}
        <TabsContent value="pnl" className="m-0">
          <div className="space-y-3">
            {/* Weekly P&L Goal */}
            {editingGoal === 'weekly' ? (
              <AddGoalForm
                goalType="weekly"
                initialValue={weeklyGoal?.targetPnL}
                onSubmit={(amount) => createMutation.mutate({ goalType: 'weekly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setEditingGoal(null)}
                isLoading={createMutation.isPending}
              />
            ) : addingGoal === 'weekly' ? (
              <AddGoalForm
                goalType="weekly"
                onSubmit={(amount) => createMutation.mutate({ goalType: 'weekly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setAddingGoal(null)}
                isLoading={createMutation.isPending}
              />
            ) : weeklyGoal ? (
              <GoalCard
                goal={weeklyGoal}
                onEdit={() => setEditingGoal('weekly')}
                onDelete={() => deleteMutation.mutate({ goalType: 'weekly', brokerageAccountId: accountId })}
              />
            ) : (
              <button
                onClick={() => setAddingGoal('weekly')}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-zinc-300 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-zinc-500 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm">Set Weekly Goal</span>
              </button>
            )}

            {/* Monthly P&L Goal */}
            {editingGoal === 'monthly' ? (
              <AddGoalForm
                goalType="monthly"
                initialValue={monthlyGoal?.targetPnL}
                onSubmit={(amount) => createMutation.mutate({ goalType: 'monthly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setEditingGoal(null)}
                isLoading={createMutation.isPending}
              />
            ) : addingGoal === 'monthly' ? (
              <AddGoalForm
                goalType="monthly"
                onSubmit={(amount) => createMutation.mutate({ goalType: 'monthly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setAddingGoal(null)}
                isLoading={createMutation.isPending}
              />
            ) : monthlyGoal ? (
              <GoalCard
                goal={monthlyGoal}
                onEdit={() => setEditingGoal('monthly')}
                onDelete={() => deleteMutation.mutate({ goalType: 'monthly', brokerageAccountId: accountId })}
              />
            ) : (
              <button
                onClick={() => setAddingGoal('monthly')}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-zinc-300 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-zinc-500 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm">Set Monthly Goal</span>
              </button>
            )}
          </div>

          <HistoryPreview
            history={{
              weekly: data.history.weekly,
              monthly: data.history.monthly,
            }}
            hasWeeklyGoal={hasWeeklyGoal}
            hasMonthlyGoal={hasMonthlyGoal}
          />
        </TabsContent>

        {/* Premium Goals Tab */}
        <TabsContent value="premium" className="m-0">
          <div className="mb-3 p-2.5 bg-violet-50 dark:bg-violet-950/30 rounded-lg border border-violet-200 dark:border-violet-800">
            <p className="text-xs text-violet-700 dark:text-violet-400">
              <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
              Premium Goals track <strong>only</strong> income from covered calls and cash-secured puts.
            </p>
          </div>

          <div className="space-y-3">
            {/* Weekly Premium Goal */}
            {editingGoal === 'premium_weekly' ? (
              <AddGoalForm
                goalType="premium_weekly"
                initialValue={premiumWeeklyGoal?.targetPnL}
                onSubmit={(amount) => createMutation.mutate({ goalType: 'premium_weekly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setEditingGoal(null)}
                isLoading={createMutation.isPending}
                isPremium
              />
            ) : addingGoal === 'premium_weekly' ? (
              <AddGoalForm
                goalType="premium_weekly"
                onSubmit={(amount) => createMutation.mutate({ goalType: 'premium_weekly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setAddingGoal(null)}
                isLoading={createMutation.isPending}
                isPremium
              />
            ) : premiumWeeklyGoal ? (
              <GoalCard
                goal={premiumWeeklyGoal}
                onEdit={() => setEditingGoal('premium_weekly')}
                onDelete={() => deleteMutation.mutate({ goalType: 'premium_weekly', brokerageAccountId: accountId })}
                isPremium
              />
            ) : (
              <button
                onClick={() => setAddingGoal('premium_weekly')}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-violet-300 text-violet-500 hover:text-violet-700 hover:border-violet-400 dark:border-violet-700 dark:text-violet-400 dark:hover:text-violet-200 dark:hover:border-violet-500 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm">Set Weekly Premium Goal</span>
              </button>
            )}

            {/* Monthly Premium Goal */}
            {editingGoal === 'premium_monthly' ? (
              <AddGoalForm
                goalType="premium_monthly"
                initialValue={premiumMonthlyGoal?.targetPnL}
                onSubmit={(amount) => createMutation.mutate({ goalType: 'premium_monthly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setEditingGoal(null)}
                isLoading={createMutation.isPending}
                isPremium
              />
            ) : addingGoal === 'premium_monthly' ? (
              <AddGoalForm
                goalType="premium_monthly"
                onSubmit={(amount) => createMutation.mutate({ goalType: 'premium_monthly', targetPnL: amount, brokerageAccountId: accountId })}
                onCancel={() => setAddingGoal(null)}
                isLoading={createMutation.isPending}
                isPremium
              />
            ) : premiumMonthlyGoal ? (
              <GoalCard
                goal={premiumMonthlyGoal}
                onEdit={() => setEditingGoal('premium_monthly')}
                onDelete={() => deleteMutation.mutate({ goalType: 'premium_monthly', brokerageAccountId: accountId })}
                isPremium
              />
            ) : (
              <button
                onClick={() => setAddingGoal('premium_monthly')}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-violet-300 text-violet-500 hover:text-violet-700 hover:border-violet-400 dark:border-violet-700 dark:text-violet-400 dark:hover:text-violet-200 dark:hover:border-violet-500 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm">Set Monthly Premium Goal</span>
              </button>
            )}
          </div>

          <HistoryPreview
            history={{
              weekly: data.history.premium_weekly,
              monthly: data.history.premium_monthly,
            }}
            hasWeeklyGoal={hasPremiumWeeklyGoal}
            hasMonthlyGoal={hasPremiumMonthlyGoal}
            isPremium
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
