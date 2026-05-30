import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Bulk Delete Ledger Events API
 *
 * DELETE /api/entries/bulk-delete - Delete ledger events within a date range for an account
 * POST /api/entries/bulk-delete - Preview deletion (get count without deleting)
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { z } from 'zod';
import { bulkDeleteRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const bulkDeleteSchema = z.object({
  brokerageAccountId: z.string().uuid('Invalid account ID'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD format'),
  confirmDelete: z.boolean().optional(),
});

/**
 * POST /api/entries/bulk-delete
 * Preview: Get count of trades that would be deleted
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const { brokerageAccountId, startDate, endDate } = bulkDeleteSchema.parse(body);

    // Verify the account belongs to this user
    const account = await prisma.brokerageAccount.findFirst({
      where: {
        id: brokerageAccountId,
        userId,
        isActive: true,
      },
    });

    if (!account) {
      return apiJson(
        { error: 'Not Found', message: 'Account not found or not accessible.' },
        { status: 404 }
      );
    }

    // Parse dates
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);

    if (start > end) {
      return apiJson(
        { error: 'Validation Error', message: 'Start date must be before or equal to end date.' },
        { status: 400 }
      );
    }

    log.info(
      { userId, brokerageAccountId, startDate, endDate },
      'Previewing bulk delete'
    );

    // Get count and summary of events to be deleted
    const [totalCount, byType, dateRange, sampleEvents] = await Promise.all([
      // Total count
      prisma.ledgerEvent.count({
        where: {
          userId,
          brokerageAccountId,
          deletedAt: null,
          activityDate: {
            gte: start,
            lte: end,
          },
        },
      }),
      // Count by event type
      prisma.ledgerEvent.groupBy({
        by: ['eventType'],
        where: {
          userId,
          brokerageAccountId,
          deletedAt: null,
          activityDate: {
            gte: start,
            lte: end,
          },
        },
        _count: true,
      }),
      // Get actual date range of events
      prisma.ledgerEvent.aggregate({
        where: {
          userId,
          brokerageAccountId,
          deletedAt: null,
          activityDate: {
            gte: start,
            lte: end,
          },
        },
        _min: { activityDate: true },
        _max: { activityDate: true },
      }),
      // Sample of events for preview (first 5)
      prisma.ledgerEvent.findMany({
        where: {
          userId,
          brokerageAccountId,
          deletedAt: null,
          activityDate: {
            gte: start,
            lte: end,
          },
        },
        select: {
          id: true,
          symbol: true,
          transCode: true,
          quantity: true,
          price: true,
          activityDate: true,
          isOption: true,
          optionType: true,
          strike: true,
          expiration: true,
          sourceType: true,
        },
        orderBy: { activityDate: 'desc' },
        take: 5,
      }),
    ]);

    // Categorize by type
    const stockCount = byType.find(b => b.eventType === 'EQUITY_STOCK')?._count || 0;
    const optionCount = byType.find(b => b.eventType === 'EQUITY_OPTION')?._count || 0;
    const otherCount = totalCount - stockCount - optionCount;

    return apiJson({
      data: {
        preview: true,
        account: {
          id: account.id,
          name: account.name,
          broker: account.broker,
        },
        dateRange: {
          requested: { start: startDate, end: endDate },
          actual: {
            start: dateRange._min.activityDate?.toISOString().split('T')[0] || null,
            end: dateRange._max.activityDate?.toISOString().split('T')[0] || null,
          },
        },
        counts: {
          total: totalCount,
          stocks: stockCount,
          options: optionCount,
          other: otherCount,
        },
        sampleEvents: sampleEvents.map(e => ({
          id: e.id,
          symbol: e.symbol,
          type: e.isOption ? 'option' : 'stock',
          transCode: e.transCode,
          quantity: e.quantity,
          price: e.price ? Number(e.price) : null,
          date: e.activityDate.toISOString().split('T')[0],
          optionDetails: e.isOption ? {
            optionType: e.optionType,
            strike: e.strike ? Number(e.strike) : null,
            expiration: e.expiration?.toISOString().split('T')[0] || null,
          } : null,
          source: e.sourceType,
        })),
      },
    });
  } catch (error) {
    log.error({ error }, 'Preview bulk delete failed');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to preview deletion' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/entries/bulk-delete
 * Execute: Actually delete the trades (soft delete)
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Rate limit check - protect against abuse
    const rateLimit = bulkDeleteRateLimiter.check(userId);
    if (!rateLimit.success) {
      log.warn({ userId, remaining: rateLimit.remaining }, 'Bulk delete rate limit exceeded');
      return rateLimitResponse(rateLimit.remaining, rateLimit.resetMs);
    }

    const body = await request.json();
    const { brokerageAccountId, startDate, endDate, confirmDelete } = bulkDeleteSchema.parse(body);

    // Require explicit confirmation
    if (confirmDelete !== true) {
      return apiJson(
        { error: 'Confirmation Required', message: 'You must set confirmDelete to true to proceed.' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this user
    const account = await prisma.brokerageAccount.findFirst({
      where: {
        id: brokerageAccountId,
        userId,
        isActive: true,
      },
    });

    if (!account) {
      return apiJson(
        { error: 'Not Found', message: 'Account not found or not accessible.' },
        { status: 404 }
      );
    }

    // Parse dates
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);

    if (start > end) {
      return apiJson(
        { error: 'Validation Error', message: 'Start date must be before or equal to end date.' },
        { status: 400 }
      );
    }

    log.info(
      { userId, brokerageAccountId, startDate, endDate },
      'Starting bulk delete'
    );

    // Get event IDs to delete (for audit trail)
    const eventsToDelete = await prisma.ledgerEvent.findMany({
      where: {
        userId,
        brokerageAccountId,
        deletedAt: null,
        activityDate: {
          gte: start,
          lte: end,
        },
      },
      select: { id: true },
    });

    const eventIds = eventsToDelete.map(e => e.id);
    const deleteCount = eventIds.length;

    if (deleteCount === 0) {
      return apiJson({
        data: {
          success: true,
          message: 'No trades found in the specified date range.',
          deleted: 0,
        },
      });
    }

    // Perform deletion in a transaction
    const deletionResult = await prisma.$transaction(async (tx) => {
      // 1. Delete position ledger links referencing these events
      const deletedLinks = await tx.positionLedgerLink.deleteMany({
        where: {
          OR: [
            { openEventId: { in: eventIds } },
            { closeEventId: { in: eventIds } },
          ],
        },
      });

      // 2. Delete derived positions for this account
      const deletedPositions = await tx.derivedPosition.deleteMany({
        where: { brokerageAccountId },
      });

      // 3. Delete realized closes for this account
      const deletedCloses = await tx.realizedClose.deleteMany({
        where: { brokerageAccountId },
      });

      // 4. Delete daily aggregates for this account
      const deletedAggregates = await tx.dailyAggregate.deleteMany({
        where: { brokerageAccountId },
      });

      // 5. Hard delete the ledger events (matching events only)
      const deletedEvents = await tx.ledgerEvent.deleteMany({
        where: {
          id: { in: eventIds },
        },
      });

      return {
        links: deletedLinks.count,
        positions: deletedPositions.count,
        closes: deletedCloses.count,
        aggregates: deletedAggregates.count,
        events: deletedEvents.count,
      };
    }, {
      timeout: 120000, // 2 minutes for large deletions
    });

    log.info(
      {
        userId,
        brokerageAccountId,
        startDate,
        endDate,
        deleted: deletionResult,
      },
      'Bulk delete completed'
    );

    // Re-run derivation to rebuild positions from remaining events
    log.info('Running derivation after bulk delete');
    await fullRederivation(prisma, userId);

    return apiJson({
      data: {
        success: true,
        message: `Successfully deleted ${deletionResult.events} trades from ${account.name}.`,
        account: {
          id: account.id,
          name: account.name,
        },
        dateRange: { start: startDate, end: endDate },
        deleted: {
          events: deletionResult.events,
          positions: deletionResult.positions,
          closedTrades: deletionResult.closes,
          dailyAggregates: deletionResult.aggregates,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Bulk delete failed');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete trades' },
      { status: 500 }
    );
  }
}

