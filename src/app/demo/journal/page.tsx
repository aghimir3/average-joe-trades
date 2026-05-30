/**
 * Demo journal page.
 *
 * Mirrors /journal but skips authentication.
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { JournalClient } from '@/components/journal/journal-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Trading Journal',
  description: 'Explore the trading journal with daily pre-market notes, wellness tracking, and trade reflections.',
  robots: { index: false, follow: false },
};

export default function DemoJournalPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Trading Journal
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Track your daily trading thoughts, emotions, and lessons learned
          </p>
        </div>
        <JournalClient />
      </div>
    </main>
  );
}
