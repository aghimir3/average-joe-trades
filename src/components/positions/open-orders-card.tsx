'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Open Orders Card Component
 *
 * Displays pending/open orders from SnapTrade-connected accounts
 * with current market prices for comparison.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  RefreshCw,
  Package,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';

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
  timePlaced: string;
  timeInForce: string;
  expiryDate: string | null;
  isOption: boolean;
  optionDetails?: {
    type: 'call' | 'put';
    strike: number;
    expiration: string;
  };
}

interface OrdersData {
  orders: NormalizedOrder[];
  summary: {
    totalOrders: number;
    pendingBuyValue: number;
    pendingSellValue: number;
  };
}

async function fetchOrders(accountId?: string): Promise<OrdersData> {
  const params = new URLSearchParams({ state: 'open' });
  if (accountId) params.append('accountId', accountId);

  const res = await fetch(`/api/sync/orders?${params}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  const json = await parseApiJson(res);
  return apiData(json);
}


function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function formatExpiration(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

interface OpenOrdersCardProps {
  accountId?: string | null;
  hasSnapTradeConnection?: boolean;
}

export function OpenOrdersCard({ accountId, hasSnapTradeConnection }: OpenOrdersCardProps) {
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['open-orders', accountId],
    queryFn: () => fetchOrders(accountId || undefined),
    enabled: false, // Only fetch when user clicks sync button
    staleTime: Infinity, // Never consider stale since we only fetch on demand
  });

  const orders = data?.orders || [];
  const summary = data?.summary;

  // Don't show if no SnapTrade connection
  if (!hasSnapTradeConnection) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <ShoppingCart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Open Orders</h3>
              {data ? (
                orders.length > 0 ? (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-white">
                    {orders.length}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    0
                  </span>
                )
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                  —
                </span>
              )}
            </div>
            {data ? (
              summary && (summary.pendingBuyValue > 0 || summary.pendingSellValue > 0) ? (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {summary.pendingBuyValue > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(summary.pendingBuyValue)} buying
                    </span>
                  )}
                  {summary.pendingBuyValue > 0 && summary.pendingSellValue > 0 && ' • '}
                  {summary.pendingSellValue > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {formatCurrency(summary.pendingSellValue)} selling
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-zinc-500 mt-0.5">No pending orders</p>
              )
            ) : (
              <p className="text-xs text-zinc-400 mt-0.5">Click refresh to load orders</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    refetch();
                  }}
                  disabled={isFetching}
                >
                  <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh orders</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-zinc-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No open orders</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: NormalizedOrder }) {
  const isBuy = order.action === 'buy';
  const hasCurrentPrice = order.currentPrice != null;
  const hasLimitPrice = order.limitPrice != null;

  // Calculate price difference from current market
  let priceDiff: number | null = null;
  let priceDiffPct: number | null = null;
  if (hasLimitPrice && hasCurrentPrice && order.limitPrice && order.currentPrice) {
    priceDiff = order.limitPrice - order.currentPrice;
    priceDiffPct = (priceDiff / order.currentPrice) * 100;
  }

  // Determine if limit is favorable (below market for buy, above for sell)
  const isFavorable = priceDiff != null && ((isBuy && priceDiff < 0) || (!isBuy && priceDiff > 0));

  return (
    <div className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Symbol & Action */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
            isBuy
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          )}>
            {isBuy ? (
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {order.symbol}
              </span>
              <span className={cn(
                'px-1.5 py-0.5 text-[10px] font-medium rounded',
                isBuy
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              )}>
                {isBuy ? 'BUY' : 'SELL'}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {order.orderType}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{order.openQuantity} {order.isOption ? 'contracts' : 'shares'}</span>
              {order.isOption && order.optionDetails && (
                <span className="text-zinc-400">
                  ${order.optionDetails.strike} {order.optionDetails.type.toUpperCase()} {formatExpiration(order.optionDetails.expiration)}
                </span>
              )}
              <span className="text-zinc-400">•</span>
              <span className="text-zinc-400">{formatRelativeTime(order.timePlaced)}</span>
            </div>
          </div>
        </div>

        {/* Right: Prices */}
        <div className="text-right shrink-0">
          {hasLimitPrice && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(order.limitPrice!)}
                    </span>
                    {priceDiffPct != null && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium',
                        isFavorable
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      )}>
                        {priceDiffPct > 0 ? '+' : ''}{priceDiffPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">Limit Price: {formatCurrency(order.limitPrice!)}</p>
                  {hasCurrentPrice && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Current Market: {formatCurrency(order.currentPrice!)}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hasCurrentPrice && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center justify-end gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Market: {formatCurrency(order.currentPrice!)}
            </p>
          )}
          {order.estimatedValue != null && (
            <p className="text-xs text-zinc-400 mt-0.5">
              Est. Value: {formatCurrency(order.estimatedValue)}
            </p>
          )}
        </div>
      </div>

      {/* Status bar for partially filled */}
      {order.filledQuantity > 0 && order.openQuantity > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500">Partially filled</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {order.filledQuantity} / {order.quantity}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${(order.filledQuantity / order.quantity) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
