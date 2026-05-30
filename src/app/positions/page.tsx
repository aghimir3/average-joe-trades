/**
 * Positions page - dedicated view for open positions.
 *
 * Displays the full CurrentPortfolio component with all filtering,
 * sorting, and position management features.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for positions page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Positions',
  description: 'View and manage your open trading positions. Track stocks and options with real-time data.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { PositionsClient } from '@/components/positions/positions-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

export default async function PositionsPage() {
  // Require authentication
  const user = await requireAuth('/positions');

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="wide" contentClassName="py-4">
      <PositionsClient />
    </AppPageShell>
  );
}
