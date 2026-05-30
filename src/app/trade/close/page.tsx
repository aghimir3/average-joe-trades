/**
 * Close Trade Page
 *
 * Allows users to select and close open positions.
 * Displays list of open positions and provides forms for closing.
 */

import { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { CloseTradeClient } from '@/components/forms/close-trade-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

/**
 * SEO metadata for close trade page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Close Trade',
  description: 'Close an open trading position.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function CloseTradePagePage() {
  const user = await requireAuth();
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="medium" contentClassName="py-8">
      <CloseTradeClient />
    </AppPageShell>
  );
}
