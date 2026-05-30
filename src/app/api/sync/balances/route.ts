import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Balances API
 *
 * GET /api/sync/balances - Get account balances (cash, buying power)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getUnifiedBalances } from '@/lib/services/snaptrade-positions';

/**
 * GET /api/sync/balances
 * Get account balances for connected brokerages
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId') || undefined;

    log.info({ userId, accountId }, 'Fetching account balances');

    const balances = await getUnifiedBalances(prisma, userId, { accountId });

    // Calculate totals by currency
    const totalsByCurrency: Record<string, { cash: number; buyingPower: number }> = {};

    for (const balance of balances) {
      if (!totalsByCurrency[balance.currency]) {
        totalsByCurrency[balance.currency] = { cash: 0, buyingPower: 0 };
      }
      totalsByCurrency[balance.currency].cash += balance.cash || 0;
      totalsByCurrency[balance.currency].buyingPower += balance.buyingPower || 0;
    }

    log.info({
      userId,
      balanceCount: balances.length,
      currencies: Object.keys(totalsByCurrency),
    }, 'Balances fetched');

    return apiJson({
      data: {
        balances,
        totals: totalsByCurrency,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch balances');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch balances' },
      { status: 500 }
    );
  }
}

