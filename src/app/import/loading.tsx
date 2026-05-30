/**
 * Import Page Loading Skeleton
 * Shown while the import page is loading (server-side auth + data fetching)
 */

import { Upload, Loader2 } from 'lucide-react';

export default function ImportLoading() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0">
      {/* Header skeleton */}
      <div className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 h-16" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Page Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-rh-green/10">
            <Upload className="h-6 w-6 text-rh-green" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Import Trades
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Import trades from your brokerage
            </p>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-8 w-8 text-rh-green animate-spin" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading import options...
          </p>
        </div>

        {/* Placeholder cards */}
        <div className="space-y-4 opacity-50">
          <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>
      </div>
    </main>
  );
}
