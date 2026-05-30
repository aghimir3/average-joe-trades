'use client';

/**
 * Base Calendar Component
 *
 * A headless, composable calendar component that handles:
 * - Calendar grid generation (first day offset, days in month)
 * - Week grouping with padding for alignment
 * - Month navigation (previous/next/current)
 * - Loading and error states
 *
 * Uses render props pattern for maximum flexibility - each calendar type
 * (Trading, Wheel, Ticker) provides its own cell renderers.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BaseCalendarDay, BaseCalendarProps, CalendarWeek } from './calendar-types';
import { CalendarHeader } from './calendar-header';

const DAY_HEADERS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_HEADERS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Loading skeleton for calendar grid.
 */
function CalendarSkeleton() {
  return (
    <div className="p-1.5 sm:p-4">
      {/* Day headers */}
      <div className="grid grid-cols-8 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-5 sm:h-6 rounded" />
        ))}
      </div>
      {/* Week rows */}
      {Array.from({ length: 5 }).map((_, weekIdx) => (
        <div key={weekIdx} className="grid grid-cols-8 gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
          {Array.from({ length: 8 }).map((_, dayIdx) => (
            <Skeleton
              key={dayIdx}
              className="h-12 sm:h-18 rounded-md sm:rounded-lg"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Error display for calendar.
 */
function CalendarError({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-red-500 dark:text-red-400">{message}</p>
      <p className="text-xs text-zinc-500 mt-1">Please try again later.</p>
    </div>
  );
}

/**
 * Base Calendar Component with render props for customization.
 */
export function BaseCalendar<TDay extends BaseCalendarDay, TWeekSummary>({
  year,
  month,
  days,
  isLoading,
  error,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  renderDayCell,
  renderWeekCell,
  renderSummary,
  calculateWeekSummary,
  onDayClick,
  onWeekClick,
  title,
  subtitle,
  helpTooltip,
  className,
}: BaseCalendarProps<TDay, TWeekSummary>) {
  // Calculate calendar grid parameters
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = today.getDate();

  // Build day lookup map for O(1) access
  const dayDataMap = new Map<number, TDay>();
  for (const day of days) {
    dayDataMap.set(day.day, day);
  }

  // Build calendar grid with padding for alignment
  // Grid starts on Sunday (day 0) and fills to complete weeks
  const calendarGrid: (TDay | null)[] = [];

  // Add padding for days before the 1st
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarGrid.push(null);
  }

  // Add days of the month
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dayData = dayDataMap.get(dayNum);
    if (dayData) {
      calendarGrid.push(dayData);
    } else {
      // Create a minimal day entry for days with no data
      calendarGrid.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
        day: dayNum,
        hasActivity: false,
      } as TDay);
    }
  }

  // Pad to complete the last week (7 days per row)
  while (calendarGrid.length % 7 !== 0) {
    calendarGrid.push(null);
  }

  // Group days into weeks (7 days each)
  const weeks: CalendarWeek<TDay>[] = [];
  for (let i = 0; i < calendarGrid.length; i += 7) {
    const weekDays = calendarGrid.slice(i, i + 7);

    // Find first and last actual days in this week
    const actualDays = weekDays.filter((d): d is TDay => d !== null);
    const weekStart = actualDays.length > 0 ? actualDays[0].date : '';
    const weekEnd = actualDays.length > 0 ? actualDays[actualDays.length - 1].date : '';

    weeks.push({
      days: weekDays,
      weekIndex: weeks.length,
      weekStart,
      weekEnd,
    });
  }

  // Calculate week summaries
  const weekSummaries = weeks.map((week) => calculateWeekSummary(week));

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden',
        className
      )}
    >
      {/* Header with navigation */}
      <CalendarHeader
        title={title}
        subtitle={subtitle}
        helpTooltip={helpTooltip}
        year={year}
        month={month}
        onPreviousMonth={onPreviousMonth}
        onNextMonth={onNextMonth}
        onCurrentMonth={onCurrentMonth}
      />

      {/* Optional summary section */}
      {renderSummary?.()}

      {/* Calendar content */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : error ? (
        <CalendarError message={error} />
      ) : (
        <div className="p-1.5 sm:p-4">
          {/* Day headers (7 days + Week column) */}
          <div className="grid grid-cols-8 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
            {DAY_HEADERS_SHORT.map((dayShort, idx) => (
              <div
                key={idx}
                className="text-center text-[9px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 py-0.5 sm:py-1"
              >
                <span className="sm:hidden">{dayShort}</span>
                <span className="hidden sm:inline">{DAY_HEADERS_FULL[idx]}</span>
              </div>
            ))}
            <div className="text-center text-[9px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 py-0.5 sm:py-1">
              Week
            </div>
          </div>

          {/* Week rows */}
          {weeks.map((week, weekIdx) => {
            const weekSummary = weekSummaries[weekIdx];
            const hasWeekActivity = week.days.some((d) => d?.hasActivity);

            return (
              <div key={weekIdx} className="grid grid-cols-8 gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                {/* Day cells */}
                {week.days.map((day, dayIdx) => {
                  const isToday = isCurrentMonth && day?.day === todayDate;
                  const handleDayClick = day?.hasActivity && onDayClick
                    ? () => onDayClick(day)
                    : undefined;

                  return (
                    <div key={dayIdx}>
                      {renderDayCell(day, isToday, handleDayClick)}
                    </div>
                  );
                })}

                {/* Week summary cell */}
                <div>
                  {renderWeekCell(
                    week,
                    weekSummary,
                    hasWeekActivity && onWeekClick
                      ? () => onWeekClick(week, weekSummary)
                      : undefined
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
