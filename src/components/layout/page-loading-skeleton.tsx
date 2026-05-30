import { Loader2 } from 'lucide-react';

/**
 * Shared loading skeleton for protected pages.
 * Used as the default export in each route's loading.tsx so that
 * Next.js can transition instantly on navigation instead of waiting
 * for the server component (requireAuth + DB queries) to finish.
 */
export function PageLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0">
      {/* Header skeleton — matches AppHeader height */}
      <div className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 h-16" />

      {/* Content area — centered spinner */}
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
      </div>
    </main>
  );
}
