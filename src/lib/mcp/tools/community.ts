/**
 * MCP Tools: Community
 *
 * get_community_insights — Aggregated community trading data (anonymized)
 * get_market_regimes — Current market regime analysis
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-community' });

export function registerCommunityTools(server: McpServer, userId: string) {
  // ──────────────────────────────────────────────────────────────────────────
  // get_community_insights
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_community_insights',
    {
      title: 'Community Insights',
      description:
        'Get anonymized aggregate trading data from the community: popular tickers, average win rates, and strategy performance. All data is aggregated — no individual user data is exposed.',
      inputSchema: z.object({
        symbol: z.string().max(20).regex(/^[A-Z0-9.]+$/i).optional().describe(
          'Filter insights for a specific ticker symbol.',
        ),
      }),
    },
    async ({ symbol }) => {
      log.info({ userId, symbol }, 'get_community_insights');

      // Aggregate community stats from all users (anonymized)
      const upperSymbol = symbol?.toUpperCase();

      const closesWhere = {
        hasUnknownBasis: false,
        ...(upperSymbol && { symbol: upperSymbol }),
      };

      const [totalStats, winStats, optionStats, wheelStats, topSymbols] = await Promise.all([
        prisma.realizedClose.aggregate({
          where: closesWhere,
          _count: true,
          _sum: { realizedPnL: true },
        }),
        prisma.realizedClose.aggregate({
          where: { ...closesWhere, realizedPnL: { gt: 0 } },
          _count: true,
        }),
        prisma.realizedClose.aggregate({
          where: { ...closesWhere, closeType: 'option' },
          _count: true,
        }),
        prisma.realizedClose.aggregate({
          where: { ...closesWhere, isWheelTrade: true },
          _count: true,
        }),
        // Get most traded symbols (community-wide, no userId filter)
        upperSymbol
          ? Promise.resolve([])
          : prisma.realizedClose.groupBy({
              by: ['symbol'],
              where: { hasUnknownBasis: false },
              _count: { id: true },
              _sum: { realizedPnL: true },
              orderBy: { _count: { id: 'desc' } },
              take: 15,
            }),
      ]);

      // Count unique traders (just the count, not IDs)
      const uniqueTraders = await prisma.realizedClose.groupBy({
        by: ['userId'],
        where: closesWhere,
        _count: true,
      });

      const totalTrades = totalStats._count;
      const wins = winStats._count;

      const result = sanitizeOutput({
        ...(upperSymbol && { symbol: upperSymbol }),
        aggregate: {
          totalTrades,
          uniqueTraders: uniqueTraders.length,
          winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 10000) / 100 : 0,
          optionTrades: optionStats._count,
          wheelTrades: wheelStats._count,
        },
        ...(!upperSymbol && {
          popularTickers: topSymbols.map((s) => ({
            symbol: s.symbol,
            tradeCount: s._count.id,
            totalPnL: Math.round(Number(s._sum.realizedPnL ?? 0) * 100) / 100,
          })),
        }),
        note: 'All data is anonymized and aggregated. No individual user data is exposed.',
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_market_regimes
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_market_regimes',
    {
      title: 'Market Regimes',
      description:
        'Analyze community trading performance by market conditions. Shows how the community and your personal trades perform in different market regimes (bullish, bearish, choppy, etc.).',
      inputSchema: z.object({}),
    },
    async () => {
      log.info({ userId }, 'get_market_regimes');

      // Get journal-based market conditions with trade correlation
      const [journals, userTrades] = await Promise.all([
        prisma.dailyJournal.findMany({
          where: { marketCondition: { not: null } },
          select: { date: true, marketCondition: true },
          orderBy: { date: 'desc' },
          take: 200,
        }),
        prisma.realizedClose.findMany({
          where: { userId, hasUnknownBasis: false },
          select: { closeDate: true, realizedPnL: true },
          orderBy: { closeDate: 'desc' },
          take: 500,
        }),
      ]);

      // Group journals by market condition
      const regimeMap = new Map<string, { count: number; dates: Date[] }>();
      for (const j of journals) {
        if (!j.marketCondition) continue;
        const existing = regimeMap.get(j.marketCondition) ?? { count: 0, dates: [] };
        existing.count++;
        existing.dates.push(j.date);
        regimeMap.set(j.marketCondition, existing);
      }

      // Correlate user trades with regimes (by date match)
      const tradeDateMap = new Map<string, number[]>();
      for (const t of userTrades) {
        const dateKey = t.closeDate.toISOString().split('T')[0];
        const existing = tradeDateMap.get(dateKey) ?? [];
        existing.push(Number(t.realizedPnL));
        tradeDateMap.set(dateKey, existing);
      }

      const regimes = Array.from(regimeMap.entries()).map(([condition, data]) => {
        const tradePnls: number[] = [];
        for (const date of data.dates) {
          const dateKey = date.toISOString().split('T')[0];
          const pnls = tradeDateMap.get(dateKey);
          if (pnls) tradePnls.push(...pnls);
        }

        return {
          condition,
          observationCount: data.count,
          yourTrades: {
            tradeCount: tradePnls.length,
            totalPnL: Math.round(tradePnls.reduce((s, p) => s + p, 0) * 100) / 100,
            winRate: tradePnls.length > 0
              ? Math.round((tradePnls.filter((p) => p > 0).length / tradePnls.length) * 10000) / 100
              : 0,
          },
        };
      });

      // Latest regime from most recent journal
      const latestJournal = journals.find((j) => j.marketCondition);

      const result = {
        currentRegime: latestJournal?.marketCondition ?? 'unknown',
        lastObserved: latestJournal?.date.toISOString().split('T')[0] ?? null,
        regimes: regimes.sort((a, b) => b.observationCount - a.observationCount),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
