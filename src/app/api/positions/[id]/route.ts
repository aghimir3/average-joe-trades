import { apiJson } from '@/lib/api/response';
/**
 * Position Details API route handler.
 *
 * Returns detailed position information including all lot entries
 * (individual buy/sell transactions that make up the position).
 */


import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/positions/[id]
 *
 * Returns position details with all lot entries for scaling in/out view.
 */
export async function GET(request: Request, { params }: Params) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    const { id: positionId } = await params;

    log.info({ userId, positionId }, 'Fetching position details');

    // Get the position
    const position = await prisma.derivedPosition.findFirst({
      where: {
        id: positionId,
        userId,
      },
      include: {
        brokerageAccount: {
          select: { id: true, name: true, broker: true },
        },
      },
    });

    if (!position) {
      return apiJson(
        { error: 'Not Found', message: 'Position not found' },
        { status: 404 }
      );
    }

    // Get all ledger links for this position
    const ledgerLinks = await prisma.positionLedgerLink.findMany({
      where: {
        positionId: positionId,
      },
      include: {
        openEvent: {
          select: {
            id: true,
            activityDate: true,
            activityTime: true,
            transCode: true,
            quantity: true,
            price: true,
            amount: true,
            fees: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Build lot entries from ledger links
    const entries = ledgerLinks
      .filter(link => link.openEvent)
      .map(link => {
        const event = link.openEvent!;
        const isEntry = ['BUY', 'BTO', 'STO'].includes(event.transCode);

        return {
          id: event.id,
          date: event.activityDate.toISOString(),
          time: event.activityTime,
          action: isEntry ? 'BUY' : 'SELL',
          quantity: Number(link.quantity),
          price: event.price ? Number(event.price) : 0,
          amount: event.amount ? Number(event.amount) : 0,
          fees: event.fees ? Number(event.fees) : 0,
          transCode: event.transCode,
        };
      })
      .sort((a, b) => {
        // Sort by date, then time
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        const aTime = a.time || '00:00';
        const bTime = b.time || '00:00';
        return aTime.localeCompare(bTime);
      });

    // Calculate stats
    const totalEntries = entries.filter(e => ['BUY', 'BTO', 'STO'].includes(e.transCode)).length;
    const avgEntryPrice = position.avgPrice.toNumber();
    const totalQuantity = position.quantity.toNumber();
    const totalCostBasis = position.costBasis.toNumber();

    log.info({ userId, positionId, entryCount: entries.length }, 'Position details fetched');

    return apiJson({
      data: {
        position: {
          id: position.id,
          symbol: position.symbol,
          positionType: position.positionType,
          side: position.side,
          quantity: totalQuantity,
          avgPrice: avgEntryPrice,
          costBasis: totalCostBasis,
          optionType: position.optionType,
          strike: position.strike ? Number(position.strike) : null,
          expiration: position.expiration?.toISOString().split('T')[0] ?? null,
          strategy: position.strategy,
          firstEntryDate: position.firstEntryDate.toISOString(),
          account: position.brokerageAccount,
        },
        entries,
        stats: {
          totalEntries,
          totalQuantity,
          avgEntryPrice,
          totalCostBasis,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch position details');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch position details' },
      { status: 500 }
    );
  }
}
