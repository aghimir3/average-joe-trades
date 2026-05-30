/**
 * MCP Tools: Options
 *
 * get_options_analytics — DTE analysis, strategy breakdown, premium capture
 * get_wheel_strategy — Wheel cycles, assignment rates, premium tracking
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, dateSchema, buildScopedWhere, sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-options' });

export function registerOptionsTools(server: McpServer, userId: string) {
  // ──────────────────────────────────────────────────────────────────────────
  // get_options_analytics
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_options_analytics',
    {
      title: 'Options Analytics',
      description:
        'Deep-dive analysis of your option trades: DTE buckets, strategy breakdown (covered calls, cash-secured puts, etc.), win/loss by strategy, and premium capture metrics.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        startDate: dateSchema.describe('Start date (YYYY-MM-DD).'),
        endDate: dateSchema.describe('End date (YYYY-MM-DD).'),
      }),
    },
    async ({ accountId, startDate, endDate }) => {
      log.info({ userId, accountId, startDate, endDate }, 'get_options_analytics');
      const scope = await buildScopedWhere(userId, accountId);

      const dateFilter = (startDate || endDate)
        ? {
            closeDate: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {};

      const trades = await prisma.realizedClose.findMany({
        where: {
          ...scope,
          closeType: 'option',
          hasUnknownBasis: false,
          ...dateFilter,
        },
        select: {
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          strategy: true,
          side: true,
          closeReason: true,
          openDate: true,
          closeDate: true,
          openPrice: true,
          closePrice: true,
          quantity: true,
          realizedPnL: true,
        },
        orderBy: { closeDate: 'desc' },
      });

      if (trades.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ message: 'No option trades found.' }) }],
        };
      }

      // DTE buckets
      const dteBuckets = [
        { label: '0-7 DTE', min: 0, max: 7 },
        { label: '8-14 DTE', min: 8, max: 14 },
        { label: '15-30 DTE', min: 15, max: 30 },
        { label: '31-45 DTE', min: 31, max: 45 },
        { label: '46+ DTE', min: 46, max: Infinity },
      ];

      const dteResults = dteBuckets.map((bucket) => {
        const matching = trades.filter((t) => {
          if (!t.expiration) return false;
          const dte = Math.ceil((t.expiration.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24));
          return dte >= bucket.min && dte <= bucket.max;
        });
        const pnls = matching.map((t) => Number(t.realizedPnL));
        const wins = pnls.filter((p) => p > 0).length;
        return {
          label: bucket.label,
          tradeCount: matching.length,
          totalPnL: Math.round(pnls.reduce((s, p) => s + p, 0) * 100) / 100,
          wins,
          losses: pnls.filter((p) => p < 0).length,
          winRate: matching.length > 0 ? Math.round((wins / matching.length) * 10000) / 100 : 0,
        };
      });

      // Strategy breakdown
      const stratMap = new Map<string, { totalPnL: number; count: number; wins: number }>();
      for (const t of trades) {
        const strat = t.strategy ?? 'unknown';
        const existing = stratMap.get(strat) ?? { totalPnL: 0, count: 0, wins: 0 };
        existing.totalPnL += Number(t.realizedPnL);
        existing.count++;
        if (Number(t.realizedPnL) > 0) existing.wins++;
        stratMap.set(strat, existing);
      }

      const byStrategy = Array.from(stratMap.entries())
        .map(([strategy, s]) => ({
          strategy,
          tradeCount: s.count,
          totalPnL: Math.round(s.totalPnL * 100) / 100,
          winRate: s.count > 0 ? Math.round((s.wins / s.count) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.totalPnL - a.totalPnL);

      // Exit type breakdown
      const exitMap = new Map<string, { count: number; totalPnL: number; wins: number }>();
      for (const t of trades) {
        const reason = t.closeReason;
        const existing = exitMap.get(reason) ?? { count: 0, totalPnL: 0, wins: 0 };
        existing.count++;
        existing.totalPnL += Number(t.realizedPnL);
        if (Number(t.realizedPnL) > 0) existing.wins++;
        exitMap.set(reason, existing);
      }

      const pnls = trades.map((t) => Number(t.realizedPnL));
      const totalPnL = pnls.reduce((s, p) => s + p, 0);
      const winsCount = pnls.filter((p) => p > 0).length;

      const result = {
        summary: {
          totalTrades: trades.length,
          totalPnL: Math.round(totalPnL * 100) / 100,
          winRate: Math.round((winsCount / trades.length) * 10000) / 100,
          wins: winsCount,
          losses: pnls.filter((p) => p < 0).length,
        },
        dte: { buckets: dteResults },
        byStrategy,
        exitTypes: Array.from(exitMap.entries()).map(([exitType, e]) => ({
          exitType,
          count: e.count,
          totalPnL: Math.round(e.totalPnL * 100) / 100,
          winRate: e.count > 0 ? Math.round((e.wins / e.count) * 10000) / 100 : 0,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_wheel_strategy
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_wheel_strategy',
    {
      title: 'Wheel Strategy Analysis',
      description:
        'Analyze your wheel strategy trades: assignment rates, premium collected, wheel cycles, and per-symbol performance.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        startDate: dateSchema.describe('Start date (YYYY-MM-DD).'),
        endDate: dateSchema.describe('End date (YYYY-MM-DD).'),
      }),
    },
    async ({ accountId, startDate, endDate }) => {
      log.info({ userId, accountId, startDate, endDate }, 'get_wheel_strategy');
      const scope = await buildScopedWhere(userId, accountId);

      const dateFilter = (startDate || endDate)
        ? {
            closeDate: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {};

      const wheelTrades = await prisma.realizedClose.findMany({
        where: {
          ...scope,
          isWheelTrade: true,
          hasUnknownBasis: false,
          ...dateFilter,
        },
        select: {
          symbol: true,
          optionType: true,
          strategy: true,
          realizedPnL: true,
          openDate: true,
          closeDate: true,
          closeReason: true,
          isAssignment: true,
          wheelCycleId: true,
          quantity: true,
          openPrice: true,
          strike: true,
        },
        orderBy: { closeDate: 'asc' },
      });

      if (wheelTrades.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ message: 'No wheel strategy trades found.' }) }],
        };
      }

      const totalPremium = wheelTrades.reduce((s, t) => s + Number(t.realizedPnL), 0);
      const assignments = wheelTrades.filter((t) => t.isAssignment);
      const csps = wheelTrades.filter((t) => t.strategy === 'cash_secured_put');
      const ccs = wheelTrades.filter((t) => t.strategy === 'covered_call');

      // Per-symbol breakdown
      const symbolMap = new Map<string, { totalPnL: number; count: number; assignments: number; wins: number }>();
      for (const t of wheelTrades) {
        const existing = symbolMap.get(t.symbol) ?? { totalPnL: 0, count: 0, assignments: 0, wins: 0 };
        existing.totalPnL += Number(t.realizedPnL);
        existing.count++;
        if (t.isAssignment) existing.assignments++;
        if (Number(t.realizedPnL) > 0) existing.wins++;
        symbolMap.set(t.symbol, existing);
      }

      // Unique wheel cycles
      const cycleIds = new Set(wheelTrades.filter((t) => t.wheelCycleId).map((t) => t.wheelCycleId));

      const result = {
        summary: {
          totalWheelTrades: wheelTrades.length,
          totalPremium: Math.round(totalPremium * 100) / 100,
          cashSecuredPuts: csps.length,
          coveredCalls: ccs.length,
          assignments: assignments.length,
          assignmentRate: wheelTrades.length > 0
            ? Math.round((assignments.length / wheelTrades.length) * 10000) / 100
            : 0,
          wheelCycles: cycleIds.size,
        },
        bySymbol: Array.from(symbolMap.entries())
          .map(([symbol, s]) => ({
            symbol,
            tradeCount: s.count,
            totalPnL: Math.round(s.totalPnL * 100) / 100,
            assignments: s.assignments,
            winRate: s.count > 0 ? Math.round((s.wins / s.count) * 10000) / 100 : 0,
          }))
          .sort((a, b) => b.totalPnL - a.totalPnL),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sanitizeOutput(result), null, 2) }],
      };
    },
  );
}
