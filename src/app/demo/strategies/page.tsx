/**
 * Demo strategies page.
 *
 * Mirrors /strategies but skips authentication.
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { StrategiesClient } from '@/components/strategies/strategies-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Strategies',
  description: 'Explore wheel strategy tracking, income analysis, and AI-powered options insights.',
  robots: { index: false, follow: false },
};

export default function DemoStrategiesPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 overflow-x-hidden pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="px-3 py-4 sm:px-4 lg:px-6 lg:pr-6">
        <StrategiesClient />
      </div>
    </main>
  );
}
