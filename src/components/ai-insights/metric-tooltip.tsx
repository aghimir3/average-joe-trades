'use client';

import { CircleHelp } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { metricTooltips, type MetricTooltipKey } from '@/lib/ai-insights/metric-tooltips';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface MetricTooltipProps {
  metric: MetricTooltipKey;
  className?: string;
}

export function MetricTooltip({ metric, className }: MetricTooltipProps) {
  const definition = metricTooltips[metric];
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const trigger = (
    <button
      type="button"
      className={cn(
        'inline-flex items-center rounded-sm p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors',
        className
      )}
      aria-label={`Explain ${definition.label}`}
    >
      <CircleHelp className="h-3.5 w-3.5" />
    </button>
  );

  const content = (
    <div className="space-y-1.5 max-w-xs">
      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{definition.label}</p>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">{definition.plainEnglish}</p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{definition.howToUse}</p>
    </div>
  );

  if (isDesktop) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {trigger}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        {content}
      </PopoverContent>
    </Popover>
  );
}
