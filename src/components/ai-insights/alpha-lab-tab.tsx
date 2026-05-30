'use client';

import { parseApiJson, apiMessage } from '@/lib/api/client';


import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { FlaskConical, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, chartTooltipStyle } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricTooltip } from './metric-tooltip';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface AlphaLabRunResponse {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  symbol: string | null;
  strategyKey: string;
  metrics: {
    personal?: {
      totalReturnPct: number;
      cagrPct: number;
      sharpe: number;
      sortino: number;
      maxDrawdownPct: number;
      hitRatePct: number;
      exposurePct: number;
      turnoverPct: number;
      tradeCount: number;
    };
    walkForward?: {
      avgCagrPct: number;
      avgSharpe: number;
      avgSortino: number;
      avgMaxDrawdownPct: number;
      avgHitRatePct: number;
      totalTrades: number;
    };
    drift?: {
      driftScore: number;
      status: 'stable' | 'watch' | 'drift';
    };
  } | null;
  equityCurve: Array<{ timestamp: string; equity: number }> | null;
  error: string | null;
}

interface AlphaLabTabProps {
  accountId?: string | null;
}

function toDateInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function createRun(payload: { symbol: string; startDate: string; endDate: string }) {
  const response = await fetch('/api/quant/alpha-lab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: payload.symbol,
      startDate: new Date(`${payload.startDate}T00:00:00.000Z`).toISOString(),
      endDate: new Date(`${payload.endDate}T23:59:59.999Z`).toISOString(),
    }),
  });
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to queue alpha lab run'));
  }
  const json = await parseApiJson(response);
  return json.data as { runId: string; status: string };
}

async function fetchRun(runId: string): Promise<AlphaLabRunResponse> {
  const response = await fetch(`/api/quant/alpha-lab?runId=${encodeURIComponent(runId)}`);
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to load alpha lab run'));
  }
  const json = await parseApiJson(response);
  return json.data as AlphaLabRunResponse;
}

export function AlphaLabTab(props: AlphaLabTabProps) {
  const accountId = props.accountId ?? null;
  const [symbol, setSymbol] = useState('SPY');
  const [runId, setRunId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return toDateInput(d);
  });
  const [endDate, setEndDate] = useState(() => toDateInput(new Date()));

  const createMutation = useMutation({
    mutationFn: createRun,
    onSuccess: (data) => {
      setRunId(data.runId);
    },
  });

  const runQuery = useQuery({
    queryKey: ['alpha-lab-run', runId, accountId],
    queryFn: () => fetchRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === 'pending' || status === 'running') return 2000;
      return false;
    },
  });

  const runData = runQuery.data;
  const equityCurve = runData?.equityCurve ?? [];
  const labels = equityCurve.map((point) =>
    new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  );
  const values = equityCurve.map((point) => point.equity);
  const latestMetrics = runData?.metrics?.personal ?? null;
  const walkForwardMetrics = runData?.metrics?.walkForward ?? null;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Equity',
        data: values,
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8 },
        grid: { display: false },
      },
      y: {
        ticks: {
          callback: (value) => `$${Number(value).toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="h-4 w-4 text-teal-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Alpha Lab</h3>
        </div>

        <div className="mb-3 rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/70 dark:bg-teal-950/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">How to read this</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Walk-forward means we repeatedly train on an earlier time window, then test only on the next unseen window.
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Data source: historical OHLCV bars for the selected symbol plus strategy rules in this app. Signals at time T are
            filled at T+1 open, with costs and slippage applied.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="Ticker"
            className="uppercase"
          />
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <Button
            onClick={() => createMutation.mutate({ symbol, startDate, endDate })}
            disabled={createMutation.isPending || runQuery.isFetching}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {(createMutation.isPending || runQuery.isFetching) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Run Walk-Forward
          </Button>
        </div>

        <p className="text-xs text-zinc-500 mt-2">
          Event-driven backtest with realistic execution assumptions and strict no-lookahead testing windows.
        </p>
      </div>

      {runData && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {runData.symbol} | {runData.strategyKey}
              </p>
              <p className="text-xs text-zinc-500">
                Status:{' '}
                <span
                  className={cn(
                    'font-medium',
                    runData.status === 'completed'
                      ? 'text-emerald-500'
                      : runData.status === 'failed'
                        ? 'text-red-500'
                        : 'text-amber-500'
                  )}
                >
                  {runData.status}
                </span>
              </p>
            </div>
            {runData.metrics?.drift && (
              <div className="text-right">
                <p className="text-xs text-zinc-500 flex items-center justify-end gap-1">
                  Drift score <MetricTooltip metric="drift_score" />
                </p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {(runData.metrics.drift.driftScore * 100).toFixed(0)}% ({runData.metrics.drift.status})
                </p>
              </div>
            )}
          </div>

          {latestMetrics && (
            <Tabs defaultValue="simple" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
                <TabsTrigger value="simple" className="text-xs sm:text-sm">Simple</TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs sm:text-sm">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="space-y-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/70 dark:bg-zinc-900/40">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {latestMetrics.cagrPct > 8 && latestMetrics.sharpe > 0.7
                      ? 'Setup quality looks strong over this period.'
                      : latestMetrics.cagrPct > 0
                        ? 'Setup is positive but not yet strong on risk-adjusted terms.'
                        : 'Setup currently shows weak edge in this date range.'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Use this to decide whether to deploy, watch, or discard the setup before risking real capital.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      CAGR <MetricTooltip metric="cagr" />
                    </p>
                    <p className="text-sm font-semibold">{latestMetrics.cagrPct.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      Max DD <MetricTooltip metric="max_drawdown" />
                    </p>
                    <p className="text-sm font-semibold text-red-500">{latestMetrics.maxDrawdownPct.toFixed(2)}%</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      CAGR <MetricTooltip metric="cagr" />
                    </p>
                    <p className="text-sm font-semibold">{latestMetrics.cagrPct.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      Sharpe <MetricTooltip metric="sharpe" />
                    </p>
                    <p className="text-sm font-semibold">{latestMetrics.sharpe.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      Sortino <MetricTooltip metric="sortino" />
                    </p>
                    <p className="text-sm font-semibold">{latestMetrics.sortino.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      Max DD <MetricTooltip metric="max_drawdown" />
                    </p>
                    <p className="text-sm font-semibold text-red-500">{latestMetrics.maxDrawdownPct.toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                    <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
                      Hit Rate <MetricTooltip metric="hit_rate" />
                    </p>
                    <p className="text-sm font-semibold">{latestMetrics.hitRatePct.toFixed(1)}%</p>
                  </div>
                </div>
                {walkForwardMetrics && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-xs text-zinc-500 space-y-1">
                    <p className="uppercase tracking-wide text-[10px] text-zinc-400 flex items-center gap-1">
                      Walk-forward aggregate <MetricTooltip metric="walk_forward" />
                    </p>
                    <p>
                      Avg CAGR {walkForwardMetrics.avgCagrPct.toFixed(2)}% | Avg Sharpe {walkForwardMetrics.avgSharpe.toFixed(2)} | Avg Sortino {walkForwardMetrics.avgSortino.toFixed(2)}
                    </p>
                    <p>
                      Avg Max DD {walkForwardMetrics.avgMaxDrawdownPct.toFixed(2)}% | Total trades {walkForwardMetrics.totalTrades}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {equityCurve.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-teal-500" />
                <p className="text-xs uppercase tracking-wide text-zinc-500">Equity Curve</p>
              </div>
              <div className="h-56">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {runData.error && (
            <p className="text-sm text-red-500">{runData.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
