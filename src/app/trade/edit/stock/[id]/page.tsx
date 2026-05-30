/**
 * Edit Stock Trade Page
 *
 * Server component that fetches existing stock trade data
 * and renders the edit form. Supports editing both entry and exit
 * for closed trades when closeEventId is provided.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';

/**
 * SEO metadata for edit stock trade page - protected page.
 * Uses noindex to prevent search engine indexing of authenticated content.
 */
export const metadata: Metadata = {
  title: 'Edit Stock Trade',
  description: 'Edit an existing stock trade in your trading journal.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { EditStockTradeForm } from '@/components/forms/edit-stock-trade-form';
import { AppPageShell } from '@/components/layout/app-page-shell';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closeEventId?: string }>;
}

export default async function EditStockTradePage({ params, searchParams }: PageProps) {
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
      isOption: false, // Stock only
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
  };

  // Fetch closing event if closeEventId is provided
  let closeData = null;
  if (closeEventId) {
    const closeEvent = await prisma.ledgerEvent.findFirst({
      where: {
        id: closeEventId,
        userId: user.id,
        deletedAt: null,
        isOption: false,
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
      <EditStockTradeForm initialData={openData} closeData={closeData} />
    </AppPageShell>
  );
}
