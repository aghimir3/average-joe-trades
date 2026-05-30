/**
 * Dashboard Sidebar
 * Modern desktop navigation sidebar with collapsible sections and sub-navigation
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
  PanelLeftClose,
  PanelLeft,
  Briefcase,
  Upload,
  Settings,
  HelpCircle,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionConfig, DashboardSectionId } from '../lib/dashboard-types';

// ============================================================================
// Types
// ============================================================================

interface DashboardSidebarProps {
  sections: SectionConfig[];
  openSections: Set<DashboardSectionId>;
  onJumpTo: (sectionId: string) => void;
  onExpandAllDashboard?: () => void;
  onCollapseAllDashboard?: () => void;
  onCollapseChange?: (collapsed: boolean) => void;
  className?: string;
}

// Export helper function to get initial collapsed state (for use in parent)
export function getSidebarCollapsedState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('dashboardSidebarCollapsed') === 'true';
  } catch {
    return false;
  }
}

// ============================================================================
// Accent color mapping for sections
// ============================================================================

const accentColors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  blue: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
  },
  zinc: {
    bg: 'bg-zinc-500/10 dark:bg-zinc-500/20',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-500/30',
    glow: 'shadow-zinc-500/20',
  },
};

// ============================================================================
// Component
// ============================================================================

function getInitialCollapsedState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('dashboardSidebarCollapsed') === 'true';
  } catch {
    return false;
  }
}

function getInitialExpandedSections(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem('dashboardSidebarExpandedSections');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

export function DashboardSidebar({
  sections,
  openSections,
  onJumpTo,
  onExpandAllDashboard,
  onCollapseAllDashboard,
  onCollapseChange,
  className,
}: DashboardSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(getInitialExpandedSections);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('dashboardSidebarCollapsed', String(newState));
    onCollapseChange?.(newState);
  };

  const toggleSectionExpand = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      localStorage.setItem('dashboardSidebarExpandedSections', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const expandAllSections = useCallback(() => {
    const allIds = new Set(sections.map(s => s.id));
    setExpandedSections(allIds);
    localStorage.setItem('dashboardSidebarExpandedSections', JSON.stringify([...allIds]));
  }, [sections]);

  const collapseAllSections = useCallback(() => {
    setExpandedSections(new Set());
    localStorage.setItem('dashboardSidebarExpandedSections', JSON.stringify([]));
  }, []);

  const handleSubItemClick = (sectionId: string, subItemId: string) => {
    // First, expand the parent section via onJumpTo
    onJumpTo(sectionId);

    // Then scroll to the specific sub-item element after a short delay
    // to allow the section to expand
    setTimeout(() => {
      const element = document.getElementById(subItemId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-[calc(100vh-64px)] border-r transition-all duration-300 ease-in-out',
        'bg-zinc-50 dark:bg-zinc-950',
        'border-zinc-200 dark:border-zinc-800',
        isCollapsed ? 'w-16' : 'w-60',
        className
      )}
    >
      {/* Header with collapse toggle and expand/collapse all */}
      <div className={cn(
        'flex items-center h-12 px-3 border-b border-zinc-200 dark:border-zinc-800',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Navigation
            </span>
            <button
              onClick={expandAllSections}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Expand all sections"
            >
              <ChevronsUpDown className="h-3 w-3" />
            </button>
            <button
              onClick={collapseAllSections}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Collapse all sections"
            >
              <ChevronsDownUp className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className={cn(
            'p-2 rounded-lg transition-all duration-200',
            'hover:bg-zinc-100 dark:hover:bg-zinc-800',
            'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
            'hover:scale-105 active:scale-95'
          )}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Dashboard Sections Navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        {!isCollapsed && (
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">
              Dashboard Sections
            </span>
            {(onExpandAllDashboard || onCollapseAllDashboard) && (
              <div className="flex items-center gap-0.5">
                {onExpandAllDashboard && (
                  <button
                    onClick={onExpandAllDashboard}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    title="Expand all dashboard sections"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                )}
                {onCollapseAllDashboard && (
                  <button
                    onClick={onCollapseAllDashboard}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    title="Collapse all dashboard sections"
                  >
                    <Minimize2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <nav className="space-y-0.5">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = openSections.has(section.id);
            const isExpanded = expandedSections.has(section.id);
            const colors = accentColors[section.accentColor] || accentColors.zinc;
            const hasSubItems = section.subItems && section.subItems.length > 0;

            return (
              <div key={section.id}>
                {/* Main section button */}
                <div className="flex items-center">
                  <button
                    onClick={() => onJumpTo(section.id)}
                    className={cn(
                      'group flex-1 flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? cn(colors.bg, colors.text)
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70',
                      isCollapsed && 'justify-center px-2'
                    )}
                    title={isCollapsed ? section.title : undefined}
                  >
                    <Icon className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? colors.text : 'text-zinc-500 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                    )} />
                    {!isCollapsed && (
                      <span className="flex-1 text-left truncate text-[13px]">{section.shortLabel}</span>
                    )}
                  </button>
                  {/* Expand/collapse chevron for sub-items */}
                  {!isCollapsed && hasSubItems && (
                    <button
                      onClick={() => toggleSectionExpand(section.id)}
                      className={cn(
                        'p-1.5 rounded-md transition-all duration-200',
                        'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                        'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                      )}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <ChevronRight className={cn(
                        'h-3 w-3 transition-transform duration-200',
                        isExpanded && 'rotate-90'
                      )} />
                    </button>
                  )}
                </div>

                {/* Sub-items */}
                {!isCollapsed && hasSubItems && isExpanded && (
                  <div className="ml-6 mt-0.5 space-y-0.5 border-l border-zinc-200 dark:border-zinc-800 pl-2">
                    {section.subItems!.map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => handleSubItemClick(section.id, subItem.id)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                          'text-zinc-500 dark:text-zinc-500',
                          'hover:text-zinc-700 dark:hover:text-zinc-300',
                          'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                        )}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Quick Trade Actions */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
        {!isCollapsed && (
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 px-2 font-medium">
            Quick Trade
          </p>
        )}
        <div className={cn('grid gap-1', isCollapsed ? 'grid-cols-1' : 'grid-cols-2')}>
          <Link
            href="/trade/new/stock"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200',
              'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700',
              'text-zinc-700 dark:text-zinc-200',
              isCollapsed ? 'h-8 w-full' : 'h-7 px-2 text-xs'
            )}
            title="New Stock Trade"
          >
            <TrendingUp className="h-3 w-3" />
            {!isCollapsed && <span>Stock</span>}
          </Link>
          <Link
            href="/trade/new/option/long_call"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200',
              'bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50',
              'text-emerald-700 dark:text-emerald-400',
              isCollapsed ? 'h-8 w-full' : 'h-7 px-2 text-xs'
            )}
            title="New Call Option"
          >
            <ArrowUpRight className="h-3 w-3" />
            {!isCollapsed && <span>Call</span>}
          </Link>
          <Link
            href="/trade/new/option/long_put"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200',
              'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50',
              'text-red-700 dark:text-red-400',
              isCollapsed ? 'h-8 w-full' : 'h-7 px-2 text-xs'
            )}
            title="New Put Option"
          >
            <ArrowDownRight className="h-3 w-3" />
            {!isCollapsed && <span>Put</span>}
          </Link>
          <Link
            href="/trade/new/option/covered_call"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200',
              'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50',
              'text-blue-700 dark:text-blue-400',
              isCollapsed ? 'h-8 w-full' : 'h-7 px-2 text-xs'
            )}
            title="Covered Call"
          >
            <Activity className="h-3 w-3" />
            {!isCollapsed && <span>CC</span>}
          </Link>
          {!isCollapsed && (
            <Link
              href="/trade/new/option/cash_secured_put"
              className={cn(
                'group col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-200',
                'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50',
                'text-purple-700 dark:text-purple-400',
                'h-7 px-2 text-xs'
              )}
              title="Cash Secured Put"
            >
              <DollarSign className="h-3 w-3" />
              <span>Cash Secured Put</span>
            </Link>
          )}
          {isCollapsed && (
            <Link
              href="/trade/new/option/cash_secured_put"
              className={cn(
                'group inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
                'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50',
                'text-purple-700 dark:text-purple-400',
                'h-8 w-full'
              )}
              title="Cash Secured Put"
            >
              <DollarSign className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Footer Links */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50">
        <nav className="space-y-0.5">
          {[
            { href: '/positions', icon: Briefcase, label: 'Positions' },
            { href: '/import', icon: Upload, label: 'Import' },
            { href: '/settings', icon: Settings, label: 'Settings' },
            { href: '/features', icon: HelpCircle, label: 'Features' },
          ].map(({ href, icon: FooterIcon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                'text-zinc-600 dark:text-zinc-400',
                'hover:text-zinc-900 dark:hover:text-zinc-100',
                'hover:bg-zinc-200/70 dark:hover:bg-zinc-800',
                isCollapsed && 'justify-center px-2'
              )}
              title={isCollapsed ? label : undefined}
            >
              <FooterIcon className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="text-[13px]">{label}</span>}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
