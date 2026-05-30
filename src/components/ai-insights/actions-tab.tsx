'use client';

/**
 * Actions Tab
 *
 * Compact display of AI recommendations sorted by priority and confidence.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Zap,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActionCard } from './action-card';
import { fetchAIActions, submitActionFeedback, updateActionState } from './lib/api';
import type { AIAction, AIActionsResponse } from './lib/types';
import { TickerAdvisorCard } from './ticker-advisor-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { MetricTooltip } from './metric-tooltip';

interface ActionsTabProps {
  accountId?: string | null;
}

export function ActionsTab({ accountId }: ActionsTabProps) {
  const queryClient = useQueryClient();
  const [detailsAction, setDetailsAction] = useState<AIAction | null>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const queryKey = ['ai-actions', accountId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchAIActions(accountId),
    staleTime: 2 * 60 * 1000,
  });

  const stateMutation = useMutation({
    mutationFn: updateActionState,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AIActionsResponse>(queryKey);
      if (previous) {
        const nextActions = previous.actions.filter((action) => action.id !== variables.actionId);
        queryClient.setQueryData<AIActionsResponse>(queryKey, {
          ...previous,
          actions: nextActions,
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<AIActionsResponse>(queryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: submitActionFeedback,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AIActionsResponse>(queryKey);
      if (previous) {
        const nextActions = previous.actions.map((action) =>
          action.id === variables.actionId
            ? {
                ...action,
                userState: {
                  ...action.userState,
                  feedback: variables.feedback,
                },
              }
            : action
        );
        queryClient.setQueryData<AIActionsResponse>(queryKey, {
          ...previous,
          actions: nextActions,
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<AIActionsResponse>(queryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleDismiss = (id: string) => {
    stateMutation.mutate({ actionId: id, status: 'dismissed' });
  };

  const handleComplete = (id: string) => {
    stateMutation.mutate({ actionId: id, status: 'completed' });
  };

  const handleSnooze = (id: string, hours: number) => {
    const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    stateMutation.mutate({ actionId: id, status: 'snoozed', snoozedUntil });
  };

  const handleFeedback = (id: string, feedback: 'helpful' | 'not_helpful') => {
    feedbackMutation.mutate({ actionId: id, feedback });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-zinc-900 p-4 text-center">
        <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
        <p className="text-xs text-red-600 dark:text-red-400">Failed to load actions</p>
      </div>
    );
  }

  const actions = data?.actions ?? [];

  if (actions.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
        <div className="p-3 rounded-full bg-emerald-500/10 w-fit mx-auto mb-3">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          No Actions Needed
        </h3>
        <p className="text-xs text-zinc-500 max-w-xs mx-auto">
          Your portfolio looks healthy. Check back later for AI recommendations.
        </p>
      </div>
    );
  }

  const sortedActions = [...actions].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  const highPriorityCount = actions.filter((a) => a.priority === 'high').length;

  return (
    <div className="space-y-3">
      <TickerAdvisorCard accountId={accountId} />

      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recommended Actions
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {highPriorityCount > 0 && (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              'bg-red-500/10 text-red-500'
            )}>
              {highPriorityCount} urgent
            </span>
          )}
          <span className="text-zinc-400">{actions.length} total</span>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">How to read action cards</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Confidence is a probability band, not certainty. Reason codes explain the main drivers. Risk flags highlight guardrail
          breaches.
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Expected value estimates upside vs downside from similar setups. Data source: your entries, current market context, model
          outputs, and community aggregates when sample quality is strong.
        </p>
      </div>

      {/* Action Cards - tighter spacing */}
      <div className="space-y-2">
        {sortedActions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onDismiss={handleDismiss}
            onComplete={handleComplete}
            onSnooze={handleSnooze}
            onFeedback={handleFeedback}
            onViewDetails={(a) => setDetailsAction(a)}
          />
        ))}
      </div>

      {isDesktop ? (
        <Dialog
          open={Boolean(detailsAction)}
          onOpenChange={(open) => {
            if (!open) setDetailsAction(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            {detailsAction && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {detailsAction.symbol} | {detailsAction.title}
                  </DialogTitle>
                  <DialogDescription>
                    {detailsAction.description}
                  </DialogDescription>
                </DialogHeader>
                <ActionDetailsTabs action={detailsAction} />
              </>
            )}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer
          open={Boolean(detailsAction)}
          onOpenChange={(open) => {
            if (!open) setDetailsAction(null);
          }}
        >
          <DrawerContent>
            {detailsAction && (
              <div className="max-h-[80vh] overflow-y-auto">
                <DrawerHeader className="text-left">
                  <DrawerTitle>
                    {detailsAction.symbol} | {detailsAction.title}
                  </DrawerTitle>
                  <DrawerDescription>{detailsAction.description}</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-5">
                  <ActionDetailsTabs action={detailsAction} />
                </div>
              </div>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

function ActionDetailsTabs({ action }: { action: AIAction }) {
  return (
    <Tabs defaultValue="simple" className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
        <TabsTrigger value="simple" className="text-xs sm:text-sm">Simple</TabsTrigger>
        <TabsTrigger value="advanced" className="text-xs sm:text-sm">Advanced Quant</TabsTrigger>
      </TabsList>

      <TabsContent value="simple" className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        {action.reasoning.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Why this?</p>
            <ul className="mt-1 list-disc pl-4 space-y-1 text-xs">
              {action.reasoning.map((reason, index) => (
                <li key={`${action.id}-reason-${index}`}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {action.suggestedAction && (
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Suggested action</p>
            <p className="mt-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
              {action.suggestedAction.action}
            </p>
            <p className="text-xs">{action.suggestedAction.details}</p>
          </div>
        )}

        {(action.reasonCodes?.length || action.riskFlags?.length) && (
          <div className="grid grid-cols-1 gap-2">
            {action.reasonCodes && action.reasonCodes.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400 flex items-center gap-1">
                  Reason codes <MetricTooltip metric="reason_codes" />
                </p>
                <p className="mt-1 text-xs">{action.reasonCodes.join(', ')}</p>
              </div>
            )}
            {action.riskFlags && action.riskFlags.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400 flex items-center gap-1">
                  Risk flags <MetricTooltip metric="risk_flags" />
                </p>
                <p className="mt-1 text-xs text-red-500">{action.riskFlags.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="advanced" className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              Confidence <MetricTooltip metric="confidence" />
            </p>
            <p className="text-sm font-semibold">{action.confidence}%</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              Expected value <MetricTooltip metric="expected_value" />
            </p>
            <p className="text-sm font-semibold">
              {action.expectedValuePct !== undefined ? `${action.expectedValuePct.toFixed(2)}%` : '--'}
            </p>
          </div>
        </div>

        {action.advanced?.quant && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-xs space-y-1">
            <p className="text-zinc-500 uppercase tracking-wide">Quant signal internals</p>
            <p>Side: <span className="font-medium uppercase">{action.advanced.quant.side}</span></p>
            <p>Strength: <span className="font-medium">{(action.advanced.quant.strength * 100).toFixed(1)}%</span></p>
            <p>Horizon: <span className="font-medium capitalize">{action.advanced.quant.horizon}</span></p>
            <p>As of: <span className="font-medium">{new Date(action.advanced.quant.timestamp).toLocaleString()}</span></p>
          </div>
        )}

        {action.advanced?.dataFreshness && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-xs space-y-1">
            <p className="text-zinc-500 uppercase tracking-wide">Data freshness</p>
            <p>Quote as of: <span className="font-medium">{action.advanced.dataFreshness.quoteAsOf ? new Date(action.advanced.dataFreshness.quoteAsOf).toLocaleString() : 'N/A'}</span></p>
            <p>Bars as of: <span className="font-medium">{action.advanced.dataFreshness.barsAsOf ? new Date(action.advanced.dataFreshness.barsAsOf).toLocaleString() : 'N/A'}</span></p>
            <p className={cn(action.advanced.dataFreshness.stale ? 'text-amber-500' : 'text-emerald-500')}>
              {action.advanced.dataFreshness.stale ? 'Using stale fallback data' : 'Fresh enough for live decision support'}
            </p>
          </div>
        )}

        {(action.metadata?.entryPrice !== undefined
          || action.metadata?.currentPrice !== undefined
          || action.metadata?.currentPnlPercent !== undefined
          || action.metadata?.dayChangePercent !== undefined) && (
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Market context</p>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              {action.metadata?.entryPrice !== undefined && (
                <p>
                  Entry: <span className="font-medium">${action.metadata.entryPrice.toFixed(2)}</span>
                </p>
              )}
              {action.metadata?.currentPrice !== undefined && (
                <p>
                  Current: <span className="font-medium">${action.metadata.currentPrice.toFixed(2)}</span>
                </p>
              )}
              {action.metadata?.currentPnlPercent !== undefined && (
                <p>
                  Open P&L: <span className="font-medium">{action.metadata.currentPnlPercent.toFixed(1)}%</span>
                </p>
              )}
              {action.metadata?.dayChangePercent !== undefined && (
                <p>
                  1D Move: <span className="font-medium">{action.metadata.dayChangePercent.toFixed(2)}%</span>
                </p>
              )}
            </div>
          </div>
        )}

        {action.communityData && (
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Community signal</p>
            <p className="mt-1 text-xs">
              {action.communityData.recommendation} | Win rate {action.communityData.winRate}%
            </p>
            <p className="text-[11px] text-zinc-400">
              {action.communityData.totalTrades} trades | {action.communityData.uniqueTraders} traders
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
