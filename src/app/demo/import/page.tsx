import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';
import { DemoFeatureGate } from '@/components/demo/demo-feature-gate';

export const metadata: Metadata = {
  title: 'Demo Import',
  robots: { index: false, follow: false },
};

export default function DemoImportPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <DemoFeatureGate
        feature="Import Trades"
        description="Import your trade history from CSV files (Robinhood, Schwab) or sync automatically via SnapTrade. Supports 5,000+ rows in seconds."
      />
    </main>
  );
}
