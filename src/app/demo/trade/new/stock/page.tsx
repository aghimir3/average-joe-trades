import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';
import { DemoFeatureGate } from '@/components/demo/demo-feature-gate';

export const metadata: Metadata = {
  title: 'Demo New Trade',
  robots: { index: false, follow: false },
};

export default function DemoNewStockTradePage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <DemoFeatureGate
        feature="Manual Trade Entry"
        description="Log stock and options trades manually with full details — price, quantity, date, and notes. All entries become immutable ledger records."
      />
    </main>
  );
}
