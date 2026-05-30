'use client';

/**
 * Action Card Component
 *
 * Compact, sleek display of AI recommendations with confidence visualization.
 */

import {
  ArrowRight,
  Clock,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  X,
  ThumbsUp,
  ThumbsDown,
  LogOut,
  Ban,
  Shuffle,
  Target,
  Sparkles,
  ShieldAlert,
  MoreHorizontal,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AIAction } from './lib/types';

interface ActionCardProps {
  action: AIAction;
  onDismiss?: (id: string) => void;
  onComplete?: (id: string) => void;
  onSnooze?: (id: string, hours: number) => void;
  onFeedback?: (id: string, feedback: 'helpful' | 'not_helpful') => void;
  onViewDetails?: (action: AIAction) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof RefreshCw; label: string; color: string; bgColor: string }> = {
  roll: {
    icon: RefreshCw,
    label: 'Roll',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  close: {
    icon: DollarSign,
    label: 'Close',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  new_opportunity: {
    icon: TrendingUp,
    label: 'Opportunity',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  reduce_risk: {
    icon: AlertTriangle,
    label: 'Risk',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  add_position: {
    icon: TrendingUp,
    label: 'Add',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  hold_winner: {
    icon: ThumbsUp,
    label: 'Hold',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  consider_exit: {
    icon: LogOut,
    label: 'Exit',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  avoid_ticker: {
    icon: Ban,
    label: 'Avoid',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  strategy_switch: {
    icon: Shuffle,
    label: 'Switch',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  wheel_opportunity: {
    icon: Target,
    label: 'Wheel',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  premium_opportunity: {
    icon: Sparkles,
    label: 'Premium',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  risk_warning: {
    icon: ShieldAlert,
    label: 'Warning',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  quant_signal: {
    icon: Sparkles,
    label: 'Quant',
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
  },
};

const DEFAULT_TYPE_CONFIG = {
  icon: Sparkles,
  label: 'Action',
  color: 'text-zinc-500',
  bgColor: 'bg-zinc-500/10',
};

function getConfidenceColor(confidence: number) {
  if (confidence >= 85) return 'text-emerald-500 bg-emerald-500';
  if (confidence >= 60) return 'text-amber-500 bg-amber-500';
  return 'text-red-500 bg-red-500';
}

function getPriorityStyle(priority: string) {
  if (priority === 'high') return 'bg-red-500/10 text-red-500 border-red-500/20';
  if (priority === 'medium') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
}

export function ActionCard({
  action,
  onDismiss,
  onComplete,
  onSnooze,
  onFeedback,
  onViewDetails,
}: ActionCardProps) {
  const typeConfig = TYPE_CONFIG[action.type] || DEFAULT_TYPE_CONFIG;
  const TypeIcon = typeConfig.icon;
  const confidenceColor = getConfidenceColor(action.confidence);
  const helpfulSelected = action.userState?.feedback === 'helpful';
  const notHelpfulSelected = action.userState?.feedback === 'not_helpful';

  return (
    <div className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm">
      {/* Top row: Icon, Symbol, Title, Priority, Dismiss */}
      <div className="flex items-start gap-2.5">
        <div className={cn('p-1.5 rounded-md shrink-0', typeConfig.bgColor)}>
          <TypeIcon className={cn('h-3.5 w-3.5', typeConfig.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {action.symbol}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium">
              {typeConfig.label}
            </Badge>
            <Badge className={cn('text-[10px] px-1.5 py-0 h-4 border', getPriorityStyle(action.priority))}>
              {action.priority === 'high' ? 'Urgent' : action.priority === 'medium' ? 'Medium' : 'Low'}
            </Badge>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-1">
            {action.title}
          </p>
        </div>

        {/* Confidence + Dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <div className={cn('w-1.5 h-1.5 rounded-full', confidenceColor.split(' ')[1])} />
            <span className={cn('text-xs font-medium', confidenceColor.split(' ')[0])}>
              {action.confidence}%
            </span>
          </div>
          {onDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(action.id); }}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Details row: Description + Metadata */}
      <div className="mt-2 pl-8">
        <p className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-2">
          {action.description}
        </p>

        {/* Compact metadata */}
        {action.metadata && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-400">
            {action.metadata.daysToExpiration !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {action.metadata.daysToExpiration}d
              </span>
            )}
            {action.metadata.strike && (
              <span>${action.metadata.strike}</span>
            )}
            {action.metadata.potentialCredit && (
              <span className="text-emerald-500">+${action.metadata.potentialCredit}</span>
            )}
            {action.metadata.currentPnlPercent !== undefined && (
              <span className={cn(
                action.metadata.currentPnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500'
              )}>
                {action.metadata.currentPnlPercent >= 0 ? '+' : ''}{action.metadata.currentPnlPercent.toFixed(1)}%
              </span>
            )}
          </div>
        )}

        {/* Reasoning (collapsed by default, show on hover or first item) */}
        {action.reasoning.length > 0 && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5 italic">
            {action.reasoning[0]}
          </p>
        )}

        {(action.confidenceBand || (action.riskFlags && action.riskFlags.length > 0)) && (
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400">
            {action.confidenceBand && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">
                {action.confidenceBand} confidence
              </Badge>
            )}
            {action.riskFlags && action.riskFlags.length > 0 && (
              <span className="text-red-500">{action.riskFlags.length} risk flag{action.riskFlags.length > 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 mt-2 pl-8">
        <div className="flex items-center gap-1.5">
          {onFeedback && (
            <>
              <button
                onClick={() => onFeedback(action.id, 'helpful')}
                className={cn(
                  'p-1 rounded transition-colors',
                  helpfulSelected
                    ? 'text-emerald-500 bg-emerald-500/10'
                    : 'text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10'
                )}
                aria-label="Mark helpful"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onFeedback(action.id, 'not_helpful')}
                className={cn(
                  'p-1 rounded transition-colors',
                  notHelpfulSelected
                    ? 'text-red-500 bg-red-500/10'
                    : 'text-zinc-400 hover:text-red-500 hover:bg-red-500/10'
                )}
                aria-label="Mark not helpful"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onSnooze && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onSnooze(action.id, 24)}>
                  Snooze 1 day
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(action.id, 72)}>
                  Snooze 3 days
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(action.id, 168)}>
                  Snooze 1 week
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {onComplete && (
            <button
              onClick={() => onComplete(action.id)}
              className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors flex items-center gap-0.5"
            >
              <Check className="h-3 w-3" />
              Done
            </button>
          )}

          {onDismiss && (
            <button
              onClick={() => onDismiss(action.id)}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              Dismiss
            </button>
          )}

          <button
            onClick={() => onViewDetails?.(action)}
            className="text-[11px] font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors flex items-center gap-0.5"
          >
            Details
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
