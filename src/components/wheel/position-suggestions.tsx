'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Position Suggestions Component
 *
 * Shows community-based suggestions for the user's current open wheel positions.
 * Provides actionable advice based on community patterns.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  Lightbulb,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type SuggestionType = 'close_profit' | 'close_loss' | 'hold' | 'roll' | 'assignment_warning' | 'no_data';
type SuggestionPriority = 'high' | 'medium' | 'low' | 'info';

interface PositionSuggestion {
  positionId: string;
  symbol: string;
  underlyingTicker: string;
  optionType: string | null;
  strategy: string | null;
  strike: number | null;
  expiration: string | null;
  daysToExpiration: number | null;
  quantity: number;
  costBasis: number;
  currentPnlPercent: number | null;
  suggestion: {
    type: SuggestionType;
    priority: SuggestionPriority;
    title: string;
    description: string;
    action?: string;
  };
  communityData: {
    hasData: boolean;
    winRate?: number;
    assignmentRate?: number;
    avgHoldDays?: number;
    optimalDte?: number;
    recommendation?: string;
    score?: number;
  };
}

interface PositionSuggestionsResponse {
  suggestions: PositionSuggestion[];
  summary: {
    totalPositions: number;
    highPriority: number;
    mediumPriority: number;
    withCommunityData: number;
  };
}

interface PositionSuggestionsProps {
  accountId?: string | null;
  compact?: boolean;
  className?: string;
}

// ============================================================================
// API
// ============================================================================

async function fetchPositionSuggestions(accountId?: string | null): Promise<PositionSuggestionsResponse> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);

  const response = await fetch(`/api/ml/wheel/community/positions?${params}`);
  if (!response.ok) throw new Error('Failed to fetch position suggestions');
  return apiData(await parseApiJson(response));
}

// ============================================================================
// Helper Components
// ============================================================================

function PriorityIcon({ priority }: { priority: SuggestionPriority }) {
  const config = {
    high: { icon: AlertTriangle, className: 'text-red-500' },
    medium: { icon: Lightbulb, className: 'text-amber-500' },
    low: { icon: CheckCircle2, className: 'text-emerald-500' },
    info: { icon: HelpCircle, className: 'text-zinc-400' },
  };

  const { icon: Icon, className } = config[priority];
  return <Icon className={cn('h-4 w-4', className)} />;
}

function SuggestionTypeIcon({ type }: { type: SuggestionType }) {
  const config = {
    close_profit: { icon: TrendingUp, className: 'text-emerald-500' },
    close_loss: { icon: AlertTriangle, className: 'text-red-500' },
    hold: { icon: Clock, className: 'text-blue-500' },
    roll: { icon: RefreshCw, className: 'text-amber-500' },
    assignment_warning: { icon: AlertCircle, className: 'text-red-500' },
    no_data: { icon: HelpCircle, className: 'text-zinc-400' },
  };

  const { icon: Icon, className } = config[type];
  return <Icon className={cn('h-4 w-4', className)} />;
}

function PriorityBadge({ priority }: { priority: SuggestionPriority }) {
  const config = {
    high: { label: 'Action Needed', className: 'bg-red-500 text-white' },
    medium: { label: 'Consider', className: 'bg-amber-500 text-white' },
    low: { label: 'On Track', className: 'bg-emerald-500 text-white' },
    info: { label: 'Info', className: 'bg-zinc-500 text-white' },
  };

  const { label, className } = config[priority];
  return <Badge className={cn('text-xs font-medium', className)}>{label}</Badge>;
}

function formatStrategy(strategy: string | null): string {
  if (!strategy) return '';
  return strategy === 'covered_call' ? 'CC' : strategy === 'cash_secured_put' ? 'CSP' : strategy;
}

function SuggestionCard({ suggestion }: { suggestion: PositionSuggestion }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <SuggestionTypeIcon type={suggestion.suggestion.type} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {suggestion.underlyingTicker}
              </span>
              <Badge variant="outline" className="text-xs font-medium">
                {formatStrategy(suggestion.strategy)}
              </Badge>
              {suggestion.strike && (
                <span className="text-sm text-zinc-500">${suggestion.strike}</span>
              )}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {suggestion.daysToExpiration !== null ? (
                <span className={cn(
                  suggestion.daysToExpiration <= 7 ? 'text-red-500 font-medium' : ''
                )}>
                  {suggestion.daysToExpiration} days to expiry
                </span>
              ) : (
                'No expiration'
              )}
            </div>
          </div>
        </div>
        <PriorityBadge priority={suggestion.suggestion.priority} />
      </div>

      {/* Suggestion Content */}
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
          {suggestion.suggestion.title}
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {suggestion.suggestion.description}
        </p>
        {suggestion.suggestion.action && (
          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <ArrowRightCircle className="h-3.5 w-3.5" />
            {suggestion.suggestion.action}
          </div>
        )}
      </div>

      {/* Community Data */}
      {suggestion.communityData.hasData && (
        <div className="flex items-center gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {(suggestion.communityData.winRate! * 100).toFixed(0)}% win
          </span>
          {suggestion.communityData.assignmentRate !== undefined && (
            <span>{(suggestion.communityData.assignmentRate * 100).toFixed(0)}% assigned</span>
          )}
          {suggestion.communityData.score !== undefined && (
            <span>Score: {suggestion.communityData.score.toFixed(0)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionCardCompact({ suggestion }: { suggestion: PositionSuggestion }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30">
      <PriorityIcon priority={suggestion.suggestion.priority} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
            {suggestion.underlyingTicker}
          </span>
          <span className="text-xs text-zinc-500">
            {formatStrategy(suggestion.strategy)}
          </span>
          {suggestion.daysToExpiration !== null && (
            <span className={cn(
              'text-xs',
              suggestion.daysToExpiration <= 7 ? 'text-red-500' : 'text-zinc-400'
            )}>
              {suggestion.daysToExpiration}d
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate">
          {suggestion.suggestion.title}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PositionSuggestions({ accountId, compact = false, className }: PositionSuggestionsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['positionSuggestions', accountId],
    queryFn: () => fetchPositionSuggestions(accountId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50', className)}>
        <div className="p-4 pb-2">
          <h3 className="text-base font-semibold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Suggestions...
          </h3>
        </div>
        <div className="px-4 pb-4">
          <LoadingSkeleton compact={compact} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 dark:border-red-800/50 bg-white dark:bg-zinc-800/50 p-4', className)}>
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load position suggestions</span>
        </div>
      </div>
    );
  }

  if (!data || data.suggestions.length === 0) {
    return (
      <div className={cn('rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 p-6 text-center', className)}>
        <Lightbulb className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-500 mb-2" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No open wheel positions to analyze.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
          Open CSP or CC positions will appear here with community-based suggestions.
        </p>
      </div>
    );
  }

  const { suggestions, summary } = data;

  return (
    <div className={cn('rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50', className)}>
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Position Suggestions
          </h3>
          <div className="flex items-center gap-2">
            {summary.highPriority > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {summary.highPriority} action needed
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {summary.totalPositions} positions
            </Badge>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        {compact ? (
          <div className="space-y-2">
            {suggestions.slice(0, 5).map((suggestion) => (
              <SuggestionCardCompact key={suggestion.positionId} suggestion={suggestion} />
            ))}
            {suggestions.length > 5 && (
              <p className="text-xs text-zinc-400 text-center mt-2">
                +{suggestions.length - 5} more positions
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.positionId} suggestion={suggestion} />
            ))}
          </div>
        )}

        {/* Summary footer */}
        <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{summary.withCommunityData} of {summary.totalPositions} with community data</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Powered by community insights
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
