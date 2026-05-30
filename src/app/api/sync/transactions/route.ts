import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Transactions Sync API
 *
 * Fetches transactions from connected brokerages and imports them.
 * Each SnapTrade account is mapped 1:1 to a BrokerageAccount in our system.
 * Creates ImportBatch records for audit trail.
 *
 * POST /api/sync/transactions - Sync transactions from connected brokerages
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { isSnapTradeConfigured, type SnapTradeAccount } from '@/lib/services/snaptrade';
import {
  fetchTransactionsForImportLogged,
  syncBrokerageAuthorizationTransactionsLogged,
  getConnectedAccountsLogged,
  getBrokerageAuthorizationsLogged,
  SNAPTRADE_SERVICE,
  type SnapTradeUserCredentials,
} from '@/lib/services/snaptrade-logged';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import {
  logSyncActivity,
  createSyncCorrelationId,
} from '@/lib/services/sync-activity-log';
import { z } from 'zod';
import type { Broker, NormalizedTransaction } from '@/lib/importers/types';
import { syncRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const syncSchema = z.object({
  snaptradeAccountIds: z.array(z.string()).min(1, 'At least one account must be selected'),
  // Use nullish() to accept both null and undefined from client
  startDate: z.string().nullish().transform(val => val ?? undefined), // YYYY-MM-DD
  endDate: z.string().nullish().transform(val => val ?? undefined), // YYYY-MM-DD
  refresh: z.boolean().nullish().default(false).transform(val => val ?? false),
  // Force re-derivation even if no new transactions are imported
  // Useful when user wants to refresh derived data (positions, P&L, etc.)
  forceDerivation: z.boolean().nullish().default(false).transform(val => val ?? false),
});

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
  // Default to robinhood for unknown brokerages (can be extended)
  return 'robinhood';
}

/**
 * Find or create a BrokerageAccount for a SnapTrade account
 */
async function findOrCreateBrokerageAccount(
  userId: string,
  snaptradeAccount: SnapTradeAccount,
  log: ReturnType<typeof createRequestLogger>
): Promise<{ id: string; isNew: boolean }> {
  // Look for existing ACTIVE account linked to this SnapTrade account
  // (inactive accounts should be ignored to allow re-linking)
  const existingAccount = await prisma.brokerageAccount.findFirst({
    where: {
      userId,
      externalAccountId: snaptradeAccount.id,
      isActive: true,
    },
  });

  if (existingAccount) {
    log.debug({ accountId: existingAccount.id, externalAccountId: snaptradeAccount.id }, 'Found existing linked account');

    // Update authorization ID if it changed or was null
    if (existingAccount.brokerageAuthorizationId !== snaptradeAccount.brokerageAuthorization) {
      await prisma.brokerageAccount.update({
        where: { id: existingAccount.id },
        data: { brokerageAuthorizationId: snaptradeAccount.brokerageAuthorization },
      });
      log.debug(
        { accountId: existingAccount.id, authorizationId: snaptradeAccount.brokerageAuthorization },
        'Updated brokerage authorization ID'
      );
    }

    return { id: existingAccount.id, isNew: false };
  }

  // Create new BrokerageAccount linked to this SnapTrade account
  const broker = mapInstitutionToBroker(snaptradeAccount.institutionName);
  // Use the SnapTrade account name directly (e.g., "Robinhood Individual", "Robinhood Roth Ira")
  // Don't prepend institutionName as it often duplicates info already in the name
  let accountName = snaptradeAccount.name;

  // Check for name conflicts and deduplicate if needed
  // This handles the case where multiple OAuth connections have accounts with the same name
  // (e.g., user's "Robinhood Individual" and spouse's "Robinhood Individual")
  const existingWithSameName = await prisma.brokerageAccount.findMany({
    where: {
      userId,
      name: { startsWith: accountName },
      isActive: true,
    },
    select: { name: true },
  });

  if (existingWithSameName.length > 0) {
    // Check if exact name exists
    const exactMatch = existingWithSameName.some(acc => acc.name === accountName);
    if (exactMatch) {
      // Find the next available suffix
      // Look for names like "Robinhood Individual (2)", "Robinhood Individual (3)", etc.
      const existingNames = new Set(existingWithSameName.map(acc => acc.name));
      let suffix = 2;
      while (existingNames.has(`${accountName} (${suffix})`)) {
        suffix++;
      }
      accountName = `${accountName} (${suffix})`;
      log.debug({ originalName: snaptradeAccount.name, deduplicatedName: accountName }, 'Deduplicated account name');
    }
  }

  const newAccount = await prisma.brokerageAccount.create({
    data: {
      userId,
      broker,
      name: accountName,
      externalAccountId: snaptradeAccount.id,
      brokerageAuthorizationId: snaptradeAccount.brokerageAuthorization,
      isDefault: false,
      isActive: true,
    },
  });

  log.info(
    {
      accountId: newAccount.id,
      externalAccountId: snaptradeAccount.id,
      brokerageAuthorizationId: snaptradeAccount.brokerageAuthorization,
      broker,
      name: accountName,
    },
    'Created new brokerage account for SnapTrade sync'
  );

  return { id: newAccount.id, isNew: true };
}

/**
 * Create an ImportBatch record to track this sync operation
 */
async function createImportBatch(
  userId: string,
  brokerageAccountId: string,
  broker: Broker,
  snaptradeAccountName: string
): Promise<string> {
  const batch = await prisma.importBatch.create({
    data: {
      userId,
      brokerageAccountId,
      fileName: `SnapTrade Sync: ${snaptradeAccountName}`,
      broker,
      sourceType: 'api',
      status: 'processing',
      startedAt: new Date(),
    },
  });
  return batch.id;
}

/**
 * Update ImportBatch with results
 */
async function updateImportBatch(
  batchId: string,
  transactions: NormalizedTransaction[],
  imported: number,
  duplicates: number,
  errors: number,
  warnings: Array<{ index?: number; symbol?: string; message: string }>,
  skipped: number
): Promise<void> {
  // Calculate date range from transactions
  let tradeStartDate: Date | null = null;
  let tradeEndDate: Date | null = null;

  if (transactions.length > 0) {
    const dates = transactions.map(t => t.activityDate);
    tradeStartDate = new Date(Math.min(...dates.map(d => d.getTime())));
    tradeEndDate = new Date(Math.max(...dates.map(d => d.getTime())));
  }

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: errors > 0 ? 'completed' : 'completed',
      totalRows: transactions.length + skipped,
      parsedRows: transactions.length,
      validatedRows: transactions.length,
      duplicateRows: duplicates,
      importedEvents: imported,
      skippedRows: skipped,
      warnings: warnings.length > 0 ? JSON.stringify(warnings) : null,
      errorMessage: errors > 0 ? `${errors} errors during import` : null,
      tradeStartDate,
      tradeEndDate,
      completedAt: new Date(),
    },
  });
}

/**
 * POST /api/sync/transactions
 * Sync transactions from connected brokerages
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Rate limit check - protect against abuse
    const rateLimit = syncRateLimiter.check(userId);
    if (!rateLimit.success) {
      log.warn({ userId, remaining: rateLimit.remaining }, 'Sync rate limit exceeded');
      return rateLimitResponse(rateLimit.remaining, rateLimit.resetMs);
    }

    // Check if SnapTrade is configured
    if (!isSnapTradeConfigured()) {
      return apiJson(
        {
          error: 'Not Configured',
          message: 'SnapTrade integration is not configured.',
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { snaptradeAccountIds, startDate, endDate, refresh, forceDerivation } = syncSchema.parse(body);

    log.info({ userId, snaptradeAccountIds, startDate, endDate, refresh, forceDerivation }, 'Starting transaction sync');

    // Create sync correlation ID for tracking this sync flow
    const syncCorrelationId = createSyncCorrelationId();

    // Get user's ACTIVE SnapTrade credentials from ServiceCredential table
    const credential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    if (!credential) {
      return apiJson(
        {
          error: 'Not Connected',
          message: 'No brokerage accounts connected. Please connect your account first.',
        },
        { status: 400 }
      );
    }

    const credentials: SnapTradeUserCredentials = {
      userId: credential.serviceUserId,
      userSecret: credential.serviceUserSecret,
    };

    // Create logging context
    const logCtx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: 'sync_transactions',
    };

    // Get connected accounts
    const connectedAccounts = await getConnectedAccountsLogged(logCtx, credentials);

    if (connectedAccounts.length === 0) {
      return apiJson(
        {
          error: 'No Accounts',
          message: 'No brokerage accounts connected. Please connect your account first.',
        },
        { status: 400 }
      );
    }

    // Exclude accounts on disabled broker connections so Sync All always skips disconnected links.
    let syncableConnectedAccounts = connectedAccounts;
    try {
      const authorizations = await getBrokerageAuthorizationsLogged(logCtx, credentials);
      const disabledAuthorizationIds = new Set(
        authorizations
          .filter((authorization) => authorization.disabled)
          .map((authorization) => authorization.id)
      );

      if (disabledAuthorizationIds.size > 0) {
        const beforeCount = connectedAccounts.length;
        syncableConnectedAccounts = connectedAccounts.filter(
          (account) => !disabledAuthorizationIds.has(account.brokerageAuthorization)
        );
        const skippedCount = beforeCount - syncableConnectedAccounts.length;
        if (skippedCount > 0) {
          log.info(
            {
              skippedCount,
              skippedAccountIds: connectedAccounts
                .filter((account) => disabledAuthorizationIds.has(account.brokerageAuthorization))
                .map((account) => account.id),
            },
            'Skipping disconnected SnapTrade accounts during transaction sync'
          );
        }
      }
    } catch (connectionError) {
      log.warn(
        { error: connectionError },
        'Unable to verify disabled broker connections; continuing with connected account list'
      );
    }

    // Filter to selected accounts
    const accountsToSync = syncableConnectedAccounts.filter((a) => snaptradeAccountIds.includes(a.id));

    if (accountsToSync.length === 0) {
      return apiJson(
        {
          error: 'Invalid Accounts',
          message: 'None of the selected accounts are currently connected.',
        },
        { status: 400 }
      );
    }

    log.info({ accountsToSync: accountsToSync.map(a => ({ id: a.id, name: a.name, institution: a.institutionName })) }, 'Syncing accounts');

    // Log account selection
    for (const account of accountsToSync) {
      await logSyncActivity(prisma, {
        userId,
        eventType: 'account_selected',
        broker: mapInstitutionToBroker(account.institutionName),
        accountName: account.name,
        message: `Selected ${account.name} for sync`,
        details: {
          snaptradeAccountId: account.id,
          institution: account.institutionName,
          syncStatus: account.sync_status?.transactions?.initial_sync_completed ? 'ready' : 'syncing',
        },
        correlationId: syncCorrelationId,
      });
    }

    // Check if any accounts need their initial sync to complete
    const accountsNeedingSync = accountsToSync.filter(
      (a) => !a.sync_status?.transactions?.initial_sync_completed
    );

    const shouldRequestTransactionSync = refresh || accountsNeedingSync.length > 0;

    if (shouldRequestTransactionSync) {
      if (accountsNeedingSync.length > 0) {
        log.info(
          { accountsNeedingSync: accountsNeedingSync.map(a => a.name) },
          'Some accounts have not completed initial transaction sync, requesting SnapTrade transaction sync'
        );
      } else {
        log.info('Requesting SnapTrade transaction sync for connected accounts');
      }

      const uniqueAuthorizations = [
        ...new Set(accountsToSync.map((a) => a.brokerageAuthorization)),
      ];

      for (const authId of uniqueAuthorizations) {
        try {
          await syncBrokerageAuthorizationTransactionsLogged(logCtx, credentials, authId);
        } catch (err) {
          log.warn({ authId, error: err }, 'Failed to request transaction sync');
        }
      }

      // Wait briefly for SnapTrade to process the queued transaction sync.
      const waitTime = accountsNeedingSync.length > 0 ? 5000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // If accounts needed initial sync, re-fetch to check if sync is now complete
      if (accountsNeedingSync.length > 0) {
        const updatedAccounts = await getConnectedAccountsLogged(logCtx, credentials);
        const stillPending = updatedAccounts.filter(
          (a) => snaptradeAccountIds.includes(a.id) && !a.sync_status?.transactions?.initial_sync_completed
        );

        if (stillPending.length > 0) {
          log.warn(
            { stillPending: stillPending.map(a => a.name) },
            'Some accounts still have not completed initial sync after refresh'
          );
          // Continue anyway - we'll get whatever transactions are available
        }
      }
    }

    // Default to last 2 years if no date range specified
    const effectiveStartDate = startDate || new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

    log.info({ effectiveStartDate, effectiveEndDate }, 'Using date range for transaction fetch');

    // Track results per account
    const accountResults: Array<{
      snaptradeAccountId: string;
      brokerageAccountId: string;
      importBatchId: string;
      name: string;
      broker: string;
      isNewAccount: boolean;
      imported: number;
      duplicates: number;
      errors: number;
    }> = [];

    let totalImported = 0;
    let totalDuplicates = 0;
    let totalErrors = 0;

    // Process each SnapTrade account
    for (const snaptradeAccount of accountsToSync) {
      log.info({ snaptradeAccountId: snaptradeAccount.id, name: snaptradeAccount.name }, 'Processing account');

      const broker = mapInstitutionToBroker(snaptradeAccount.institutionName);

      // Log sync started for this account
      await logSyncActivity(prisma, {
        userId,
        eventType: 'sync_started',
        broker,
        accountName: snaptradeAccount.name,
        message: `Starting sync for ${snaptradeAccount.name}`,
        details: { snaptradeAccountId: snaptradeAccount.id },
        correlationId: syncCorrelationId,
      });

      // Find or create the corresponding BrokerageAccount
      const { id: brokerageAccountId, isNew } = await findOrCreateBrokerageAccount(
        userId,
        snaptradeAccount,
        log
      );

      // Log if new account was created
      if (isNew) {
        await logSyncActivity(prisma, {
          userId,
          eventType: 'account_created',
          broker,
          brokerageAccountId,
          accountName: snaptradeAccount.name,
          message: `Created new account: ${snaptradeAccount.name}`,
          details: {
            snaptradeAccountId: snaptradeAccount.id,
            brokerageAuthorizationId: snaptradeAccount.brokerageAuthorization,
          },
          correlationId: syncCorrelationId,
        });
      }

      // Create ImportBatch record for audit trail
      const importBatchId = await createImportBatch(
        userId,
        brokerageAccountId,
        broker,
        snaptradeAccount.name
      );

      log.info({ importBatchId, snaptradeAccountId: snaptradeAccount.id }, 'Created import batch');

      // Fetch transactions for this specific account
      const { transactions, skipped, total } = await fetchTransactionsForImportLogged(logCtx, credentials, {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        accountIds: [snaptradeAccount.id],
      });

      log.info(
        { snaptradeAccountId: snaptradeAccount.id, total, skipped, transactions: transactions.length },
        'Fetched transactions for account'
      );

      if (transactions.length === 0) {
        // Update batch with zero results
        await updateImportBatch(importBatchId, [], 0, 0, 0, [], skipped);

        accountResults.push({
          snaptradeAccountId: snaptradeAccount.id,
          brokerageAccountId,
          importBatchId,
          name: snaptradeAccount.name,
          broker,
          isNewAccount: isNew,
          imported: 0,
          duplicates: 0,
          errors: 0,
        });
        continue;
      }

      // Write transactions to ledger for this specific account
      const writeResult = await writeLedgerEvents(
        prisma,
        {
          userId,
          brokerageAccountId,
          broker,
          sourceType: 'api',
          importBatchId,
        },
        transactions
      );

      log.info(
        {
          snaptradeAccountId: snaptradeAccount.id,
          inserted: writeResult.inserted,
          duplicates: writeResult.duplicates,
          errors: writeResult.errors.length,
        },
        'Wrote ledger events for account'
      );

      // Update ImportBatch with results
      const warnings = writeResult.warnings.map(w => ({
        index: w.index,
        symbol: w.symbol,
        message: w.message,
      }));

      await updateImportBatch(
        importBatchId,
        transactions,
        writeResult.inserted,
        writeResult.duplicates,
        writeResult.errors.length,
        warnings,
        skipped
      );

      accountResults.push({
        snaptradeAccountId: snaptradeAccount.id,
        brokerageAccountId,
        importBatchId,
        name: snaptradeAccount.name,
        broker,
        isNewAccount: isNew,
        imported: writeResult.inserted,
        duplicates: writeResult.duplicates,
        errors: writeResult.errors.length,
      });

      // Log sync completed for this account
      if (writeResult.errors.length > 0) {
        await logSyncActivity(prisma, {
          userId,
          eventType: 'sync_failed',
          broker,
          brokerageAccountId,
          accountName: snaptradeAccount.name,
          message: `Sync completed with ${writeResult.errors.length} error(s)`,
          details: {
            imported: writeResult.inserted,
            duplicates: writeResult.duplicates,
            errors: writeResult.errors.length,
          },
          isError: true,
          correlationId: syncCorrelationId,
        });
      } else {
        await logSyncActivity(prisma, {
          userId,
          eventType: 'sync_completed',
          broker,
          brokerageAccountId,
          accountName: snaptradeAccount.name,
          message: `Synced ${writeResult.inserted} transaction(s) for ${snaptradeAccount.name}`,
          details: {
            imported: writeResult.inserted,
            duplicates: writeResult.duplicates,
          },
          correlationId: syncCorrelationId,
        });
      }

      totalImported += writeResult.inserted;
      totalDuplicates += writeResult.duplicates;
      totalErrors += writeResult.errors.length;
    }

    // Run derivation if:
    // 1. New transactions were imported (totalImported > 0)
    // 2. Force derivation was requested (forceDerivation = true)
    // 3. Any new accounts were created (they need initial derivation)
    const hasNewAccounts = accountResults.some(r => r.isNewAccount);
    const shouldDerive = totalImported > 0 || forceDerivation || hasNewAccounts;

    if (shouldDerive) {
      const reason = totalImported > 0 ? 'new transactions' :
                     forceDerivation ? 'force derivation requested' :
                     'new accounts created';
      log.info({ reason }, 'Running derivation after sync');
      await fullRederivation(prisma, userId);

      // Log derivation completed
      await logSyncActivity(prisma, {
        userId,
        eventType: 'derivation_completed',
        broker: accountResults[0]?.broker || 'unknown',
        message: `Derivation completed: recalculated positions and P&L`,
        details: { reason },
        correlationId: syncCorrelationId,
      });
    }

    // Note: Position sync is NOT done here - it's independent and only triggered from the positions page
    // This keeps transaction sync focused on just importing transactions

    // Update sync status
    await prisma.serviceCredential.update({
      where: { id: credential.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: totalErrors > 0 ? 'partial' : 'success',
        syncError: totalErrors > 0 ? `${totalErrors} errors` : null,
      },
    });

    return apiJson({
      data: {
        success: true,
        message: totalImported > 0
          ? `Synced ${totalImported} transactions across ${accountsToSync.length} account(s)`
          : shouldDerive
            ? 'No new transactions, but refreshed positions and P&L'
            : 'No new transactions to import',
        stats: {
          accountsSynced: accountsToSync.length,
          newAccountsCreated: accountResults.filter((r) => r.isNewAccount).length,
          totalImported,
          totalDuplicates,
          totalErrors,
          derivationRan: shouldDerive,
        },
        accounts: accountResults,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    log.error({ error }, 'Transaction sync failed');

    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      return apiJson(
        { error: 'Validation Error', message: zodError.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to sync transactions',
        details: process.env.NODE_ENV === 'development'
          ? { errorName, errorMessage, errorStack }
          : undefined,
      },
      { status: 500 }
    );
  }
}

