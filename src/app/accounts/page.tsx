/**
 * Accounts Management Page
 *
 * Allows users to create, view, and manage their brokerage accounts.
 * Each account can have its own dashboard and import history.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for accounts page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Accounts',
  description: 'Manage your brokerage accounts. Connect and sync multiple brokers in one place.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { AccountsClient } from '@/components/accounts/accounts-client';

export default async function AccountsPage() {
  const user = await requireAuth('/accounts');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="medium" contentClassName="py-6 sm:py-8">
      <AccountsClient />
    </AppPageShell>
  );
}
