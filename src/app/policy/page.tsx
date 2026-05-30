/**
 * Portfolio Policy Page
 *
 * Allows users to define their trading rules, risk management,
 * and investment policy per brokerage account.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { PolicyClient } from '@/components/policy/policy-client';

/**
 * SEO metadata for portfolio policy page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Portfolio Policy',
  description: 'Define your trading rules, risk management, and investment policy.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function PolicyPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/');
  }

  return (
    <AppPageShell user={session.user} width="medium" contentClassName="py-6">
      <PolicyClient />
    </AppPageShell>
  );
}
