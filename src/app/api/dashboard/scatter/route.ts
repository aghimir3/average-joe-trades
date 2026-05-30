import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Scatter Plot API route handler.
 *
 * Returns data for:
 * - Open positions scatter (entry date vs entry price)
 * - Closed trades scatter (close date vs P&L)
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardScatter } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
});

/**
 * GET /api/dashboard/scatter
 *
 * Returns data for scatter plot visualizations.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching dashboard scatter data');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard scatter data');
      return apiJson({ data: sampleDashboardScatter() });
    }

    // Build where clauses
    const positionWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      quantity: { gt: 0 },
    };

    const closeWhere: Prisma.RealizedCloseWhereInput = { userId };

    if (brokerageAccountId) {
      positionWhere.brokerageAccountId = brokerageAccountId;
      closeWhere.brokerageAccountId = brokerageAccountId;
    }

    if (startDate || endDate) {
      closeWhere.closeDate = {};
      if (startDate) closeWhere.closeDate.gte = startDate;
      if (endDate) closeWhere.closeDate.lte = endDate;
    }

    // Fetch data in parallel
    const [openPositions, closedTrades] = await Promise.all([
      prisma.derivedPosition.findMany({
        where: positionWhere,
        select: {
          id: true,
          symbol: true,
          positionType: true,
          side: true,
          quantity: true,
          avgPrice: true,
          costBasis: true,
          firstEntryDate: true,
          optionType: true,
          strike: true,
          expiration: true,
        },
        orderBy: { firstEntryDate: 'asc' },
        take: 200, // Limit for performance
      }),
      prisma.realizedClose.findMany({
        where: closeWhere,
        select: {
          id: true,
          symbol: true,
          closeType: true,
          side: true,
          quantity: true,
          realizedPnL: true,
          closeDate: true,
          closePrice: true,
          openPrice: true,
          hasUnknownBasis: true,
        },
        orderBy: { closeDate: 'desc' },
        take: 500, // Limit for performance
      }),
    ]);

    // Format open positions for scatter
    const openScatter = openPositions.map(p => ({
      id: p.id,
      symbol: p.symbol,
      type: p.positionType,
      side: p.side,
      quantity: p.quantity.toNumber(),
      avgPrice: p.avgPrice.toNumber(),
      costBasis: p.costBasis.toNumber(),
      entryDate: p.firstEntryDate.toISOString().split('T')[0],
      entryTimestamp: p.firstEntryDate.getTime(),
      optionType: p.optionType,
      strike: p.strike?.toNumber() ?? null,
      expiration: p.expiration?.toISOString().split('T')[0] ?? null,
    }));

    // Format closed trades for scatter
    const closedScatter = closedTrades.map(c => ({
      id: c.id,
      symbol: c.symbol,
      type: c.closeType,
      side: c.side,
      quantity: c.quantity.toNumber(),
      pnl: c.realizedPnL.toNumber(),
      closeDate: c.closeDate.toISOString().split('T')[0],
      closeTimestamp: c.closeDate.getTime(),
      openPrice: c.openPrice.toNumber(),
      closePrice: c.closePrice.toNumber(),
      isWin: c.realizedPnL.toNumber() > 0,
      isLoss: c.realizedPnL.toNumber() < 0,
      hasUnknownBasis: c.hasUnknownBasis,
    }));

    // Calculate axis ranges for open positions
    const openPrices = openScatter.map(p => p.avgPrice);
    const openDates = openScatter.map(p => p.entryTimestamp);

    // Calculate axis ranges for closed trades
    const closedPnLs = closedScatter.map(c => c.pnl);
    const closedDates = closedScatter.map(c => c.closeTimestamp);

    log.info({ userId, openCount: openScatter.length, closedCount: closedScatter.length }, 'Dashboard scatter fetched');

    return apiJson({
      data: {
        openPositions: {
          points: openScatter,
          meta: {
            count: openScatter.length,
            priceRange: openPrices.length > 0 ? {
              min: Math.min(...openPrices),
              max: Math.max(...openPrices),
            } : null,
            dateRange: openDates.length > 0 ? {
              min: new Date(Math.min(...openDates)).toISOString().split('T')[0],
              max: new Date(Math.max(...openDates)).toISOString().split('T')[0],
            } : null,
          },
        },
        closedTrades: {
          points: closedScatter,
          meta: {
            count: closedScatter.length,
            pnlRange: closedPnLs.length > 0 ? {
              min: Math.min(...closedPnLs),
              max: Math.max(...closedPnLs),
            } : null,
            dateRange: closedDates.length > 0 ? {
              min: new Date(Math.min(...closedDates)).toISOString().split('T')[0],
              max: new Date(Math.max(...closedDates)).toISOString().split('T')[0],
            } : null,
            wins: closedScatter.filter(c => c.isWin).length,
            losses: closedScatter.filter(c => c.isLoss).length,
          },
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch dashboard scatter');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch scatter data' },
      { status: 500 }
    );
  }
}

