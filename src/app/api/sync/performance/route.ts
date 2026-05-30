import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Performance API
 *
 * GET /api/sync/performance - Get brokerage-provided return rates
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getUnifiedReturnRates } from '@/lib/services/snaptrade-positions';

/**
 * GET /api/sync/performance
 * Get return rates for connected brokerages
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

    log.info({ userId, accountId }, 'Fetching return rates');

    const returnRates = await getUnifiedReturnRates(prisma, userId, { accountId });

    // Group by account
    const ratesByAccount: Record<string, {
      accountName: string;
      rates: Record<string, number>;
      lastSyncAt: Date;
    }> = {};

    for (const rate of returnRates) {
      if (!ratesByAccount[rate.brokerageAccountId]) {
        ratesByAccount[rate.brokerageAccountId] = {
          accountName: rate.brokerageAccountName,
          rates: {},
          lastSyncAt: rate.lastSyncAt,
        };
      }
      ratesByAccount[rate.brokerageAccountId].rates[rate.timeframe] = rate.returnPercent;
      // Keep latest sync time
      if (rate.lastSyncAt > ratesByAccount[rate.brokerageAccountId].lastSyncAt) {
        ratesByAccount[rate.brokerageAccountId].lastSyncAt = rate.lastSyncAt;
      }
    }

    log.info({
      userId,
      rateCount: returnRates.length,
      accountCount: Object.keys(ratesByAccount).length,
    }, 'Return rates fetched');

    return apiJson({
      data: {
        returnRates,
        byAccount: ratesByAccount,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch return rates');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch return rates' },
      { status: 500 }
    );
  }
}

