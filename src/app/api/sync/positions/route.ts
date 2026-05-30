import { apiJson } from '@/lib/api/response';
/**
 * SnapTrade Positions Sync API
 *
 * POST /api/sync/positions - Sync positions from connected brokerages
 * GET /api/sync/positions - Get unified position view
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { isSnapTradeConfigured } from '@/lib/services/snaptrade';
import {
  syncAllPositions,
  syncPositionsForAccount,
  getUnifiedPositions,
  getUnifiedBalances,
  getUnifiedReturnRates,
  getStablecoinHoldings,
  positionsNeedRefresh,
} from '@/lib/services/snaptrade-positions';
import { SNAPTRADE_SERVICE } from '@/lib/services/snaptrade-logged';
import { z } from 'zod';

const syncSchema = z.object({
  // Use nullish() to accept both null and undefined, then transform null to undefined
  accountId: z.string().uuid().nullish().transform(val => val ?? undefined),
  force: z.boolean().nullish().default(false).transform(val => val ?? false),
});

/**
 * POST /api/sync/positions
 * Sync positions from connected brokerages
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Check if SnapTrade is configured
    if (!isSnapTradeConfigured()) {
      return apiJson(
        {
          error: 'Not Configured',
          message: 'SnapTrade integration is not configured.',
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { accountId, force } = syncSchema.parse(body);

    log.info({ userId, accountId, force }, 'Starting position sync');

    // Check if we need to refresh
    if (!force) {
      const needsRefresh = await positionsNeedRefresh(prisma, userId, 5); // 5 minute freshness
      if (!needsRefresh) {
        log.info({ userId }, 'Positions are fresh, skipping sync');
        return apiJson({
          data: {
            success: true,
            message: 'Positions are already up to date',
            synced: false,
          },
        });
      }
    }

    // Get user's ACTIVE SnapTrade credentials
    const credential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    if (!credential) {
      return apiJson(
        {
          error: 'Not Connected',
          message: 'No brokerage accounts connected. Please connect your account first.',
        },
        { status: 400 }
      );
    }

    const logCtx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: 'sync_positions',
    };

    let results: Map<string, {
      stockPositions: number;
      optionPositions: number;
      futurePositions: number;
      cryptoPositions: number;
      stablecoinPositions: number;
      balances: number;
      returnRates: number;
    }>;

    if (accountId) {
      // Sync specific account
      const account = await prisma.brokerageAccount.findFirst({
        where: { id: accountId, userId },
      });

      if (!account || !account.externalAccountId) {
        return apiJson(
          {
            error: 'Invalid Account',
            message: 'Account not found or not connected to SnapTrade.',
          },
          { status: 400 }
        );
      }

      const credentials = {
        userId: credential.serviceUserId,
        userSecret: credential.serviceUserSecret,
      };

      const result = await syncPositionsForAccount(
        logCtx,
        credentials,
        account.externalAccountId,
        account.id
      );

      results = new Map([[account.id, result]]);
    } else {
      // Sync all accounts
      results = await syncAllPositions(logCtx, userId);
    }

    // Convert Map to plain object for JSON response
    const accountResults: Record<string, {
      stockPositions: number;
      optionPositions: number;
      futurePositions: number;
      cryptoPositions: number;
      stablecoinPositions: number;
      balances: number;
      returnRates: number;
    }> = {};

    for (const [accountId, result] of results) {
      accountResults[accountId] = result;
    }

    const totalStock = Array.from(results.values()).reduce((sum, r) => sum + r.stockPositions, 0);
    const totalOption = Array.from(results.values()).reduce((sum, r) => sum + r.optionPositions, 0);
    const totalFuture = Array.from(results.values()).reduce((sum, r) => sum + r.futurePositions, 0);
    const totalCrypto = Array.from(results.values()).reduce((sum, r) => sum + r.cryptoPositions, 0);
    const totalStablecoin = Array.from(results.values()).reduce((sum, r) => sum + r.stablecoinPositions, 0);

    log.info({
      userId,
      accountCount: results.size,
      totalStockPositions: totalStock,
      totalOptionPositions: totalOption,
      totalFuturePositions: totalFuture,
      totalCryptoPositions: totalCrypto,
      totalStablecoinPositions: totalStablecoin,
    }, 'Position sync complete');

    return apiJson({
      data: {
        success: true,
        message: `Synced ${totalStock} stock, ${totalOption} option, ${totalFuture} futures, ${totalCrypto} crypto, and ${totalStablecoin} stablecoin positions`,
        synced: true,
        accountCount: results.size,
        results: accountResults,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    log.error({ error }, 'Position sync failed');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to sync positions',
        details: process.env.NODE_ENV === 'development'
          ? { errorName, errorMessage, errorStack }
          : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/positions
 * Get unified position view (API + derived positions)
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
    const includeStale = searchParams.get('includeStale') === 'true';
    const includeClosed = searchParams.get('includeClosed') === 'true';

    log.info({ userId, accountId, includeStale, includeClosed }, 'Fetching unified positions');

    // Fetch positions, balances, return rates, and stablecoin holdings in parallel
    const [positions, balances, returnRates, stablecoinHoldings] = await Promise.all([
      getUnifiedPositions(prisma, userId, {
        accountId,
        includeStale,
        includeClosed,
      }),
      getUnifiedBalances(prisma, userId, { accountId }),
      getUnifiedReturnRates(prisma, userId, { accountId }),
      getStablecoinHoldings(prisma, userId, { accountId }),
    ]);

    // Calculate totals
    const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const stockCount = positions.filter(p => p.positionType === 'stock').length;
    const optionCount = positions.filter(p => p.positionType === 'option').length;
    const futureCount = positions.filter(p => p.positionType === 'future').length;
    const cryptoCount = positions.filter(p => p.positionType === 'crypto').length;

    // Calculate total cash and buying power across all accounts/currencies
    const totalCash = balances.reduce((sum, b) => sum + (b.cash || 0), 0);
    const totalBuyingPower = balances.reduce((sum, b) => sum + (b.buyingPower || 0), 0);

    // Calculate total stablecoin balance
    const totalStablecoinBalance = stablecoinHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    // Check if any positions need refresh
    const needsRefresh = await positionsNeedRefresh(prisma, userId, 5);

    log.info({
      userId,
      positionCount: positions.length,
      stockCount,
      optionCount,
      futureCount,
      cryptoCount,
      stablecoinCount: stablecoinHoldings.length,
      totalMarketValue,
      balanceCount: balances.length,
      returnRateCount: returnRates.length,
    }, 'Unified positions fetched');

    return apiJson({
      data: {
        positions,
        balances,
        returnRates,
        stablecoinHoldings,
        summary: {
          totalPositions: positions.length,
          stockPositions: stockCount,
          optionPositions: optionCount,
          futurePositions: futureCount,
          cryptoPositions: cryptoCount,
          totalMarketValue,
          totalUnrealizedPnL,
          totalCash,
          totalBuyingPower,
          totalStablecoinBalance,
          needsRefresh,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch positions');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

