/**
 * Analytics Tracking Hook
 *
 * Lightweight hook for tracking user activity:
 * - Session tracking (login with IP capture)
 * - Page view tracking
 * - Dashboard section view tracking
 *
 * All tracking is fire-and-forget - never blocks the UI.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';

const SESSION_TRACKED_KEY = 'analytics_session_tracked';

/**
 * Track a page or section view (fire-and-forget)
 * @param page - The page path (e.g., "/dashboard", "/positions")
 * @param section - Optional dashboard section (e.g., "charts-calendar")
 */
export function trackPageView(page: string, section?: string): void {
  // Fire-and-forget - don't await
  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, section }),
    // Use keepalive to ensure request completes even if page navigates
    keepalive: true,
  }).catch(() => {
    // Silently ignore errors - analytics should never affect UX
  });
}

/**
 * Track session login (fire-and-forget, once per browser session)
 */
function trackSession(): void {
  // Check if already tracked this browser session
  if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_TRACKED_KEY)) {
    return;
  }

  // Mark as tracked immediately to prevent duplicate calls
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_TRACKED_KEY, 'true');
  }

  // Fire-and-forget
  fetch('/api/analytics/session', {
    method: 'POST',
    keepalive: true,
  }).catch(() => {
    // Silently ignore errors
  });
}

/**
 * Hook for analytics tracking in components
 *
 * @param page - The page path for tracking
 * @returns trackSection function for tracking section views
 *
 * @example
 * ```tsx
 * function DashboardClient() {
 *   const { trackSection } = useAnalytics('/dashboard');
 *
 *   // Track when a section is expanded
 *   const handleSectionExpand = (sectionId: string) => {
 *     trackSection(sectionId);
 *   };
 * }
 * ```
 */
export function useAnalytics(page: string) {
  const trackedPage = useRef(false);

  // Track session and page view on mount
  useEffect(() => {
    // Track session (only once per browser session)
    trackSession();

    // Track page view (only once per component mount)
    if (!trackedPage.current) {
      trackedPage.current = true;
      trackPageView(page);
    }
  }, [page]);

  // Function to track section views
  const trackSection = useCallback(
    (section: string) => {
      trackPageView(page, section);
    },
    [page]
  );

  return { trackSection };
}

/**
 * Hook specifically for dashboard section tracking
 * Tracks when sections are expanded/viewed
 */
export function useDashboardAnalytics() {
  return useAnalytics('/dashboard');
}
