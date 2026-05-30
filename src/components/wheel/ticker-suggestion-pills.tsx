'use client';

/**
 * Ticker Suggestion Pills
 *
 * Shared component for showing user's position tickers as clickable pills.
 * Used in Options Scanner and Community Insights.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn, formatCompactCurrency } from '@/lib/utils';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { fetchPositionsData } from '@/components/dashboard/lib/dashboard-api';

// ============================================================================
// Types
// ============================================================================

interface PositionTicker {
  symbol: string;
  costBasis: number;
  hasOptions: boolean;
  shares?: number;
  marketValue?: number;
}

interface TickerSuggestionPillsProps {
  onTickerSelect: (symbol: string) => void;
  selectedTicker?: string | null;
  maxPills?: number;
  showCostBasis?: boolean;
  emptyMessage?: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function TickerSuggestionPills({
  onTickerSelect,
  selectedTicker,
  maxPills = 6,
  showCostBasis = true,
  emptyMessage = 'Enter any ticker to search',
  className,
}: TickerSuggestionPillsProps) {
  const { selectedAccountId } = useSelectedAccount();

  // Fetch user's positions for ticker suggestions
  const { data: positionsData } = useQuery({
    queryKey: ['positions', selectedAccountId],
    queryFn: () => fetchPositionsData(selectedAccountId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Get unique tickers from positions, sorted by cost basis (as proxy for position size)
  const positionTickers = useMemo((): PositionTicker[] => {
    if (!positionsData) return [];

    // Crypto and stablecoin symbols to exclude - these don't have options
    const EXCLUDED_SYMBOLS = new Set([
      // Crypto
      'BTC', 'ETH', 'SOL', 'DOGE', 'SHIB', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC',
      'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL', 'THETA',
      'ETC', 'XMR', 'AAVE', 'EOS', 'MKR', 'XTZ', 'NEO', 'COMP', 'SUSHI', 'YFI',
      'SNX', 'CRV', 'BAT', 'ZRX', 'ENJ', 'MANA', 'SAND', 'APE', 'PEPE', 'BONK',
      'WIF', 'FLOKI', 'NEAR', 'FTM', 'INJ', 'SEI', 'TIA', 'SUI', 'APT', 'ARB',
      'OP', 'BLUR', 'PYTH', 'JTO', 'JUP', 'HBAR', 'TON', 'HNT', 'RNDR', 'FET',
      'AGIX', 'GRT', 'OCEAN', 'ROSE', 'EGLD', 'QNT', 'BNB', 'HYPE',
      // Stablecoins
      'USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD',
    ]);

    const tickerMap = new Map<string, PositionTicker>();

    for (const stock of positionsData.stocks) {
      const costBasis = Number(stock.costBasis) || 0;
      const shares = Number(stock.quantity) || 0;
      // Use costBasis as marketValue proxy since we don't have real-time prices here
      const marketValue = costBasis;

      // Skip invalid entries and crypto/stablecoins
      if (!stock.symbol || costBasis === 0 || EXCLUDED_SYMBOLS.has(stock.symbol)) continue;

      const existing = tickerMap.get(stock.symbol);
      if (existing) {
        existing.costBasis += costBasis;
        existing.shares = (existing.shares || 0) + shares;
        existing.marketValue = (existing.marketValue || 0) + marketValue;
      } else {
        tickerMap.set(stock.symbol, {
          symbol: stock.symbol,
          costBasis,
          hasOptions: false,
          shares,
          marketValue,
        });
      }
    }

    // Mark tickers that have associated options (extract underlying from option symbol)
    for (const option of positionsData.options) {
      // Option symbol format typically includes the underlying ticker
      // Extract the ticker from the option symbol (usually the first part before space or numbers)
      const optionSymbol = option.symbol || '';
      const match = optionSymbol.match(/^([A-Z]+)/);
      const underlyingTicker = match ? match[1] : '';
      const ticker = tickerMap.get(underlyingTicker);
      if (ticker) {
        ticker.hasOptions = true;
      }
    }

    // Sort by cost basis descending, filter out zero/NaN values
    return Array.from(tickerMap.values())
      .filter((t) => t.costBasis && t.costBasis > 0 && !isNaN(t.costBasis))
      .sort((a, b) => (b.costBasis || 0) - (a.costBasis || 0));
  }, [positionsData]);

  const displayTickers = positionTickers.slice(0, maxPills);

  return (
    <div className={cn('flex flex-wrap gap-2 items-center', className)}>
      {displayTickers.map((ticker) => (
        <button
          key={ticker.symbol}
          onClick={() => onTickerSelect(ticker.symbol)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
            'transition-all duration-200 hover:scale-[1.02] shadow-sm',
            'border',
            selectedTicker === ticker.symbol
              ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 shadow-emerald-200/50 dark:shadow-emerald-900/30'
              : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20'
          )}
        >
          <span className="font-semibold">{ticker.symbol}</span>
          {showCostBasis && ticker.marketValue && ticker.marketValue > 0 && (
            <span className={cn(
              'text-xs',
              selectedTicker === ticker.symbol
                ? 'text-emerald-600/70 dark:text-emerald-400/70'
                : 'text-zinc-400 dark:text-zinc-500'
            )}>
              {formatCompactCurrency(ticker.marketValue)}
            </span>
          )}
        </button>
      ))}
      {positionTickers.length === 0 && (
        <span className="text-sm text-zinc-400 italic">{emptyMessage}</span>
      )}
      {positionTickers.length > maxPills && (
        <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full">
          +{positionTickers.length - maxPills} more
        </span>
      )}
    </div>
  );
}
