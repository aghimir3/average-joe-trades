'use client';

/**
 * Auto-Refresh Hook
 *
 * Provides automatic polling for real-time data refresh during market hours.
 * Features:
 * - Configurable interval (default: 10 minutes)
 * - Optional market-hours-only mode
 * - Page visibility API support (pause when tab is hidden)
 * - Manual refresh capability
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { shouldAutoRefresh, getMarketStatus, type MarketStatus } from '@/lib/utils/market-hours';

export interface UseAutoRefreshOptions {
  /**
   * Refresh interval in milliseconds
   * @default 600000 (10 minutes)
   */
  intervalMs?: number;

  /**
   * Only auto-refresh during market hours
   * @default true
   */
  marketHoursOnly?: boolean;

  /**
   * Include extended hours (pre-market and after-hours)
   * Only applies when marketHoursOnly is true
   * @default false
   */
  includeExtendedHours?: boolean;

  /**
   * Callback to execute on each refresh
   */
  onRefresh: () => Promise<void>;

  /**
   * Whether auto-refresh is enabled
   * @default true
   */
  enabled?: boolean;
}

export interface UseAutoRefreshReturn {
  /**
   * Timestamp of the last successful refresh
   */
  lastRefresh: Date | null;

  /**
   * Whether a refresh is currently in progress
   */
  isRefreshing: boolean;

  /**
   * Current market status
   */
  marketStatus: MarketStatus;

  /**
   * Whether auto-refresh is currently active
   * (enabled + market hours check passed)
   */
  isAutoRefreshActive: boolean;

  /**
   * Time until next scheduled refresh (ms)
   */
  timeUntilNextRefresh: number | null;

  /**
   * Trigger a manual refresh
   */
  manualRefresh: () => Promise<void>;

  /**
   * Error from the last refresh attempt (if any)
   */
  lastError: Error | null;
}

const DEFAULT_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const {
    intervalMs = DEFAULT_INTERVAL,
    marketHoursOnly = true,
    includeExtendedHours = false,
    onRefresh,
    enabled = true,
  } = options;

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(() => getMarketStatus());
  const [timeUntilNextRefresh, setTimeUntilNextRefresh] = useState<number | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  // Check if auto-refresh should be active
  const isAutoRefreshActive = enabled && (!marketHoursOnly || shouldAutoRefresh(includeExtendedHours));

  // Perform refresh
  const performRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setLastError(null);

    try {
      await onRefresh();
      const now = new Date();
      setLastRefresh(now);
      lastRefreshTimeRef.current = now.getTime();
    } catch (error) {
      setLastError(error instanceof Error ? error : new Error('Refresh failed'));
      console.error('[useAutoRefresh] Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  // Manual refresh (bypasses market hours check)
  const manualRefresh = useCallback(async () => {
    await performRefresh();
  }, [performRefresh]);

  // Update market status periodically
  useEffect(() => {
    const updateMarketStatus = () => {
      setMarketStatus(getMarketStatus());
    };

    // Update immediately
    updateMarketStatus();

    // Update every minute
    const statusInterval = setInterval(updateMarketStatus, 60 * 1000);

    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  // Main auto-refresh interval
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isAutoRefreshActive) {
      setTimeUntilNextRefresh(null);
      return;
    }

    // Set up auto-refresh interval
    const scheduleRefresh = () => {
      const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
      const timeUntilNext = Math.max(0, intervalMs - timeSinceLastRefresh);

      setTimeUntilNextRefresh(timeUntilNext);

      // If enough time has passed, refresh now
      if (timeUntilNext <= 0) {
        performRefresh();
      }
    };

    // Initial check
    scheduleRefresh();

    // Set up interval for periodic checks
    intervalRef.current = setInterval(() => {
      // Re-check market hours
      if (marketHoursOnly && !shouldAutoRefresh(includeExtendedHours)) {
        return;
      }
      performRefresh();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAutoRefreshActive, intervalMs, marketHoursOnly, includeExtendedHours, performRefresh]);

  // Countdown timer
  useEffect(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (!isAutoRefreshActive || lastRefreshTimeRef.current === 0) {
      return;
    }

    countdownRef.current = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
      const timeUntilNext = Math.max(0, intervalMs - timeSinceLastRefresh);
      setTimeUntilNextRefresh(timeUntilNext);
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [isAutoRefreshActive, intervalMs]);

  // Page visibility API - pause when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAutoRefreshActive) {
        // Tab became visible - check if we should refresh
        const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh >= intervalMs) {
          performRefresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutoRefreshActive, intervalMs, performRefresh]);

  return {
    lastRefresh,
    isRefreshing,
    marketStatus,
    isAutoRefreshActive,
    timeUntilNextRefresh,
    manualRefresh,
    lastError,
  };
}
