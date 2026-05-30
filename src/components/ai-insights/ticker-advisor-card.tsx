'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { Loader2, Search, Sparkles } from 'lucide-react';

const SymbolChart = dynamic(() => import('@/components/charts/symbol-chart'), {
  ssr: false,
  loading: () => <div className="h-37.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />,
});
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchTickerSuggestion } from './lib/api';
import type { TickerSuggestion } from './lib/types';
import { cn } from '@/lib/utils';
import { MetricTooltip } from './metric-tooltip';

interface TickerAdvisorCardProps {
  accountId?: string | null;
}

function actionLabel(action: TickerSuggestion['simple']['action']): string {
  switch (action) {
    case 'buy':
      return 'Buy';
    case 'avoid':
      return 'Avoid';
    case 'watch':
      return 'Watch';
    case 'reduce':
      return 'Reduce';
    case 'sell':
      return 'Sell';
    case 'hold':
      return 'Hold';
    case 'add':
      return 'Add';
    default:
      return action;
  }
}

function actionClass(action: TickerSuggestion['simple']['action']): string {
  if (action === 'buy' || action === 'add') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
  if (action === 'sell' || action === 'reduce') return 'bg-red-500/10 text-red-500 border-red-500/30';
  if (action === 'avoid') return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
  return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30';
}

export function TickerAdvisorCard({ accountId }: TickerAdvisorCardProps) {
  const [symbol, setSymbol] = useState('TSLA');
  const [result, setResult] = useState<TickerSuggestion | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) => fetchTickerSuggestion(value, accountId),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const freshnessLabel = useMemo(() => {
    if (!result) return null;
    if (!result.dataFreshness.quoteAsOf && !result.dataFreshness.barsAsOf) return 'Data freshness unavailable';
    const newest = [result.dataFreshness.quoteAsOf, result.dataFreshness.barsAsOf]
      .filter(Boolean)
      .sort()
      .pop();
    if (!newest) return 'Data freshness unavailable';
    return `Data as of ${new Date(newest).toLocaleString()}`;
  }, [result]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <CardTitle className="text-sm">Ticker Advisor</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Enter any ticker and get a simple action suggestion. Open Advanced for full quant rationale.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="Enter ticker (e.g. AAPL)"
            className="uppercase"
          />
          <Button
            onClick={() => mutation.mutate(symbol)}
            disabled={!symbol.trim() || mutation.isPending}
            className="w-full sm:w-auto"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            Analyze
          </Button>
        </div>

        {mutation.error && (
          <p className="text-xs text-red-500">
            {(mutation.error as Error).message}
          </p>
        )}

        {result && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{result.symbol}</p>
              <Badge className={cn('border', actionClass(result.simple.action))}>
                {actionLabel(result.simple.action)}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {result.simple.confidenceBand} confidence
              </Badge>
            </div>

            <Tabs defaultValue="simple" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
                <TabsTrigger value="simple" className="text-xs sm:text-sm">Simple</TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs sm:text-sm">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="space-y-2">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{result.simple.summary}</p>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  Confidence score {result.simple.confidenceScore}%
                  <MetricTooltip metric="confidence" />
                </div>
                <ul className="list-disc pl-4 text-xs text-zinc-500 space-y-1">
                  {result.simple.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {result.simple.optionsPlaybook && (
                  <div className="rounded-md border border-violet-200 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-950/20 p-2">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                      Options playbook
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
                      {result.simple.optionsPlaybook.action}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {result.simple.optionsPlaybook.details}
                    </p>
                  </div>
                )}
                {result.simple.riskFlags.length > 0 && (
                  <p className="text-xs text-red-500">
                    Risk flags: {result.simple.riskFlags.join(', ')}
                  </p>
                )}
                <p className="text-xs text-zinc-500">{result.simple.nextCheck}</p>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-zinc-500">Signal side</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 uppercase">{result.advanced.signal.side}</p>
                  </div>
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-zinc-500 flex items-center gap-1">Expected value <MetricTooltip metric="expected_value" /></p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{result.advanced.signal.expectedReturnPct.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-zinc-500">Signal strength</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{(result.advanced.signal.strength * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  Market context: ${(result.advanced.marketContext.currentPrice).toFixed(2)} | 5d return {(result.advanced.marketContext.return5d * 100).toFixed(2)}%
                  {' '}| 20d momentum {(result.advanced.marketContext.momentum20d * 100).toFixed(2)}%
                </p>
                <p className="text-xs text-zinc-500">
                  Strategy: {result.advanced.strategyKey} | Data source: {result.dataFreshness.source}{result.dataFreshness.isDelayed ? ' (delayed)' : ''}
                </p>
                <p className="text-xs text-zinc-500">
                  Option context: {result.advanced.optionContext.optionPositionCount} open option position
                  {result.advanced.optionContext.optionPositionCount === 1 ? '' : 's'}
                  {result.advanced.optionContext.nearestDte !== null ? ` | nearest DTE ${result.advanced.optionContext.nearestDte}d` : ''}
                  {result.advanced.optionContext.nearExpiryCount > 0 ? ` | ${result.advanced.optionContext.nearExpiryCount} near expiry` : ''}
                </p>
              </TabsContent>
            </Tabs>

            <SymbolChart
              symbol={result.symbol}
              defaultTimeRange="3M"
              showTimeControls={false}
              showVolume={false}
              height={150}
            />

            {freshnessLabel && (
              <p className={cn('text-[11px]', result.dataFreshness.stale ? 'text-amber-500' : 'text-zinc-500')}>
                {freshnessLabel}{result.dataFreshness.stale ? ' (stale fallback)' : ''}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
