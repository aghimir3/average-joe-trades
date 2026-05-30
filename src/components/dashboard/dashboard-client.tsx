'use client';

/**
 * Dashboard Client Component
 *
 * Main dashboard orchestrator using a tabbed layout (upgraded from collapsible sections).
 * Shows one section at a time via shadcn Tabs, with persistent stats cards as overview.
 *
 * Features:
 * - Tabbed navigation with glassmorphism styling
 * - Nested sub-tabs for Performance and Options
 * - Motion animations on mount
 * - Account filtering, daily sync, pull-to-refresh
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { useAnalytics } from '@/hooks/use-analytics';
import dynamic from 'next/dynamic';
import {
  LineChart,
  BarChart3,
  Briefcase,
  Target,
  Trophy,
  Zap,
  Info,
  CalendarRange,
  ArrowLeftRight,
  Sparkles,
  Hash,
  Calendar,
  Layers,
  Banknote,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'motion/react';

// UI
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccountSelector } from '@/components/accounts/account-selector';
import { WelcomeModal } from '@/components/onboarding/welcome-modal';
import { DashboardSkeleton } from './dashboard-skeletons';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import {
  StatsCards,
  QuickActions,
  DailySyncBanner,
  DailySyncErrorBanner,
  TransactionUnavailableBanner,
} from './layout';

// API and types
import {
  fetchBrokerageAccounts,
  fetchSnapTradeStatus,
  fetchUserSettings,
  fetchDashboardStats,
  fetchPerformanceData,
  fetchScatterData,
  fetchPositionsData,
  fetchRealtimeCheck,
  triggerDailySync,
  syncToday,
  getDismissedBanners,
  dismissBanner as persistDismissBanner,
  isDailySyncDismissedToday,
  dismissDailySyncBanner as persistDismissDailySyncBanner,
  formatDate,
  DASHBOARD_QUERY_KEYS,
  DASHBOARD_STALE_TIME,
} from './lib';
import type { DailySyncResult } from './lib';
import type { LucideIcon } from 'lucide-react';

// Tour
import { useDashboardTour } from './use-dashboard-tour';

// Background prefetch for all tabs
import { useDashboardPrefetch } from './use-dashboard-prefetch';

// Static imports for frequently used components
import { PnLChart } from './pnl-chart';
import { PnLCalendar } from './pnl-calendar';
import { TickerPerformance } from './ticker-performance';
import { MonthlyBreakdown } from './monthly-breakdown';
import { PortfolioSummaryCard } from './portfolio-summary';
import { RecentTrades } from './recent-trades';
import { StreakTracker } from './streak-tracker';
import { GoalsTracker } from './goals-tracker';

// ============================================================================
// Lazy-loaded Components
// ============================================================================

function MLComponentSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-pulse">
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-sm font-medium text-zinc-400">{title}</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
        <div className="h-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
      </div>
    </div>
  );
}

function ChartSkeleton({ height = 'h-48' }: { height?: string }) {
  return <div className={cn('rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse', height)} />;
}

const OpenPositionsScatter = dynamic(() => import('./scatter-plots').then(m => ({ default: m.OpenPositionsScatter })), {
  loading: () => <ChartSkeleton height="h-64" />,
  ssr: false,
});
const ClosedTradesScatter = dynamic(() => import('./scatter-plots').then(m => ({ default: m.ClosedTradesScatter })), {
  loading: () => <ChartSkeleton height="h-64" />,
  ssr: false,
});
const OptionsAnalytics = dynamic(() => import('./options-analytics').then(m => ({ default: m.OptionsAnalytics })), {
  loading: () => <MLComponentSkeleton title="Options Analytics" />,
  ssr: false,
});
const OptionsSeasonality = dynamic(() => import('./options-seasonality').then(m => ({ default: m.OptionsSeasonality })), {
  loading: () => <MLComponentSkeleton title="Options Seasonality" />,
  ssr: false,
});
const OptionsRolls = dynamic(() => import('./options-rolls').then(m => ({ default: m.OptionsRolls })), {
  loading: () => <MLComponentSkeleton title="Options Rolls" />,
  ssr: false,
});
const MLOptionsInsights = dynamic(() => import('./ml-options-insights').then(m => ({ default: m.MLOptionsInsights })), {
  loading: () => <MLComponentSkeleton title="ML Options Insights" />,
  ssr: false,
});
const PositionActions = dynamic(() => import('./position-actions').then(m => ({ default: m.PositionActions })), {
  loading: () => <MLComponentSkeleton title="Position Actions" />,
  ssr: false,
});
const TimeAnalytics = dynamic(() => import('./time-analytics').then(m => ({ default: m.TimeAnalytics })), {
  loading: () => <MLComponentSkeleton title="Time Analytics" />,
  ssr: false,
});
const TradeSizeAnalytics = dynamic(() => import('./trade-size-analytics').then(m => ({ default: m.TradeSizeAnalytics })), {
  loading: () => <MLComponentSkeleton title="Trade Size Analytics" />,
  ssr: false,
});
const CashFlowAnalytics = dynamic(() => import('./cash-flow-analytics').then(m => ({ default: m.CashFlowAnalytics })), {
  loading: () => <MLComponentSkeleton title="Cash Flow Analytics" />,
  ssr: false,
});
const PortfolioRealtime = dynamic(() => import('./portfolio-realtime').then(m => ({ default: m.PortfolioRealtime })), {
  loading: () => <MLComponentSkeleton title="Portfolio Realtime" />,
  ssr: false,
});
const PortfolioAllocation = dynamic(() => import('./portfolio-allocation').then(m => ({ default: m.PortfolioAllocation })), {
  loading: () => <MLComponentSkeleton title="Portfolio Allocation" />,
  ssr: false,
});
const PositionHealthList = dynamic(() => import('./position-health').then(m => ({ default: m.PositionHealthList })), {
  loading: () => <MLComponentSkeleton title="Position Health" />,
  ssr: false,
});
const WheelRealtime = dynamic(() => import('./wheel-realtime').then(m => ({ default: m.WheelRealtime })), {
  loading: () => <MLComponentSkeleton title="Wheel Realtime" />,
  ssr: false,
});

// ============================================================================
// Tab Configuration
// ============================================================================

interface TabConfig {
  value: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const ALL_TABS: TabConfig[] = [
  { value: 'live-portfolio', label: 'Live Portfolio', shortLabel: 'Live', icon: Zap },
  { value: 'charts', label: 'Charts & Calendar', shortLabel: 'Charts', icon: LineChart },
  { value: 'positions', label: 'Positions & Trades', shortLabel: 'Positions', icon: Briefcase },
  { value: 'performance', label: 'Performance', shortLabel: 'Performance', icon: BarChart3 },
  { value: 'options', label: 'Options Deep Dive', shortLabel: 'Options', icon: Target },
  { value: 'goals', label: 'Goals & Streaks', shortLabel: 'Goals', icon: Trophy },
];

const WELCOME_MODAL_DISMISSED_SESSION_KEY = 'welcomeModalDismissed';

// ============================================================================
// Main Component
// ============================================================================

export function DashboardClient() {
  const queryClient = useQueryClient();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(WELCOME_MODAL_DISMISSED_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(() => getDismissedBanners());

  // Daily sync state
  const [isDailySyncing, setIsDailySyncing] = useState(false);
  const [dailySyncResult, setDailySyncResult] = useState<DailySyncResult | null>(null);
  const [dailySyncError, setDailySyncError] = useState<string | null>(null);
  const [dailySyncBannerDismissed, setDailySyncBannerDismissed] = useState(() => isDailySyncDismissedToday());

  // Mobile detection (for pull-to-refresh)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // User settings
  const { data: userSettings } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.userSettings,
    queryFn: fetchUserSettings,
    staleTime: 60000,
  });
  const autoSyncEnabled = userSettings?.autoSyncEnabled ?? false;

  // Analytics tracking
  const { trackSection } = useAnalytics('/dashboard');

  // Account selection
  const { selectedAccountId, setSelectedAccountId, isInitialized } = useSelectedAccount();

  // Brokerage accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.accounts,
    queryFn: fetchBrokerageAccounts,
  });

  const selectedAccount = selectedAccountId ? accounts.find(a => a.id === selectedAccountId) : null;
  const effectiveAccountId = selectedAccountId ?? (accounts.length === 1 ? accounts[0].id : null);

  // Clear invalid account ID
  useEffect(() => {
    if (
      isInitialized &&
      !accountsLoading &&
      accounts.length > 0 &&
      selectedAccountId &&
      !accounts.some(a => a.id === selectedAccountId)
    ) {
      setSelectedAccountId(null);
    }
  }, [isInitialized, accountsLoading, accounts, selectedAccountId, setSelectedAccountId]);

  const isSelectedAccountSnapTrade = selectedAccount?.externalAccountId != null;
  const hasSnapTradeAccounts = accounts.some(a => a.externalAccountId != null);

  // Welcome modal logic
  useEffect(() => {
    if (accounts.length > 0 && welcomeDismissed) {
      setWelcomeDismissed(false);
      try {
        sessionStorage.removeItem(WELCOME_MODAL_DISMISSED_SESSION_KEY);
      } catch {
        // Best-effort only
      }
    }
  }, [accounts.length, welcomeDismissed]);

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcome(false);
    setWelcomeDismissed(true);
    try {
      sessionStorage.setItem(WELCOME_MODAL_DISMISSED_SESSION_KEY, '1');
    } catch {
      // Best-effort only
    }
  }, []);

  // Daily sync
  const dailySyncAttemptedRef = useRef(false);

  const performDailySync = useCallback(async () => {
    if (dailySyncAttemptedRef.current) return;
    dailySyncAttemptedRef.current = true;

    setIsDailySyncing(true);
    setDailySyncError(null);

    try {
      const result = await triggerDailySync();
      setDailySyncResult(result);
      if (result.syncTriggered && result.transactionsImported && result.transactionsImported > 0) {
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardPerformance'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardScatter'] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
      }
    } catch (err) {
      setDailySyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsDailySyncing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (autoSyncEnabled && !accountsLoading && hasSnapTradeAccounts && !dailySyncAttemptedRef.current && !dailySyncBannerDismissed) {
      performDailySync();
    }
  }, [autoSyncEnabled, accountsLoading, hasSnapTradeAccounts, dailySyncBannerDismissed, performDailySync]);

  const handleDismissDailySyncBanner = () => {
    persistDismissDailySyncBanner();
    setDailySyncBannerDismissed(true);
  };

  // Pull-to-refresh
  const handlePullToRefresh = useCallback(async () => {
    const snaptradeAccountIds = accounts
      .filter(a => a.externalAccountId)
      .map(a => a.externalAccountId as string);

    const refreshDashboard = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardPerformance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardScatter'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardPositions'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    };

    if (snaptradeAccountIds.length === 0) {
      refreshDashboard();
      return;
    }

    const result = await syncToday(snaptradeAccountIds);
    if (result.success) refreshDashboard();
  }, [accounts, queryClient]);

  // SnapTrade status
  const { data: snapTradeStatus, refetch: refetchSnapTradeStatus, isRefetching: isRefetchingSnapTrade } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.snaptradeStatus,
    queryFn: () => fetchSnapTradeStatus(),
    enabled: false,
    staleTime: 60000,
  });

  const selectedSnapTradeAccount = isSelectedAccountSnapTrade && snapTradeStatus?.accounts
    ? snapTradeStatus.accounts.find(a => a.brokerageAccountId === selectedAccountId)
    : null;
  const isAccountSyncing = selectedSnapTradeAccount?.snaptradeSync?.status === 'syncing';
  const isAccountReady = selectedSnapTradeAccount?.snaptradeSync?.isInitialSyncComplete ?? false;
  const hasNoTransactionData = isSelectedAccountSnapTrade && selectedSnapTradeAccount && !isAccountReady && selectedAccountId && !dismissedBanners.has(selectedAccountId);

  const handleDismissBanner = () => {
    if (selectedAccountId) {
      persistDismissBanner(selectedAccountId);
      setDismissedBanners(prev => new Set([...prev, selectedAccountId]));
    }
  };

  // Dashboard data queries
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.stats(selectedAccountId),
    queryFn: () => fetchDashboardStats(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: performance, refetch: refetchPerformance } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.performance(selectedAccountId),
    queryFn: () => fetchPerformanceData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: scatter, refetch: refetchScatter } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.scatter(selectedAccountId),
    queryFn: () => fetchScatterData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: positions, refetch: refetchPositions } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.positions(selectedAccountId),
    queryFn: () => fetchPositionsData(selectedAccountId),
    enabled: isInitialized,
    staleTime: DASHBOARD_STALE_TIME,
  });

  const { data: realtimeCheck } = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.realtimeCheck(effectiveAccountId),
    queryFn: () => fetchRealtimeCheck(effectiveAccountId),
    staleTime: 60000,
    enabled: isInitialized,
  });

  const hasRealtimeData = realtimeCheck?.hasRealTimeData ?? false;
  const isLoading = statsLoading;

  const handleRefresh = () => {
    refetchStats();
    refetchPerformance();
    refetchScatter();
    refetchPositions();
  };

  // Tab state with hash-based deep-linking
  const activeTabs = ALL_TABS.filter(tab => {
    if (tab.value === 'live-portfolio') return hasRealtimeData;
    return true;
  });

  const defaultTab = hasRealtimeData ? 'live-portfolio' : 'charts';

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return defaultTab;
    // Hash takes priority (e.g. from tour or deep link)
    const hash = window.location.hash.slice(1);
    if (hash && ALL_TABS.some(t => t.value === hash)) return hash;
    // Restore last-used tab from localStorage
    try {
      const saved = localStorage.getItem('dashboard-active-tab');
      if (saved && ALL_TABS.some(t => t.value === saved)) return saved;
    } catch { /* localStorage unavailable */ }
    return defaultTab;
  });

  // Persist active tab to localStorage on every change (including initial default)
  useEffect(() => {
    try { localStorage.setItem('dashboard-active-tab', activeTab); } catch { /* noop */ }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.replaceState(null, '', `#${value}`);
    trackSection(value);
  };

  // Handle hash changes and expandSection events
  useEffect(() => {
    const handleExpandSection = (e: CustomEvent<string>) => {
      const tabValue = e.detail;
      // Map old section IDs to new tab values
      const sectionToTab: Record<string, string> = {
        'live-portfolio': 'live-portfolio',
        'charts-calendar': 'charts',
        'positions-trades': 'positions',
        'performance': 'performance',
        'options-analytics': 'options',
        'goals-streaks': 'goals',
      };
      const mapped = sectionToTab[tabValue] ?? tabValue;
      if (ALL_TABS.some(t => t.value === mapped)) {
        setActiveTab(mapped);
      }
    };

    window.addEventListener('expandSection', handleExpandSection as EventListener);
    return () => window.removeEventListener('expandSection', handleExpandSection as EventListener);
  }, []);

  // Guided tour — must be before early returns so the hook always runs
  const tourSeen = userSettings?.dashboardTourSeen ?? true;
  useDashboardTour(!statsLoading && !!stats && isInitialized, tourSeen, hasRealtimeData);

  // Prefetch all other tabs in the background so switching feels instant
  useDashboardPrefetch(!statsLoading && !!stats && isInitialized, selectedAccountId);

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

  // Welcome modal for first-time users
  const shouldShowWelcome = !welcomeDismissed && (showWelcome || (!accountsLoading && accounts.length === 0));
  if (shouldShowWelcome) {
    return <WelcomeModal onComplete={handleWelcomeComplete} />;
  }

  const biggestWin = performance?.extremeTrades?.biggestWins?.[0];
  const biggestLoss = performance?.extremeTrades?.biggestLosses?.[0];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <PullToRefresh
      onRefresh={handlePullToRefresh}
      enabled={isMobile && hasSnapTradeAccounts}
    >
      <div className="space-y-6 pb-8 overflow-x-hidden">
        {/* Sync Banners */}
        {!dailySyncBannerDismissed && (isDailySyncing || (dailySyncResult?.syncTriggered && dailySyncResult.transactionsImported !== undefined)) && (
          <DailySyncBanner
            isLoading={isDailySyncing}
            result={dailySyncResult}
            error={null}
            onDismiss={handleDismissDailySyncBanner}
          />
        )}

        {dailySyncError && !dailySyncBannerDismissed && (
          <DailySyncErrorBanner
            error={dailySyncError}
            onDismiss={handleDismissDailySyncBanner}
          />
        )}

        {hasNoTransactionData && (
          <TransactionUnavailableBanner
            onCheckStatus={() => refetchSnapTradeStatus()}
            isRefetching={isRefetchingSnapTrade}
            onDismiss={handleDismissBanner}
          />
        )}

        {stats.sampleData?.isActive && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
              <div>
                <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                  {stats.sampleData.title}
                </p>
                <p className="text-xs text-sky-800/90 dark:text-sky-200/90">
                  {stats.sampleData.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Account Selector + Quick Actions */}
        <motion.div
          id="tour-account-selector"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <AccountSelector
              selectedAccountId={selectedAccountId}
              onAccountChange={setSelectedAccountId}
              className="flex-1 min-w-50 max-w-md"
            />
            <div className="hidden lg:flex items-center gap-2">
              <QuickActions
                isSnapTradeAccount={isSelectedAccountSnapTrade}
                isAccountSyncing={isAccountSyncing}
                isLoading={isLoading}
                onRefresh={handleRefresh}
              />
            </div>
          </div>
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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            {/* Tab Navigation — glassmorphism + mobile scroll fade */}
            <div className="relative">
              <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/40 rounded-xl p-1.5 shadow-sm">
                {activeTabs.map(({ value, label, shortLabel, icon: Icon }) => (
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
                    <span className="sm:hidden">{shortLabel}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {/* Right edge fade — hints at more tabs (mobile only) */}
              <div className="sm:hidden absolute right-0 top-0 bottom-0 w-10 bg-linear-to-l from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 dark:to-transparent rounded-r-xl pointer-events-none" aria-hidden="true" />
            </div>

            {/* ─── Live Portfolio ──────────────────────────────────────── */}
            {hasRealtimeData && (
              <TabsContent value="live-portfolio" className="mt-4 space-y-4">
                <PortfolioRealtime accountId={effectiveAccountId} />
              </TabsContent>
            )}

            {/* ─── Charts & Calendar ──────────────────────────────────── */}
            <TabsContent value="charts" className="mt-4 space-y-4">
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

            {/* ─── Positions & Trades ─────────────────────────────────── */}
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

            {/* ─── Performance Analysis (summary + sub-tabs) ──────────── */}
            <TabsContent value="performance" className="mt-4 space-y-4">
              {/* Persistent summary — biggest win/loss always visible */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Largest Win */}
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
                {/* Largest Loss */}
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
                  <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1.5 bg-zinc-100/80 dark:bg-zinc-800/40 backdrop-blur-lg rounded-xl p-1.5 border border-zinc-200/40 dark:border-zinc-700/30">
                    {([
                      { value: 'tickers', label: 'By Ticker', icon: Hash },
                      { value: 'monthly', label: 'Monthly', icon: Calendar },
                      { value: 'trade-size', label: 'Trade Size', icon: Layers },
                      { value: 'cash-flow', label: 'Cash Flow', icon: Banknote },
                    ] as const).map(({ value, label, icon: SubIcon }) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg',
                          'transition-all duration-200',
                          'data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-400',
                          'data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20',
                          'data-[state=inactive]:text-zinc-500 dark:data-[state=inactive]:text-zinc-400',
                          'data-[state=inactive]:hover:text-blue-600 dark:data-[state=inactive]:hover:text-blue-400 data-[state=inactive]:hover:bg-blue-50/50 dark:data-[state=inactive]:hover:bg-blue-500/10',
                        )}
                      >
                        <SubIcon className="h-3.5 w-3.5" />
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="sm:hidden absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 dark:to-transparent rounded-r-xl pointer-events-none" aria-hidden="true" />
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
                  <CashFlowAnalytics accountId={selectedAccountId} hasSnapTradeConnection={snapTradeStatus?.isConnected} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ─── Options Deep Dive (nested sub-tabs) ────────────────── */}
            <TabsContent value="options" className="mt-4 space-y-4">
              <Tabs defaultValue="analytics" className="w-full">
                <div className="relative">
                  <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1.5 bg-zinc-100/80 dark:bg-zinc-800/40 backdrop-blur-lg rounded-xl p-1.5 border border-zinc-200/40 dark:border-zinc-700/30">
                    {([
                      { value: 'analytics', label: 'Analytics', icon: BarChart3 },
                      { value: 'seasonality', label: 'Seasonality', icon: CalendarRange },
                      { value: 'rolls', label: 'Rolls', icon: ArrowLeftRight },
                      { value: 'ml-insights', label: 'ML Insights', icon: Sparkles },
                    ] as const).map(({ value, label, icon: SubIcon }) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg',
                          'transition-all duration-200',
                          'data-[state=active]:bg-linear-to-r data-[state=active]:from-violet-500 data-[state=active]:to-violet-400',
                          'data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-violet-500/20',
                          'data-[state=inactive]:text-zinc-500 dark:data-[state=inactive]:text-zinc-400',
                          'data-[state=inactive]:hover:text-violet-600 dark:data-[state=inactive]:hover:text-violet-400 data-[state=inactive]:hover:bg-violet-50/50 dark:data-[state=inactive]:hover:bg-violet-500/10',
                        )}
                      >
                        <SubIcon className="h-3.5 w-3.5" />
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="sm:hidden absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 dark:to-transparent rounded-r-xl pointer-events-none" aria-hidden="true" />
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

              {/* Real-dashboard-only components */}
              <PositionActions accountId={selectedAccountId} />
              <WheelRealtime accountId={selectedAccountId} />
            </TabsContent>

            {/* ─── Goals & Streaks ────────────────────────────────────── */}
            <TabsContent value="goals" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StreakTracker accountId={selectedAccountId} />
                <GoalsTracker accountId={selectedAccountId} />
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </PullToRefresh>
  );
}
