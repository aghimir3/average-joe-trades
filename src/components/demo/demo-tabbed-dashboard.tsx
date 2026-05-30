'use client';

/**
 * Demo Tabbed Dashboard
 *
 * Experimental dashboard layout that uses tabs instead of collapsible sections.
 * This reduces visual clutter by showing only one section at a time while
 * keeping stats cards as a persistent overview.
 *
 * Demo-only: all data comes from DemoQueryProvider cache (instant, no API calls).
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import dynamic from 'next/dynamic';
import {
  LineChart,
  BarChart3,
  Briefcase,
  Target,
  Trophy,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'motion/react';

// UI
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccountSelector } from '@/components/accounts/account-selector';
import { StatsCards } from '@/components/dashboard/layout';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeletons';
import { useDemoTour } from './use-demo-tour';

// API & types
import {
  fetchDashboardStats,
  fetchPerformanceData,
  fetchScatterData,
  fetchPositionsData,
  formatDate,
  DASHBOARD_QUERY_KEYS,
  DASHBOARD_STALE_TIME,
} from '@/components/dashboard/lib';

// Static component imports (frequently used, small bundles)
import { PnLChart } from '@/components/dashboard/pnl-chart';
import { PnLCalendar } from '@/components/dashboard/pnl-calendar';
import { TickerPerformance } from '@/components/dashboard/ticker-performance';
import { MonthlyBreakdown } from '@/components/dashboard/monthly-breakdown';
import { PortfolioSummaryCard } from '@/components/dashboard/portfolio-summary';
import { RecentTrades } from '@/components/dashboard/recent-trades';
import { StreakTracker } from '@/components/dashboard/streak-tracker';
import { GoalsTracker } from '@/components/dashboard/goals-tracker';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Lazy-loaded Components
// ============================================================================

function ChartSkeleton({ height = 'h-48' }: { height?: string }) {
  return <div className={cn('rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse', height)} />;
}

function MLComponentSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-pulse">
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
        <span className="text-sm font-medium text-zinc-400">{title}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
        <div className="h-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
      </div>
    </div>
  );
}

const OpenPositionsScatter = dynamic(() => import('@/components/dashboard/scatter-plots').then(m => ({ default: m.OpenPositionsScatter })), {
  loading: () => <ChartSkeleton height="h-64" />,
  ssr: false,
});
const ClosedTradesScatter = dynamic(() => import('@/components/dashboard/scatter-plots').then(m => ({ default: m.ClosedTradesScatter })), {
  loading: () => <ChartSkeleton height="h-64" />,
  ssr: false,
});
const OptionsAnalytics = dynamic(() => import('@/components/dashboard/options-analytics').then(m => ({ default: m.OptionsAnalytics })), {
  loading: () => <MLComponentSkeleton title="Options Analytics" />,
  ssr: false,
});
const OptionsSeasonality = dynamic(() => import('@/components/dashboard/options-seasonality').then(m => ({ default: m.OptionsSeasonality })), {
  loading: () => <MLComponentSkeleton title="Options Seasonality" />,
  ssr: false,
});
const OptionsRolls = dynamic(() => import('@/components/dashboard/options-rolls').then(m => ({ default: m.OptionsRolls })), {
  loading: () => <MLComponentSkeleton title="Options Rolls" />,
  ssr: false,
});
const MLOptionsInsights = dynamic(() => import('@/components/dashboard/ml-options-insights').then(m => ({ default: m.MLOptionsInsights })), {
  loading: () => <MLComponentSkeleton title="ML Options Insights" />,
  ssr: false,
});
const TimeAnalytics = dynamic(() => import('@/components/dashboard/time-analytics').then(m => ({ default: m.TimeAnalytics })), {
  loading: () => <MLComponentSkeleton title="Time Analytics" />,
  ssr: false,
});
const TradeSizeAnalytics = dynamic(() => import('@/components/dashboard/trade-size-analytics').then(m => ({ default: m.TradeSizeAnalytics })), {
  loading: () => <MLComponentSkeleton title="Trade Size Analytics" />,
  ssr: false,
});
const CashFlowAnalytics = dynamic(() => import('@/components/dashboard/cash-flow-analytics').then(m => ({ default: m.CashFlowAnalytics })), {
  loading: () => <MLComponentSkeleton title="Cash Flow Analytics" />,
  ssr: false,
});
const PortfolioAllocation = dynamic(() => import('@/components/dashboard/portfolio-allocation').then(m => ({ default: m.PortfolioAllocation })), {
  loading: () => <MLComponentSkeleton title="Portfolio Allocation" />,
  ssr: false,
});
const PositionHealthList = dynamic(() => import('@/components/dashboard/position-health').then(m => ({ default: m.PositionHealthList })), {
  loading: () => <MLComponentSkeleton title="Position Health" />,
  ssr: false,
});

// ============================================================================
// Tab Configuration
// ============================================================================

interface TabConfig {
  value: string;
  label: string;
  icon: LucideIcon;
  accentColor: string;
}

const TAB_CONFIG: TabConfig[] = [
  { value: 'charts', label: 'Charts & Calendar', icon: LineChart, accentColor: 'blue' },
  { value: 'positions', label: 'Positions & Trades', icon: Briefcase, accentColor: 'emerald' },
  { value: 'performance', label: 'Performance', icon: BarChart3, accentColor: 'purple' },
  { value: 'options', label: 'Options Deep Dive', icon: Target, accentColor: 'purple' },
  { value: 'goals', label: 'Goals & Streaks', icon: Trophy, accentColor: 'emerald' },
];

// ============================================================================
// Main Component
// ============================================================================

export function DemoTabbedDashboard() {
  const { selectedAccountId, setSelectedAccountId, isInitialized } = useSelectedAccount();

  // ── Data queries (all served from DemoQueryProvider cache) ──────────────
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.stats(selectedAccountId),
    queryFn: () => fetchDashboardStats(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: performance } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.performance(selectedAccountId),
    queryFn: () => fetchPerformanceData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: scatter } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.scatter(selectedAccountId),
    queryFn: () => fetchScatterData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: positions } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.positions(selectedAccountId),
    queryFn: () => fetchPositionsData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  // Guided tour — shows once on first visit (must be before early returns)
  useDemoTour(!statsLoading && !!stats);

  // ── Loading / Error states ─────────────────────────────────────────────
  if (statsLoading || !isInitialized) return <DashboardSkeleton />;
  if (statsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="font-medium">Error loading dashboard</p>
        <p className="text-sm">{statsError instanceof Error ? statsError.message : 'Unknown error'}</p>
      </div>
    );
  }
  if (!stats) return null;

  const biggestWin = performance?.extremeTrades?.biggestWins?.[0];
  const biggestLoss = performance?.extremeTrades?.biggestLosses?.[0];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Account Selector */}
      <motion.div
        id="tour-account-selector"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          className="max-w-md"
        />
      </motion.div>

      {/* Stats Cards — always visible as the overview zone */}
      <motion.div
        id="tour-stats-cards"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <StatsCards stats={stats} />
      </motion.div>

      {/* Tabbed Sections */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
      <Tabs defaultValue="charts" className="w-full">
        {/* Tab Navigation — glassmorphism + mobile scroll fade */}
        <div className="relative">
          <TabsList id="tour-tabs" className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/40 rounded-xl p-1.5 shadow-sm">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                id={`tour-tab-${value}`}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-200',
                  'data-[state=active]:bg-linear-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-400',
                  'data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/25',
                  'data-[state=inactive]:text-zinc-600 dark:data-[state=inactive]:text-zinc-400',
                  'data-[state=inactive]:hover:bg-white/60 dark:data-[state=inactive]:hover:bg-zinc-800/80',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Right edge fade — hints at more tabs (mobile only) */}
          <div className="sm:hidden absolute right-0 top-0 bottom-0 w-10 bg-linear-to-l from-zinc-950 via-zinc-950/80 to-transparent rounded-r-xl pointer-events-none" aria-hidden="true" />
        </div>

        {/* ─── Charts & Calendar ────────────────────────────────────── */}
        <TabsContent value="charts" id="tour-tab-content" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PnLChart data={stats.chartData} />
            <PnLCalendar accountId={selectedAccountId} />
          </div>
          {scatter && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <OpenPositionsScatter points={scatter.openPositions.points} meta={scatter.openPositions.meta} />
              <ClosedTradesScatter points={scatter.closedTrades.points} meta={scatter.closedTrades.meta} />
            </div>
          )}
          <TimeAnalytics accountId={selectedAccountId} />
        </TabsContent>

        {/* ─── Positions & Trades ───────────────────────────────────── */}
        <TabsContent value="positions" className="mt-4 space-y-4">
          {positions && (
            <PortfolioSummaryCard
              stocks={positions.stocks}
              options={positions.options}
              futures={positions.futures}
              summary={positions.summary}
            />
          )}
          <RecentTrades accountId={selectedAccountId} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PortfolioAllocation accountId={selectedAccountId} />
            <PositionHealthList accountId={selectedAccountId} />
          </div>
        </TabsContent>

        {/* ─── Performance Analysis (summary + sub-tabs) ─────────────── */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          {/* Persistent summary — biggest win/loss always visible */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200/50 bg-white/80 p-5 dark:border-zinc-700/40 dark:bg-zinc-900/60 backdrop-blur-xl hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">Largest Win</span>
              </div>
              {biggestWin ? (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{biggestWin.symbol}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{biggestWin.type} &middot; {formatDate(biggestWin.date)}</p>
                  </div>
                  <span className="text-xl font-bold bg-linear-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">{formatCurrency(biggestWin.pnl)}</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No winning trades yet</p>
              )}
            </div>
            <div className="rounded-xl border border-zinc-200/50 bg-white/80 p-5 dark:border-zinc-700/40 dark:bg-zinc-900/60 backdrop-blur-xl hover:border-red-500/30 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-red-500" />
                <span className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">Largest Loss</span>
              </div>
              {biggestLoss ? (
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{biggestLoss.symbol}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{biggestLoss.type} &middot; {formatDate(biggestLoss.date)}</p>
                  </div>
                  <span className="text-xl font-bold bg-linear-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">{formatCurrency(biggestLoss.pnl)}</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No losing trades yet</p>
              )}
            </div>
          </div>

          {/* Sub-tabs for drill-down views */}
          <Tabs defaultValue="tickers" className="w-full">
            <div className="relative">
              <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-zinc-100/80 dark:bg-zinc-800/60 backdrop-blur-lg rounded-lg p-1">
                <TabsTrigger
                  value="tickers"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  By Ticker
                </TabsTrigger>
                <TabsTrigger
                  value="monthly"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  value="trade-size"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  Trade Size
                </TabsTrigger>
                <TabsTrigger
                  value="cash-flow"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  Cash Flow
                </TabsTrigger>
              </TabsList>
              <div className="sm:hidden absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-zinc-950 via-zinc-950/80 to-transparent rounded-r-lg pointer-events-none" aria-hidden="true" />
            </div>
            <TabsContent value="tickers" className="mt-3">
              <TickerPerformance accountId={selectedAccountId} />
            </TabsContent>
            <TabsContent value="monthly" className="mt-3">
              {performance && <MonthlyBreakdown data={performance.monthlyBreakdown} />}
            </TabsContent>
            <TabsContent value="trade-size" className="mt-3">
              <TradeSizeAnalytics accountId={selectedAccountId} />
            </TabsContent>
            <TabsContent value="cash-flow" className="mt-3">
              <CashFlowAnalytics accountId={selectedAccountId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── Options Deep Dive (nested sub-tabs) ────────────────── */}
        <TabsContent value="options" className="mt-4">
          <Tabs defaultValue="analytics" className="w-full">
            <div className="relative">
              <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-zinc-100/80 dark:bg-zinc-800/60 backdrop-blur-lg rounded-lg p-1">
                <TabsTrigger
                  value="analytics"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger
                  value="seasonality"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  Seasonality
                </TabsTrigger>
                <TabsTrigger
                  value="rolls"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  Rolls
                </TabsTrigger>
                <TabsTrigger
                  value="ml-insights"
                  className="shrink-0 px-3 py-2 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-sm"
                >
                  ML Insights
                </TabsTrigger>
              </TabsList>
              <div className="sm:hidden absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-zinc-950 via-zinc-950/80 to-transparent rounded-r-lg pointer-events-none" aria-hidden="true" />
            </div>
            <TabsContent value="analytics" className="mt-3">
              <OptionsAnalytics accountId={selectedAccountId} />
            </TabsContent>
            <TabsContent value="seasonality" className="mt-3">
              <OptionsSeasonality accountId={selectedAccountId} />
            </TabsContent>
            <TabsContent value="rolls" className="mt-3">
              <OptionsRolls accountId={selectedAccountId} />
            </TabsContent>
            <TabsContent value="ml-insights" className="mt-3">
              <MLOptionsInsights accountId={selectedAccountId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── Goals & Streaks ──────────────────────────────────────── */}
        <TabsContent value="goals" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StreakTracker accountId={selectedAccountId} />
            <GoalsTracker accountId={selectedAccountId} />
          </div>
        </TabsContent>
      </Tabs>
      </motion.div>
    </div>
  );
}
