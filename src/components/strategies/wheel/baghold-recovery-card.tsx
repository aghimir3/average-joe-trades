'use client';

import { Shield, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';

interface BagholdRecoveryData {
  assignmentPrice: number;
  assignmentDate: string;
  currentPrice: number;
  shares: number;
  unrealizedLoss: number;
  ccPremiumSinceAssignment: number;
  ccTradesSinceAssignment: number;
  remainingToBreakeven: number;
  recoveryProgress: number; // 0-100
  avgWeeklyCCPremium: number;
  projectedWeeksToBreakeven: number | null;
}

interface BagholdRecoveryCardProps {
  data: BagholdRecoveryData;
}

function RecoveryStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          highlight
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-zinc-900 dark:text-zinc-100'
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Displays recovery progress when a user is assigned and holding stock underwater.
 * Shows assignment details, CC premium collected, and projected weeks to breakeven.
 */
export function BagholdRecoveryCard({ data }: BagholdRecoveryCardProps) {
  const clampedProgress = Math.max(0, Math.min(100, data.recoveryProgress));
  const isLongRecovery = data.projectedWeeksToBreakeven != null && data.projectedWeeksToBreakeven > 12;

  return (
    <Card className="border-amber-200 dark:border-amber-800/50">
      <CardHeader className="flex-row items-center gap-2">
        <Shield className="size-5 text-amber-500" />
        <CardTitle className="text-base">Recovery Tracker</CardTitle>
        {isLongRecovery && (
          <Badge variant="warning" className="ml-auto">
            Long Recovery
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        {/* Assignment to current price */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Assigned at {formatCurrency(data.assignmentPrice)}
          </span>
          <ArrowRight className="size-4 text-zinc-400 dark:text-zinc-500" />
          <span
            className={cn(
              'font-medium',
              data.currentPrice >= data.assignmentPrice
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            Now {formatCurrency(data.currentPrice)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Recovery Progress</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {clampedProgress.toFixed(0)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-linear-to-r from-red-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RecoveryStat
            label="CC Premium Collected"
            value={formatCurrency(data.ccPremiumSinceAssignment)}
            highlight
          />
          <RecoveryStat
            label="CC Trades"
            value={String(data.ccTradesSinceAssignment)}
          />
          <RecoveryStat
            label="Remaining to B/E"
            value={formatCurrency(data.remainingToBreakeven)}
          />
          <RecoveryStat
            label="Projected Weeks"
            value={
              data.projectedWeeksToBreakeven != null
                ? `~${data.projectedWeeksToBreakeven}w`
                : '\u2014'
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
