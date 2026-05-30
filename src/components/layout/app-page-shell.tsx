import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AppHeader } from './app-header';

interface AppPageShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  issueCount?: number;
  children: ReactNode;
  width?: 'narrow' | 'medium' | 'wide' | 'full';
  className?: string;
  contentClassName?: string;
  showBackgroundPattern?: boolean;
}

const widthClasses = {
  narrow: 'max-w-2xl',
  medium: 'max-w-4xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
};

export function AppPageShell({
  user,
  issueCount,
  children,
  width = 'wide',
  className,
  contentClassName,
  showBackgroundPattern = true,
}: AppPageShellProps) {
  return (
    <main
      className={cn(
        'relative min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50',
        'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0',
        className
      )}
    >
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 dark:bg-white dark:text-zinc-950"
      >
        Skip to content
      </a>

      {showBackgroundPattern && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05)_0%,transparent_48%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08)_0%,transparent_50%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none fixed inset-0 z-0 app-dot-grid opacity-60 dark:opacity-100"
            aria-hidden="true"
          />
        </>
      )}

      <AppHeader user={user} issueCount={issueCount} />

      <div
        id="main-content"
        tabIndex={-1}
        className={cn(
          'relative z-10 mx-auto px-4 py-4 outline-none sm:px-6 lg:px-8',
          widthClasses[width],
          contentClassName
        )}
      >
        {children}
      </div>
    </main>
  );
}