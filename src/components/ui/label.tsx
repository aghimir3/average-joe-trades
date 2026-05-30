/**
 * Label component following shadcn/ui patterns.
 *
 * A styled label for form inputs. Updated to React 19 pattern.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium leading-none',
        'text-(--text-primary)',
        'transition-colors duration-150',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Label };
