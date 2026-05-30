import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Account Disconnect API
 *
 * Disconnects a synced account by deleting all associated data.
 * Optionally deregisters the brokerage connection from SnapTrade itself.
 *
 * POST /api/sync/disconnect - Disconnect a synced account and delete all trades
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { isSnapTradeConfigured } from '@/lib/services/snaptrade';
import {
  removeBrokerageAuthorizationLogged,
  SNAPTRADE_SERVICE,
} from '@/lib/services/snaptrade-logged';
import { z } from 'zod';

const disconnectSchema = z.object({
  // Internal BrokerageAccount ID to disconnect
  brokerageAccountId: z.string().uuid(),
  // Confirm deletion (required for safety)
  confirmDelete: z.boolean().refine((val) => val === true, {
    message: 'You must confirm the deletion by setting confirmDelete to true',
  }),
  // If true, also deregister this brokerage connection from SnapTrade
  // This allows the user to re-connect the same broker fresh
  deregisterFromSnapTrade: z.boolean().optional().default(false),
});

/**
 * POST /api/sync/disconnect
 * Disconnect a synced account and delete all associated trades
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    const body = await request.json();
    const { brokerageAccountId, confirmDelete, deregisterFromSnapTrade } = disconnectSchema.parse(body);

    log.info({ userId, brokerageAccountId, confirmDelete, deregisterFromSnapTrade }, 'Starting account disconnect');

    // Verify the account belongs to this user and is linked to an external account
    const account = await prisma.brokerageAccount.findFirst({
      where: {
        id: brokerageAccountId,
        userId,
      },
      include: {
        _count: {
          select: {
            ledgerEvents: true,
            derivedPositions: true,
            realizedCloses: true,
          },
        },
      },
    });

    if (!account) {
      return apiJson(
        { error: 'Not Found', message: 'Brokerage account not found.' },
        { status: 404 }
      );
    }

    if (!account.externalAccountId) {
      return apiJson(
        {
          error: 'Not Synced',
          message: 'This account is not linked to an external service. Use the accounts API to delete it.',
        },
        { status: 400 }
      );
    }

    log.info(
      {
        accountId: account.id,
        name: account.name,
        externalAccountId: account.externalAccountId,
        ledgerEvents: account._count.ledgerEvents,
        positions: account._count.derivedPositions,
        closes: account._count.realizedCloses,
      },
      'Disconnecting synced account'
    );

    // If deregisterFromSnapTrade is true, remove the brokerage authorization from SnapTrade
    let snaptradeDeregistered = false;
    let siblingAccountsWarning: string | null = null;

    if (deregisterFromSnapTrade && isSnapTradeConfigured() && account.brokerageAuthorizationId) {
      // Check if other accounts share this authorization (e.g., Individual + Roth IRA from same login)
      const siblingCount = await prisma.brokerageAccount.count({
        where: {
          userId,
          brokerageAuthorizationId: account.brokerageAuthorizationId,
          id: { not: brokerageAccountId },
          isActive: true,
        },
      });

      if (siblingCount > 0) {
        // Warn that deregistering will affect other accounts
        siblingAccountsWarning = `Deregistering will also disconnect ${siblingCount} other account(s) from the same brokerage connection.`;
        log.warn(
          { siblingCount, brokerageAuthorizationId: account.brokerageAuthorizationId },
          'Multiple accounts share this brokerage authorization'
        );
      }

      // Get user's ACTIVE SnapTrade credentials
      const credential = await prisma.serviceCredential.findFirst({
        where: {
          userId,
          service: SNAPTRADE_SERVICE,
          isActive: true,
        },
      });

      if (credential) {
        const credentials = {
          userId: credential.serviceUserId,
          userSecret: credential.serviceUserSecret,
        };

        const logCtx = {
          prisma,
          internalUserId: userId,
          correlationId,
          triggeredBy: 'disconnect_deregister',
        };

        try {
          // Use stored authorization ID directly (no need for API lookup)
          await removeBrokerageAuthorizationLogged(
            logCtx,
            credentials,
            account.brokerageAuthorizationId
          );
          snaptradeDeregistered = true;
          log.info(
            { brokerageAuthorizationId: account.brokerageAuthorizationId },
            'Successfully removed brokerage authorization from SnapTrade'
          );

          // Deactivate any sibling accounts that shared this authorization
          if (siblingCount > 0) {
            await prisma.brokerageAccount.updateMany({
              where: {
                userId,
                brokerageAuthorizationId: account.brokerageAuthorizationId,
                id: { not: brokerageAccountId },
                isActive: true,
              },
              data: { isActive: false },
            });
            log.info(
              { siblingCount, brokerageAuthorizationId: account.brokerageAuthorizationId },
              'Deactivated sibling accounts that shared the removed authorization'
            );
          }
        } catch (snapErr) {
          // Log but don't fail - we still want to clean up local data
          log.warn(
            { error: snapErr, brokerageAuthorizationId: account.brokerageAuthorizationId },
            'Failed to remove brokerage authorization from SnapTrade, continuing with local cleanup'
          );
        }
      }
    } else if (deregisterFromSnapTrade && !account.brokerageAuthorizationId) {
      log.warn(
        { externalAccountId: account.externalAccountId },
        'No stored brokerage authorization ID, skipping SnapTrade deregistration'
      );
    }

    // Perform deletion in a transaction
    const deletionResult = await prisma.$transaction(async (tx) => {
      // 1. Delete position ledger links (references to positions/closes and ledger events)
      const deletedLinks = await tx.positionLedgerLink.deleteMany({
        where: {
          OR: [
            { position: { brokerageAccountId } },
            { realizedClose: { brokerageAccountId } },
          ],
        },
      });

      // 2. Delete derived positions
      const deletedPositions = await tx.derivedPosition.deleteMany({
        where: { brokerageAccountId },
      });

      // 3. Delete realized closes
      const deletedCloses = await tx.realizedClose.deleteMany({
        where: { brokerageAccountId },
      });

      // 4. Delete daily aggregates
      const deletedAggregates = await tx.dailyAggregate.deleteMany({
        where: { brokerageAccountId },
      });

      // 5. Delete ledger events (the source data)
      const deletedEvents = await tx.ledgerEvent.deleteMany({
        where: { brokerageAccountId },
      });

      // 6. Delete import batches
      const deletedBatches = await tx.importBatch.deleteMany({
        where: { brokerageAccountId },
      });

      // 7. Delete portfolio policy if exists
      const deletedPolicies = await tx.portfolioPolicy.deleteMany({
        where: { brokerageAccountId },
      });

      // 8. Delete SnapTrade cached data (BrokerPosition, BrokerBalance, BrokerReturnRate)
      const deletedBrokerPositions = await tx.brokerPosition.deleteMany({
        where: { brokerageAccountId },
      });

      const deletedBrokerBalances = await tx.brokerBalance.deleteMany({
        where: { brokerageAccountId },
      });

      const deletedBrokerReturnRates = await tx.brokerReturnRate.deleteMany({
        where: { brokerageAccountId },
      });

      // 9. Finally, delete the brokerage account itself
      await tx.brokerageAccount.delete({
        where: { id: brokerageAccountId },
      });

      return {
        links: deletedLinks.count,
        positions: deletedPositions.count,
        closes: deletedCloses.count,
        aggregates: deletedAggregates.count,
        events: deletedEvents.count,
        batches: deletedBatches.count,
        policies: deletedPolicies.count,
        brokerPositions: deletedBrokerPositions.count,
        brokerBalances: deletedBrokerBalances.count,
        brokerReturnRates: deletedBrokerReturnRates.count,
      };
    }, {
      timeout: 180000, // 3 minutes for large accounts
    });

    log.info(
      {
        accountId: brokerageAccountId,
        deleted: deletionResult,
      },
      'Account disconnected and data deleted'
    );

    // Re-run derivation for the user (to update aggregate views)
    // This is important to recalculate the "All Accounts" view
    log.info('Running derivation after disconnect');
    await fullRederivation(prisma, userId);

    return apiJson({
      data: {
        success: true,
        message: snaptradeDeregistered
          ? `Disconnected account "${account.name}" and deregistered from SnapTrade`
          : `Disconnected account "${account.name}" and deleted all associated data`,
        snaptradeDeregistered,
        siblingAccountsWarning,
        deleted: {
          account: account.name,
          externalAccountId: account.externalAccountId,
          brokerageAuthorizationId: account.brokerageAuthorizationId,
          ledgerEvents: deletionResult.events,
          positions: deletionResult.positions,
          closedTrades: deletionResult.closes,
          dailyAggregates: deletionResult.aggregates,
          importBatches: deletionResult.batches,
          brokerPositions: deletionResult.brokerPositions,
          brokerBalances: deletionResult.brokerBalances,
          brokerReturnRates: deletionResult.brokerReturnRates,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Account disconnect failed');

    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      return apiJson(
        { error: 'Validation Error', message: zodError.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}

