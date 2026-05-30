/**
 * Demo dashboard page.
 *
 * Uses a tabbed layout instead of collapsible sections for a cleaner,
 * less busy experience. Stats cards stay as a persistent overview;
 * tabs let users focus on one section at a time.
 *
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { DemoTabbedDashboard } from '@/components/demo/demo-tabbed-dashboard';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Dashboard',
  description: 'Explore a live demo of Average Joe Trades — your personal trading dashboard with P&L analytics, positions, and real-time sync.',
  robots: { index: false, follow: false },
};

export default function DemoDashboardPage() {
  return (
    <main className="relative min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 overflow-x-hidden pt-10">
      {/* Futuristic background — radial gradient + dot grid (dark mode only) */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08)_0%,transparent_50%)] opacity-0 dark:opacity-100" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 -z-10 demo-dot-grid opacity-0 dark:opacity-100" aria-hidden="true" />
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="px-4 pt-2 pb-6 sm:px-6 lg:px-8">
        <DemoTabbedDashboard />
      </div>
    </main>
  );
}
