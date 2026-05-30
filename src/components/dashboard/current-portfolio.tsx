'use client';

/**
 * Current Portfolio Component
 *
 * Displays open positions grouped by stocks and options.
 * Clicking on a position shows a popup with edit/close actions.
 *
 * Features:
 * - Group options by underlying symbol
 * - Sort by symbol, cost basis, or date
 * - Filter by position type
 * - Expiration warnings for options
 * - Days held calculation
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  X,
  Edit3,
  LogOut,
  Zap,
  ArrowUpDown,
  AlertTriangle,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  List,
} from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Button } from '@/components/ui/button';
import { getTradingDaysHeld } from '@/lib/utils/trading-days';
import { formatCurrency, formatCompactCurrency } from '@/lib/utils';
import { TradeViewModal } from './trade-view-modal';

interface StockPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  firstEntryDate: string;
}

interface OptionPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  avgPrice: number;
  costBasis: number;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
}

interface PortfolioSummary {
  stockCount: number;
  optionCount: number;
  stockCostBasis: number;
  optionCostBasis: number;
  totalCostBasis: number;
}

interface CurrentPortfolioProps {
  stocks: StockPosition[];
  options: OptionPosition[];
  summary: PortfolioSummary;
}

type SelectedPosition =
  | { type: 'stock'; position: StockPosition }
  | { type: 'option'; position: OptionPosition };

type SortOption = 'symbol' | 'costBasis' | 'date';
type FilterOption = 'all' | 'stocks' | 'options';

function formatStrategy(strategy: string | null): string {
  if (!strategy) return '';
  return strategy
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatExpiration(expiration: string | null): string {
  if (!expiration) return 'N/A';
  const date = new Date(expiration);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/**
 * Get trading days held (excludes weekends and US market holidays)
 */
function getDaysHeld(firstEntryDate: string): number {
  return getTradingDaysHeld(firstEntryDate);
}

function getDaysToExpiration(expiration: string | null): number | null {
  if (!expiration) return null;
  const expDate = new Date(expiration);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getExpirationWarning(expiration: string | null): 'urgent' | 'warning' | null {
  const days = getDaysToExpiration(expiration);
  if (days === null) return null;
  if (days <= 0) return 'urgent'; // Expired
  if (days <= 7) return 'urgent'; // Less than a week
  if (days <= 14) return 'warning'; // Less than 2 weeks
  return null;
}

/**
 * Position Detail Modal
 */
function PositionModal({
  selected,
  onClose,
  onViewTimeline,
}: {
  selected: SelectedPosition;
  onClose: () => void;
  onViewTimeline: () => void;
}) {
  const router = useRouter();
  const isStock = selected.type === 'stock';
  const position = selected.position;
  const daysHeld = getDaysHeld(position.firstEntryDate);

  const handleEdit = () => {
    if (isStock) {
      router.push(`/trade/edit/stock/${position.id}`);
    } else {
      router.push(`/trade/edit/option/${position.id}`);
    }
    onClose();
  };

  const handleClose = () => {
    router.push(`/trade/close?positionId=${position.id}`);
    onClose();
  };

  const handleViewTimeline = () => {
    onClose();
    onViewTimeline();
  };

  const daysToExp = !isStock ? getDaysToExpiration((position as OptionPosition).expiration) : null;
  const expWarning = !isStock ? getExpirationWarning((position as OptionPosition).expiration) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Mobile: Bottom Sheet */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-xl max-h-[70vh] overflow-y-auto">
        <div className="p-5">
          {/* Handle */}
          <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isStock ? (
                <div className={`p-2.5 rounded-xl ${(position as StockPosition).side === 'long' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                  {(position as StockPosition).side === 'long' ? (
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
              ) : (
                <div className={`p-2.5 rounded-xl ${(position as OptionPosition).optionType === 'call' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                  <Zap className={`h-5 w-5 ${(position as OptionPosition).optionType === 'call' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
                  {position.symbol}
                  {!isStock && (position as OptionPosition).strike && (
                    <span className="text-zinc-500 ml-1">
                      ${(position as OptionPosition).strike} {(position as OptionPosition).optionType?.toUpperCase()}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-zinc-500">
                  {isStock ? 'Stock Position' : formatStrategy((position as OptionPosition).strategy) || 'Option Position'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5 text-zinc-400" />
            </button>
          </div>

          {/* Expiration Warning */}
          {expWarning && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-xl ${
              expWarning === 'urgent'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
            }`}>
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {daysToExp !== null && daysToExp <= 0 ? 'Expired!' : `Expires in ${daysToExp} day${daysToExp !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Side</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50 capitalize">{position.side}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">{isStock ? 'Shares' : 'Contracts'}</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{position.quantity}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Avg Price</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(position.avgPrice)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Cost Basis</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(position.costBasis)}</span>
            </div>
            {!isStock && (position as OptionPosition).expiration && (
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Expiration</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {formatExpiration((position as OptionPosition).expiration)}
                </span>
              </div>
            )}
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Opened</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{position.firstEntryDate}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-zinc-500">Days Held</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{daysHeld} day{daysHeld !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleViewTimeline}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              <List className="h-4 w-4" />
              <span className="font-medium">View All Entries</span>
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleEdit}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Edit3 className="h-4 w-4" />
                <span className="font-medium">Edit</span>
              </button>
              <button
                onClick={handleClose}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="font-medium">Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Centered Modal */}
      <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {isStock ? (
                  <div className={`p-2.5 rounded-xl ${(position as StockPosition).side === 'long' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    {(position as StockPosition).side === 'long' ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    )}
                  </div>
                ) : (
                  <div className={`p-2.5 rounded-xl ${(position as OptionPosition).optionType === 'call' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                    <Zap className={`h-5 w-5 ${(position as OptionPosition).optionType === 'call' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
                    {position.symbol}
                    {!isStock && (position as OptionPosition).strike && (
                      <span className="text-zinc-500 ml-1">
                        ${(position as OptionPosition).strike} {(position as OptionPosition).optionType?.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-zinc-500">
                    {isStock ? 'Stock Position' : formatStrategy((position as OptionPosition).strategy) || 'Option Position'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            {/* Expiration Warning */}
            {expWarning && (
              <div className={`flex items-center gap-2 p-3 mb-4 rounded-xl ${
                expWarning === 'urgent'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
              }`}>
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {daysToExp !== null && daysToExp <= 0 ? 'Expired!' : `Expires in ${daysToExp} day${daysToExp !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}

            {/* Details */}
            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Side</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50 capitalize">{position.side}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">{isStock ? 'Shares' : 'Contracts'}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{position.quantity}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Avg Price</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(position.avgPrice)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Cost Basis</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatCurrency(position.costBasis)}</span>
              </div>
              {!isStock && (position as OptionPosition).expiration && (
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Expiration</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatExpiration((position as OptionPosition).expiration)}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Opened</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{position.firstEntryDate}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-500">Days Held</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{daysHeld} day{daysHeld !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleViewTimeline}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                <List className="h-4 w-4" />
                <span className="font-medium">View All Entries</span>
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleEdit}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Edit3 className="h-4 w-4" />
                  <span className="font-medium">Edit Entry</span>
                </button>
                <button
                  onClick={handleClose}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-medium">Close Position</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Group options by underlying symbol
interface GroupedOptions {
  symbol: string;
  options: OptionPosition[];
  totalCostBasis: number;
  hasExpiringSoon: boolean;
}

// Number of items to show initially before "Show more"
const INITIAL_DISPLAY_LIMIT = 5;

export function CurrentPortfolio({ stocks, options, summary }: CurrentPortfolioProps) {
  const [selected, setSelected] = useState<SelectedPosition | null>(null);
  const [timelinePositionId, setTimelinePositionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('symbol');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAllStocks, setShowAllStocks] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);

  const hasPositions = stocks.length > 0 || options.length > 0;

  // Count options expiring soon
  const optionsExpiringSoon = useMemo(() => {
    return options.filter(opt => {
      const warning = getExpirationWarning(opt.expiration);
      return warning === 'urgent' || warning === 'warning';
    }).length;
  }, [options]);

  // Calculate additional metrics
  const metrics = useMemo(() => {
    const allPositions = [...stocks, ...options];

    // Average days held
    const avgDaysHeld = allPositions.length > 0
      ? Math.round(allPositions.reduce((sum, p) => sum + getDaysHeld(p.firstEntryDate), 0) / allPositions.length)
      : 0;

    // Calls vs Puts count
    const callCount = options.filter(o => o.optionType === 'call').length;
    const putCount = options.filter(o => o.optionType === 'put').length;

    // Unique symbols
    const uniqueSymbols = new Set([...stocks.map(s => s.symbol), ...options.map(o => o.symbol)]).size;

    // Largest position concentration
    const largestPosition = allPositions.reduce((max, p) =>
      p.costBasis > (max?.costBasis || 0) ? p : max, allPositions[0]);
    const concentration = summary.totalCostBasis > 0 && largestPosition
      ? ((largestPosition.costBasis / summary.totalCostBasis) * 100)
      : 0;

    return { avgDaysHeld, callCount, putCount, uniqueSymbols, concentration, largestSymbol: largestPosition?.symbol };
  }, [stocks, options, summary.totalCostBasis]);

  // Group and filter options by symbol
  const groupedOptions = useMemo((): GroupedOptions[] => {
    const groups = new Map<string, OptionPosition[]>();

    options.forEach(opt => {
      const existing = groups.get(opt.symbol) || [];
      existing.push(opt);
      groups.set(opt.symbol, existing);
    });

    return Array.from(groups.entries()).map(([symbol, opts]) => ({
      symbol,
      options: opts,
      totalCostBasis: opts.reduce((sum, o) => sum + o.costBasis, 0),
      hasExpiringSoon: opts.some(o => getExpirationWarning(o.expiration) !== null),
    }));
  }, [options]);

  // Filter and sort stocks
  const filteredStocks = useMemo(() => {
    if (filterBy === 'options') return [];
    const filtered = stocks.filter(s =>
      s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'costBasis':
          cmp = a.costBasis - b.costBasis;
          break;
        case 'date':
          cmp = new Date(a.firstEntryDate).getTime() - new Date(b.firstEntryDate).getTime();
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [stocks, filterBy, searchTerm, sortBy, sortAsc]);

  // Filter and sort option groups
  const filteredOptionGroups = useMemo(() => {
    if (filterBy === 'stocks') return [];
    const filtered = groupedOptions.filter(g =>
      g.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'costBasis':
          cmp = a.totalCostBasis - b.totalCostBasis;
          break;
        case 'date':
          const aDate = Math.min(...a.options.map(o => new Date(o.firstEntryDate).getTime()));
          const bDate = Math.min(...b.options.map(o => new Date(o.firstEntryDate).getTime()));
          cmp = aDate - bDate;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [groupedOptions, filterBy, searchTerm, sortBy, sortAsc]);

  const toggleSort = (newSort: SortOption) => {
    if (sortBy === newSort) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(newSort);
      setSortAsc(true);
    }
  };

  const toggleGroup = (symbol: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(symbol)) {
      newExpanded.delete(symbol);
    } else {
      newExpanded.add(symbol);
    }
    setExpandedGroups(newExpanded);
  };

  if (!hasPositions) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
            <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Current Portfolio
            </h2>
            <p className="text-sm text-zinc-500">Open positions</p>
          </div>
          <HelpTooltip
            title="Current Portfolio"
            description="Shows all your open stock and option positions. Click on any position to view details, edit the entry, or close the position."
          />
        </div>
        <div className="flex items-center justify-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <div className="text-center">
            <p className="text-zinc-400 dark:text-zinc-500">
              No open positions
            </p>
            <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">
              Add trades to build your portfolio
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        {/* Header with hero stats */}
        <div className="bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-5 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/80 shadow-sm">
                <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Open Positions
                  </h2>
                  <HelpTooltip
                    title="Open Positions"
                    description="Shows all your open stock and option positions. Click on any position to view details, edit the entry, or close the position. Options are grouped by underlying symbol."
                  />
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {metrics.uniqueSymbols} symbol{metrics.uniqueSymbols !== 1 ? 's' : ''} across {summary.stockCount + summary.optionCount} position{summary.stockCount + summary.optionCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="ghost"
              size="icon"
              className={showFilters ? 'bg-white/60 dark:bg-zinc-800/60' : 'hover:bg-white/60 dark:hover:bg-zinc-800/60'}
            >
              <Filter className="h-4 w-4 text-zinc-500" />
            </Button>
          </div>

          {/* Hero stat */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatCompactCurrency(summary.totalCostBasis)}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">invested</span>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            <div className="text-center p-2 rounded-lg bg-white/60 dark:bg-zinc-800/60">
              <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.stockCount}</p>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">Stocks</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/60 dark:bg-zinc-800/60">
              <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{summary.optionCount}</p>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">Options</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/60 dark:bg-zinc-800/60">
              <p className="text-lg sm:text-xl font-bold text-zinc-700 dark:text-zinc-300">{metrics.avgDaysHeld}</p>
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">Avg Days</p>
            </div>
            {optionsExpiringSoon > 0 ? (
              <div className="text-center p-2 rounded-lg bg-amber-100/80 dark:bg-amber-900/30">
                <p className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400">{optionsExpiringSoon}</p>
                <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400">Expiring</p>
              </div>
            ) : (
              <div className="text-center p-2 rounded-lg bg-white/60 dark:bg-zinc-800/60">
                <p className="text-lg sm:text-xl font-bold text-zinc-700 dark:text-zinc-300">
                  {metrics.concentration > 0 ? `${metrics.concentration.toFixed(0)}%` : '—'}
                </p>
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">Top Hold</p>
              </div>
            )}
          </div>
        </div>

        {/* Secondary stats bar */}
        <div className="px-5 sm:px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatCompactCurrency(summary.stockCostBasis)}</span> stocks
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatCompactCurrency(summary.optionCostBasis)}</span> options
            </span>
            {options.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5">
                  <span className="text-green-600 dark:text-green-400 font-medium">{metrics.callCount}C</span>
                  <span className="text-zinc-400">/</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">{metrics.putCount}P</span>
                </span>
              </span>
            )}
            {metrics.concentration > 0 && optionsExpiringSoon > 0 && (
              <span className="flex items-center gap-1.5">
                Top: <span className="font-medium text-zinc-700 dark:text-zinc-300">{metrics.largestSymbol}</span> ({metrics.concentration.toFixed(0)}%)
              </span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6">

        {/* Filters */}
        {showFilters && (
          <div className="space-y-3 mb-6 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Type Filter */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <button
                  onClick={() => setFilterBy('all')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterBy === 'all'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterBy('stocks')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-x border-zinc-200 dark:border-zinc-700 ${
                    filterBy === 'stocks'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  Stocks
                </button>
                <button
                  onClick={() => setFilterBy('options')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterBy === 'options'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  Options
                </button>
              </div>

              {/* Sort */}
              <div className="flex gap-1">
                <button
                  onClick={() => toggleSort('symbol')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sortBy === 'symbol'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  Symbol
                </button>
                <button
                  onClick={() => toggleSort('costBasis')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sortBy === 'costBasis'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  Value
                </button>
                <button
                  onClick={() => toggleSort('date')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sortBy === 'date'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Date
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stock Positions */}
        {filteredStocks.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Stock Positions ({filteredStocks.length})
            </h3>
            <div className="space-y-2">
              {(showAllStocks ? filteredStocks : filteredStocks.slice(0, INITIAL_DISPLAY_LIMIT)).map((stock) => {
                const daysHeld = getDaysHeld(stock.firstEntryDate);
                return (
                  <button
                    key={stock.id}
                    onClick={() => setSelected({ type: 'stock', position: stock })}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${stock.side === 'long' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                        {stock.side === 'long' ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {stock.symbol}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {stock.quantity} shares @ {formatCurrency(stock.avgPrice)}
                          <span className="text-zinc-400 ml-2">{daysHeld}d held</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatCurrency(stock.costBasis)}
                      </p>
                      <p className="text-xs text-zinc-400 capitalize">{stock.side}</p>
                    </div>
                  </button>
                );
              })}
              {/* Show more/less button for stocks */}
              {filteredStocks.length > INITIAL_DISPLAY_LIMIT && (
                <button
                  onClick={() => setShowAllStocks(!showAllStocks)}
                  className="w-full py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center justify-center gap-1"
                >
                  {showAllStocks ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Show {filteredStocks.length - INITIAL_DISPLAY_LIMIT} more
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Option Positions (Grouped) */}
        {filteredOptionGroups.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Option Positions ({options.length})
            </h3>
            <div className="space-y-2">
              {(showAllOptions ? filteredOptionGroups : filteredOptionGroups.slice(0, INITIAL_DISPLAY_LIMIT)).map((group) => {
                const isExpanded = expandedGroups.has(group.symbol);
                return (
                  <div key={group.symbol} className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.symbol)}
                      className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                              {group.symbol}
                            </p>
                            {group.hasExpiringSoon && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {group.options.length} contract{group.options.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                            {formatCurrency(group.totalCostBasis)}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-zinc-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Options */}
                    {isExpanded && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800">
                        {group.options.map((option) => {
                          const expWarning = getExpirationWarning(option.expiration);
                          const daysHeld = getDaysHeld(option.firstEntryDate);
                          return (
                            <button
                              key={option.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected({ type: 'option', position: option });
                              }}
                              className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left border-b last:border-b-0 border-zinc-100 dark:border-zinc-800"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                  option.optionType === 'call'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {option.optionType === 'call' ? 'C' : 'P'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                                      ${option.strike} {option.optionType?.toUpperCase()}
                                    </p>
                                    {expWarning && (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        expWarning === 'urgent'
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                      }`}>
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        {expWarning === 'urgent' ? 'URGENT' : 'SOON'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-500">
                                    {option.quantity} @ {formatCurrency(option.avgPrice)} · Exp: {formatExpiration(option.expiration)}
                                    <span className="text-zinc-400 ml-2">{daysHeld}d held</span>
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                                  {formatCurrency(option.costBasis)}
                                </p>
                                <p className="text-xs text-zinc-400 capitalize">{option.side}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Show more/less button for options */}
              {filteredOptionGroups.length > INITIAL_DISPLAY_LIMIT && (
                <button
                  onClick={() => setShowAllOptions(!showAllOptions)}
                  className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center justify-center gap-1"
                >
                  {showAllOptions ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Show {filteredOptionGroups.length - INITIAL_DISPLAY_LIMIT} more
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty filtered state */}
        {filteredStocks.length === 0 && filteredOptionGroups.length === 0 && (
          <div className="flex items-center justify-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <div className="text-center">
              <p className="text-zinc-400 dark:text-zinc-500">
                No positions match your filters
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterBy('all');
                }}
                className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 hover:underline"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Position Modal */}
      {selected && (
        <PositionModal
          selected={selected}
          onClose={() => setSelected(null)}
          onViewTimeline={() => setTimelinePositionId(selected.position.id)}
        />
      )}

      {/* Trade View Modal (Timeline) */}
      {timelinePositionId && (
        <TradeViewModal
          positionId={timelinePositionId}
          open={!!timelinePositionId}
          onOpenChange={(open) => {
            if (!open) setTimelinePositionId(null);
          }}
        />
      )}
    </>
  );
}
