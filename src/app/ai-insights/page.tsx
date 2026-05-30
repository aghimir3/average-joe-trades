/**
 * AI Insights page - AI-powered trading command center.
 *
 * Displays:
 * - AI Command Center hero with aggregate stats
 * - Actionable recommendations from ML models
 * - Personal model insights (wheel + options)
 * - Community aggregated wisdom
 * - Model training and management
 *
 * Uses TanStack Query for data fetching with real-time updates.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { AIInsightsClient } from '@/components/ai-insights/ai-insights-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

/**
 * SEO metadata for AI insights page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'AI Insights',
  description: 'AI-powered trading insights, recommendations, and model management.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function AIInsightsPage() {
  // Require authentication
  const user = await requireAuth('/ai-insights');

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-3 py-4 sm:px-4 lg:px-6">
      <AIInsightsClient />
    </AppPageShell>
  );
}
