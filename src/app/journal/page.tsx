/**
 * Journal Page
 *
 * Trading journal for daily notes and trade-specific reflections.
 * Features:
 * - Daily pre-market and post-market journaling
 * - Trade notes linked to specific positions
 * - Health & wellness tracking (sleep, exercise, stress)
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for journal page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Document your trading thoughts, emotions, and lessons learned each day.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { JournalClient } from '@/components/journal/journal-client';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { PageHeader } from '@/components/layout/page-header';
import { BookOpen } from 'lucide-react';

export default async function JournalPage() {
  const user = await requireAuth('/journal');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="medium" contentClassName="py-8">
      <PageHeader
        title="Trading Journal"
        description="Track your daily trading thoughts, emotions, and lessons learned."
        icon={BookOpen}
        accent="emerald"
      />
      <JournalClient />
    </AppPageShell>
  );
}
