/**
 * Settings Page
 *
 * User preferences and configuration options.
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { SettingsClient } from '@/components/settings/settings-client';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * SEO metadata for settings page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account settings and preferences.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-4 mt-8">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireAuth('/settings');

  // Fetch issue count for badge
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="narrow" contentClassName="py-6">
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsClient />
      </Suspense>
    </AppPageShell>
  );
}
