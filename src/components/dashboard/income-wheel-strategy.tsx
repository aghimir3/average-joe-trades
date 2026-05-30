'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Income Wheel Strategy Component
 *
 * Treats the wheel strategy as an income-generating business.
 * Mental model: Premium is weekly income, assignments are inventory events.
 *
 * Features:
 * - Income Dashboard with KPIs and yield metrics
 * - Position Manager with DTE tracking and quick actions
 * - Income Analytics with weekly/monthly charts
 * - Cost Basis Tracker for assigned stocks
 * - Trade History with detailed breakdown
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bar, Line } from 'react-chartjs-2';
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

// Register Chart.js components
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

import {
  Wallet,
  TrendingUp,
  Clock,
  Calendar,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  ChevronRight,
  Pencil,
  LogOut,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  PiggyBank,
  LineChart,
  Briefcase,
  History,
  Layers,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { cn, chartTooltipStyle, formatCurrency, formatCompactCurrency, formatSignedCurrency } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface WeeklyPremium {
  weekStart: string;
  weekEnd: string;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface MonthlyPremium {
  month: string;
  year: number;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface StockHolding {
  symbol: string;
  shares: number;
  acquisitionDate: string;
  acquisitionPrice: number;
  totalPremiumCollected: number;
  effectiveCostBasis: number;
  currentCCStrike: number | null;
  ccPremiumPending: number;
}

interface ActivePosition {
  id: string;
  ledgerEventId: string | null;
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: number;
  expiration: string;
  dte: number;
  quantity: number;
  premium: number;
  collateral: number;
  yieldOnCollateral: number;
  annualizedYield: number;
  entryDate: string;
}

interface IncomeMetrics {
  totalPremiumRealized: number;
  totalPremiumPending: number;
  totalCollateralAtRisk: number;
  premiumLast7Days: number;
  premiumLast30Days: number;
  premiumLast90Days: number;
  premiumYTD: number;
  premium52Weeks: number;
  yieldOnCollateral: number;
  annualizedYield: number;
  weeklyAvgPremium: number;
  monthlyAvgPremium: number;
  totalTrades: number;
  winRate: number;
  avgPremiumPerTrade: number;
  avgDTE: number;
  ccPremiumRealized: number;
  cspPremiumRealized: number;
  ccCount: number;
  cspCount: number;
}

interface RecentTrade {
  id: string;
  symbol: string;
  strategy: string;
  strike: number;
  expiration: string;
  openDate: string;
  closeDate: string;
  closeReason: string;
  premium: number;
  daysHeld: number;
}

interface SymbolPerformance {
  symbol: string;
  premium: number;
  trades: number;
  ccCount: number;
  cspCount: number;
  assignments: number;
  avgPremium: number;
}

interface IncomeWheelData {
  incomeMetrics: IncomeMetrics;
  activePositions: ActivePosition[];
  weeklyPremiumHistory: WeeklyPremium[];
  monthlyPremiumHistory: MonthlyPremium[];
  stockHoldings: StockHolding[];
  recentTrades: RecentTrade[];
  symbolPerformance: SymbolPerformance[];
}

interface IncomeWheelStrategyProps {
  accountId?: string | null;
}

// ============================================================================
// Fetch Function
// ============================================================================

async function fetchIncomeWheelData(accountId?: string | null): Promise<IncomeWheelData> {
  const params = new URLSearchParams();
  if (accountId) params.set('brokerageAccountId', accountId);

  const url = `/api/dashboard/income-wheel${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch income wheel data');
  }

  const result = await parseApiJson(response);
  return apiData(result);
}

// ============================================================================
// Utility Functions
// ============================================================================



function getDTEStatus(dte: number): { color: string; bgColor: string; label: string; icon: typeof CheckCircle } {
  if (dte < 0) {
    return { color: 'text-zinc-500', bgColor: 'bg-zinc-100 dark:bg-zinc-800', label: 'Expired', icon: AlertCircle };
  }
  if (dte <= 3) {
    return { color: 'text-rh-red', bgColor: 'bg-rh-red/20', label: 'Urgent', icon: AlertTriangle };
  }
  if (dte <= 7) {
    return { color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30', label: 'Soon', icon: Clock };
  }
  if (dte <= 14) {
    return { color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Approaching', icon: Clock };
  }
  return { color: 'text-rh-green', bgColor: 'bg-rh-green/20', label: 'Safe', icon: CheckCircle };
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function formatWeek(weekStart: string): string {
  const date = new Date(weekStart);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Sub-Components
// ============================================================================

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  colorScheme = 'default',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof DollarSign;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  colorScheme?: 'default' | 'emerald' | 'blue' | 'amber' | 'violet' | 'rose';
}) {
  const colors = {
    default: {
      bg: 'bg-zinc-50 dark:bg-zinc-800/50',
      icon: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400',
      value: 'text-zinc-900 dark:text-zinc-100',
    },
    emerald: {
      bg: 'bg-rh-green/10',
      icon: 'bg-rh-green/20 text-rh-green',
      value: 'text-rh-green',
    },
    blue: {
      bg: 'bg-linear-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10',
      icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
      value: 'text-blue-700 dark:text-blue-400',
    },
    amber: {
      bg: 'bg-linear-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10',
      icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
      value: 'text-amber-700 dark:text-amber-400',
    },
    violet: {
      bg: 'bg-linear-to-br from-violet-50 to-violet-100/50 dark:from-violet-900/20 dark:to-violet-800/10',
      icon: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
      value: 'text-violet-700 dark:text-violet-400',
    },
    rose: {
      bg: 'bg-rh-red/10',
      icon: 'bg-rh-red/20 text-rh-red',
      value: 'text-rh-red',
    },
  };

  const c = colors[colorScheme];

  return (
    <div className={cn('p-3 sm:p-4 rounded-2xl min-w-0', c.bg)}>
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={cn('p-1.5 sm:p-2 rounded-xl', c.icon)}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
        {trend && trendLabel && (
          <div className={cn(
            'flex items-center gap-0.5 text-[10px] sm:text-xs font-medium truncate max-w-[60%]',
            trend === 'up' ? 'text-rh-green' :
            trend === 'down' ? 'text-rh-red' :
            'text-zinc-500'
          )}>
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3 shrink-0" /> :
             trend === 'down' ? <ArrowDownRight className="h-3 w-3 shrink-0" /> : null}
            <span className="truncate">{trendLabel}</span>
          </div>
        )}
      </div>
      <p className={cn('text-base sm:text-xl lg:text-2xl font-bold mb-0.5 truncate', c.value)}>{value}</p>
      <p className="text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 truncate">{subtitle}</p>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Income Dashboard
// ============================================================================

function IncomeDashboardTab({
  metrics,
  weeklyHistory,
}: {
  metrics: IncomeMetrics;
  weeklyHistory: WeeklyPremium[];
}) {
  const recentWeeks = weeklyHistory.slice(-12);

  return (
    <div className="space-y-6">
      {/* Hero Section - Total Income */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700 p-6 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-5 w-5 opacity-80" />
            <span className="text-sm font-medium opacity-90">Total Income Generated</span>
          </div>
          <p className="text-4xl font-bold mb-1">
            {formatCurrency(metrics.totalPremiumRealized)}
          </p>
          <p className="text-sm opacity-80">
            {formatCurrency(metrics.totalPremiumPending)} pending from {metrics.totalTrades > 0 ? 'active' : 'future'} positions
          </p>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
            <div>
              <p className="text-2xl font-bold">{formatCompactCurrency(metrics.weeklyAvgPremium)}</p>
              <p className="text-xs opacity-80">Weekly Avg</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCompactCurrency(metrics.monthlyAvgPremium)}</p>
              <p className="text-xs opacity-80">Monthly Avg</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics.annualizedYield.toFixed(1)}%</p>
              <p className="text-xs opacity-80">Ann. Yield</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MetricCard
          title="Last 7 Days"
          value={formatSignedCurrency(metrics.premiumLast7Days, true)}
          icon={Calendar}
          colorScheme="violet"
          trend={metrics.premiumLast7Days > metrics.weeklyAvgPremium ? 'up' : 'down'}
          trendLabel={`vs ${formatCompactCurrency(metrics.weeklyAvgPremium)} avg`}
        />
        <MetricCard
          title="Last 30 Days"
          value={formatSignedCurrency(metrics.premiumLast30Days, true)}
          icon={Calendar}
          colorScheme="blue"
        />
        <MetricCard
          title="YTD Income"
          value={formatSignedCurrency(metrics.premiumYTD, true)}
          icon={TrendingUp}
          colorScheme="violet"
        />
        <MetricCard
          title="52-Week Income"
          value={formatSignedCurrency(metrics.premium52Weeks, true)}
          icon={LineChart}
          colorScheme="amber"
        />
      </div>

      {/* Yield & Efficiency Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Yield Metrics */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <Percent className="h-4 w-4 text-blue-500" />
            Yield Metrics
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-800">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Current Yield on Collateral</span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {metrics.yieldOnCollateral.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-800">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Annualized Yield</span>
              <span className="text-lg font-bold text-rh-green">
                {metrics.annualizedYield.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-800">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Avg Premium/Trade</span>
              <span className="text-lg font-bold text-violet-600 dark:text-violet-400">
                {formatCurrency(metrics.avgPremiumPerTrade)}
              </span>
            </div>
          </div>
        </div>

        {/* Strategy Mix */}
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-500" />
            Strategy Mix
          </h3>
          <div className="space-y-4">
            {/* CC vs CSP Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">Covered Calls</span>
                <span className="text-xs text-zinc-500">Cash Secured Puts</span>
              </div>
              <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex">
                <div
                  className="h-full bg-blue-500 dark:bg-blue-400"
                  style={{
                    width: `${metrics.totalTrades > 0 ? (metrics.ccCount / metrics.totalTrades) * 100 : 50}%`,
                  }}
                />
                <div
                  className="h-full bg-purple-500 dark:bg-purple-400"
                  style={{
                    width: `${metrics.totalTrades > 0 ? (metrics.cspCount / metrics.totalTrades) * 100 : 50}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(metrics.ccPremiumRealized)} ({metrics.ccCount})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(metrics.cspPremiumRealized)} ({metrics.cspCount})
                  </span>
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 text-center">
                <p className="text-lg font-bold text-rh-green">
                  {metrics.winRate.toFixed(0)}%
                </p>
                <p className="text-xs text-zinc-500">Win Rate</p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 text-center">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {metrics.avgDTE.toFixed(0)}d
                </p>
                <p className="text-xs text-zinc-500">Avg Hold Time</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Income Trend */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Weekly Income Trend (Last 12 Weeks)
        </h3>
        <div className="h-48">
          <Bar
            data={{
              labels: recentWeeks.map(w => formatWeek(w.weekStart)),
              datasets: [{
                data: recentWeeks.map(w => w.premium),
                backgroundColor: recentWeeks.map(w => w.premium >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
                borderRadius: 4,
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
                    title: (items) => `Week of ${items[0]?.label || ''}`,
                    label: (ctx) => formatCurrency(ctx.raw as number),
                  },
                },
              },
              scales: {
                x: { grid: { display: false } },
                y: {
                  grid: { color: 'rgba(161, 161, 170, 0.2)' },
                  ticks: { callback: (v) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}K` : v}` },
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
// Tab: Position Manager
// ============================================================================

function PositionManagerTab({
  positions,
  collateral,
  onEdit,
  onClose,
}: {
  positions: ActivePosition[];
  collateral: number;
  onEdit: (ledgerEventId: string) => void;
  onClose: (positionId: string) => void;
}) {
  // Sort by DTE ascending (most urgent first)
  const sortedPositions = [...positions].sort((a, b) => a.dte - b.dte);

  const ccPositions = sortedPositions.filter(p => p.strategy === 'covered_call');
  const cspPositions = sortedPositions.filter(p => p.strategy === 'cash_secured_put');

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
          <Briefcase className="h-8 w-8 text-zinc-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          No Active Positions
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Sell covered calls or cash-secured puts to start generating premium income.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MetricCard
          title="Active Positions"
          value={positions.length.toString()}
          icon={Briefcase}
          colorScheme="violet"
        />
        <MetricCard
          title="Pending Premium"
          value={formatCompactCurrency(positions.reduce((s, p) => s + p.premium, 0))}
          icon={PiggyBank}
          colorScheme="emerald"
        />
        <MetricCard
          title="Collateral at Risk"
          value={formatCompactCurrency(collateral)}
          icon={DollarSign}
          colorScheme="amber"
        />
        <MetricCard
          title="Portfolio Yield"
          value={`${collateral > 0 ? ((positions.reduce((s, p) => s + p.premium, 0) / collateral) * 100).toFixed(1) : 0}%`}
          icon={Percent}
          colorScheme="blue"
        />
      </div>

      {/* Position Lists */}
      <div className="space-y-4">
        {/* Covered Calls */}
        {ccPositions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Covered Calls ({ccPositions.length})
            </h3>
            <div className="space-y-2">
              {ccPositions.map((pos) => (
                <PositionCard key={pos.id} position={pos} onEdit={onEdit} onClose={onClose} />
              ))}
            </div>
          </div>
        )}

        {/* Cash Secured Puts */}
        {cspPositions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              Cash Secured Puts ({cspPositions.length})
            </h3>
            <div className="space-y-2">
              {cspPositions.map((pos) => (
                <PositionCard key={pos.id} position={pos} onEdit={onEdit} onClose={onClose} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PositionCard({
  position,
  onEdit,
  onClose,
}: {
  position: ActivePosition;
  onEdit: (ledgerEventId: string) => void;
  onClose: (positionId: string) => void;
}) {
  const dteStatus = getDTEStatus(position.dte);
  const StatusIcon = dteStatus.icon;

  return (
    <div className={cn(
      'p-4 rounded-xl border transition-all',
      'bg-white dark:bg-zinc-900',
      position.dte <= 3
        ? 'border-red-200 dark:border-red-800'
        : position.dte <= 7
          ? 'border-amber-200 dark:border-amber-800'
          : 'border-zinc-200 dark:border-zinc-800'
    )}>
      <div className="flex items-center gap-4">
        {/* DTE Badge */}
        <div className={cn('px-3 py-2 rounded-xl text-center min-w-15', dteStatus.bgColor)}>
          <p className={cn('text-lg font-bold', dteStatus.color)}>
            {position.dte < 0 ? 'EXP' : `${position.dte}d`}
          </p>
          <p className="text-[10px] text-zinc-500">DTE</p>
        </div>

        {/* Position Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-zinc-900 dark:text-zinc-100">
              {position.symbol}
            </span>
            <Badge variant="outline" className="text-[10px]">
              ${position.strike} {position.strategy === 'covered_call' ? 'C' : 'P'}
            </Badge>
            <div className={cn('flex items-center gap-1', dteStatus.color)}>
              <StatusIcon className="h-3 w-3" />
              <span className="text-[10px] font-medium">{dteStatus.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>Exp: {position.expiration}</span>
            <span>·</span>
            <span>{position.quantity} contract{position.quantity !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Premium & Yield */}
        <div className="text-right hidden sm:block">
          <p className="font-bold text-rh-green">
            {formatSignedCurrency(position.premium)}
          </p>
          <p className="text-[10px] text-zinc-500">
            {position.annualizedYield.toFixed(0)}% ann.
          </p>
        </div>

        {/* Collateral */}
        <div className="text-right hidden md:block">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {formatCompactCurrency(position.collateral)}
          </p>
          <p className="text-[10px] text-zinc-500">collateral</p>
        </div>

        {/* Actions */}
        <div className="flex gap-1 shrink-0">
          {position.ledgerEventId && (
            <Button
              onClick={() => onEdit(position.ledgerEventId!)}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
            >
              <Pencil className="h-4 w-4 text-zinc-500" />
            </Button>
          )}
          <Button
            onClick={() => onClose(position.id)}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <LogOut className="h-4 w-4 text-zinc-500" />
          </Button>
        </div>
      </div>

      {/* Mobile Premium Display */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 sm:hidden">
        <div>
          <p className="text-xs text-zinc-500">Premium</p>
          <p className="font-bold text-rh-green">
            {formatSignedCurrency(position.premium)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Collateral</p>
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {formatCompactCurrency(position.collateral)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Income Analytics
// ============================================================================

function IncomeAnalyticsTab({
  weeklyHistory,
  monthlyHistory,
}: {
  weeklyHistory: WeeklyPremium[];
  monthlyHistory: MonthlyPremium[];
}) {
  const [chartView, setChartView] = useState<'weekly' | 'monthly'>('monthly');

  // Calculate cumulative data using reduce to avoid reassignment
  const cumulativeData = weeklyHistory.reduce<Array<WeeklyPremium & { cumulative: number }>>((acc, w) => {
    const prevCumulative = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({ ...w, cumulative: prevCumulative + w.premium });
    return acc;
  }, []);

  const recentWeeklyData = weeklyHistory.slice(-26);

  // Chart.js options for weekly line chart
  const weeklyChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => `Week of ${items[0]?.label || ''}`,
          label: (ctx) => `Premium: ${formatCurrency(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(161, 161, 170, 0.2)' },
        ticks: {
          font: { size: 10 },
          callback: (v) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}K` : v}`,
        },
      },
    },
  };

  // Chart.js options for monthly stacked bar chart
  const monthlyChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => items[0]?.label || '',
          label: (ctx) => {
            const label = ctx.dataset.label === 'ccPremium' ? 'Covered Calls' : 'Cash Secured Puts';
            return `${label}: ${formatCurrency(ctx.raw as number)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(161, 161, 170, 0.2)' },
        ticks: {
          font: { size: 10 },
          callback: (v) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}K` : v}`,
        },
      },
    },
  };

  // Chart.js options for cumulative line chart
  const cumulativeChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle,
        callbacks: {
          title: (items) => `Week of ${items[0]?.label || ''}`,
          label: (ctx) => `Total Income: ${formatCurrency(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(161, 161, 170, 0.2)' },
        ticks: {
          font: { size: 10 },
          callback: (v) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}K` : v}`,
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Chart Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={chartView === 'weekly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartView('weekly')}
          className="text-xs"
        >
          Weekly
        </Button>
        <Button
          variant={chartView === 'monthly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartView('monthly')}
          className="text-xs"
        >
          Monthly
        </Button>
      </div>

      {/* Main Chart */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          {chartView === 'weekly' ? 'Weekly Premium Income' : 'Monthly Premium Income'}
        </h3>
        <div className="h-64">
          {chartView === 'weekly' ? (
            <Line
              data={{
                labels: recentWeeklyData.map(w => formatWeek(w.weekStart)),
                datasets: [{
                  data: recentWeeklyData.map(w => w.premium),
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderWidth: 2,
                  fill: true,
                  tension: 0.3,
                  pointRadius: 3,
                  pointBackgroundColor: '#10b981',
                }],
              }}
              options={weeklyChartOptions}
            />
          ) : (
            <Bar
              data={{
                labels: monthlyHistory.map(m => formatMonth(m.month)),
                datasets: [
                  {
                    label: 'ccPremium',
                    data: monthlyHistory.map(m => m.ccPremium),
                    backgroundColor: '#3b82f6',
                    borderRadius: 0,
                  },
                  {
                    label: 'cspPremium',
                    data: monthlyHistory.map(m => m.cspPremium),
                    backgroundColor: '#a855f7',
                    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                  },
                ],
              }}
              options={monthlyChartOptions}
            />
          )}
        </div>
        {chartView === 'monthly' && (
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-zinc-500">Covered Calls</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-xs text-zinc-500">Cash Secured Puts</span>
            </div>
          </div>
        )}
      </div>

      {/* Cumulative Growth */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Cumulative Income Growth (52 Weeks)
        </h3>
        <div className="h-48">
          <Line
            data={{
              labels: cumulativeData.map(w => formatWeek(w.weekStart)),
              datasets: [{
                data: cumulativeData.map(w => w.cumulative),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#8b5cf6',
              }],
            }}
            options={cumulativeChartOptions}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Cost Basis Tracker
// ============================================================================

function CostBasisTab({ holdings }: { holdings: StockHolding[] }) {
  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
          <TrendingUp className="h-8 w-8 text-zinc-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          No Stock Holdings
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          When your CSPs get assigned, stock holdings will appear here with cost basis tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Track how premium income reduces your effective cost basis on assigned stocks.
      </p>

      {holdings.map((holding, index) => {
        const reduction = holding.acquisitionPrice - holding.effectiveCostBasis;
        const reductionPct = (reduction / holding.acquisitionPrice) * 100;

        return (
          <div
            key={`${holding.symbol}-${holding.acquisitionDate}-${index}`}
            className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
                    {holding.symbol}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {holding.shares} shares · Acquired {holding.acquisitionDate}
                  </p>
                </div>
              </div>
              {holding.currentCCStrike && (
                <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
                  CC @ ${holding.currentCCStrike}
                </Badge>
              )}
            </div>

            {/* Cost Basis Visualization */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Assignment Price</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  ${holding.acquisitionPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Total Premium Collected</span>
                <span className="font-semibold text-rh-green">
                  -{formatCurrency(holding.totalPremiumCollected)}
                </span>
              </div>

              <div className="h-px bg-zinc-200 dark:bg-zinc-700" />

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Effective Cost Basis
                </span>
                <div className="text-right">
                  <span className="font-bold text-lg text-rh-green">
                    ${holding.effectiveCostBasis.toFixed(2)}
                  </span>
                  <p className="text-xs text-rh-green">
                    {reductionPct.toFixed(1)}% reduction
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-2">
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-violet-400 to-indigo-600 rounded-full"
                    style={{ width: `${Math.min(reductionPct, 100)}%` }}
                  />
                </div>
              </div>

              {holding.ccPremiumPending > 0 && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  +{formatCurrency(holding.ccPremiumPending)} pending from active CC
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Tab: Trade History
// ============================================================================

function TradeHistoryTab({
  trades,
  symbolPerformance,
}: {
  trades: RecentTrade[];
  symbolPerformance: SymbolPerformance[];
}) {
  return (
    <div className="space-y-6">
      {/* Symbol Performance Summary */}
      {symbolPerformance.length > 0 && (
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            Top Performing Symbols
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {symbolPerformance.slice(0, 5).map((sym, idx) => (
              <div
                key={sym.symbol}
                className="p-3 rounded-xl bg-white dark:bg-zinc-800 text-center"
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="text-xs font-medium text-zinc-400">#{idx + 1}</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{sym.symbol}</span>
                </div>
                <p className="text-lg font-bold text-rh-green">
                  {formatCompactCurrency(sym.premium)}
                </p>
                <p className="text-[10px] text-zinc-500">{sym.trades} trades</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Trades */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
          Recent Trades ({trades.length})
        </h3>
        <div className="space-y-2">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
            >
              {/* Close Reason Icon */}
              <div className={cn(
                'p-1.5 rounded-lg',
                trade.closeReason === 'expired'
                  ? 'bg-rh-green/20'
                  : trade.closeReason === 'assigned'
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-blue-100 dark:bg-blue-900/30'
              )}>
                {trade.closeReason === 'expired' ? (
                  <CheckCircle className="h-4 w-4 text-rh-green" />
                ) : trade.closeReason === 'assigned' ? (
                  <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <LogOut className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
              </div>

              {/* Trade Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {trade.symbol}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    ${trade.strike} {trade.strategy === 'covered_call' ? 'C' : 'P'}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">
                  {trade.closeDate} · {trade.daysHeld}d · {
                    trade.closeReason === 'expired' ? 'Expired' :
                    trade.closeReason === 'assigned' ? 'Assigned' : 'Closed'
                  }
                </p>
              </div>

              {/* Premium */}
              <div className="text-right">
                <p className={cn(
                  'font-bold',
                  trade.premium >= 0 ? 'text-rh-green' : 'text-rh-red'
                )}>
                  {formatSignedCurrency(trade.premium)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {trades.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            No closed trades yet
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function IncomeWheelStrategy({ accountId }: IncomeWheelStrategyProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['incomeWheel', accountId],
    queryFn: () => fetchIncomeWheelData(accountId),
    retry: false,
  });

  const handleEditPosition = (ledgerEventId: string) => {
    router.push(`/trade/edit/option/${ledgerEventId}`);
  };

  const handleClosePosition = (positionId: string) => {
    router.push(`/trade/close?positionId=${positionId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
            <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Income Wheel Strategy
            </h2>
            <p className="text-sm text-zinc-500">Loading...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error or no data state
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
            <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Income Wheel Strategy
            </h2>
            <p className="text-sm text-zinc-500">Premium income tracking</p>
          </div>
          <HelpTooltip
            title="Income Wheel Strategy"
            description="Track your wheel strategy as an income-generating business. Premium collected is your income, assignments are inventory acquisition events that reduce your cost basis."
          />
        </div>
        <div className="text-center py-12">
          <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 inline-block mb-4">
            <PiggyBank className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            No Wheel Strategy Data
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Start selling covered calls or cash-secured puts to generate premium income.
          </p>
        </div>
      </div>
    );
  }

  const { incomeMetrics, activePositions, weeklyPremiumHistory, monthlyPremiumHistory, stockHoldings, recentTrades, symbolPerformance } = data;

  // Check if we have any meaningful data
  const hasData = incomeMetrics.totalTrades > 0 || activePositions.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
            <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Income Wheel Strategy
            </h2>
            <p className="text-sm text-zinc-500">Premium income tracking</p>
          </div>
          <HelpTooltip
            title="Income Wheel Strategy"
            description="Track your wheel strategy as an income-generating business. Premium collected is your income, assignments are inventory acquisition events that reduce your cost basis."
          />
        </div>
        <div className="text-center py-12">
          <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 inline-block mb-4">
            <PiggyBank className="h-8 w-8 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Start Your Income Journey
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto mb-4">
            Sell covered calls on stocks you own or cash-secured puts on stocks you want to buy.
            Premium collected becomes your recurring income.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
              <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Income Wheel Strategy
              </h2>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {formatCurrency(incomeMetrics.totalPremiumRealized)} earned
                {incomeMetrics.totalPremiumPending > 0 && (
                  <span className="text-zinc-400 font-normal">
                    {' '}· {formatCurrency(incomeMetrics.totalPremiumPending)} pending
                  </span>
                )}
              </p>
            </div>
            <HelpTooltip
              title="Income Wheel Strategy"
              description="Track your wheel strategy as an income-generating business. Premium is your weekly income, assignments reduce your cost basis. Focus on consistent income, not stock price."
            />
          </div>
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
          >
            <RefreshCcw className={cn('h-4 w-4 text-zinc-500', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-2">
          <TabsList className="h-11 w-full justify-start gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
            <TabsTrigger
              value="dashboard"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <DollarSign className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger
              value="positions"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <Briefcase className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Positions</span>
              {activePositions.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {activePositions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <LineChart className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="costbasis"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <TrendingUp className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Cost Basis</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="h-9 rounded-md px-3 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-violet-600! dark:data-[state=active]:bg-violet-600! data-[state=active]:text-white! dark:data-[state=active]:text-white! data-[state=active]:shadow-sm"
            >
              <History className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-4 sm:p-6">
          <TabsContent value="dashboard" className="m-0">
            <IncomeDashboardTab metrics={incomeMetrics} weeklyHistory={weeklyPremiumHistory} />
          </TabsContent>

          <TabsContent value="positions" className="m-0">
            <PositionManagerTab
              positions={activePositions}
              collateral={incomeMetrics.totalCollateralAtRisk}
              onEdit={handleEditPosition}
              onClose={handleClosePosition}
            />
          </TabsContent>

          <TabsContent value="analytics" className="m-0">
            <IncomeAnalyticsTab
              weeklyHistory={weeklyPremiumHistory}
              monthlyHistory={monthlyPremiumHistory}
            />
          </TabsContent>

          <TabsContent value="costbasis" className="m-0">
            <CostBasisTab holdings={stockHoldings} />
          </TabsContent>

          <TabsContent value="history" className="m-0">
            <TradeHistoryTab trades={recentTrades} symbolPerformance={symbolPerformance} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
