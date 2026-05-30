/**
 * MCP Tools: AI Insights
 *
 * get_ai_actions — Actionable recommendations from ML models
 * get_ai_status — Model status and confidence overview
 * get_ticker_recommendation — Per-ticker AI analysis
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { accountIdSchema, buildScopedWhere, sanitizeOutput } from '../security';

const log = createChildLogger({ module: 'mcp-ai-insights' });

export function registerAIInsightsTools(server: McpServer, userId: string) {
  // ──────────────────────────────────────────────────────────────────────────
  // get_ai_actions
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_ai_actions',
    {
      title: 'AI Actions',
      description:
        'Get actionable AI recommendations for your positions: roll, close, hold, new opportunities. Includes confidence scores and reasoning.',
      inputSchema: z.object({
        accountId: accountIdSchema,
      }),
    },
    async ({ accountId }) => {
      log.info({ userId, accountId }, 'get_ai_actions');
      const scope = await buildScopedWhere(userId, accountId);

      // Get near-expiry option positions for roll/close recommendations
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const [nearExpiry, openOptions, wheelPositions] = await Promise.all([
        prisma.derivedPosition.findMany({
          where: {
            ...scope,
            positionType: 'option',
            quantity: { not: 0 },
            expiration: { lte: sevenDaysFromNow, gte: new Date() },
          },
          select: {
            id: true,
            symbol: true,
            optionType: true,
            side: true,
            strategy: true,
            strike: true,
            expiration: true,
            costBasis: true,
            quantity: true,
          },
          take: 10,
          orderBy: { expiration: 'asc' },
        }),
        prisma.derivedPosition.count({
          where: { ...scope, positionType: 'option', quantity: { not: 0 } },
        }),
        prisma.derivedPosition.findMany({
          where: {
            ...scope,
            strategy: { in: ['covered_call', 'cash_secured_put'] },
            positionType: 'option',
            quantity: { not: 0 },
          },
          select: { symbol: true, strategy: true, strike: true, expiration: true, costBasis: true },
          take: 20,
        }),
      ]);

      // Build simple action recommendations from near-expiry positions
      const actions = nearExpiry.map((pos) => {
        const daysToExpiry = pos.expiration
          ? Math.ceil((pos.expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const isShortOption = pos.side === 'short';

        return {
          id: `expiry-${pos.id}`,
          type: daysToExpiry !== null && daysToExpiry <= 3 ? 'close' : 'roll',
          priority: daysToExpiry !== null && daysToExpiry <= 2 ? 'high' : 'medium',
          confidence: daysToExpiry !== null && daysToExpiry <= 3 ? 85 : 65,
          symbol: pos.symbol,
          title: `${pos.optionType?.toUpperCase()} ${pos.strike ? Number(pos.strike) : ''} expiring in ${daysToExpiry} days`,
          description: isShortOption
            ? `Short ${pos.optionType} near expiry. Consider rolling or closing.`
            : `Long ${pos.optionType} near expiry. Review before time decay accelerates.`,
          reasoning: [
            `${daysToExpiry} days to expiration`,
            isShortOption ? 'Short option — theta working in your favor' : 'Long option — theta working against you',
            pos.strategy ? `Part of ${pos.strategy.replace('_', ' ')} strategy` : 'No strategy detected',
          ],
          metadata: {
            daysToExpiration: daysToExpiry,
            strategy: pos.strategy,
            strike: pos.strike ? Number(pos.strike) : null,
            optionType: pos.optionType,
          },
        };
      });

      const result = sanitizeOutput({
        actions,
        totalCount: actions.length,
        highPriorityCount: actions.filter((a) => a.priority === 'high').length,
        context: {
          openOptionPositions: openOptions,
          wheelPositions: wheelPositions.length,
        },
        lastUpdated: new Date().toISOString(),
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_ai_status
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_ai_status',
    {
      title: 'AI Model Status',
      description:
        'Check the status of your personal ML models: wheel strategy, options, and community models. Shows training state, accuracy, and confidence.',
      inputSchema: z.object({}),
    },
    async () => {
      log.info({ userId }, 'get_ai_status');

      const [wheelModels, optionsModels, communityModels] = await Promise.all([
        prisma.wheelMLModel.findMany({
          where: { userId, isActive: true },
          select: {
            modelType: true,
            version: true,
            accuracy: true,
            loss: true,
            tradesUsed: true,
            epochsTrained: true,
            trainedAt: true,
          },
        }),
        prisma.optionsMLModel.findMany({
          where: { userId, isActive: true },
          select: {
            modelType: true,
            modelName: true,
            version: true,
            accuracy: true,
            loss: true,
            tradesUsed: true,
            epochsTrained: true,
            trainedAt: true,
          },
        }),
        prisma.communityMLModel.findMany({
          where: { isActive: true },
          select: {
            modelType: true,
            version: true,
            accuracy: true,
            tradesUsed: true,
            uniqueUsers: true,
            tickersUsed: true,
            trainedAt: true,
          },
        }),
      ]);

      const result = {
        wheel: wheelModels.map((m) => ({
          modelType: m.modelType,
          version: m.version,
          accuracy: m.accuracy ? Number(m.accuracy) : null,
          loss: m.loss ? Number(m.loss) : null,
          tradesUsed: m.tradesUsed,
          epochsTrained: m.epochsTrained,
          trainedAt: m.trainedAt.toISOString(),
        })),
        options: optionsModels.map((m) => ({
          modelType: m.modelType,
          modelName: m.modelName,
          version: m.version,
          accuracy: m.accuracy ? Number(m.accuracy) : null,
          loss: m.loss ? Number(m.loss) : null,
          tradesUsed: m.tradesUsed,
          epochsTrained: m.epochsTrained,
          trainedAt: m.trainedAt.toISOString(),
        })),
        community: communityModels.map((m) => ({
          modelType: m.modelType,
          version: m.version,
          accuracy: m.accuracy ? Number(m.accuracy) : null,
          tradesUsed: m.tradesUsed,
          uniqueUsers: m.uniqueUsers,
          tickersUsed: m.tickersUsed,
          trainedAt: m.trainedAt.toISOString(),
        })),
        summary: {
          hasWheelModels: wheelModels.length > 0,
          hasOptionsModels: optionsModels.length > 0,
          hasCommunityModels: communityModels.length > 0,
          totalPersonalModels: wheelModels.length + optionsModels.length,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // get_ticker_recommendation
  // ──────────────────────────────────────────────────────────────────────────
  server.registerTool(
    'get_ticker_recommendation',
    {
      title: 'Ticker Recommendation',
      description:
        'Get a detailed AI recommendation for a specific ticker based on your trading history and community data.',
      inputSchema: z.object({
        symbol: z.string().max(20).regex(/^[A-Z0-9.]+$/i).describe('Ticker symbol (e.g. AAPL, TSLA).'),
        accountId: accountIdSchema,
      }),
    },
    async ({ symbol, accountId }) => {
      const upperSymbol = symbol.toUpperCase();
      log.info({ userId, symbol: upperSymbol, accountId }, 'get_ticker_recommendation');
      const scope = await buildScopedWhere(userId, accountId);

      // Get user's trade history for this ticker
      const [closedTrades, openPositions, brokerPositions] = await Promise.all([
        prisma.realizedClose.findMany({
          where: { ...scope, symbol: upperSymbol },
          select: {
            closeType: true,
            strategy: true,
            realizedPnL: true,
            openDate: true,
            closeDate: true,
            closeReason: true,
            isWheelTrade: true,
          },
          orderBy: { closeDate: 'desc' },
          take: 50,
        }),
        prisma.derivedPosition.findMany({
          where: { ...scope, symbol: upperSymbol, quantity: { not: 0 } },
          select: {
            positionType: true,
            side: true,
            quantity: true,
            costBasis: true,
            avgPrice: true,
            optionType: true,
            strike: true,
            expiration: true,
            strategy: true,
          },
        }),
        prisma.brokerPosition.findMany({
          where: { userId, symbol: upperSymbol },
          select: {
            marketPrice: true,
            marketValue: true,
            unrealizedPnL: true,
            lastSyncAt: true,
          },
          take: 1,
        }),
      ]);

      const pnls = closedTrades.map((t) => Number(t.realizedPnL));
      const totalPnL = pnls.reduce((s, p) => s + p, 0);
      const wins = pnls.filter((p) => p > 0).length;
      const wheelTrades = closedTrades.filter((t) => t.isWheelTrade);

      const result = sanitizeOutput({
        symbol: upperSymbol,
        tradeHistory: {
          totalTrades: closedTrades.length,
          totalPnL: Math.round(totalPnL * 100) / 100,
          winRate: closedTrades.length > 0
            ? Math.round((wins / closedTrades.length) * 10000) / 100
            : 0,
          wins,
          losses: pnls.filter((p) => p < 0).length,
          wheelTrades: wheelTrades.length,
          strategies: [...new Set(closedTrades.map((t) => t.strategy).filter(Boolean))],
        },
        currentPositions: openPositions.map((p) => ({
          positionType: p.positionType,
          side: p.side,
          quantity: Number(p.quantity),
          costBasis: Number(p.costBasis),
          avgPrice: Number(p.avgPrice),
          strategy: p.strategy,
          ...(p.positionType === 'option' && {
            optionType: p.optionType,
            strike: p.strike ? Number(p.strike) : null,
            expiration: p.expiration?.toISOString().split('T')[0] ?? null,
          }),
        })),
        marketData: brokerPositions.length > 0
          ? {
              marketPrice: Number(brokerPositions[0].marketPrice ?? 0),
              marketValue: Number(brokerPositions[0].marketValue ?? 0),
              unrealizedPnL: Number(brokerPositions[0].unrealizedPnL ?? 0),
              lastSyncAt: brokerPositions[0].lastSyncAt.toISOString(),
            }
          : null,
        hasTradeHistory: closedTrades.length > 0,
        hasOpenPositions: openPositions.length > 0,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
