/**
 * DatePicker Component
 *
 * A hybrid date picker that shows a calendar popover on desktop
 * and falls back to native date input on mobile for best UX.
 */

'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  /** Current date value as YYYY-MM-DD string */
  value?: string;
  /** Callback when date changes, receives YYYY-MM-DD string */
  onChange: (date: string) => void;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Disable the picker */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Minimum selectable date as YYYY-MM-DD */
  minDate?: string;
  /** Maximum selectable date as YYYY-MM-DD */
  maxDate?: string;
  /** ID for the input element */
  id?: string;
}

/**
 * DatePicker with calendar popover on desktop and native picker on mobile.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className,
  minDate,
  maxDate,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse the string value to a Date object
  const dateValue = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const isValidDate = dateValue && isValid(dateValue);

  // Parse min/max dates
  const minDateObj = minDate ? parse(minDate, 'yyyy-MM-dd', new Date()) : undefined;
  const maxDateObj = maxDate ? parse(maxDate, 'yyyy-MM-dd', new Date()) : undefined;

  // Handle calendar selection
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  // Handle native input change (mobile)
  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Detect if likely mobile/touch device
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    // Check for touch capability and small screen
    const checkMobile = () => {
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(hasTouchScreen && isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mobile, use native date input for better UX
  if (isMobile) {
    return (
      <div className={cn('relative', className)}>
        <input
          type="date"
          id={id}
          value={value || ''}
          onChange={handleNativeChange}
          disabled={disabled}
          min={minDate}
          max={maxDate}
          className={cn(
            'flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
            'dark:focus:ring-zinc-600',
            // Style the placeholder
            !value && 'text-zinc-500 dark:text-zinc-400'
          )}
        />
      </div>
    );
  }

  // On desktop, use calendar popover
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
            'dark:focus:ring-zinc-600',
            !isValidDate && 'text-zinc-500 dark:text-zinc-400',
            className
          )}
        >
          <span>
            {isValidDate
              ? format(dateValue, 'MMM d, yyyy')
              : placeholder}
          </span>
          <CalendarIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidDate ? dateValue : undefined}
          onSelect={handleSelect}
          disabled={(date) => {
            if (minDateObj && date < minDateObj) return true;
            if (maxDateObj && date > maxDateObj) return true;
            return false;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
