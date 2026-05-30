'use client';

/**
 * Features Guide Client Component
 * Displays all app features in an easy-to-understand format
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Briefcase,
  Target,
  Trophy,
  RotateCcw,
  Upload,
  Building2,
  BookOpen,
  ClipboardList,
  Landmark,
  Settings,
  Brain,
  TrendingUp,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_FEATURE_SECTIONS, type AppFeatureSection } from '@/lib/chat/features-data';

/** Rendered section = shared data + icon + color. */
type FeatureSection = AppFeatureSection & { icon: React.ElementType; color: string };

/** Section-level UI metadata (icons + colors) — not included in shared data to keep it server-safe. */
const SECTION_META: Record<string, { icon: React.ElementType; color: string }> = {
  dashboard: { icon: LayoutDashboard, color: 'blue' },
  positions: { icon: Briefcase, color: 'emerald' },
  trading: { icon: TrendingUp, color: 'green' },
  import: { icon: Upload, color: 'amber' },
  accounts: { icon: Building2, color: 'purple' },
  'options-analytics': { icon: Target, color: 'violet' },
  wheel: { icon: RotateCcw, color: 'indigo' },
  goals: { icon: Trophy, color: 'green' },
  'ai-insights': { icon: Brain, color: 'violet' },
  ml: { icon: Brain, color: 'violet' },
  joey: { icon: MessageSquare, color: 'emerald' },
  journal: { icon: BookOpen, color: 'blue' },
  policy: { icon: ClipboardList, color: 'purple' },
  tax: { icon: Landmark, color: 'blue' },
  settings: { icon: Settings, color: 'zinc' },
};

const FEATURE_SECTIONS = APP_FEATURE_SECTIONS.map((s) => ({
  ...s,
  icon: SECTION_META[s.id]?.icon ?? Sparkles,
  color: SECTION_META[s.id]?.color ?? 'zinc',
}));

const colorStyles: Record<string, { bg: string; text: string; border: string }> = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  violet: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800',
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
  zinc: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
  },
};

export function FeaturesClient() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['dashboard']));
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(FEATURE_SECTIONS.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  // Filter sections by search query
  const filteredSections = FEATURE_SECTIONS.filter((section) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (section.title.toLowerCase().includes(query)) return true;
    if (section.description.toLowerCase().includes(query)) return true;
    return section.features.some(
      (f) =>
        f.title.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      {/* Header - Compact design */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="mx-auto max-w-4xl px-4 py-4">
          {/* Title row with search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rh-green/15">
                <Sparkles className="h-4 w-4 text-rh-green" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Features Guide
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                  Learn how to use Average Joe Trades
                </p>
              </div>
            </div>

            {/* Search and actions row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rh-green"
                />
              </div>
              <button
                onClick={expandAll}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap"
              >
                Expand
              </button>
              <button
                onClick={collapseAll}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {filteredSections.length === 0 ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-zinc-500 dark:text-zinc-400">No features match your search.</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-rh-green hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id} id={`section-${section.id}`}>
              <FeatureSectionCard
                section={section}
                isExpanded={expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            </div>
          ))
        )}
      </div>

      {/* Back to dashboard */}
      <div className="mx-auto max-w-4xl px-4 pb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-rh-green hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function FeatureSectionCard({
  section,
  isExpanded,
  onToggle,
}: {
  section: FeatureSection;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colors = colorStyles[section.color];
  const Icon = section.icon;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden transition-all',
        colors.border
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className={cn('p-3 rounded-xl', colors.bg)}>
          <Icon className={cn('h-6 w-6', colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {section.title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {section.description}
          </p>
        </div>
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-zinc-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 sm:px-5 pb-5 space-y-4">
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4" />
          {section.features.map((feature, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
            >
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                {feature.description}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium">
                    How to use
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {feature.howToUse}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium">
                    Benefit
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {feature.benefit}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FeaturesClient;
