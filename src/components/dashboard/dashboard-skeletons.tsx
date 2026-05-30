'use client';

/**
 * Dashboard Loading Skeletons
 *
 * Reusable skeleton components for dashboard loading states.
 * Provides visual feedback during data fetching.
 */

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Stats cards skeleton (6 cards grid)
 */
export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * Chart skeleton (for P&L chart)
 */
export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-lg overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-4 sm:p-5">
        <Skeleton className="h-6 w-32 mb-3" />
        <div className="flex gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-10 rounded-md" />
          ))}
        </div>
      </div>
      <div className="px-4 pb-4">
        <Skeleton className="h-64 sm:h-72 w-full rounded-lg" />
      </div>
      <div className="border-t border-zinc-200 px-4 sm:px-5 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

/**
 * Calendar skeleton (for P&L calendar)
 */
export function CalendarSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    </div>
  );
}

/**
 * Scatter plot skeleton
 */
export function ScatterPlotSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

/**
 * Streak tracker skeleton
 */
export function StreakTrackerSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 mb-4">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="mb-4">
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-6 rounded" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-3">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-5 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Goals tracker skeleton
 */
export function GoalsTrackerSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="flex items-center justify-between mt-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Portfolio summary skeleton
 */
export function PortfolioSummarySkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-6 w-10 mb-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Recent trades skeleton
 */
export function RecentTradesSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Ticker performance skeleton
 */
export function TickerPerformanceSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Skeleton className="h-4 w-28 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-32 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Monthly breakdown skeleton
 */
export function MonthlyBreakdownSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <Skeleton className="h-4 w-20" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Wheel dashboard skeleton
 */
export function WheelDashboardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

/**
 * Tab bar skeleton — matches the glassmorphism tabbed navigation
 */
function TabBarSkeleton() {
  const tabs = [
    { w: 'w-20 sm:w-28' },
    { w: 'w-20 sm:w-36', active: true },
    { w: 'w-24 sm:w-36' },
    { w: 'w-24 sm:w-32' },
    { w: 'w-20 sm:w-36' },
    { w: 'w-20 sm:w-32' },
  ];

  return (
    <div className="relative">
      <div className="w-full h-auto overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hidden flex justify-start gap-1 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-700/40 rounded-xl p-1.5 shadow-sm">
        {tabs.map((tab, i) => (
          <div
            key={i}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg ${
              tab.active
                ? 'bg-linear-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/25'
                : ''
            }`}
          >
            <Skeleton className={`h-4 w-4 rounded ${tab.active ? 'bg-emerald-300/50' : ''}`} />
            <Skeleton className={`h-4 ${tab.w} rounded ${tab.active ? 'bg-emerald-300/50' : ''}`} />
          </div>
        ))}
      </div>
      {/* Right edge fade — mobile only */}
      <div
        className="sm:hidden absolute right-0 top-0 bottom-0 w-10 bg-linear-to-l from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 dark:to-transparent rounded-r-xl pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Full dashboard skeleton — matches the tabbed layout.
 * Shows account selector, stats cards, tab bar, and
 * skeleton content for the default tab (Charts & Calendar) only.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-8 overflow-x-hidden">
      {/* Account Selector + Quick Actions (matches real layout) */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 flex-1 min-w-50 max-w-md rounded-lg" />
        <div className="hidden lg:flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCardsSkeleton />

      {/* Tab Bar */}
      <TabBarSkeleton />

      {/* Default Tab Content (Charts & Calendar) */}
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartSkeleton />
          <CalendarSkeleton />
        </div>
      </div>
    </div>
  );
}
