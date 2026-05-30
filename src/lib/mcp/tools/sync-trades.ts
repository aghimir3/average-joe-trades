/**
 * MCP Tool: sync_trades
 *
 * Syncs trades and positions from connected brokerage accounts via SnapTrade.
 * This is the only MCP tool that performs write operations (one-time exception
 * to the read-only contract).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, dateSchema, buildScopedWhere, sanitizeOutput } from '../security';
import { syncRateLimiter } from '@/lib/security/rate-limit';
import { isSnapTradeConfigured, SNAPTRADE_SERVICE } from '@/lib/services/snaptrade';
import {
  fetchTransactionsForImportLogged,
  getConnectedAccountsLogged,
} from '@/lib/services/snaptrade-logged';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { syncAllPositions } from '@/lib/services/snaptrade-positions';
import type { Broker } from '@/lib/importers/types';

const log = createChildLogger({ module: 'mcp-sync-trades' });

export function registerSyncTradesTools(server: McpServer, userId: string) {
  server.registerTool(
    'sync_trades',
    {
      title: 'Sync Trades from Brokerage',
      description:
        'Sync latest trades and positions from connected brokerage accounts via SnapTrade. ' +
        'Use get_accounts first to find accounts with canSync: true. ' +
        'Optionally filter by accountId and date range. Default: all connected accounts, last 90 days.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        startDate: dateSchema.describe('Start date for transaction fetch (YYYY-MM-DD). Default: 90 days ago.'),
        endDate: dateSchema.describe('End date for transaction fetch (YYYY-MM-DD). Default: today.'),
      }),
    },
    async ({ accountId, startDate, endDate }) => {
      log.info({ userId, accountId, startDate, endDate }, 'sync_trades');

      // Rate limit — sync is expensive, 20/hour max
      const rateLimit = syncRateLimiter.check(userId);
      if (!rateLimit.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Rate limited — sync requests are limited to 20 per hour.',
            retryAfterSeconds: Math.ceil(rateLimit.resetMs / 1000),
          }, null, 2) }],
        };
      }

      if (!isSnapTradeConfigured()) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'SnapTrade is not configured. Brokerage sync is not available.',
          }, null, 2) }],
        };
      }

      const credential = await prisma.serviceCredential.findFirst({
        where: { userId, service: SNAPTRADE_SERVICE, isActive: true },
      });

      if (!credential) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'No brokerage connected.',
            suggestion: 'Connect a brokerage account from the Accounts page first.',
          }, null, 2) }],
        };
      }

      const credentials = {
        userId: credential.serviceUserId,
        userSecret: credential.serviceUserSecret,
      };

      const correlationId = crypto.randomUUID();
      const logCtx = { prisma, internalUserId: userId, correlationId, triggeredBy: 'mcp_sync' };

      // Validate account ownership if specific account requested
      if (accountId) {
        await buildScopedWhere(userId, accountId);
      }

      // Get internal accounts linked to SnapTrade
      const linkedAccounts = await prisma.brokerageAccount.findMany({
        where: {
          userId,
          isActive: true,
          externalAccountId: { not: null },
          ...(accountId ? { id: accountId } : {}),
        },
      });

      if (linkedAccounts.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: accountId
              ? 'Account not found, not connected to SnapTrade, or not owned by this user.'
              : 'No SnapTrade-linked accounts found.',
            suggestion: 'Connect a brokerage account from the Accounts page.',
          }, null, 2) }],
        };
      }

      // Verify accounts are still active in SnapTrade
      const connectedAccounts = await getConnectedAccountsLogged(logCtx, credentials);
      const connectedIds = new Set(connectedAccounts.map((a) => a.id));
      const syncableAccounts = linkedAccounts.filter(
        (a) => a.externalAccountId && connectedIds.has(a.externalAccountId),
      );

      if (syncableAccounts.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Selected accounts are not currently connected in SnapTrade.',
            suggestion: 'The brokerage connection may have expired. Reconnect from the Accounts page.',
          }, null, 2) }],
        };
      }

      const effectiveStartDate =
        startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

      log.info(
        { accounts: syncableAccounts.length, startDate: effectiveStartDate, endDate: effectiveEndDate },
        'MCP-initiated sync started',
      );

      let totalImported = 0;
      let totalDuplicates = 0;
      const accountResults: Array<{
        name: string;
        broker: string;
        imported: number;
        duplicates: number;
      }> = [];

      for (const account of syncableAccounts) {
        const { transactions } = await fetchTransactionsForImportLogged(logCtx, credentials, {
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          accountIds: [account.externalAccountId!],
        });

        let imported = 0;
        let duplicates = 0;

        if (transactions.length > 0) {
          const writeResult = await writeLedgerEvents(
            prisma,
            {
              userId,
              brokerageAccountId: account.id,
              broker: account.broker as Broker,
              sourceType: 'api',
            },
            transactions,
          );
          imported = writeResult.inserted;
          duplicates = writeResult.duplicates;
        }

        accountResults.push({ name: account.name, broker: account.broker, imported, duplicates });
        totalImported += imported;
        totalDuplicates += duplicates;
      }

      // Run derivation if new transactions were imported
      if (totalImported > 0) {
        await fullRederivation(prisma, userId);
      }

      // Sync positions for real-time data
      let positionsSynced = false;
      try {
        await syncAllPositions(logCtx, userId);
        positionsSynced = true;
      } catch (err) {
        log.warn({ error: err }, 'Position sync failed during MCP sync (non-critical)');
      }

      // Update last sync timestamp
      await prisma.serviceCredential.update({
        where: { id: credential.id },
        data: { lastSyncAt: new Date(), syncStatus: 'success' },
      });

      log.info({ totalImported, totalDuplicates, accountsSynced: accountResults.length }, 'MCP-initiated sync completed');

      const result = {
        success: true,
        dateRange: { startDate: effectiveStartDate, endDate: effectiveEndDate },
        accountsSynced: accountResults.length,
        totalNewTransactions: totalImported,
        totalDuplicatesSkipped: totalDuplicates,
        derivationRan: totalImported > 0,
        positionsSynced,
        accounts: accountResults,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );
}
