/**
 * Strategies page - trading strategies hub.
 *
 * Displays:
 * - Wheel Strategy with Income Analysis, Dashboard, AI Insights, Ticker Deep Dive
 * - Options Scanner for finding wheel-suitable contracts
 *
 * Uses TanStack Query for data fetching with real-time updates.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { StrategiesClient } from '@/components/strategies/strategies-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

/**
 * SEO metadata for strategies page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Strategies',
  description: 'Explore trading strategies including Wheel Strategy, Income Analysis, and Options Scanner.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function StrategiesPage() {
  // Require authentication
  const user = await requireAuth('/strategies');

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-3 py-4 sm:px-4 lg:px-6 lg:pr-6">
      <StrategiesClient />
    </AppPageShell>
  );
}
