'use client';

import { Clock, Target, Calendar, TrendingUp, AlertTriangle, Zap, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PlaybookData {
  bestDteBucket: { range: string; winRate: number; tradeCount: number } | null;
  bestStrikeDistance: { range: string; winRate: number; tradeCount: number } | null;
  bestDayOfWeek: { day: string; winRate: number } | null;
  strategyEdge: { winner: 'csp' | 'cc' | 'even'; cspWinRate: number; ccWinRate: number };
  premiumRegime: 'high' | 'normal' | 'low';
  assignmentDangerZone: { strike: number; rate: number } | null;
}

interface PlaybookCardProps {
  playbook: PlaybookData;
  symbol: string;
}

const REGIME_CONFIG = {
  high: { label: 'High IV', variant: 'success' as const },
  normal: { label: 'Normal IV', variant: 'secondary' as const },
  low: { label: 'Low IV', variant: 'warning' as const },
} as const;

function StatBlock({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col gap-1 rounded-lg bg-white/60 p-2.5 dark:bg-zinc-900/40">
          <div className="flex items-center gap-1.5">
            <Icon className="size-3.5 text-zinc-400 dark:text-zinc-500" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-52">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function formatEdge(edge: PlaybookData['strategyEdge']): string {
  if (edge.winner === 'even') return `Even (${edge.cspWinRate}%)`;
  if (edge.winner === 'csp') return `CSP (${edge.cspWinRate}%)`;
  return `CC (${edge.ccWinRate}%)`;
}

/**
 * Displays a user's optimal trading parameters for a specific ticker.
 * Renders as a gradient card with a grid of key playbook stats and tooltips.
 */
export function PlaybookCard({ playbook, symbol }: PlaybookCardProps) {
  const regime = REGIME_CONFIG[playbook.premiumRegime];

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="border-indigo-200/60 bg-linear-to-r from-indigo-50 to-violet-50 dark:border-indigo-800/40 dark:from-indigo-950/30 dark:to-violet-950/30">
        <CardHeader className="flex-row items-center gap-2">
          <Sparkles className="size-5 text-violet-500" />
          <CardTitle className="text-base">Your {symbol} Playbook</CardTitle>
          <Badge variant={regime.variant} className="ml-auto">
            {regime.label}
          </Badge>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatBlock
              icon={Clock}
              label="Best DTE"
              value={playbook.bestDteBucket?.range ?? '\u2014'}
              tooltip={
                playbook.bestDteBucket
                  ? `${playbook.bestDteBucket.winRate}% win rate across ${playbook.bestDteBucket.tradeCount} trades`
                  : 'Not enough data'
              }
            />
            <StatBlock
              icon={Target}
              label="Best Strike"
              value={playbook.bestStrikeDistance?.range ?? '\u2014'}
              tooltip={
                playbook.bestStrikeDistance
                  ? `${playbook.bestStrikeDistance.winRate}% win rate across ${playbook.bestStrikeDistance.tradeCount} trades`
                  : 'Not enough data'
              }
            />
            <StatBlock
              icon={Calendar}
              label="Best Day"
              value={playbook.bestDayOfWeek?.day ?? '\u2014'}
              tooltip={
                playbook.bestDayOfWeek
                  ? `${playbook.bestDayOfWeek.winRate}% win rate on this day`
                  : 'Not enough data'
              }
            />
            <StatBlock
              icon={TrendingUp}
              label="Strategy Edge"
              value={formatEdge(playbook.strategyEdge)}
              tooltip={`CSP: ${playbook.strategyEdge.cspWinRate}% vs CC: ${playbook.strategyEdge.ccWinRate}% win rate`}
            />
            <StatBlock
              icon={Zap}
              label="IV Regime"
              value={regime.label}
              tooltip="Current implied volatility environment based on recent premium levels"
            />
            <StatBlock
              icon={AlertTriangle}
              label="Danger Zone"
              value={
                playbook.assignmentDangerZone
                  ? `$${playbook.assignmentDangerZone.strike} (${playbook.assignmentDangerZone.rate}%)`
                  : '\u2014'
              }
              tooltip={
                playbook.assignmentDangerZone
                  ? `${playbook.assignmentDangerZone.rate}% assignment rate at the $${playbook.assignmentDangerZone.strike} strike`
                  : 'Not enough data'
              }
            />
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
