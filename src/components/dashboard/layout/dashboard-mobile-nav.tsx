/**
 * Dashboard Mobile Navigation
 * Fixed bottom navigation bar for mobile devices (Robinhood-style)
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Home,
  Briefcase,
  Plus,
  LineChart,
  X,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
  Upload,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionConfig, DashboardSectionId } from '../lib/dashboard-types';

// ============================================================================
// Types
// ============================================================================

interface DashboardMobileNavProps {
  sections: SectionConfig[];
  openSections: Set<DashboardSectionId>;
  onJumpTo: (sectionId: string) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DashboardMobileNav({
  sections,
  openSections,
  onJumpTo,
  className,
}: DashboardMobileNavProps) {
  const [isTradeMenuOpen, setIsTradeMenuOpen] = useState(false);
  const [isSectionsMenuOpen, setIsSectionsMenuOpen] = useState(false);

  const closeAllMenus = () => {
    setIsTradeMenuOpen(false);
    setIsSectionsMenuOpen(false);
  };

  const handleSectionJump = (sectionId: string) => {
    onJumpTo(sectionId);
    closeAllMenus();
  };

  return (
    <>
      {/* Backdrop overlay when menu is open */}
      {(isTradeMenuOpen || isSectionsMenuOpen) && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={closeAllMenus}
        />
      )}

      {/* Trade Action Menu */}
      {isTradeMenuOpen && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-50 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              New Trade
            </h3>
            <button
              onClick={() => setIsTradeMenuOpen(false)}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4 text-zinc-500" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/trade/new/stock"
              onClick={closeAllMenus}
              className="flex items-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <TrendingUp className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
              </div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Stock</span>
            </Link>
            <Link
              href="/trade/new/option/long_call"
              onClick={closeAllMenus}
              className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Call</span>
            </Link>
            <Link
              href="/trade/new/option/long_put"
              onClick={closeAllMenus}
              className="flex items-center gap-2 p-3 rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-700 dark:text-red-300">Put</span>
            </Link>
            <Link
              href="/trade/new/option/covered_call"
              onClick={closeAllMenus}
              className="flex items-center gap-2 p-3 rounded-xl border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Covered Call</span>
            </Link>
            <Link
              href="/trade/new/option/cash_secured_put"
              onClick={closeAllMenus}
              className="flex items-center gap-2 p-3 rounded-xl border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors col-span-2"
            >
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Cash Secured Put</span>
            </Link>
          </div>
        </div>
      )}

      {/* Sections Menu */}
      {isSectionsMenuOpen && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-50 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-4 animate-in slide-in-from-bottom-4 duration-200 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Jump to Section
            </h3>
            <button
              onClick={() => setIsSectionsMenuOpen(false)}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4 text-zinc-500" />
            </button>
          </div>
          <div className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = openSections.has(section.id);

              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionJump(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl transition-colors',
                    isActive
                      ? 'bg-rh-green/10 text-rh-green'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{section.title}</span>
                  {isActive && (
                    <div className="ml-auto h-2 w-2 rounded-full bg-rh-green" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Links */}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Quick Links
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Link
                href="/positions"
                onClick={closeAllMenus}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Briefcase className="h-4 w-4 text-zinc-500" />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">Positions</span>
              </Link>
              <Link
                href="/import"
                onClick={closeAllMenus}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Upload className="h-4 w-4 text-zinc-500" />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">Import</span>
              </Link>
              <Link
                href="/settings"
                onClick={closeAllMenus}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Settings className="h-4 w-4 text-zinc-500" />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav
        className={cn(
          'lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 safe-area-pb',
          className
        )}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {/* Home */}
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-rh-green"
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          {/* Positions */}
          <Link
            href="/positions"
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <Briefcase className="h-5 w-5" />
            <span className="text-[10px] font-medium">Positions</span>
          </Link>

          {/* New Trade (Center Button) */}
          <button
            onClick={() => {
              setIsSectionsMenuOpen(false);
              setIsTradeMenuOpen(!isTradeMenuOpen);
            }}
            className={cn(
              'relative -mt-4 flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-all',
              isTradeMenuOpen
                ? 'bg-zinc-800 dark:bg-zinc-200 rotate-45'
                : 'bg-rh-green hover:bg-rh-green/90'
            )}
          >
            <Plus
              className={cn(
                'h-6 w-6 transition-colors',
                isTradeMenuOpen ? 'text-white dark:text-zinc-900' : 'text-white'
              )}
            />
          </button>

          {/* Charts/Sections */}
          <button
            onClick={() => {
              setIsTradeMenuOpen(false);
              setIsSectionsMenuOpen(!isSectionsMenuOpen);
            }}
            className={cn(
              'flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors',
              isSectionsMenuOpen
                ? 'text-rh-green'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            )}
          >
            <LineChart className="h-5 w-5" />
            <span className="text-[10px] font-medium">Explore</span>
          </button>

          {/* More/Menu */}
          <Link
            href="/features"
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="text-[10px] font-medium">Help</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
