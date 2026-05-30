/**
 * Stock trade entry page.
 *
 * Protected route for entering new stock trades.
 * Redirects to login if not authenticated.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for new stock trade page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'New Stock Trade',
  description: 'Enter a new stock trade in your trading journal.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { StockTradeForm } from '@/components/forms/stock-trade-form';
import { AppPageShell } from '@/components/layout/app-page-shell';

export default async function NewStockTradePage() {
  // Require authentication
  const user = await requireAuth('/trade/new/stock');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <AppPageShell user={user} issueCount={issueCount} width="full" contentClassName="px-4 py-8 sm:px-4 lg:px-4">
      <StockTradeForm />
    </AppPageShell>
  );
}
