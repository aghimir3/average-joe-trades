/**
 * Mobile Stats Bar
 * Collapsible mini stats strip showing key metrics on mobile
 * Collapses to a compact pill when scrolling down
 */

'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, formatSignedCurrency } from '@/lib/utils';
import type { DashboardStats } from '../lib/dashboard-types';

interface MobileStatsBarProps {
  stats: DashboardStats | null;
  isLoading: boolean;
  className?: string;
}

export function MobileStatsBar({
  stats,
  isLoading,
  className,
}: MobileStatsBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  // Track scroll direction to auto-collapse
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Auto-collapse when scrolling down past 100px
          if (currentScrollY > 100 && currentScrollY > lastScrollY) {
            setIsScrolledDown(true);
            setIsExpanded(false);
          }
          // Auto-expand when scrolling back to top
          else if (currentScrollY < 50) {
            setIsScrolledDown(false);
            setIsExpanded(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isLoading || !stats) {
    return (
      <div className={cn('lg:hidden', className)}>
        <div className="flex items-center justify-center gap-4 py-2 px-4 bg-zinc-100 dark:bg-zinc-900 rounded-xl animate-pulse">
          <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-4 w-14 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  const totalPnL = stats.totalPnL;
  const isPnLPositive = totalPnL >= 0;
  const winRate = stats.winRate;
  const openPositions = stats.openPositions;

  // Collapsed mini-pill view
  if (!isExpanded && isScrolledDown) {
    return (
      <div className={cn('lg:hidden', className)}>
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            'shadow-lg active:scale-95',
            isPnLPositive
              ? 'bg-emerald-500 text-white'
              : 'bg-red-500 text-white'
          )}
        >
          {isPnLPositive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          <span>{formatSignedCurrency(totalPnL, true)}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </div>
    );
  }

  // Expanded stats bar
  return (
    <div className={cn('lg:hidden', className)}>
      <div
        className={cn(
          'flex items-center justify-between gap-2 py-2 px-3 rounded-xl transition-all',
          'bg-linear-to-r',
          isPnLPositive
            ? 'from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : 'from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border border-red-200 dark:border-red-800'
        )}
      >
        {/* P&L */}
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'p-1 rounded-lg',
              isPnLPositive
                ? 'bg-emerald-100 dark:bg-emerald-900/50'
                : 'bg-red-100 dark:bg-red-900/50'
            )}
          >
            {isPnLPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className="flex flex-col">
            <span
              className={cn(
                'text-sm font-bold leading-tight',
                isPnLPositive
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-red-700 dark:text-red-300'
              )}
            >
              {formatSignedCurrency(totalPnL, true)}
            </span>
            <span className="text-[9px] text-zinc-500 dark:text-zinc-400">Total P&L</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Win Rate */}
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <Target className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-tight text-zinc-800 dark:text-zinc-200">
              {winRate.toFixed(0)}%
            </span>
            <span className="text-[9px] text-zinc-500 dark:text-zinc-400">Win Rate</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Open Positions */}
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded-lg bg-purple-100 dark:bg-purple-900/50">
            <Briefcase className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-tight text-zinc-800 dark:text-zinc-200">
              {openPositions}
            </span>
            <span className="text-[9px] text-zinc-500 dark:text-zinc-400">Open</span>
          </div>
        </div>

        {/* Collapse button when scrolled */}
        {isScrolledDown && (
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
          >
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          </button>
        )}
      </div>
    </div>
  );
}
