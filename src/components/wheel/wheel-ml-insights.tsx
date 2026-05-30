'use client';

/**
 * Wheel ML Insights Component
 * Unified AI-powered insights for wheel strategy trading
 *
 * Features 3 tabs:
 * 1. Roll Advisor - Positions needing roll decisions with AI recommendations
 * 2. Opportunities - Ranked wheel candidates based on ML predictions
 * 3. Model Status - Training status and model versions
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  RotateCcw,
  Target,
  CheckCircle,
  Zap,
  ArrowRight,
  DollarSign,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';
import type { WheelRanking, RollAlert } from '@/lib/ml/wheel/types';
import { SingleStockOptimizer } from './single-stock-optimizer';

interface RankingsResponse {
  rankings: WheelRanking[];
  hasEnoughData: boolean;
  dataStats: {
    totalWheelTrades: number;
    uniqueSymbols: number;
    dateRange: { start: string; end: string } | null;
  };
  modelInfo: {
    candidateRankerVersion: number | null;
    strikeOptimizerVersion: number | null;
    rollAdvisorVersion: number | null;
    lastTrainedAt: string | null;
  };
}

interface RollAlertsResponse {
  alerts: RollAlert[];
}

interface TrainingResponse {
  success: boolean;
  report: {
    userId: string;
    reports: Array<{
      modelType: string;
      success: boolean;
      stats: {
        tradesUsed: number;
        epochs: number;
        finalLoss: number;
      };
      error?: string;
    }>;
    trainedAt: string;
  };
}

interface MLStatusResponse {
  status: {
    hasEnoughData: boolean;
    dataStats: {
      totalWheelTrades: number;
      uniqueSymbols: number;
    };
    modelInfo: {
      candidateRankerVersion: number | null;
      strikeOptimizerVersion: number | null;
      rollAdvisorVersion: number | null;
      lastTrainedAt: string | null;
    };
  };
  readiness: {
    ready: boolean;
    recommendations: string[];
  };
}

/**
 * Risk meter component showing 1-10 scale
 */
function RiskMeter({ value, max = 10 }: { value: number; max?: number }) {
  const percentage = (value / max) * 100;
  const color = value <= 3 ? 'bg-emerald-500' : value <= 6 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-[10px] text-zinc-500">{value}/10</span>
    </div>
  );
}

/**
 * Quick stat display for the header area
 */
function QuickStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'violet' | 'blue' | 'emerald' | 'amber';
}) {
  const colorClasses = {
    violet: 'text-violet-600 dark:text-violet-400',
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={colorClasses[color]}>{icon}</span>
      <div>
        <p className={cn('text-sm font-bold', colorClasses[color])}>{value}</p>
        <p className="text-[10px] text-zinc-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * Build API URL with optional account ID
 */
function buildUrl(baseUrl: string, accountId?: string | null): string {
  if (!accountId) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}accountId=${accountId}`;
}

// Cache ML predictions for 10 minutes since models are cached server-side
// Only refreshes on retrain or when staleTime expires
const ML_STALE_TIME = 10 * 60 * 1000;

/**
 * Roll Advisor Tab Content
 */
function RollAdvisorTab({ accountId }: { accountId?: string | null }) {
  const { data, isLoading } = useQuery<RollAlertsResponse>({
    queryKey: ['roll-alerts', accountId],
    queryFn: () => fetch(buildUrl('/api/ml/wheel/roll-alerts', accountId)).then((r) => r.json()),
    staleTime: ML_STALE_TIME,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const alerts = data?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3">
          <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          All Positions Healthy
        </p>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">
          No positions require rolling. All your wheel positions have comfortable DTE and are positioned well.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div
          key={alert.positionId}
          className={cn(
            'p-4 rounded-xl border-l-4 bg-zinc-50 dark:bg-zinc-800/50',
            alert.daysToExpiration <= 3
              ? 'border-l-red-500'
              : alert.daysToExpiration <= 7
                ? 'border-l-amber-500'
                : 'border-l-violet-500'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {alert.symbol}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300"
                >
                  {alert.positionType === 'csp' ? 'CSP' : 'CC'} ${alert.strike}
                </Badge>
                <span className={cn(
                  'text-xs font-medium',
                  alert.daysToExpiration <= 3 ? 'text-red-600 dark:text-red-400' :
                  alert.daysToExpiration <= 7 ? 'text-amber-600 dark:text-amber-400' :
                  'text-zinc-500'
                )}>
                  {alert.daysToExpiration}d to exp
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {alert.isItm ? 'ITM' : 'OTM'} by {(alert.distanceToStrike * 100).toFixed(1)}%
                {' · '}Exp: {alert.expiration}
              </p>
            </div>
            <Badge
              className={cn(
                'shrink-0',
                alert.advice.recommendation === 'roll_out'
                  ? 'bg-violet-500 hover:bg-violet-600 text-white'
                  : alert.advice.recommendation === 'let_expire'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
              )}
            >
              {alert.advice.recommendation.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>

          {/* AI Recommendation */}
          <div className="mt-3 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1.5">
              AI Recommendation
            </p>
            <ul className="space-y-1">
              {alert.advice.reasoning.slice(0, 2).map((r, i) => (
                <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                  <Zap className="h-3 w-3 text-violet-500 mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Projected Outcome for Roll */}
          {alert.advice.recommendation === 'roll_out' && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <ArrowRight className="h-3 w-3 text-violet-500" />
              <span className="text-zinc-500">Roll for</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(alert.advice.projectedOutcomes.ifRoll.netCredit)} credit
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Opportunities Tab Content
 */
function OpportunitiesTab({ accountId }: { accountId?: string | null }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'current' | 'history'>('current');

  const { data, isLoading } = useQuery<RankingsResponse & { filter: string }>({
    queryKey: ['wheel-rankings', filter, accountId],
    queryFn: () => fetch(buildUrl(`/api/ml/wheel/rankings?filter=${filter}`, accountId)).then((r) => r.json()),
    staleTime: ML_STALE_TIME,
  });

  const trainMutation = useMutation<TrainingResponse>({
    mutationFn: () =>
      fetch('/api/ml/wheel/train', { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => {
      // Invalidate all ML caches after retraining
      queryClient.invalidateQueries({ queryKey: ['wheel-rankings'] });
      queryClient.invalidateQueries({ queryKey: ['roll-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ml-training-status'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const { rankings = [], hasEnoughData = false, dataStats, modelInfo } = data || {};

  // Single-stock mode: when user trades ≤2 symbols, show per-ticker optimizer instead of rankings
  const uniqueSymbols = dataStats?.uniqueSymbols ?? 0;
  if (hasEnoughData && uniqueSymbols <= 2 && rankings.length > 0) {
    return <SingleStockOptimizer symbol={rankings[0].symbol} accountId={accountId} />;
  }

  if (!hasEnoughData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-3 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-3">
          <Brain className="h-6 w-6 text-violet-600 dark:text-violet-400" />
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          More Data Needed
        </p>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">
          Complete more wheel trades (CSP/CC) to unlock AI-powered opportunity ranking.
          Current: {dataStats?.totalWheelTrades ?? 0} trades · Need: 20+
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <button
            onClick={() => setFilter('current')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              filter === 'current'
                ? 'bg-violet-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            )}
          >
            Current Holdings
          </button>
          <button
            onClick={() => setFilter('history')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              filter === 'history'
                ? 'bg-violet-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            )}
          >
            All History
          </button>
        </div>
        {modelInfo?.lastTrainedAt && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-violet-600 dark:text-violet-400"
            onClick={() => trainMutation.mutate()}
            disabled={trainMutation.isPending}
          >
            {trainMutation.isPending ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Retrain
          </Button>
        )}
      </div>

      {/* Model Info */}
      {modelInfo?.lastTrainedAt && (
        <p className="text-[10px] text-zinc-400 px-1">
          Based on {dataStats?.totalWheelTrades} trades · Last trained:{' '}
          {new Date(modelInfo.lastTrainedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </p>
      )}

      {/* Empty State */}
      {rankings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-3">
            <Target className="h-5 w-5 text-zinc-400" />
          </div>
          <p className="text-sm text-zinc-500">
            {filter === 'current'
              ? 'No open wheel positions'
              : 'No ranked opportunities available'}
          </p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            {filter === 'current'
              ? 'Open a CSP or CC position to see AI rankings here'
              : 'Complete 3+ wheel trades on a ticker to rank it'}
          </p>
          {filter === 'current' && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-violet-600"
              onClick={() => setFilter('history')}
            >
              View History Instead
            </Button>
          )}
        </div>
      )}

      {/* Rankings List */}
      {rankings.slice(0, 5).map((stock, i) => (
        <div
          key={stock.symbol}
          className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
            <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
              {i + 1}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {stock.symbol}
              </span>
              <Badge variant="outline" className="text-[10px]">
                Score: {stock.score.toFixed(0)}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 truncate">
              {stock.reasoning[0] || 'Based on your trading history'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              +{(stock.expectedMonthlyReturn * 100).toFixed(1)}%
            </p>
            <p className="text-[10px] text-zinc-400">monthly</p>
            <RiskMeter value={stock.riskScore} max={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Model Status Tab Content
 */
function ModelStatusTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<MLStatusResponse>({
    queryKey: ['ml-training-status'],
    queryFn: () => fetch('/api/ml/wheel/train').then((r) => r.json()),
    staleTime: ML_STALE_TIME,
  });

  const trainMutation = useMutation<TrainingResponse>({
    mutationFn: () =>
      fetch('/api/ml/wheel/train', { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-training-status'] });
      queryClient.invalidateQueries({ queryKey: ['wheel-rankings'] });
      queryClient.invalidateQueries({ queryKey: ['roll-alerts'] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const { status, readiness } = data;
  const modelsActive =
    (status.modelInfo.candidateRankerVersion ? 1 : 0) +
    (status.modelInfo.strikeOptimizerVersion ? 1 : 0) +
    (status.modelInfo.rollAdvisorVersion ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Data Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-center">
          <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
            {status.dataStats.totalWheelTrades}
          </p>
          <p className="text-[10px] text-violet-700 dark:text-violet-300">Wheel Trades</p>
        </div>
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {status.dataStats.uniqueSymbols}
          </p>
          <p className="text-[10px] text-blue-700 dark:text-blue-300">Symbols</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {modelsActive}/3
          </p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300">Active Models</p>
        </div>
      </div>

      {/* Model Versions */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
          Model Versions
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Roll Advisor</span>
            </div>
            <Badge
              variant={status.modelInfo.rollAdvisorVersion ? 'default' : 'outline'}
              className={status.modelInfo.rollAdvisorVersion ? 'bg-violet-500' : ''}
            >
              v{status.modelInfo.rollAdvisorVersion ?? 0}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Candidate Ranker</span>
            </div>
            <Badge
              variant={status.modelInfo.candidateRankerVersion ? 'default' : 'outline'}
              className={status.modelInfo.candidateRankerVersion ? 'bg-blue-500' : ''}
            >
              v{status.modelInfo.candidateRankerVersion ?? 0}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Strike Optimizer</span>
            </div>
            <Badge
              variant={status.modelInfo.strikeOptimizerVersion ? 'default' : 'outline'}
              className={status.modelInfo.strikeOptimizerVersion ? 'bg-emerald-500' : ''}
            >
              v{status.modelInfo.strikeOptimizerVersion ?? 0}
            </Badge>
          </div>
        </div>

        {status.modelInfo.lastTrainedAt && (
          <p className="text-[10px] text-zinc-400 mt-3 text-center">
            Last trained: {new Date(status.modelInfo.lastTrainedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Recommendations */}
      {readiness.recommendations.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
            To Improve Models
          </p>
          <ul className="space-y-1">
            {readiness.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Train Button */}
      <Button
        className={cn(
          'w-full',
          modelsActive === 0
            ? 'bg-violet-600 hover:bg-violet-700 text-white'
            : ''
        )}
        variant={modelsActive === 0 ? 'default' : 'outline'}
        onClick={() => trainMutation.mutate()}
        disabled={trainMutation.isPending || !readiness.ready}
      >
        {trainMutation.isPending ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Training Models...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {modelsActive === 0 ? 'Train Models' : 'Retrain All Models'}
          </>
        )}
      </Button>

      {!readiness.ready && (
        <p className="text-[10px] text-center text-zinc-400">
          Need at least 50 wheel trades to train models
        </p>
      )}
    </div>
  );
}

interface WheelMLInsightsProps {
  accountId?: string | null;
}

/**
 * Unified Wheel ML Insights Component
 * Matches the styling of Income Wheel Strategy and Wheel Analytics
 */
export function WheelMLInsights({ accountId }: WheelMLInsightsProps) {
  const [activeTab, setActiveTab] = useState('roll-advisor');

  // Fetch data for quick stats
  const { data: rollData } = useQuery<RollAlertsResponse>({
    queryKey: ['roll-alerts', accountId],
    queryFn: () => fetch(buildUrl('/api/ml/wheel/roll-alerts', accountId)).then((r) => r.json()),
    staleTime: ML_STALE_TIME,
  });

  const { data: rankingsData } = useQuery<RankingsResponse>({
    queryKey: ['wheel-rankings', 'current', accountId],
    queryFn: () => fetch(buildUrl('/api/ml/wheel/rankings', accountId)).then((r) => r.json()),
    staleTime: ML_STALE_TIME,
  });

  const alertCount = rollData?.alerts?.length ?? 0;
  const hasModels = !!(rankingsData?.modelInfo?.lastTrainedAt);
  const topOpportunity = rankingsData?.rankings?.[0];

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header with gradient matching Wheel Analytics */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-zinc-100 dark:border-zinc-800 bg-linear-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                AI Wheel Insights
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                ML-powered recommendations & analysis
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="px-4 py-3 sm:px-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <QuickStat
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Roll Alerts"
            value={alertCount.toString()}
            color={alertCount > 0 ? 'amber' : 'emerald'}
          />
          <QuickStat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Top Pick"
            value={topOpportunity?.symbol ?? 'N/A'}
            color="violet"
          />
          <QuickStat
            icon={<Brain className="h-3.5 w-3.5" />}
            label="Models"
            value={hasModels ? 'Active' : 'Not Trained'}
            color={hasModels ? 'emerald' : 'amber'}
          />
          {topOpportunity && (
            <QuickStat
              icon={<Target className="h-3.5 w-3.5" />}
              label="Expected"
              value={`+${(topOpportunity.expectedMonthlyReturn * 100).toFixed(1)}%`}
              color="emerald"
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-4 sm:px-6 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <TabsList className="grid w-full grid-cols-3 h-10 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
            <TabsTrigger
              value="roll-advisor"
              className="text-sm font-medium rounded-md data-[state=active]:bg-violet-500! dark:data-[state=active]:bg-violet-500! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Roll Advisor</span>
              <span className="sm:hidden">Rolls</span>
              {alertCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  {alertCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="opportunities"
              className="text-sm font-medium rounded-md data-[state=active]:bg-violet-500! dark:data-[state=active]:bg-violet-500! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm transition-all"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Opportunities</span>
              <span className="sm:hidden">Opps</span>
            </TabsTrigger>
            <TabsTrigger
              value="models"
              className="text-sm font-medium rounded-md data-[state=active]:bg-violet-500! dark:data-[state=active]:bg-violet-500! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm transition-all"
            >
              <Brain className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Model Status</span>
              <span className="sm:hidden">Models</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-4 sm:p-6">
          <TabsContent value="roll-advisor" className="m-0">
            <RollAdvisorTab accountId={accountId} />
          </TabsContent>

          <TabsContent value="opportunities" className="m-0">
            <OpportunitiesTab accountId={accountId} />
          </TabsContent>

          <TabsContent value="models" className="m-0">
            <ModelStatusTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// Legacy exports for backwards compatibility - to be removed after dashboard update
export { WheelMLInsights as WheelOpportunities };
export { WheelMLInsights as RollAdvisorAlerts };
export { WheelMLInsights as MLTrainingStatus };
