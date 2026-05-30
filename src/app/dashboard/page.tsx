/**
 * Dashboard page - main view for authenticated users.
 *
 * Displays:
 * - Stats cards (P&L, win rate, etc.)
 * - P&L chart over time
 * - Recent trades table
 * - Add trade buttons
 *
 * Uses TanStack Query for data fetching with real-time updates.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for dashboard - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your personal trading dashboard. View P&L analytics, track positions, and manage your portfolio.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

export default async function DashboardPage() {
  // Require authentication
  const user = await requireAuth('/dashboard');

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="pt-2 pb-6">
      <DashboardClient />
    </AppPageShell>
  );
}
