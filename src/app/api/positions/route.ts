import { apiJson } from '@/lib/api/response';
/**
 * Positions API route handler.
 *
 * Handles:
 * - GET /api/positions - List open positions for authenticated user
 *
 * Positions are derived from LedgerEvents and stored in DerivedPosition.
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';

/**
 * Schema for listing positions query params.
 */
const listPositionsQuerySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  symbol: z.string().optional(),
  positionType: z.enum(['stock', 'option', 'future']).optional(),
  includeZero: z.string().transform(v => v === 'true').optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * GET /api/positions
 *
 * List open positions for the authenticated user.
 *
 * Query parameters:
 * - brokerageAccountId: Filter by account (optional, defaults to all accounts)
 * - symbol: Filter by symbol
 * - positionType: 'stock' | 'option' | 'future'
 * - includeZero: Include zero-quantity positions (default false)
 * - limit: Number of results (default 100, max 500)
 * - offset: Pagination offset
 *
 * @returns List of positions with details
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
    log.info({ userId }, 'Fetching positions');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = listPositionsQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      log.warn({ errors: validatedQuery.error.flatten() }, 'Invalid query parameters');
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validatedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { brokerageAccountId, symbol, positionType, includeZero, limit, offset } = validatedQuery.data;

    // Build where clause
    const where: Prisma.DerivedPositionWhereInput = { userId };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    if (symbol) {
      where.symbol = symbol.toUpperCase();
    }

    if (positionType) {
      where.positionType = positionType;
    }

    if (!includeZero) {
      where.quantity = { gt: 0 };
    }

    log.debug({ where, limit, offset }, 'Executing positions query');

    // Fetch positions with account info
    const [positions, total] = await Promise.all([
      prisma.derivedPosition.findMany({
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
        orderBy: [
          { symbol: 'asc' },
          { firstEntryDate: 'asc' },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.derivedPosition.count({ where }),
    ]);

    log.info({ userId, count: positions.length, total }, 'Positions fetched successfully');

    return apiJson({
      data: positions.map(p => ({
        ...p,
        quantity: p.quantity.toNumber(),
        avgPrice: p.avgPrice.toNumber(),
        costBasis: p.costBasis.toNumber(),
        strike: p.strike?.toNumber() ?? null,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + positions.length < total,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch positions');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch positions',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

