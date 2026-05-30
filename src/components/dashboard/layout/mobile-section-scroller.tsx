/**
 * Mobile Section Scroller
 * Horizontal scrollable pill navigation for quick section jumping on mobile
 */

'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { SectionConfig, DashboardSectionId } from '../lib/dashboard-types';

interface MobileSectionScrollerProps {
  sections: SectionConfig[];
  openSections: Set<DashboardSectionId>;
  onJumpTo: (sectionId: string) => void;
  className?: string;
}

// Accent color mapping for pills
const pillColors: Record<string, { active: string; inactive: string }> = {
  blue: {
    active: 'bg-blue-500 text-white shadow-blue-500/30',
    inactive: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  },
  emerald: {
    active: 'bg-emerald-500 text-white shadow-emerald-500/30',
    inactive: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    active: 'bg-purple-500 text-white shadow-purple-500/30',
    inactive: 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
  },
  amber: {
    active: 'bg-amber-500 text-white shadow-amber-500/30',
    inactive: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
  },
  zinc: {
    active: 'bg-zinc-700 text-white shadow-zinc-500/30',
    inactive: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  },
};

export function MobileSectionScroller({
  sections,
  openSections,
  onJumpTo,
  className,
}: MobileSectionScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll active section into view when it changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const activeButton = activeRef.current;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      // Check if button is not fully visible
      if (buttonRect.left < containerRect.left || buttonRect.right > containerRect.right) {
        activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [openSections]);

  return (
    <div className={cn('lg:hidden', className)}>
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1 py-2 -mx-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = openSections.has(section.id);
          const colors = pillColors[section.accentColor] || pillColors.zinc;

          return (
            <button
              key={section.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onJumpTo(section.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                'shrink-0 active:scale-95',
                isActive ? cn(colors.active, 'shadow-lg') : colors.inactive
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{section.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
