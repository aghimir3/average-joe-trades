import { apiJson } from '@/lib/api/response';
/**
 * Single Brokerage Account API route handler.
 *
 * Handles:
 * - GET /api/accounts/[id] - Get account details
 * - PATCH /api/accounts/[id] - Update account
 * - DELETE /api/accounts/[id] - Deactivate account (soft delete)
 *
 * All routes are protected - requires authenticated session.
 */


import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { fullRederivation } from '@/lib/services/derivation-runner';

/**
 * Schema for updating a brokerage account.
 */
const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  externalAccountId: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  currency: z.string().length(3).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/accounts/[id]
 *
 * Get details of a specific brokerage account.
 *
 * @returns Account details with summary stats
 */
export async function GET(
  request: Request,
  { params }: RouteParams
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    const { id: accountId } = await params;

    log.info({ userId, accountId }, 'Fetching brokerage account details');

    // Fetch account with stats
    const account = await prisma.brokerageAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
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

    if (!account) {
      return apiJson(
        { error: 'Not Found', message: 'Brokerage account not found' },
        { status: 404 }
      );
    }

    // Get detailed stats
    const [openPositions, closedTrades, totalPnL, recentImport] = await Promise.all([
      prisma.derivedPosition.findMany({
        where: {
          brokerageAccountId: accountId,
          quantity: { gt: 0 },
        },
        select: {
          symbol: true,
          positionType: true,
          quantity: true,
          avgPrice: true,
          side: true,
        },
      }),
      prisma.realizedClose.count({
        where: { brokerageAccountId: accountId },
      }),
      prisma.realizedClose.aggregate({
        where: { brokerageAccountId: accountId },
        _sum: { realizedPnL: true },
      }),
      prisma.importBatch.findFirst({
        where: { brokerageAccountId: accountId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          status: true,
          importedEvents: true,
          createdAt: true,
        },
      }),
    ]);

    const accountWithStats = {
      ...account,
      stats: {
        ledgerEventCount: account._count.ledgerEvents,
        importBatchCount: account._count.importBatches,
        openPositionCount: openPositions.length,
        closedTradeCount: closedTrades,
        totalRealizedPnL: totalPnL._sum.realizedPnL?.toNumber() || 0,
      },
      openPositions,
      recentImport,
      _count: undefined,
    };

    log.info({ userId, accountId }, 'Brokerage account details fetched');

    return apiJson({ data: accountWithStats });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to fetch brokerage account details');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch account details',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/accounts/[id]
 *
 * Update a brokerage account.
 *
 * @returns Updated account
 */
export async function PATCH(
  request: Request,
  { params }: RouteParams
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    const { id: accountId } = await params;

    log.info({ userId, accountId }, 'Updating brokerage account');

    // Verify ownership
    const existingAccount = await prisma.brokerageAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (!existingAccount) {
      return apiJson(
        { error: 'Not Found', message: 'Brokerage account not found' },
        { status: 404 }
      );
    }

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

    const validatedData = updateAccountSchema.safeParse(body);
    if (!validatedData.success) {
      log.warn({ errors: validatedData.error.flatten() }, 'Validation failed');
      return apiJson(
        { error: 'Bad Request', message: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const data = validatedData.data;

    // If setting as default, unset other defaults
    if (data.isDefault === true) {
      await prisma.brokerageAccount.updateMany({
        where: {
          userId,
          isDefault: true,
          id: { not: accountId },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Prevent unsetting the only default account
    if (data.isDefault === false && existingAccount.isDefault) {
      const otherActiveAccounts = await prisma.brokerageAccount.count({
        where: {
          userId,
          id: { not: accountId },
          isActive: true,
        },
      });

      if (otherActiveAccounts === 0) {
        return apiJson(
          { error: 'Bad Request', message: 'Cannot unset default - no other active accounts exist' },
          { status: 400 }
        );
      }
    }

    // If deactivating the account, clean up cached broker data
    const isDeactivating = data.isActive === false && existingAccount.isActive === true;

    if (isDeactivating) {
      log.info({ accountId }, 'Deactivating account - cleaning up cached broker data');

      // Delete cached SnapTrade data in a transaction
      await prisma.$transaction([
        prisma.brokerPosition.deleteMany({
          where: { brokerageAccountId: accountId },
        }),
        prisma.brokerBalance.deleteMany({
          where: { brokerageAccountId: accountId },
        }),
        prisma.brokerReturnRate.deleteMany({
          where: { brokerageAccountId: accountId },
        }),
      ]);

      log.info({ accountId }, 'Cleaned up cached broker data for deactivated account');
    }

    const updateData: {
      name?: string;
      externalAccountId?: string | null;
      currency?: string;
      isDefault?: boolean;
      isActive?: boolean;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.externalAccountId !== undefined) updateData.externalAccountId = data.externalAccountId;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (Object.keys(updateData).length === 0) {
      return apiJson({
        data: existingAccount,
      });
    }

    // Update the account
    const updatedAccount = await prisma.brokerageAccount.update({
      where: { id: accountId },
      data: updateData,
    });

    log.info({ accountId, isDeactivating }, 'Brokerage account updated successfully');

    return apiJson({ data: updatedAccount });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to update brokerage account');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to update account',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/accounts/[id]
 *
 * Delete a brokerage account and all its associated data.
 * This soft-deletes ledger events and removes derived data (positions, closes, aggregates).
 * Re-derivation is run to update the aggregated view.
 *
 * @returns Success message with deletion stats
 */
export async function DELETE(
  request: Request,
  { params }: RouteParams
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    const { id: accountId } = await params;

    log.info({ userId, accountId }, 'Deleting brokerage account');

    // Verify ownership
    const account = await prisma.brokerageAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      return apiJson(
        { error: 'Not Found', message: 'Brokerage account not found' },
        { status: 404 }
      );
    }

    // Check if this is the only account or the default
    if (account.isDefault) {
      const otherActiveAccounts = await prisma.brokerageAccount.findFirst({
        where: {
          userId,
          id: { not: accountId },
          isActive: true,
        },
      });

      if (!otherActiveAccounts) {
        return apiJson(
          { error: 'Bad Request', message: 'Cannot delete the only active account' },
          { status: 400 }
        );
      }

      // Transfer default status to another account
      await prisma.brokerageAccount.update({
        where: { id: otherActiveAccounts.id },
        data: { isDefault: true },
      });
    }

    // Delete all associated data in a transaction
    const deletionResult = await prisma.$transaction(async (tx) => {
      // 1. Delete PositionLedgerLinks that reference this account's data
      // First, get all position and close IDs for this account
      const positionIds = await tx.derivedPosition.findMany({
        where: { brokerageAccountId: accountId },
        select: { id: true },
      });
      const closeIds = await tx.realizedClose.findMany({
        where: { brokerageAccountId: accountId },
        select: { id: true },
      });

      // Delete links
      const linksDeleted = await tx.positionLedgerLink.deleteMany({
        where: {
          OR: [
            { positionId: { in: positionIds.map(p => p.id) } },
            { realizedCloseId: { in: closeIds.map(c => c.id) } },
          ],
        },
      });

      // 2. Delete derived positions for this account
      const positionsDeleted = await tx.derivedPosition.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 3. Delete realized closes for this account
      const closesDeleted = await tx.realizedClose.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 4. Delete daily aggregates for this account
      const aggregatesDeleted = await tx.dailyAggregate.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 5. Delete cached SnapTrade data (positions, balances, return rates)
      await tx.brokerPosition.deleteMany({
        where: { brokerageAccountId: accountId },
      });
      await tx.brokerBalance.deleteMany({
        where: { brokerageAccountId: accountId },
      });
      await tx.brokerReturnRate.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 6. Delete trading goals for this account
      await tx.tradingGoal.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 7. Soft-delete all ledger events for this account and clear batch reference
      const eventsDeleted = await tx.ledgerEvent.updateMany({
        where: {
          brokerageAccountId: accountId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          importBatchId: null, // Clear reference to allow batch deletion
        },
      });

      // 7a. Also clear importBatchId on any previously soft-deleted events
      // (handles edge case where events were deleted before this fix)
      await tx.ledgerEvent.updateMany({
        where: {
          brokerageAccountId: accountId,
          deletedAt: { not: null },
          importBatchId: { not: null },
        },
        data: {
          importBatchId: null,
        },
      });

      // 8. Delete import batches for this account
      const batchesDeleted = await tx.importBatch.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 9. Delete portfolio policy for this account
      await tx.portfolioPolicy.deleteMany({
        where: { brokerageAccountId: accountId },
      });

      // 10. Deactivate the account (soft delete) and clear external IDs to allow re-linking
      await tx.brokerageAccount.update({
        where: { id: accountId },
        data: {
          isActive: false,
          isDefault: false,
          externalAccountId: null, // Clear so account can be re-linked
          brokerageAuthorizationId: null, // Clear authorization reference
        },
      });

      return {
        linksDeleted: linksDeleted.count,
        positionsDeleted: positionsDeleted.count,
        closesDeleted: closesDeleted.count,
        aggregatesDeleted: aggregatesDeleted.count,
        eventsDeleted: eventsDeleted.count,
        batchesDeleted: batchesDeleted.count,
      };
    });

    log.info({ accountId, ...deletionResult }, 'Brokerage account data deleted');

    // Re-derive to update aggregated views (all-accounts rollup)
    if (deletionResult.eventsDeleted > 0) {
      log.info({ userId }, 'Running re-derivation after account deletion');
      try {
        await fullRederivation(prisma, userId);
        log.info({ userId }, 'Re-derivation completed');
      } catch (derivationError) {
        log.error({ error: derivationError }, 'Re-derivation failed after account deletion');
        // Don't fail - data is already deleted
      }
    }

    return apiJson({
      data: {
        success: true,
        stats: deletionResult,
      },
      message: `Account deleted successfully. ${deletionResult.eventsDeleted} trades removed.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error({
      errorMessage,
      userId,
      correlationId,
    }, 'Failed to delete brokerage account');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to delete account',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
