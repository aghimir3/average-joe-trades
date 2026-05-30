'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Your Models Tab
 *
 * Displays personal ML model status from both wheel and options systems.
 */

import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Target,
  RotateCcw,
  Zap,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WheelModelInfo {
  candidateRankerVersion?: number | null;
  strikeOptimizerVersion?: number | null;
  rollAdvisorVersion?: number | null;
  lastTrainedAt?: string | null;
}

interface WheelDataStats {
  totalWheelTrades?: number;
  uniqueSymbols?: number;
}

interface WheelStatusPayload {
  status?: {
    modelInfo?: WheelModelInfo;
    dataStats?: WheelDataStats;
  };
}

interface OptionsModelInfo {
  volatilityRegimeVersion?: number | null;
  entryTimingVersion?: number | null;
  exitStrategyVersion?: number | null;
  strategyClassifierVersion?: number | null;
  riskAnalyzerVersion?: number | null;
  tradeEmbedderVersion?: number | null;
  lastTrainedAt?: string | null;
}

interface OptionsDataStats {
  totalTrades?: number;
}

interface OptionsStatusPayload {
  modelInfo?: OptionsModelInfo;
  dataStats?: OptionsDataStats;
}

interface StockStatusPayload {
  ready?: boolean;
  lastUpdated?: string | null;
  tradeCount?: number;
  minTradesRequired?: number;
  calibrationScore?: number | null;
}

interface ModelHealthSummary {
  totalModels: number;
  stableModels: number;
  retrainRecommended: number;
}

interface ModelHealthPayload {
  summary?: ModelHealthSummary;
}

interface ModelStatusCardProps {
  name: string;
  description: string;
  icon: React.ElementType;
  isActive: boolean;
  version: number | null;
  lastTrainedAt: string | null;
  tradesUsed: number;
  minTradesRequired: number;
  accuracy?: number;
}

function ModelStatusCard({
  name,
  description,
  icon: Icon,
  isActive,
  version,
  lastTrainedAt,
  tradesUsed,
  minTradesRequired,
  accuracy,
}: ModelStatusCardProps) {
  const progress = Math.min(100, (tradesUsed / minTradesRequired) * 100);
  const canTrain = tradesUsed >= minTradesRequired;

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      isActive
        ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            isActive
              ? 'bg-emerald-100 dark:bg-emerald-900/40'
              : 'bg-zinc-100 dark:bg-zinc-800'
          )}>
            <Icon className={cn(
              'h-4 w-4',
              isActive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500'
            )} />
          </div>
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
              {name}
            </h4>
            <p className="text-xs text-zinc-500">{description}</p>
          </div>
        </div>
        {isActive ? (
          <Badge className="bg-emerald-500 text-white text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            <XCircle className="h-3 w-3 mr-1" />
            Not Trained
          </Badge>
        )}
      </div>

      {/* Progress to training */}
      {!isActive && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>Training Progress</span>
            <span>{tradesUsed}/{minTradesRequired} trades</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                canTrain ? 'bg-emerald-500' : 'bg-violet-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          {!canTrain && (
            <p className="text-xs text-zinc-400 mt-1">
              {minTradesRequired - tradesUsed} more trades needed
            </p>
          )}
        </div>
      )}

      {/* Stats for active models */}
      {isActive && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-800">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              v{version}
            </p>
            <p className="text-[10px] text-zinc-500">Version</p>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-800">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {tradesUsed}
            </p>
            <p className="text-[10px] text-zinc-500">Trades</p>
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-zinc-800">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {accuracy ? `${(accuracy * 100).toFixed(0)}%` : '--'}
            </p>
            <p className="text-[10px] text-zinc-500">Accuracy</p>
          </div>
        </div>
      )}

      {/* Last trained */}
      {lastTrainedAt && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1 text-xs text-zinc-400">
          <Clock className="h-3 w-3" />
          Last trained: {new Date(lastTrainedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

export function YourModelsTab() {
  const { data: wheelData, isLoading: wheelLoading } = useQuery<WheelStatusPayload>({
    queryKey: ['wheel-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/wheel/train');
      if (!response.ok) throw new Error('Failed to fetch wheel status');
      return apiData<WheelStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: optionsData, isLoading: optionsLoading } = useQuery<OptionsStatusPayload | null>({
    queryKey: ['options-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/options/status');
      if (!response.ok) return null; // Options ML might not be available
      return apiData<OptionsStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: stockData, isLoading: stockLoading } = useQuery<StockStatusPayload | null>({
    queryKey: ['stock-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/stocks/status');
      if (!response.ok) return null;
      return apiData<StockStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: modelHealthData, isLoading: modelHealthLoading } = useQuery<ModelHealthPayload | null>({
    queryKey: ['quant-model-health'],
    queryFn: async () => {
      const response = await fetch('/api/quant/models/health');
      if (!response.ok) return null;
      return apiData<ModelHealthPayload>(await parseApiJson(response));
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = wheelLoading || optionsLoading || stockLoading || modelHealthLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const wheelStatus = wheelData?.status;
  const wheelModels = wheelStatus?.modelInfo;
  const dataStats = wheelStatus?.dataStats;
  const optionModelInfo = optionsData?.modelInfo;
  const optionDataStats = optionsData?.dataStats;
  const stockStatus = stockData;
  const modelHealthSummary = modelHealthData?.summary;

  const activeWheelModels = [
    wheelModels?.candidateRankerVersion,
    wheelModels?.strikeOptimizerVersion,
    wheelModels?.rollAdvisorVersion,
  ].filter((v) => v !== null && v !== undefined).length;

  const activeOptionModels = [
    optionModelInfo?.volatilityRegimeVersion,
    optionModelInfo?.entryTimingVersion,
    optionModelInfo?.exitStrategyVersion,
    optionModelInfo?.strategyClassifierVersion,
    optionModelInfo?.riskAnalyzerVersion,
    optionModelInfo?.tradeEmbedderVersion,
  ].filter((v) => v !== null && v !== undefined).length;

  const activeStockModels = stockStatus?.ready ? 1 : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">How to read this</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Active means a model has enough data and passed baseline checks. Not Trained means your trade count is still below the
          minimum threshold shown on the card.
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Drift means live behavior no longer matches recent validation quality. Data source: your ledger/synced trade history and
          market features. The stock model can also use anonymized community outcomes for context.
        </p>
      </div>

      {/* Wheel Strategy Models */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Wheel Strategy Models
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <ModelStatusCard
            name="Candidate Ranker"
            description="Ranks stocks for wheel trading"
            icon={TrendingUp}
            isActive={wheelModels?.candidateRankerVersion !== null}
            version={wheelModels?.candidateRankerVersion ?? null}
            lastTrainedAt={wheelModels?.lastTrainedAt ?? null}
            tradesUsed={dataStats?.totalWheelTrades ?? 0}
            minTradesRequired={30}
          />
          <ModelStatusCard
            name="Strike Optimizer"
            description="Recommends optimal strike & DTE"
            icon={Target}
            isActive={wheelModels?.strikeOptimizerVersion !== null}
            version={wheelModels?.strikeOptimizerVersion ?? null}
            lastTrainedAt={wheelModels?.lastTrainedAt ?? null}
            tradesUsed={dataStats?.totalWheelTrades ?? 0}
            minTradesRequired={50}
          />
          <ModelStatusCard
            name="Roll Advisor"
            description="Roll, expire, or close decisions"
            icon={RotateCcw}
            isActive={wheelModels?.rollAdvisorVersion !== null}
            version={wheelModels?.rollAdvisorVersion ?? null}
            lastTrainedAt={wheelModels?.lastTrainedAt ?? null}
            tradesUsed={dataStats?.totalWheelTrades ?? 0}
            minTradesRequired={20}
          />
        </div>
      </div>

      {/* Options ML Models */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Options ML Models
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <ModelStatusCard
            name="Volatility Regime"
            description="Classifies market conditions"
            icon={BarChart3}
            isActive={optionModelInfo?.volatilityRegimeVersion !== null && optionModelInfo?.volatilityRegimeVersion !== undefined}
            version={optionModelInfo?.volatilityRegimeVersion ?? null}
            lastTrainedAt={optionModelInfo?.lastTrainedAt ?? null}
            tradesUsed={optionDataStats?.totalTrades ?? 0}
            minTradesRequired={30}
          />
          <ModelStatusCard
            name="Entry Timing"
            description="Optimal entry timing signals"
            icon={Clock}
            isActive={optionModelInfo?.entryTimingVersion !== null && optionModelInfo?.entryTimingVersion !== undefined}
            version={optionModelInfo?.entryTimingVersion ?? null}
            lastTrainedAt={optionModelInfo?.lastTrainedAt ?? null}
            tradesUsed={optionDataStats?.totalTrades ?? 0}
            minTradesRequired={30}
          />
          <ModelStatusCard
            name="Exit Strategy"
            description="Predicts optimal exit points"
            icon={Zap}
            isActive={optionModelInfo?.exitStrategyVersion !== null && optionModelInfo?.exitStrategyVersion !== undefined}
            version={optionModelInfo?.exitStrategyVersion ?? null}
            lastTrainedAt={optionModelInfo?.lastTrainedAt ?? null}
            tradesUsed={optionDataStats?.totalTrades ?? 0}
            minTradesRequired={30}
          />
        </div>
      </div>

      {/* Stock Model */ }
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Stock Action Model
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-1">
          <ModelStatusCard
            name="Personal + Community Stock Signal"
            description="Blends your stock history with community outcomes and live market context"
            icon={TrendingUp}
            isActive={stockStatus?.ready ?? false}
            version={stockStatus?.ready ? 1 : null}
            lastTrainedAt={stockStatus?.lastUpdated ?? null}
            tradesUsed={stockStatus?.tradeCount ?? 0}
            minTradesRequired={stockStatus?.minTradesRequired ?? 15}
            accuracy={stockStatus?.calibrationScore ?? undefined}
          />
        </div>
      </div>

      {/* Data Summary */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-violet-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Training Data Summary
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {dataStats?.totalWheelTrades ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Wheel Trades</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {dataStats?.uniqueSymbols ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Unique Symbols</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {optionDataStats?.totalTrades ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Options Trades</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {stockStatus?.tradeCount ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Stock Trades</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {activeWheelModels + activeOptionModels + activeStockModels}
            </p>
            <p className="text-xs text-zinc-500">Active Models</p>
          </div>
        </div>
      </div>

      {/* Model Health & Drift */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Model Health & Drift
          </h3>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          This is your model control panel: it summarizes registry coverage, which models are still stable, and where retraining is
          recommended based on recent out-of-sample performance.
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {modelHealthSummary?.totalModels ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Registry Models</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {modelHealthSummary?.stableModels ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Stable</p>
          </div>
          <div>
            <p className={cn(
              'text-2xl font-bold',
              (modelHealthSummary?.retrainRecommended ?? 0) > 0
                ? 'text-amber-500'
                : 'text-emerald-500'
            )}>
              {modelHealthSummary?.retrainRecommended ?? 0}
            </p>
            <p className="text-xs text-zinc-500">Retrain Suggested</p>
          </div>
        </div>
      </div>
    </div>
  );
}
