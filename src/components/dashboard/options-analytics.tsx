/**
 * Options Analytics Component
 *
 * Comprehensive analytics dashboard for options traders with 6 tabs:
 * 1. DTE Analysis - Days to expiration performance with sweet spot
 * 2. Strategy - Performance by option strategy
 * 3. Win/Loss - Deep dive with cumulative charts
 * 4. Exit Type - Expired/Assigned/Early close breakdown
 * 5. Premium - Credit vs Debit analysis for sellers
 * 6. Position Sizing - Performance by trade size, ticker concentration
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Zap,
  Award,
  AlertTriangle,
  DollarSign,
  Percent,
  RefreshCcw,
  ChevronRight,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Scale,
  PieChart,
  Calendar,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, formatCurrency, formatCompactCurrency, chartTooltipStyle } from '@/lib/utils';


// ============================================================================
// Types
// ============================================================================

interface DTEBucket {
  label: string;
  tradeCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
  totalVolume: number;
}

interface StrategyStats {
  strategy: string;
  displayName: string;
  tradeCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
  avgDTE: number;
}

interface WinLossStats {
  totalPnL: number;
  tradeCount: number;
  avgPnL: number;
  medianPnL: number;
  largestTrade: number;
  avgHoldTime: number;
  avgDTE: number;
  totalVolume: number;
  maxConsecutive: number;
  cumulativeDaily: Array<{ date: string; cumPnL: number; count: number }>;
}

interface ExitStats {
  exitType: string;
  count: number;
  totalPnL: number;
  avgPnL: number;
  winRate: number;
  avgHoldTime: number;
}

interface SizeBucket {
  label: string;
  tradeCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  avgSize: number;
}

interface TickerConcentration {
  symbol: string;
  tradeCount: number;
  totalPnL: number;
  percentage: number;
  winRate: number;
}

interface OptionsAnalyticsData {
  summary: {
    totalTrades: number;
    totalPnL: number;
    winRate: number;
    avgDTE: number;
    wins: number;
    losses: number;
  };
  dte: {
    buckets: DTEBucket[];
    sweetSpot: { range: string; winRate: number; avgPnL: number; reason: string } | null;
  };
  strategy: {
    byStrategy: StrategyStats[];
    comparison: {
      mostProfitable: string;
      mostProfitablePnL: number;
      highestWinRate: string | null;
      highestWinRatePct: number;
      mostActive: string | null;
      mostActiveCount: number;
    } | null;
  };
  winLoss: {
    wins: WinLossStats | null;
    losses: WinLossStats | null;
    streaks: {
      currentType: 'win' | 'loss' | 'none';
      currentCount: number;
      longestWin: number;
      longestLoss: number;
    };
    recovery: {
      recoveryRate: number;
      avgRecoveryDays: number;
      avgRecoveryAmount: number;
      bounceBackRatio: number;
    } | null;
  };
  exitType: {
    breakdown: ExitStats[];
    recommendations: Array<{ type: string; message: string }>;
  };
  premium: {
    credit: { totalReceived: number; totalKept: number; captureRate: number; tradeCount: number } | null;
    debit: { totalPaid: number; totalPnL: number; avgReturn: number; tradeCount: number } | null;
  };
  positionSizing: {
    buckets: SizeBucket[];
    optimalRange: { label: string; winRate: number; avgPnL: number; reason: string } | null;
    concentration: TickerConcentration[];
    avgPositionSize: number;
    medianPositionSize: number;
  };
}

interface OptionsAnalyticsProps {
  accountId: string | null;
}

// Expiry Cycles types (from options-timing API)
interface CycleStats {
  tradeCount: number;
  totalPnL: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
}

interface ExpiryCyclesData {
  expiryCycles: {
    weekly: CycleStats | null;
    monthly: CycleStats | null;
    insight: string | null;
  };
  opexWeek: {
    opex: CycleStats | null;
    nonOpex: CycleStats | null;
    insight: string | null;
  };
}

const EXIT_TYPE_LABELS: Record<string, string> = {
  expired: 'Expired Worthless',
  assigned: 'Assigned',
  closed_early: 'Closed Early',
  closed_at_expiry: 'Closed at Expiry',
};

// Short labels for mobile charts
const EXIT_TYPE_SHORT_LABELS: Record<string, string> = {
  expired: 'Expired',
  assigned: 'Assigned',
  closed_early: 'Early',
  closed_at_expiry: 'At Expiry',
};

// ============================================================================
// Sub-Components
// ============================================================================

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  color = 'default',
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ComponentType<{ className?: string }>;
  color?: 'default' | 'green' | 'red' | 'blue' | 'purple' | 'amber';
}) {
  const colorClasses = {
    default: 'bg-zinc-50 dark:bg-zinc-800/50',
    green: 'bg-rh-green/10',
    red: 'bg-rh-red/10',
    blue: 'bg-blue-50 dark:bg-blue-900/20',
    purple: 'bg-purple-50 dark:bg-purple-900/20',
    amber: 'bg-amber-50 dark:bg-amber-900/20',
  };

  const iconColors = {
    default: 'text-zinc-600 dark:text-zinc-400',
    green: 'text-rh-green',
    red: 'text-rh-red',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };

  return (
    <div className={cn('p-3 rounded-xl', colorClasses[color])}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={cn('h-4 w-4', iconColors[color])} />}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      </div>
      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
      {subValue && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subValue}</p>}
    </div>
  );
}

function SummaryTable({ data, columns }: {
  data: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string; format?: (v: number | string) => string }>;
}) {
  // Mobile: show as cards, Desktop: show as table
  return (
    <>
      {/* Mobile Cards View */}
      <div className="sm:hidden space-y-3">
        {data.map((row, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30"
          >
            <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">
              {row[columns[0].key]}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {columns.slice(1).map(col => (
                <div key={col.key} className="flex justify-between">
                  <span className="text-zinc-500">{col.label}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              {columns.map(col => (
                <th key={col.key} className="text-left py-2 px-2 font-medium text-zinc-500 dark:text-zinc-400">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                {columns.map(col => (
                  <td key={col.key} className="py-2 px-2 text-zinc-900 dark:text-zinc-100">
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChartFlipButton({ isHorizontal, onToggle }: { isHorizontal: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      title={isHorizontal ? 'Switch to vertical bars' : 'Switch to horizontal bars'}
    >
      <RotateCcw className="h-4 w-4" />
    </button>
  );
}

// ============================================================================
// Tab: DTE Analysis
// ============================================================================

function DTETab({ data }: { data: OptionsAnalyticsData['dte'] }) {
  const [isHorizontal1, setIsHorizontal1] = useState(true);
  const [isHorizontal2, setIsHorizontal2] = useState(true);
  const filteredData = data.buckets.filter(b => b.tradeCount > 0);

  // Trade Distribution Chart Data
  const tradeDistChartData = {
    labels: filteredData.map(b => b.label),
    datasets: [{
      label: 'Trades',
      data: filteredData.map(b => b.tradeCount),
      backgroundColor: 'rgba(99, 102, 241, 0.8)',
      borderRadius: 4,
    }],
  };

  const tradeDistOptions: ChartOptions<'bar'> = {
    indexAxis: isHorizontal1 ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (ctx) => {
            const idx = ctx.dataIndex;
            const bucket = filteredData[idx];
            return [
              `${formatCurrency(bucket.totalPnL)}`,
              `${bucket.tradeCount} trades · ${bucket.winRate}% win`,
            ];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: !isHorizontal1 } },
      y: { grid: { display: isHorizontal1 } },
    },
  };

  // P&L by DTE Chart Data
  const pnlChartData = {
    labels: filteredData.map(b => b.label),
    datasets: [{
      label: 'P&L',
      data: filteredData.map(b => b.totalPnL),
      backgroundColor: filteredData.map(b => b.totalPnL >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
      borderRadius: 4,
    }],
  };

  const pnlChartOptions: ChartOptions<'bar'> = {
    indexAxis: isHorizontal2 ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (ctx) => {
            const idx = ctx.dataIndex;
            const bucket = filteredData[idx];
            return [
              `${formatCurrency(bucket.totalPnL)}`,
              `${bucket.tradeCount} trades · ${bucket.winRate}% win`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: !isHorizontal2 },
        ticks: isHorizontal2 ? { callback: (v) => formatCompactCurrency(v as number) } : {},
      },
      y: {
        grid: { display: isHorizontal2 },
        ticks: !isHorizontal2 ? { callback: (v) => formatCompactCurrency(v as number) } : {},
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Sweet Spot Card */}
      {data.sweetSpot && (
        <div className="p-4 rounded-xl bg-rh-green/10 border border-rh-green/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-rh-green" />
            <span className="font-semibold text-rh-green">Your Sweet Spot</span>
          </div>
          <p className="text-2xl font-bold text-rh-green">{data.sweetSpot.range}</p>
          <p className="text-sm text-rh-green/80 mt-1">{data.sweetSpot.reason}</p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade Distribution */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Trade Distribution by DTE
              </h3>
              <HelpTooltip
                title="Trade Distribution"
                description="Shows how many trades you make at each DTE bucket. Helps identify your trading frequency patterns."
              />
            </div>
            <ChartFlipButton isHorizontal={isHorizontal1} onToggle={() => setIsHorizontal1(!isHorizontal1)} />
          </div>
          <div className="h-72 sm:h-64">
            <Bar data={tradeDistChartData} options={tradeDistOptions} />
          </div>
        </div>

        {/* P&L by DTE */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Performance by DTE
              </h3>
              <HelpTooltip
                title="P&L by DTE"
                description="Shows your total profit/loss for each DTE bucket. Green bars are profitable, red bars are losses."
              />
            </div>
            <ChartFlipButton isHorizontal={isHorizontal2} onToggle={() => setIsHorizontal2(!isHorizontal2)} />
          </div>
          <div className="h-72 sm:h-64">
            <Bar data={pnlChartData} options={pnlChartOptions} />
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">Summary</h3>
        <SummaryTable
          data={filteredData.map(b => ({
            dte: b.label,
            netPnL: b.totalPnL,
            winRate: b.winRate,
            wins: b.wins,
            losses: b.losses,
            trades: b.tradeCount,
            volume: b.totalVolume,
          }))}
          columns={[
            { key: 'dte', label: 'DTE' },
            { key: 'netPnL', label: 'Net P&L', format: (v) => formatCurrency(v as number) },
            { key: 'winRate', label: 'Win %', format: (v) => `${v}%` },
            { key: 'wins', label: 'Wins' },
            { key: 'losses', label: 'Losses' },
            { key: 'trades', label: 'Trades' },
            { key: 'volume', label: 'Volume', format: (v) => formatCompactCurrency(v as number) },
          ]}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Strategy Performance
// ============================================================================

function StrategyTab({ data }: { data: OptionsAnalyticsData['strategy'] }) {
  if (data.byStrategy.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No strategy data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparison Cards */}
      {data.comparison && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-rh-green/10 border border-rh-green/30">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-rh-green" />
              <span className="text-xs text-rh-green">Most Profitable</span>
            </div>
            <p className="font-bold text-rh-green">{data.comparison.mostProfitable}</p>
            <p className="text-sm text-rh-green">{formatCurrency(data.comparison.mostProfitablePnL)}</p>
          </div>

          {data.comparison.highestWinRate && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-600 dark:text-blue-400">Highest Win Rate</span>
              </div>
              <p className="font-bold text-blue-700 dark:text-blue-300">{data.comparison.highestWinRate}</p>
              <p className="text-sm text-blue-600">{data.comparison.highestWinRatePct}%</p>
            </div>
          )}

          {data.comparison.mostActive && (
            <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-purple-600" />
                <span className="text-xs text-purple-600 dark:text-purple-400">Most Active</span>
              </div>
              <p className="font-bold text-purple-700 dark:text-purple-300">{data.comparison.mostActive}</p>
              <p className="text-sm text-purple-600">{data.comparison.mostActiveCount} trades</p>
            </div>
          )}
        </div>
      )}

      {/* Strategy List */}
      <div className="space-y-3">
        {data.byStrategy.map(strat => (
          <div
            key={strat.strategy}
            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{strat.displayName}</h4>
                <p className="text-xs text-zinc-500">{strat.tradeCount} trades · Avg {strat.avgDTE} DTE</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  'text-lg font-bold',
                  strat.totalPnL >= 0 ? 'text-rh-green' : 'text-rh-red'
                )}>
                  {formatCurrency(strat.totalPnL)}
                </p>
                <p className="text-xs text-zinc-500">{strat.winRate}% win rate</p>
              </div>
            </div>

            {/* Win/Loss Bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
              <div
                className="bg-rh-green"
                style={{ width: `${(strat.wins / strat.tradeCount) * 100}%` }}
              />
              <div
                className="bg-rh-red"
                style={{ width: `${(strat.losses / strat.tradeCount) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{strat.wins} wins</span>
              <span>{strat.losses} losses</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Win/Loss Deep Dive
// ============================================================================

function WinLossTab({ data }: { data: OptionsAnalyticsData['winLoss'] }) {
  return (
    <div className="space-y-6">
      {/* Split Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Wins Panel */}
        <div className="p-4 rounded-xl bg-rh-green/10 border border-rh-green/30">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-rh-green" />
            <span className="font-semibold text-rh-green">
              Wins ({data.wins?.tradeCount || 0} trades)
            </span>
          </div>

          {data.wins ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-rh-green/70">Total P&L</p>
                  <p className="font-bold text-rh-green">{formatCurrency(data.wins.totalPnL)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-green/70">Avg Win</p>
                  <p className="font-bold text-rh-green">{formatCurrency(data.wins.avgPnL)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-green/70">Largest Win</p>
                  <p className="font-semibold text-rh-green">{formatCurrency(data.wins.largestTrade)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-green/70">Max Consecutive</p>
                  <p className="font-semibold text-rh-green">{data.wins.maxConsecutive}</p>
                </div>
              </div>

              {/* Cumulative Chart */}
              {data.wins.cumulativeDaily.length > 1 && (
                <div className="h-32 mt-4">
                  <Line
                    data={{
                      labels: data.wins.cumulativeDaily.map(d => d.date),
                      datasets: [{
                        data: data.wins.cumulativeDaily.map(d => d.cumPnL),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
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
                        x: { display: false },
                        y: { display: false },
                      },
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No winning trades</p>
          )}
        </div>

        {/* Losses Panel */}
        <div className="p-4 rounded-xl bg-rh-red/10 border border-rh-red/30">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-rh-red" />
            <span className="font-semibold text-rh-red">
              Losses ({data.losses?.tradeCount || 0} trades)
            </span>
          </div>

          {data.losses ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-rh-red/70">Total P&L</p>
                  <p className="font-bold text-rh-red">{formatCurrency(data.losses.totalPnL)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-red/70">Avg Loss</p>
                  <p className="font-bold text-rh-red">{formatCurrency(data.losses.avgPnL)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-red/70">Largest Loss</p>
                  <p className="font-semibold text-rh-red">{formatCurrency(data.losses.largestTrade)}</p>
                </div>
                <div>
                  <p className="text-xs text-rh-red/70">Max Consecutive</p>
                  <p className="font-semibold text-rh-red">{data.losses.maxConsecutive}</p>
                </div>
              </div>

              {/* Cumulative Chart */}
              {data.losses.cumulativeDaily.length > 1 && (
                <div className="h-32 mt-4">
                  <Line
                    data={{
                      labels: data.losses.cumulativeDaily.map(d => d.date),
                      datasets: [{
                        data: data.losses.cumulativeDaily.map(d => d.cumPnL),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
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
                        x: { display: false },
                        y: { display: false },
                      },
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No losing trades</p>
          )}
        </div>
      </div>

      {/* Streaks & Recovery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Current Streak */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">Current Streak</h4>
          <div className={cn(
            'text-3xl font-bold',
            data.streaks.currentType === 'win' ? 'text-rh-green' :
            data.streaks.currentType === 'loss' ? 'text-rh-red' : 'text-zinc-400'
          )}>
            {data.streaks.currentCount} {data.streaks.currentType === 'win' ? 'Wins' : data.streaks.currentType === 'loss' ? 'Losses' : 'N/A'}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-zinc-500">
            <span>Best: {data.streaks.longestWin} wins</span>
            <span>Worst: {data.streaks.longestLoss} losses</span>
          </div>
        </div>

        {/* Recovery Stats */}
        {data.recovery && (
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <h4 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">Recovery Analysis</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-zinc-500">Recovery Rate</span>
                <span className="font-semibold">{data.recovery.recoveryRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-500">Avg Days to Recover</span>
                <span className="font-semibold">{data.recovery.avgRecoveryDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-500">Bounce Back Ratio</span>
                <span className="font-semibold">{data.recovery.bounceBackRatio}x</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Exit Type Analysis
// ============================================================================

function ExitTypeTab({ data }: { data: OptionsAnalyticsData['exitType'] }) {
  const [isHorizontal, setIsHorizontal] = useState(false);

  if (data.breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No exit type data available</p>
      </div>
    );
  }

  const total = data.breakdown.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="space-y-6">
      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-2">
          {data.recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">{rec.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.breakdown.map(stat => (
          <div
            key={stat.exitType}
            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700"
          >
            <p className="text-xs text-zinc-500 mb-1">{EXIT_TYPE_LABELS[stat.exitType]}</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stat.count}</p>
            <p className="text-xs text-zinc-400">{Math.round((stat.count / total) * 100)}% of trades</p>
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">P&L</span>
                <span className={stat.totalPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}>
                  {formatCurrency(stat.totalPnL)}
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-zinc-500">Win Rate</span>
                <span className="font-medium">{stat.winRate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              P&L by Exit Type
            </h3>
            <HelpTooltip
              title="Exit Type P&L"
              description="Shows your profit/loss breakdown by how you exited trades - expired worthless, assigned, or closed early."
            />
          </div>
          <ChartFlipButton isHorizontal={isHorizontal} onToggle={() => setIsHorizontal(!isHorizontal)} />
        </div>
        <div className="h-56 sm:h-48">
          <Bar
            data={{
              labels: data.breakdown.map(d => EXIT_TYPE_SHORT_LABELS[d.exitType] || d.exitType),
              datasets: [{
                label: 'P&L',
                data: data.breakdown.map(d => d.totalPnL),
                backgroundColor: data.breakdown.map(d => d.totalPnL >= 0 ? 'rgba(139, 92, 246, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
                borderRadius: 4,
              }],
            }}
            options={{
              indexAxis: isHorizontal ? 'y' : 'x',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...chartTooltipStyle,
                  callbacks: {
                    title: (items) => {
                      const idx = items[0]?.dataIndex ?? 0;
                      return EXIT_TYPE_LABELS[data.breakdown[idx]?.exitType] || items[0]?.label || '';
                    },
                    label: (ctx) => {
                      const idx = ctx.dataIndex;
                      const stat = data.breakdown[idx];
                      return [
                        formatCurrency(stat.totalPnL),
                        `${stat.count} trades · ${stat.winRate}% win`,
                      ];
                    },
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: !isHorizontal },
                  ticks: isHorizontal ? { callback: (v) => formatCompactCurrency(v as number) } : {},
                },
                y: {
                  grid: { display: isHorizontal },
                  ticks: !isHorizontal ? { callback: (v) => formatCompactCurrency(v as number) } : {},
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Premium Analysis
// ============================================================================

function PremiumTab({ data }: { data: OptionsAnalyticsData['premium'] }) {
  if (!data.credit && !data.debit) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <DollarSign className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No premium data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Credit Trades */}
        {data.credit && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownRight className="h-5 w-5 text-violet-500 dark:text-violet-400" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Credit Trades (Sellers)
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500">Total Premium Received</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(data.credit.totalReceived)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Premium Kept</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{formatCurrency(data.credit.totalKept)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Capture Rate</p>
                  <p className="font-semibold text-violet-600 dark:text-violet-400">{data.credit.captureRate}%</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400">{data.credit.tradeCount} credit trades</p>
            </div>
          </div>
        )}

        {/* Debit Trades */}
        {data.debit && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpRight className="h-5 w-5 text-sky-500 dark:text-sky-400" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Debit Trades (Buyers)
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500">Total Premium Paid</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(data.debit.totalPaid)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Net P&L</p>
                  <p className={cn(
                    'font-semibold',
                    data.debit.totalPnL >= 0 ? 'text-rh-green' : 'text-rh-red'
                  )}>
                    {formatCurrency(data.debit.totalPnL)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Return</p>
                  <p className={cn(
                    'font-semibold',
                    data.debit.avgReturn >= 0 ? 'text-rh-green' : 'text-rh-red'
                  )}>
                    {data.debit.avgReturn}%
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-400">{data.debit.tradeCount} debit trades</p>
            </div>
          </div>
        )}
      </div>

      {/* Capture Rate Insight */}
      {data.credit && data.credit.captureRate > 0 && (
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
          <h4 className="text-sm font-semibold mb-2 text-zinc-700 dark:text-zinc-300">Premium Capture Insight</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You capture <span className="font-bold text-violet-600 dark:text-violet-400">{data.credit.captureRate}%</span> of the premium you receive on average.
            {data.credit.captureRate >= 75 && (
              <span className="text-rh-green"> Excellent efficiency for a premium seller!</span>
            )}
            {data.credit.captureRate >= 50 && data.credit.captureRate < 75 && (
              <span className="text-amber-600"> Good, but there may be room to improve exit timing.</span>
            )}
            {data.credit.captureRate < 50 && (
              <span className="text-rh-red"> Consider holding trades longer or adjusting strike selection.</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Position Sizing
// ============================================================================

function PositionSizingTab({ data }: { data: OptionsAnalyticsData['positionSizing'] }) {
  const [isHorizontal, setIsHorizontal] = useState(true);

  if (data.buckets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Scale className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No position sizing data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Optimal Range Card */}
      {data.optimalRange && (
        <div className="p-4 rounded-xl bg-rh-green/10 border border-rh-green/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-rh-green" />
            <span className="font-semibold text-rh-green">Optimal Position Size</span>
          </div>
          <p className="text-2xl font-bold text-rh-green">{data.optimalRange.label}</p>
          <p className="text-sm text-rh-green/80 mt-1">{data.optimalRange.reason}</p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-500">Average Position Size</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatCompactCurrency(data.avgPositionSize)}</p>
        </div>
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-500">Median Position Size</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatCompactCurrency(data.medianPositionSize)}</p>
        </div>
      </div>

      {/* Size Buckets Chart */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Performance by Position Size
            </h3>
            <HelpTooltip
              title="Position Size Performance"
              description="Shows how your P&L varies with different position sizes. Find your optimal position size where you perform best."
            />
          </div>
          <ChartFlipButton isHorizontal={isHorizontal} onToggle={() => setIsHorizontal(!isHorizontal)} />
        </div>
        <div className="h-72 sm:h-64">
          <Bar
            data={{
              labels: data.buckets.map(b => b.label),
              datasets: [{
                label: 'P&L',
                data: data.buckets.map(b => b.totalPnL),
                backgroundColor: data.buckets.map(b => b.totalPnL >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
                borderRadius: 4,
              }],
            }}
            options={{
              indexAxis: isHorizontal ? 'y' : 'x',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...chartTooltipStyle,
                  callbacks: {
                    title: (items) => items[0]?.label || '',
                    label: (ctx) => {
                      const idx = ctx.dataIndex;
                      const bucket = data.buckets[idx];
                      return [
                        formatCurrency(bucket.totalPnL),
                        `${bucket.tradeCount} trades · ${bucket.winRate}% win`,
                      ];
                    },
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: !isHorizontal },
                  ticks: isHorizontal ? { callback: (v) => formatCompactCurrency(v as number) } : { maxRotation: 45, minRotation: 45 },
                },
                y: {
                  grid: { display: isHorizontal },
                  ticks: !isHorizontal ? { callback: (v) => formatCompactCurrency(v as number) } : {},
                },
              },
            }}
          />
        </div>
      </div>

      {/* Size Buckets Table */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold mb-4 text-zinc-700 dark:text-zinc-300">Size Breakdown</h3>
        <SummaryTable
          data={data.buckets.map(b => ({
            size: b.label,
            trades: b.tradeCount,
            pnl: b.totalPnL,
            winRate: b.winRate,
            avgPnL: b.avgPnL,
            avgSize: b.avgSize,
          }))}
          columns={[
            { key: 'size', label: 'Size' },
            { key: 'trades', label: 'Trades' },
            { key: 'pnl', label: 'P&L', format: (v) => formatCurrency(v as number) },
            { key: 'winRate', label: 'Win %', format: (v) => `${v}%` },
            { key: 'avgPnL', label: 'Avg P&L', format: (v) => formatCurrency(v as number) },
            { key: 'avgSize', label: 'Avg Size', format: (v) => formatCompactCurrency(v as number) },
          ]}
        />
      </div>

      {/* Ticker Concentration */}
      {data.concentration.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ticker Concentration (Top 5)</h3>
          </div>
          <div className="space-y-2">
            {data.concentration.slice(0, 5).map((ticker, idx) => (
              <div key={ticker.symbol} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-4">{idx + 1}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100 w-16">{ticker.symbol}</span>
                <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      ticker.percentage > 30 ? 'bg-red-500' :
                      ticker.percentage > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                    )}
                    style={{ width: `${Math.min(ticker.percentage, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500 w-12 text-right">{ticker.percentage}%</span>
                <span className={cn(
                  'text-xs w-16 text-right font-medium',
                  ticker.totalPnL >= 0 ? 'text-rh-green' : 'text-rh-red'
                )}>
                  {formatCompactCurrency(ticker.totalPnL)}
                </span>
              </div>
            ))}
          </div>
          {data.concentration.some(t => t.percentage > 30) && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  High concentration detected. Consider diversifying across more underlyings to reduce risk.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Expiry Cycles
// ============================================================================

function InsightCard({
  insight,
  type = 'info',
}: {
  insight: string;
  type?: 'success' | 'warning' | 'info';
}) {
  const styles = {
    success: 'from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800/30',
    warning: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/30',
    info: 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800/30',
  };

  const iconColors = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  const textColors = {
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-blue-700 dark:text-blue-300',
  };

  return (
    <div className={cn('p-4 rounded-xl bg-linear-to-br border', styles[type])}>
      <div className="flex items-start gap-3">
        <Sparkles className={cn('h-5 w-5 mt-0.5 shrink-0', iconColors[type])} />
        <p className={cn('text-sm font-medium', textColors[type])}>{insight}</p>
      </div>
    </div>
  );
}

function ComparisonCard({
  title,
  icon: Icon,
  stats,
  color,
  label,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  stats: CycleStats | null;
  color: string;
  label: string;
}) {
  if (!stats) return null;

  return (
    <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('p-2 rounded-lg', color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.tradeCount}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-zinc-500">Win Rate</p>
            <p className={cn(
              'font-semibold',
              stats.winRate >= 50 ? 'text-rh-green' : 'text-rh-red'
            )}>
              {stats.winRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total P&L</p>
            <p className={cn(
              'font-semibold',
              stats.totalPnL >= 0 ? 'text-rh-green' : 'text-rh-red'
            )}>
              {formatCompactCurrency(stats.totalPnL)}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Avg P&L</span>
            <span className={stats.avgPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}>
              {formatCurrency(stats.avgPnL)}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-zinc-500">Avg Hold</span>
            <span className="text-zinc-700 dark:text-zinc-300">{stats.avgHoldTime} days</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpiryCyclesTab({ data, isLoading }: { data: ExpiryCyclesData | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No expiration cycle data available</p>
      </div>
    );
  }

  const hasData = data.expiryCycles.weekly || data.expiryCycles.monthly;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-zinc-500">No expiration cycle data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Insight */}
      {data.expiryCycles.insight && (
        <InsightCard
          insight={data.expiryCycles.insight}
          type={data.expiryCycles.insight.includes('outperform') ? 'success' : 'info'}
        />
      )}

      {/* Weekly vs Monthly Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ComparisonCard
          title="Weekly Expirations"
          icon={Zap}
          stats={data.expiryCycles.weekly}
          color="bg-linear-to-br from-amber-500 to-orange-500"
          label="Trades"
        />
        <ComparisonCard
          title="Monthly Expirations"
          icon={Calendar}
          stats={data.expiryCycles.monthly}
          color="bg-linear-to-br from-indigo-500 to-purple-500"
          label="Trades"
        />
      </div>

      {/* OpEx Week Analysis */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-linear-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-900/10 dark:to-purple-900/10">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Options Expiration Week (OpEx)
          </h3>
          <HelpTooltip
            title="OpEx Week"
            description="The week containing the 3rd Friday of each month, when monthly options expire. Often sees increased volatility."
          />
        </div>

        {data.opexWeek.insight && (
          <div className="mb-4">
            <InsightCard insight={data.opexWeek.insight} type="info" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ComparisonCard
            title="During OpEx Week"
            icon={Target}
            stats={data.opexWeek.opex}
            color="bg-linear-to-br from-violet-500 to-purple-500"
            label="Trades"
          />
          <ComparisonCard
            title="Outside OpEx Week"
            icon={Clock}
            stats={data.opexWeek.nonOpex}
            color="bg-linear-to-br from-slate-500 to-zinc-500"
            label="Trades"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OptionsAnalytics({ accountId }: OptionsAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<string>('dte');
  const [timeframe, setTimeframe] = useState<string>('all');

  const { data, isLoading, error, refetch } = useQuery<OptionsAnalyticsData>({
    queryKey: ['options-analytics', accountId, timeframe],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set('brokerageAccountId', accountId);
      if (timeframe !== 'all') params.set('timeframe', timeframe);

      const res = await fetch(`/api/dashboard/options-analytics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch options analytics');
      return apiData<OptionsAnalyticsData>(await parseApiJson(res));
    },
  });

  // Fetch expiry cycles data from options-timing API
  const { data: expiryData, isLoading: expiryLoading } = useQuery<ExpiryCyclesData>({
    queryKey: ['options-expiry-cycles', accountId, timeframe],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set('brokerageAccountId', accountId);
      if (timeframe !== 'all') params.set('timeframe', timeframe);

      const res = await fetch(`/api/dashboard/options-timing?${params}`);
      if (!res.ok) throw new Error('Failed to fetch expiry cycles');
      return apiData<ExpiryCyclesData>(await parseApiJson(res));
    },
    enabled: activeTab === 'expiry', // Only fetch when expiry tab is active
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-red-500 text-center">Failed to load options analytics</p>
      </div>
    );
  }

  const analytics = data;

  // Empty state
  if (analytics.summary.totalTrades === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Options Analytics</h2>
              <p className="text-xs text-zinc-500">Deep dive into your options performance</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
            <BarChart3 className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            No Options Trades Yet
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Start trading options to see detailed analytics on DTE, strategy performance, and more.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden w-full max-w-full">
      {/* Header */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Options Analytics</h2>
              <p className="text-xs text-zinc-500">
                {analytics.summary.totalTrades} trades · {analytics.summary.winRate}% win rate
              </p>
            </div>
            <HelpTooltip
              title="Options Analytics"
              description="Comprehensive analysis of your options trading including DTE performance, strategy breakdown, win/loss patterns, and premium capture metrics."
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Timeframe Select */}
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            >
              <option value="all">All Time</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="90d">90 Days</option>
              <option value="ytd">YTD</option>
              <option value="1y">1 Year</option>
            </select>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 py-3 sm:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total P&L"
            value={formatCurrency(analytics.summary.totalPnL)}
            icon={DollarSign}
            color={analytics.summary.totalPnL >= 0 ? 'green' : 'red'}
          />
          <StatCard
            label="Win Rate"
            value={`${analytics.summary.winRate}%`}
            subValue={`${analytics.summary.wins}W / ${analytics.summary.losses}L`}
            icon={Target}
            color="blue"
          />
          <StatCard
            label="Avg DTE"
            value={`${analytics.summary.avgDTE} days`}
            icon={Clock}
            color="purple"
          />
          <StatCard
            label="Total Trades"
            value={analytics.summary.totalTrades}
            icon={BarChart3}
            color="default"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative border-b border-zinc-200 dark:border-zinc-800">
          {/* Scroll fade indicators */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-linear-to-r from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-linear-to-l from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none sm:hidden" />

          <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1">
            <TabsList className="h-10 sm:h-11 w-full justify-start gap-0.5 sm:gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 sm:p-1 min-w-max rounded-lg">
              <TabsTrigger
                value="dte"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <Clock className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span>DTE</span>
              </TabsTrigger>
              <TabsTrigger
                value="strategy"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <Layers className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Strategy</span>
                <span className="sm:hidden">Strat</span>
              </TabsTrigger>
              <TabsTrigger
                value="winloss"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <TrendingUp className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Win/Loss</span>
                <span className="sm:hidden">W/L</span>
              </TabsTrigger>
              <TabsTrigger
                value="exit"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <ChevronRight className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span>Exit</span>
              </TabsTrigger>
              <TabsTrigger
                value="premium"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <Percent className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Premium</span>
                <span className="sm:hidden">Prem</span>
              </TabsTrigger>
              <TabsTrigger
                value="sizing"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <Scale className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span>Size</span>
              </TabsTrigger>
              <TabsTrigger
                value="expiry"
                className="h-8 sm:h-9 rounded-md px-2 sm:px-3 text-[11px] sm:text-sm font-medium transition-all data-[state=active]:bg-indigo-600! dark:data-[state=active]:bg-indigo-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
              >
                <Calendar className="h-3.5 sm:h-4 w-3.5 sm:w-4 mr-1 sm:mr-2" />
                <span>Expiry</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <TabsContent value="dte" className="m-0">
            <DTETab data={analytics.dte} />
          </TabsContent>
          <TabsContent value="strategy" className="m-0">
            <StrategyTab data={analytics.strategy} />
          </TabsContent>
          <TabsContent value="winloss" className="m-0">
            <WinLossTab data={analytics.winLoss} />
          </TabsContent>
          <TabsContent value="exit" className="m-0">
            <ExitTypeTab data={analytics.exitType} />
          </TabsContent>
          <TabsContent value="premium" className="m-0">
            <PremiumTab data={analytics.premium} />
          </TabsContent>
          <TabsContent value="sizing" className="m-0">
            <PositionSizingTab data={analytics.positionSizing} />
          </TabsContent>
          <TabsContent value="expiry" className="m-0">
            <ExpiryCyclesTab data={expiryData ?? null} isLoading={expiryLoading} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
