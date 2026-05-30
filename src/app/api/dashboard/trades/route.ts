import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Trades API route handler.
 *
 * Returns trades (both open and closed positions) for the trades table.
 * Supports filtering by status, type, symbol, and date.
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardTrades } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).default(20),
  offset: z.coerce.number().min(0).default(0),
  symbol: z.string().optional(),
  type: z.enum(['stock', 'option', 'future', 'all']).default('all'),
  status: z.enum(['open', 'closed', 'all']).default('closed'),
  date: z.string().optional(), // For filtering by specific date (YYYY-MM-DD)
  startDate: z.string().optional(), // For filtering by date range start (YYYY-MM-DD)
  endDate: z.string().optional(), // For filtering by date range end (YYYY-MM-DD)
});

interface FormattedTrade {
  id: string;
  ledgerEventId: string | null; // Source ledger event ID for editing (open entry)
  closeEventId: string | null; // Close ledger event ID for editing (close entry)
  brokerageAccountId: string;
  brokerageAccountName: string;
  broker: string;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  openDate: string;
  closeDate: string | null;
  openPrice: number;
  closePrice: number | null;
  costBasis: number | null; // Total cost basis (for accurate size calculation)
  realizedPnL: number | null;
  closeReason: string | null;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  returnPercent: number | null;
  status: 'open' | 'closed';
  isWin: boolean;
  isLoss: boolean;
}

/**
 * GET /api/dashboard/trades
 *
 * Returns trades for dashboard display.
 * Supports both open positions and closed trades.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching dashboard trades');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId, limit, offset, symbol, type, status, date, startDate, endDate } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard trades');
      return apiJson(sampleDashboardTrades({
        limit,
        offset,
        symbol,
        type,
        status,
        date,
        startDate,
        endDate,
      }));
    }

    const allTrades: FormattedTrade[] = [];
    let totalClosed = 0;
    let totalOpen = 0;

    // Fetch closed trades if requested
    if (status === 'closed' || status === 'all') {
      const closeWhere: Prisma.RealizedCloseWhereInput = { userId };

      if (brokerageAccountId) {
        closeWhere.brokerageAccountId = brokerageAccountId;
      }

      if (symbol) {
        closeWhere.symbol = { contains: symbol.toUpperCase() };
      }

      if (type !== 'all') {
        closeWhere.closeType = type;
      }

      if (date) {
        const targetDate = new Date(date);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        closeWhere.closeDate = {
          gte: targetDate,
          lt: nextDay,
        };
      } else if (startDate && endDate) {
        // Date range filter
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1); // Include the end date
        closeWhere.closeDate = {
          gte: start,
          lt: end,
        };
      }

      const [closedTrades, closedCount] = await Promise.all([
        prisma.realizedClose.findMany({
          where: closeWhere,
          include: {
            brokerageAccount: {
              select: { id: true, name: true, broker: true },
            },
            ledgerLinks: {
              select: { openEventId: true, closeEventId: true, linkType: true },
            },
          },
          orderBy: { closeDate: 'desc' },
          take: status === 'all' ? Math.ceil(limit / 2) : limit,
          skip: status === 'all' ? 0 : offset,
        }),
        prisma.realizedClose.count({ where: closeWhere }),
      ]);

      totalClosed = closedCount;

      const formattedClosed: FormattedTrade[] = closedTrades.map(t => {
        // Find the link with openEventId (partial_open link) - take first one
        const openLink = t.ledgerLinks.find(l => l.openEventId !== null);
        // Find the link with closeEventId (close link)
        const closeLink = t.ledgerLinks.find(l => l.closeEventId !== null);

        // For closed trades, openPrice is per-share, so calculate costBasis
        const multiplier = t.closeType === 'option' ? 100 : 1;
        const costBasis = t.openPrice.toNumber() * t.quantity.toNumber() * multiplier;
        const realizedPnL = t.realizedPnL.toNumber();
        const returnPercent = costBasis > 0 ? (realizedPnL / costBasis) * 100 : null;

        return {
          id: t.id,
          ledgerEventId: openLink?.openEventId ?? null,
          closeEventId: closeLink?.closeEventId ?? null,
          brokerageAccountId: t.brokerageAccountId,
          brokerageAccountName: t.brokerageAccount.name,
          broker: t.brokerageAccount.broker,
          symbol: t.symbol,
          type: t.closeType,
          side: t.side,
          quantity: t.quantity.toNumber(),
          openDate: t.openDate.toISOString().split('T')[0],
          closeDate: t.closeDate.toISOString().split('T')[0],
          openPrice: t.openPrice.toNumber(),
          closePrice: t.closePrice.toNumber(),
          costBasis,
          realizedPnL,
          closeReason: t.closeReason,
          optionType: t.optionType,
          strike: t.strike?.toNumber() ?? null,
          expiration: t.expiration?.toISOString().split('T')[0] ?? null,
          strategy: t.strategy,
          returnPercent,
          status: 'closed' as const,
          isWin: realizedPnL > 0,
          isLoss: realizedPnL < 0,
        };
      });

      allTrades.push(...formattedClosed);
    }

    // Fetch open positions if requested
    if (status === 'open' || status === 'all') {
      const openWhere: Prisma.DerivedPositionWhereInput = {
        userId,
        quantity: { gt: 0 },
      };

      if (brokerageAccountId) {
        openWhere.brokerageAccountId = brokerageAccountId;
      }

      if (symbol) {
        openWhere.symbol = { contains: symbol.toUpperCase() };
      }

      if (type !== 'all') {
        openWhere.positionType = type;
      }

      if (date) {
        const targetDate = new Date(date);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        openWhere.firstEntryDate = {
          gte: targetDate,
          lt: nextDay,
        };
      } else if (startDate && endDate) {
        // Date range filter
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1); // Include the end date
        openWhere.firstEntryDate = {
          gte: start,
          lt: end,
        };
      }

      const [openPositions, openCount] = await Promise.all([
        prisma.derivedPosition.findMany({
          where: openWhere,
          include: {
            brokerageAccount: {
              select: { id: true, name: true, broker: true },
            },
            ledgerLinks: {
              where: { openEventId: { not: null } },
              select: { openEventId: true },
              take: 1,
            },
          },
          orderBy: { firstEntryDate: 'desc' },
          take: status === 'all' ? Math.ceil(limit / 2) : limit,
          skip: status === 'all' ? 0 : offset,
        }),
        prisma.derivedPosition.count({ where: openWhere }),
      ]);

      totalOpen = openCount;

      const formattedOpen: FormattedTrade[] = openPositions.map(p => ({
        id: p.id,
        ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
        closeEventId: null, // Open positions don't have a close event
        brokerageAccountId: p.brokerageAccountId,
        brokerageAccountName: p.brokerageAccount.name,
        broker: p.brokerageAccount.broker,
        symbol: p.symbol,
        type: p.positionType,
        side: p.side,
        quantity: p.quantity.toNumber(),
        openDate: p.firstEntryDate.toISOString().split('T')[0],
        closeDate: null,
        openPrice: p.avgPrice.toNumber(),
        closePrice: null,
        costBasis: p.costBasis.toNumber(), // Use costBasis directly for accurate size
        realizedPnL: null,
        closeReason: null,
        optionType: p.optionType,
        strike: p.strike?.toNumber() ?? null,
        expiration: p.expiration?.toISOString().split('T')[0] ?? null,
        strategy: p.strategy,
        returnPercent: null,
        status: 'open' as const,
        isWin: false,
        isLoss: false,
      }));

      allTrades.push(...formattedOpen);
    }

    // Sort by date (most recent first)
    allTrades.sort((a, b) => {
      const dateA = a.closeDate || a.openDate;
      const dateB = b.closeDate || b.openDate;
      return dateB.localeCompare(dateA);
    });

    // Apply pagination for 'all' status
    const paginatedTrades = status === 'all'
      ? allTrades.slice(offset, offset + limit)
      : allTrades;

    const total = status === 'all' ? totalClosed + totalOpen : (status === 'closed' ? totalClosed : totalOpen);

    log.info({ userId, count: paginatedTrades.length, total, status }, 'Dashboard trades fetched');

    return apiJson({
      data: paginatedTrades,
      pagination: {
        total,
        totalOpen,
        totalClosed,
        limit,
        offset,
        hasMore: offset + paginatedTrades.length < total,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch dashboard trades');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

