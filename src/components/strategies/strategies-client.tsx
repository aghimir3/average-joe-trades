'use client';

/**
 * Strategies Client Component
 *
 * Main page for trading strategies using a tabbed layout with glassmorphism styling.
 * Matches the dashboard's tab pattern: gradient active states, horizontal scroll on mobile,
 * motion animations, and persistent tab state (URL hash + localStorage).
 *
 * Currently implements Wheel Strategy with 6 views.
 */

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { AccountSelector } from '@/components/accounts/account-selector';
import {
  BarChart3,
  Brain,
  Search,
  Wallet,
  ScanLine,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Lazy-loaded Components
// ============================================================================

function ComponentSkeleton({ title }: { title: string }) {
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
        <div className="h-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
      </div>
    </div>
  );
}

const IncomeWheelStrategy = dynamic(
  () => import('@/components/dashboard/income-wheel-strategy').then(m => ({ default: m.IncomeWheelStrategy })),
  { loading: () => <ComponentSkeleton title="Income Analysis" />, ssr: false }
);

const WheelDashboard = dynamic(
  () => import('@/components/dashboard/wheel-dashboard').then(m => ({ default: m.WheelDashboard })),
  { loading: () => <ComponentSkeleton title="Wheel Dashboard" />, ssr: false }
);

const WheelMLInsights = dynamic(
  () => import('@/components/wheel/wheel-ml-insights').then(m => ({ default: m.WheelMLInsights })),
  { loading: () => <ComponentSkeleton title="AI Insights" />, ssr: false }
);

const TickerWheelInsights = dynamic(
  () => import('@/components/strategies/wheel/ticker-wheel-insights').then(m => ({ default: m.TickerWheelInsights })),
  { loading: () => <ComponentSkeleton title="Ticker Deep Dive" />, ssr: false }
);

const WheelOptionsScanner = dynamic(
  () => import('@/components/wheel/wheel-options-scanner').then(m => ({ default: m.WheelOptionsScanner })),
  { loading: () => <ComponentSkeleton title="Options Scanner" />, ssr: false }
);

const CommunityInsights = dynamic(
  () => import('@/components/wheel/community-insights').then(m => ({ default: m.CommunityInsights })),
  { loading: () => <ComponentSkeleton title="Community Insights" />, ssr: false }
);

// ============================================================================
// Tab Configuration
// ============================================================================

interface TabConfig {
  value: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const STRATEGY_TABS: TabConfig[] = [
  { value: 'income', label: 'Income Analysis', shortLabel: 'Income', icon: Wallet },
  { value: 'dashboard', label: 'Wheel Dashboard', shortLabel: 'Dashboard', icon: BarChart3 },
  { value: 'ai-insights', label: 'AI Insights', shortLabel: 'AI', icon: Brain },
  { value: 'ticker-dive', label: 'Ticker Deep Dive', shortLabel: 'Ticker', icon: Search },
  { value: 'scanner', label: 'Options Scanner', shortLabel: 'Scanner', icon: ScanLine },
  { value: 'community', label: 'Community Insights', shortLabel: 'Community', icon: Users },
];

const DEFAULT_TAB = 'income';
const LS_KEY = 'strategiesActiveTab';

// ============================================================================
// Main Component
// ============================================================================

export function StrategiesClient() {
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();

  // Tab state: URL hash > localStorage > default
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_TAB;
    const hash = window.location.hash.slice(1);
    if (hash && STRATEGY_TABS.some(t => t.value === hash)) return hash;
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && STRATEGY_TABS.some(t => t.value === saved)) return saved;
    } catch { /* localStorage unavailable */ }
    return DEFAULT_TAB;
  });

  // Persist active tab on every change
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, activeTab); } catch { /* noop */ }
  }, [activeTab]);

  // Listen for external hash changes (e.g. deep links)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && STRATEGY_TABS.some(t => t.value === hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.replaceState(null, '', `#${value}`);
  };

  return (
    <div className="space-y-6 pb-8 overflow-x-hidden">
      {/* Account Selector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          className="flex-1 min-w-50 max-w-md"
        />
      </motion.div>

      {/* Tabbed Sections */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Tab Navigation — glassmorphism + mobile scroll fade */}
          <div className="relative">
            <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/40 rounded-xl p-1.5 shadow-sm">
              {STRATEGY_TABS.map(({ value, label, shortLabel, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium',
                    'transition-all duration-200',
                    'data-[state=active]:bg-linear-to-r data-[state=active]:from-amber-500 data-[state=active]:to-amber-400',
                    'data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25',
                    'data-[state=inactive]:text-zinc-600 dark:data-[state=inactive]:text-zinc-400',
                    'data-[state=inactive]:hover:bg-amber-50/50 dark:data-[state=inactive]:hover:bg-amber-500/10',
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

          {/* ─── Income Analysis ──────────────────────────────────── */}
          <TabsContent value="income" className="mt-4 space-y-4">
            <IncomeWheelStrategy accountId={selectedAccountId} />
          </TabsContent>

          {/* ─── Wheel Dashboard ──────────────────────────────────── */}
          <TabsContent value="dashboard" className="mt-4 space-y-4">
            <WheelDashboard accountId={selectedAccountId} />
          </TabsContent>

          {/* ─── AI Insights ──────────────────────────────────────── */}
          <TabsContent value="ai-insights" className="mt-4 space-y-4">
            <WheelMLInsights accountId={selectedAccountId} />
          </TabsContent>

          {/* ─── Ticker Deep Dive ─────────────────────────────────── */}
          <TabsContent value="ticker-dive" className="mt-4 space-y-4">
            <TickerWheelInsights selectedAccountId={selectedAccountId} />
          </TabsContent>

          {/* ─── Options Scanner ──────────────────────────────────── */}
          <TabsContent value="scanner" className="mt-4 space-y-4">
            <WheelOptionsScanner />
          </TabsContent>

          {/* ─── Community Insights ───────────────────────────────── */}
          <TabsContent value="community" className="mt-4 space-y-4">
            <CommunityInsights />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
