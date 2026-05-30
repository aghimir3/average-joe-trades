/**
 * Close Trade Client Component
 *
 * Handles the full close trade flow:
 * 1. Display open positions
 * 2. Allow selection of position to close
 * 3. Show appropriate close form (stock or option)
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, Zap, Search, Package, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CloseStockTradeForm } from './close-stock-trade-form';
import { CloseOptionTradeForm } from './close-option-trade-form';
import { CloseFutureTradeForm } from './close-future-trade-form';
import dynamic from 'next/dynamic';
import { formatCurrency } from '@/lib/utils';
import type { PriceLineInput } from '@/lib/charts/tradingview-utils';

const SymbolChart = dynamic(() => import('@/components/charts/symbol-chart'), {
  ssr: false,
  loading: () => <div className="h-45 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />,
});

interface Position {
  id: string;
  symbol: string;
  positionType: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
  lastEntryDate: string;
  brokerageAccount: {
    id: string;
    name: string;
    broker: string;
  };
}

interface PositionsResponse {
  data: Position[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Fetch open positions from API.
 */
async function fetchPositions(): Promise<PositionsResponse> {
  const response = await fetch('/api/positions?limit=100');
  if (!response.ok) {
    throw new Error('Failed to fetch positions');
  }
  return apiData(await parseApiJson(response));
}

/**
 * Format expiration date for display.
 */
function formatExpiration(expiration: string | null): string {
  if (!expiration) return '';
  const date = new Date(expiration);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format strategy name for display.
 */
function formatStrategy(strategy: string | null): string {
  if (!strategy) return '';
  return strategy
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CloseTradeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get('positionId');

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['positions'],
    queryFn: fetchPositions,
  });

  // Pre-select position if ID is provided in URL
  const positions = data?.data || [];
  if (preselectedId && !selectedPosition && positions.length > 0) {
    const found = positions.find(p => p.id === preselectedId);
    if (found) {
      setSelectedPosition(found);
    }
  }

  // Filter positions by search query
  const filteredPositions = positions.filter(p =>
    p.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate stock and option positions
  const stockPositions = filteredPositions.filter(p => p.positionType === 'stock');
  const optionPositions = filteredPositions.filter(p => p.positionType === 'option');
  const futurePositions = filteredPositions.filter(p => p.positionType === 'future');

  // Handle cancel - go back to position list
  const handleCancel = () => {
    setSelectedPosition(null);
    router.replace('/trade/close');
  };

  // If a position is selected, show the appropriate form with a mini chart
  if (selectedPosition) {
    const closePriceLines: PriceLineInput[] = [
      { price: selectedPosition.avgPrice, title: `Avg Entry ${formatCurrency(selectedPosition.avgPrice)}`, color: '#10b981', lineStyle: 'dashed' },
      ...(selectedPosition.strike
        ? [{ price: selectedPosition.strike, title: `$${selectedPosition.strike} Strike`, color: '#8b5cf6', lineStyle: 'dotted' as const }]
        : []),
    ];

    const form = selectedPosition.positionType === 'stock'
      ? <CloseStockTradeForm position={selectedPosition} onCancel={handleCancel} />
      : selectedPosition.positionType === 'future'
        ? <CloseFutureTradeForm position={selectedPosition} onCancel={handleCancel} />
        : <CloseOptionTradeForm position={selectedPosition} onCancel={handleCancel} />;

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {selectedPosition.symbol} — Recent Price Action
            </h3>
          </div>
          <div className="px-4 pb-3">
            <SymbolChart
              symbol={selectedPosition.symbol}
              defaultTimeRange="1M"
              showTimeControls={false}
              showVolume={false}
              height={180}
              priceLines={closePriceLines}
            />
          </div>
        </div>
        {form}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Close Position
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select an open position to close
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          type="text"
          placeholder="Search by symbol..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 animate-spin text-zinc-400" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-zinc-500">Loading positions...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900">
          <p className="text-red-600 dark:text-red-400">
            Failed to load positions. Please try again.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && positions.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 dark:border-zinc-800 dark:bg-zinc-900 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
            No Open Positions
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            You don&apos;t have any open positions to close.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      )}

      {/* No Results */}
      {!isLoading && !error && positions.length > 0 && filteredPositions.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            No positions matching &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      {/* Stock Positions */}
      {stockPositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1">
            Stock Positions ({stockPositions.length})
          </h2>
          <div className="space-y-2">
            {stockPositions.map((position) => (
              <button
                key={position.id}
                onClick={() => setSelectedPosition(position)}
                className="w-full p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${position.side === 'long' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                      {position.side === 'long' ? (
                        <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {position.symbol}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {position.quantity.toLocaleString()} shares @ ${position.avgPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      ${position.costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {position.brokerageAccount.name}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Option Positions */}
      {optionPositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1">
            Option Positions ({optionPositions.length})
          </h2>
          <div className="space-y-2">
            {optionPositions.map((position) => {
              const isCall = position.optionType === 'call';
              return (
                <button
                  key={position.id}
                  onClick={() => setSelectedPosition(position)}
                  className="w-full p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${isCall ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                        <Zap className={`h-5 w-5 ${isCall ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {position.symbol} ${position.strike?.toFixed(0)} {position.optionType?.toUpperCase()}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                          <span>{position.quantity} contract{position.quantity !== 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span>Exp: {formatExpiration(position.expiration)}</span>
                          {position.strategy && (
                            <>
                              <span>•</span>
                              <span>{formatStrategy(position.strategy)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                        ${(position.costBasis).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${position.side === 'long' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                          {position.side === 'long' ? 'Long' : 'Short'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Future Positions */}
      {futurePositions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-1">
            Futures Positions ({futurePositions.length})
          </h2>
          <div className="space-y-2">
            {futurePositions.map((position) => (
              <button
                key={position.id}
                onClick={() => setSelectedPosition(position)}
                className="w-full p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${position.side === 'long' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                      {position.side === 'long' ? (
                        <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {position.symbol}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {position.quantity.toLocaleString()} contracts @ ${position.avgPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      ${position.costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {position.brokerageAccount.name}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
