/**
 * Badge component for displaying labels, tags, and status indicators.
 *
 * Built following shadcn/ui patterns using class-variance-authority (CVA).
 * Used for trade type labels, status indicators, and categorization.
 *
 * @example
 * // Default badge
 * <Badge>Stock</Badge>
 *
 * @example
 * // Variant badges
 * <Badge variant="secondary">Option</Badge>
 * <Badge variant="outline">Pending</Badge>
 * <Badge variant="destructive">Error</Badge>
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge variant definitions using CVA.
 *
 * Variants:
 * - default: Primary badge (solid background)
 * - secondary: Less prominent (gray background)
 * - destructive: Error/warning states (red theme)
 * - outline: Bordered badge for subtle indicators
 */
const badgeVariants = cva(
  // Base styles applied to all badges
  [
    'inline-flex items-center',
    'rounded-full border px-2.5 py-0.5',
    'text-xs font-semibold',
    'transition-all duration-150 ease-out',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  ],
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900',
        secondary:
          'border-transparent bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50',
        destructive:
          'border-transparent bg-rh-red text-white',
        outline: 'text-(--text-secondary) border-zinc-200 dark:border-zinc-700',
        success:
          'border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
        warning:
          'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
        // P&L specific variants using Robinhood colors
        profit:
          'border-transparent bg-rh-green/15 text-rh-green font-semibold',
        loss:
          'border-transparent bg-rh-red/15 text-rh-red font-semibold',
        // Subtle variants for less prominent indicators
        'profit-subtle':
          'border-rh-green/30 text-rh-green bg-transparent',
        'loss-subtle':
          'border-rh-red/30 text-rh-red bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Badge component props.
 * Extends native div props with variant options.
 */
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component for labels and status indicators.
 *
 * Renders a small inline element suitable for displaying
 * categorization, status, or type information.
 *
 * @param props - Badge props including variant and native div attrs
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
