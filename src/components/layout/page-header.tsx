import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type PageHeaderAccent = 'emerald' | 'blue' | 'violet' | 'amber' | 'red' | 'zinc';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  accent?: PageHeaderAccent;
  actions?: ReactNode;
  className?: string;
}

const accentClasses: Record<PageHeaderAccent, { iconWrap: string; icon: string }> = {
  emerald: {
    iconWrap: 'border-emerald-500/20 bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-300',
  },
  blue: {
    iconWrap: 'border-blue-500/20 bg-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-300',
  },
  violet: {
    iconWrap: 'border-violet-500/20 bg-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-300',
  },
  amber: {
    iconWrap: 'border-amber-500/25 bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-300',
  },
  red: {
    iconWrap: 'border-red-500/20 bg-red-500/10',
    icon: 'text-red-600 dark:text-red-300',
  },
  zinc: {
    iconWrap: 'border-zinc-300 bg-white/80 dark:border-zinc-700 dark:bg-zinc-900/70',
    icon: 'text-zinc-700 dark:text-zinc-300',
  },
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  accent = 'emerald',
  actions,
  className,
}: PageHeaderProps) {
  const styles = accentClasses[accent];

  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', styles.iconWrap)}>
            <Icon className={cn('h-5 w-5', styles.icon)} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}