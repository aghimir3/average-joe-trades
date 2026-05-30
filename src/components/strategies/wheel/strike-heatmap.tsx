'use client';

import { Fragment } from 'react';
import { Grid3X3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatCurrency } from '@/lib/utils';

interface StrikeHeatmapData {
  cells: Array<{
    strike: number;
    dteBucket: string;
    tradeCount: number;
    winRate: number;
    avgPremium: number;
  }>;
  strikes: number[];
  dteBuckets: string[];
}

interface StrikeHeatmapProps {
  data: StrikeHeatmapData;
}

function getCellColor(winRate: number, tradeCount: number): string {
  if (tradeCount === 0) return 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500';
  if (winRate >= 70) return 'bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  if (winRate >= 50) return 'bg-amber-500/20 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-red-500/20 text-red-700 dark:bg-red-500/15 dark:text-red-400';
}

/**
 * 2D heatmap grid showing win rate by strike price and DTE bucket.
 * Color-coded cells indicate trade performance at each strike/DTE intersection.
 */
export function StrikeHeatmap({ data }: StrikeHeatmapProps) {
  if (data.cells.length === 0) {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Grid3X3 className="size-5 text-violet-500" />
          <CardTitle className="text-base">Strike x DTE Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Not enough strike data for heatmap
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build a lookup map for O(1) cell access
  const cellMap = new Map<string, (typeof data.cells)[number]>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.strike}|${cell.dteBucket}`, cell);
  }

  const colCount = data.dteBuckets.length;

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Grid3X3 className="size-5 text-violet-500" />
          <CardTitle className="text-base">Strike x DTE Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          {/* Horizontal scroll wrapper for mobile */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `auto repeat(${colCount}, minmax(60px, 1fr))`,
              }}
            >
              {/* Header row: empty corner + DTE bucket labels */}
              <div />
              {data.dteBuckets.map((bucket) => (
                <div
                  key={bucket}
                  className="text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                >
                  {bucket}
                </div>
              ))}

              {/* Data rows: strike label + cells */}
              {data.strikes.map((strike) => (
                <Fragment key={strike}>
                  <div
                    className="sticky left-0 z-10 flex items-center bg-white pr-2 text-xs font-medium text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                  >
                    ${strike}
                  </div>
                  {data.dteBuckets.map((bucket) => {
                    const cell = cellMap.get(`${strike}|${bucket}`);
                    const count = cell?.tradeCount ?? 0;
                    const winRate = cell?.winRate ?? 0;
                    const avgPremium = cell?.avgPremium ?? 0;

                    return (
                      <Tooltip key={`${strike}-${bucket}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'flex min-h-9 items-center justify-center rounded-md text-xs font-medium',
                              getCellColor(winRate, count)
                            )}
                          >
                            {count > 0 ? count : '\u2014'}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {count > 0
                              ? `${count} trade${count !== 1 ? 's' : ''}, ${winRate}% win rate, ${formatCurrency(avgPremium)} avg premium`
                              : 'No trades at this strike/DTE'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
