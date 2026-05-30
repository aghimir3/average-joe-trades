/**
 * Dashboard Tab Prefetch Hook
 *
 * Fires background prefetch queries for ALL dashboard tabs after the initial
 * tab loads, so switching tabs feels instant. Uses queryClient.prefetchQuery
 * which silently populates the TanStack Query cache without affecting component state.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseApiJson, apiData } from '@/lib/api/client';
import { buildUrl, DASHBOARD_STALE_TIME } from './lib';

// ============================================================================
// Generic fetcher — matches the pattern used by individual tab components
// ============================================================================

async function prefetchFromApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Prefetch failed: ${url}`);
  const result = await parseApiJson(response);
  return apiData<T>(result);
}

function urlWithParams(base: string, params: Record<string, string | undefined | null>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }
  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base;
}

// ============================================================================
// Hook
// ============================================================================

export function useDashboardPrefetch(
  isReady: boolean,
  accountId: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isReady) return;

    const acctParam = accountId ? { brokerageAccountId: accountId } : {};
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // ── Charts & Calendar tab ─────────────────────────────────────────
    queryClient.prefetchQuery({
      queryKey: ['dashboardCalendar', year, month, accountId],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/calendar', {
          year: String(year),
          month: String(month),
          ...acctParam,
        }),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['timeAnalytics', accountId],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/time-analytics', accountId)),
      staleTime: DASHBOARD_STALE_TIME,
    });

    // ── Positions & Trades tab ────────────────────────────────────────
    queryClient.prefetchQuery({
      queryKey: ['dashboardTrades', 'all', 'all', '', 10, accountId],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/trades', {
          limit: '10',
          status: 'all',
          type: 'all',
          ...acctParam,
        }),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['realtimePortfolio', accountId],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/realtime', accountId)),
      staleTime: 60000,
    });

    // ── Performance tab ───────────────────────────────────────────────
    queryClient.prefetchQuery({
      queryKey: ['tickerPerformance', accountId, 'all'],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/performance', accountId)),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['tradeMetrics', accountId, undefined, undefined],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/trade-metrics', acctParam),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['cashFlow', accountId],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/cash-flow', accountId)),
      staleTime: DASHBOARD_STALE_TIME,
    });

    // ── Options Deep Dive tab ─────────────────────────────────────────
    queryClient.prefetchQuery({
      queryKey: ['options-analytics', accountId, 'all'],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/options-analytics', acctParam),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['options-seasonality', accountId, 'all'],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/options-timing', acctParam),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['options-expiry-cycles', accountId, 'all'],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/options-timing', acctParam),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['options-rolls', accountId],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/dashboard/options-timing', acctParam),
      ),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['ml-options-status'],
      queryFn: () => prefetchFromApi('/api/ml/options/status'),
      staleTime: 5 * 60 * 1000,
    });

    queryClient.prefetchQuery({
      queryKey: ['position-actions', accountId],
      queryFn: () => prefetchFromApi(
        urlWithParams('/api/ml/options/ensemble', { type: 'portfolio', ...(accountId ? { accountId } : {}) }),
      ),
      staleTime: 2 * 60 * 1000,
    });

    // ── Goals & Streaks tab ───────────────────────────────────────────
    queryClient.prefetchQuery({
      queryKey: ['dashboardStreaks', accountId],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/streaks', accountId)),
      staleTime: DASHBOARD_STALE_TIME,
    });

    queryClient.prefetchQuery({
      queryKey: ['dashboardGoals', accountId],
      queryFn: () => prefetchFromApi(buildUrl('/api/dashboard/goals', accountId)),
      staleTime: DASHBOARD_STALE_TIME,
    });
  }, [isReady, accountId, queryClient]);
}
