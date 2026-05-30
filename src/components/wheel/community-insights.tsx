'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Community Insights Component
 *
 * Shows aggregated ML insights based on all users' wheel trading data.
 * Helps users make better decisions based on "wisdom of the crowd".
 *
 * Features:
 * - Top community picks for wheel strategy
 * - Ticker search for specific insights
 * - Current positions analysis (stocks user owns)
 * - Optimal strategy recommendations (CSP vs CC, DTE, OTM%)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  TrendingUp,
  Search,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  Target,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Trophy,
  RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatPercent } from '@/lib/utils';
import type { CommunityInsight } from '@/lib/ml/wheel';
import { TickerSuggestionPills } from './ticker-suggestion-pills';
import { PositionSuggestions } from './position-suggestions';

// ============================================================================
// Types
// ============================================================================

interface CommunityResponse {
  insights: CommunityInsight[];
  status: {
    hasModel: boolean;
    lastTrainedAt: string | null;
    totalTickers: number;
    totalTrades: number;
    uniqueUsers: number;
  };
}

interface SingleInsightResponse {
  insight: CommunityInsight | null;
  message?: string;
  status: CommunityResponse['status'];
}

type TabId = 'top-picks' | 'search' | 'my-positions' | 'all';

// ============================================================================
// API Functions
// ============================================================================

async function fetchCommunityInsights(): Promise<CommunityResponse> {
  const response = await fetch('/api/ml/wheel/community');
  if (!response.ok) throw new Error('Failed to fetch community insights');
  return apiData(await parseApiJson(response));
}

async function fetchTickerInsight(symbol: string): Promise<SingleInsightResponse> {
  const response = await fetch(`/api/ml/wheel/community?symbol=${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error('Failed to fetch ticker insight');
  return apiData(await parseApiJson(response));
}

// ============================================================================
// Helper Components
// ============================================================================

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config = {
    strong_buy: { label: 'Strong Buy', className: 'bg-emerald-500 text-white' },
    buy: { label: 'Buy', className: 'bg-green-500 text-white' },
    neutral: { label: 'Neutral', className: 'bg-zinc-400 text-white' },
    avoid: { label: 'Avoid', className: 'bg-red-500 text-white' },
  }[recommendation] || { label: recommendation, className: 'bg-zinc-400 text-white' };

  return (
    <Badge className={cn('text-xs font-semibold', config.className)}>
      {config.label}
    </Badge>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const level = confidence > 0.7 ? 3 : confidence >= 0.4 ? 2 : 1;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-4 rounded-sm',
            i <= level ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'
          )}
        />
      ))}
    </div>
  );
}

function InsightCard({ insight, isCompact = false }: { insight: CommunityInsight; isCompact?: boolean }) {
  const strategyShort = {
    csp: 'CSP',
    covered_call: 'CC',
    both: 'Both',
  }[insight.optimalStrategy.direction];

  if (isCompact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold',
            insight.score >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
            insight.score >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
          )}>
            {insight.score.toFixed(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{insight.symbol}</span>
              <RecommendationBadge recommendation={insight.recommendation} />
            </div>
            <div className="text-xs text-zinc-400">
              {insight.uniqueTraders} traders | {(insight.winRate * 100).toFixed(0)}% win
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {strategyShort} {insight.optimalStrategy.dte}d {(insight.optimalStrategy.otmPercent * 100).toFixed(0)}%
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all hover:shadow-md',
      insight.recommendation === 'strong_buy' && 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/10',
      insight.recommendation === 'buy' && 'border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-950/10',
      insight.recommendation === 'neutral' && 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
      insight.recommendation === 'avoid' && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold',
            insight.score >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
            insight.score >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
          )}>
            {insight.score.toFixed(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100">{insight.symbol}</span>
              <RecommendationBadge recommendation={insight.recommendation} />
            </div>
            <div className="text-xs text-zinc-400">
              <Users className="h-3 w-3 inline mr-1" />
              {insight.uniqueTraders} traders | {insight.totalTrades} trades
            </div>
          </div>
        </div>
      </div>

      {/* Inline Metrics */}
      <div className="flex items-center gap-6 mb-3 text-sm">
        <div className="flex items-center gap-1.5">
          <span className={cn('font-semibold', insight.winRate >= 0.6 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400')}>
            {(insight.winRate * 100).toFixed(0)}%
          </span>
          <span className="text-zinc-400 text-xs uppercase">Win Rate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('font-semibold', insight.avgAnnualizedReturn >= 0.15 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400')}>
            {formatPercent(insight.avgAnnualizedReturn * 100)}
          </span>
          <span className="text-zinc-400 text-xs uppercase">Annual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ConfidenceMeter confidence={insight.confidence} />
          <span className="text-zinc-400 text-xs uppercase">Confidence</span>
        </div>
      </div>

      {/* Strategy pill */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-500" />
          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Optimal Strategy:</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="text-xs border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400">
            {strategyShort}
          </Badge>
          <span className="text-zinc-500">{insight.optimalStrategy.dte}d DTE | {(insight.optimalStrategy.otmPercent * 100).toFixed(0)}% OTM</span>
        </div>
      </div>

      {/* Insights */}
      {insight.insights.length > 0 && (
        <div className="mt-3 space-y-1">
          {insight.insights.slice(0, 2).map((text, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-zinc-400" />
              <span className="line-clamp-1">{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCardSkeleton() {
  return (
    <div className="rounded-xl border p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div>
          <Skeleton className="h-5 w-24 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
      <Skeleton className="h-10 rounded-lg" />
    </div>
  );
}

// ============================================================================
// Tab Components
// ============================================================================

function TopPicksTab({ insights }: { insights: CommunityInsight[] }) {
  const strongBuys = insights.filter(i => i.recommendation === 'strong_buy');
  const buys = insights.filter(i => i.recommendation === 'buy');

  if (strongBuys.length === 0 && buys.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
        <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          No Top Picks Yet
        </h3>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Community insights will appear here once enough trading data is collected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {strongBuys.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Strong Buys ({strongBuys.length})
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {strongBuys.map((insight) => (
              <InsightCard key={insight.symbol} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {buys.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20">
              <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Worth Considering ({buys.length})
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {buys.map((insight) => (
              <InsightCard key={insight.symbol} insight={insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchTab({
  searchTicker,
  setSearchTicker,
  searchedTicker,
  setSearchedTicker,
  tickerData,
  tickerLoading,
  tickerError,
}: {
  searchTicker: string;
  setSearchTicker: (v: string) => void;
  searchedTicker: string | null;
  setSearchedTicker: (v: string | null) => void;
  tickerData: SingleInsightResponse | undefined;
  tickerLoading: boolean;
  tickerError: Error | null;
}) {
  const handleSearch = () => {
    if (searchTicker.trim()) {
      setSearchedTicker(searchTicker.trim().toUpperCase());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Enter ticker symbol (e.g., AAPL)"
          value={searchTicker}
          onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-xs"
        />
        <Button onClick={handleSearch} disabled={!searchTicker.trim()}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </div>

      <TickerSuggestionPills
        onTickerSelect={(symbol) => {
          setSearchTicker(symbol);
          setSearchedTicker(symbol);
        }}
        selectedTicker={searchedTicker}
        maxPills={8}
        showCostBasis={true}
        emptyMessage="Connect a brokerage to see your positions"
      />

      {searchedTicker && (
        <div className="mt-4">
          {tickerLoading ? (
            <InsightCardSkeleton />
          ) : tickerError ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Failed to fetch insight for {searchedTicker}
            </div>
          ) : tickerData?.insight ? (
            <InsightCard insight={tickerData.insight} />
          ) : (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-zinc-600 dark:text-zinc-400 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {tickerData?.message || `No community data available for ${searchedTicker}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AllTickersTab({ insights }: { insights: CommunityInsight[] }) {
  const neutrals = insights.filter(i => i.recommendation === 'neutral');
  const avoids = insights.filter(i => i.recommendation === 'avoid');

  return (
    <div className="space-y-6">
      {neutrals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/20">
              <MinusCircle className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Neutral ({neutrals.length})
            </span>
          </div>
          <div className="space-y-2">
            {neutrals.map((insight) => (
              <InsightCard key={insight.symbol} insight={insight} isCompact />
            ))}
          </div>
        </div>
      )}

      {avoids.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
              <ArrowDownRight className="h-4 w-4 text-red-500 dark:text-red-400" />
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Tickers to Avoid ({avoids.length})
            </span>
          </div>
          <div className="space-y-2">
            {avoids.map((insight) => (
              <InsightCard key={insight.symbol} insight={insight} isCompact />
            ))}
          </div>
        </div>
      )}

      {neutrals.length === 0 && avoids.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-500">No additional tickers to display.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CommunityInsights() {
  const [activeTab, setActiveTab] = useState<TabId>('my-positions');
  const [searchTicker, setSearchTicker] = useState('');
  const [searchedTicker, setSearchedTicker] = useState<string | null>(null);

  // Fetch all community insights
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['communityInsights'],
    queryFn: fetchCommunityInsights,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch specific ticker insight when searched
  const {
    data: tickerData,
    isLoading: tickerLoading,
    error: tickerError,
  } = useQuery({
    queryKey: ['communityInsight', searchedTicker],
    queryFn: () => fetchTickerInsight(searchedTicker!),
    enabled: !!searchedTicker,
    staleTime: 5 * 60 * 1000,
  });

  const tabs = [
    { id: 'my-positions' as TabId, label: 'My Positions', icon: Briefcase },
    { id: 'search' as TabId, label: 'Search', icon: Search },
    { id: 'top-picks' as TabId, label: 'Top Picks', icon: Trophy },
    { id: 'all' as TabId, label: 'All Tickers', icon: Users },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Community Insights</h2>
            <p className="text-xs text-zinc-400">
              {data?.status ? (
                <>Learn from {data.status.uniqueUsers} traders and {data.status.totalTrades?.toLocaleString()} wheel trades</>
              ) : (
                'Loading...'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.status.lastTrainedAt && (
            <span className="text-xs text-zinc-400 hidden sm:inline">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(data.status.lastTrainedAt).toLocaleDateString()}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-2',
                activeTab === tab.id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <InsightCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto text-red-300 dark:text-red-600 mb-3" />
            <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Failed to Load
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              Could not load community insights. Please try again.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : data?.insights.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
            <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Not Enough Data
            </h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Community insights require more trading data. Keep trading to contribute!
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'top-picks' && <TopPicksTab insights={data?.insights || []} />}
            {activeTab === 'search' && (
              <SearchTab
                searchTicker={searchTicker}
                setSearchTicker={setSearchTicker}
                searchedTicker={searchedTicker}
                setSearchedTicker={setSearchedTicker}
                tickerData={tickerData}
                tickerLoading={tickerLoading}
                tickerError={tickerError}
              />
            )}
            {activeTab === 'my-positions' && <PositionSuggestions />}
            {activeTab === 'all' && <AllTickersTab insights={data?.insights || []} />}
          </>
        )}
      </div>
    </div>
  );
}
