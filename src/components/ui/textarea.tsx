/**
 * Textarea component following shadcn/ui patterns.
 *
 * A styled textarea for multi-line input. Updated to React 19 pattern.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-base',
        'placeholder:text-zinc-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-zinc-800 dark:bg-zinc-950 dark:placeholder:text-zinc-400',
        'dark:focus-visible:ring-zinc-300',
        'md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
