/**
 * Card component for containing grouped content.
 *
 * Provides a consistent container with background, border, and shadow
 * following shadcn/ui patterns. Composed of multiple sub-components
 * for flexible content structure. Updated to React 19 pattern without forwardRef.
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *     <CardDescription>Description text</CardDescription>
 *     <CardAction>
 *       <Button variant="link">Action</Button>
 *     </CardAction>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Main content goes here</p>
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card container component.
 * Provides the outer wrapper with background, border, and shadow.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-xl border border-zinc-200/70 bg-white/90 text-(--text-primary) shadow-sm shadow-zinc-950/[0.03] backdrop-blur-sm',
        'transition-shadow duration-150 ease-out',
        'dark:border-zinc-800/70 dark:bg-zinc-900/70 dark:text-(--text-primary) dark:shadow-black/10',
        className
      )}
      {...props}
    />
  );
}

/**
 * Card header section.
 * Contains title, optional description, and optional action. Uses grid layout for proper alignment.
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 py-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

/**
 * Card title component.
 * Renders as div with appropriate heading styles.
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  );
}

/**
 * Card description component.
 * Secondary text below the title with muted styling.
 */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-(--text-secondary)', className)}
      {...props}
    />
  );
}

/**
 * Card action component.
 * Action button area in the header, aligned to the right.
 */
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

/**
 * Card content section.
 * Main content area with padding.
 */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  );
}

/**
 * Card footer section.
 * Bottom area for actions. Uses flex row layout for buttons.
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 py-4 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
};
