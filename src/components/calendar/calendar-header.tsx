'use client';

/**
 * Calendar Header Component
 *
 * Reusable header with:
 * - Title and optional subtitle
 * - Help tooltip
 * - Month/year display
 * - Navigation buttons (previous, next, today)
 */

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Button } from '@/components/ui/button';
import type { CalendarHelpTooltip } from './calendar-types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarHeaderProps {
  title: string;
  subtitle?: string;
  helpTooltip?: CalendarHelpTooltip;
  year: number;
  month: number;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  icon?: React.ReactNode;
  iconBgClass?: string;
}

export function CalendarHeader({
  title,
  subtitle,
  helpTooltip,
  year,
  month,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  icon,
  iconBgClass = 'bg-indigo-50 dark:bg-indigo-900/30',
}: CalendarHeaderProps) {
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const monthName = MONTH_NAMES[month - 1];

  return (
    <div className="px-3 py-3 sm:px-4 sm:py-4 border-b border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl ${iconBgClass}`}>
            {icon || <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {title}
              </h2>
              {helpTooltip && (
                <HelpTooltip
                  title={helpTooltip.title}
                  description={helpTooltip.description}
                />
              )}
            </div>
            {subtitle && (
              <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right: Navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Previous month */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onPreviousMonth}
            className="h-7 w-7 sm:h-8 sm:w-8"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Month/Year display */}
          <button
            onClick={onCurrentMonth}
            disabled={isCurrentMonth}
            className="min-w-22.5 sm:min-w-30 px-2 py-1 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-default"
            title={isCurrentMonth ? 'Current month' : 'Go to current month'}
          >
            {monthName} {year}
          </button>

          {/* Next month */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNextMonth}
            className="h-7 w-7 sm:h-8 sm:w-8"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
