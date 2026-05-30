'use client';

/**
 * AI Insights Client
 *
 * Main container for the AI Insights page with 4 tabs:
 * 1. Actions - Actionable recommendations
 * 2. Your Models - Personal ML model insights
 * 3. Community - Aggregated community wisdom
 * 4. Train - Model management & training
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  FlaskConical,
  Shield,
  Brain,
  Users,
  Sparkles,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { AccountSelector } from '@/components/accounts/account-selector';
import { AICommandCenter } from './ai-command-center';
import { Skeleton } from '@/components/ui/skeleton';
import type { AIInsightsTab } from './lib/types';

// ============================================================================
// Lazy-loaded Tab Components
// ============================================================================

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

const ActionsTab = dynamic(
  () => import('./actions-tab').then((m) => ({ default: m.ActionsTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const AlphaLabTab = dynamic(
  () => import('./alpha-lab-tab').then((m) => ({ default: m.AlphaLabTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const RiskTab = dynamic(
  () => import('./risk-tab').then((m) => ({ default: m.RiskTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const YourModelsTab = dynamic(
  () => import('./your-models-tab').then((m) => ({ default: m.YourModelsTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const CommunityTab = dynamic(
  () => import('./community-tab').then((m) => ({ default: m.CommunityTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const TrainTab = dynamic(
  () => import('./train-tab').then((m) => ({ default: m.TrainTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

const SentimentTab = dynamic(
  () => import('./sentiment-tab').then((m) => ({ default: m.SentimentTab })),
  { loading: () => <TabSkeleton />, ssr: false }
);

// Prefetch helpers to reduce tab switching latency
function prefetchTab(tab: AIInsightsTab) {
  switch (tab) {
    case 'actions':
      void import('./actions-tab');
      break;
    case 'models':
      void import('./your-models-tab');
      break;
    case 'alpha':
      void import('./alpha-lab-tab');
      break;
    case 'risk':
      void import('./risk-tab');
      break;
    case 'community':
      void import('./community-tab');
      break;
    case 'train':
      void import('./train-tab');
      break;
    case 'sentiment':
      void import('./sentiment-tab');
      break;
    default:
      break;
  }
}

// ============================================================================
// Tab Configuration
// ============================================================================

const TABS: { id: AIInsightsTab; label: string; icon: React.ElementType; shortLabel?: string }[] = [
  { id: 'actions', label: 'Actions', icon: Zap, shortLabel: 'Actions' },
  { id: 'alpha', label: 'Alpha Lab', icon: FlaskConical, shortLabel: 'Alpha' },
  { id: 'risk', label: 'Risk', icon: Shield, shortLabel: 'Risk' },
  { id: 'models', label: 'Your Models', icon: Brain, shortLabel: 'Models' },
  { id: 'community', label: 'Community', icon: Users, shortLabel: 'Community' },
  { id: 'train', label: 'Train', icon: Sparkles, shortLabel: 'Train' },
  { id: 'sentiment', label: 'Sentiment', icon: Gauge, shortLabel: 'Sentiment' },
];

// ============================================================================
// Main Component
// ============================================================================

export function AIInsightsClient() {
  const tabScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<AIInsightsTab>(() => {
    if (typeof window === 'undefined') return 'actions';
    const hash = window.location.hash.replace('#', '');
    if (TABS.some((tab) => tab.id === hash)) {
      return hash as AIInsightsTab;
    }
    return 'actions';
  });
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();
  const queryClient = useQueryClient();

  const setTabFromHash = (hash: string) => {
    const cleaned = hash.replace('#', '');
    if (TABS.some((tab) => tab.id === cleaned)) {
      setActiveTab(cleaned as AIInsightsTab);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => setTabFromHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scroller = tabScrollerRef.current;
    if (!scroller) return;

    const activeButton = scroller.querySelector<HTMLButtonElement>(
      `button[data-tab-id="${activeTab}"]`
    );
    if (!activeButton) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeButton.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [activeTab]);

  const handleTabChange = (tabId: AIInsightsTab) => {
    setActiveTab(tabId);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tabId}`);
    }
  };

  const handleRefresh = () => {
    // Invalidate all AI-related queries
    queryClient.invalidateQueries({ queryKey: ['ai-unified'] });
    queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    queryClient.invalidateQueries({ queryKey: ['roll-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['wheel-rankings'] });
  };

  return (
    <div className="space-y-3 sm:space-y-4 pb-2 sm:pb-0">
      {/* Command Center Hero */}
      <AICommandCenter accountId={selectedAccountId} onRefresh={handleRefresh} />

      {/* Account Selector + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Account Selector */}
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          className="w-full sm:w-auto sm:min-w-56"
        />

        {/* Tab Navigation - mobile swipeable + desktop full labels */}
        <div className="relative w-full sm:w-auto">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-zinc-50 dark:from-zinc-950 to-transparent sm:hidden z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-zinc-50 dark:from-zinc-950 to-transparent sm:hidden z-10" />

          <div
            ref={tabScrollerRef}
            className="overflow-x-auto scrollbar-hide touch-pan-x scroll-smooth [-webkit-overflow-scrolling:touch] -mx-1 px-1 sm:mx-0 sm:px-0"
          >
            <div className="inline-flex min-w-max rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  data-tab-id={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  onMouseEnter={() => prefetchTab(tab.id)}
                  onFocus={() => prefetchTab(tab.id)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                    activeTab === tab.id
                      ? 'bg-violet-500 text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 px-1 text-[10px] text-zinc-500 sm:hidden">
            Swipe to see all tabs
          </p>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-80">
        {activeTab === 'actions' && <ActionsTab accountId={selectedAccountId} />}
        {activeTab === 'alpha' && <AlphaLabTab accountId={selectedAccountId} />}
        {activeTab === 'risk' && <RiskTab accountId={selectedAccountId} />}
        {activeTab === 'models' && <YourModelsTab />}
        {activeTab === 'community' && <CommunityTab />}
        {activeTab === 'train' && <TrainTab />}
        {activeTab === 'sentiment' && <SentimentTab />}
      </div>
    </div>
  );
}
