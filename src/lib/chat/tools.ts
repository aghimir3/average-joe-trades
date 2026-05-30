/**
 * Joey Chat Tools — Vercel AI SDK Tool Definitions
 *
 * Reuses the same Prisma queries as the MCP server tools, but adapted for
 * the Vercel AI SDK `tool()` format. No HTTP calls — queries run directly.
 *
 * All queries are scoped to the authenticated userId.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere, sanitizeOutput } from '@/lib/mcp/security';
import { APP_FEATURE_SECTIONS } from '@/lib/chat/features-data';
import { isSnapTradeConfigured } from '@/lib/services/snaptrade';
import {
  fetchTransactionsForImportLogged,
  getConnectedAccountsLogged,
  SNAPTRADE_SERVICE,
} from '@/lib/services/snaptrade-logged';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { syncAllPositions } from '@/lib/services/snaptrade-positions';
import { createChildLogger } from '@/lib/logger';
import type { Broker } from '@/lib/importers/types';

// ============================================================================
// Helper
// ============================================================================

const optAccountId = z.string().uuid().optional().describe('Filter by brokerage account ID.');
const optSymbol = z.string().max(20).regex(/^[A-Z0-9.]+$/i).optional().describe('Filter by ticker symbol.');
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

function dateBetween(startDate?: string, endDate?: string, field = 'closeDate') {
  if (!startDate && !endDate) return {};
  return {
    [field]: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    },
  };
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createChatTools(userId: string) {
  return {
    // ── Accounts ─────────────────────────────────────────────────────────────
    get_accounts: tool({
      description: 'List brokerage accounts with trade counts and P&L summary.',
      inputSchema: z.object({
        includeInactive: z.boolean().default(false).describe('Include deactivated accounts.'),
      }),
      execute: async ({ includeInactive }) => {
        const where = { userId, ...(includeInactive ? {} : { isActive: true }) };
        const accounts = await prisma.brokerageAccount.findMany({
          where,
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { _count: { select: { ledgerEvents: { where: { deletedAt: null } } } } },
        });
        const accountIds = accounts.map((a) => a.id);
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
        return accounts.map((a) => ({
          id: a.id, broker: a.broker, name: a.name, currency: a.currency,
          isDefault: a.isDefault, isActive: a.isActive,
          source: a.externalAccountId ? 'snaptrade' as const : 'manual' as const,
          canSync: !!a.externalAccountId,
          stats: { tradeCount: a._count.ledgerEvents, openPositions: posMap.get(a.id) ?? 0, totalRealizedPnL: pnlMap.get(a.id) ?? 0 },
        }));
      },
    }),

    // ── Portfolio Summary ────────────────────────────────────────────────────
    get_portfolio_summary: tool({
      description: 'Get portfolio stats: total P&L, win rate, profit factor, trade counts, avg win/loss.',
      inputSchema: z.object({ accountId: optAccountId }),
      execute: async ({ accountId }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const closeWhere = { ...scope, hasUnknownBasis: false };
        const [openCount, allStats, winStats, lossStats] = await Promise.all([
          prisma.derivedPosition.count({ where: { ...scope, quantity: { gt: 0 } } }),
          prisma.realizedClose.aggregate({ where: closeWhere, _sum: { realizedPnL: true }, _count: true }),
          prisma.realizedClose.aggregate({ where: { ...closeWhere, realizedPnL: { gt: 0 } }, _sum: { realizedPnL: true }, _count: true }),
          prisma.realizedClose.aggregate({ where: { ...closeWhere, realizedPnL: { lt: 0 } }, _sum: { realizedPnL: true }, _count: true }),
        ]);
        const totalPnL = Number(allStats._sum.realizedPnL ?? 0);
        const closedTrades = allStats._count;
        const wins = winStats._count;
        const losses = lossStats._count;
        const totalWins = Number(winStats._sum.realizedPnL ?? 0);
        const totalLosses = Math.abs(Number(lossStats._sum.realizedPnL ?? 0));
        return {
          totalPnL, openPositions: openCount, closedTrades,
          winRate: closedTrades > 0 ? Math.round((wins / closedTrades) * 10000) / 100 : 0,
          profitFactor: totalLosses > 0 ? Math.round((totalWins / totalLosses) * 100) / 100 : totalWins > 0 ? Infinity : 0,
          wins, losses,
          avgWin: wins > 0 ? Math.round((totalWins / wins) * 100) / 100 : 0,
          avgLoss: losses > 0 ? Math.round((-totalLosses / losses) * 100) / 100 : 0,
        };
      },
    }),

    // ── Open Positions ───────────────────────────────────────────────────────
    get_positions: tool({
      description: 'Get current open positions with cost basis. Filter by symbol or type.',
      inputSchema: z.object({
        accountId: optAccountId,
        symbol: optSymbol,
        type: z.enum(['stock', 'option', 'all']).default('all').describe('Filter by position type.'),
      }),
      execute: async ({ accountId, symbol, type }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const where = {
          ...scope, quantity: { gt: 0 },
          ...(symbol && { symbol: symbol.toUpperCase() }),
          ...(type !== 'all' && { positionType: type }),
        };
        const positions = await prisma.derivedPosition.findMany({
          where,
          include: { brokerageAccount: { select: { id: true, name: true, broker: true } } },
          orderBy: [{ symbol: 'asc' }, { firstEntryDate: 'asc' }],
        });
        return positions.map((p) => ({
          id: p.id, symbol: p.symbol, positionType: p.positionType, side: p.side,
          quantity: Number(p.quantity), avgPrice: Number(p.avgPrice), costBasis: Number(p.costBasis),
          strategy: p.strategy,
          ...(p.positionType === 'option' && {
            optionType: p.optionType, strike: p.strike ? Number(p.strike) : null,
            expiration: p.expiration?.toISOString().split('T')[0] ?? null,
          }),
          account: { id: p.brokerageAccount.id, name: p.brokerageAccount.name, broker: p.brokerageAccount.broker },
        }));
      },
    }),

    // ── Real-Time Portfolio ──────────────────────────────────────────────────
    get_realtime_portfolio: tool({
      description: 'Get current market values, unrealized P&L, and allocation from last brokerage sync.',
      inputSchema: z.object({ accountId: optAccountId }),
      execute: async ({ accountId }) => {
        if (accountId) await buildScopedWhere(userId, accountId);
        const posWhere = accountId ? { userId, brokerageAccountId: accountId } : { userId, brokerageAccount: { isActive: true } };
        const balWhere = accountId ? { userId, brokerageAccountId: accountId } : { userId, brokerageAccount: { isActive: true } };
        const [positions, balances, realizedAgg] = await Promise.all([
          prisma.brokerPosition.findMany({ where: posWhere, orderBy: [{ marketValue: 'desc' }, { symbol: 'asc' }] }),
          prisma.brokerBalance.findMany({ where: balWhere }),
          prisma.realizedClose.aggregate({ where: { userId, ...(accountId && { brokerageAccountId: accountId }) }, _sum: { realizedPnL: true } }),
        ]);
        const totalMarketValue = positions.reduce((s, p) => s + Number(p.marketValue ?? 0), 0);
        const totalCash = balances.reduce((s, b) => s + Number(b.cash ?? 0), 0);
        const totalUnrealizedPnL = positions.reduce((s, p) => s + Number(p.unrealizedPnL ?? 0), 0);
        const realizedPnL = Number(realizedAgg._sum.realizedPnL ?? 0);
        const stocks = positions.filter((p) => p.positionType === 'stock');
        const options = positions.filter((p) => p.positionType === 'option');
        const total = totalMarketValue + totalCash;
        return {
          totalMarketValue: Math.round(totalMarketValue * 100) / 100,
          totalCash: Math.round(totalCash * 100) / 100,
          totalUnrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
          realizedPnL: Math.round(realizedPnL * 100) / 100,
          allocation: {
            stocks: { value: Math.round(stocks.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) * 100) / 100, count: stocks.length, percentage: total > 0 ? Math.round((stocks.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) / total) * 10000) / 100 : 0 },
            options: { value: Math.round(options.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) * 100) / 100, count: options.length, percentage: total > 0 ? Math.round((options.reduce((s, p) => s + Number(p.marketValue ?? 0), 0) / total) * 10000) / 100 : 0 },
            cash: { value: Math.round(totalCash * 100) / 100, percentage: total > 0 ? Math.round((totalCash / total) * 10000) / 100 : 0 },
          },
          positionCount: positions.length,
          lastSyncAt: positions.length > 0 ? positions.reduce((latest, p) => p.lastSyncAt > latest ? p.lastSyncAt : latest, positions[0].lastSyncAt).toISOString() : null,
        };
      },
    }),

    // ── Search Trades ────────────────────────────────────────────────────────
    search_trades: tool({
      description: 'Search closed trades. Filter by symbol, type, date range, status (winner/loser).',
      inputSchema: z.object({
        accountId: optAccountId, symbol: optSymbol,
        type: z.enum(['stock', 'option', 'all']).default('all'),
        status: z.enum(['winner', 'loser', 'all']).default('all'),
        startDate: optDate.describe('Start date (YYYY-MM-DD).'),
        endDate: optDate.describe('End date (YYYY-MM-DD).'),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ accountId, symbol, type, status, startDate, endDate, limit, offset }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const where = {
          ...scope,
          ...(symbol && { symbol: symbol.toUpperCase() }),
          ...(type !== 'all' && { closeType: type }),
          ...(status === 'winner' && { realizedPnL: { gt: 0 } }),
          ...(status === 'loser' && { realizedPnL: { lt: 0 } }),
          ...dateBetween(startDate, endDate),
        };
        const [trades, total] = await Promise.all([
          prisma.realizedClose.findMany({
            where,
            select: {
              id: true, symbol: true, closeType: true, side: true, optionType: true, strike: true,
              expiration: true, strategy: true, openDate: true, closeDate: true, quantity: true,
              openPrice: true, closePrice: true, realizedPnL: true, closeReason: true,
              hasUnknownBasis: true, isWheelTrade: true,
            },
            orderBy: { closeDate: 'desc' }, skip: offset, take: limit,
          }),
          prisma.realizedClose.count({ where }),
        ]);
        return {
          trades: trades.map((t) => ({
            symbol: t.symbol, type: t.closeType, side: t.side,
            quantity: Number(t.quantity), openPrice: Number(t.openPrice), closePrice: Number(t.closePrice),
            realizedPnL: Number(t.realizedPnL),
            openDate: t.openDate.toISOString().split('T')[0],
            closeDate: t.closeDate.toISOString().split('T')[0],
            holdingDays: Math.ceil((t.closeDate.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24)),
            strategy: t.strategy, isWheelTrade: t.isWheelTrade,
            ...(t.closeType === 'option' && { optionType: t.optionType, strike: t.strike ? Number(t.strike) : null, expiration: t.expiration?.toISOString().split('T')[0] ?? null }),
          })),
          pagination: { total, limit, offset, hasMore: offset + limit < total },
        };
      },
    }),

    // ── Performance ──────────────────────────────────────────────────────────
    get_performance: tool({
      description: 'Top/bottom performers by symbol, monthly P&L breakdown, biggest wins and losses.',
      inputSchema: z.object({ accountId: optAccountId, startDate: optDate, endDate: optDate }),
      execute: async ({ accountId, startDate, endDate }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const where = { ...scope, ...dateBetween(startDate, endDate) };
        const [allTrades, biggestWins, biggestLosses] = await Promise.all([
          prisma.realizedClose.findMany({ where, select: { symbol: true, closeType: true, realizedPnL: true, closeDate: true } }),
          prisma.realizedClose.findMany({ where: { ...where, realizedPnL: { gt: 0 } }, select: { symbol: true, closeType: true, realizedPnL: true, closeDate: true }, orderBy: { realizedPnL: 'desc' }, take: 5 }),
          prisma.realizedClose.findMany({ where: { ...where, realizedPnL: { lt: 0 } }, select: { symbol: true, closeType: true, realizedPnL: true, closeDate: true }, orderBy: { realizedPnL: 'asc' }, take: 5 }),
        ]);
        const symbolMap = new Map<string, { totalPnL: number; tradeCount: number; wins: number }>();
        for (const t of allTrades) {
          const pnl = Number(t.realizedPnL);
          const e = symbolMap.get(t.symbol) ?? { totalPnL: 0, tradeCount: 0, wins: 0 };
          e.totalPnL += pnl; e.tradeCount++; if (pnl > 0) e.wins++;
          symbolMap.set(t.symbol, e);
        }
        const bySymbol = Array.from(symbolMap.entries()).map(([symbol, s]) => ({
          symbol, totalPnL: Math.round(s.totalPnL * 100) / 100, tradeCount: s.tradeCount,
          winRate: s.tradeCount > 0 ? Math.round((s.wins / s.tradeCount) * 10000) / 100 : 0,
        })).sort((a, b) => b.totalPnL - a.totalPnL);
        const monthMap = new Map<string, { totalPnL: number; tradeCount: number; wins: number; losses: number }>();
        for (const t of allTrades) {
          const month = t.closeDate.toISOString().slice(0, 7);
          const pnl = Number(t.realizedPnL);
          const e = monthMap.get(month) ?? { totalPnL: 0, tradeCount: 0, wins: 0, losses: 0 };
          e.totalPnL += pnl; e.tradeCount++; if (pnl > 0) e.wins++; if (pnl < 0) e.losses++;
          monthMap.set(month, e);
        }
        return {
          topPerformers: bySymbol.slice(0, 10),
          needsImprovement: bySymbol.slice(-5).reverse(),
          monthlyBreakdown: Array.from(monthMap.entries()).map(([month, m]) => ({
            month, totalPnL: Math.round(m.totalPnL * 100) / 100, tradeCount: m.tradeCount, wins: m.wins, losses: m.losses,
            winRate: m.tradeCount > 0 ? Math.round((m.wins / m.tradeCount) * 10000) / 100 : 0,
          })).sort((a, b) => a.month.localeCompare(b.month)),
          extremeTrades: {
            biggestWins: biggestWins.map((t) => ({ symbol: t.symbol, type: t.closeType, pnl: Number(t.realizedPnL), date: t.closeDate.toISOString().split('T')[0] })),
            biggestLosses: biggestLosses.map((t) => ({ symbol: t.symbol, type: t.closeType, pnl: Number(t.realizedPnL), date: t.closeDate.toISOString().split('T')[0] })),
          },
        };
      },
    }),

    // ── Trade Metrics ────────────────────────────────────────────────────────
    get_trade_metrics: tool({
      description: 'Advanced metrics: expectancy, max drawdown, win/loss streaks, avg holding period.',
      inputSchema: z.object({ accountId: optAccountId }),
      execute: async ({ accountId }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const trades = await prisma.realizedClose.findMany({
          where: { ...scope, hasUnknownBasis: false },
          select: { realizedPnL: true, openDate: true, closeDate: true, closeType: true },
          orderBy: { closeDate: 'asc' },
        });
        if (trades.length === 0) return { message: 'No trades found.' };
        const pnls = trades.map((t) => Number(t.realizedPnL));
        const wins = pnls.filter((p) => p > 0);
        const losses = pnls.filter((p) => p < 0);
        const totalPnL = pnls.reduce((s, p) => s + p, 0);
        let peak = 0, maxDrawdown = 0, cumulative = 0;
        for (const pnl of pnls) { cumulative += pnl; if (cumulative > peak) peak = cumulative; const dd = peak - cumulative; if (dd > maxDrawdown) maxDrawdown = dd; }
        let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
        let currentType: 'win' | 'loss' | null = null;
        for (const pnl of pnls) {
          const type = pnl > 0 ? 'win' : 'loss';
          if (type === currentType) currentStreak++; else { currentType = type; currentStreak = 1; }
          if (type === 'win' && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
          if (type === 'loss' && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
        }
        const holdingDays = trades.map((t) => Math.ceil((t.closeDate.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24)));
        const winRate = wins.length / pnls.length;
        const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + l, 0) / losses.length) : 0;
        return {
          totalTrades: pnls.length, totalPnL: Math.round(totalPnL * 100) / 100,
          winRate: Math.round(winRate * 10000) / 100, expectancy: Math.round((winRate * avgWin - (1 - winRate) * avgLoss) * 100) / 100,
          maxDrawdown: Math.round(maxDrawdown * 100) / 100, maxWinStreak, maxLossStreak,
          avgHoldingDays: Math.round(holdingDays.reduce((s, d) => s + d, 0) / holdingDays.length),
        };
      },
    }),

    // ── Options Analytics ────────────────────────────────────────────────────
    get_options_analytics: tool({
      description: 'Option trade analysis: DTE buckets, strategy breakdown, premium capture, exit types.',
      inputSchema: z.object({ accountId: optAccountId, startDate: optDate, endDate: optDate }),
      execute: async ({ accountId, startDate, endDate }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const trades = await prisma.realizedClose.findMany({
          where: { ...scope, closeType: 'option', hasUnknownBasis: false, ...dateBetween(startDate, endDate) },
          select: { symbol: true, optionType: true, strike: true, expiration: true, strategy: true, side: true, closeReason: true, openDate: true, closeDate: true, openPrice: true, closePrice: true, quantity: true, realizedPnL: true },
          orderBy: { closeDate: 'desc' },
        });
        if (trades.length === 0) return { message: 'No option trades found.' };
        const dteBuckets = [{ label: '0-7 DTE', min: 0, max: 7 }, { label: '8-14 DTE', min: 8, max: 14 }, { label: '15-30 DTE', min: 15, max: 30 }, { label: '31-45 DTE', min: 31, max: 45 }, { label: '46+ DTE', min: 46, max: Infinity }];
        const dteResults = dteBuckets.map((bucket) => {
          const matching = trades.filter((t) => { if (!t.expiration) return false; const dte = Math.ceil((t.expiration.getTime() - t.openDate.getTime()) / (1000 * 60 * 60 * 24)); return dte >= bucket.min && dte <= bucket.max; });
          const pnls = matching.map((t) => Number(t.realizedPnL));
          const w = pnls.filter((p) => p > 0).length;
          return { label: bucket.label, tradeCount: matching.length, totalPnL: Math.round(pnls.reduce((s, p) => s + p, 0) * 100) / 100, wins: w, losses: pnls.filter((p) => p < 0).length, winRate: matching.length > 0 ? Math.round((w / matching.length) * 10000) / 100 : 0 };
        });
        const stratMap = new Map<string, { totalPnL: number; count: number; wins: number }>();
        for (const t of trades) { const strat = t.strategy ?? 'unknown'; const e = stratMap.get(strat) ?? { totalPnL: 0, count: 0, wins: 0 }; e.totalPnL += Number(t.realizedPnL); e.count++; if (Number(t.realizedPnL) > 0) e.wins++; stratMap.set(strat, e); }
        const pnls = trades.map((t) => Number(t.realizedPnL));
        const totalPnL = pnls.reduce((s, p) => s + p, 0);
        const winsCount = pnls.filter((p) => p > 0).length;
        return {
          summary: { totalTrades: trades.length, totalPnL: Math.round(totalPnL * 100) / 100, winRate: Math.round((winsCount / trades.length) * 10000) / 100, wins: winsCount, losses: pnls.filter((p) => p < 0).length },
          dte: { buckets: dteResults },
          byStrategy: Array.from(stratMap.entries()).map(([strategy, s]) => ({ strategy, tradeCount: s.count, totalPnL: Math.round(s.totalPnL * 100) / 100, winRate: s.count > 0 ? Math.round((s.wins / s.count) * 10000) / 100 : 0 })).sort((a, b) => b.totalPnL - a.totalPnL),
        };
      },
    }),

    // ── Wheel Strategy ───────────────────────────────────────────────────────
    get_wheel_strategy: tool({
      description: 'Wheel strategy analysis: assignment rates, premium collected, per-symbol performance.',
      inputSchema: z.object({ accountId: optAccountId, startDate: optDate, endDate: optDate }),
      execute: async ({ accountId, startDate, endDate }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const wheelTrades = await prisma.realizedClose.findMany({
          where: { ...scope, isWheelTrade: true, hasUnknownBasis: false, ...dateBetween(startDate, endDate) },
          select: { symbol: true, optionType: true, strategy: true, realizedPnL: true, isAssignment: true, wheelCycleId: true },
          orderBy: { closeDate: 'asc' },
        });
        if (wheelTrades.length === 0) return { message: 'No wheel trades found.' };
        const totalPremium = wheelTrades.reduce((s, t) => s + Number(t.realizedPnL), 0);
        const assignments = wheelTrades.filter((t) => t.isAssignment);
        const csps = wheelTrades.filter((t) => t.strategy === 'cash_secured_put');
        const ccs = wheelTrades.filter((t) => t.strategy === 'covered_call');
        const symbolMap = new Map<string, { totalPnL: number; count: number; assignments: number; wins: number }>();
        for (const t of wheelTrades) { const e = symbolMap.get(t.symbol) ?? { totalPnL: 0, count: 0, assignments: 0, wins: 0 }; e.totalPnL += Number(t.realizedPnL); e.count++; if (t.isAssignment) e.assignments++; if (Number(t.realizedPnL) > 0) e.wins++; symbolMap.set(t.symbol, e); }
        const cycleIds = new Set(wheelTrades.filter((t) => t.wheelCycleId).map((t) => t.wheelCycleId));
        return {
          summary: { totalWheelTrades: wheelTrades.length, totalPremium: Math.round(totalPremium * 100) / 100, cashSecuredPuts: csps.length, coveredCalls: ccs.length, assignments: assignments.length, assignmentRate: Math.round((assignments.length / wheelTrades.length) * 10000) / 100, wheelCycles: cycleIds.size },
          bySymbol: Array.from(symbolMap.entries()).map(([symbol, s]) => ({ symbol, tradeCount: s.count, totalPnL: Math.round(s.totalPnL * 100) / 100, assignments: s.assignments, winRate: s.count > 0 ? Math.round((s.wins / s.count) * 10000) / 100 : 0 })).sort((a, b) => b.totalPnL - a.totalPnL),
        };
      },
    }),

    // ── AI Actions ───────────────────────────────────────────────────────────
    get_ai_actions: tool({
      description: 'Actionable AI recommendations for your positions: roll, close, or hold expiring options.',
      inputSchema: z.object({ accountId: optAccountId }),
      execute: async ({ accountId }) => {
        const scope = await buildScopedWhere(userId, accountId);
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const [nearExpiry, openOptions] = await Promise.all([
          prisma.derivedPosition.findMany({
            where: { ...scope, positionType: 'option', quantity: { not: 0 }, expiration: { lte: sevenDaysFromNow, gte: new Date() } },
            select: { id: true, symbol: true, optionType: true, side: true, strategy: true, strike: true, expiration: true, costBasis: true, quantity: true },
            take: 10, orderBy: { expiration: 'asc' },
          }),
          prisma.derivedPosition.count({ where: { ...scope, positionType: 'option', quantity: { not: 0 } } }),
        ]);
        const actions = nearExpiry.map((pos) => {
          const daysToExpiry = pos.expiration ? Math.ceil((pos.expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
          const isShortOption = pos.side === 'short';
          return {
            type: daysToExpiry !== null && daysToExpiry <= 3 ? 'close' : 'roll',
            priority: daysToExpiry !== null && daysToExpiry <= 2 ? 'high' : 'medium',
            symbol: pos.symbol,
            title: `${pos.optionType?.toUpperCase()} ${pos.strike ? Number(pos.strike) : ''} expiring in ${daysToExpiry} days`,
            description: isShortOption ? `Short ${pos.optionType} near expiry. Consider rolling or closing.` : `Long ${pos.optionType} near expiry. Review before time decay accelerates.`,
            daysToExpiration: daysToExpiry, strategy: pos.strategy,
          };
        });
        return sanitizeOutput({ actions, totalCount: actions.length, openOptionPositions: openOptions });
      },
    }),

    // ── AI Status ────────────────────────────────────────────────────────────
    get_ai_status: tool({
      description: 'Check status of your personal ML models: wheel, options, and community model health.',
      inputSchema: z.object({}),
      execute: async () => {
        const [wheelModels, optionsModels, communityModels] = await Promise.all([
          prisma.wheelMLModel.findMany({ where: { userId, isActive: true }, select: { modelType: true, version: true, accuracy: true, loss: true, tradesUsed: true, epochsTrained: true, trainedAt: true } }),
          prisma.optionsMLModel.findMany({ where: { userId, isActive: true }, select: { modelType: true, modelName: true, version: true, accuracy: true, loss: true, tradesUsed: true, epochsTrained: true, trainedAt: true } }),
          prisma.communityMLModel.findMany({ where: { isActive: true }, select: { modelType: true, version: true, accuracy: true, tradesUsed: true, uniqueUsers: true, tickersUsed: true, trainedAt: true } }),
        ]);
        return {
          wheel: wheelModels.map((m) => ({ modelType: m.modelType, version: m.version, accuracy: m.accuracy ? Number(m.accuracy) : null, tradesUsed: m.tradesUsed, trainedAt: m.trainedAt.toISOString() })),
          options: optionsModels.map((m) => ({ modelType: m.modelType, modelName: m.modelName, version: m.version, accuracy: m.accuracy ? Number(m.accuracy) : null, tradesUsed: m.tradesUsed, trainedAt: m.trainedAt.toISOString() })),
          community: communityModels.map((m) => ({ modelType: m.modelType, version: m.version, accuracy: m.accuracy ? Number(m.accuracy) : null, tradesUsed: m.tradesUsed, uniqueUsers: m.uniqueUsers, trainedAt: m.trainedAt.toISOString() })),
          summary: { hasWheelModels: wheelModels.length > 0, hasOptionsModels: optionsModels.length > 0, hasCommunityModels: communityModels.length > 0, totalPersonalModels: wheelModels.length + optionsModels.length },
        };
      },
    }),

    // ── Ticker Recommendation ────────────────────────────────────────────────
    get_ticker_recommendation: tool({
      description: 'Detailed analysis for a specific ticker: your trade history, open positions, and market data.',
      inputSchema: z.object({ symbol: z.string().max(20).regex(/^[A-Z0-9.]+$/i).describe('Ticker symbol (e.g. AAPL).'), accountId: optAccountId }),
      execute: async ({ symbol, accountId }) => {
        const upperSymbol = symbol.toUpperCase();
        const scope = await buildScopedWhere(userId, accountId);
        const [closedTrades, openPositions, brokerPositions] = await Promise.all([
          prisma.realizedClose.findMany({ where: { ...scope, symbol: upperSymbol }, select: { closeType: true, strategy: true, realizedPnL: true, openDate: true, closeDate: true, isWheelTrade: true }, orderBy: { closeDate: 'desc' }, take: 50 }),
          prisma.derivedPosition.findMany({ where: { ...scope, symbol: upperSymbol, quantity: { not: 0 } }, select: { positionType: true, side: true, quantity: true, costBasis: true, avgPrice: true, optionType: true, strike: true, expiration: true, strategy: true } }),
          prisma.brokerPosition.findMany({ where: { userId, symbol: upperSymbol }, select: { marketPrice: true, marketValue: true, unrealizedPnL: true, lastSyncAt: true }, take: 1 }),
        ]);
        const pnls = closedTrades.map((t) => Number(t.realizedPnL));
        const totalPnL = pnls.reduce((s, p) => s + p, 0);
        const wins = pnls.filter((p) => p > 0).length;
        return sanitizeOutput({
          symbol: upperSymbol,
          tradeHistory: { totalTrades: closedTrades.length, totalPnL: Math.round(totalPnL * 100) / 100, winRate: closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 10000) / 100 : 0, wins, losses: pnls.filter((p) => p < 0).length, wheelTrades: closedTrades.filter((t) => t.isWheelTrade).length, strategies: [...new Set(closedTrades.map((t) => t.strategy).filter(Boolean))] },
          currentPositions: openPositions.map((p) => ({ positionType: p.positionType, side: p.side, quantity: Number(p.quantity), costBasis: Number(p.costBasis), strategy: p.strategy, ...(p.positionType === 'option' && { optionType: p.optionType, strike: p.strike ? Number(p.strike) : null, expiration: p.expiration?.toISOString().split('T')[0] ?? null }) })),
          marketData: brokerPositions.length > 0 ? { marketPrice: Number(brokerPositions[0].marketPrice ?? 0), marketValue: Number(brokerPositions[0].marketValue ?? 0), unrealizedPnL: Number(brokerPositions[0].unrealizedPnL ?? 0), lastSyncAt: brokerPositions[0].lastSyncAt.toISOString() } : null,
          hasTradeHistory: closedTrades.length > 0, hasOpenPositions: openPositions.length > 0,
        });
      },
    }),

    // ── Journal Entries ──────────────────────────────────────────────────────
    get_journal_entries: tool({
      description: 'Daily trading journal: mood, notes, lessons learned, market observations.',
      inputSchema: z.object({ startDate: optDate, endDate: optDate, limit: z.number().int().min(1).max(50).default(10) }),
      execute: async ({ startDate, endDate, limit }) => {
        const where = { userId, ...dateBetween(startDate, endDate, 'date') };
        const [entries, total] = await Promise.all([
          prisma.dailyJournal.findMany({ where, orderBy: { date: 'desc' }, take: limit }),
          prisma.dailyJournal.count({ where }),
        ]);
        return sanitizeOutput({
          entries: entries.map((e) => ({
            date: e.date.toISOString().split('T')[0],
            preMarket: { notes: e.preMarketNotes, mood: e.preMarketMood, watchlist: e.watchlist },
            health: { hoursSlept: e.hoursSlept ? Number(e.hoursSlept) : null, sleepQuality: e.sleepQuality, exercised: e.exercised, stressLevel: e.stressLevel },
            postMarket: { notes: e.postMarketNotes, emotionalState: e.emotionalState, followedPlan: e.followedPlan, biggestWin: e.biggestWin, biggestMistake: e.biggestMistake, lessonsLearned: e.lessonsLearned },
            marketCondition: e.marketCondition,
          })),
          total, hasMore: total > limit,
        });
      },
    }),

    // ── Community Insights ───────────────────────────────────────────────────
    get_community_insights: tool({
      description: 'Anonymized aggregate community trading data: popular tickers, win rates, strategy performance.',
      inputSchema: z.object({ symbol: optSymbol }),
      execute: async ({ symbol }) => {
        const upperSymbol = symbol?.toUpperCase();
        const closesWhere = { hasUnknownBasis: false, ...(upperSymbol && { symbol: upperSymbol }) };
        const [totalStats, winStats, optionStats, wheelStats, topSymbols] = await Promise.all([
          prisma.realizedClose.aggregate({ where: closesWhere, _count: true, _sum: { realizedPnL: true } }),
          prisma.realizedClose.aggregate({ where: { ...closesWhere, realizedPnL: { gt: 0 } }, _count: true }),
          prisma.realizedClose.aggregate({ where: { ...closesWhere, closeType: 'option' }, _count: true }),
          prisma.realizedClose.aggregate({ where: { ...closesWhere, isWheelTrade: true }, _count: true }),
          upperSymbol ? Promise.resolve([]) : prisma.realizedClose.groupBy({ by: ['symbol'], where: { hasUnknownBasis: false }, _count: { id: true }, _sum: { realizedPnL: true }, orderBy: { _count: { id: 'desc' } }, take: 15 }),
        ]);
        const uniqueTraders = await prisma.realizedClose.groupBy({ by: ['userId'], where: closesWhere, _count: true });
        const totalTrades = totalStats._count;
        const wins = winStats._count;
        return sanitizeOutput({
          ...(upperSymbol && { symbol: upperSymbol }),
          aggregate: { totalTrades, uniqueTraders: uniqueTraders.length, winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 10000) / 100 : 0, optionTrades: optionStats._count, wheelTrades: wheelStats._count },
          ...(!upperSymbol && { popularTickers: topSymbols.map((s) => ({ symbol: s.symbol, tradeCount: s._count.id, totalPnL: Math.round(Number(s._sum.realizedPnL ?? 0) * 100) / 100 })) }),
        });
      },
    }),

    // ── Market Regimes ───────────────────────────────────────────────────────
    get_market_regimes: tool({
      description: 'Market regime analysis with your personal trade performance correlation by regime.',
      inputSchema: z.object({}),
      execute: async () => {
        const [journals, userTrades] = await Promise.all([
          prisma.dailyJournal.findMany({ where: { marketCondition: { not: null } }, select: { date: true, marketCondition: true }, orderBy: { date: 'desc' }, take: 200 }),
          prisma.realizedClose.findMany({ where: { userId, hasUnknownBasis: false }, select: { closeDate: true, realizedPnL: true }, orderBy: { closeDate: 'desc' }, take: 500 }),
        ]);
        const regimeMap = new Map<string, { count: number; dates: Date[] }>();
        for (const j of journals) { if (!j.marketCondition) continue; const e = regimeMap.get(j.marketCondition) ?? { count: 0, dates: [] }; e.count++; e.dates.push(j.date); regimeMap.set(j.marketCondition, e); }
        const tradeDateMap = new Map<string, number[]>();
        for (const t of userTrades) { const dk = t.closeDate.toISOString().split('T')[0]; const e = tradeDateMap.get(dk) ?? []; e.push(Number(t.realizedPnL)); tradeDateMap.set(dk, e); }
        const regimes = Array.from(regimeMap.entries()).map(([condition, data]) => {
          const tradePnls: number[] = [];
          for (const date of data.dates) { const pnls = tradeDateMap.get(date.toISOString().split('T')[0]); if (pnls) tradePnls.push(...pnls); }
          return { condition, observationCount: data.count, yourTrades: { tradeCount: tradePnls.length, totalPnL: Math.round(tradePnls.reduce((s, p) => s + p, 0) * 100) / 100, winRate: tradePnls.length > 0 ? Math.round((tradePnls.filter((p) => p > 0).length / tradePnls.length) * 10000) / 100 : 0 } };
        });
        const latestJournal = journals.find((j) => j.marketCondition);
        return { currentRegime: latestJournal?.marketCondition ?? 'unknown', lastObserved: latestJournal?.date.toISOString().split('T')[0] ?? null, regimes: regimes.sort((a, b) => b.observationCount - a.observationCount) };
      },
    }),

    // ── App Features ──────────────────────────────────────────────────────────
    get_app_features: tool({
      description:
        'Search the app feature guide. Use when the user asks "how do I…", "what can this app do", "does the app support…", or needs help navigating the app.',
      inputSchema: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Search keyword (e.g. "import", "wheel", "journal"). Omit to list all feature sections.',
          ),
        sectionId: z
          .string()
          .optional()
          .describe(
            'Get full details for a specific section (e.g. "dashboard", "ai-insights", "wheel", "import").',
          ),
      }),
      execute: async ({ query, sectionId }) => {
        // Return a specific section with all sub-features
        if (sectionId) {
          const section = APP_FEATURE_SECTIONS.find((s) => s.id === sectionId);
          if (!section) return { error: `No section found with id "${sectionId}". Valid ids: ${APP_FEATURE_SECTIONS.map((s) => s.id).join(', ')}` };
          return section;
        }

        // Search across all sections and features by keyword
        if (query) {
          const q = query.toLowerCase();
          const matches: { section: string; sectionId: string; feature: string; description: string; howToUse: string; benefit: string }[] = [];
          for (const section of APP_FEATURE_SECTIONS) {
            for (const f of section.features) {
              const haystack = `${section.title} ${f.title} ${f.description} ${f.howToUse} ${f.benefit}`.toLowerCase();
              if (haystack.includes(q)) {
                matches.push({ section: section.title, sectionId: section.id, feature: f.title, description: f.description, howToUse: f.howToUse, benefit: f.benefit });
              }
            }
          }
          if (matches.length === 0) return { message: `No features matched "${query}". Try a broader keyword.`, availableSections: APP_FEATURE_SECTIONS.map((s) => ({ id: s.id, title: s.title })) };
          return { query, matchCount: matches.length, matches };
        }

        // No params → return section summaries
        return {
          totalSections: APP_FEATURE_SECTIONS.length,
          totalFeatures: APP_FEATURE_SECTIONS.reduce((sum, s) => sum + s.features.length, 0),
          sections: APP_FEATURE_SECTIONS.map((s) => ({ id: s.id, title: s.title, description: s.description, featureCount: s.features.length })),
        };
      },
    }),

    // ── Sync Trades ──────────────────────────────────────────────────────────
    sync_trades: tool({
      description:
        'Sync latest trades and positions from connected brokerage accounts via SnapTrade. ' +
        'Call get_accounts first to list account nicknames and identify which accounts can be synced (canSync: true). ' +
        'Ask the user for date range and which account(s) before calling this tool.',
      inputSchema: z.object({
        accountIds: z.array(z.string().uuid()).optional().describe(
          'Internal brokerage account IDs to sync (from get_accounts). Omit to sync all connected accounts.',
        ),
        startDate: optDate.describe('Start date for transaction fetch (YYYY-MM-DD). Default: 90 days ago.'),
        endDate: optDate.describe('End date for transaction fetch (YYYY-MM-DD). Default: today.'),
      }),
      execute: async ({ accountIds, startDate, endDate }) => {
        const log = createChildLogger({ module: 'chat-sync', userId });

        if (!isSnapTradeConfigured()) {
          return { error: 'SnapTrade is not configured. Brokerage sync is not available.' };
        }

        const credential = await prisma.serviceCredential.findFirst({
          where: { userId, service: SNAPTRADE_SERVICE, isActive: true },
        });

        if (!credential) {
          return {
            error: 'No brokerage connected.',
            suggestion: 'Connect a brokerage account from the Accounts page first.',
          };
        }

        const credentials = {
          userId: credential.serviceUserId,
          userSecret: credential.serviceUserSecret,
        };

        const correlationId = crypto.randomUUID();
        const logCtx = { prisma, internalUserId: userId, correlationId, triggeredBy: 'chat_sync' };

        // Get internal accounts linked to SnapTrade
        const linkedAccounts = await prisma.brokerageAccount.findMany({
          where: {
            userId,
            isActive: true,
            externalAccountId: { not: null },
            ...(accountIds ? { id: { in: accountIds } } : {}),
          },
        });

        if (linkedAccounts.length === 0) {
          return {
            error: accountIds
              ? 'None of the specified accounts are connected to SnapTrade.'
              : 'No SnapTrade-linked accounts found.',
            suggestion: 'Connect a brokerage account from the Accounts page.',
          };
        }

        // Get connected accounts from SnapTrade to verify they're still active
        const connectedAccounts = await getConnectedAccountsLogged(logCtx, credentials);
        const connectedIds = new Set(connectedAccounts.map((a) => a.id));
        const syncableAccounts = linkedAccounts.filter(
          (a) => a.externalAccountId && connectedIds.has(a.externalAccountId),
        );

        if (syncableAccounts.length === 0) {
          return {
            error: 'Selected accounts are not currently connected in SnapTrade.',
            suggestion: 'The brokerage connection may have expired. Reconnect from the Accounts page.',
          };
        }

        const effectiveStartDate =
          startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

        log.info(
          { accounts: syncableAccounts.length, startDate: effectiveStartDate, endDate: effectiveEndDate },
          'Chat-initiated sync started',
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
          log.warn({ error: err }, 'Position sync failed during chat sync (non-critical)');
        }

        // Update last sync timestamp
        await prisma.serviceCredential.update({
          where: { id: credential.id },
          data: { lastSyncAt: new Date(), syncStatus: 'success' },
        });

        log.info({ totalImported, totalDuplicates, accountsSynced: accountResults.length }, 'Chat-initiated sync completed');

        return {
          success: true,
          dateRange: { startDate: effectiveStartDate, endDate: effectiveEndDate },
          accountsSynced: accountResults.length,
          totalNewTransactions: totalImported,
          totalDuplicatesSkipped: totalDuplicates,
          derivationRan: totalImported > 0,
          positionsSynced,
          accounts: accountResults,
        };
      },
    }),
  };
}
