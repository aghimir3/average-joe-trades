import { apiJson } from '@/lib/api/response';
/**
 * Realized Closes API route handler.
 *
 * Handles:
 * - GET /api/closes - List realized closes (closed trades) for authenticated user
 *
 * Realized closes are derived from LedgerEvents via FIFO matching
 * and stored in RealizedClose.
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';

/**
 * Schema for listing closes query params.
 */
const listClosesQuerySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  symbol: z.string().optional(),
  closeType: z.enum(['stock', 'option', 'future']).optional(),
  closeReason: z.enum(['normal', 'expired', 'assigned']).optional(),
  startDate: z.string().datetime().transform(s => new Date(s)).optional(),
  endDate: z.string().datetime().transform(s => new Date(s)).optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * GET /api/closes
 *
 * List realized closes (closed trades) for the authenticated user.
 *
 * Query parameters:
 * - brokerageAccountId: Filter by account (optional, defaults to all accounts)
 * - symbol: Filter by symbol
 * - closeType: 'stock' | 'option' | 'future'
 * - closeReason: 'normal' | 'expired' | 'assigned'
 * - startDate: Filter by close date (ISO string)
 * - endDate: Filter by close date (ISO string)
 * - limit: Number of results (default 100, max 500)
 * - offset: Pagination offset
 *
 * @returns List of realized closes with P&L details
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching realized closes');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = listClosesQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      log.warn({ errors: validatedQuery.error.flatten() }, 'Invalid query parameters');
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validatedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { brokerageAccountId, symbol, closeType, closeReason, startDate, endDate, limit, offset } = validatedQuery.data;

    // Build where clause
    const where: Prisma.RealizedCloseWhereInput = { userId };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    if (symbol) {
      where.symbol = symbol.toUpperCase();
    }

    if (closeType) {
      where.closeType = closeType;
    }

    if (closeReason) {
      where.closeReason = closeReason;
    }

    if (startDate || endDate) {
      where.closeDate = {};
      if (startDate) where.closeDate.gte = startDate;
      if (endDate) where.closeDate.lte = endDate;
    }

    log.debug({ where, limit, offset }, 'Executing closes query');

    // Fetch closes with account info
    const [closes, total] = await Promise.all([
      prisma.realizedClose.findMany({
        where,
        include: {
          brokerageAccount: {
            select: {
              id: true,
              name: true,
              broker: true,
            },
          },
        },
        orderBy: { closeDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.realizedClose.count({ where }),
    ]);

    // Calculate summary stats
    const stats = await prisma.realizedClose.aggregate({
      where,
      _sum: { realizedPnL: true },
      _count: true,
      _avg: { realizedPnL: true },
    });

    const winCount = await prisma.realizedClose.count({
      where: {
        ...where,
        realizedPnL: { gt: 0 },
        hasUnknownBasis: false,
      },
    });

    const lossCount = await prisma.realizedClose.count({
      where: {
        ...where,
        realizedPnL: { lt: 0 },
        hasUnknownBasis: false,
      },
    });

    const knownBasisCount = winCount + lossCount;
    const winRate = knownBasisCount > 0 ? (winCount / knownBasisCount) * 100 : 0;

    log.info({ userId, count: closes.length, total }, 'Realized closes fetched successfully');

    return apiJson({
      data: closes.map(c => ({
        ...c,
        quantity: c.quantity.toNumber(),
        openPrice: c.openPrice.toNumber(),
        closePrice: c.closePrice.toNumber(),
        realizedPnL: c.realizedPnL.toNumber(),
        strike: c.strike?.toNumber() ?? null,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + closes.length < total,
      },
      summary: {
        totalPnL: stats._sum?.realizedPnL?.toNumber() || 0,
        avgPnL: stats._avg?.realizedPnL?.toNumber() || 0,
        totalTrades: stats._count,
        winCount,
        lossCount,
        winRate: Math.round(winRate * 100) / 100,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch realized closes');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch realized closes',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

