/**
 * Demo tax center page.
 *
 * Mirrors /tax-center but skips authentication.
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { TaxCenterClient } from '@/components/tax-center/tax-center-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';
import { Landmark } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demo Tax Center',
  description: 'Explore tax lot insights, wash sale detection, and tax-loss harvesting opportunities.',
  robots: { index: false, follow: false },
};

export default function DemoTaxCenterPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Landmark className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tax Center</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Capital gains insights, wash sale detection & tax-loss harvesting
              </p>
            </div>
          </div>
        </div>
        <TaxCenterClient />
      </div>
    </main>
  );
}
