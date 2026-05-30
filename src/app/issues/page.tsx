/**
 * Import Issues Page
 *
 * Displays import issues like unknown basis trades and allows resolution.
 * Features:
 * - List of unresolved issues
 * - Filter by type/severity
 * - Resolution form for unknown basis issues
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for issues page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Import Issues',
  description: 'Review and resolve issues from your trade imports.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { IssuesClient } from '@/components/issues/issues-client';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AlertTriangle } from 'lucide-react';

export default async function IssuesPage() {
  const user = await requireAuth('/issues');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="medium" contentClassName="py-8">
      <PageHeader
        title="Import Issues"
        description="Review and resolve issues from your trade imports."
        icon={AlertTriangle}
        accent="amber"
      />
      <IssuesClient />
    </AppPageShell>
  );
}
