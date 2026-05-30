import type { Metadata } from 'next';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';
import { DemoFeatureGate } from '@/components/demo/demo-feature-gate';

export const metadata: Metadata = {
  title: 'Demo Accounts',
  robots: { index: false, follow: false },
};

export default function DemoAccountsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <DemoFeatureGate
        feature="Accounts"
        description="Connect your Robinhood, Schwab, Fidelity, or Interactive Brokers account for automatic trade syncing and real-time portfolio tracking."
      />
    </main>
  );
}
