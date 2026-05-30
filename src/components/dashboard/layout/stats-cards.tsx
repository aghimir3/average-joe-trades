/**
 * Stats Cards
 * Dashboard statistics cards grid
 */

'use client';

import {
  TrendingUp,
  Briefcase,
  Target,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn, formatCompactCurrency } from '@/lib/utils';
import type { DashboardStats } from '../lib/dashboard-types';

// ============================================================================
// Types
// ============================================================================

interface StatsCardsProps {
  stats: DashboardStats;
}

// ============================================================================
// Component
// ============================================================================

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
      {/* Total P&L */}
      <StatCard
        label="Total P&L"
        value={formatCompactCurrency(stats.totalPnL)}
        valueColor={stats.totalPnL >= 0 ? 'green' : 'red'}
        icon={TrendingUp}
        iconColor={stats.totalPnL >= 0 ? 'green' : 'red'}
        subtitle={`${stats.closedTrades} closed trades`}
      />

      {/* Open Positions */}
      <StatCard
        label="Open Positions"
        value={String(stats.openPositions)}
        icon={Briefcase}
        subtitle="Active trades"
      />

      {/* Win Rate */}
      <StatCard
        label="Win Rate"
        value={`${(stats.winRate ?? 0).toFixed(1)}%`}
        icon={Target}
        subtitle={`${stats.wins ?? 0}W / ${stats.losses ?? 0}L`}
      />

      {/* Profit Factor */}
      <StatCard
        label="Profit Factor"
        value={(stats.profitFactor ?? 0).toFixed(2)}
        icon={Scale}
        subtitle={`${(stats.profitFactor ?? 0) >= 1 ? 'Above' : 'Below'} breakeven`}
      />

      {/* Avg Win */}
      <StatCard
        label="Avg Win"
        value={formatCompactCurrency(stats.avgWin)}
        valueColor="green"
        icon={ArrowUpRight}
        iconColor="green"
        subtitle={`${stats.wins} winning trades`}
      />

      {/* Avg Loss */}
      <StatCard
        label="Avg Loss"
        value={formatCompactCurrency(stats.avgLoss)}
        valueColor="red"
        icon={ArrowDownRight}
        iconColor="red"
        subtitle={`${stats.losses} losing trades`}
      />
    </div>
  );
}

// ============================================================================
// Sub-component
// ============================================================================

interface StatCardProps {
  label: string;
  value: string;
  valueColor?: 'green' | 'red' | 'default';
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: 'green' | 'red' | 'default';
  subtitle: string;
}

function StatCard({
  label,
  value,
  valueColor = 'default',
  icon: Icon,
  iconColor = 'default',
  subtitle,
}: StatCardProps) {
  const valueColorClass = {
    green: 'text-rh-green',
    red: 'text-rh-red',
    default: 'text-(--text-primary)',
  }[valueColor];

  const iconColorClass = {
    green: 'text-rh-green',
    red: 'text-rh-red',
    default: 'text-(--text-muted)',
  }[iconColor];

  return (
    <div className="rounded-xl border border-zinc-200/50 bg-white/80 p-5 dark:border-zinc-700/40 dark:bg-zinc-900/60 backdrop-blur-xl hover:shadow-lg hover:shadow-emerald-500/5 hover:border-emerald-500/20 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">{label}</span>
        <Icon className={cn('h-4 w-4', iconColorClass)} />
      </div>
      <p className={cn('text-2xl font-bold tracking-tight', valueColorClass)}>{value}</p>
      <p className="text-xs text-(--text-muted) mt-1.5">{subtitle}</p>
    </div>
  );
}
