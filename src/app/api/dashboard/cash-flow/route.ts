import { apiJson } from '@/lib/api/response';
/**
 * Dashboard Cash Flow API route handler.
 *
 * Returns cash flow metrics including:
 * - Contributions/Deposits
 * - Withdrawals
 * - Dividends
 * - Interest
 * - Fees
 * - Transfers
 *
 * Data sources:
 * - LedgerEvent records with CASH_MOVEMENT, FEES_INTEREST, DIVIDENDS_TAX types
 * - SnapTrade activities for connected accounts
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardCashFlow } from '@/lib/dashboard/sample-data';

const querySchema = z.object({
  brokerageAccountId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

interface CashFlowCategory {
  total: number;
  count: number;
  items: Array<{
    date: string;
    amount: number;
    description: string;
    symbol?: string;
  }>;
}

interface PeriodCashFlow {
  contributions: CashFlowCategory;
  withdrawals: CashFlowCategory;
  dividends: CashFlowCategory;
  interest: CashFlowCategory;
  fees: CashFlowCategory;
  transfers: CashFlowCategory;
  netCashFlow: number;
}

interface CashFlowData {
  timeframes: {
    monthly: PeriodCashFlow;
    quarterly: PeriodCashFlow;
    ytd: PeriodCashFlow;
    last12m: PeriodCashFlow;
    lastyear: PeriodCashFlow;
    allTime: PeriodCashFlow;
    customRange: PeriodCashFlow | null;
  };
  periodLabels: {
    monthly: string;
    quarterly: string;
    ytd: string;
    last12m: string;
    lastyear: string;
    allTime: string;
  };
}

/**
 * Categorize a ledger event into cash flow type
 */
function categorizeCashFlow(event: {
  eventType: string;
  transCode: string;
  action: string | null;
  amount: number;
  description: string | null;
}): 'contribution' | 'withdrawal' | 'dividend' | 'interest' | 'fee' | 'transfer' | null {
  const { eventType, transCode, action, amount, description } = event;
  const descLower = (description || '').toLowerCase();

  // Cash Movement events
  if (eventType === 'CASH_MOVEMENT') {
    // Check if it's a deposit/contribution
    if (
      transCode === 'ACH' ||
      descLower.includes('deposit') ||
      descLower.includes('contribution') ||
      descLower.includes('transfer in')
    ) {
      return amount > 0 ? 'contribution' : 'withdrawal';
    }
    // Internal transfers
    if (transCode === 'ITRF' || descLower.includes('transfer')) {
      return 'transfer';
    }
    // Default based on amount sign
    return amount > 0 ? 'contribution' : 'withdrawal';
  }

  // Dividends and Tax events
  if (eventType === 'DIVIDENDS_TAX') {
    if (
      transCode === 'CDIV' ||
      transCode === 'MDIV' ||
      action === 'cash_dividend' ||
      action === 'manufactured_dividend' ||
      descLower.includes('dividend')
    ) {
      return 'dividend';
    }
    if (transCode === 'DTAX' || action === 'tax' || descLower.includes('tax')) {
      return 'fee'; // Taxes treated as fees/costs
    }
  }

  // Fees and Interest events
  if (eventType === 'FEES_INTEREST') {
    if (
      transCode === 'INT' ||
      action === 'interest' ||
      descLower.includes('interest') ||
      descLower.includes('credit interest')
    ) {
      return amount > 0 ? 'interest' : 'fee'; // Positive = earned, negative = paid
    }
    if (
      transCode === 'MINT' ||
      transCode === 'GOLD' ||
      action === 'margin_interest' ||
      action === 'gold_fee' ||
      descLower.includes('margin') ||
      descLower.includes('fee')
    ) {
      return 'fee';
    }
    // Default to fee for unrecognized fees/interest
    return amount < 0 ? 'fee' : 'interest';
  }

  return null;
}

/**
 * Calculate cash flow metrics for a set of events
 */
function calculateCashFlow(events: Array<{
  activityDate: Date;
  eventType: string;
  transCode: string;
  action: string | null;
  amount: number;
  description: string | null;
  symbol: string;
}>): PeriodCashFlow {
  const result: PeriodCashFlow = {
    contributions: { total: 0, count: 0, items: [] },
    withdrawals: { total: 0, count: 0, items: [] },
    dividends: { total: 0, count: 0, items: [] },
    interest: { total: 0, count: 0, items: [] },
    fees: { total: 0, count: 0, items: [] },
    transfers: { total: 0, count: 0, items: [] },
    netCashFlow: 0,
  };

  for (const event of events) {
    const category = categorizeCashFlow(event);
    if (!category) continue;

    const amount = Math.abs(event.amount);
    const item = {
      date: event.activityDate.toISOString().split('T')[0],
      amount: event.amount,
      description: event.description || event.transCode,
      symbol: event.symbol !== 'CASH' ? event.symbol : undefined,
    };

    switch (category) {
      case 'contribution':
        result.contributions.total += amount;
        result.contributions.count += 1;
        result.contributions.items.push(item);
        result.netCashFlow += amount;
        break;
      case 'withdrawal':
        result.withdrawals.total += amount;
        result.withdrawals.count += 1;
        result.withdrawals.items.push(item);
        result.netCashFlow -= amount;
        break;
      case 'dividend':
        result.dividends.total += amount;
        result.dividends.count += 1;
        result.dividends.items.push(item);
        result.netCashFlow += amount;
        break;
      case 'interest':
        result.interest.total += event.amount; // Keep sign for interest
        result.interest.count += 1;
        result.interest.items.push(item);
        result.netCashFlow += event.amount;
        break;
      case 'fee':
        result.fees.total += amount;
        result.fees.count += 1;
        result.fees.items.push(item);
        result.netCashFlow -= amount;
        break;
      case 'transfer':
        result.transfers.total += amount;
        result.transfers.count += 1;
        result.transfers.items.push(item);
        // Transfers don't affect net cash flow (internal moves)
        break;
    }
  }

  // Limit items to most recent 10 per category
  result.contributions.items = result.contributions.items.slice(0, 10);
  result.withdrawals.items = result.withdrawals.items.slice(0, 10);
  result.dividends.items = result.dividends.items.slice(0, 10);
  result.interest.items = result.interest.items.slice(0, 10);
  result.fees.items = result.fees.items.slice(0, 10);
  result.transfers.items = result.transfers.items.slice(0, 10);

  return result;
}

/**
 * Get the start of a period
 */
function getPeriodStart(periodType: 'month' | 'quarter' | 'ytd' | 'last12m'): Date {
  const now = new Date();

  switch (periodType) {
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterMonth, 1);
    }
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    case 'last12m':
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

/**
 * Get the date range for the previous calendar year
 */
function getLastYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  return {
    start: new Date(lastYear, 0, 1),
    end: new Date(lastYear, 11, 31, 23, 59, 59, 999),
  };
}

/**
 * GET /api/dashboard/cash-flow
 *
 * Returns cash flow analytics across different timeframes.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;
    log.info({ userId }, 'Fetching cash flow metrics');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { brokerageAccountId, startDate, endDate } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId }, 'Returning sample dashboard cash flow');
      return apiJson({ data: sampleDashboardCashFlow() });
    }

    // Base where clause - only cash flow event types
    const where: Prisma.LedgerEventWhereInput = {
      userId,
      deletedAt: null,
      eventType: {
        in: ['CASH_MOVEMENT', 'FEES_INTEREST', 'DIVIDENDS_TAX'],
      },
    };

    if (brokerageAccountId) {
      where.brokerageAccountId = brokerageAccountId;
    }

    // Fetch all cash flow events
    const allEvents = await prisma.ledgerEvent.findMany({
      where,
      select: {
        id: true,
        activityDate: true,
        eventType: true,
        transCode: true,
        action: true,
        amount: true,
        description: true,
        symbol: true,
      },
      orderBy: { activityDate: 'desc' },
    });

    // Convert Decimals and filter out null amounts
    const eventsData = allEvents
      .filter(e => e.amount !== null)
      .map(e => ({
        ...e,
        amount: e.amount!.toNumber(),
      }));

    const now = new Date();

    // Filter events for each timeframe
    const monthStart = getPeriodStart('month');
    const quarterStart = getPeriodStart('quarter');
    const ytdStart = getPeriodStart('ytd');
    const last12mStart = getPeriodStart('last12m');
    const lastYearRange = getLastYearRange();

    const monthlyEvents = eventsData.filter(e => e.activityDate >= monthStart);
    const quarterlyEvents = eventsData.filter(e => e.activityDate >= quarterStart);
    const ytdEvents = eventsData.filter(e => e.activityDate >= ytdStart);
    const last12mEvents = eventsData.filter(e => e.activityDate >= last12mStart);
    const lastyearEvents = eventsData.filter(
      e => e.activityDate >= lastYearRange.start && e.activityDate <= lastYearRange.end
    );

    // Calculate metrics for each timeframe
    const timeframeData: CashFlowData['timeframes'] = {
      monthly: calculateCashFlow(monthlyEvents),
      quarterly: calculateCashFlow(quarterlyEvents),
      ytd: calculateCashFlow(ytdEvents),
      last12m: calculateCashFlow(last12mEvents),
      lastyear: calculateCashFlow(lastyearEvents),
      allTime: calculateCashFlow(eventsData),
      customRange: null,
    };

    // Calculate custom range if provided
    if (startDate && endDate) {
      const customStart = new Date(startDate);
      const customEnd = new Date(endDate);
      customEnd.setHours(23, 59, 59, 999);

      const customEvents = eventsData.filter(
        e => e.activityDate >= customStart && e.activityDate <= customEnd
      );
      timeframeData.customRange = calculateCashFlow(customEvents);
    }

    // Calculate period labels
    const periodLabels = {
      monthly: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      quarterly: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      ytd: `${now.getFullYear()} Year to Date`,
      last12m: 'Last 12 Months',
      lastyear: `${now.getFullYear() - 1}`,
      allTime: 'All Time',
    };

    log.info(
      {
        userId,
        totalEvents: eventsData.length,
        hasCustomRange: !!timeframeData.customRange,
      },
      'Cash flow metrics fetched'
    );

    return apiJson({
      data: {
        timeframes: timeframeData,
        periodLabels,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch cash flow metrics');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch cash flow metrics' },
      { status: 500 }
    );
  }
}

