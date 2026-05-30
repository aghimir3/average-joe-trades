import { apiJson } from '@/lib/api/response';
/**
 * Open Orders API
 *
 * Fetches open/pending orders from SnapTrade-connected accounts
 * Returns orders with current market prices for the securities
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import {
  getAccountOrdersLogged,
  getConnectedAccountsLogged,
  SNAPTRADE_SERVICE,
  type SnapTradeUserCredentials,
  type SnapTradeOrder,
} from '@/lib/services/snaptrade-logged';

interface NormalizedOrder {
  id: string;
  brokerageAccountId: string;
  accountName: string;
  broker: string;
  symbol: string;
  action: 'buy' | 'sell';
  orderType: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  openQuantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
  executionPrice: number | null;
  currentPrice: number | null;
  estimatedValue: number | null;
  timePlaced: Date;
  timeInForce: string;
  expiryDate: Date | null;
  isOption: boolean;
  optionDetails?: {
    type: 'call' | 'put';
    strike: number;
    expiration: string;
  };
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Fetching open orders');

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const state = (searchParams.get('state') as 'all' | 'open' | 'executed') || 'open';
    const days = parseInt(searchParams.get('days') || '30', 10);

    // Get user's ACTIVE SnapTrade credentials
    const credential = await prisma.serviceCredential.findFirst({
      where: {
        userId,
        service: SNAPTRADE_SERVICE,
        isActive: true,
      },
    });

    if (!credential) {
      return apiJson({
        data: {
          orders: [],
          summary: {
            totalOrders: 0,
            pendingBuyValue: 0,
            pendingSellValue: 0,
          },
        },
      });
    }

    const credentials: SnapTradeUserCredentials = {
      userId: credential.serviceUserId,
      userSecret: credential.serviceUserSecret,
    };

    const ctx = {
      prisma,
      internalUserId: userId,
      correlationId,
      triggeredBy: 'getOrders',
    };

    // Get connected SnapTrade accounts
    const connectedAccounts = await getConnectedAccountsLogged(ctx, credentials);

    if (connectedAccounts.length === 0) {
      return apiJson({
        data: {
          orders: [],
          summary: {
            totalOrders: 0,
            pendingBuyValue: 0,
            pendingSellValue: 0,
          },
        },
      });
    }

    // Get linked BrokerageAccounts
    const linkedAccounts = await prisma.brokerageAccount.findMany({
      where: {
        userId,
        externalAccountId: { in: connectedAccounts.map(a => a.id) },
        ...(accountId ? { id: accountId } : {}),
      },
    });

    const accountMap = new Map(linkedAccounts.map(a => [a.externalAccountId, a]));

    // Get current market prices for positions
    const positions = await prisma.brokerPosition.findMany({
      where: {
        userId,
        isStale: false,
      },
      select: {
        symbol: true,
        marketPrice: true,
      },
    });

    const priceMap = new Map<string, number>();
    for (const pos of positions) {
      if (pos.marketPrice) {
        priceMap.set(pos.symbol, Number(pos.marketPrice));
      }
    }

    // Fetch orders for each account
    const allOrders: NormalizedOrder[] = [];

    for (const snapAccount of connectedAccounts) {
      const brokerageAccount = accountMap.get(snapAccount.id);
      if (!brokerageAccount) continue;

      try {
        const orders = await getAccountOrdersLogged(ctx, credentials, snapAccount.id, {
          state,
          days,
        });

        // Normalize orders
        for (const order of orders) {
          // Filter to only pending/open orders if state is 'open'
          const isOpen = ['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'ACCEPTED', 'QUEUED'].some(
            s => order.status?.toUpperCase().includes(s)
          );

          if (state === 'open' && !isOpen) continue;

          const normalizedOrder = normalizeOrder(
            order,
            brokerageAccount.id,
            brokerageAccount.name,
            brokerageAccount.broker,
            priceMap
          );

          if (normalizedOrder) {
            allOrders.push(normalizedOrder);
          }
        }
      } catch (err) {
        log.warn({ err, accountId: snapAccount.id }, 'Failed to fetch orders for account');
      }
    }

    // Sort by time placed (most recent first)
    allOrders.sort((a, b) => b.timePlaced.getTime() - a.timePlaced.getTime());

    // Calculate summary
    const pendingBuyValue = allOrders
      .filter(o => o.action === 'buy' && o.openQuantity > 0)
      .reduce((sum, o) => {
        const price = o.limitPrice || o.currentPrice || 0;
        return sum + price * o.openQuantity;
      }, 0);

    const pendingSellValue = allOrders
      .filter(o => o.action === 'sell' && o.openQuantity > 0)
      .reduce((sum, o) => {
        const price = o.limitPrice || o.currentPrice || 0;
        return sum + price * o.openQuantity;
      }, 0);

    log.info({
      userId,
      totalOrders: allOrders.length,
      pendingBuyValue,
      pendingSellValue,
    }, 'Orders fetched');

    return apiJson({
      data: {
        orders: allOrders,
        summary: {
          totalOrders: allOrders.length,
          pendingBuyValue,
          pendingSellValue,
        },
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch orders');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

function normalizeOrder(
  order: SnapTradeOrder,
  brokerageAccountId: string,
  accountName: string,
  broker: string,
  priceMap: Map<string, number>
): NormalizedOrder | null {
  // Get symbol
  const isOption = !!order.option_symbol;
  let symbol: string;

  if (isOption && order.option_symbol) {
    // Extract underlying from option ticker
    symbol = order.option_symbol.ticker.split(' ')[0] || order.option_symbol.ticker;
  } else if (order.universal_symbol) {
    symbol = order.universal_symbol.symbol || order.universal_symbol.raw_symbol || '';
  } else {
    return null; // Can't determine symbol
  }

  if (!symbol) return null;

  symbol = symbol.toUpperCase();

  const openQuantity = order.open_quantity ?? (order.total_quantity - (order.filled_quantity || 0));
  const currentPrice = priceMap.get(symbol) || null;

  // Calculate estimated value based on limit price or current price
  const priceForEstimate = order.limit_price || currentPrice;
  const estimatedValue = priceForEstimate && openQuantity
    ? priceForEstimate * openQuantity * (isOption ? 100 : 1)
    : null;

  return {
    id: order.brokerage_order_id,
    brokerageAccountId,
    accountName,
    broker,
    symbol,
    action: order.action.toLowerCase().includes('buy') ? 'buy' : 'sell',
    orderType: order.order_type,
    status: order.status,
    quantity: order.total_quantity,
    filledQuantity: order.filled_quantity || 0,
    openQuantity,
    limitPrice: order.limit_price,
    stopPrice: order.stop_price,
    executionPrice: order.execution_price,
    currentPrice,
    estimatedValue,
    timePlaced: new Date(order.time_placed),
    timeInForce: order.time_in_force,
    expiryDate: order.expiry_date ? new Date(order.expiry_date) : null,
    isOption,
    optionDetails: isOption && order.option_symbol
      ? {
          type: order.option_symbol.option_type.toLowerCase() as 'call' | 'put',
          strike: order.option_symbol.strike_price,
          expiration: order.option_symbol.expiration_date,
        }
      : undefined,
  };
}

