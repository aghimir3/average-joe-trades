/**
 * Features Guide Page
 * Explains every feature of the app in a user-friendly way
 * Protected: Only accessible to logged-in users
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { FeaturesClient } from '@/components/features/features-client';
import { AppPageShell } from '@/components/layout/app-page-shell';

/**
 * SEO metadata for features guide page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Features Guide',
  description: 'Learn how to use every feature of Average Joe Trades.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function FeaturesPage() {
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user?.id) {
    redirect('/');
  }

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, session.user.id);

  return (
    <AppPageShell user={session.user} issueCount={issueCount} width="full" contentClassName="px-0 py-0 sm:px-0 lg:px-0">
      <FeaturesClient />
    </AppPageShell>
  );
}
