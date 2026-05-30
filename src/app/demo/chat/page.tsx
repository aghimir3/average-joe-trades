/**
 * Demo chat placeholder page.
 *
 * Chat requires real-time AI API calls (Anthropic tokens),
 * so it's gated in demo mode with a sign-up CTA.
 */

import type { Metadata } from 'next';
import { DemoFeatureGate } from '@/components/demo/demo-feature-gate';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo Chat',
  description: 'Joey AI trading assistant — available with a free account.',
  robots: { index: false, follow: false },
};

export default function DemoChatPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <DemoFeatureGate
        feature="Ask Joey"
        description="Joey is a real-time AI trading assistant that uses live API calls. Sign up for a free account to chat with Joey about your trades, positions, and strategies."
      />
    </main>
  );
}
