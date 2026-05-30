/**
 * Option trade entry page.
 *
 * Dynamic route that accepts strategy as a parameter.
 * Validates strategy against supported options.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for new option trade page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'New Option Trade',
  description: 'Enter a new option trade in your trading journal.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { OptionTradeForm } from '@/components/forms/option-trade-form';
import { AppPageShell } from '@/components/layout/app-page-shell';
import { notFound } from 'next/navigation';
import { OPTION_STRATEGIES, type OptionStrategy } from '@/db/constants';

interface PageProps {
  params: Promise<{ strategy: string }>;
}

export default async function NewOptionTradePage({ params }: PageProps) {
  // Require authentication
  const user = await requireAuth('/trade/new/option');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  const { strategy } = await params;

  // Validate strategy
  if (!OPTION_STRATEGIES.includes(strategy as OptionStrategy)) {
    notFound();
  }

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-4 py-8 sm:px-4 lg:px-4">
      <OptionTradeForm strategy={strategy as OptionStrategy} />
    </AppPageShell>
  );
}

/**
 * Generate static params for MVP strategies.
 * This enables static optimization for common strategies.
 */
export function generateStaticParams() {
  return [
    { strategy: 'long_call' },
    { strategy: 'long_put' },
    { strategy: 'covered_call' },
    { strategy: 'cash_secured_put' },
  ];
}
