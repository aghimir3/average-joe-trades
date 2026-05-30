/**
 * Theme Toggle Component
 *
 * A dropdown button that allows switching between light, dark, and system themes.
 * Uses next-themes for theme state management.
 */

'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

// Helper for hydration-safe mounting detection
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Dropdown toggle for switching between light, dark, and system themes.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Avoid hydration mismatch using useSyncExternalStore pattern
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) {
    // Return a placeholder with same dimensions to prevent layout shift
    return (
      <button
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
          className
        )}
        disabled
        aria-label="Loading theme toggle"
      >
        <Sun className="h-4 w-4 text-zinc-400" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
            'border-zinc-200 bg-white hover:bg-zinc-100',
            'dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800',
            className
          )}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Moon className="h-4 w-4 text-zinc-400" />
          ) : (
            <Sun className="h-4 w-4 text-zinc-600" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={cn(
            'flex items-center gap-2 cursor-pointer',
            theme === 'light' && 'bg-zinc-100 dark:bg-zinc-800'
          )}
        >
          <Sun className="h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={cn(
            'flex items-center gap-2 cursor-pointer',
            theme === 'dark' && 'bg-zinc-100 dark:bg-zinc-800'
          )}
        >
          <Moon className="h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={cn(
            'flex items-center gap-2 cursor-pointer',
            theme === 'system' && 'bg-zinc-100 dark:bg-zinc-800'
          )}
        >
          <Monitor className="h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
