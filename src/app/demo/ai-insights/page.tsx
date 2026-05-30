/**
 * Demo AI Insights page.
 *
 * Mirrors /ai-insights but skips authentication.
 * All data comes from the DemoQueryProvider cache.
 */

import type { Metadata } from 'next';
import { AIInsightsClient } from '@/components/ai-insights/ai-insights-client';
import { AppHeader } from '@/components/layout/app-header';
import { DEMO_USER } from '@/lib/demo/constants';

export const metadata: Metadata = {
  title: 'Demo AI Insights',
  description: 'Explore AI-powered trading recommendations, personal ML models, and community insights.',
  robots: { index: false, follow: false },
};

export default function DemoAIInsightsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 md:pb-0 overflow-x-hidden pt-10">
      <AppHeader user={DEMO_USER} issueCount={1} />
      <div className="px-3 py-4 sm:px-4 lg:px-6">
        <AIInsightsClient />
      </div>
    </main>
  );
}
