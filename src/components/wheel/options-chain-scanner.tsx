'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';


/**
 * Options Chain Scanner Component
 * Options chain data from Yahoo Finance (free, no API key required)
 *
 * Features:
 * - Symbol search with position-based quick select pills
 * - OTM% filtering for wheel strategy
 * - Top 3 recommendations for CSP and CC
 * - Annualized return calculations
 * - IV display
 * - Probability of OTM (estimated)
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  ScanLine,
  Sparkles,
  Trophy,
  Zap,
  HelpCircle,
  Brain,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatCurrency, formatCompactCurrency } from '@/lib/utils';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { fetchPositionsData } from '@/components/dashboard/lib/dashboard-api';
import dynamic from 'next/dynamic';
import type { PriceLineInput } from '@/lib/charts/tradingview-utils';

const SymbolChart = dynamic(() => import('@/components/charts/symbol-chart'), {
  ssr: false,
  loading: () => <div className="h-50 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />,
});

// ============================================================================
// Types
// ============================================================================

interface OptionContract {
  symbol: string;
  description: string;
  strike: number;
  expiration: string;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  last: number | null;
  volume: number;
  openInterest: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  impliedVolatility: number | null;
  annualizedReturn: number;
  probOtm: number | null;
  credit: number;
  otmPercent: number;
  estimatedDelta: number | null;
}

interface OptionsChainResponse {
  data: {
    symbol: string;
    underlyingPrice: number;
    expiration: string;
    dte: number;
    atmIv: number | null;
    calls: OptionContract[];
    puts: OptionContract[];
    expirations: string[];
    fetchedAt: string;
    isDelayed: boolean;
    hasGreeks: boolean;
  };
}

interface Props {
  defaultSymbol?: string;
}

interface PositionTicker {
  symbol: string;
  costBasis: number;
  hasOptions: boolean;
}

interface WheelRanking {
  symbol: string;
  score: number;
  expectedMonthlyReturn: number;
  riskScore: number;
  confidence: number;
  reasoning: string[];
}

interface WheelRankingsResponse {
  rankings: WheelRanking[];
  hasEnoughData: boolean;
  modelInfo: {
    candidateRankerVersion: number | null;
    lastTrainedAt: string | null;
  };
}

interface StrikeRecommendation {
  recommendedStrike: number;
  recommendedDte: number;
  expectedPremium: number;
  expectedReturn: number;
  probabilityOfProfit: number;
  reasoning: string[];
}

interface CommunityInsightData {
  symbol: string;
  score: number;
  recommendation: 'strong_buy' | 'buy' | 'neutral' | 'avoid';
  winRate: number;
  assignmentRate: number;
  avgHoldDays: number;
  totalTrades: number;
  uniqueTraders: number;
  optimalStrategy: {
    direction: 'csp' | 'covered_call' | 'both';
    dte: number;
    otmPercent: number;
  };
}

// Row height for scroll calculations (approximate)
const ROW_HEIGHT = 52; // px per row (slightly larger for desktop)

// ============================================================================
// Helper Functions
// ============================================================================

function formatIv(iv: number | null): string {
  if (iv === null) return '-';
  return `${(iv * 100).toFixed(1)}%`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Filter to show options with activity (bid, last price, or open interest)
function hasActivity(opt: OptionContract): boolean {
  return opt.bid > 0 || (opt.last !== null && opt.last > 0) || opt.openInterest > 0;
}

// Check if US stock market is currently open
// Market hours: Monday-Friday, 9:30 AM - 4:00 PM Eastern Time
function isMarketOpen(): boolean {
  const now = new Date();

  // Convert to Eastern Time
  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  };
  const etFormatter = new Intl.DateTimeFormat('en-US', etOptions);
  const parts = etFormatter.formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  // Weekend check
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  // Market hours: 9:30 AM - 4:00 PM ET
  const timeInMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;      // 4:00 PM

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

// ============================================================================
// Recommendations Card Component
// ============================================================================

function RecommendationsCard({
  options,
  optionType,
}: {
  options: OptionContract[];
  optionType: 'call' | 'put';
}) {
  // Get top 3 options based on: good OTM (5-15%), decent return (>20%), and liquidity
  const recommendations = useMemo(() => {
    return options
      .filter((opt) => {
        const otm = opt.otmPercent;
        return (
          otm >= 3 &&
          otm <= 15 &&
          opt.annualizedReturn >= 10 &&
          opt.bid > 0 &&
          (opt.volume > 0 || opt.openInterest > 10)
        );
      })
      .sort((a, b) => {
        // Score based on: balanced OTM (prefer 5-10%), good return, and liquidity
        const scoreA =
          a.annualizedReturn * 0.5 +
          (10 - Math.abs(a.otmPercent - 8)) * 3 +
          Math.min(a.openInterest / 100, 10);
        const scoreB =
          b.annualizedReturn * 0.5 +
          (10 - Math.abs(b.otmPercent - 8)) * 3 +
          Math.min(b.openInterest / 100, 10);
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [options]);

  if (recommendations.length === 0) {
    return null;
  }

  const isPut = optionType === 'put';

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isPut
          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Trophy className={cn('h-4 w-4', isPut ? 'text-emerald-600' : 'text-violet-600')} />
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          Top {isPut ? 'CSP' : 'CC'} Picks
        </span>
      </div>
      <div className="space-y-2">
        {recommendations.map((opt, i) => (
          <div
            key={opt.symbol}
            className={cn(
              'flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-900',
              i === 0 && 'ring-2 ring-amber-400'
            )}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <Sparkles className="h-4 w-4 text-amber-500" />}
              <div>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  ${opt.strike}
                </span>
                <span className="text-xs text-zinc-500 ml-2">{opt.otmPercent.toFixed(1)}% OTM</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="text-right">
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  ${opt.credit}
                </div>
                <div className="text-[10px] text-zinc-400">credit</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatPercent(opt.annualizedReturn)}
                </div>
                <div className="text-[10px] text-zinc-400">annual</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Community Insight Card Component
// ============================================================================

function CommunityInsightCard({
  insight,
  underlyingPrice,
  options,
  expirations,
  currentExpiration,
}: {
  insight: CommunityInsightData;
  underlyingPrice: number;
  options: { calls: OptionContract[]; puts: OptionContract[] };
  expirations: string[];
  currentExpiration: string;
}) {
  const recommendationConfig = {
    strong_buy: { label: 'Strong Buy', icon: CheckCircle2, badgeClass: 'bg-emerald-500 text-white' },
    buy: { label: 'Buy', icon: CheckCircle2, badgeClass: 'bg-green-500 text-white' },
    neutral: { label: 'Neutral', icon: MinusCircle, badgeClass: 'bg-zinc-400 text-white' },
    avoid: { label: 'Avoid', icon: XCircle, badgeClass: 'bg-red-500 text-white' },
  };

  const { label, icon: Icon, badgeClass } = recommendationConfig[insight.recommendation];

  // Calculate optimal strikes based on community OTM% and current price
  const optimalOtmPercent = insight.optimalStrategy.otmPercent;

  // For CSP: strike = price * (1 - otm%)
  const idealCspStrike = underlyingPrice * (1 - optimalOtmPercent);
  // For CC: strike = price * (1 + otm%)
  const idealCcStrike = underlyingPrice * (1 + optimalOtmPercent);

  // Find closest available OTM strikes from options chain
  // For CSP: strike must be BELOW current price (OTM put)
  // For CC: strike must be ABOVE current price (OTM call)
  const findClosestOtmStrike = (
    targetStrike: number,
    optionsList: OptionContract[],
    direction: 'csp' | 'cc'
  ): OptionContract | null => {
    if (!optionsList || optionsList.length === 0) return null;

    // Filter to OTM options with bids
    const otmWithBid = optionsList.filter(o => {
      const hasLiquidity = o.bid > 0;
      const isOtm = direction === 'csp'
        ? o.strike < underlyingPrice  // CSP: strike below price
        : o.strike > underlyingPrice; // CC: strike above price
      return hasLiquidity && isOtm;
    });

    if (otmWithBid.length === 0) return null; // No valid OTM options

    // Find closest to target
    return otmWithBid.reduce((closest, opt) => {
      return Math.abs(opt.strike - targetStrike) < Math.abs(closest.strike - targetStrike) ? opt : closest;
    });
  };

  const closestCsp = findClosestOtmStrike(idealCspStrike, options.puts, 'csp');
  const closestCc = findClosestOtmStrike(idealCcStrike, options.calls, 'cc');

  // Find best expiration date based on community optimal DTE
  const optimalDte = insight.optimalStrategy.dte;
  const today = new Date();
  const findBestExpiration = (): { exp: string; actualDte: number } => {
    if (!expirations || expirations.length === 0) {
      const currentDte = Math.ceil((new Date(currentExpiration).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { exp: currentExpiration, actualDte: currentDte };
    }
    let bestExp = expirations[0];
    let bestDiff = Infinity;
    let actualDte = 0;
    for (const exp of expirations) {
      const expDate = new Date(exp);
      const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const diff = Math.abs(dte - optimalDte);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestExp = exp;
        actualDte = dte;
      }
    }
    return { exp: bestExp, actualDte };
  };
  const { exp: recommendedExpiration, actualDte } = findBestExpiration();

  // Calculate actual OTM% for the selected strikes
  const cspOtmPercent = closestCsp ? ((underlyingPrice - closestCsp.strike) / underlyingPrice * 100) : 0;
  const ccOtmPercent = closestCc ? ((closestCc.strike - underlyingPrice) / underlyingPrice * 100) : 0;

  // Always show both CSP and CC targets, but highlight the recommended direction
  const recommendedDirection = insight.optimalStrategy.direction;

  // Round ideal strikes to reasonable increments based on price
  const roundToStrikeIncrement = (price: number, strike: number): number => {
    // Common strike increments: $1 for <$50, $2.50 for $50-100, $5 for $100-500, $10 for >$500
    let increment = 1;
    if (price >= 500) increment = 10;
    else if (price >= 100) increment = 5;
    else if (price >= 50) increment = 2.5;
    return Math.round(strike / increment) * increment;
  };

  const idealCspStrikeRounded = roundToStrikeIncrement(underlyingPrice, idealCspStrike);
  const idealCcStrikeRounded = roundToStrikeIncrement(underlyingPrice, idealCcStrike);

  return (
    <div className="rounded-xl border p-4 bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20">
          <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          Community Insights
        </span>
        <Badge className={cn('ml-auto text-[10px] gap-1', badgeClass)}>
          <Icon className="h-3 w-3" />
          {label}
        </Badge>
      </div>

      {/* Score + Win Rate Row */}
      <div className="grid grid-cols-2 gap-px bg-zinc-200/50 dark:bg-zinc-700/50 rounded-lg overflow-hidden mb-3">
        <div className="p-2.5 bg-white dark:bg-zinc-900 text-center">
          <div className={cn(
            'text-xl font-bold',
            insight.score >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
            insight.score >= 50 ? 'text-amber-600 dark:text-amber-400' :
            'text-zinc-600 dark:text-zinc-400'
          )}>
            {insight.score.toFixed(0)}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase font-medium">Score</div>
        </div>
        <div className="p-2.5 bg-white dark:bg-zinc-900 text-center">
          <div className={cn(
            'text-xl font-bold',
            insight.winRate >= 0.65 ? 'text-emerald-600 dark:text-emerald-400' :
            insight.winRate >= 0.5 ? 'text-amber-600 dark:text-amber-400' :
            'text-zinc-600 dark:text-zinc-400'
          )}>
            {(insight.winRate * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase font-medium">Win Rate</div>
        </div>
      </div>

      {/* Strike Targets - Compact side-by-side layout */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* CSP Target */}
        <div className={cn(
          'p-2.5 rounded-xl border',
          recommendedDirection === 'csp' || recommendedDirection === 'both'
            ? 'bg-emerald-100/70 dark:bg-emerald-900/40 border-emerald-200/50 dark:border-emerald-700/50'
            : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/50 dark:border-zinc-700/50'
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">
              CSP
            </span>
            {(recommendedDirection === 'csp' || recommendedDirection === 'both') && (
              <span className="text-[8px] bg-emerald-500 text-white px-1 rounded">REC</span>
            )}
          </div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            ${closestCsp ? closestCsp.strike : idealCspStrikeRounded}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
            {closestCsp ? `${cspOtmPercent.toFixed(1)}% OTM` : `~${(optimalOtmPercent * 100).toFixed(0)}% OTM`}
          </div>
          {closestCsp && closestCsp.bid > 0 && (
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              ${(closestCsp.bid * 100).toFixed(0)} credit
            </div>
          )}
        </div>

        {/* CC Target */}
        <div className={cn(
          'p-2.5 rounded-xl border',
          recommendedDirection === 'covered_call' || recommendedDirection === 'both'
            ? 'bg-teal-100/70 dark:bg-teal-900/40 border-teal-200/50 dark:border-teal-700/50'
            : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/50 dark:border-zinc-700/50'
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 uppercase">
              CC
            </span>
            {(recommendedDirection === 'covered_call' || recommendedDirection === 'both') && (
              <span className="text-[8px] bg-teal-500 text-white px-1 rounded">REC</span>
            )}
          </div>
          <div className="text-lg font-bold text-teal-700 dark:text-teal-300">
            ${closestCc ? closestCc.strike : idealCcStrikeRounded}
          </div>
          <div className="text-[10px] text-teal-600 dark:text-teal-400">
            {closestCc ? `${ccOtmPercent.toFixed(1)}% OTM` : `~${(optimalOtmPercent * 100).toFixed(0)}% OTM`}
          </div>
          {closestCc && closestCc.bid > 0 && (
            <div className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
              ${(closestCc.bid * 100).toFixed(0)} credit
            </div>
          )}
        </div>
      </div>

      {/* Best Expiration - Compact */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-700/50 mb-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-zinc-400" />
          <span className="text-[10px] text-zinc-500">Exp:</span>
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{recommendedExpiration}</span>
        </div>
        <div className="text-xs">
          <span className="font-bold text-zinc-900 dark:text-zinc-100">{actualDte}d</span>
          <span className="text-zinc-400 text-[10px]"> (target: {optimalDte}d)</span>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-emerald-200/30 dark:border-emerald-700/30">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {insight.uniqueTraders} traders
        </span>
        <span>{insight.totalTrades} trades</span>
        <span className={cn(
          insight.assignmentRate >= 0.2 ? 'text-amber-500' : 'text-zinc-500'
        )}>
          {(insight.assignmentRate * 100).toFixed(0)}% assigned
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// AI Insights Card Component
// ============================================================================

function AIInsightsCard({
  ranking,
  cspRecommendation,
  ccRecommendation,
  underlyingPrice,
}: {
  ranking: WheelRanking | null;
  cspRecommendation: StrikeRecommendation | null;
  ccRecommendation: StrikeRecommendation | null;
  underlyingPrice: number;
}) {
  if (!ranking && !cspRecommendation && !ccRecommendation) {
    return null;
  }

  return (
    <div className="rounded-lg border p-4 bg-linear-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-violet-200 dark:border-violet-800">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          AI Insights
        </span>
        {ranking && (
          <Badge className="ml-auto bg-violet-500 text-white text-[10px]">
            Score: {ranking.score.toFixed(0)}
          </Badge>
        )}
      </div>

      {ranking && (
        <div className="mb-3 p-2 rounded-lg bg-white/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Your History
            </span>
            <div className="flex items-center gap-1.5">
              <Award className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {ranking.riskScore}/10 Risk
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {ranking.reasoning.slice(0, 3).map((reason, i) => (
              <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                <Zap className="h-3 w-3 text-violet-500 mt-0.5 shrink-0" />
                {reason}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {cspRecommendation && (
          <div className="p-2 rounded-lg bg-emerald-100/50 dark:bg-emerald-900/30">
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
              AI CSP Target
            </p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              ${cspRecommendation.recommendedStrike}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {((1 - cspRecommendation.recommendedStrike / underlyingPrice) * 100).toFixed(1)}% OTM
            </p>
          </div>
        )}
        {ccRecommendation && (
          <div className="p-2 rounded-lg bg-violet-100/50 dark:bg-violet-900/30">
            <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 mb-1">
              AI CC Target
            </p>
            <p className="text-sm font-bold text-violet-600 dark:text-violet-400">
              ${ccRecommendation.recommendedStrike}
            </p>
            <p className="text-[10px] text-violet-600 dark:text-violet-400">
              {((ccRecommendation.recommendedStrike / underlyingPrice - 1) * 100).toFixed(1)}% OTM
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OptionsChainScanner({ defaultSymbol = '' }: Props) {
  const [searchInput, setSearchInput] = useState(defaultSymbol);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [expiration, setExpiration] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'puts' | 'calls'>('calls');
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [showAllStrikes, setShowAllStrikes] = useState(false);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const { selectedAccountId } = useSelectedAccount();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const sharePriceRowRef = useRef<HTMLDivElement>(null);

  // Fetch user's positions for ticker suggestions
  const { data: positionsData } = useQuery({
    queryKey: ['positions', selectedAccountId],
    queryFn: () => fetchPositionsData(selectedAccountId),
    staleTime: 5 * 60 * 1000,
  });

  // Get unique tickers from positions (excluding crypto and stablecoins)
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
      // Skip crypto and stablecoins
      if (EXCLUDED_SYMBOLS.has(stock.symbol)) continue;

      const existing = tickerMap.get(stock.symbol);
      if (existing) {
        existing.costBasis += stock.costBasis;
      } else {
        tickerMap.set(stock.symbol, {
          symbol: stock.symbol,
          costBasis: stock.costBasis,
          hasOptions: false,
        });
      }
    }

    for (const option of positionsData.options) {
      // Skip crypto (shouldn't have options but just in case)
      if (EXCLUDED_SYMBOLS.has(option.symbol)) continue;

      const existing = tickerMap.get(option.symbol);
      if (existing) {
        existing.costBasis += option.costBasis;
        existing.hasOptions = true;
      } else {
        tickerMap.set(option.symbol, {
          symbol: option.symbol,
          costBasis: option.costBasis,
          hasOptions: true,
        });
      }
    }

    return Array.from(tickerMap.values()).sort(
      (a, b) => Math.abs(b.costBasis) - Math.abs(a.costBasis)
    );
  }, [positionsData]);

  // Always show top position tickers (not filtered by search input)
  const topPositionTickers = useMemo(() => {
    return positionTickers.slice(0, 6);
  }, [positionTickers]);

  // Build query params
  const queryParams = new URLSearchParams({ symbol });
  if (expiration) queryParams.set('expiration', expiration);

  const { data: chainData, isLoading, error, refetch, isFetching } = useQuery<OptionsChainResponse['data']>({
    queryKey: ['options-chain', symbol, expiration],
    queryFn: async () => {
      const res = await fetch(`/api/market/options-chain?${queryParams}`);
      if (!res.ok) {
        const err = await parseApiJson(res);
        throw new Error(apiMessage(err, 'Failed to fetch options chain'));
      }
      return apiData<OptionsChainResponse['data']>(await parseApiJson(res));
    },
    staleTime: 60 * 1000,
    enabled: symbol.length > 0,
  });

  // Fetch AI wheel rankings for user's history on this symbol
  const { data: rankingsData } = useQuery<WheelRankingsResponse>({
    queryKey: ['wheel-rankings-scanner', symbol],
    queryFn: async () => {
      const res = await fetch('/api/ml/wheel/rankings?filter=history');
      if (!res.ok) return { rankings: [], hasEnoughData: false, modelInfo: { candidateRankerVersion: null, lastTrainedAt: null } };
      return apiData<WheelRankingsResponse>(await parseApiJson(res));
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    enabled: symbol.length > 0,
  });

  // Find ranking for current symbol
  const symbolRanking = useMemo(() => {
    if (!rankingsData?.rankings) return null;
    return rankingsData.rankings.find((r) => r.symbol === symbol) ?? null;
  }, [rankingsData, symbol]);

  // Get underlying price and DTE from options chain data
  const underlyingPrice = chainData?.underlyingPrice ?? 0;
  const chainDte = chainData?.dte ?? 0;

  // Fetch AI strike recommendations for CSP (using current price and DTE from Yahoo Finance)
  const { data: cspRecommendation } = useQuery<{ recommendation: StrikeRecommendation } | null>({
    queryKey: ['strike-optimize', symbol, 'csp', underlyingPrice, chainDte],
    queryFn: async () => {
      const params = new URLSearchParams({
        symbol,
        direction: 'csp',
        currentPrice: underlyingPrice.toString(),
      });
      if (chainDte > 0) params.set('dte', chainDte.toString());
      const res = await fetch(`/api/ml/wheel/optimize?${params}`);
      if (!res.ok) return null;
      return apiData<{ recommendation: StrikeRecommendation }>(await parseApiJson(res));
    },
    staleTime: 10 * 60 * 1000,
    enabled: symbol.length > 0 && !!symbolRanking && underlyingPrice > 0,
  });

  // Fetch AI strike recommendations for CC (using current price and DTE from Yahoo Finance)
  const { data: ccRecommendation } = useQuery<{ recommendation: StrikeRecommendation } | null>({
    queryKey: ['strike-optimize', symbol, 'covered_call', underlyingPrice, chainDte],
    queryFn: async () => {
      const params = new URLSearchParams({
        symbol,
        direction: 'covered_call',
        currentPrice: underlyingPrice.toString(),
      });
      if (chainDte > 0) params.set('dte', chainDte.toString());
      const res = await fetch(`/api/ml/wheel/optimize?${params}`);
      if (!res.ok) return null;
      return apiData<{ recommendation: StrikeRecommendation }>(await parseApiJson(res));
    },
    staleTime: 10 * 60 * 1000,
    enabled: symbol.length > 0 && !!symbolRanking && underlyingPrice > 0,
  });

  // Fetch community insights for the searched symbol
  const { data: communityInsight } = useQuery<{ insight: CommunityInsightData | null }>({
    queryKey: ['communityInsight', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/ml/wheel/community?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) return { insight: null };
      return apiData<{ insight: CommunityInsightData | null }>(await parseApiJson(res));
    },
    staleTime: 5 * 60 * 1000,
    enabled: symbol.length > 0,
  });

  const handleSearch = () => {
    const normalized = searchInput.toUpperCase().trim();
    if (normalized && normalized !== symbol) {
      setSymbol(normalized);
      setExpiration(undefined);
      setShowAllStrikes(false); // Reset to filtered view for new symbol
    }
  };

  const handleTickerSelect = (tickerSymbol: string) => {
    setSearchInput(tickerSymbol);
    setSymbol(tickerSymbol);
    setExpiration(undefined);
    setShowAllStrikes(false); // Reset to filtered view for new symbol
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const chain = chainData;

  // Get current options list with filtering and sorting
  // Initially show only strikes within 10% of current price
  const { currentOptions, hasMoreAbove, hasMoreBelow, totalCount } = useMemo(() => {
    if (!chain) return { currentOptions: [], hasMoreAbove: false, hasMoreBelow: false, totalCount: 0 };
    const options = activeTab === 'puts' ? chain.puts : chain.calls;

    // Filter out options with no activity (no bid, no last price, no open interest)
    const filtered = options.filter(hasActivity);

    // Sort by strike descending (higher strikes at top)
    const sorted = [...filtered].sort((a, b) => b.strike - a.strike);

    const totalCount = sorted.length;

    // If showing all, return everything
    if (showAllStrikes) {
      return { currentOptions: sorted, hasMoreAbove: false, hasMoreBelow: false, totalCount };
    }

    // Filter to strikes within 15% of underlying price
    const price = chain.underlyingPrice;
    const lowerBound = price * 0.85; // 15% below
    const upperBound = price * 1.15; // 15% above

    const withinRange = sorted.filter(o => o.strike >= lowerBound && o.strike <= upperBound);
    const hasMoreAbove = sorted.some(o => o.strike > upperBound);
    const hasMoreBelow = sorted.some(o => o.strike < lowerBound);

    return { currentOptions: withinRange, hasMoreAbove, hasMoreBelow, totalCount };
  }, [chain, activeTab, showAllStrikes]);

  // Find where to insert the share price line (between strikes)
  // Sorted descending, so find first strike < price
  const sharePriceRowIndex = useMemo(() => {
    if (!chain || currentOptions.length === 0) return -1;
    const price = chain.underlyingPrice;

    for (let i = 0; i < currentOptions.length; i++) {
      if (currentOptions[i].strike < price) {
        return i;
      }
    }
    // All strikes are above price - put line at the end
    return currentOptions.length;
  }, [chain, currentOptions]);

  // Scroll to share price line
  const scrollToSharePrice = () => {
    if (sharePriceRowRef.current && tableContainerRef.current) {
      const container = tableContainerRef.current;
      const row = sharePriceRowRef.current;
      const containerHeight = container.clientHeight;
      const rowTop = row.offsetTop;
      container.scrollTop = rowTop - containerHeight / 2 + ROW_HEIGHT;
    }
  };

  // Auto-scroll to center on share price line when data loads
  useEffect(() => {
    scrollToSharePrice();
  }, [sharePriceRowIndex, chain?.symbol, chain?.expiration]);

  // Handle scroll to show/hide jump button
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!sharePriceRowRef.current) {
        setShowJumpButton(false);
        return;
      }
      const row = sharePriceRowRef.current;
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();

      // Show button if the share price line is not visible in the viewport
      const isVisible = rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom;
      setShowJumpButton(!isVisible);
    };

    container.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentOptions.length, sharePriceRowIndex]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <ScanLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Options Chain Scanner
            </h2>
            <p className="text-sm text-zinc-500">Find optimal strikes for wheel strategy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chain?.isDelayed && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
              Delayed
            </Badge>
          )}
          <Button
            onClick={() => refetch()}
            disabled={isFetching}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-4 sm:px-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 space-y-4">
        {/* Search Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="Enter any ticker..."
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchInput.trim() || searchInput.trim() === symbol}
              size="default"
            >
              Search
            </Button>
          </div>

          {/* Position Ticker Pills */}
          <div className="flex flex-wrap gap-2 items-center">
            {topPositionTickers.map((ticker) => (
              <button
                key={ticker.symbol}
                onClick={() => handleTickerSelect(ticker.symbol)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  'border',
                  symbol === ticker.symbol
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                )}
              >
                {ticker.symbol}
                <span
                  className={cn(
                    'ml-1.5 text-xs',
                    symbol === ticker.symbol
                      ? 'text-indigo-200'
                      : ticker.costBasis >= 0
                        ? 'text-emerald-500'
                        : 'text-red-500'
                  )}
                >
                  {formatCompactCurrency(Math.abs(ticker.costBasis))}
                </span>
              </button>
            ))}
            {positionTickers.length === 0 && (
              <span className="text-xs text-zinc-400">Enter any ticker to search</span>
            )}
          </div>
        </div>

        {/* Filters Row */}
        {chain && (
          <Select value={expiration ?? chain.expiration} onValueChange={(val) => { setExpiration(val); setShowAllStrikes(false); }}>
            <SelectTrigger className="w-40 h-9 bg-white dark:bg-zinc-900">
              <Calendar className="h-4 w-4 mr-2 text-zinc-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chain.expirations.slice(0, 12).map((exp) => (
                <SelectItem key={exp} value={exp}>
                  {exp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-8 text-center">
          <Target className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-zinc-600 dark:text-zinc-400">
            {error instanceof Error ? error.message : 'Failed to load options chain'}
          </p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      )}

      {/* Empty State - No symbol selected */}
      {!symbol && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="p-4 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 mb-4">
            <Search className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Search for a ticker
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm">
            Enter a stock symbol above to view options chain data and find optimal strikes for your wheel strategy.
          </p>
          {positionTickers.length > 0 && (
            <p className="text-xs text-zinc-400 mt-3">
              Or select from your positions above
            </p>
          )}
        </div>
      )}

      {/* Data Display */}
      {chain && !isLoading && (
        <>
          {/* Quick Stats Bar */}
          <div className="px-4 py-3 sm:px-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {/* Symbol & Price */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-500">{chain.symbol}</span>
                <span className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(chain.underlyingPrice)}
                </span>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

              {/* Stats Pills */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">DTE</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {chain.dte}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">IV</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatIv(chain.atmIv)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-xs text-zinc-500">Exp</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {chain.expiration}
                  </span>
                </div>
              </div>

              {/* Market closed indicator */}
              {!isMarketOpen() && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Market Closed</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">• Bids may show $0</span>
                </div>
              )}

              {/* Updated time - pushed to right on larger screens */}
              <div className="ml-auto text-xs text-zinc-400 hidden sm:block">
                Updated {new Date(chain.fetchedAt).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Price Chart with Strike Overlay */}
          <div className="px-4 sm:px-6 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <SymbolChart
              symbol={chain.symbol}
              defaultTimeRange="3M"
              showTimeControls
              height={200}
              priceLines={
                selectedStrike
                  ? [{ price: selectedStrike, title: `$${selectedStrike} Strike`, color: '#8b5cf6', lineStyle: 'dashed' } satisfies PriceLineInput]
                  : []
              }
            />
          </div>

          {/* Recommendations */}
          {(chain.puts.length > 0 || chain.calls.length > 0) && (
            <div className="p-4 sm:px-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className={cn(
                'grid gap-4',
                (symbolRanking || communityInsight?.insight) ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'
              )}>
                {chain.puts.filter(hasActivity).length > 0 && (
                  <RecommendationsCard
                    options={chain.puts.filter(hasActivity)}
                    optionType="put"
                  />
                )}
                {chain.calls.filter(hasActivity).length > 0 && (
                  <RecommendationsCard
                    options={chain.calls.filter(hasActivity)}
                    optionType="call"
                  />
                )}
                {symbolRanking && (
                  <AIInsightsCard
                    ranking={symbolRanking}
                    cspRecommendation={cspRecommendation?.recommendation ?? null}
                    ccRecommendation={ccRecommendation?.recommendation ?? null}
                    underlyingPrice={chain.underlyingPrice}
                  />
                )}
                {communityInsight?.insight && (
                  <CommunityInsightCard
                    insight={communityInsight.insight}
                    underlyingPrice={chain.underlyingPrice}
                    options={{ calls: chain.calls, puts: chain.puts }}
                    expirations={chain.expirations}
                    currentExpiration={chain.expiration}
                  />
                )}
              </div>
            </div>
          )}

          {/* Tab Pills and Help */}
          <div className="px-4 sm:px-6 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-3">
              {/* Calls/Puts Toggle */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <button
                  onClick={() => {
                    setActiveTab('calls');
                  }}
                  className={cn(
                    'px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2',
                    activeTab === 'calls'
                      ? 'bg-violet-600 text-white'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  )}
                >
                  <TrendingUp className="h-4 w-4" />
                  Calls ({activeTab === 'calls' ? currentOptions.length : ''})
                </button>
                <button
                  onClick={() => {
                    setActiveTab('puts');
                  }}
                  className={cn(
                    'px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2',
                    activeTab === 'puts'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  )}
                >
                  <TrendingDown className="h-4 w-4" />
                  Puts ({activeTab === 'puts' ? currentOptions.length : ''})
                </button>
              </div>

              {/* Help Tooltip */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" side="bottom" align="start">
                  <h4 className="font-semibold text-sm mb-3 text-zinc-900 dark:text-zinc-100">
                    Options Data Explained
                  </h4>
                  <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">OTM%</span> — Distance from current price as a percentage. Higher = safer but lower premium.
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Prob OTM</span> — Estimated probability the option expires out of the money (worthless).
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">IV</span> — Implied Volatility. Higher IV = higher premiums but more risk.
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Vol</span> — Today&apos;s trading volume. Higher is better for liquidity.
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">OI</span> — Open Interest. Total contracts outstanding.
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Bid/Ask</span> — Current prices. Tighter spread = better fills.
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Credit</span> — Premium received per contract (bid × 100).
                    </div>
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">Ann. Return</span> — Annualized return if option expires worthless.
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <span className="text-xs text-zinc-500 ml-auto hidden sm:block">
                {activeTab === 'puts' ? 'Cash-Secured Puts' : 'Covered Calls'}
              </span>
            </div>
          </div>

          {/* Options Display - Card View for all screen sizes */}
          {currentOptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Target className="h-8 w-8 mb-2 opacity-50" />
              <p>No options with bids found</p>
              <p className="text-sm">Try selecting a different expiration</p>
            </div>
          ) : (
            <div className="relative">
              <div
                ref={tableContainerRef}
                className="overflow-y-auto max-h-125 sm:max-h-132 overscroll-contain scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600"
                style={{ scrollBehavior: 'smooth' }}
              >
                {/* Load more strikes above (higher strikes) */}
                {hasMoreAbove && (
                  <div className="py-2 px-4">
                    <div className="flex items-center">
                      <div className="flex-1 h-0.5 bg-linear-to-r from-transparent via-indigo-400 to-indigo-400" />
                      <button
                        onClick={() => setShowAllStrikes(true)}
                        className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-lg transition-colors flex items-center gap-1.5"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Load {totalCount - currentOptions.length} higher strikes
                      </button>
                      <div className="flex-1 h-0.5 bg-linear-to-l from-transparent via-indigo-400 to-indigo-400" />
                    </div>
                  </div>
                )}

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {currentOptions.flatMap((opt, index) => {
                    const isAtm =
                      Math.abs(opt.strike - chain.underlyingPrice) < chain.underlyingPrice * 0.02;
                    const isSweetSpot = opt.otmPercent >= 5 && opt.otmPercent <= 12;
                    const isHighReturn = opt.annualizedReturn >= 30;
                    const items: React.ReactNode[] = [];

                    // Share price line
                    if (index === sharePriceRowIndex) {
                      items.push(
                        <div key="share-price-line" ref={sharePriceRowRef} className="py-2 px-4">
                          <div className="flex items-center">
                            <div className="flex-1 h-0.5 bg-linear-to-r from-transparent via-amber-500 to-amber-500" />
                            <div className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-lg">
                              Share price: {formatCurrency(chain.underlyingPrice)}
                            </div>
                            <div className="flex-1 h-0.5 bg-linear-to-l from-transparent via-amber-500 to-amber-500" />
                          </div>
                        </div>
                      );
                    }

                    // Option card - compact on desktop, comfortable on mobile
                    const spread = opt.ask > 0 && opt.bid > 0 ? opt.ask - opt.bid : null;

                    items.push(
                      <div
                        key={opt.symbol}
                        onClick={() => setSelectedStrike(opt.strike)}
                        className={cn(
                          'px-4 py-3 sm:py-3.5 cursor-pointer transition-colors',
                          selectedStrike === opt.strike && 'ring-1 ring-violet-500/50',
                          isAtm
                            ? 'bg-violet-50 dark:bg-violet-900/20'
                            : isSweetSpot
                              ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        )}
                      >
                        {/* Desktop: Single row with all info */}
                        <div className="hidden sm:flex items-center gap-4">
                          {/* Strike */}
                          <div className="flex items-center gap-2 w-28">
                            <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-50">
                              ${opt.strike}
                            </span>
                            {isAtm && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                ATM
                              </span>
                            )}
                            {isSweetSpot && !isAtm && (
                              <Zap className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                          </div>

                          {/* Metrics row */}
                          <div className="flex items-center gap-5 flex-1 text-sm">
                            <div className="w-16 text-center">
                              <span className="text-zinc-400">OTM </span>
                              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                {opt.otmPercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-18 text-center">
                              <span className="text-zinc-400">Prob </span>
                              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                {opt.probOtm !== null ? `${opt.probOtm}%` : '-'}
                              </span>
                            </div>
                            <div className="w-16 text-center">
                              <span className="text-zinc-400">IV </span>
                              <span className="font-medium text-zinc-500">
                                {formatIv(opt.impliedVolatility)}
                              </span>
                            </div>
                            <div className="w-18 text-center">
                              <span className="text-zinc-400">Vol </span>
                              <span className="font-medium text-zinc-500">
                                {opt.volume > 0 ? opt.volume.toLocaleString() : '-'}
                              </span>
                            </div>
                            <div className="w-16 text-center">
                              <span className="text-zinc-400">OI </span>
                              <span className="font-medium text-zinc-500">
                                {opt.openInterest.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Bid/Ask */}
                          <div className="flex items-center gap-2 text-sm">
                            <div className="text-right w-24">
                              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                ${opt.bid.toFixed(2)}
                              </span>
                              <span className="text-zinc-400"> / </span>
                              <span className="font-mono text-zinc-500">
                                ${opt.ask.toFixed(2)}
                              </span>
                            </div>
                            {spread !== null && spread > 0 && (
                              <span className="text-xs text-zinc-400 w-12">
                                (${spread.toFixed(2)})
                              </span>
                            )}
                          </div>

                          {/* Credit & Return */}
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                'px-2.5 py-1 rounded-full border font-bold font-mono text-sm',
                                opt.bid > 0
                                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                  : 'border-zinc-300 dark:border-zinc-600 text-zinc-400'
                              )}
                            >
                              ${opt.credit.toFixed(0)}
                            </div>
                            <span
                              className={cn(
                                'text-sm font-semibold w-18 text-right',
                                isHighReturn
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : opt.annualizedReturn >= 15
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-zinc-500'
                              )}
                            >
                              {formatPercent(opt.annualizedReturn)}
                            </span>
                          </div>
                        </div>

                        {/* Mobile: Card layout */}
                        <div className="flex sm:hidden items-center justify-between gap-3">
                          {/* Left: Strike and badges */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-50">
                              ${opt.strike}
                            </span>
                            {isAtm && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                ATM
                              </span>
                            )}
                            {isSweetSpot && !isAtm && (
                              <Zap className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                          </div>

                          {/* Right: Bid badge and return */}
                          <div className="flex flex-col items-end gap-0.5">
                            <div
                              className={cn(
                                'px-2.5 py-1 rounded-full border-2 font-bold font-mono text-sm',
                                opt.bid > 0
                                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                  : 'border-zinc-300 dark:border-zinc-600 text-zinc-400'
                              )}
                            >
                              ${opt.bid.toFixed(2)}
                            </div>
                            <span
                              className={cn(
                                'text-[10px] font-semibold',
                                isHighReturn
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : opt.annualizedReturn >= 15
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-zinc-500'
                              )}
                            >
                              {formatPercent(opt.annualizedReturn)} ann.
                            </span>
                          </div>
                        </div>

                        {/* Mobile-only: Metrics row */}
                        <div className="flex sm:hidden items-center gap-4 mt-1.5 text-xs">
                          <div>
                            <span className="text-zinc-400">OTM </span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-300">
                              {opt.otmPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-400">Prob </span>
                            <span className="font-medium text-zinc-600 dark:text-zinc-300">
                              {opt.probOtm !== null ? `${opt.probOtm}%` : '-'}
                            </span>
                          </div>
                          {opt.volume > 0 && (
                            <div>
                              <span className="text-zinc-400">Vol </span>
                              <span className="font-medium text-zinc-500">{opt.volume}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );

                    // Share price at end
                    if (
                      index === currentOptions.length - 1 &&
                      sharePriceRowIndex === currentOptions.length
                    ) {
                      items.push(
                        <div key="share-price-line-end" ref={sharePriceRowRef} className="py-2 px-4">
                          <div className="flex items-center">
                            <div className="flex-1 h-0.5 bg-linear-to-r from-transparent via-amber-500 to-amber-500" />
                            <div className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-lg">
                              Share price: {formatCurrency(chain.underlyingPrice)}
                            </div>
                            <div className="flex-1 h-0.5 bg-linear-to-l from-transparent via-amber-500 to-amber-500" />
                          </div>
                        </div>
                      );
                    }

                    return items;
                  })}
                </div>

                {/* Load more strikes below (lower strikes) */}
                {hasMoreBelow && (
                  <div className="py-2 px-4">
                    <div className="flex items-center">
                      <div className="flex-1 h-0.5 bg-linear-to-r from-transparent via-indigo-400 to-indigo-400" />
                      <button
                        onClick={() => setShowAllStrikes(true)}
                        className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-lg transition-colors flex items-center gap-1.5"
                      >
                        <TrendingDown className="h-3.5 w-3.5" />
                        Load {totalCount - currentOptions.length} lower strikes
                      </button>
                      <div className="flex-1 h-0.5 bg-linear-to-l from-transparent via-indigo-400 to-indigo-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Jump to current price button - position higher when load more button is visible */}
              {showJumpButton && (
                <button
                  onClick={scrollToSharePrice}
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-full shadow-lg transition-all flex items-center gap-2",
                    hasMoreBelow ? "bottom-24" : "bottom-14"
                  )}
                >
                  <Target className="h-3.5 w-3.5" />
                  Jump to {formatCurrency(chain.underlyingPrice)}
                </button>
              )}

              {/* Footer: Options count */}
              <div className="py-3 px-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {showAllStrikes ? (
                    <>{currentOptions.length} {currentOptions.length === 1 ? 'option' : 'options'}</>
                  ) : (
                    <>{currentOptions.length} of {totalCount} options (±15% of price)</>
                  )}
                </span>
                {!showAllStrikes && (hasMoreAbove || hasMoreBelow) ? (
                  <button
                    onClick={() => setShowAllStrikes(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Show all {totalCount} options
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">Scroll to see more strikes</span>
                )}
              </div>
            </div>
          )}

          {/* Footer Legend */}
          <div className="px-4 py-3 sm:px-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-emerald-500" />
                  Wheel Sweet Spot (5-12% OTM for selling)
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-violet-200 dark:bg-violet-800" />
                  ATM
                </span>
              </div>
              <span>Data from Yahoo Finance</span>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !chain && (
        <div className="px-6 py-12 text-center">
          <Target className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
            Enter a Symbol
          </h3>
          <p className="text-zinc-500 max-w-md mx-auto">
            Search for any optionable stock to see options chain data with premium calculations and
            strike recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

export default OptionsChainScanner;
