'use client';

/**
 * Concentration Risk Card
 *
 * Displays position concentration risk metrics for single-stock wheel traders.
 * Shows collateral utilization, premium buffer, and max pain scenarios.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn, formatCurrency, formatCompactCurrency } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

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

interface ConcentrationRiskCardProps {
  data: ConcentrationRiskData;
}

// ============================================================================
// Helpers
// ============================================================================

/** Returns the appropriate color class based on utilization percentage. */
function utilizationColor(pct: number): string {
  if (pct > 75) return 'bg-red-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ============================================================================
// Component
// ============================================================================

export function ConcentrationRiskCard({ data }: ConcentrationRiskCardProps) {
  const [maxPainOpen, setMaxPainOpen] = useState(false);

  const utilPct = data.collateralUtilization != null
    ? Math.round(data.collateralUtilization)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Position Risk
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Collateral at Risk</p>
            <p className="text-sm font-semibold">{formatCompactCurrency(data.totalCollateralAtRisk)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Buying Power</p>
            <p className="text-sm font-semibold">
              {data.buyingPower != null ? formatCompactCurrency(data.buyingPower) : '\u2014'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Utilization</p>
            <p className="text-sm font-semibold">
              {utilPct != null ? `${utilPct}%` : '\u2014'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Premium Buffer</p>
            <p className="text-sm font-semibold">{data.premiumBufferPct.toFixed(1)}%</p>
          </div>
        </div>

        {/* Utilization progress bar */}
        {utilPct != null ? (
          <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={cn('h-2 rounded-full transition-all', utilizationColor(utilPct))}
              style={{ width: `${Math.min(utilPct, 100)}%` }}
            />
          </div>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Connect broker to see utilization
          </p>
        )}

        {/* Max pain toggle */}
        <div>
          <button
            type="button"
            onClick={() => setMaxPainOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
              'transition-colors'
            )}
          >
            Max pain scenario
            {maxPainOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {maxPainOpen && (
            <div className="mt-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {data.maxPainDescription}
              </p>
              <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(data.maxPainLoss)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
