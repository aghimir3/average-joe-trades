'use client';

/**
 * Position Lifecycle Timeline
 *
 * Gantt-style horizontal bars showing active wheel positions with DTE progress,
 * ITM/OTM coloring, and decay estimates. Replaces the old position list in the
 * Summary tab of Ticker Deep Dive.
 */

import { Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

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

interface PositionLifecycleTimelineProps {
  positions: ActivePosition[];
  currentPrice: number | null;
  symbol: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Calculate the number of calendar days between two date strings. */
function daysBetween(start: string, end: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const diff = Math.round((endMs - startMs) / msPerDay);
  return Math.max(diff, 1); // avoid division by zero
}

/** Determine bar color based on ITM/OTM status. */
function barColor(
  optionType: 'call' | 'put',
  strike: number,
  currentPrice: number | null
): string {
  if (currentPrice == null) return 'bg-indigo-500';

  const isOtm =
    optionType === 'put' ? strike < currentPrice : strike > currentPrice;

  return isOtm ? 'bg-emerald-500' : 'bg-red-500';
}

/** Rough theta decay estimate based on remaining DTE. */
function estimateDecayPct(dte: number): number {
  // Simplified: decay accelerates under 30 DTE
  if (dte <= 0) return 100;
  if (dte <= 7) return 70;
  if (dte <= 14) return 50;
  if (dte <= 30) return 30;
  if (dte <= 45) return 15;
  return 5;
}

// ============================================================================
// Component
// ============================================================================

export function PositionLifecycleTimeline({
  positions,
  currentPrice,
  symbol,
}: PositionLifecycleTimelineProps) {
  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            Active Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active positions for {symbol}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          Active Positions
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        {positions.map((pos) => {
          const totalDays = daysBetween(pos.entryDate, pos.expiration);
          const elapsed = totalDays - pos.dte;
          const progressPct = Math.min(Math.max((elapsed / totalDays) * 100, 0), 100);
          const decayPct = estimateDecayPct(pos.dte);
          const color = barColor(pos.optionType, pos.strike, currentPrice);
          const label = pos.optionType === 'call' ? 'CC' : 'CSP';

          return (
            <div key={pos.id} className="space-y-1.5">
              {/* Row: badge + bar + DTE */}
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge
                    variant={pos.optionType === 'put' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {label}
                  </Badge>
                  <span className="text-xs font-medium tabular-nums">
                    ${pos.strike}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className={cn('h-4 rounded-full transition-all', color)}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {pos.dte}d
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  ~{decayPct}%
                </span>
              </div>

              {/* Mobile detail row */}
              <div className="flex gap-3 pl-1 text-[10px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                <span>{pos.quantity} ct</span>
                <span>Prem {formatCurrency(pos.premium)}</span>
                <span>Coll {formatCurrency(pos.collateral)}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
