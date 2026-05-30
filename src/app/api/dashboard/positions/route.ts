import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Positions API route handler.
 *
 * Returns open positions formatted for dashboard display,
 * grouped by stocks and options.
 */


import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardPositions } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
});

/**
 * GET /api/dashboard/positions
 *
 * Returns open positions grouped by type (stocks vs options) for portfolio display.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching dashboard positions');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard positions');
      return apiJson({ data: sampleDashboardPositions() });
    }

    const where: Prisma.DerivedPositionWhereInput = {
      userId,
      quantity: { gt: 0 },
    };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    const positions = await prisma.derivedPosition.findMany({
      where,
      include: {
        brokerageAccount: {
          select: { id: true, name: true, broker: true },
        },
      },
      orderBy: [{ symbol: 'asc' }, { firstEntryDate: 'asc' }],
    });

    const futurePositions = await prisma.brokerPosition.findMany({
      where: {
        userId,
        positionType: 'future',
        isStale: false,
        quantity: { not: new Prisma.Decimal(0) },
        ...(brokerageAccountId ? { brokerageAccountId } : {}),
      },
      include: {
        brokerageAccount: {
          select: { id: true, name: true, broker: true },
        },
      },
      orderBy: [{ symbol: 'asc' }, { lastSyncAt: 'desc' }],
    });

    // Group by stock/option
    const stocks = positions
      .filter(p => p.positionType === 'stock')
      .map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity.toNumber(),
        avgPrice: p.avgPrice.toNumber(),
        costBasis: p.costBasis.toNumber(),
        firstEntryDate: p.firstEntryDate.toISOString(),
        account: p.brokerageAccount,
      }));

    const options = positions
      .filter(p => p.positionType === 'option')
      .map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity.toNumber(),
        avgPrice: p.avgPrice.toNumber(),
        costBasis: p.costBasis.toNumber(),
        optionType: p.optionType,
        strike: p.strike?.toNumber() ?? null,
        expiration: p.expiration?.toISOString().split('T')[0] ?? null,
        firstEntryDate: p.firstEntryDate.toISOString(),
        strategy: p.strategy,
        account: p.brokerageAccount,
      }));

    const derivedFutures = positions
      .filter(p => p.positionType === 'future')
      .map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity.toNumber(),
        avgPrice: p.avgPrice.toNumber(),
        costBasis: p.costBasis.toNumber(),
        firstEntryDate: p.firstEntryDate.toISOString(),
        account: p.brokerageAccount,
      }));

    const futures = [
      ...derivedFutures,
      ...futurePositions.map(p => {
        const rawQty = p.quantity.toNumber();
        const quantity = Math.abs(rawQty);
        const avgPrice = p.avgCostBasis?.toNumber() ?? p.marketPrice?.toNumber() ?? 0;
        return {
          id: p.id,
          symbol: p.symbol,
          side: rawQty < 0 ? 'short' : 'long',
          quantity,
          avgPrice,
          costBasis: Math.abs(quantity * avgPrice),
          firstEntryDate: p.lastSyncAt.toISOString(),
          account: p.brokerageAccount,
        };
      }),
    ];

    // Calculate totals
    const stockCostBasis = stocks.reduce((sum, s) => sum + s.costBasis, 0);
    const optionCostBasis = options.reduce((sum, o) => sum + o.costBasis, 0);
    const futureCostBasis = futures.reduce((sum, f) => sum + f.costBasis, 0);

    log.info({
      userId,
      stockCount: stocks.length,
      optionCount: options.length,
      futureCount: futures.length,
    }, 'Dashboard positions fetched');

    return apiJson({
      data: {
        stocks,
        options,
        futures,
        summary: {
          stockCount: stocks.length,
          optionCount: options.length,
          futureCount: futures.length,
          stockCostBasis: Math.round(stockCostBasis * 100) / 100,
          optionCostBasis: Math.round(optionCostBasis * 100) / 100,
          futureCostBasis: Math.round(futureCostBasis * 100) / 100,
          totalCostBasis: Math.round((stockCostBasis + optionCostBasis + futureCostBasis) * 100) / 100,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch dashboard positions');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

