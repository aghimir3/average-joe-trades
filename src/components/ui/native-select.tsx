/**
 * Native Select component
 *
 * A styled native select element with Robinhood-inspired design.
 * Uses native select for better mobile support and React Hook Form compatibility.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            'flex h-10 w-full appearance-none rounded-md border border-zinc-200 bg-white px-3 py-2 pr-10 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-rh-green focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50',
            'transition-all duration-200',
            className
          )}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      </div>
    );
  }
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
