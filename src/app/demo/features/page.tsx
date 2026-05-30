/**
 * Demo features guide page.
 *
 * Mirrors /features but skips authentication.
 * FeaturesClient uses static data only — no API calls needed.
 */

import type { Metadata } from 'next';
import { FeaturesClient } from '@/components/features/features-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Features Guide',
  description: 'Explore every feature of Average Joe Trades.',
  robots: { index: false, follow: false },
};

export default function DemoFeaturesPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <FeaturesClient />
    </main>
  );
}
