/**
 * MCP Tools: Analytics
 *
 * get_performance — Top/bottom performers, monthly breakdown, biggest wins/losses
 * get_trade_metrics — Win rate, Sharpe-like metrics, max drawdown, expectancy
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, dateSchema, buildScopedWhere } from '../security';

const log = createChildLogger({ module: 'mcp-analytics' });

export function registerAnalyticsTools(server: McpServer, userId: string) {
  // ──────────────────────────────────────────────────────────────────────────
  // get_performance
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_performance',
    {
      title: 'Performance Analytics',
      description:
        'Get top/bottom performers by symbol, monthly P&L breakdown, and your biggest wins and losses.',
      inputSchema: z.object({
        accountId: accountIdSchema,
        startDate: dateSchema.describe('Start date (YYYY-MM-DD).'),
        endDate: dateSchema.describe('End date (YYYY-MM-DD).'),
      }),
    },
    async ({ accountId, startDate, endDate }) => {
      log.info({ userId, accountId, startDate, endDate }, 'get_performance');
      const scope = await buildScopedWhere(userId, accountId);

      const dateFilter = (startDate || endDate)
        ? {
            closeDate: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {};

      const where = { ...scope, ...dateFilter };

      const [allTrades, biggestWins, biggestLosses] = await Promise.all([
        prisma.realizedClose.findMany({
          where,
          select: {
            symbol: true,
            closeType: true,
            realizedPnL: true,
            closeDate: true,
            hasUnknownBasis: true,
          },
        }),
        prisma.realizedClose.findMany({
          where: { ...where, realizedPnL: { gt: 0 } },
          select: { id: true, symbol: true, closeType: true, realizedPnL: true, closeDate: true },
          orderBy: { realizedPnL: 'desc' },
          take: 5,
        }),
        prisma.realizedClose.findMany({
          where: { ...where, realizedPnL: { lt: 0 } },
          select: { id: true, symbol: true, closeType: true, realizedPnL: true, closeDate: true },
          orderBy: { realizedPnL: 'asc' },
          take: 5,
        }),
      ]);

      // Group by symbol
      const symbolMap = new Map<string, { totalPnL: number; tradeCount: number; wins: number }>();
      for (const t of allTrades) {
        const pnl = Number(t.realizedPnL);
        const existing = symbolMap.get(t.symbol) ?? { totalPnL: 0, tradeCount: 0, wins: 0 };
        existing.totalPnL += pnl;
        existing.tradeCount++;
        if (pnl > 0) existing.wins++;
        symbolMap.set(t.symbol, existing);
      }

      const bySymbol = Array.from(symbolMap.entries())
        .map(([symbol, s]) => ({
          symbol,
          totalPnL: Math.round(s.totalPnL * 100) / 100,
          tradeCount: s.tradeCount,
          winRate: s.tradeCount > 0 ? Math.round((s.wins / s.tradeCount) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.totalPnL - a.totalPnL);

      // Monthly breakdown
      const monthMap = new Map<string, { totalPnL: number; tradeCount: number; wins: number; losses: number }>();
      for (const t of allTrades) {
        const month = t.closeDate.toISOString().slice(0, 7); // YYYY-MM
        const pnl = Number(t.realizedPnL);
        const existing = monthMap.get(month) ?? { totalPnL: 0, tradeCount: 0, wins: 0, losses: 0 };
        existing.totalPnL += pnl;
        existing.tradeCount++;
        if (pnl > 0) existing.wins++;
        if (pnl < 0) existing.losses++;
        monthMap.set(month, existing);
      }

      const monthlyBreakdown = Array.from(monthMap.entries())
        .map(([month, m]) => ({
          month,
          totalPnL: Math.round(m.totalPnL * 100) / 100,
          tradeCount: m.tradeCount,
          wins: m.wins,
          losses: m.losses,
          winRate: m.tradeCount > 0 ? Math.round((m.wins / m.tradeCount) * 10000) / 100 : 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const result = {
        topPerformers: bySymbol.slice(0, 10),
        needsImprovement: bySymbol.slice(-5).reverse(),
        monthlyBreakdown,
        extremeTrades: {
          biggestWins: biggestWins.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            type: t.closeType,
            pnl: Number(t.realizedPnL),
            date: t.closeDate.toISOString().split('T')[0],
          })),
          biggestLosses: biggestLosses.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            type: t.closeType,
            pnl: Number(t.realizedPnL),
            date: t.closeDate.toISOString().split('T')[0],
          })),
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_trade_metrics
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_trade_metrics',
    {
      title: 'Trade Metrics',
      description:
        'Get advanced trading metrics: expectancy, max drawdown, largest winning/losing streak, avg holding period.',
      inputSchema: z.object({
        accountId: accountIdSchema,
      }),
    },
    async ({ accountId }) => {
      log.info({ userId, accountId }, 'get_trade_metrics');
      const scope = await buildScopedWhere(userId, accountId);

      const trades = await prisma.realizedClose.findMany({
        where: { ...scope, hasUnknownBasis: false },
        select: {
          realizedPnL: true,
          openDate: true,
          closeDate: true,
          closeType: true,
        },
        orderBy: { closeDate: 'asc' },
      });

      if (trades.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ message: 'No trades found for metrics calculation.' }) }],
        };
      }

      const pnls = trades.map((t) => Number(t.realizedPnL));
      const wins = pnls.filter((p) => p > 0);
      const losses = pnls.filter((p) => p < 0);
      const totalPnL = pnls.reduce((s, p) => s + p, 0);
      const avgPnL = totalPnL / pnls.length;

      // Max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let cumulative = 0;
      for (const pnl of pnls) {
        cumulative += pnl;
        if (cumulative > peak) peak = cumulative;
        const drawdown = peak - cumulative;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Streaks
      let currentStreak = 0;
      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let currentType: 'win' | 'loss' | null = null;
      for (const pnl of pnls) {
        const type = pnl > 0 ? 'win' : 'loss';
        if (type === currentType) {
          currentStreak++;
        } else {
          currentType = type;
          currentStreak = 1;
        }
        if (type === 'win' && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
        if (type === 'loss' && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
      }

      // Average holding period
      const holdingDays = trades.map((t) =>
        Math.ceil((t.closeDate.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const avgHoldingDays = Math.round(holdingDays.reduce((s, d) => s + d, 0) / holdingDays.length);

      // Expectancy
      const winRate = wins.length / pnls.length;
      const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + l, 0) / losses.length) : 0;
      const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

      const result = {
        totalTrades: pnls.length,
        totalPnL: Math.round(totalPnL * 100) / 100,
        winRate: Math.round(winRate * 10000) / 100,
        avgPnL: Math.round(avgPnL * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(-avgLoss * 100) / 100,
        expectancy: Math.round(expectancy * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        maxWinStreak,
        maxLossStreak,
        avgHoldingDays,
        stockTrades: trades.filter((t) => t.closeType === 'stock').length,
        optionTrades: trades.filter((t) => t.closeType === 'option').length,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
