import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { TaxCenterClient } from '@/components/tax-center/tax-center-client';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Landmark } from 'lucide-react';

/**
 * SEO metadata for tax center page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Tax Center',
  description: 'View tax lot insights, wash sale detection, and tax-loss harvesting opportunities.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function TaxCenterPage() {
  const user = await requireAuth('/tax-center');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="wide" contentClassName="py-4">
      <PageHeader
        title="Tax Center"
        description="Capital gains insights, wash sale detection, and tax-loss harvesting."
        icon={Landmark}
        accent="blue"
      />
      <TaxCenterClient />
    </AppPageShell>
  );
}
