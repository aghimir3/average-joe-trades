'use client';

/**
 * Dashboard Guided Tour
 *
 * Walks authenticated users through the tabbed dashboard on first visit.
 * Uses driver.js (dynamically imported to avoid SSR issues).
 *
 * Differences from the demo tour (use-demo-tour.ts):
 * - State is DB-persisted via /api/settings (not localStorage)
 * - Conditionally includes the Live Portfolio tab step
 * - Listens for a 'startDashboardTour' custom event for manual restart
 * - Supports #tour hash for cross-page navigation triggers
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DASHBOARD_QUERY_KEYS } from './lib';
import type { UserSettings } from './lib';

// ============================================================================
// Helpers
// ============================================================================

/** Click a tab trigger by ID so its content becomes visible */
function clickTab(id: string): void {
  const el = document.querySelector<HTMLElement>(id);
  if (el) el.click();
}

/** Persist tour-seen flag to the database (best-effort) */
async function markTourSeen(): Promise<void> {
  try {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardTourSeen: true }),
    });
  } catch {
    // Best-effort — if API fails, tour may show again next visit
  }
}

// ============================================================================
// Tour Steps
// ============================================================================

/** Build tour steps — conditionally includes Live Portfolio tab */
function getTourSteps(hasLivePortfolio: boolean) {
  const steps: Array<{
    element?: string;
    popover: { title: string; description: string; side?: 'bottom'; align?: 'start' | 'center' };
    onHighlightStarted?: () => void;
  }> = [
    {
      popover: {
        title: 'Welcome to Your Dashboard!',
        description:
          "Let\u2019s take a quick tour of your trading command center. You can skip anytime.",
      },
    },
    {
      element: '#tour-account-selector',
      popover: {
        title: 'Filter by Account',
        description:
          'Switch between your brokerage accounts or view all accounts combined.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#tour-stats-cards',
      popover: {
        title: 'Your Trading Overview',
        description:
          'Key metrics at a glance \u2014 total P&L, open positions, win rate, profit factor, and more.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  if (hasLivePortfolio) {
    steps.push({
      element: '#tour-tab-live-portfolio',
      popover: {
        title: 'Live Portfolio',
        description:
          'Real-time view of your portfolio with live price updates from your broker.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-live-portfolio'),
    });
  }

  steps.push(
    {
      element: '#tour-tab-charts',
      popover: {
        title: 'Charts & Calendar',
        description:
          'Visualize your P&L over time, view your trading calendar, scatter analysis, and time-of-day patterns.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-charts'),
    },
    {
      element: '#tour-tab-positions',
      popover: {
        title: 'Positions & Trades',
        description:
          'See your current portfolio, recent trades, allocation breakdown, and position health scores.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-positions'),
    },
    {
      element: '#tour-tab-performance',
      popover: {
        title: 'Performance',
        description:
          'Deep-dive into your performance \u2014 by ticker, monthly breakdown, trade size analysis, and cash flow.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-performance'),
    },
    {
      element: '#tour-tab-options',
      popover: {
        title: 'Options Deep Dive',
        description:
          'Options-specific analytics \u2014 strategy breakdown, seasonality patterns, roll tracking, and ML insights.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-options'),
    },
    {
      element: '#tour-tab-goals',
      popover: {
        title: 'Goals & Streaks',
        description:
          'Track your trading goals and winning/losing streaks to stay disciplined and motivated.',
        side: 'bottom',
        align: 'center',
      },
      onHighlightStarted: () => clickTab('#tour-tab-goals'),
    },
    {
      popover: {
        title: "You\u2019re All Set!",
        description:
          'Explore each tab at your own pace. You can retake this tour anytime from the menu. Happy trading!',
      },
      onHighlightStarted: () => clickTab('#tour-tab-charts'),
    },
  );

  return steps;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Manually start (or restart) the dashboard tour.
 * Called from the custom event handler and can be imported directly.
 */
export async function startDashboardTour(hasLivePortfolio: boolean): Promise<void> {
  try {
    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);
    const driverObj = driver({
      animate: true,
      overlayColor: '#000',
      overlayOpacity: 0.6,
      stagePadding: 4,
      stageRadius: 12,
      allowClose: true,
      smoothScroll: true,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Start Exploring',
      popoverClass: 'demo-tour-popover',
      onDestroyStarted: () => {
        markTourSeen();
        driverObj.destroy();
      },
      steps: getTourSteps(hasLivePortfolio),
    });
    driverObj.drive();
  } catch {
    // If driver.js fails to load, silently skip
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Dashboard guided tour hook.
 *
 * - Auto-starts for first-time users (dashboardTourSeen === false)
 * - Listens for 'startDashboardTour' custom event for manual restart
 * - Supports #tour hash trigger from cross-page navigation
 *
 * @param ready - true once dashboard data has loaded and DOM targets exist
 * @param tourSeen - whether user has already completed/skipped the tour
 * @param hasLivePortfolio - whether the Live Portfolio tab is visible
 */
export function useDashboardTour(
  ready: boolean,
  tourSeen: boolean,
  hasLivePortfolio: boolean,
) {
  const startedRef = useRef(false);
  const queryClient = useQueryClient();

  // Auto-start for first-time users
  useEffect(() => {
    if (!ready || startedRef.current) return;

    const hasHashTrigger = window.location.hash === '#tour';
    if (tourSeen && !hasHashTrigger) return;

    startedRef.current = true;

    // Clean up hash if present
    if (hasHashTrigger) {
      window.history.replaceState(null, '', '/dashboard');
    }

    const timer = setTimeout(async () => {
      await startDashboardTour(hasLivePortfolio);
      // Optimistically update the cache so tour doesn't re-trigger
      queryClient.setQueryData<UserSettings>(
        DASHBOARD_QUERY_KEYS.userSettings,
        (old) => (old ? { ...old, dashboardTourSeen: true } : old),
      );
    }, 600);

    return () => clearTimeout(timer);
  }, [ready, tourSeen, hasLivePortfolio, queryClient]);

  // Listen for manual restart event from AppHeader
  useEffect(() => {
    const handleStartTour = () => {
      startedRef.current = false;
      startDashboardTour(hasLivePortfolio);
    };

    window.addEventListener('startDashboardTour', handleStartTour);
    return () => window.removeEventListener('startDashboardTour', handleStartTour);
  }, [hasLivePortfolio]);
}
