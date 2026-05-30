'use client';

/**
 * Single Stock Optimizer
 *
 * AI-powered trade recommendations for single-stock wheel traders.
 * Fetches CSP and Covered Call optimization in parallel and displays
 * the recommended next trades with alternatives and reasoning.
 */

import { useQuery } from '@tanstack/react-query';
import { Zap, Brain, ArrowDown, ArrowUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';
import { parseApiJson, apiData } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

interface SingleStockOptimizerProps {
  symbol: string;
  accountId?: string | null;
}

interface StrikeRecommendation {
  recommendedStrike: number;
  recommendedDte: number;
  expectedPremium: number;
  expectedReturn: number;
  probabilityOfProfit: number;
  probabilityOfAssignment: number;
  alternatives: Array<{
    strike: number;
    dte: number;
    premium: number;
    pop: number;
    tradeoff: string;
  }>;
  reasoning: string[];
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchOptimization(
  symbol: string,
  direction: 'csp' | 'covered_call',
  accountId?: string | null
): Promise<StrikeRecommendation> {
  const params = new URLSearchParams({ symbol, direction });
  if (accountId) params.set('brokerageAccountId', accountId);

  const response = await fetch(`/api/ml/wheel/optimize?${params}`);
  const payload = await parseApiJson(response);

  if (!response.ok) {
    throw new Error(
      (payload.message as string) ?? 'Failed to load optimization'
    );
  }

  return apiData<StrikeRecommendation>(payload);
}

// ============================================================================
// Sub-components
// ============================================================================

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="flex gap-3">
          <div className="h-12 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-12 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-12 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
        <div className="h-3 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </CardContent>
    </Card>
  );
}

interface RecommendationCardProps {
  direction: 'csp' | 'covered_call';
  rec: StrikeRecommendation;
}

function RecommendationCard({ direction, rec }: RecommendationCardProps) {
  const isCsp = direction === 'csp';
  const label = isCsp ? 'Sell CSP' : 'Sell CC';
  const Icon = isCsp ? ArrowDown : ArrowUp;

  return (
    <Card>
      <CardHeader className="pb-2">
        <Badge
          variant="secondary"
          className={cn(
            'w-fit gap-1 text-xs',
            isCsp
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
              : 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200'
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3 pb-6">
        {/* Main recommendation */}
        <p className="text-lg font-bold tabular-nums">
          ${rec.recommendedStrike} strike, {rec.recommendedDte} DTE
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Premium</p>
            <p className="text-sm font-semibold">{formatCurrency(rec.expectedPremium)}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">POP</p>
            <p className="text-sm font-semibold">{Math.round(rec.probabilityOfProfit)}%</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Assignment</p>
            <p className="text-sm font-semibold">{Math.round(rec.probabilityOfAssignment)}%</p>
          </div>
        </div>

        {/* Reasoning */}
        {rec.reasoning.length > 0 && (
          <ul className="space-y-0.5">
            {rec.reasoning.slice(0, 2).map((reason, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
              >
                {reason}
              </li>
            ))}
          </ul>
        )}

        {/* Alternatives */}
        {rec.alternatives.length > 0 && (
          <div className="space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Alternatives
            </p>
            {rec.alternatives.slice(0, 3).map((alt, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400"
              >
                <span className="tabular-nums">
                  ${alt.strike} / {alt.dte}d / {formatCurrency(alt.premium)}
                </span>
                <span className="ml-2 text-[10px] italic">{alt.tradeoff}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SingleStockOptimizer({ symbol, accountId }: SingleStockOptimizerProps) {
  const cspQuery = useQuery({
    queryKey: ['wheel-optimize', symbol, 'csp', accountId],
    queryFn: () => fetchOptimization(symbol, 'csp', accountId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const ccQuery = useQuery({
    queryKey: ['wheel-optimize', symbol, 'covered_call', accountId],
    queryFn: () => fetchOptimization(symbol, 'covered_call', accountId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoading = cspQuery.isLoading || ccQuery.isLoading;
  const bothFailed = cspQuery.isError && ccQuery.isError;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-violet-500" />
        <h3 className="text-base font-semibold">Next Trade for {symbol}</h3>
      </div>

      {/* Error state */}
      {bothFailed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Brain className="mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Train your models to unlock AI optimization
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Visit the Train tab to build your personalized models
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && !bothFailed && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Results */}
      {!isLoading && !bothFailed && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cspQuery.data ? (
            <RecommendationCard direction="csp" rec={cspQuery.data} />
          ) : cspQuery.isError ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-zinc-400">
                CSP data unavailable
              </CardContent>
            </Card>
          ) : null}

          {ccQuery.data ? (
            <RecommendationCard direction="covered_call" rec={ccQuery.data} />
          ) : ccQuery.isError ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-zinc-400">
                Covered call data unavailable
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
