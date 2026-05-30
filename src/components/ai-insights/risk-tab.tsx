'use client';

import { parseApiJson, apiMessage } from '@/lib/api/client';


import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Shield, TrendingDown } from 'lucide-react';
import { MetricTooltip } from './metric-tooltip';

interface RiskTabProps {
  accountId?: string | null;
}

interface RiskResponse {
  asOf: string;
  positionCount: number;
  report: {
    exposures: {
      grossExposurePct: number;
      netExposurePct: number;
      leverageProxy: number;
      largestSymbol: { symbol: string; exposurePct: number } | null;
      largestSector: { sector: string; exposurePct: number } | null;
    };
    drawdown: {
      currentDrawdownPct: number;
      maxDrawdownPct: number;
    };
    valueAtRisk: {
      var95Pct: number;
      cvar95Pct: number;
    };
    stressScenarios: Array<{
      scenario: string;
      shockPct: number;
      estimatedPnl: number;
      estimatedEquity: number;
    }>;
    flags: Array<{
      code: string;
      severity: 'info' | 'warning' | 'critical';
      message: string;
      observedValue: number;
      threshold: number;
    }>;
  };
}

async function fetchRiskDashboard(accountId?: string | null): Promise<RiskResponse> {
  const search = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const response = await fetch(`/api/quant/risk${search}`);
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to fetch risk dashboard'));
  }
  const json = await parseApiJson(response);
  return json.data as RiskResponse;
}

function severityClass(severity: 'info' | 'warning' | 'critical'): string {
  if (severity === 'critical') return 'text-red-500';
  if (severity === 'warning') return 'text-amber-500';
  return 'text-zinc-500';
}

export function RiskTab({ accountId }: RiskTabProps) {
  const query = useQuery({
    queryKey: ['quant-risk-dashboard', accountId],
    queryFn: () => fetchRiskDashboard(accountId),
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-white dark:bg-zinc-900 p-4 text-red-500 text-sm">
        Failed to load risk dashboard.
      </div>
    );
  }

  const data = query.data;
  const report = data.report;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Portfolio Risk Dashboard</h3>
        </div>
        <div className="mb-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">How to read this</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Gross exposure is total position size. Net exposure is long minus short tilt. CVaR 95 estimates average loss in the
            worst 5% outcomes.
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Data source: your open positions from ledger-derived holdings and account snapshots, marked to current market prices.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
              Gross Exposure <MetricTooltip metric="gross_exposure" />
            </p>
            <p className="text-sm font-semibold">{report.exposures.grossExposurePct.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
              Net Exposure <MetricTooltip metric="net_exposure" />
            </p>
            <p className="text-sm font-semibold">{report.exposures.netExposurePct.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
              Current Drawdown <MetricTooltip metric="max_drawdown" />
            </p>
            <p className="text-sm font-semibold text-red-500">{report.drawdown.currentDrawdownPct.toFixed(2)}%</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="text-[10px] uppercase text-zinc-500 flex items-center gap-1">
              CVaR 95 <MetricTooltip metric="cvar95" />
            </p>
            <p className="text-sm font-semibold">{report.valueAtRisk.cvar95Pct.toFixed(2)}%</p>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          Largest symbol: {report.exposures.largestSymbol?.symbol ?? 'N/A'}{' '}
          ({report.exposures.largestSymbol?.exposurePct.toFixed(1) ?? '0.0'}%)
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Risk Flags</h4>
        </div>
        {report.flags.length === 0 ? (
          <p className="text-sm text-emerald-500">No active risk breaches.</p>
        ) : (
          <div className="space-y-2">
            {report.flags.map((flag) => (
              <div key={flag.code} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                <p className={`text-xs font-semibold ${severityClass(flag.severity)}`}>
                  {flag.code}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{flag.message}</p>
                <p className="text-[11px] text-zinc-500">
                  Observed {flag.observedValue.toFixed(2)} vs threshold {flag.threshold.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Stress Scenarios</h4>
        </div>
        <div className="space-y-2">
          {report.stressScenarios.map((scenario) => (
            <div key={scenario.scenario} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{scenario.scenario}</p>
              <p className="text-xs text-zinc-500">
                Estimated P&L: {scenario.estimatedPnl.toFixed(2)} | Equity: {scenario.estimatedEquity.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
