'use client';

/**
 * Trade History Tab
 *
 * Displays closed trades with Win/Loss/BE badges, return %, P&L, and filters.
 * Fetches from the existing GET /api/dashboard/trades endpoint.
 * Card layout on mobile, table on desktop.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseApiJson, apiData } from '@/lib/api/client';
import {
  Search,
  X,
  ChevronDown,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatSignedCurrency, formatPercent } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface Trade {
  id: string;
  ledgerEventId: string | null;
  closeEventId: string | null;
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
  costBasis: number | null;
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

interface TradesResponse {
  data: Trade[];
  pagination: {
    total: number;
    totalOpen: number;
    totalClosed: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

type OutcomeFilter = 'all' | 'win' | 'loss' | 'breakeven';
type TypeFilter = 'all' | 'stock' | 'option';

interface TradeHistoryTabProps {
  accountId: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

const ITEMS_PER_PAGE = 25;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getResultBadge(trade: Trade) {
  if (trade.isWin) return <Badge variant="profit">Win</Badge>;
  if (trade.isLoss) return <Badge variant="loss">Loss</Badge>;
  return <Badge variant="warning">B/E</Badge>;
}

function getResultIcon(trade: Trade) {
  if (trade.isWin) return <TrendingUp className="h-4 w-4 text-rh-green" />;
  if (trade.isLoss) return <TrendingDown className="h-4 w-4 text-rh-red" />;
  return <Minus className="h-4 w-4 text-yellow-500" />;
}

// ============================================================================
// Component
// ============================================================================

export function TradeHistoryTab({ accountId }: TradeHistoryTabProps) {
  const [symbolSearch, setSymbolSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);

  // Fetch closed trades
  const { data, isLoading } = useQuery<TradesResponse>({
    queryKey: ['tradeHistory', accountId, typeFilter, displayLimit],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: 'closed',
        limit: String(displayLimit),
        offset: '0',
        type: typeFilter === 'all' ? 'all' : typeFilter,
      });
      if (accountId) params.set('brokerageAccountId', accountId);

      const res = await fetch(`/api/dashboard/trades?${params}`);
      const json = await parseApiJson(res);
      return apiData<TradesResponse>(json);
    },
    staleTime: 2 * 60 * 1000,
  });

  const allTrades = data?.data ?? [];
  const pagination = data?.pagination;

  // Client-side filtering: symbol search + outcome
  const filteredTrades = allTrades.filter(trade => {
    // Symbol search
    if (symbolSearch && !trade.symbol.toLowerCase().includes(symbolSearch.toLowerCase())) {
      return false;
    }
    // Outcome filter
    if (outcomeFilter === 'win' && !trade.isWin) return false;
    if (outcomeFilter === 'loss' && !trade.isLoss) return false;
    if (outcomeFilter === 'breakeven' && (trade.isWin || trade.isLoss)) return false;
    return true;
  });

  const handleLoadMore = () => {
    setDisplayLimit(prev => prev + ITEMS_PER_PAGE);
  };

  const outcomeOptions: { value: OutcomeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'win', label: 'Wins' },
    { value: 'loss', label: 'Losses' },
    { value: 'breakeven', label: 'B/E' },
  ];

  const typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'stock', label: 'Stock' },
    { value: 'option', label: 'Option' },
  ];

  return (
    <Card className="border-zinc-200/50 dark:border-zinc-700/40 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl shadow-sm">
      <CardContent className="p-4 pb-6">
        {/* Filters */}
        <div className="space-y-3 mb-4">
          {/* Symbol search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={symbolSearch}
              onChange={e => setSymbolSearch(e.target.value)}
              placeholder="Search by symbol..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {symbolSearch && (
              <button
                onClick={() => setSymbolSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-3 w-3 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2">
            {/* Outcome pills */}
            <div className="flex gap-1">
              {outcomeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOutcomeFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    outcomeFilter === opt.value
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="w-px bg-zinc-200 dark:bg-zinc-700 mx-1" />

            {/* Type pills */}
            <div className="flex gap-1">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTypeFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    typeFilter === opt.value
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredTrades.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
              <BarChart3 className="h-7 w-7 text-blue-500 dark:text-blue-400" />
            </div>
            {allTrades.length === 0 ? (
              <>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-1">No closed trades yet</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-xs mx-auto">
                  Close a position to see your trade history with P&L breakdowns and performance stats.
                </p>
                <Link
                  href="/positions"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  View positions
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-1">No matching trades</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Try adjusting your filters or search term.
                </p>
              </>
            )}
          </div>
        )}

        {/* Mobile: Card layout */}
        {!isLoading && filteredTrades.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {filteredTrades.map(trade => (
                <div
                  key={trade.id}
                  className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {trade.symbol}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          trade.type === 'stock'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {trade.type}
                        </span>
                      </div>
                      {trade.type === 'option' && trade.strike && (
                        <span className="text-xs text-zinc-500">
                          ${trade.strike} {trade.optionType?.toUpperCase()}
                          {trade.expiration && ` · ${formatDate(trade.expiration)}`}
                        </span>
                      )}
                    </div>
                    {getResultBadge(trade)}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Entry</span>
                      <span className="text-zinc-700 dark:text-zinc-300">${trade.openPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Exit</span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {trade.closePrice !== null ? `$${trade.closePrice.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Opened</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{formatDate(trade.openDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Closed</span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {trade.closeDate ? formatDate(trade.closeDate) : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      {getResultIcon(trade)}
                      <span className={`text-sm font-semibold ${
                        trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'
                      }`}>
                        {formatSignedCurrency(trade.realizedPnL)}
                      </span>
                    </div>
                    <span className={`text-xs font-medium ${
                      trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'
                    }`}>
                      {formatPercent(trade.returnPercent)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block overflow-x-auto scrollbar-none">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-3 px-2 font-medium text-zinc-500">Symbol</th>
                    <th className="text-left py-3 px-2 font-medium text-zinc-500">Type</th>
                    <th className="text-center py-3 px-2 font-medium text-zinc-500">Result</th>
                    <th className="text-right py-3 px-2 font-medium text-zinc-500">Qty</th>
                    <th className="text-right py-3 px-2 font-medium text-zinc-500">Entry</th>
                    <th className="text-right py-3 px-2 font-medium text-zinc-500">Exit</th>
                    <th className="text-left py-3 px-2 font-medium text-zinc-500">Opened</th>
                    <th className="text-left py-3 px-2 font-medium text-zinc-500">Closed</th>
                    <th className="text-right py-3 px-2 font-medium text-zinc-500">Return</th>
                    <th className="text-right py-3 px-2 font-medium text-zinc-500">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map(trade => (
                    <tr
                      key={trade.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <div>
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {trade.symbol}
                          </span>
                          {trade.type === 'option' && trade.strike && (
                            <span className="text-xs text-zinc-500 ml-1">
                              ${trade.strike} {trade.optionType?.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          trade.type === 'stock'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {getResultBadge(trade)}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                        {trade.quantity}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                        ${trade.openPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                        {trade.closePrice !== null ? `$${trade.closePrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 px-2 text-zinc-600 dark:text-zinc-400">
                        {formatDate(trade.openDate)}
                      </td>
                      <td className="py-3 px-2 text-zinc-600 dark:text-zinc-400">
                        {trade.closeDate ? formatDate(trade.closeDate) : '—'}
                      </td>
                      <td className={`py-3 px-2 text-right font-medium ${
                        trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'
                      }`}>
                        {formatPercent(trade.returnPercent)}
                      </td>
                      <td className={`py-3 px-2 text-right font-semibold ${
                        trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'
                      }`}>
                        {formatSignedCurrency(trade.realizedPnL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Load more / count */}
            {pagination && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
                {pagination.hasMore ? (
                  <button
                    onClick={handleLoadMore}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <span className="text-zinc-400">{filteredTrades.length} of {pagination.totalClosed}</span>
                    <span className="text-zinc-300 dark:text-zinc-600">|</span>
                    <span className="font-medium text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400">
                      Load more
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">
                    {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
