/**
 * Skeleton component for loading placeholders.
 *
 * Simple animated placeholder following shadcn/ui patterns.
 *
 * @example
 * <Skeleton className="h-4 w-[250px]" />
 * <Skeleton className="h-12 w-12 rounded-full" />
 */

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-skeleton-shimmer rounded-md bg-linear-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-size-[200%_100%] dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
