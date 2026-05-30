/**
 * MCP Tools: Portfolio
 *
 * get_portfolio_summary — P&L, win rate, profit factor
 * get_positions — Current open positions
 * get_realtime_portfolio — Market values from broker sync
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, buildScopedWhere, sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-portfolio' });

export function registerPortfolioTools(server: McpServer, userId: string) {
  // ──────────────────────────────────────────────────────────────────────────
  // get_portfolio_summary
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_portfolio_summary',
    {
      title: 'Portfolio Summary',
      description:
        'Get high-level portfolio stats: total P&L, win rate, profit factor, trade counts, average win/loss.',
      inputSchema: z.object({
        accountId: accountIdSchema,
      }),
    },
    async ({ accountId }) => {
      log.info({ userId, accountId }, 'get_portfolio_summary');
      const scope = await buildScopedWhere(userId, accountId);

      const closeWhere = { ...scope, hasUnknownBasis: false };

      const [openCount, allStats, winStats, lossStats] = await Promise.all([
        prisma.derivedPosition.count({
          where: { ...scope, quantity: { gt: 0 } },
        }),
        prisma.realizedClose.aggregate({
          where: closeWhere,
          _sum: { realizedPnL: true },
          _count: true,
        }),
        prisma.realizedClose.aggregate({
          where: { ...closeWhere, realizedPnL: { gt: 0 } },
          _sum: { realizedPnL: true },
          _count: true,
        }),
        prisma.realizedClose.aggregate({
          where: { ...closeWhere, realizedPnL: { lt: 0 } },
          _sum: { realizedPnL: true },
          _count: true,
        }),
      ]);

      const totalPnL = Number(allStats._sum.realizedPnL ?? 0);
      const closedTrades = allStats._count;
      const wins = winStats._count;
      const losses = lossStats._count;
      const totalWins = Number(winStats._sum.realizedPnL ?? 0);
      const totalLosses = Math.abs(Number(lossStats._sum.realizedPnL ?? 0));

      const result = {
        totalPnL,
        openPositions: openCount,
        closedTrades,
        winRate: closedTrades > 0 ? Math.round((wins / closedTrades) * 10000) / 100 : 0,
        profitFactor: totalLosses > 0 ? Math.round((totalWins / totalLosses) * 100) / 100 : totalWins > 0 ? Infinity : 0,
        wins,
        losses,
        avgWin: wins > 0 ? Math.round((totalWins / wins) * 100) / 100 : 0,
        avgLoss: losses > 0 ? Math.round((-totalLosses / losses) * 100) / 100 : 0,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_positions
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_positions',
    {
      title: 'Open Positions',
      description:
        'Get current open positions with cost basis. Filter by symbol or type.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        symbol: z.string().max(20).regex(/^[A-Z0-9.]+$/i).optional().describe('Filter by ticker symbol.'),
        type: z.enum(['stock', 'option', 'all']).default('all').describe('Filter by position type.'),
      }),
    },
    async ({ accountId, symbol, type }) => {
      log.info({ userId, accountId, symbol, type }, 'get_positions');
      const scope = await buildScopedWhere(userId, accountId);

      const where = {
        ...scope,
        quantity: { gt: 0 },
        ...(symbol && { symbol: symbol.toUpperCase() }),
        ...(type !== 'all' && { positionType: type }),
      };

      const positions = await prisma.derivedPosition.findMany({
        where,
        include: {
          brokerageAccount: { select: { id: true, name: true, broker: true } },
        },
        orderBy: [{ symbol: 'asc' }, { firstEntryDate: 'asc' }],
      });

      const result = positions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        positionType: p.positionType,
        side: p.side,
        quantity: Number(p.quantity),
        avgPrice: Number(p.avgPrice),
        costBasis: Number(p.costBasis),
        firstEntryDate: p.firstEntryDate.toISOString(),
        lastEntryDate: p.lastEntryDate.toISOString(),
        strategy: p.strategy,
        ...(p.positionType === 'option' && {
          optionType: p.optionType,
          strike: p.strike ? Number(p.strike) : null,
          expiration: p.expiration?.toISOString().split('T')[0] ?? null,
        }),
        account: {
          id: p.brokerageAccount.id,
          name: p.brokerageAccount.name,
          broker: p.brokerageAccount.broker,
        },
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_realtime_portfolio
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_realtime_portfolio',
    {
      title: 'Real-Time Portfolio',
      description:
        'Get current market values, unrealized P&L, and allocation breakdown from your last brokerage sync.',
      inputSchema: z.object({
        accountId: accountIdSchema,
      }),
    },
    async ({ accountId }) => {
      log.info({ userId, accountId }, 'get_realtime_portfolio');

      const positionWhere = accountId
        ? { userId, brokerageAccountId: accountId }
        : { userId, brokerageAccount: { isActive: true } };

      const balanceWhere = accountId
        ? { userId, brokerageAccountId: accountId }
        : { userId, brokerageAccount: { isActive: true } };

      // If accountId provided, validate ownership
      if (accountId) {
        await buildScopedWhere(userId, accountId);
      }

      const [positions, balances, realizedAgg] = await Promise.all([
        prisma.brokerPosition.findMany({
          where: positionWhere,
          orderBy: [{ marketValue: 'desc' }, { symbol: 'asc' }],
        }),
        prisma.brokerBalance.findMany({
          where: balanceWhere,
        }),
        prisma.realizedClose.aggregate({
          where: { userId, ...(accountId && { brokerageAccountId: accountId }) },
          _sum: { realizedPnL: true },
        }),
      ]);

      const totalMarketValue = positions.reduce((sum, p) => sum + Number(p.marketValue ?? 0), 0);
      const totalCash = balances.reduce((sum, b) => sum + Number(b.cash ?? 0), 0);
      const totalUnrealizedPnL = positions.reduce((sum, p) => sum + Number(p.unrealizedPnL ?? 0), 0);
      const realizedPnL = Number(realizedAgg._sum.realizedPnL ?? 0);

      const stocks = positions.filter((p) => p.positionType === 'stock');
      const options = positions.filter((p) => p.positionType === 'option');
      const total = totalMarketValue + totalCash;

      const result = {
        totalMarketValue: Math.round(totalMarketValue * 100) / 100,
        totalCash: Math.round(totalCash * 100) / 100,
        totalUnrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
        realizedPnL: Math.round(realizedPnL * 100) / 100,
        totalPnL: Math.round((realizedPnL + totalUnrealizedPnL) * 100) / 100,
        allocation: {
          stocks: {
            value: Math.round(stocks.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) * 100) / 100,
            count: stocks.length,
            percentage: total > 0 ? Math.round((stocks.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) / total) * 10000) / 100 : 0,
          },
          options: {
            value: Math.round(options.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) * 100) / 100,
            count: options.length,
            percentage: total > 0 ? Math.round((options.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) / total) * 10000) / 100 : 0,
          },
          cash: {
            value: Math.round(totalCash * 100) / 100,
            percentage: total > 0 ? Math.round((totalCash / total) * 10000) / 100 : 0,
          },
        },
        positions: positions.map((p) => ({
          symbol: p.symbol,
          positionType: p.positionType,
          quantity: Number(p.quantity),
          marketPrice: Number(p.marketPrice ?? 0),
          marketValue: Number(p.marketValue ?? 0),
          avgCostBasis: Number(p.avgCostBasis ?? 0),
          unrealizedPnL: Number(p.unrealizedPnL ?? 0),
          unrealizedPnLPct: Number(p.unrealizedPnLPct ?? 0),
          ...(p.positionType === 'option' && {
            optionType: p.optionType,
            strike: p.strike ? Number(p.strike) : null,
            expiration: p.expiration?.toISOString().split('T')[0] ?? null,
          }),
        })),
        positionCount: positions.length,
        lastSyncAt: positions.length > 0
          ? positions.reduce((latest, p) => p.lastSyncAt > latest ? p.lastSyncAt : latest, positions[0].lastSyncAt).toISOString()
          : null,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
