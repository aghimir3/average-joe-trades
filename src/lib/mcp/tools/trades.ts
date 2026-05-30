/**
 * MCP Tool: search_trades
 *
 * Search and filter closed trades with pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, buildScopedWhere, sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-trades' });

export function registerTradeTools(server: McpServer, userId: string) {
  server.registerTool(
    'search_trades',
    {
      title: 'Search Trades',
      description:
        'Search and filter your closed trades. Returns P&L, dates, strategy, and more. Supports filtering by symbol, type, date range, and status.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        symbol: z.string().max(20).regex(/^[A-Z0-9.]+$/i).optional().describe('Filter by ticker symbol.'),
        type: z.enum(['stock', 'option', 'all']).default('all').describe('Filter by trade type.'),
        status: z.enum(['winner', 'loser', 'all']).default('all').describe('Filter by outcome.'),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date (YYYY-MM-DD).'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date (YYYY-MM-DD).'),
        limit: z.number().int().min(1).max(100).default(25).describe('Max results (1-100).'),
        offset: z.number().int().min(0).default(0).describe('Skip N results for pagination.'),
      }),
    },
    async ({ accountId, symbol, type, status, startDate, endDate, limit, offset }) => {
      log.info({ userId, accountId, symbol, type, limit }, 'search_trades');
      const scope = await buildScopedWhere(userId, accountId);

      const where = {
        ...scope,
        ...(symbol && { symbol: symbol.toUpperCase() }),
        ...(type !== 'all' && { closeType: type }),
        ...(status === 'winner' && { realizedPnL: { gt: 0 } }),
        ...(status === 'loser' && { realizedPnL: { lt: 0 } }),
        ...((startDate || endDate) && {
          closeDate: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }),
      };

      const [trades, total] = await Promise.all([
        prisma.realizedClose.findMany({
          where,
          select: {
            id: true,
            symbol: true,
            closeType: true,
            side: true,
            optionType: true,
            strike: true,
            expiration: true,
            strategy: true,
            openDate: true,
            closeDate: true,
            quantity: true,
            openPrice: true,
            closePrice: true,
            realizedPnL: true,
            closeReason: true,
            hasUnknownBasis: true,
            isWheelTrade: true,
          },
          orderBy: { closeDate: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.realizedClose.count({ where }),
      ]);

      const result = {
        trades: trades.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          type: t.closeType,
          side: t.side,
          quantity: Number(t.quantity),
          openPrice: Number(t.openPrice),
          closePrice: Number(t.closePrice),
          realizedPnL: Number(t.realizedPnL),
          openDate: t.openDate.toISOString().split('T')[0],
          closeDate: t.closeDate.toISOString().split('T')[0],
          holdingDays: Math.ceil((t.closeDate.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24)),
          closeReason: t.closeReason,
          strategy: t.strategy,
          hasUnknownBasis: t.hasUnknownBasis,
          isWheelTrade: t.isWheelTrade,
          ...(t.closeType === 'option' && {
            optionType: t.optionType,
            strike: t.strike ? Number(t.strike) : null,
            expiration: t.expiration?.toISOString().split('T')[0] ?? null,
          }),
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );
}
