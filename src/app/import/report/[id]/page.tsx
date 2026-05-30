/**
 * Import Report Page
 *
 * Shows detailed information about a specific import batch including:
 * - Import summary and status
 * - Metrics breakdown
 * - Paginated transactions for full audit
 * - Warnings and errors
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for import report page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Import Report',
  description: 'View detailed information about your trade import.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { ImportReportClient } from '@/components/import/import-report-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ImportReportPage({ params }: PageProps) {
  const user = await requireAuth('/import');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);
  const { id } = await params;

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-0 py-0 sm:px-0 lg:px-0">
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-muted-foreground">Loading import report...</div>
          </div>
        }
      >
        <ImportReportClient batchId={id} />
      </Suspense>
    </AppPageShell>
  );
}
