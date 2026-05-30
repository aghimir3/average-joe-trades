/**
 * Demo positions page.
 *
 * Mirrors /positions but skips authentication.
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { PositionsClient } from '@/components/positions/positions-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Positions',
  description: 'Explore a live demo of real-time position tracking with multi-broker sync.',
  robots: { index: false, follow: false },
};

export default function DemoPositionsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <PositionsClient />
      </div>
    </main>
  );
}
