import { apiJson } from '@/lib/api/response';
/**
 * Brokerage Accounts API route handler.
 *
 * Handles:
 * - GET /api/accounts - List brokerage accounts for authenticated user
 * - POST /api/accounts - Create a new brokerage account
 *
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { BROKERS } from '@/lib/importers/types';

/**
 * Schema for creating a brokerage account.
 */
const createAccountSchema = z.object({
  broker: z.enum(BROKERS),
  name: z.string().min(1).max(100),
  externalAccountId: z.string().max(255).optional(),
  currency: z.string().length(3).default('USD'),
  isDefault: z.boolean().default(false),
});

/**
 * Schema for listing accounts query params.
 */
const listAccountsQuerySchema = z.object({
  includeInactive: z.string().transform(v => v === 'true').optional(),
});

/**
 * GET /api/accounts
 *
 * List brokerage accounts for the authenticated user.
 *
 * Query parameters:
 * - includeInactive: Include inactive accounts (default false)
 *
 * @returns List of brokerage accounts with summary stats
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
    log.info({ userId }, 'Fetching brokerage accounts');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = listAccountsQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      log.warn({ errors: validatedQuery.error.flatten() }, 'Invalid query parameters');
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validatedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { includeInactive } = validatedQuery.data;

    // Build where clause
    const where: {
      userId: string;
      isActive?: boolean;
    } = { userId };

    if (!includeInactive) {
      where.isActive = true;
    }

    // Fetch accounts with summary stats
    const accounts = await prisma.brokerageAccount.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' }, // Default account first
        { createdAt: 'asc' },
      ],
      include: {
        _count: {
          select: {
            ledgerEvents: {
              where: { deletedAt: null },
            },
            importBatches: true,
          },
        },
      },
    });

    // Get account IDs for batch queries
    const accountIds = accounts.map(a => a.id);

    // Batch fetch position counts and P&L in 2 queries instead of 2N queries (fixes N+1)
    const [positionCounts, pnlSums] = await Promise.all([
      // Get open position counts per account
      prisma.derivedPosition.groupBy({
        by: ['brokerageAccountId'],
        where: {
          brokerageAccountId: { in: accountIds },
          quantity: { gt: 0 },
        },
        _count: { id: true },
      }),
      // Get total realized P&L per account
      prisma.realizedClose.groupBy({
        by: ['brokerageAccountId'],
        where: {
          brokerageAccountId: { in: accountIds },
        },
        _sum: { realizedPnL: true },
      }),
    ]);

    // Build maps for O(1) lookup
    const positionCountMap = new Map(
      positionCounts.map(p => [p.brokerageAccountId, p._count.id])
    );
    const pnlMap = new Map(
      pnlSums.map(p => [p.brokerageAccountId, p._sum.realizedPnL?.toNumber() ?? 0])
    );

    // Combine accounts with stats
    const accountsWithStats = accounts.map(account => ({
      ...account,
      stats: {
        ledgerEventCount: account._count.ledgerEvents,
        importBatchCount: account._count.importBatches,
        openPositionCount: positionCountMap.get(account.id) ?? 0,
        totalRealizedPnL: pnlMap.get(account.id) ?? 0,
      },
      _count: undefined, // Remove the raw count
    }));

    log.info({ userId, count: accounts.length }, 'Brokerage accounts fetched successfully');

    return apiJson({
      data: accountsWithStats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch brokerage accounts');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch brokerage accounts',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounts
 *
 * Create a new brokerage account.
 *
 * @returns Created brokerage account
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Creating brokerage account');

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validatedData = createAccountSchema.safeParse(body);
    if (!validatedData.success) {
      log.warn({ errors: validatedData.error.flatten() }, 'Validation failed');
      return apiJson(
        { error: 'Bad Request', message: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const data = validatedData.data;

    // Check for duplicate external account ID for the same broker (only check active accounts)
    if (data.externalAccountId) {
      const existing = await prisma.brokerageAccount.findFirst({
        where: {
          userId,
          broker: data.broker,
          externalAccountId: data.externalAccountId,
          isActive: true, // Only check active accounts to allow re-linking
        },
      });

      if (existing) {
        return apiJson(
          { error: 'Conflict', message: 'An account with this external ID already exists for this broker' },
          { status: 409 }
        );
      }
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await prisma.brokerageAccount.updateMany({
        where: {
          userId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create the account
    const createdAccount = await prisma.brokerageAccount.create({
      data: {
        userId,
        broker: data.broker,
        name: data.name,
        externalAccountId: data.externalAccountId,
        currency: data.currency,
        isDefault: data.isDefault,
        isActive: true,
      },
    });

    log.info({ accountId: createdAccount.id, broker: data.broker }, 'Brokerage account created successfully');

    return apiJson({ data: createdAccount }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to create brokerage account');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to create brokerage account',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

