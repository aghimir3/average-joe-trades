/**
 * Position Actions Component
 * ML-powered recommendations for current option positions
 * With pagination (5 items per page) and compact mobile-friendly layout
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Clock,
  Shield,
  ArrowRightLeft,
  X,
  CheckCircle2,
  Loader2,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface PositionPrediction {
  positionId: string;
  symbol: string;
  timestamp: string;
  exitRecommendation: {
    action: 'hold' | 'close' | 'roll' | 'hedge';
    confidence: number;
    targetPrice?: number;
    stopLoss?: number;
    rollSuggestion?: string;
  };
  exitStrategy?: {
    targetProfitPercent: number;  // Already in percent form (e.g., 50 = 50%)
    stopLossPercent: number;      // Already in percent form
    confidence: number;
    rollProbability: number;
    exitTiming?: string;
    exitTimingProbabilities?: {
      early: number;
      at_target: number;
      expiration: number;
    };
  };
  risk: {
    currentRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    daysToExpiry?: number;
    thetaDecay?: number;
  };
  uncertainty: {
    overall: number;
    confidence95CI: [number, number];
  };
  insights: Array<{
    type: string;
    source: string;
    message: string;
    weight: number;
  }>;
}

interface PortfolioPredictions {
  positions: PositionPrediction[];
  summary: {
    totalPositions: number;
    highRiskCount: number;
    actionRequired: number;
    averageConfidence: number;
    portfolioRiskScore: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const ITEMS_PER_PAGE = 5;

// ============================================================================
// API Function
// ============================================================================

async function fetchPortfolioPredictions(accountId?: string | null): Promise<PortfolioPredictions> {
  const params = new URLSearchParams({ type: 'portfolio' });
  if (accountId) {
    params.set('accountId', accountId);
  }
  const res = await fetch(`/api/ml/options/ensemble?${params}`);
  if (!res.ok) {
    const data = await parseApiJson(res);
    if (data.error === 'Feature Disabled') {
      throw new Error('disabled');
    }
    throw new Error('Failed to fetch predictions');
  }
  const data = await parseApiJson(res);
  return apiData(data);
}

// ============================================================================
// Component
// ============================================================================

interface PositionActionsProps {
  accountId?: string | null;
}

export function PositionActions({ accountId }: PositionActionsProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Swipe handlers for mobile pagination - must be defined before early returns
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0 && currentPage < totalPages - 1) {
        // Swipe left - next page
        setCurrentPage(p => p + 1);
      } else if (diff < 0 && currentPage > 0) {
        // Swipe right - previous page
        setCurrentPage(p => p - 1);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  }, [currentPage, totalPages]);

  const query = useQuery({
    queryKey: ['position-actions', accountId],
    queryFn: () => fetchPortfolioPredictions(accountId),
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.message === 'disabled') return false;
      return failureCount < 2;
    },
  });

  // Feature disabled
  if (query.isError && query.error.message === 'disabled') {
    return null;
  }

  // Loading state
  if (query.isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 pb-3 px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-base font-semibold">Position Actions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (query.isError) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 pb-3 px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-base font-semibold">Position Actions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-center py-6">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500 opacity-50" />
            <p className="text-sm text-zinc-500">Unable to load recommendations</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  if (!data) return null;

  // No positions
  if (data.positions.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 pb-3 px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-base font-semibold">Position Actions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-center py-6">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium text-sm">No Open Option Positions</p>
            <p className="text-xs text-zinc-500 mt-1">
              ML recommendations appear when you have open options
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort positions: action required first, then by risk level
  const sortedPositions = [...data.positions].sort((a, b) => {
    const actionOrder = { close: 0, roll: 1, hedge: 2, hold: 3 };
    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const actionDiff = actionOrder[a.exitRecommendation.action] - actionOrder[b.exitRecommendation.action];
    if (actionDiff !== 0) return actionDiff;
    return riskOrder[a.risk.currentRiskLevel] - riskOrder[b.risk.currentRiskLevel];
  });

  // Pagination
  const calculatedTotalPages = Math.ceil(sortedPositions.length / ITEMS_PER_PAGE);
  // Update totalPages state for swipe handlers
  if (calculatedTotalPages !== totalPages) {
    setTotalPages(calculatedTotalPages);
  }
  const startIdx = currentPage * ITEMS_PER_PAGE;
  const paginatedPositions = sortedPositions.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 pb-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Position Actions</CardTitle>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                {data.summary.totalPositions} position{data.summary.totalPositions !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {data.summary.actionRequired > 0 && (
              <Badge variant="destructive" className="gap-0.5 text-xs px-1.5 py-0.5">
                <AlertTriangle className="h-3 w-3" />
                {data.summary.actionRequired}
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => query.refetch()}>
              <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {/* Compact Summary Stats */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <MiniStat label="Risk" value={data.summary.highRiskCount} color="red" />
          <MiniStat label="Action" value={data.summary.actionRequired} color="amber" />
          <MiniStat label="Conf" value={`${(data.summary.averageConfidence * 100).toFixed(0)}%`} color="blue" />
          <MiniStat label="P.Risk" value={`${(data.summary.portfolioRiskScore * 100).toFixed(0)}%`} color="slate" />
        </div>

        {/* Position List - Swipeable on mobile */}
        <div
          className="space-y-2 touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {paginatedPositions.map((position) => (
            <CompactPositionCard key={position.positionId} position={position} />
          ))}
        </div>

        {/* Pagination with swipe hint on mobile */}
        {totalPages > 1 && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
            {/* Swipe hint for mobile */}
            <p className="text-[10px] text-center text-zinc-400 mb-2 sm:hidden">
              Swipe left/right to navigate
            </p>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                Prev
              </Button>
              <span className="text-xs text-zinc-500">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compact Position Card
// ============================================================================

function CompactPositionCard({ position }: { position: PositionPrediction }) {
  const actionStyles = {
    hold: 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50',
    close: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
    roll: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
    hedge: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
  };

  const actionIcons = {
    hold: CheckCircle2,
    close: X,
    roll: ArrowRightLeft,
    hedge: Shield,
  };

  const actionColors = {
    hold: 'text-zinc-600 dark:text-zinc-400',
    close: 'text-red-600 dark:text-red-400',
    roll: 'text-amber-600 dark:text-amber-400',
    hedge: 'text-blue-600 dark:text-blue-400',
  };

  const riskBadgeColors = {
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    critical: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  };

  const ActionIcon = actionIcons[position.exitRecommendation.action];
  const actionLabel = {
    hold: 'Hold',
    close: 'Close',
    roll: 'Roll',
    hedge: 'Hedge',
  }[position.exitRecommendation.action];

  // Generate contextual action explanation
  const getActionExplanation = () => {
    const action = position.exitRecommendation.action;
    const dte = position.risk.daysToExpiry;
    const riskLevel = position.risk.currentRiskLevel;

    switch (action) {
      case 'close':
        if (dte !== undefined && dte <= 1) {
          return 'Expiring soon - close to avoid assignment risk';
        }
        if (dte !== undefined && dte <= 3) {
          return 'Near expiration - consider closing to lock in gains';
        }
        return 'Risk-adjusted analysis suggests closing position';
      case 'roll':
        if (dte !== undefined && dte <= 7) {
          return 'Good roll opportunity - extend for more premium';
        }
        return 'Rolling may improve overall position return';
      case 'hedge':
        if (riskLevel === 'high' || riskLevel === 'critical') {
          return 'High portfolio concentration - hedge to protect gains';
        }
        return 'Consider protective position to reduce portfolio risk';
      default:
        return null;
    }
  };

  const actionExplanation = getActionExplanation();

  return (
    <div className={cn('p-2.5 rounded-lg border', actionStyles[position.exitRecommendation.action])}>
      {/* Main Row */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: Icon + Symbol + Action */}
        <div className="flex items-center gap-2 min-w-0">
          <ActionIcon className={cn('h-4 w-4 shrink-0', actionColors[position.exitRecommendation.action])} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm">{position.symbol}</span>
              <Badge className={cn('text-[10px] px-1 py-0 h-4', riskBadgeColors[position.risk.currentRiskLevel])}>
                {position.risk.currentRiskLevel}
              </Badge>
            </div>
            <p className={cn('text-xs font-medium', actionColors[position.exitRecommendation.action])}>
              {actionLabel}
            </p>
          </div>
        </div>

        {/* Right: Metrics */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          <div className="text-right">
            <div className="flex items-center gap-0.5">
              <Brain className="h-3 w-3 opacity-50" />
              <span className="font-medium">{(position.exitRecommendation.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          {position.risk.daysToExpiry !== undefined && (
            <div className="text-right">
              <div className="flex items-center gap-0.5">
                <Clock className="h-3 w-3 opacity-50" />
                <span className={cn(
                  'font-medium',
                  position.risk.daysToExpiry <= 3 && 'text-red-600 dark:text-red-400'
                )}>
                  {position.risk.daysToExpiry}d
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Explanation Row - Always show for non-hold actions */}
      {position.exitRecommendation.action !== 'hold' && actionExplanation && (
        <div className="mt-1.5 pt-1.5 border-t border-current/10">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
            <span className="line-clamp-2">{actionExplanation}</span>
          </p>
        </div>
      )}

      {/* Exit Strategy (compact) */}
      {position.exitStrategy && position.exitRecommendation.action !== 'hold' && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px]">
          {position.exitStrategy.targetProfitPercent !== undefined && position.exitStrategy.targetProfitPercent > 0 && (
            <span>
              <span className="opacity-60">Target:</span>{' '}
              <span className="font-medium text-green-600 dark:text-green-400">
                +{position.exitStrategy.targetProfitPercent.toFixed(0)}%
              </span>
            </span>
          )}
          {position.exitStrategy.rollProbability > 0.3 && (
            <span>
              <span className="opacity-60">Roll:</span>{' '}
              <span className="font-medium">
                {(position.exitStrategy.rollProbability * 100).toFixed(0)}%
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: 'red' | 'amber' | 'blue' | 'slate';
}) {
  const colorClasses = {
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    slate: 'text-zinc-600 dark:text-zinc-400',
  };

  return (
    <div className="text-center p-1.5 rounded bg-zinc-50 dark:bg-zinc-800/50">
      <p className={cn('font-semibold text-sm', colorClasses[color])}>{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

export default PositionActions;
