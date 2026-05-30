'use client';

/**
 * History Client Component
 *
 * Main container for the History page with two tabs:
 * - Trade History: Closed trades with Win/Loss/BE badges, return %, filters
 * - Journal History: Chronological journal entries
 *
 * Uses blue theme to distinguish from dashboard (emerald), strategies (amber), AI (violet).
 * Follows the strategies-client.tsx tab pattern: glassmorphism, URL hash + localStorage persistence.
 */

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { AccountSelector } from '@/components/accounts/account-selector';
import { fetchDashboardStats, DASHBOARD_QUERY_KEYS } from '@/components/dashboard/lib/dashboard-api';
import type { DashboardStats } from '@/components/dashboard/lib/dashboard-types';
import {
  ScrollText,
  BookOpen,
  TrendingUp,
  Target,
  BarChart3,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn, formatCompactCurrency } from '@/lib/utils';
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

const TradeHistoryTab = dynamic(
  () => import('./trade-history-tab').then(m => ({ default: m.TradeHistoryTab })),
  { loading: () => <ComponentSkeleton title="Trade History" />, ssr: false }
);

const JournalHistoryTab = dynamic(
  () => import('./journal-history-tab').then(m => ({ default: m.JournalHistoryTab })),
  { loading: () => <ComponentSkeleton title="Journal History" />, ssr: false }
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

const HISTORY_TABS: TabConfig[] = [
  { value: 'trades', label: 'Trade History', shortLabel: 'Trades', icon: ScrollText },
  { value: 'journal', label: 'Journal History', shortLabel: 'Journal', icon: BookOpen },
];

const DEFAULT_TAB = 'trades';
const LS_KEY = 'historyActiveTab';

// ============================================================================
// Stats Card Sub-component
// ============================================================================

interface StatCardProps {
  label: string;
  value: string;
  valueColor?: 'green' | 'red' | 'default';
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: 'green' | 'red' | 'default';
  subtitle: string;
  delay: number;
}

function StatCard({
  label,
  value,
  valueColor = 'default',
  icon: Icon,
  iconColor = 'default',
  subtitle,
  delay,
}: StatCardProps) {
  const valueColorClass = {
    green: 'text-rh-green',
    red: 'text-rh-red',
    default: 'text-zinc-900 dark:text-zinc-50',
  }[valueColor];

  const iconColorClass = {
    green: 'text-rh-green',
    red: 'text-rh-red',
    default: 'text-zinc-400 dark:text-zinc-500',
  }[iconColor];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-xl border border-zinc-200/50 bg-white/80 p-5 dark:border-zinc-700/40 dark:bg-zinc-900/60 backdrop-blur-xl hover:shadow-lg hover:shadow-blue-500/5 hover:border-blue-500/20 transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
        <Icon className={cn('h-4 w-4', iconColorClass)} />
      </div>
      <p className={cn('text-2xl font-bold tracking-tight', valueColorClass)}>{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">{subtitle}</p>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function HistoryClient() {
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();

  // Fetch stats (reuses dashboard endpoint)
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: DASHBOARD_QUERY_KEYS.stats(selectedAccountId),
    queryFn: () => fetchDashboardStats(selectedAccountId),
    staleTime: 2 * 60 * 1000,
  });

  // Tab state: URL hash > localStorage > default
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_TAB;
    const hash = window.location.hash.slice(1);
    if (hash && HISTORY_TABS.some(t => t.value === hash)) return hash;
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && HISTORY_TABS.some(t => t.value === saved)) return saved;
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
      if (hash && HISTORY_TABS.some(t => t.value === hash)) {
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

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total P&L"
            value={formatCompactCurrency(stats.totalPnL)}
            valueColor={stats.totalPnL >= 0 ? 'green' : 'red'}
            icon={TrendingUp}
            iconColor={stats.totalPnL >= 0 ? 'green' : 'red'}
            subtitle={`${stats.closedTrades} closed trades`}
            delay={0.1}
          />
          <StatCard
            label="Win Rate"
            value={`${(stats.winRate ?? 0).toFixed(1)}%`}
            icon={Target}
            subtitle={`${stats.wins ?? 0}W / ${stats.losses ?? 0}L`}
            delay={0.15}
          />
          <StatCard
            label="Closed Trades"
            value={String(stats.closedTrades)}
            icon={BarChart3}
            subtitle={`${stats.stockTradeCount} stock · ${stats.optionTradeCount} option`}
            delay={0.2}
          />
          <StatCard
            label="Profit Factor"
            value={`${(stats.profitFactor ?? 0).toFixed(2)}x`}
            icon={Scale}
            subtitle={`${(stats.profitFactor ?? 0) >= 1 ? '≥1 is profitable' : 'Below breakeven'}`}
            delay={0.25}
          />
          <StatCard
            label="Avg Win"
            value={formatCompactCurrency(stats.avgWin)}
            valueColor="green"
            icon={ArrowUpRight}
            iconColor="green"
            subtitle="per winning trade"
            delay={0.3}
          />
          <StatCard
            label="Avg Loss"
            value={formatCompactCurrency(stats.avgLoss)}
            valueColor="red"
            icon={ArrowDownRight}
            iconColor="red"
            subtitle="per losing trade"
            delay={0.35}
          />
        </div>
      )}

      {/* Tabbed Sections */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Tab Navigation — glassmorphism + mobile scroll fade */}
          <div className="relative">
            <TabsList className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden justify-start gap-1 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/40 rounded-xl p-1.5 shadow-sm">
              {HISTORY_TABS.map(({ value, label, shortLabel, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium',
                    'transition-all duration-200',
                    'data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-400',
                    'data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/25',
                    'data-[state=inactive]:text-zinc-600 dark:data-[state=inactive]:text-zinc-400',
                    'data-[state=inactive]:hover:bg-blue-50/50 dark:data-[state=inactive]:hover:bg-blue-500/10',
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

          {/* ─── Trade History ──────────────────────────────────────── */}
          <TabsContent value="trades" className="mt-4 space-y-4">
            <TradeHistoryTab accountId={selectedAccountId} />
          </TabsContent>

          {/* ─── Journal History ────────────────────────────────────── */}
          <TabsContent value="journal" className="mt-4 space-y-4">
            <JournalHistoryTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
