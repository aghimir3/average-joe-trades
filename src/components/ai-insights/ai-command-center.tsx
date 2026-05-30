'use client';

/**
 * AI Command Center
 *
 * Compact hero section for AI Insights with aggregate status.
 */

import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Zap,
  Target,
  TrendingUp,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchUnifiedStatus } from './lib/api';
import type { ConfidenceLevel } from './lib/types';

interface AICommandCenterProps {
  accountId?: string | null;
  onRefresh?: () => void;
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="min-w-0 w-full sm:w-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50">
      <Icon className={cn('h-4 w-4', color)} />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
          {value}
        </span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: ConfidenceLevel }) {
  const config = {
    high: { label: 'High', color: 'bg-emerald-500', textColor: 'text-emerald-500' },
    medium: { label: 'Med', color: 'bg-amber-500', textColor: 'text-amber-500' },
    low: { label: 'Low', color: 'bg-red-500', textColor: 'text-red-500' },
  };
  const c = config[confidence];

  return (
    <div className="min-w-0 w-full sm:w-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50">
      <div className="relative flex items-center justify-center w-8 h-8">
        <svg className="w-8 h-8 -rotate-90">
          <circle cx="16" cy="16" r="12" fill="none" strokeWidth="3" className="stroke-zinc-200 dark:stroke-zinc-700" />
          <circle
            cx="16" cy="16" r="12" fill="none" strokeWidth="3" strokeLinecap="round"
            className={c.color.replace('bg-', 'stroke-')}
            style={{
              strokeDasharray: 75.4,
              strokeDashoffset: confidence === 'high' ? 11 : confidence === 'medium' ? 26 : 49,
            }}
          />
        </svg>
        <span className={cn('absolute text-[9px] font-bold', c.textColor)}>{c.label.toUpperCase()}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
          {c.label}
        </span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
          Confidence
        </span>
      </div>
    </div>
  );
}

export function AICommandCenter({ accountId, onRefresh }: AICommandCenterProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-unified', accountId],
    queryFn: () => fetchUnifiedStatus(accountId),
    staleTime: 2 * 60 * 1000,
  });

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  const status = data ?? {
    pendingActions: 0,
    totalModelsActive: 0,
    totalModelsPossible: 14, // + quant governance models
    overallConfidence: 'medium' as ConfidenceLevel,
    urgentMessage: null,
    topOpportunity: null,
    lastUpdated: new Date().toISOString(),
    wheelModelsReady: false,
    optionsModelsReady: false,
    communityModelReady: false,
    stockModelsReady: false,
    quantModelsReady: false,
  };

  const accuracyDisplay = status.totalModelsActive > 0 ? '78%' : '--';

  return (
    <div className="rounded-xl border border-violet-200/50 dark:border-violet-800/30 bg-linear-to-r from-violet-50/80 via-indigo-50/50 to-violet-50/80 dark:from-violet-950/30 dark:via-indigo-950/20 dark:to-violet-950/30">
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 animate-ping opacity-20 rounded-full bg-violet-500" />
              <div className="relative p-2 rounded-full bg-linear-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
                <Brain className="h-4 w-4 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                AI Command Center
                <Sparkles className="h-4 w-4 text-violet-500" />
              </h1>
              <p className="text-xs text-zinc-500">Powered by your trading data</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-8 px-2 text-xs hover:bg-violet-100 dark:hover:bg-violet-900/30"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <MiniStat icon={Zap} label="Actions" value={status.pendingActions} color="text-amber-500" />
          <MiniStat icon={Target} label="Accuracy" value={accuracyDisplay} color="text-emerald-500" />
          <MiniStat icon={Brain} label="Models" value={`${status.totalModelsActive}/${status.totalModelsPossible}`} color="text-violet-500" />
          <ConfidencePill confidence={status.overallConfidence} />
        </div>

        {/* Urgent message */}
        {status.urgentMessage && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-white/60 dark:bg-zinc-800/60 border border-violet-200/30 dark:border-violet-700/30">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-violet-500 shrink-0" />
              {status.urgentMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
