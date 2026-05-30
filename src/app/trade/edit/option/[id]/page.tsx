/**
 * Edit Option Trade Page
 *
 * Server component that fetches existing option trade data
 * and renders the edit form. Supports editing both entry and exit
 * for closed trades when closeEventId is provided.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for edit option trade page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Edit Option Trade',
  description: 'Edit an existing option trade in your trading journal.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { EditOptionTradeForm } from '@/components/forms/edit-option-trade-form';
import { AppPageShell } from '@/components/layout/app-page-shell';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closeEventId?: string }>;
}

export default async function EditOptionTradePage({ params, searchParams }: PageProps) {
  // requireAuth redirects to login if not authenticated and returns user
  const user = await requireAuth();
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);
  const { id } = await params;
  const { closeEventId } = await searchParams;

  // Fetch the opening ledger event
  const openEvent = await prisma.ledgerEvent.findFirst({
    where: {
      id,
      userId: user.id,
      deletedAt: null,
      isOption: true, // Option only
    },
  });

  if (!openEvent) {
    notFound();
  }

  // Format opening data for the form
  const openData = {
    id: openEvent.id,
    symbol: openEvent.symbol,
    quantity: Number(openEvent.quantity),
    price: openEvent.price ? Number(openEvent.price) : null,
    activityDate: openEvent.activityDate.toISOString(),
    notes: openEvent.notes || openEvent.description,
    transCode: openEvent.transCode,
    optionType: openEvent.optionType,
    strike: openEvent.strike ? Number(openEvent.strike) : null,
    expiration: openEvent.expiration?.toISOString() || null,
    strategy: openEvent.strategy,
  };

  // Fetch closing event if closeEventId is provided
  let closeData = null;
  if (closeEventId) {
    const closeEvent = await prisma.ledgerEvent.findFirst({
      where: {
        id: closeEventId,
        userId: user.id,
        deletedAt: null,
        isOption: true,
      },
    });

    if (closeEvent) {
      closeData = {
        id: closeEvent.id,
        symbol: closeEvent.symbol,
        quantity: Number(closeEvent.quantity),
        price: closeEvent.price ? Number(closeEvent.price) : null,
        activityDate: closeEvent.activityDate.toISOString(),
        notes: closeEvent.notes || closeEvent.description,
        transCode: closeEvent.transCode,
        optionType: closeEvent.optionType,
        strike: closeEvent.strike ? Number(closeEvent.strike) : null,
        expiration: closeEvent.expiration?.toISOString() || null,
        strategy: closeEvent.strategy,
      };
    }
  }

  const isClosed = !!closeData;

  return (
    <AppPageShell
      user={user}
      issueCount={issueCount}
      width={isClosed ? 'wide' : 'narrow'}
      contentClassName="py-6 sm:py-8"
    >
      <EditOptionTradeForm initialData={openData} closeData={closeData} />
    </AppPageShell>
  );
}
