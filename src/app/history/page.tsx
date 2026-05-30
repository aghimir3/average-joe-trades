/**
 * History Page
 *
 * Unified view of trade history and journal entries.
 * Shows closed trades with Win/Loss/BE badges and return %,
 * plus journal entries in chronological order (newest first).
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { HistoryClient } from '@/components/history/history-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

export const metadata: Metadata = {
  title: 'History',
  description: 'View your complete trade history and journal entries.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function HistoryPage() {
  const user = await requireAuth('/history');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-3 py-4 sm:px-4 lg:px-6 lg:pr-6">
      <HistoryClient />
    </AppPageShell>
  );
}
