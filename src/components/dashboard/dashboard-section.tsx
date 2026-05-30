'use client';

/**
 * DashboardSection Component
 *
 * A collapsible section for organizing dashboard content into categories.
 * Features smooth animations, summary text when collapsed, and responsive design.
 */

import { ReactNode } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DashboardSectionProps {
  /** Unique identifier for this section */
  id: string;
  /** Section title displayed in the header */
  title: string;
  /** Icon displayed before the title */
  icon: LucideIcon;
  /** Optional summary text shown when section is collapsed */
  collapsedSummary?: string;
  /** Optional summary element (e.g., progress ring) shown when collapsed */
  collapsedSummaryElement?: ReactNode;
  /** Whether the section is currently open */
  isOpen: boolean;
  /** Callback when section open state changes */
  onOpenChange: (isOpen: boolean) => void;
  /** Section content */
  children: ReactNode;
  /** Optional className for the container */
  className?: string;
  /** Color accent for the section header */
  accentColor?: 'blue' | 'emerald' | 'purple' | 'amber' | 'zinc';
  /** Whether the section content is loading */
  isLoading?: boolean;
}

const accentStyles = {
  blue: {
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    borderHover: 'hover:border-blue-300 dark:hover:border-blue-700',
  },
  emerald: {
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
  },
  purple: {
    iconBg: 'bg-purple-100 dark:bg-purple-900/40',
    iconColor: 'text-purple-600 dark:text-purple-400',
    borderHover: 'hover:border-purple-300 dark:hover:border-purple-700',
  },
  amber: {
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    borderHover: 'hover:border-amber-300 dark:hover:border-amber-700',
  },
  zinc: {
    iconBg: 'bg-zinc-100 dark:bg-zinc-800',
    iconColor: 'text-zinc-600 dark:text-zinc-400',
    borderHover: 'hover:border-zinc-300 dark:hover:border-zinc-600',
  },
};

export function DashboardSection({
  id,
  title,
  icon: Icon,
  collapsedSummary,
  collapsedSummaryElement,
  isOpen,
  onOpenChange,
  children,
  className,
  accentColor = 'zinc',
  isLoading = false,
}: DashboardSectionProps) {
  const accent = accentStyles[accentColor];

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className={cn('group/section', className)}
    >
      {/* Section Header */}
      <CollapsibleTrigger asChild>
        <button
          id={id}
          className={cn(
            'w-full flex items-center gap-3.5 rounded-xl',
            'bg-white dark:bg-zinc-900',
            'border border-zinc-200 dark:border-zinc-800',
            'transition-all duration-200 ease-out',
            accent.borderHover,
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
            isOpen ? 'px-5 py-4' : 'px-4 py-3'
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              'flex items-center justify-center rounded-lg shrink-0 transition-all duration-200',
              accent.iconBg,
              isOpen ? 'w-9 h-9' : 'w-8 h-8'
            )}
          >
            <Icon className={cn('transition-all duration-200', accent.iconColor, isOpen ? 'h-5 w-5' : 'h-4 w-4')} />
          </div>

          {/* Title and Summary */}
          <div className="flex-1 text-left min-w-0">
            <h2 className="text-base font-semibold text-(--text-primary)">
              {title}
            </h2>
            {/* Show summary when collapsed */}
            {!isOpen && collapsedSummary && (
              <p className="text-sm text-(--text-secondary) truncate mt-0.5">
                {collapsedSummary}
              </p>
            )}
          </div>

          {/* Summary Element (e.g., progress ring) when collapsed */}
          {!isOpen && collapsedSummaryElement && (
            <div className="shrink-0">
              {collapsedSummaryElement}
            </div>
          )}

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'h-5 w-5 text-(--text-muted) shrink-0',
              'transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>

      {/* Section Content */}
      <CollapsibleContent
        className={cn(
          'overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2',
          'data-[state=open]:duration-300 data-[state=closed]:duration-200'
        )}
      >
        <div className="pt-4 space-y-4">
          {isLoading ? <SectionSkeleton /> : children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Section loading skeleton
 */
function SectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

/**
 * Quick Jump Navigation Component
 * Provides quick access to dashboard sections on larger screens.
 */
interface QuickJumpNavProps {
  sections: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
    isOpen: boolean;
  }>;
  onJumpTo: (sectionId: string) => void;
}

export function QuickJumpNav({ sections, onJumpTo }: QuickJumpNavProps) {
  return (
    <nav className="hidden md:flex items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-md backdrop-blur-sm">
      <span className="text-xs font-medium text-(--text-secondary) px-2 hidden lg:inline">
        Jump to:
      </span>
      {sections.map(({ id, label, icon: Icon, isOpen }) => (
        <button
          key={id}
          onClick={() => onJumpTo(id)}
          title={label}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
            'transition-all duration-150',
            isOpen
              ? 'bg-rh-green text-white shadow-sm'
              : 'text-(--text-secondary) hover:bg-zinc-100 dark:hover:bg-zinc-700'
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * Mini Progress Ring Component
 * Displays a circular progress indicator for goals when section is collapsed.
 */
interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isAchieved?: boolean;
  accentColor?: 'emerald' | 'violet';
}

export function ProgressRing({
  progress,
  size = 32,
  strokeWidth = 3,
  isAchieved = false,
  accentColor = 'emerald',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  // Visual ring caps at 100% (can't go beyond a full circle)
  const progressForRing = Math.min(Math.max(progress, 0), 100);
  const strokeDashoffset = circumference - (progressForRing / 100) * circumference;
  // Display actual progress (can exceed 100%)
  const displayProgress = Math.max(progress, 0);
  const isOverAchieved = progress > 100;

  // Color schemes based on accentColor
  const achievedColor = accentColor === 'violet' ? 'text-violet-500' : 'text-emerald-500';
  const overAchievedColor = accentColor === 'violet' ? 'text-violet-600' : 'text-emerald-600';
  const progressHighColor = accentColor === 'violet' ? 'text-violet-400' : 'text-blue-500';
  const achievedTextColor = accentColor === 'violet' ? 'text-violet-600 dark:text-violet-400' : 'text-rh-green';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200 dark:text-zinc-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            'transition-all duration-500',
            isOverAchieved
              ? overAchievedColor
              : isAchieved
                ? achievedColor
                : progress >= 75
                  ? progressHighColor
                  : progress >= 50
                    ? 'text-amber-500'
                    : 'text-zinc-400'
          )}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'font-bold',
            // Smaller font for 3-digit percentages
            displayProgress >= 100 ? 'text-[8px]' : 'text-[10px]',
            isAchieved || isOverAchieved
              ? achievedTextColor
              : 'text-(--text-secondary)'
          )}
        >
          {Math.round(displayProgress)}%
        </span>
      </div>
    </div>
  );
}
