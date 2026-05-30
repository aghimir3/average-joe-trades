'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Train Tab
 *
 * Model training controls and management.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Target,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trainWheelModels, trainOptionsModels } from './lib/api';

interface WheelStatusPayload {
  status?: {
    modelInfo?: {
      lastTrainedAt?: string | null;
    };
    dataStats?: {
      totalWheelTrades?: number;
    };
  };
}

interface OptionsStatusPayload {
  modelInfo?: {
    lastTrainedAt?: string | null;
  };
  dataStats?: {
    totalTrades?: number;
  };
}

interface StockStatusPayload {
  ready?: boolean;
  tradeCount?: number;
  minTradesRequired?: number;
  calibrationScore?: number | null;
}

interface TrainingCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  isTraining: boolean;
  lastTrainedAt: string | null;
  tradesUsed: number;
  minTrades: number;
  onTrain: () => void;
  canTrain: boolean;
}

function TrainingCard({
  title,
  description,
  icon: Icon,
  iconColor,
  isTraining,
  lastTrainedAt,
  tradesUsed,
  minTrades,
  onTrain,
  canTrain,
}: TrainingCardProps) {
  const hasEnoughData = tradesUsed >= minTrades;
  const canExecute = canTrain && hasEnoughData;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', iconColor)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              {title}
            </h3>
            <p className="text-sm text-zinc-500">{description}</p>
          </div>
        </div>
      </div>

      {/* Data Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-zinc-500">Training Data</span>
          <span className={cn(
            'font-medium',
            hasEnoughData ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
          )}>
            {tradesUsed} / {minTrades} trades
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              hasEnoughData ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            style={{ width: `${Math.min(100, (tradesUsed / minTrades) * 100)}%` }}
          />
        </div>
        {!hasEnoughData && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {minTrades - tradesUsed} more trades needed
          </p>
        )}
      </div>

      {/* Last Trained */}
      {lastTrainedAt && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
          <Clock className="h-4 w-4" />
          Last trained: {new Date(lastTrainedAt).toLocaleString()}
        </div>
      )}

      {/* Train Button */}
      <Button
        onClick={onTrain}
        disabled={!canExecute || isTraining}
        className={cn(
          'w-full',
          canExecute
            ? 'bg-violet-500 hover:bg-violet-600 text-white'
            : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
        )}
      >
        {isTraining ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Training...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Train Models
          </>
        )}
      </Button>

    </div>
  );
}

export function TrainTab() {
  const queryClient = useQueryClient();
  const [trainingResults, setTrainingResults] = useState<{
    type: string;
    success: boolean;
    message: string;
  }[]>([]);

  // Fetch wheel status
  const { data: wheelData } = useQuery<WheelStatusPayload>({
    queryKey: ['wheel-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/wheel/train');
      if (!response.ok) throw new Error('Failed to fetch wheel status');
      return apiData<WheelStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch options status
  const { data: optionsData } = useQuery<OptionsStatusPayload | null>({
    queryKey: ['options-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/options/status');
      if (!response.ok) return null;
      return apiData<OptionsStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch stock model status
  const { data: stockData } = useQuery<StockStatusPayload | null>({
    queryKey: ['stock-ml-status'],
    queryFn: async () => {
      const response = await fetch('/api/ml/stocks/status');
      if (!response.ok) return null;
      return apiData<StockStatusPayload>(await parseApiJson(response));
    },
    staleTime: 10 * 60 * 1000,
  });

  // Train mutations
  const wheelMutation = useMutation({
    mutationFn: trainWheelModels,
    onSuccess: (results) => {
      setTrainingResults(results.map(r => ({
        type: r.modelType,
        success: r.success,
        message: r.success ? `Trained with ${r.stats.tradesUsed} trades` : (r.error || 'Failed'),
      })));
      queryClient.invalidateQueries({ queryKey: ['wheel-ml-status'] });
      queryClient.invalidateQueries({ queryKey: ['ai-unified'] });
    },
    onError: (error) => {
      setTrainingResults([{ type: 'wheel', success: false, message: error.message }]);
    },
  });

  const optionsMutation = useMutation({
    mutationFn: trainOptionsModels,
    onSuccess: (results) => {
      setTrainingResults(results.map(r => ({
        type: r.modelType,
        success: r.success,
        message: r.success ? `Trained with ${r.stats.tradesUsed} trades` : (r.error || 'Failed'),
      })));
      queryClient.invalidateQueries({ queryKey: ['options-ml-status'] });
      queryClient.invalidateQueries({ queryKey: ['ai-unified'] });
    },
    onError: (error) => {
      setTrainingResults([{ type: 'options', success: false, message: error.message }]);
    },
  });

  const wheelStatus = wheelData?.status;
  const dataStats = wheelStatus?.dataStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Model Training
        </h2>
      </div>

      {/* Training Results */}
      {trainingResults.length > 0 && (
        <div className="space-y-2">
          {trainingResults.map((result, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
                result.success
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              )}
            >
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="font-medium">{result.type}:</span>
              <span>{result.message}</span>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTrainingResults([])}
            className="text-xs"
          >
            Clear Results
          </Button>
        </div>
      )}

      {/* Training Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TrainingCard
          title="Wheel Strategy"
          description="Train Candidate Ranker, Strike Optimizer, and Roll Advisor"
          icon={Target}
          iconColor="bg-emerald-500"
          isTraining={wheelMutation.isPending}
          lastTrainedAt={wheelStatus?.modelInfo?.lastTrainedAt ?? null}
          tradesUsed={dataStats?.totalWheelTrades ?? 0}
          minTrades={20}
          canTrain={true}
          onTrain={() => wheelMutation.mutate()}
        />

        <TrainingCard
          title="Options ML"
          description="Train Volatility Regime, Entry Timing, and Exit Strategy"
          icon={BarChart3}
          iconColor="bg-violet-500"
          isTraining={optionsMutation.isPending}
          lastTrainedAt={optionsData?.modelInfo?.lastTrainedAt ?? null}
          tradesUsed={optionsData?.dataStats?.totalTrades ?? 0}
          minTrades={30}
          canTrain={true}
          onTrain={() => optionsMutation.mutate()}
        />
      </div>

      {/* Stock model is always-on and updates from latest data */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Stock Action Model (Auto-updating)
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
              Uses current market price vs entry and blends personal + community stock outcomes.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md bg-white/70 dark:bg-zinc-900/40 p-2">
                <p className="text-blue-600 dark:text-blue-300">Readiness</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {stockData?.ready ? 'Ready' : 'Collecting Data'}
                </p>
              </div>
              <div className="rounded-md bg-white/70 dark:bg-zinc-900/40 p-2">
                <p className="text-blue-600 dark:text-blue-300">Stock Trades</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {stockData?.tradeCount ?? 0}
                </p>
              </div>
              <div className="rounded-md bg-white/70 dark:bg-zinc-900/40 p-2">
                <p className="text-blue-600 dark:text-blue-300">Min Required</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {stockData?.minTradesRequired ?? 15}
                </p>
              </div>
              <div className="rounded-md bg-white/70 dark:bg-zinc-900/40 p-2">
                <p className="text-blue-600 dark:text-blue-300">Calibration</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  {stockData?.calibrationScore
                    ? `${Math.round(stockData.calibrationScore * 100)}%`
                    : '--'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
              Training Tips
            </h4>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <li>Models improve with more training data (more completed trades)</li>
              <li>Retrain after significant new trades for best results</li>
              <li>Training may take 30-60 seconds per model</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
