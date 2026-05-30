'use client';

/**
 * Demo Tour Hook
 *
 * Shows a guided walkthrough of the demo dashboard on first visit.
 * Uses driver.js (dynamically imported to avoid SSR issues).
 * Remembers dismissal in localStorage so it only shows once.
 */

import { useEffect, useRef } from 'react';

const TOUR_SEEN_KEY = 'demo-tour-seen';

function hasTourBeenSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}

/** Click a tab trigger by ID so its content becomes visible */
function clickTab(id: string): void {
  const el = document.querySelector<HTMLElement>(id);
  if (el) el.click();
}

/** Tour step definitions — shared between auto-start and manual restart */
function getTourSteps() {
  return [
    {
      popover: {
        title: 'Welcome to Average Joe Trades!',
        description: 'Let\'s take a quick tour of your trading dashboard. You can skip anytime.',
      },
    },
    {
      element: '#tour-account-selector',
      popover: {
        title: 'Filter by Account',
        description: 'Have multiple brokerage accounts? Use this selector to view data for a specific account or all accounts combined.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '#tour-stats-cards',
      popover: {
        title: 'Your Trading Overview',
        description: 'Key metrics at a glance — total P&L, open positions, win rate, profit factor, and average win/loss.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
    },
    {
      element: '#tour-tab-charts',
      popover: {
        title: 'Charts & Calendar',
        description: 'Visualize your P&L over time, view your trading calendar, scatter analysis, and time-of-day patterns.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
      onHighlightStarted: () => clickTab('#tour-tab-charts'),
    },
    {
      element: '#tour-tab-positions',
      popover: {
        title: 'Positions & Trades',
        description: 'See your current portfolio, recent trades, allocation breakdown, and position health scores.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
      onHighlightStarted: () => clickTab('#tour-tab-positions'),
    },
    {
      element: '#tour-tab-performance',
      popover: {
        title: 'Performance',
        description: 'Deep-dive into your performance — by ticker, monthly breakdown, trade size analysis, and cash flow.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
      onHighlightStarted: () => clickTab('#tour-tab-performance'),
    },
    {
      element: '#tour-tab-options',
      popover: {
        title: 'Options Deep Dive',
        description: 'Options-specific analytics — strategy breakdown, seasonality patterns, roll tracking, and ML insights.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
      onHighlightStarted: () => clickTab('#tour-tab-options'),
    },
    {
      element: '#tour-tab-goals',
      popover: {
        title: 'Goals & Streaks',
        description: 'Track your trading goals and winning/losing streaks to stay disciplined and motivated.',
        side: 'bottom' as const,
        align: 'center' as const,
      },
      onHighlightStarted: () => clickTab('#tour-tab-goals'),
    },
    {
      popover: {
        title: 'You\'re All Set!',
        description: 'That\'s the full dashboard. Explore each tab at your own pace. Happy trading!',
      },
      onHighlightStarted: () => clickTab('#tour-tab-charts'),
    },
  ];
}

/** Driver.js config shared between auto-start and manual restart */
function getDriverConfig(driverFn: typeof import('driver.js').driver) {
  const driverObj = driverFn({
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
    steps: getTourSteps(),
  });
  return driverObj;
}

/**
 * Manually (re)start the demo tour.
 * Called from the demo banner "Take a Tour" button.
 */
export async function startDemoTour(): Promise<void> {
  try {
    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);
    const driverObj = getDriverConfig(driver);
    driverObj.drive();
  } catch {
    // If driver.js fails to load, silently skip
  }
}

/**
 * Starts the demo dashboard guided tour on first visit.
 *
 * @param ready - Pass `true` once dashboard data has loaded and DOM targets exist.
 *                The tour won't start until this flips to `true`.
 */
export function useDemoTour(ready: boolean) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current || hasTourBeenSeen()) return;
    startedRef.current = true;

    // Delay so DOM elements are rendered and visible
    const timer = setTimeout(async () => {
      try {
        const [{ driver }] = await Promise.all([
          import('driver.js'),
          import('driver.js/dist/driver.css'),
        ]);
        const driverObj = getDriverConfig(driver);
        driverObj.drive();
      } catch {
        // If driver.js fails to load, silently skip the tour
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [ready]);
}
