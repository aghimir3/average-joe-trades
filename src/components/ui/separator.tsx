'use client';

/**
 * Separator component for visually separating content.
 *
 * Built on Radix UI Separator primitive following shadcn/ui patterns.
 * Updated to React 19 pattern.
 *
 * @example
 * <Separator />
 * <Separator orientation="vertical" />
 */

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-zinc-200 dark:bg-zinc-800',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  );
}

export { Separator };
