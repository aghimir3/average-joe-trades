/**
 * MCP Tool: get_accounts
 *
 * Returns the user's brokerage accounts with summary stats.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-accounts' });

export function registerAccountTools(server: McpServer, userId: string) {
  server.registerTool(
    'get_accounts',
    {
      title: 'Get Brokerage Accounts',
      description:
        'List your brokerage accounts with trade counts and P&L summary. Use account IDs from this tool to filter other tools.',
      inputSchema: z.object({
        includeInactive: z
          .boolean()
          .default(false)
          .describe('Include deactivated accounts.'),
      }),
    },
    async ({ includeInactive }) => {
      log.info({ userId }, 'get_accounts');

      const where = {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
      };

      const accounts = await prisma.brokerageAccount.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
          _count: {
            select: {
              ledgerEvents: { where: { deletedAt: null } },
            },
          },
        },
      });

      const accountIds = accounts.map((a) => a.id);

      // Batch aggregate queries to avoid N+1
      const [positionCounts, pnlSums] = await Promise.all([
        prisma.derivedPosition.groupBy({
          by: ['brokerageAccountId'],
          where: { brokerageAccountId: { in: accountIds }, quantity: { gt: 0 } },
          _count: { id: true },
        }),
        prisma.realizedClose.groupBy({
          by: ['brokerageAccountId'],
          where: { brokerageAccountId: { in: accountIds } },
          _sum: { realizedPnL: true },
        }),
      ]);

      const posMap = new Map(positionCounts.map((p) => [p.brokerageAccountId, p._count.id]));
      const pnlMap = new Map(pnlSums.map((p) => [p.brokerageAccountId, Number(p._sum.realizedPnL ?? 0)]));

      const result = accounts.map((a) => ({
        id: a.id,
        broker: a.broker,
        name: a.name,
        currency: a.currency,
        isDefault: a.isDefault,
        isActive: a.isActive,
        canSync: !!a.externalAccountId,
        createdAt: a.createdAt.toISOString(),
        stats: {
          tradeCount: a._count.ledgerEvents,
          openPositions: posMap.get(a.id) ?? 0,
          totalRealizedPnL: pnlMap.get(a.id) ?? 0,
        },
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );
}
