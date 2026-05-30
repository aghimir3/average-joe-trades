/**
 * Button component with multiple variants and sizes.
 *
 * Built following shadcn/ui patterns using class-variance-authority (CVA)
 * for type-safe variant management. Supports all standard button props
 * plus custom variants for consistent styling across the app.
 *
 * @example
 * // Default button
 * <Button>Click me</Button>
 *
 * @example
 * // Variant and size
 * <Button variant="outline" size="lg">Large Outline</Button>
 *
 * @example
 * // With loading state
 * <Button disabled={isLoading}>
 *   {isLoading ? 'Loading...' : 'Submit'}
 * </Button>
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button variant definitions using CVA.
 *
 * Variants:
 * - default: Primary action button (solid background)
 * - destructive: Dangerous actions (red theme)
 * - outline: Secondary actions (bordered)
 * - secondary: Less prominent actions
 * - ghost: Minimal styling (icon buttons, subtle actions)
 * - link: Text link appearance
 *
 * Sizes:
 * - default: Standard size for most use cases
 * - sm: Compact buttons for tight spaces
 * - lg: Large buttons for CTAs
 * - icon: Square button for icon-only content
 */
const buttonVariants = cva(
  // Base styles applied to all buttons
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-md text-sm font-medium',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        default:
          'bg-zinc-900 text-zinc-50 shadow-sm hover:bg-zinc-800 hover:shadow-md dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
        destructive:
          'bg-rh-red text-white shadow-sm hover:bg-rh-red-hover hover:shadow-md focus-visible:ring-rh-red',
        outline:
          'border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
        secondary:
          'bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700',
        ghost:
          'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
        link: 'text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50',
        success:
          'bg-rh-green text-white shadow-sm hover:bg-rh-green-hover hover:shadow-md focus-visible:ring-rh-green',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/**
 * Button component props.
 * Extends native button props with variant options.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * If true, renders as a child component (for use with Slot).
   * Allows the button to be rendered as a different element (e.g., anchor).
   */
  asChild?: boolean;
}

/**
 * Button component for user interactions.
 *
 * Renders a styled button element with support for multiple
 * visual variants and sizes. Updated to React 19 pattern without forwardRef.
 */
function Button({
  className,
  variant,
  size,
  // asChild kept in interface for shadcn/ui API compatibility but not implemented
  // (would require @radix-ui/react-slot)
  asChild: _,
  ...props
}: ButtonProps) {
  void _; // Explicitly mark as intentionally unused
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
