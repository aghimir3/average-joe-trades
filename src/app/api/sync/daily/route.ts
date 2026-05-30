import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Daily Sync API
 *
 * Automatically syncs all SnapTrade accounts once per day on first dashboard visit.
 *
 * POST /api/sync/daily - Check if sync needed and trigger if so
 *   - Compares ServiceCredential.lastSyncAt to client's local date
 *   - If lastSyncAt is not today, triggers full sync for all accounts
 *   - Returns sync status and results
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { isSnapTradeConfigured } from '@/lib/services/snaptrade';
import {
  fetchTransactionsForImportLogged,
  syncBrokerageAuthorizationTransactionsLogged,
  getConnectedAccountsLogged,
  SNAPTRADE_SERVICE,
  type SnapTradeUserCredentials,
} from '@/lib/services/snaptrade-logged';
import { syncAllPositions } from '@/lib/services/snaptrade-positions';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import type { Broker, NormalizedTransaction } from '@/lib/importers/types';

/**
 * Map institution name to our broker codes
 */
function mapInstitutionToBroker(institutionName: string): Broker {
  const name = institutionName.toLowerCase();
  if (name.includes('robinhood')) return 'robinhood';
  if (name.includes('schwab')) return 'schwab';
  if (name.includes('fidelity')) return 'fidelity';
  if (name.includes('td ameritrade') || name.includes('tda')) return 'td_ameritrade';
  if (name.includes('e*trade') || name.includes('etrade')) return 'etrade';
  if (name.includes('interactive brokers') || name.includes('ibkr')) return 'interactive_brokers';
  return 'robinhood';
}

/**
 * Find or create a BrokerageAccount for a SnapTrade account
 */
async function findOrCreateBrokerageAccount(
  userId: string,
  snaptradeAccountId: string,
  accountName: string,
  institutionName: string,
  log: ReturnType<typeof createRequestLogger>
): Promise<{ id: string; isNew: boolean }> {
  const existingAccount = await prisma.brokerageAccount.findFirst({
    where: {
      userId,
      externalAccountId: snaptradeAccountId,
      isActive: true,
    },
  });

  if (existingAccount) {
    return { id: existingAccount.id, isNew: false };
  }

  const broker = mapInstitutionToBroker(institutionName);
  const newAccount = await prisma.brokerageAccount.create({
    data: {
      userId,
      broker,
      name: accountName,
      externalAccountId: snaptradeAccountId,
      isDefault: false,
      isActive: true,
    },
  });

  log.info({ accountId: newAccount.id, broker, name: accountName }, 'Created new brokerage account');
  return { id: newAccount.id, isNew: true };
}

/**
 * POST /api/sync/daily
 * Check if daily sync is needed and trigger if so
 */
export async function POST(): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  const startTime = Date.now();

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Check if SnapTrade is configured
    if (!isSnapTradeConfigured()) {
      return apiJson({
        data: {
          syncTriggered: false,
          reason: 'snaptrade_not_configured',
        },
      });
    }

    // Get user's ACTIVE SnapTrade credentials
    const credential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    if (!credential) {
      return apiJson({
        data: {
          syncTriggered: false,
          reason: 'no_snaptrade_connection',
        },
      });
    }

    // Check if synced within last 24 hours
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    if (credential.lastSyncAt) {
      const timeSinceLastSync = Date.now() - credential.lastSyncAt.getTime();
      if (timeSinceLastSync < TWENTY_FOUR_HOURS_MS) {
        const hoursAgo = Math.round(timeSinceLastSync / (1000 * 60 * 60));
        log.info({ hoursAgo, lastSyncAt: credential.lastSyncAt }, 'Synced within last 24 hours');
        return apiJson({
          data: {
            syncTriggered: false,
            reason: 'already_synced_today',
            lastSyncAt: credential.lastSyncAt.toISOString(),
          },
        });
      }
    }

    log.info({ userId }, 'Starting daily sync');

    // Create logging context
    const logCtx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: 'daily_auto_sync',
    };

    const credentials: SnapTradeUserCredentials = {
      userId: credential.serviceUserId,
      userSecret: credential.serviceUserSecret,
    };

    // Get all connected accounts
    const accounts = await getConnectedAccountsLogged(logCtx, credentials);

    if (accounts.length === 0) {
      return apiJson({
        data: {
          syncTriggered: false,
          reason: 'no_connected_accounts',
        },
      });
    }

    // Collect unique authorization IDs for transaction sync.
    const authorizationIds = new Set<string>();
    for (const account of accounts) {
      if (account.brokerageAuthorization) {
        authorizationIds.add(account.brokerageAuthorization);
      }
    }

    log.info({ authorizationCount: authorizationIds.size }, 'Requesting SnapTrade transaction sync');
    for (const authId of authorizationIds) {
      try {
        await syncBrokerageAuthorizationTransactionsLogged(logCtx, credentials, authId);
      } catch (err) {
        log.warn({ authId, error: err }, 'Failed to request transaction sync for authorization');
      }
    }

    // Wait a moment for SnapTrade to process the queued transaction sync.
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Sync transactions for all accounts
    let totalImported = 0;
    let totalDuplicates = 0;
    let accountsSynced = 0;

    // Calculate date range: last 2 years by default
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    for (const account of accounts) {
      try {
        // Find or create brokerage account
        const { id: brokerageAccountId } = await findOrCreateBrokerageAccount(
          userId,
          account.id,
          account.name,
          account.institutionName,
          log
        );

        // Fetch transactions
        const { transactions, skipped } = await fetchTransactionsForImportLogged(
          logCtx,
          credentials,
          {
            startDate: startDateStr,
            endDate: endDateStr,
            accountIds: [account.id],
          }
        );

        if (transactions.length > 0) {
          // Create import batch for audit trail
          const importBatch = await prisma.importBatch.create({
            data: {
              userId,
              brokerageAccountId,
              fileName: `Daily Sync: ${account.name}`,
              broker: mapInstitutionToBroker(account.institutionName),
              sourceType: 'api',
              status: 'processing',
              totalRows: transactions.length + skipped,
              parsedRows: transactions.length,
              validatedRows: transactions.length,
              skippedRows: skipped,
              startedAt: new Date(),
            },
          });

          // Write ledger events
          const result = await writeLedgerEvents(prisma, {
            userId,
            brokerageAccountId,
            importBatchId: importBatch.id,
            broker: mapInstitutionToBroker(account.institutionName),
            sourceType: 'api',
          }, transactions as NormalizedTransaction[]);

          // Update import batch
          await prisma.importBatch.update({
            where: { id: importBatch.id },
            data: {
              status: 'completed',
              importedEvents: result.inserted,
              duplicateRows: result.duplicates,
              completedAt: new Date(),
            },
          });

          totalImported += result.inserted;
          totalDuplicates += result.duplicates;
        }

        accountsSynced++;
      } catch (err) {
        log.error({ accountId: account.id, error: err }, 'Failed to sync account');
      }
    }

    // Run full re-derivation if any transactions were imported
    let derivationRan = false;
    if (totalImported > 0) {
      await fullRederivation(prisma, userId);
      derivationRan = true;
    }

    // Sync positions from SnapTrade
    let positionsSynced = 0;
    try {
      const positionResults = await syncAllPositions(logCtx, userId);
      for (const result of positionResults.values()) {
        positionsSynced += result.stockPositions + result.optionPositions;
      }
    } catch (err) {
      log.warn({ error: err }, 'Failed to sync positions');
    }

    // Update lastSyncAt
    await prisma.serviceCredential.update({
      where: {
        userId_service: {
          userId,
          service: SNAPTRADE_SERVICE,
        },
      },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'success',
      },
    });

    const durationMs = Date.now() - startTime;
    log.info(
      {
        accountsSynced,
        totalImported,
        totalDuplicates,
        positionsSynced,
        derivationRan,
        durationMs,
      },
      'Daily sync completed'
    );

    return apiJson({
      data: {
        syncTriggered: true,
        accountsSynced,
        transactionsImported: totalImported,
        duplicatesSkipped: totalDuplicates,
        positionsSynced,
        derivationRan,
        durationMs,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Daily sync failed');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Sync Failed', message: 'Daily sync failed. Please try again.' },
      { status: 500 }
    );
  }
}

