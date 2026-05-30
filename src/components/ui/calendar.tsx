/**
 * Calendar Component
 *
 * A date calendar built on react-day-picker v9.
 * Styled to match the app's dark theme and design system.
 */

'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendar component for date selection.
 * Supports single date, range, and multiple date selection modes.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        // v9 class names
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-zinc-900 dark:text-zinc-100',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
          'hover:bg-zinc-100 dark:hover:bg-zinc-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600',
          'disabled:pointer-events-none disabled:opacity-50'
        ),
        button_next: cn(
          'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
          'hover:bg-zinc-100 dark:hover:bg-zinc-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600',
          'disabled:pointer-events-none disabled:opacity-50'
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: cn(
          'text-zinc-500 dark:text-zinc-400 rounded-md w-9 font-normal text-[0.8rem] text-center'
        ),
        week: 'flex w-full mt-2',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          'h-9 w-9',
          '[&:has([aria-selected])]:bg-zinc-100 dark:[&:has([aria-selected])]:bg-zinc-800',
          '[&:has([aria-selected].day-outside)]:bg-zinc-100/50 dark:[&:has([aria-selected].day-outside)]:bg-zinc-800/50',
          '[&:has([aria-selected].day-range-end)]:rounded-r-md'
        ),
        day_button: cn(
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
          'inline-flex items-center justify-center rounded-md text-sm transition-colors',
          'hover:bg-zinc-100 dark:hover:bg-zinc-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600',
          'disabled:pointer-events-none disabled:opacity-50'
        ),
        range_end: 'day-range-end',
        selected: cn(
          'bg-zinc-900 text-zinc-50 hover:bg-zinc-900 hover:text-zinc-50',
          'dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50 dark:hover:text-zinc-900',
          'focus:bg-zinc-900 focus:text-zinc-50',
          'dark:focus:bg-zinc-50 dark:focus:text-zinc-900'
        ),
        today: 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50',
        outside: cn(
          'day-outside text-zinc-400 aria-selected:bg-zinc-100/50 aria-selected:text-zinc-500',
          'dark:text-zinc-500 dark:aria-selected:bg-zinc-800/50 dark:aria-selected:text-zinc-400'
        ),
        disabled: 'text-zinc-400 opacity-50 dark:text-zinc-500',
        range_middle: cn(
          'aria-selected:bg-zinc-100 aria-selected:text-zinc-900',
          'dark:aria-selected:bg-zinc-800 dark:aria-selected:text-zinc-50'
        ),
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
