/**
 * Input component following shadcn/ui patterns.
 *
 * A styled input field with modern design.
 * Supports all standard input attributes. Updated to React 19 pattern.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-base',
        'text-(--text-primary)',
        'transition-all duration-150 ease-out',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zinc-950',
        'placeholder:text-(--text-muted)',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green focus-visible:ring-offset-2 focus-visible:border-rh-green',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-zinc-800 dark:bg-zinc-950 dark:file:text-zinc-50',
        'md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Input };
