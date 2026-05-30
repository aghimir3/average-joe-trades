'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Community Tab
 *
 * Wraps the existing CommunityInsights component for the AI Insights page.
 */

import { CommunityInsights } from '@/components/wheel/community-insights';
import { useQuery } from '@tanstack/react-query';

interface RegimeInsight {
  regimeKey: string;
  ivRegime: 'high_iv' | 'low_iv';
  trendRegime: 'trending' | 'mean_reverting';
  sampleSize: number;
  uniqueTraders: number;
  winRate: number;
  avgReturnPct: number;
  confidence: number;
}

interface CommunityRegimesPayload {
  insights?: RegimeInsight[];
}

export function CommunityTab() {
  const { data } = useQuery<CommunityRegimesPayload | null>({
    queryKey: ['community-regime-insights'],
    queryFn: async () => {
      const response = await fetch('/api/quant/community/regimes');
      if (!response.ok) return null;
      return apiData<CommunityRegimesPayload>(await parseApiJson(response));
    },
    staleTime: 5 * 60 * 1000,
  });

  const insights = data?.insights ?? [];

  return (
    <div className="space-y-4">
      <CommunityInsights />
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Community Regime Insights
        </h3>
        <div className="mb-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">How to read this</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            High IV means options are expensive relative to normal. Low IV means calmer pricing. Trending and mean-reverting
            buckets are based on recent price behavior proxies.
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Data source: anonymized, freshness-weighted closed trade outcomes across users, filtered to only show meaningful
            sample sizes.
          </p>
        </div>
        {insights.length === 0 ? (
          <p className="text-xs text-zinc-500">No statistically meaningful regime buckets yet.</p>
        ) : (
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight.regimeKey} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {insight.ivRegime.replace('_', ' ')} | {insight.trendRegime.replace('_', ' ')}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Win rate {(insight.winRate * 100).toFixed(1)}% | Avg return {insight.avgReturnPct.toFixed(2)}% | n={insight.sampleSize}
                  {' '}| traders={insight.uniqueTraders}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
