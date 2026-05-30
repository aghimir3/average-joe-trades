'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  TrendingUp,
  Target,
  Calendar,
  Clock,
  DollarSign,
  BarChart3,
  Calculator,
  Percent,
  Zap,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LineChart,
  History,
  Sparkles,
  RotateCcw,
  Info,
  TrendingDown,
  Wallet,
  ArrowRight,
  Award,
  Shield,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCompactCurrency, formatCurrency } from '@/lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { chartTooltipStyle } from '@/lib/utils';
import { TickerCalendar } from './ticker-calendar';
import { PlaybookCard } from './playbook-card';
import { BagholdRecoveryCard } from './baghold-recovery-card';
import { StrikeHeatmap } from './strike-heatmap';
import { ConcentrationRiskCard } from './concentration-risk-card';
import { PositionLifecycleTimeline } from './position-lifecycle-timeline';
import dynamic from 'next/dynamic';
import type { PriceLineInput } from '@/lib/charts/tradingview-utils';

const SymbolChart = dynamic(() => import('@/components/charts/symbol-chart'), {
  ssr: false,
  loading: () => <div className="h-[250px] rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />,
});

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

// ============================================================================
// Types
// ============================================================================

interface TickerListItem {
  symbol: string;
  totalPremium: number;
  tradeCount: number;
  lastTradeDate: string;
}

interface TickerTrade {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strategy: string;
  strike: number;
  expiration: string;
  openDate: string;
  closeDate: string;
  closeReason: string;
  premium: number;
  daysHeld: number;
  quantity: number;
}

interface StrikeStats {
  strike: number;
  totalTrades: number;
  ccTrades: number;
  cspTrades: number;
  totalPremium: number;
  avgPremium: number;
  winRate: number;
  assignments: number;
  assignmentRate: number;
  avgDTE: number;
}

interface MonthlyBreakdown {
  month: string;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface WeeklyBreakdown {
  week: string;
  weekLabel: string;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface ActivePosition {
  id: string;
  ledgerEventId: string | null;
  optionType: 'call' | 'put';
  strategy: string;
  strike: number;
  expiration: string;
  dte: number;
  quantity: number;
  premium: number;
  collateral: number;
  entryDate: string;
}

interface SimulatorData {
  avgCCPremiumPct: number;
  avgCSPPremiumPct: number;
  avgDTEAtOpen: number;
  avgDaysHeld: number;
  assignmentRate: number;
  premiumByDTE: Array<{
    dteRange: string;
    avgPremiumPct: number;
    tradeCount: number;
  }>;
}

interface CostBasisEvolution {
  shares: number;
  originalCostBasis: number;
  avgPrice: number;
  historicalAverageEntryPrice: number;
  historicalBoughtShares: number;
  totalPremiumCollected: number;
  effectiveCostBasis: number;
  reductionPerShare: number;
  totalContractShares: number;
  methodology: 'lifetime_wheel_premium_per_current_share';
}

interface WeeklyReturnInsights {
  currentPrice: number;
  sharesOwned: number;
  lastPriceUpdate: string;
  ccWeeklyReturn: number;
  cspWeeklyReturn: number;
  totalWeeklyReturn: number;
  annualizedCCReturn: number;
  annualizedCSPReturn: number;
  annualizedTotalReturn: number;
  ccTradeCount: number;
  cspTradeCount: number;
  avgDTEUsed: number;
}

// Single-stock feature types
interface PlaybookData {
  bestDteBucket: { range: string; winRate: number; tradeCount: number } | null;
  bestStrikeDistance: { range: string; winRate: number; tradeCount: number } | null;
  bestDayOfWeek: { day: string; winRate: number } | null;
  strategyEdge: { winner: 'csp' | 'cc' | 'even'; cspWinRate: number; ccWinRate: number };
  premiumRegime: 'high' | 'normal' | 'low';
  assignmentDangerZone: { strike: number; rate: number } | null;
}

interface BagholdRecoveryData {
  assignmentPrice: number;
  assignmentDate: string;
  currentPrice: number;
  shares: number;
  unrealizedLoss: number;
  ccPremiumSinceAssignment: number;
  ccTradesSinceAssignment: number;
  remainingToBreakeven: number;
  recoveryProgress: number;
  avgWeeklyCCPremium: number;
  projectedWeeksToBreakeven: number | null;
}

interface StrikeHeatmapData {
  cells: Array<{ strike: number; dteBucket: string; tradeCount: number; winRate: number; avgPremium: number }>;
  strikes: number[];
  dteBuckets: string[];
}

interface ConcentrationRiskData {
  openCspCollateral: number;
  totalCollateralAtRisk: number;
  buyingPower: number | null;
  collateralUtilization: number | null;
  ytdPremiumCollected: number;
  premiumBufferPct: number;
  maxPainLoss: number;
  maxPainDescription: string;
}

interface StrikeDistanceBucket {
  distancePct: string;
  avgDistanceDollars: number;
  tradeCount: number;
  totalPremium: number;
  avgPremium: number;
  winRate: number;
  assignmentRate: number;
  avgDaysHeld: number;
}

interface StrikeDistanceAnalysis {
  cc: StrikeDistanceBucket[];
  csp: StrikeDistanceBucket[];
  tradesWithData: number;
  tradesWithoutData: number;
}

interface TickerInsightsData {
  symbol: string;
  summary: {
    totalTrades: number;
    ccTrades: number;
    cspTrades: number;
    totalPremium: number;
    ccPremium: number;
    cspPremium: number;
    winRate: number;
    assignments: number;
    expirations: number;
    earlyCloses: number;
    assignmentRate: number;
    avgDTE: number;
    avgPremium: number;
    firstTradeDate: string | null;
    lastTradeDate: string | null;
  };
  strikeStats: StrikeStats[];
  monthlyBreakdown: MonthlyBreakdown[];
  weeklyBreakdown: WeeklyBreakdown[];
  activePositions: ActivePosition[];
  timeline: TickerTrade[];
  recentTrades: TickerTrade[];
  costBasisEvolution: CostBasisEvolution | null;
  weeklyReturnInsights: WeeklyReturnInsights | null;
  simulatorData: SimulatorData;
  playbook: PlaybookData | null;
  bagholdRecovery: BagholdRecoveryData | null;
  strikeHeatmap: StrikeHeatmapData | null;
  concentrationRisk: ConcentrationRiskData | null;
  strikeDistanceAnalysis: StrikeDistanceAnalysis | null;
}

interface TickerWheelInsightsProps {
  selectedAccountId: string | null;
}

// ============================================================================
// Main Component
// ============================================================================

export function TickerWheelInsights({ selectedAccountId }: TickerWheelInsightsProps) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('summary');

  // Fetch ticker list
  const { data: tickerListData, isLoading: isLoadingList } = useQuery({
    queryKey: ['tickerWheelList', selectedAccountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set('brokerageAccountId', selectedAccountId);

      const res = await fetch(`/api/strategies/wheel/ticker?${params}`);
      if (!res.ok) throw new Error('Failed to fetch ticker list');
      return apiData<{ tickers: TickerListItem[] }>(await parseApiJson(res));
    },
  });

  // Fetch selected ticker insights
  const { data: tickerData, isLoading: isLoadingTicker, refetch } = useQuery({
    queryKey: ['tickerWheelInsights', selectedTicker, selectedAccountId],
    queryFn: async () => {
      if (!selectedTicker) return null;

      const params = new URLSearchParams({ symbol: selectedTicker });
      if (selectedAccountId) params.set('brokerageAccountId', selectedAccountId);

      const res = await fetch(`/api/strategies/wheel/ticker?${params}`);
      if (!res.ok) throw new Error('Failed to fetch ticker insights');
      return apiData<TickerInsightsData>(await parseApiJson(res));
    },
    enabled: !!selectedTicker,
  });

  const tickers = useMemo<TickerListItem[]>(() => {
    return tickerListData?.tickers || [];
  }, [tickerListData?.tickers]);
  const insights: TickerInsightsData | null = tickerData || null;

  // Filter tickers by search
  const filteredTickers = useMemo(() => {
    if (!searchQuery) return tickers;
    const query = searchQuery.toUpperCase();
    return tickers.filter(t => t.symbol.includes(query));
  }, [tickers, searchQuery]);

  // No tickers traded
  if (!isLoadingList && tickers.length === 0) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-12 text-center">
          <Target className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
            No Wheel Trades Yet
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Start selling covered calls or cash-secured puts to see ticker-specific insights here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border-b border-zinc-100 dark:border-zinc-800 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Ticker Deep Dive</CardTitle>
              <CardDescription className="text-sm">
                Analyze your wheel performance by ticker
              </CardDescription>
            </div>
          </div>
          {selectedTicker && (
            <Button
              onClick={() => refetch()}
              disabled={isLoadingTicker}
              variant="ghost"
              size="sm"
              className="h-8"
            >
              <RefreshCw className={cn('h-4 w-4', isLoadingTicker && 'animate-spin')} />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Ticker Selector */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {/* Ticker Pills */}
            <div className="flex flex-wrap gap-2">
              {(searchQuery ? filteredTickers : tickers.slice(0, 5)).map((ticker) => (
                <button
                  key={ticker.symbol}
                  onClick={() => {
                    setSelectedTicker(ticker.symbol);
                    setSearchQuery('');
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    'border border-zinc-200 dark:border-zinc-700',
                    'hover:border-indigo-300 dark:hover:border-indigo-700',
                    selectedTicker === ticker.symbol
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  )}
                >
                  {ticker.symbol}
                  <span className={cn(
                    'ml-1.5 text-xs',
                    selectedTicker === ticker.symbol
                      ? 'text-indigo-200'
                      : ticker.totalPremium >= 0 ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {ticker.totalPremium >= 0 ? '+' : ''}{formatCompactCurrency(ticker.totalPremium)}
                  </span>
                </button>
              ))}
              {!searchQuery && tickers.length > 5 && (
                <span className="px-2 py-1.5 text-sm text-zinc-500">
                  +{tickers.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {!selectedTicker ? (
          <div className="p-8 text-center">
            <Target className="h-10 w-10 mx-auto mb-3 text-zinc-400" />
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Select a ticker to see detailed insights
            </p>
          </div>
        ) : isLoadingTicker ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-3 text-indigo-500 animate-spin" />
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Loading insights...</p>
          </div>
        ) : insights && selectedTicker ? (
          <TickerInsightsContent
            insights={insights}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedTicker={selectedTicker}
            selectedAccountId={selectedAccountId}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Insights Content with Tabs
// ============================================================================

function TickerInsightsContent({
  insights,
  activeTab,
  setActiveTab,
  selectedTicker,
  selectedAccountId,
}: {
  insights: TickerInsightsData;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedTicker: string;
  selectedAccountId: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Playbook Card — above tabs for single-stock focus */}
      {insights.playbook && <PlaybookCard playbook={insights.playbook} symbol={insights.symbol} />}

    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {/* Tab Navigation */}
      <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
        <TabsList className="inline-flex h-9 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg min-w-max">
          <TabsTrigger
            value="summary"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="premium"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <DollarSign className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Premium
          </TabsTrigger>
          <TabsTrigger
            value="strikes"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <Target className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Strikes
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <History className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Timeline
          </TabsTrigger>
          <TabsTrigger
            value="target-basis"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <Target className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Target Basis
          </TabsTrigger>
          <TabsTrigger
            value="assignments"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <AlertCircle className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Assignments
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Calendar
          </TabsTrigger>
          <TabsTrigger
            value="chart"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <LineChart className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Chart
          </TabsTrigger>
          <TabsTrigger
            value="simulator"
            className="px-3 text-xs sm:text-sm rounded-md data-[state=active]:bg-indigo-500! data-[state=active]:text-white!"
          >
            <Calculator className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Simulator
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab Contents */}
      <TabsContent value="summary" className="m-0 p-4">
        <SummaryTab insights={insights} />
      </TabsContent>

      <TabsContent value="premium" className="m-0 p-4">
        <PremiumTab insights={insights} />
      </TabsContent>

      <TabsContent value="strikes" className="m-0 p-4">
        <StrikesTab insights={insights} />
      </TabsContent>

      <TabsContent value="timeline" className="m-0 p-4">
        <TimelineTab insights={insights} />
      </TabsContent>

      <TabsContent value="target-basis" className="m-0 p-4">
        <TargetBasisTab insights={insights} />
      </TabsContent>

      <TabsContent value="assignments" className="m-0 p-4">
        <AssignmentTab insights={insights} />
      </TabsContent>

      <TabsContent value="calendar" className="m-0 p-4">
        {selectedTicker ? (
          <TickerCalendar symbol={selectedTicker} accountId={selectedAccountId} />
        ) : (
          <div className="text-center py-12 text-zinc-500">
            Select a ticker to view its calendar
          </div>
        )}
      </TabsContent>

      <TabsContent value="chart" className="m-0 p-4">
        <ChartTab insights={insights} selectedTicker={selectedTicker} />
      </TabsContent>

      <TabsContent value="simulator" className="m-0 p-4">
        <SimulatorTab insights={insights} />
      </TabsContent>
    </Tabs>
    </div>
  );
}

// ============================================================================
// Summary Tab
// ============================================================================

function SummaryTab({ insights }: { insights: TickerInsightsData }) {
  const { summary, costBasisEvolution, weeklyReturnInsights, activePositions } = insights;

  return (
    <div className="space-y-4">
      {/* Hero Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Premium"
          value={formatCurrency(summary.totalPremium)}
          icon={<DollarSign className="h-4 w-4" />}
          color={summary.totalPremium >= 0 ? 'emerald' : 'red'}
        />
        <StatCard
          label="Win Rate"
          value={`${summary.winRate}%`}
          icon={<Target className="h-4 w-4" />}
          color={summary.winRate >= 70 ? 'emerald' : summary.winRate >= 50 ? 'amber' : 'red'}
        />
        <StatCard
          label="Assignment Rate"
          value={`${summary.assignmentRate}%`}
          icon={<Percent className="h-4 w-4" />}
          color={summary.assignmentRate < 30 ? 'emerald' : summary.assignmentRate < 50 ? 'amber' : 'red'}
        />
        <StatCard
          label="Avg DTE"
          value={`${summary.avgDTE}d`}
          icon={<Clock className="h-4 w-4" />}
          color="blue"
        />
      </div>

      {/* Trade Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* CC vs CSP */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Strategy Breakdown</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Covered Calls</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium">{summary.ccTrades}</span>
                <span className="text-xs text-emerald-500 ml-2">
                  {formatCompactCurrency(summary.ccPremium)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Cash Secured Puts</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium">{summary.cspTrades}</span>
                <span className="text-xs text-emerald-500 ml-2">
                  {formatCompactCurrency(summary.cspPremium)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Outcome Distribution */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Outcomes</h4>
          <div className="flex gap-1 h-6 rounded-lg overflow-hidden mb-3">
            {summary.expirations > 0 && (
              <div
                className="bg-emerald-500"
                style={{ width: `${(summary.expirations / summary.totalTrades) * 100}%` }}
                title={`${summary.expirations} expired`}
              />
            )}
            {summary.assignments > 0 && (
              <div
                className="bg-violet-500"
                style={{ width: `${(summary.assignments / summary.totalTrades) * 100}%` }}
                title={`${summary.assignments} assigned`}
              />
            )}
            {summary.earlyCloses > 0 && (
              <div
                className="bg-blue-500"
                style={{ width: `${(summary.earlyCloses / summary.totalTrades) * 100}%` }}
                title={`${summary.earlyCloses} early closes`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              {summary.expirations} expired
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-violet-500" />
              {summary.assignments} assigned
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              {summary.earlyCloses} closed
            </span>
          </div>
        </div>
      </div>

      {/* Cost Basis Evolution */}
      {costBasisEvolution && (
        <div className="bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 rounded-xl p-4">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Cost Basis Evolution
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Current Avg Entry</p>
              <p className="text-base sm:text-lg font-semibold break-words">
                ${costBasisEvolution.avgPrice.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Historical Avg Entry</p>
              <p className="text-base sm:text-lg font-semibold break-words">
                ${costBasisEvolution.historicalAverageEntryPrice.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Lifetime Wheel Premium</p>
              <p className="text-base sm:text-lg font-semibold text-emerald-500 break-words">
                {formatCurrency(costBasisEvolution.totalPremiumCollected)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Effective Basis</p>
              <p className="text-base sm:text-lg font-semibold text-indigo-600 dark:text-indigo-400 break-words">
                ${costBasisEvolution.effectiveCostBasis.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Reduction / Current Share</p>
              <p className="text-base sm:text-lg font-semibold text-emerald-500 break-words">
                -${costBasisEvolution.reductionPerShare.toFixed(2)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Uses lifetime wheel premium on this ticker divided by current shares to show recovered basis across
            assignment and re-entry cycles.
          </p>
        </div>
      )}

      {/* Weekly Return Insights */}
      <WeeklyReturnInsightsSection weeklyReturnInsights={weeklyReturnInsights} />

      {/* Baghold Recovery Tracker */}
      {insights.bagholdRecovery && <BagholdRecoveryCard data={insights.bagholdRecovery} />}

      {/* Concentration Risk */}
      {insights.concentrationRisk && <ConcentrationRiskCard data={insights.concentrationRisk} />}

      {/* Active Positions with Projected Return */}
      {activePositions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Active Positions ({activePositions.length})
          </h4>

          {/* Projected Return Summary */}
          {(() => {
            const totalPremium = activePositions.reduce((sum, pos) => sum + pos.premium, 0);
            const totalCollateral = activePositions.reduce((sum, pos) => sum + pos.collateral, 0);
            const projectedReturnPct = totalCollateral > 0 ? (totalPremium / totalCollateral) * 100 : 0;
            const avgDte = activePositions.reduce((sum, pos) => sum + pos.dte, 0) / activePositions.length;
            const annualizedReturn = avgDte > 0 ? projectedReturnPct * (365 / avgDte) : 0;

            return (
              <div className="mb-4 p-4 rounded-xl bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200/50 dark:border-emerald-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                    Projected Return (if all expire worthless)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-2 bg-white/60 dark:bg-zinc-900/60 rounded-lg">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(totalPremium)}
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-medium">Total Premium</div>
                  </div>
                  <div className="text-center p-2 bg-white/60 dark:bg-zinc-900/60 rounded-lg">
                    <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(totalCollateral)}
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-medium">Collateral</div>
                  </div>
                  <div className="text-center p-2 bg-white/60 dark:bg-zinc-900/60 rounded-lg">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      +{projectedReturnPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-medium">Return</div>
                  </div>
                  <div className="text-center p-2 bg-white/60 dark:bg-zinc-900/60 rounded-lg">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      +{annualizedReturn.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase font-medium">Annualized</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500 text-center">
                  Based on avg {avgDte.toFixed(0)}d DTE across {activePositions.length} position{activePositions.length !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })()}

          {/* Position Lifecycle Timeline (Gantt bars) */}
          <PositionLifecycleTimeline
            positions={activePositions}
            currentPrice={weeklyReturnInsights?.currentPrice ?? null}
            symbol={insights.symbol}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Target Basis Tab
// ============================================================================

function TargetBasisTab({ insights }: { insights: TickerInsightsData }) {
  const { costBasisEvolution, weeklyBreakdown, summary } = insights;
  const [targetInput, setTargetInput] = useState(() => {
    if (!costBasisEvolution) return '';
    const suggested = Math.max(0, costBasisEvolution.effectiveCostBasis - 25);
    return suggested.toFixed(2);
  });

  if (!costBasisEvolution || costBasisEvolution.shares <= 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Target Basis Planner</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This view appears when you have open shares for this ticker and realized wheel premium history.
        </p>
      </div>
    );
  }

  const targetValue = Number.parseFloat(targetInput);
  const isTargetValid = Number.isFinite(targetValue) && targetValue >= 0;
  const targetBasis = isTargetValid ? targetValue : costBasisEvolution.effectiveCostBasis;

  const currentEffectiveBasis = costBasisEvolution.effectiveCostBasis;
  const shares = costBasisEvolution.shares;
  const basisGapPerShare = currentEffectiveBasis - targetBasis;
  const premiumNeeded = basisGapPerShare > 0 ? basisGapPerShare * shares : 0;

  const activeWeekCount = weeklyBreakdown.length;
  const activeWeeklyAverage = activeWeekCount > 0
    ? weeklyBreakdown.reduce((sum, week) => sum + week.premium, 0) / activeWeekCount
    : 0;
  const recentWeeks = weeklyBreakdown.slice(-12);
  const recentWeeklyAverage = recentWeeks.length > 0
    ? recentWeeks.reduce((sum, week) => sum + week.premium, 0) / recentWeeks.length
    : 0;

  let calendarWeeks = Math.max(activeWeekCount, 1);
  if (summary.firstTradeDate && summary.lastTradeDate) {
    const firstDate = new Date(summary.firstTradeDate);
    const lastDate = new Date(summary.lastTradeDate);
    if (!Number.isNaN(firstDate.getTime()) && !Number.isNaN(lastDate.getTime())) {
      const startMs = Math.min(firstDate.getTime(), lastDate.getTime());
      const endMs = Math.max(firstDate.getTime(), lastDate.getTime());
      calendarWeeks = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24 * 7)));
    }
  }

  const calendarWeeklyAverage = calendarWeeks > 0 ? summary.totalPremium / calendarWeeks : 0;

  const estimateWeeksToTarget = (weeklyRate: number): number | null => {
    if (premiumNeeded <= 0) return 0;
    if (weeklyRate <= 0) return null;
    return Math.ceil(premiumNeeded / weeklyRate);
  };

  const estimateEta = (weeks: number | null): string => {
    if (weeks === null) return 'No clear path at this pace';
    if (weeks === 0) return 'Already at or below target';
    const eta = new Date();
    eta.setDate(eta.getDate() + weeks * 7);
    return eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calendarWeeksToTarget = estimateWeeksToTarget(calendarWeeklyAverage);
  const activeWeeksToTarget = estimateWeeksToTarget(activeWeeklyAverage);
  const recentWeeksToTarget = estimateWeeksToTarget(recentWeeklyAverage);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/70 bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              Basis Target Timeline
            </h4>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Estimate how many weeks to reach your target effective basis using your historical wheel premium pace.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 whitespace-normal break-words">
            Realized CC/CSP only
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/70 dark:bg-zinc-900/50 p-3">
            <p className="text-[11px] text-zinc-500 mb-1">Current Effective Basis</p>
            <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
              ${currentEffectiveBasis.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-white/70 dark:bg-zinc-900/50 p-3">
            <Label htmlFor="target-basis-input" className="text-[11px] text-zinc-500 mb-1 block">Target Effective Basis</Label>
            <Input
              id="target-basis-input"
              type="number"
              min="0"
              step="0.01"
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="rounded-lg bg-white/70 dark:bg-zinc-900/50 p-3">
            <p className="text-[11px] text-zinc-500 mb-1">Premium Needed</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 break-words">
              {formatCurrency(premiumNeeded)}
            </p>
            <p className="text-[10px] text-zinc-500">
              Gap: {basisGapPerShare > 0 ? basisGapPerShare.toFixed(2) : '0.00'} / share
            </p>
          </div>
        </div>
      </div>

      {!isTargetValid && (
        <div className="rounded-lg border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/20 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Enter a valid target effective basis (0 or higher).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TargetProjectionCard
          label="Calendar Pace"
          sublabel="Includes slow/inactive weeks"
          weeklyRate={calendarWeeklyAverage}
          weeksToTarget={calendarWeeksToTarget}
          eta={estimateEta(calendarWeeksToTarget)}
        />
        <TargetProjectionCard
          label="Active Week Pace"
          sublabel="Only weeks where you traded"
          weeklyRate={activeWeeklyAverage}
          weeksToTarget={activeWeeksToTarget}
          eta={estimateEta(activeWeeksToTarget)}
        />
        <TargetProjectionCard
          label="Recent 12W Pace"
          sublabel="Most recent momentum"
          weeklyRate={recentWeeklyAverage}
          weeksToTarget={recentWeeksToTarget}
          eta={estimateEta(recentWeeksToTarget)}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Assumptions: share count stays near {shares.toFixed(shares % 1 === 0 ? 0 : 2)}, wheel trade quality remains similar,
          and only realized option P&L is counted (open contracts are excluded until closed).
        </p>
      </div>
    </div>
  );
}

function TargetProjectionCard({
  label,
  sublabel,
  weeklyRate,
  weeksToTarget,
  eta,
}: {
  label: string;
  sublabel: string;
  weeklyRate: number;
  weeksToTarget: number | null;
  eta: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 p-4">
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{label}</p>
      <p className="text-[10px] text-zinc-500 mt-0.5">{sublabel}</p>
      <p className="mt-3 text-[11px] text-zinc-500">Avg Premium / Week</p>
      <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400 break-words">
        {formatCurrency(weeklyRate)}
      </p>
      <p className="mt-3 text-[11px] text-zinc-500">Estimated Weeks</p>
      <p className="text-base font-semibold text-indigo-600 dark:text-indigo-400">
        {weeksToTarget === null ? 'N/A' : weeksToTarget}
      </p>
      <p className="mt-3 text-[11px] text-zinc-500">Estimated ETA</p>
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 break-words">{eta}</p>
    </div>
  );
}

// ============================================================================
// Premium Tab
// ============================================================================

function PremiumTab({ insights }: { insights: TickerInsightsData }) {
  const { monthlyBreakdown, weeklyBreakdown, simulatorData } = insights;

  // Monthly chart data
  const monthlyChartData = {
    labels: monthlyBreakdown.map(m => m.month),
    datasets: [
      {
        label: 'Covered Calls',
        data: monthlyBreakdown.map(m => m.ccPremium),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Cash Secured Puts',
        data: monthlyBreakdown.map(m => m.cspPremium),
        backgroundColor: 'rgba(147, 51, 234, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  // Weekly chart data - show last 12 weeks
  const recentWeeks = weeklyBreakdown.slice(-12);
  const weeklyChartData = {
    labels: recentWeeks.map(w => w.weekLabel),
    datasets: [
      {
        label: 'Covered Calls',
        data: recentWeeks.map(w => w.ccPremium),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Cash Secured Puts',
        data: recentWeeks.map(w => w.cspPremium),
        backgroundColor: 'rgba(147, 51, 234, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label || ''}: ${formatCurrency(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (v) => formatCompactCurrency(Number(v)),
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      {/* Premium by DTE */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {simulatorData.premiumByDTE.map((dte) => (
          <div
            key={dte.dteRange}
            className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-center"
          >
            <p className="text-xs text-zinc-500 mb-1">{dte.dteRange}</p>
            <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
              {dte.avgPremiumPct}%
            </p>
            <p className="text-xs text-zinc-400">{dte.tradeCount} trades</p>
          </div>
        ))}
      </div>

      {/* Average Yields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Avg CC Yield</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">
            {simulatorData.avgCCPremiumPct}%
          </p>
          <p className="text-xs text-blue-500/70">of strike price</p>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Avg CSP Yield</span>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-300">
            {simulatorData.avgCSPPremiumPct}%
          </p>
          <p className="text-xs text-purple-500/70">of strike price</p>
        </div>
      </div>

      {/* Monthly Chart */}
      {monthlyBreakdown.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Monthly Premium History
          </h4>
          <div className="h-64 sm:h-80">
            <Bar data={monthlyChartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Weekly Chart */}
      {weeklyBreakdown.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Weekly Premium History
            <span className="text-xs text-zinc-500 ml-2">(last 12 weeks)</span>
          </h4>
          <div className="h-48 sm:h-64">
            <Bar data={weeklyChartData} options={chartOptions} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Strikes Tab
// ============================================================================

function StrikesTab({ insights }: { insights: TickerInsightsData }) {
  const { strikeStats } = insights;

  if (strikeStats.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No strike data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Strike Distance Performance */}
      {insights.strikeDistanceAnalysis && (
        <StrikeDistanceCard data={insights.strikeDistanceAnalysis} />
      )}

      {/* Strike × DTE Heatmap */}
      {insights.strikeHeatmap && <StrikeHeatmap data={insights.strikeHeatmap} />}

      {/* Strike Performance Chart + Table */}
      <StrikesChartAndTable strikeStats={strikeStats} />
    </div>
  );
}

/** Strike distance from market price performance analysis */
function StrikeDistanceCard({ data }: { data: StrikeDistanceAnalysis }) {
  const hasCC = data.cc.length > 0;
  const hasCSP = data.csp.length > 0;

  if (!hasCC && !hasCSP) return null;

  // Build grouped bar chart: CC and CSP avg premium by distance bucket
  const allBucketLabels = Array.from(
    new Set([...data.cc.map(b => b.distancePct), ...data.csp.map(b => b.distancePct)])
  );
  // Sort by bucket order
  const bucketOrder = ['ITM', '0-2%', '2-5%', '5-10%', '10%+'];
  const sortedLabels = allBucketLabels.sort(
    (a, b) => bucketOrder.indexOf(a) - bucketOrder.indexOf(b)
  );

  const ccByLabel = new Map(data.cc.map(b => [b.distancePct, b]));
  const cspByLabel = new Map(data.csp.map(b => [b.distancePct, b]));

  const chartData = {
    labels: sortedLabels.map(l => l === 'ITM' ? 'ITM' : `${l} OTM`),
    datasets: [
      ...(hasCC ? [{
        label: 'CC Avg Premium',
        data: sortedLabels.map(l => ccByLabel.get(l)?.avgPremium ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderRadius: 4,
      }] : []),
      ...(hasCSP ? [{
        label: 'CSP Avg Premium',
        data: sortedLabels.map(l => cspByLabel.get(l)?.avgPremium ?? 0),
        backgroundColor: 'rgba(168, 85, 247, 0.7)',
        borderRadius: 4,
      }] : []),
    ],
  };

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'circle', padding: 12 },
      },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (v) => formatCompactCurrency(Number(v)),
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Percent className="h-4 w-4 text-indigo-500" />
          Strike Distance Performance
        </CardTitle>
        <CardDescription className="text-xs">
          How distance from market price impacts your returns
          {data.tradesWithoutData > 0 && (
            <span className="text-zinc-400 ml-1">
              ({data.tradesWithoutData} trade{data.tradesWithoutData !== 1 ? 's' : ''} excluded — no market price data)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6 space-y-4">
        {/* Grouped Bar Chart */}
        <div className="h-52">
          <Bar data={chartData} options={chartOptions} />
        </div>

        {/* CC Table */}
        {hasCC && (
          <div>
            <h4 className="text-xs font-semibold text-blue-500 mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Covered Calls — Strike Above Market
            </h4>
            <StrikeDistanceTable buckets={data.cc} />
          </div>
        )}

        {/* CSP Table */}
        {hasCSP && (
          <div>
            <h4 className="text-xs font-semibold text-purple-500 mb-2 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Cash-Secured Puts — Strike Below Market
            </h4>
            <StrikeDistanceTable buckets={data.csp} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StrikeDistanceTable({ buckets }: { buckets: StrikeDistanceBucket[] }) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Distance</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Avg $</th>
            <th className="text-center py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Trades</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Total P&L</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Avg P&L</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Win%</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Assign%</th>
            <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Avg DTE</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr
              key={bucket.distancePct}
              className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <td className="py-2 px-2 font-medium">
                <Badge variant="outline" className="text-xs">
                  {bucket.distancePct}
                </Badge>
              </td>
              <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">
                {formatCurrency(bucket.avgDistanceDollars)}
              </td>
              <td className="py-2 px-2 text-center">{bucket.tradeCount}</td>
              <td className={cn(
                'py-2 px-2 text-right font-medium',
                bucket.totalPremium >= 0 ? 'text-emerald-500' : 'text-red-500'
              )}>
                {formatCurrency(bucket.totalPremium)}
              </td>
              <td className={cn(
                'py-2 px-2 text-right',
                bucket.avgPremium >= 0 ? 'text-emerald-500' : 'text-red-500'
              )}>
                {formatCurrency(bucket.avgPremium)}
              </td>
              <td className={cn(
                'py-2 px-2 text-right',
                bucket.winRate >= 70 ? 'text-emerald-500' : bucket.winRate >= 50 ? 'text-amber-500' : 'text-red-500'
              )}>
                {bucket.winRate}%
              </td>
              <td className={cn(
                'py-2 px-2 text-right',
                bucket.assignmentRate < 30 ? 'text-emerald-500' : bucket.assignmentRate < 50 ? 'text-amber-500' : 'text-red-500'
              )}>
                {bucket.assignmentRate}%
              </td>
              <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">
                {bucket.avgDaysHeld}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chart and table portion of StrikesTab (extracted for readability) */
function StrikesChartAndTable({ strikeStats }: { strikeStats: StrikeStats[] }) {
  // Sort by total premium for chart
  const sortedByPremium = [...strikeStats].sort((a, b) => b.totalPremium - a.totalPremium);
  const topStrikes = sortedByPremium.slice(0, 10);

  const chartData = {
    labels: topStrikes.map(s => `$${s.strike}`),
    datasets: [
      {
        label: 'Total Premium',
        data: topStrikes.map(s => s.totalPremium),
        backgroundColor: topStrikes.map(s =>
          s.totalPremium >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'
        ),
        borderRadius: 4,
      },
    ],
  };

  const strikeChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          label: (ctx) => formatCurrency(ctx.raw as number),
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: (v) => formatCompactCurrency(Number(v)),
        },
      },
      y: {
        grid: { display: false },
      },
    },
  };

  return (
    <div className="space-y-4">
      {/* Strike Performance Chart */}
      <div className="h-48">
        <Bar data={chartData} options={strikeChartOptions} />
      </div>

      {/* Strike Table */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Strike</th>
              <th className="text-center py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Trades</th>
              <th className="text-center py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">CC/CSP</th>
              <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Premium</th>
              <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Win%</th>
              <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Assign%</th>
            </tr>
          </thead>
          <tbody>
            {strikeStats.slice(0, 10).map((strike) => (
              <tr
                key={strike.strike}
                className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <td className="py-2 px-2 font-medium">${strike.strike}</td>
                <td className="py-2 px-2 text-center">{strike.totalTrades}</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-blue-500">{strike.ccTrades}</span>
                  <span className="text-zinc-400 mx-1">/</span>
                  <span className="text-purple-500">{strike.cspTrades}</span>
                </td>
                <td className={cn(
                  'py-2 px-2 text-right font-medium',
                  strike.totalPremium >= 0 ? 'text-emerald-500' : 'text-red-500'
                )}>
                  {formatCurrency(strike.totalPremium)}
                </td>
                <td className={cn(
                  'py-2 px-2 text-right',
                  strike.winRate >= 70 ? 'text-emerald-500' : strike.winRate >= 50 ? 'text-amber-500' : 'text-red-500'
                )}>
                  {strike.winRate}%
                </td>
                <td className={cn(
                  'py-2 px-2 text-right',
                  strike.assignmentRate < 30 ? 'text-emerald-500' : strike.assignmentRate < 50 ? 'text-amber-500' : 'text-red-500'
                )}>
                  {strike.assignmentRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Timeline Tab
// ============================================================================

function TimelineTab({ insights }: { insights: TickerInsightsData }) {
  const { timeline } = insights;

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No trades yet
      </div>
    );
  }

  // Calculate cumulative premium using reduce to avoid variable reassignment
  const timelineWithCumulative = timeline.reduce<Array<typeof timeline[0] & { cumulative: number }>>((acc, t) => {
    const prevCumulative = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({ ...t, cumulative: prevCumulative + t.premium });
    return acc;
  }, []);

  const chartData = {
    labels: timelineWithCumulative.map(t => t.openDate),
    datasets: [
      {
        label: 'Cumulative Premium',
        data: timelineWithCumulative.map(t => t.cumulative),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: timelineWithCumulative.map(t =>
          t.premium >= 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'
        ),
      },
    ],
  };

  const timelineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => {
            const trade = timelineWithCumulative[items[0]?.dataIndex || 0];
            return trade ? `${trade.optionType === 'call' ? 'CC' : 'CSP'} $${trade.strike}` : '';
          },
          label: (ctx) => `Cumulative: ${formatCurrency(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxTicksLimit: 6,
        },
      },
      y: {
        ticks: {
          callback: (v) => formatCompactCurrency(Number(v)),
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      {/* Cumulative Chart */}
      <div className="h-48">
        <Line data={chartData} options={timelineChartOptions} />
      </div>

      {/* Trade List */}
      <div className="space-y-2 max-h-100 overflow-y-auto custom-scrollbar">
        {timeline.slice().reverse().map((trade) => (
          <div
            key={trade.id}
            className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
          >
            {/* Date */}
            <div className="w-20 shrink-0">
              <p className="text-xs font-medium">{trade.openDate}</p>
              <p className="text-xs text-zinc-400">{trade.daysHeld}d</p>
            </div>

            {/* Type Badge */}
            <Badge
              variant="secondary"
              className={cn(
                'shrink-0',
                trade.optionType === 'call'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
              )}
            >
              {trade.optionType === 'call' ? 'CC' : 'CSP'}
            </Badge>

            {/* Strike & Expiration */}
            <div className="flex-1 min-w-0">
              <span className="font-medium">${trade.strike}</span>
              <span className="text-xs text-zinc-500 ml-2">{trade.expiration}</span>
            </div>

            {/* Outcome */}
            <div className="shrink-0">
              {trade.closeReason === 'expired' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {trade.closeReason === 'assigned' && (
                <AlertCircle className="h-4 w-4 text-violet-500" />
              )}
              {trade.closeReason === 'normal' && (
                <XCircle className="h-4 w-4 text-blue-500" />
              )}
            </div>

            {/* Premium */}
            <div className={cn(
              'text-right font-medium shrink-0 w-20',
              trade.premium >= 0 ? 'text-emerald-500' : 'text-red-500'
            )}>
              {trade.premium >= 0 ? '+' : ''}{formatCurrency(trade.premium)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Simulator Tab - Enhanced
// ============================================================================
// Chart Tab
// ============================================================================

function ChartTab({ insights, selectedTicker }: { insights: TickerInsightsData; selectedTicker: string }) {
  const strikePriceLines: PriceLineInput[] = insights.activePositions.map((pos) => ({
    price: pos.strike,
    title: `$${pos.strike} ${pos.optionType === 'put' ? 'CSP' : 'CC'}`,
    color: pos.optionType === 'put' ? '#10b981' : '#3b82f6',
    lineStyle: 'dashed' as const,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <LineChart className="h-3.5 w-3.5" />
        <span>Price action with active strike levels</span>
      </div>
      <SymbolChart
        symbol={selectedTicker}
        defaultTimeRange="6M"
        showTimeControls
        height={280}
        priceLines={strikePriceLines}
      />
      {strikePriceLines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {strikePriceLines.map((line, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: line.color, borderStyle: 'dashed' }} />
              <span className="text-zinc-600 dark:text-zinc-400">{line.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================

function SimulatorTab({ insights }: { insights: TickerInsightsData }) {
  const { simulatorData, summary, strikeStats } = insights;
  const [mode, setMode] = useState<'entry' | 'scenario' | 'wheel'>('entry');

  // Entry simulator state
  const [entryType, setEntryType] = useState<'cc' | 'csp'>('cc');
  const [entryStrike, setEntryStrike] = useState(100);
  const [entryDTE, setEntryDTE] = useState(30);
  const [entryContracts, setEntryContracts] = useState(1);

  // Scenario planner state
  const [scenarioMonths, setScenarioMonths] = useState(12);
  const [tradesPerMonth, setTradesPerMonth] = useState(() => {
    const months = insights.monthlyBreakdown.length || 1;
    return Math.round(summary.totalTrades / months * 10) / 10;
  });

  // Calculate estimated premium based on historical data
  const avgYield = entryType === 'cc' ? simulatorData.avgCCPremiumPct : simulatorData.avgCSPPremiumPct;

  // Get DTE-specific yield
  const dteRange = simulatorData.premiumByDTE.find(d => {
    if (entryDTE <= 7) return d.dteRange === '0-7 DTE';
    if (entryDTE <= 14) return d.dteRange === '8-14 DTE';
    if (entryDTE <= 30) return d.dteRange === '15-30 DTE';
    if (entryDTE <= 45) return d.dteRange === '31-45 DTE';
    return d.dteRange === '45+ DTE';
  });
  const dteSpecificYield = dteRange?.avgPremiumPct || avgYield;
  const dteAdjustedPremium = (entryStrike * 100 * entryContracts * dteSpecificYield) / 100;

  // Annualized return
  const annualizedReturn = entryDTE > 0 ? (dteSpecificYield / entryDTE) * 365 : 0;

  // Break-even calculation
  const breakEven = entryType === 'csp'
    ? entryStrike - (dteAdjustedPremium / (100 * entryContracts))
    : entryStrike + (dteAdjustedPremium / (100 * entryContracts));

  // Capital required
  const capitalRequired = entryType === 'csp'
    ? entryStrike * 100 * entryContracts
    : entryStrike * 100 * entryContracts; // Assuming you own stock at strike price

  // Find best strike from history
  const bestStrike = useMemo(() => {
    if (!strikeStats.length) return null;
    const filtered = strikeStats.filter(s => s.totalTrades >= 3); // Min 3 trades
    if (!filtered.length) return null;
    return filtered.reduce((best, current) =>
      current.winRate > best.winRate ? current : best
    , filtered[0]);
  }, [strikeStats]);

  // Find best DTE range from history
  const bestDTERange = useMemo(() => {
    if (!simulatorData.premiumByDTE.length) return null;
    return simulatorData.premiumByDTE.reduce((best, current) =>
      current.avgPremiumPct > best.avgPremiumPct ? current : best
    , simulatorData.premiumByDTE[0]);
  }, [simulatorData.premiumByDTE]);

  // Find similar strike performance (within $10 of selected)
  const similarStrikePerformance = useMemo(() => {
    const similar = strikeStats.filter(s =>
      Math.abs(s.strike - entryStrike) <= 10
    );
    if (!similar.length) return null;
    const totalTrades = similar.reduce((sum, s) => sum + s.totalTrades, 0);
    const wins = similar.reduce((sum, s) => sum + Math.round(s.totalTrades * s.winRate / 100), 0);
    return {
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      trades: totalTrades,
    };
  }, [strikeStats, entryStrike]);

  // Reset entry form
  const resetEntry = () => {
    setEntryType('cc');
    setEntryStrike(100);
    setEntryDTE(30);
    setEntryContracts(1);
  };

  // Scenario projections with adjustable frequency
  const projectedTrades = Math.round(tradesPerMonth * scenarioMonths);
  const avgTradeIncome = summary.totalPremium / Math.max(1, summary.totalTrades);
  const projectedIncome = avgTradeIncome * projectedTrades;

  // CC vs CSP breakdown from history
  const ccRatio = summary.ccPremium / Math.max(1, summary.totalPremium);
  const cspRatio = summary.cspPremium / Math.max(1, summary.totalPremium);
  const projectedCCIncome = projectedIncome * ccRatio;
  const projectedCSPIncome = projectedIncome * cspRatio;

  // Monthly breakdown for variance calculation
  const monthlyIncomes = insights.monthlyBreakdown.map(m => m.premium);
  const avgMonthlyIncome = monthlyIncomes.reduce((a, b) => a + b, 0) / Math.max(1, monthlyIncomes.length);
  const variance = monthlyIncomes.length > 1
    ? Math.sqrt(monthlyIncomes.reduce((sum, x) => sum + Math.pow(x - avgMonthlyIncome, 2), 0) / monthlyIncomes.length)
    : avgMonthlyIncome * 0.2; // Default 20% if not enough data

  // Optimistic and pessimistic scenarios (±1 std dev per month)
  const optimisticIncome = (avgMonthlyIncome + variance) * scenarioMonths;
  const pessimisticIncome = Math.max(0, (avgMonthlyIncome - variance) * scenarioMonths);

  // Generate projection chart data
  const projectionChartData = useMemo(() => {
    const labels: string[] = [];
    const baseData: number[] = [];
    const optimisticData: number[] = [];
    const pessimisticData: number[] = [];

    let cumBase = 0;
    let cumOpt = 0;
    let cumPes = 0;

    for (let i = 1; i <= scenarioMonths; i++) {
      labels.push(`M${i}`);
      cumBase += avgMonthlyIncome;
      cumOpt += avgMonthlyIncome + variance;
      cumPes += Math.max(0, avgMonthlyIncome - variance);
      baseData.push(Math.round(cumBase));
      optimisticData.push(Math.round(cumOpt));
      pessimisticData.push(Math.round(Math.max(0, cumPes)));
    }

    return { labels, baseData, optimisticData, pessimisticData };
  }, [scenarioMonths, avgMonthlyIncome, variance]);

  // Reset scenario form
  const resetScenario = () => {
    setScenarioMonths(12);
    const months = insights.monthlyBreakdown.length || 1;
    setTradesPerMonth(Math.round(summary.totalTrades / months * 10) / 10);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
          <button
            onClick={() => setMode('entry')}
            className={cn(
              'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'entry'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            )}
          >
            <Play className="h-4 w-4 inline mr-1.5" />
            Trade Entry
          </button>
          <button
            onClick={() => setMode('scenario')}
            className={cn(
              'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'scenario'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            )}
          >
            <LineChart className="h-4 w-4 inline mr-1.5" />
            Projector
          </button>
          <button
            onClick={() => setMode('wheel')}
            className={cn(
              'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'wheel'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            )}
          >
            <RefreshCw className="h-4 w-4 inline mr-1.5" />
            Wheel Cycle
          </button>
        </div>

        {/* Entry Simulator - Enhanced */}
        {mode === 'entry' && (
          <div className="space-y-4">
            {/* Intro */}
            <div className="p-3 bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
              <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed">
                <strong className="text-indigo-800 dark:text-indigo-200">Estimate your next trade.</strong>{' '}
                <span className="hidden sm:inline">
                  Select your strategy, adjust the strike price and expiration, and see what premium you might collect based on your trading history with {insights.symbol}.
                </span>
                <span className="sm:hidden">
                  Adjust strike & DTE to estimate premium based on your history.
                </span>
              </p>
            </div>

            {/* Best Strike & DTE Suggestions */}
            {(bestStrike || bestDTERange) && (
              <div className="flex gap-2 flex-wrap">
                {bestStrike && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setEntryStrike(bestStrike.strike)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                      >
                        <Award className="h-3.5 w-3.5" />
                        Best Strike: ${bestStrike.strike}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{bestStrike.winRate.toFixed(0)}% win rate across {bestStrike.totalTrades} trades</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {bestDTERange && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          // Set DTE to middle of best range
                          if (bestDTERange.dteRange === '0-7 DTE') setEntryDTE(5);
                          else if (bestDTERange.dteRange === '8-14 DTE') setEntryDTE(11);
                          else if (bestDTERange.dteRange === '15-30 DTE') setEntryDTE(23);
                          else if (bestDTERange.dteRange === '31-45 DTE') setEntryDTE(38);
                          else setEntryDTE(50);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Sweet Spot: {bestDTERange.dteRange}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{bestDTERange.avgPremiumPct.toFixed(2)}% avg yield in this DTE range</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Type */}
              <div>
                <Label className="text-xs">Strategy</Label>
                <Select value={entryType} onValueChange={(v: 'cc' | 'csp') => setEntryType(v)}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cc">Covered Call</SelectItem>
                    <SelectItem value="csp">Cash Secured Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contracts */}
              <div>
                <Label className="text-xs">Contracts</Label>
                <Input
                  type="number"
                  min={1}
                  value={entryContracts}
                  onChange={(e) => setEntryContracts(Number(e.target.value) || 1)}
                  className="h-9 mt-1"
                />
              </div>
            </div>

            {/* Strike */}
            <div>
              <div className="flex justify-between mb-1">
                <Label className="text-xs">Strike Price</Label>
                <span className="text-xs text-zinc-500">${entryStrike}</span>
              </div>
              <Slider
                value={[entryStrike]}
                onValueChange={([v]) => setEntryStrike(v)}
                min={50}
                max={500}
                step={5}
                className="mt-2"
              />
            </div>

            {/* DTE */}
            <div>
              <div className="flex justify-between mb-1">
                <Label className="text-xs">Days to Expiration</Label>
                <span className="text-xs text-zinc-500">{entryDTE} days</span>
              </div>
              <Slider
                value={[entryDTE]}
                onValueChange={([v]) => setEntryDTE(v)}
                min={1}
                max={90}
                step={1}
                className="mt-2"
              />
            </div>

            {/* Results - Enhanced with more metrics */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Est. Premium</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-emerald-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Based on your historical {entryDTE <= 7 ? '0-7' : entryDTE <= 14 ? '8-14' : entryDTE <= 30 ? '15-30' : entryDTE <= 45 ? '31-45' : '45+'} DTE trades</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(dteAdjustedPremium)}
                </p>
                <p className="text-xs text-emerald-500/70 mt-1">
                  {dteSpecificYield.toFixed(2)}% of strike
                </p>
              </div>
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">Annualized Return</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-indigo-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>If you repeated this trade every {entryDTE} days for a year</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-2xl font-bold text-indigo-500">
                  {annualizedReturn.toFixed(1)}%
                </p>
                <p className="text-xs text-indigo-500/70 mt-1">
                  based on {entryDTE} DTE
                </p>
              </div>
            </div>

            {/* New: Break-even & Capital Required */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <Target className="h-3.5 w-3.5 text-zinc-500" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">Break-even</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-zinc-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{entryType === 'csp' ? 'Stock price where you break even if assigned' : 'Stock price where you break even if called away'}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                  ${breakEven.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <Wallet className="h-3.5 w-3.5 text-zinc-500" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">Capital Required</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-zinc-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{entryType === 'csp' ? 'Cash to secure the put' : 'Value of shares to cover the call'}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                  {formatCurrency(capitalRequired)}
                </p>
              </div>
            </div>

            {/* Historical context at similar strikes */}
            {similarStrikePerformance && similarStrikePerformance.trades >= 3 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <Shield className="h-3.5 w-3.5 inline mr-1" />
                  <strong>At strikes ${entryStrike - 10}-${entryStrike + 10}:</strong> You had a {similarStrikePerformance.winRate.toFixed(0)}% win rate across {similarStrikePerformance.trades} trades.
                </p>
              </div>
            )}

            {/* Risk Info */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Historical context:</strong> Your assignment rate on {insights.symbol} is {summary.assignmentRate.toFixed(1)}%.
                Based on {summary.totalTrades} trades, {summary.winRate.toFixed(1)}% were profitable.
              </p>
            </div>

            {/* Reset Button */}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetEntry} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Scenario Projector - Enhanced */}
        {mode === 'scenario' && (
          <div className="space-y-4">
            {/* Intro */}
            <div className="p-3 bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">
                <strong className="text-emerald-800 dark:text-emerald-200">Forecast your income.</strong>{' '}
                <span className="hidden sm:inline">
                  See how much premium you could collect over time if you keep trading {insights.symbol} at your current pace. The chart shows expected, optimistic, and conservative projections based on your historical variance.
                </span>
                <span className="sm:hidden">
                  Project your potential income based on your trading history.
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between mb-1">
                  <Label className="text-xs">Projection Period</Label>
                  <span className="text-xs text-zinc-500">{scenarioMonths} months</span>
                </div>
                <Slider
                  value={[scenarioMonths]}
                  onValueChange={([v]) => setScenarioMonths(v)}
                  min={1}
                  max={24}
                  step={1}
                  className="mt-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">Trades/Month</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-zinc-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Adjust based on how active you plan to be</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-xs text-zinc-500">{tradesPerMonth.toFixed(1)}</span>
                </div>
                <Slider
                  value={[tradesPerMonth * 10]}
                  onValueChange={([v]) => setTradesPerMonth(v / 10)}
                  min={1}
                  max={100}
                  step={1}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Projection Chart */}
            <div className="h-40 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg p-2">
              <Line
                data={{
                  labels: projectionChartData.labels,
                  datasets: [
                    {
                      label: 'Optimistic',
                      data: projectionChartData.optimisticData,
                      borderColor: 'rgba(16, 185, 129, 0.4)',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      fill: '+1',
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 1,
                      borderDash: [4, 4],
                    },
                    {
                      label: 'Expected',
                      data: projectionChartData.baseData,
                      borderColor: 'rgb(99, 102, 241)',
                      backgroundColor: 'transparent',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 2,
                    },
                    {
                      label: 'Conservative',
                      data: projectionChartData.pessimisticData,
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      backgroundColor: 'transparent',
                      fill: false,
                      tension: 0.4,
                      pointRadius: 0,
                      borderWidth: 1,
                      borderDash: [4, 4],
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...chartTooltipStyle,
                      callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw as number)}`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      grid: { display: false },
                      ticks: {
                        maxTicksLimit: 6,
                        font: { size: 10 },
                      },
                    },
                    y: {
                      display: true,
                      grid: { color: 'rgba(0,0,0,0.05)' },
                      ticks: {
                        callback: (v) => formatCompactCurrency(Number(v)),
                        font: { size: 10 },
                      },
                    },
                  },
                } as ChartOptions<'line'>}
              />
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-emerald-500/40 border-dashed" />
                <span className="text-zinc-500">Optimistic</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-indigo-500" />
                <span className="text-zinc-500">Expected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-red-500/40 border-dashed" />
                <span className="text-zinc-500">Conservative</span>
              </div>
            </div>

            {/* Results */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-center">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5">Optimistic</p>
                <p className="text-lg font-bold text-emerald-500">
                  {formatCompactCurrency(optimisticIncome)}
                </p>
              </div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-center">
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mb-0.5">Expected</p>
                <p className="text-lg font-bold text-indigo-500">
                  {formatCompactCurrency(projectedIncome)}
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl text-center">
                <p className="text-[10px] text-red-600 dark:text-red-400 mb-0.5">Conservative</p>
                <p className="text-lg font-bold text-red-500">
                  {formatCompactCurrency(pessimisticIncome)}
                </p>
              </div>
            </div>

            {/* CC vs CSP Breakdown */}
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">Strategy Breakdown (Expected)</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-500">Covered Calls</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(projectedCCIncome)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${ccRatio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-500">Cash Secured Puts</span>
                    <span className="font-medium text-violet-600">{formatCurrency(projectedCSPIncome)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{ width: `${cspRatio * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <strong>Based on your history:</strong> ~{projectedTrades} trades at {formatCurrency(avgTradeIncome)} avg.
                Confidence bands based on your monthly income variance of ±{formatCurrency(variance)}.
              </p>
            </div>

            {/* Reset Button */}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetScenario} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Wheel Cycle Simulator */}
        {mode === 'wheel' && (
          <WheelCycleSimulator insights={insights} />
        )}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Wheel Cycle Simulator Sub-component - Enhanced
// ============================================================================

function WheelCycleSimulator({ insights }: { insights: TickerInsightsData }) {
  const { summary, simulatorData, timeline } = insights;

  const [stockPrice, setStockPrice] = useState(100);
  const [cspStrike, setCspStrike] = useState(95);
  const [ccStrike, setCcStrike] = useState(105);
  const [cycleCount, setCycleCount] = useState(4);
  const [activeStep, setActiveStep] = useState(0);

  // Calculate cycle metrics
  const cspPremium = (cspStrike * 100 * simulatorData.avgCSPPremiumPct) / 100;
  const ccPremium = (ccStrike * 100 * simulatorData.avgCCPremiumPct) / 100;

  // Scenario A: CSP expires worthless
  const scenarioAPremium = cspPremium;

  // Scenario B: CSP assigned, then CC called away
  const scenarioBPremium = cspPremium + ccPremium;
  const effectiveBasis = cspStrike - (cspPremium / 100);

  // Scenario C: Bagholding - stock drops, need multiple CC cycles
  const stockDropPct = 0.15; // Assume 15% drop
  const droppedPrice = cspStrike * (1 - stockDropPct);
  const ccCyclesNeeded = Math.ceil((cspStrike - droppedPrice) / (ccPremium / 100));
  const bagholdingPremium = cspPremium + (ccPremium * ccCyclesNeeded);

  // Capital required
  const capitalRequired = cspStrike * 100;

  // ROI calculations
  const scenarioAROI = (scenarioAPremium / capitalRequired) * 100;
  const scenarioBROI = (scenarioBPremium / capitalRequired) * 100;
  const scenarioCROI = (bagholdingPremium / capitalRequired) * 100;

  // Average cycle duration from history
  const avgCycleDuration = useMemo(() => {
    // Calculate average hold time from timeline
    const holdTimes = timeline
      .filter(t => t.daysHeld && t.daysHeld > 0)
      .map(t => t.daysHeld);
    if (!holdTimes.length) return 30; // Default 30 days
    return Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length);
  }, [timeline]);

  // Multiple cycles projection
  const avgCycleIncome = (scenarioAPremium * (1 - summary.assignmentRate / 100)) +
    (scenarioBPremium * (summary.assignmentRate / 100));
  const projectedCycleIncome = avgCycleIncome * cycleCount;
  const projectedROI = (projectedCycleIncome / capitalRequired) * 100;
  const projectedDays = avgCycleDuration * cycleCount;

  // Reset form
  const resetWheel = () => {
    setStockPrice(100);
    setCspStrike(95);
    setCcStrike(105);
    setCycleCount(4);
    setActiveStep(0);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Intro */}
        <div className="p-3 bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-lg border border-violet-100 dark:border-violet-900/30">
          <p className="text-xs sm:text-sm text-violet-700 dark:text-violet-300 leading-relaxed">
            <strong className="text-violet-800 dark:text-violet-200">Simulate the wheel strategy.</strong>{' '}
            <span className="hidden sm:inline">
              The wheel involves selling cash-secured puts until assigned, then selling covered calls until shares are called away. Enter your target strikes to see potential outcomes across different scenarios.
            </span>
            <span className="sm:hidden">
              Model CSP → Assignment → CC cycle outcomes.
            </span>
          </p>
        </div>

        {/* Visual Flow Diagram */}
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-4 text-center">Wheel Cycle Flow</p>
          <div className="flex items-center justify-center gap-2 sm:gap-3 overflow-x-auto custom-scrollbar pb-2">
            {/* Step 1: Sell CSP */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveStep(0)}
                  className={cn(
                    'flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all min-w-15 sm:min-w-[17.5]',
                    activeStep === 0
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                      : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/60'
                  )}
                >
                  <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 mb-1" />
                  <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Sell CSP</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Collect {formatCurrency(cspPremium)} premium</p>
              </TooltipContent>
            </Tooltip>

            <ArrowRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />

            {/* Step 2: Assigned? */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveStep(1)}
                  className={cn(
                    'flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all min-w-15 sm:min-w-[17.5]',
                    activeStep === 1
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                  )}
                >
                  <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 mb-1" />
                  <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Assigned?</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{summary.assignmentRate.toFixed(0)}% chance of assignment</p>
              </TooltipContent>
            </Tooltip>

            <ArrowRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />

            {/* Step 3: Own Stock */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveStep(2)}
                  className={cn(
                    'flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all min-w-15 sm:min-w-[17.5]',
                    activeStep === 2
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                  )}
                >
                  <Wallet className="h-5 w-5 sm:h-6 sm:w-6 mb-1" />
                  <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Own Stock</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cost basis: ${effectiveBasis.toFixed(2)}/share</p>
              </TooltipContent>
            </Tooltip>

            <ArrowRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />

            {/* Step 4: Sell CC */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveStep(3)}
                  className={cn(
                    'flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all min-w-15 sm:min-w-[17.5]',
                    activeStep === 3
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                  )}
                >
                  <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 mb-1" />
                  <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Sell CC</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Collect {formatCurrency(ccPremium)} premium</p>
              </TooltipContent>
            </Tooltip>

            <ArrowRight className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />

            {/* Step 5: Called Away */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveStep(4)}
                  className={cn(
                    'flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all min-w-15 sm:min-w-[17.5]',
                    activeStep === 4
                      ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25'
                      : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/60'
                  )}
                >
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 mb-1" />
                  <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Called Away</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total cycle profit: {formatCurrency(scenarioBPremium)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Stock Price</Label>
            <Input
              type="number"
              value={stockPrice}
              onChange={(e) => setStockPrice(Number(e.target.value) || 100)}
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">CSP Strike</Label>
            <Input
              type="number"
              value={cspStrike}
              onChange={(e) => setCspStrike(Number(e.target.value) || 95)}
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">CC Strike</Label>
            <Input
              type="number"
              value={ccStrike}
              onChange={(e) => setCcStrike(Number(e.target.value) || 105)}
              className="h-9 mt-1"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <Label className="text-xs">Number of Cycles</Label>
            <span className="text-xs text-zinc-500">{cycleCount}</span>
          </div>
          <Slider
            value={[cycleCount]}
            onValueChange={([v]) => setCycleCount(v)}
            min={1}
            max={12}
            step={1}
            className="mt-2"
          />
        </div>

        {/* Scenario Cards - Enhanced */}
        <div className="space-y-2">
          {/* Scenario A: CSP Expires */}
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  A: CSP Expires Worthless
                </h4>
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                {(100 - summary.assignmentRate).toFixed(0)}% likely
              </Badge>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <p className="text-xl font-bold text-emerald-500">{formatCurrency(scenarioAPremium)}</p>
              <p className="text-xs text-emerald-600/70">{scenarioAROI.toFixed(1)}% ROI</p>
            </div>
          </div>

          {/* Scenario B: Full Wheel */}
          <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-violet-500" />
                <h4 className="text-sm font-medium text-violet-700 dark:text-violet-400">
                  B: Full Wheel Cycle
                </h4>
              </div>
              <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px]">
                {summary.assignmentRate.toFixed(0)}% likely
              </Badge>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <p className="text-xl font-bold text-violet-500">{formatCurrency(scenarioBPremium)}</p>
              <p className="text-xs text-violet-600/70">{scenarioBROI.toFixed(1)}% ROI | Basis: ${effectiveBasis.toFixed(2)}</p>
            </div>
          </div>

          {/* Scenario C: Bagholding */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  C: Bagholding (15% drop)
                </h4>
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-amber-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stock drops to ${droppedPrice.toFixed(2)}, requires {ccCyclesNeeded} CC cycles to recover</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <p className="text-xl font-bold text-amber-500">{formatCurrency(bagholdingPremium)}</p>
              <p className="text-xs text-amber-600/70">{scenarioCROI.toFixed(1)}% ROI | {ccCyclesNeeded} CC cycles to recover</p>
            </div>
          </div>
        </div>

        {/* Projected Income */}
        <div className="p-4 bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
              Projected {cycleCount} Cycle Income
            </span>
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px]">
              ~{projectedDays} days
            </Badge>
          </div>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(projectedCycleIncome)}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-indigo-500/70">
            <span>~{formatCurrency(avgCycleIncome)}/cycle</span>
            <span>•</span>
            <span>{projectedROI.toFixed(1)}% ROI on ${formatCompactCurrency(capitalRequired)}</span>
          </div>
        </div>

        {/* Historical Context */}
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <Clock className="h-3.5 w-3.5 inline mr-1" />
            <strong>Average cycle duration:</strong> {avgCycleDuration} days based on your {summary.totalTrades} historical trades on {insights.symbol}.
          </p>
        </div>

        {/* Reset Button */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={resetWheel} className="text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Assignment Deep Dive Tab
// ============================================================================

interface AssignmentEpisode {
  id: string;
  assignmentDate: string;
  assignmentStrike: number;
  cspPremium: number;
  ccTrades: TickerTrade[];
  totalCCPremium: number;
  totalPremium: number;
  daysHeld: number;
  outcome: 'called_away' | 'still_holding' | 'sold';
  exitDate: string | null;
  effectiveBasis: number;
  basisReduction: number;
}

function AssignmentTab({ insights }: { insights: TickerInsightsData }) {
  const { timeline, summary } = insights;

  // Build assignment episodes from timeline
  const episodes = useMemo(() => {
    const result: AssignmentEpisode[] = [];

    // Find all CSP assignments (puts that were assigned)
    const cspAssignments = timeline.filter(
      t => t.optionType === 'put' && t.closeReason === 'assigned'
    );

    // For each assignment, find subsequent CC trades until exit
    for (const assignment of cspAssignments) {
      const assignmentDate = new Date(assignment.closeDate);
      const assignmentStrike = assignment.strike;

      // Find CC trades after this assignment
      const subsequentCCs = timeline.filter(t => {
        if (t.optionType !== 'call') return false;
        const tradeDate = new Date(t.openDate);
        return tradeDate >= assignmentDate;
      });

      // Track CC trades until we find one that was assigned (called away)
      const episodeCCs: TickerTrade[] = [];
      let exitDate: string | null = null;
      let outcome: 'called_away' | 'still_holding' | 'sold' = 'still_holding';

      for (const cc of subsequentCCs) {
        // Check if this CC was part of a later assignment episode (different strike = different stock lot)
        // For simplicity, we'll include all CCs after this assignment
        episodeCCs.push(cc);

        if (cc.closeReason === 'assigned') {
          // Stock was called away
          outcome = 'called_away';
          exitDate = cc.closeDate;
          break;
        }
      }

      const totalCCPremium = episodeCCs.reduce((sum, cc) => sum + cc.premium, 0);
      const totalPremium = assignment.premium + totalCCPremium;

      // Calculate days held
      const endDate = exitDate ? new Date(exitDate) : new Date();
      const daysHeld = Math.ceil((endDate.getTime() - assignmentDate.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate effective basis
      const sharesPerContract = 100 * assignment.quantity;
      const originalBasis = assignmentStrike * sharesPerContract;
      const effectiveBasis = (originalBasis - totalPremium) / sharesPerContract;
      const basisReduction = assignmentStrike - effectiveBasis;

      result.push({
        id: assignment.id,
        assignmentDate: assignment.closeDate,
        assignmentStrike,
        cspPremium: assignment.premium,
        ccTrades: episodeCCs,
        totalCCPremium,
        totalPremium,
        daysHeld,
        outcome,
        exitDate,
        effectiveBasis: Math.round(effectiveBasis * 100) / 100,
        basisReduction: Math.round(basisReduction * 100) / 100,
      });
    }

    return result.sort((a, b) => b.assignmentDate.localeCompare(a.assignmentDate));
  }, [timeline]);

  // Calculate aggregate metrics
  const metrics = useMemo(() => {
    if (episodes.length === 0) {
      return {
        totalEpisodes: 0,
        completedEpisodes: 0,
        avgRecoveryDays: 0,
        totalPremiumWhileBagholding: 0,
        avgCCsPerEpisode: 0,
        successfulExits: 0,
        avgBasisReduction: 0,
      };
    }

    const completedEpisodes = episodes.filter(e => e.outcome === 'called_away');
    const avgRecoveryDays = completedEpisodes.length > 0
      ? completedEpisodes.reduce((sum, e) => sum + e.daysHeld, 0) / completedEpisodes.length
      : 0;

    const totalPremiumWhileBagholding = episodes.reduce((sum, e) => sum + e.totalCCPremium, 0);
    const avgCCsPerEpisode = episodes.reduce((sum, e) => sum + e.ccTrades.length, 0) / episodes.length;
    const avgBasisReduction = episodes.reduce((sum, e) => sum + e.basisReduction, 0) / episodes.length;

    return {
      totalEpisodes: episodes.length,
      completedEpisodes: completedEpisodes.length,
      avgRecoveryDays: Math.round(avgRecoveryDays),
      totalPremiumWhileBagholding: Math.round(totalPremiumWhileBagholding * 100) / 100,
      avgCCsPerEpisode: Math.round(avgCCsPerEpisode * 10) / 10,
      successfulExits: completedEpisodes.length,
      avgBasisReduction: Math.round(avgBasisReduction * 100) / 100,
    };
  }, [episodes]);

  // Compare assigned vs non-assigned trades
  const comparison = useMemo(() => {
    const assignedTrades = timeline.filter(t => t.closeReason === 'assigned');
    const nonAssignedTrades = timeline.filter(t => t.closeReason !== 'assigned');

    const assignedPremium = assignedTrades.reduce((sum, t) => sum + t.premium, 0);
    const nonAssignedPremium = nonAssignedTrades.reduce((sum, t) => sum + t.premium, 0);

    const assignedAvg = assignedTrades.length > 0 ? assignedPremium / assignedTrades.length : 0;
    const nonAssignedAvg = nonAssignedTrades.length > 0 ? nonAssignedPremium / nonAssignedTrades.length : 0;

    return {
      assignedCount: assignedTrades.length,
      nonAssignedCount: nonAssignedTrades.length,
      assignedPremium,
      nonAssignedPremium,
      assignedAvg,
      nonAssignedAvg,
    };
  }, [timeline]);

  // Build cost basis evolution chart data
  const chartData = useMemo(() => {
    if (episodes.length === 0) return null;

    // For each episode, track cumulative premium collected
    const allEvents: Array<{ date: string; label: string; premium: number; cumulative: number; type: 'csp' | 'cc' }> = [];

    for (const episode of episodes) {
      let cumulative = 0;

      // Add CSP assignment
      cumulative += episode.cspPremium;
      allEvents.push({
        date: episode.assignmentDate,
        label: `CSP $${episode.assignmentStrike}`,
        premium: episode.cspPremium,
        cumulative,
        type: 'csp',
      });

      // Add CC trades
      for (const cc of episode.ccTrades) {
        cumulative += cc.premium;
        allEvents.push({
          date: cc.closeDate,
          label: `CC $${cc.strike}`,
          premium: cc.premium,
          cumulative,
          type: 'cc',
        });
      }
    }

    // Sort by date
    allEvents.sort((a, b) => a.date.localeCompare(b.date));

    // Recalculate cumulative after sort
    let runningTotal = 0;
    for (const event of allEvents) {
      runningTotal += event.premium;
      event.cumulative = runningTotal;
    }

    return {
      labels: allEvents.map(e => e.date.substring(5)), // MM-DD format
      data: allEvents.map(e => e.cumulative),
      events: allEvents,
    };
  }, [episodes]);

  // No assignments
  if (summary.assignments === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          No Assignments Yet
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          Great news! None of your {insights.symbol} options have been assigned.
          Your win rate is {summary.winRate.toFixed(1)}% with {summary.expirations} options expired worthless.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Intro */}
        <div className="p-3 bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-lg border border-violet-100 dark:border-violet-900/30">
          <p className="text-xs sm:text-sm text-violet-700 dark:text-violet-300 leading-relaxed">
            <strong className="text-violet-800 dark:text-violet-200">Assignment Deep Dive.</strong>{' '}
            <span className="hidden sm:inline">
              Track what happens after your puts get assigned. See how long it takes to recover via covered calls,
              how much premium you collect while holding, and your effective cost basis reduction over time.
            </span>
            <span className="sm:hidden">
              Track recovery after assignment via covered calls.
            </span>
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Assignment Episodes"
            value={metrics.totalEpisodes.toString()}
            icon={<AlertCircle className="h-4 w-4" />}
            color="violet"
          />
          <StatCard
            label="Completed Cycles"
            value={`${metrics.completedEpisodes}/${metrics.totalEpisodes}`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color={metrics.completedEpisodes === metrics.totalEpisodes ? 'emerald' : 'amber'}
          />
          <StatCard
            label="Avg Recovery"
            value={`${metrics.avgRecoveryDays}d`}
            icon={<Clock className="h-4 w-4" />}
            color="blue"
          />
          <StatCard
            label="CC Premium (Baghold)"
            value={formatCurrency(metrics.totalPremiumWhileBagholding)}
            icon={<DollarSign className="h-4 w-4" />}
            color="emerald"
          />
        </div>

        {/* Premium Evolution Chart */}
        {chartData && chartData.data.length > 1 && (
          <div className="bg-zinc-50 dark:bg-zinc-800/30 rounded-xl p-4">
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              Cumulative Premium (Post-Assignment)
            </h4>
            <div className="h-40">
              <Line
                data={{
                  labels: chartData.labels,
                  datasets: [
                    {
                      label: 'Cumulative Premium',
                      data: chartData.data,
                      borderColor: 'rgb(99, 102, 241)',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 4,
                      pointBackgroundColor: chartData.events.map(e =>
                        e.type === 'csp' ? 'rgb(147, 51, 234)' : 'rgb(16, 185, 129)'
                      ),
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...chartTooltipStyle,
                      callbacks: {
                        title: (items) => {
                          const event = chartData.events[items[0]?.dataIndex || 0];
                          return event ? event.label : '';
                        },
                        label: (ctx) => `Cumulative: ${formatCurrency(ctx.raw as number)}`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { maxTicksLimit: 6, font: { size: 10 } },
                    },
                    y: {
                      ticks: {
                        callback: (v) => formatCompactCurrency(Number(v)),
                        font: { size: 10 },
                      },
                    },
                  },
                } as ChartOptions<'line'>}
              />
            </div>
            <div className="flex justify-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                <span className="text-zinc-500">CSP Premium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-zinc-500">CC Premium</span>
              </div>
            </div>
          </div>
        )}

        {/* Assigned vs Non-Assigned Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-violet-500" />
              <h4 className="text-sm font-medium text-violet-700 dark:text-violet-400">Assigned Trades</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-violet-600/70">Count</span>
                <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{comparison.assignedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-violet-600/70">Total Premium</span>
                <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{formatCurrency(comparison.assignedPremium)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-violet-600/70">Avg Premium</span>
                <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{formatCurrency(comparison.assignedAvg)}</span>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Non-Assigned Trades</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-emerald-600/70">Count</span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{comparison.nonAssignedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-emerald-600/70">Total Premium</span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{formatCurrency(comparison.nonAssignedPremium)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-emerald-600/70">Avg Premium</span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{formatCurrency(comparison.nonAssignedAvg)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Assignment Episodes */}
        <div className="bg-zinc-50 dark:bg-zinc-800/30 rounded-xl p-4">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" />
            Assignment Episodes
          </h4>
          <div className="space-y-3 max-h-100 overflow-y-auto custom-scrollbar">
            {episodes.map((episode) => (
              <div
                key={episode.id}
                className="p-3 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                {/* Episode Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px]',
                        episode.outcome === 'called_away'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      )}
                    >
                      {episode.outcome === 'called_away' ? 'Completed' : 'In Progress'}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {episode.assignmentDate}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {episode.daysHeld} days
                  </span>
                </div>

                {/* Episode Stats */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-zinc-500">Strike</p>
                    <p className="font-medium">${episode.assignmentStrike}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">CSP Premium</p>
                    <p className="font-medium text-violet-600">{formatCurrency(episode.cspPremium)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">CC Premium</p>
                    <p className="font-medium text-emerald-600">{formatCurrency(episode.totalCCPremium)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Total</p>
                    <p className="font-bold text-indigo-600">{formatCurrency(episode.totalPremium)}</p>
                  </div>
                </div>

                {/* Cost Basis Evolution */}
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      Cost Basis: ${episode.assignmentStrike} → ${episode.effectiveBasis}
                    </span>
                    <span className="font-medium text-emerald-600">
                      -{formatCurrency(episode.basisReduction)}/share
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (episode.basisReduction / episode.assignmentStrike) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* CC Trades Count */}
                {episode.ccTrades.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <RefreshCw className="h-3 w-3" />
                    {episode.ccTrades.length} covered call{episode.ccTrades.length !== 1 ? 's' : ''} sold
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Insights Summary */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
            <strong>Insight:</strong>{' '}
            {metrics.avgCCsPerEpisode >= 2
              ? `On average, you sell ${metrics.avgCCsPerEpisode.toFixed(1)} covered calls per assignment, collecting ${formatCurrency(metrics.totalPremiumWhileBagholding / metrics.totalEpisodes)} in additional premium.`
              : metrics.totalEpisodes === metrics.completedEpisodes
                ? 'All your assignments have been successfully recovered through covered calls!'
                : `You have ${metrics.totalEpisodes - metrics.completedEpisodes} ongoing assignment episode(s). Keep selling covered calls to reduce your cost basis.`
            }
            {metrics.avgBasisReduction > 0 && (
              <span className="block mt-1">
                Average cost basis reduction: <strong>${metrics.avgBasisReduction.toFixed(2)}/share</strong>
              </span>
            )}
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'violet';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
    violet: 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
  };

  return (
    <div className={cn('p-3 rounded-xl', colorClasses[color])}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

// ============================================================================
// Weekly Return Insights Section
// ============================================================================

function WeeklyReturnInsightsSection({
  weeklyReturnInsights,
}: {
  weeklyReturnInsights: WeeklyReturnInsights | null;
}) {
  // Show message if no price data available
  if (!weeklyReturnInsights) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-700">
            <Zap className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Weekly Return Insights
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Weekly return insights available when you own at least one share of this stock.
              Connect your broker account via SnapTrade to see returns rebased to current market prices.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    currentPrice,
    sharesOwned,
    lastPriceUpdate,
    ccWeeklyReturn,
    cspWeeklyReturn,
    totalWeeklyReturn,
    annualizedCCReturn,
    annualizedCSPReturn,
    annualizedTotalReturn,
    ccTradeCount,
    cspTradeCount,
    avgDTEUsed,
  } = weeklyReturnInsights;

  // Format the last update time
  const lastUpdateFormatted = new Date(lastPriceUpdate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-500" />
          Weekly Return Insights
        </h4>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] whitespace-normal break-words text-left">
                ${currentPrice.toFixed(2)} | {sharesOwned.toFixed(sharesOwned % 1 === 0 ? 0 : 2)} shares
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Price updated: {lastUpdateFormatted}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Weekly Return Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {/* CC Weekly Return */}
        <div className="p-3 bg-white/60 dark:bg-zinc-800/60 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">CC Weekly</span>
          </div>
          <p className={cn(
            'text-lg font-bold',
            ccWeeklyReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {ccWeeklyReturn >= 0 ? '+' : ''}{ccWeeklyReturn.toFixed(3)}%
          </p>
          <p className="text-[10px] text-zinc-400">{ccTradeCount} trades</p>
        </div>

        {/* CSP Weekly Return */}
        <div className="p-3 bg-white/60 dark:bg-zinc-800/60 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">CSP Weekly</span>
          </div>
          <p className={cn(
            'text-lg font-bold',
            cspWeeklyReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {cspWeeklyReturn >= 0 ? '+' : ''}{cspWeeklyReturn.toFixed(3)}%
          </p>
          <p className="text-[10px] text-zinc-400">{cspTradeCount} trades</p>
        </div>

        {/* Total Weekly Return */}
        <div className="p-3 bg-emerald-100/60 dark:bg-emerald-900/30 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Total Weekly</span>
          </div>
          <p className={cn(
            'text-lg font-bold',
            totalWeeklyReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {totalWeeklyReturn >= 0 ? '+' : ''}{totalWeeklyReturn.toFixed(3)}%
          </p>
          <p className="text-[10px] text-zinc-400">avg {avgDTEUsed.toFixed(1)}d DTE</p>
        </div>
      </div>

      {/* Annualized Projections */}
      <div className="p-3 bg-white/40 dark:bg-zinc-800/40 rounded-lg">
        <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
          Annualized Projections (52 weeks)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">CC:</span>
            <span className={cn(
              'text-sm font-semibold break-words',
              annualizedCCReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {annualizedCCReturn >= 0 ? '+' : ''}{annualizedCCReturn.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">CSP:</span>
            <span className={cn(
              'text-sm font-semibold break-words',
              annualizedCSPReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {annualizedCSPReturn >= 0 ? '+' : ''}{annualizedCSPReturn.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Total:</span>
            <span className={cn(
              'text-sm font-bold break-words',
              annualizedTotalReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}>
              {annualizedTotalReturn >= 0 ? '+' : ''}{annualizedTotalReturn.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2">
        Returns rebased to current ${currentPrice.toFixed(2)} price. Weekly return = (premium / collateral) * (7 / DTE).
      </p>
    </div>
  );
}
