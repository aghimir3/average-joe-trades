/**
 * Import Page
 *
 * Allows users to upload broker CSV files to import trades.
 * Features:
 * - File upload with drag & drop
 * - CSV preview before import
 * - Batch processing status
 * - Import history with management
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for import page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Import Trades',
  description: 'Import your trades from broker CSV files or sync directly with your brokerage.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { ImportClient } from '@/components/import/import-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

export default async function ImportPage() {
  const user = await requireAuth('/import');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="medium" contentClassName="py-6 sm:py-8">
      <ImportClient />
    </AppPageShell>
  );
}
