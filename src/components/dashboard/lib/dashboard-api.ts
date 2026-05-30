import { parseApiJson, apiData, apiDataOr, apiMessage } from '@/lib/api/client';
/**
 * Dashboard API
 * Centralized API functions for all dashboard data fetching
 */

import { getLocalDateString } from '@/lib/utils';
import type {
  BrokerageAccount,
  SnapTradeStatus,
  DashboardStats,
  PerformanceData,
  ScatterData,
  PositionsData,
  GoalsPreviewData,
  StreaksPreviewData,
  RealtimeCheckData,
  DailySyncResult,
  QuickSyncResult,
  UserSettings,
} from './dashboard-types';

// ============================================================================
// URL Builder
// ============================================================================

export function buildUrl(base: string, accountId: string | null): string {
  if (accountId) {
    return `${base}?brokerageAccountId=${accountId}`;
  }
  return base;
}

// ============================================================================
// Account & Status Fetchers
// ============================================================================

export async function fetchBrokerageAccounts(): Promise<BrokerageAccount[]> {
  const response = await fetch('/api/accounts');
  if (!response.ok) {
    throw new Error('Failed to fetch brokerage accounts');
  }
  const data = await parseApiJson(response);
  return apiDataOr(data, []);
}

export async function fetchSnapTradeStatus(): Promise<SnapTradeStatus | null> {
  try {
    const response = await fetch('/api/sync/connect');
    if (!response.ok) {
      if (response.status === 503) return null;
      throw new Error('Failed to fetch sync status');
    }
    const data = await parseApiJson(response);
    return apiData(data);
  } catch {
    return null;
  }
}

export async function fetchUserSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) {
    return { autoSyncEnabled: false, dashboardTourSeen: false };
  }
  const data = await parseApiJson(res);
  return apiData(data);
}

// ============================================================================
// Dashboard Data Fetchers
// ============================================================================

export async function fetchDashboardStats(accountId: string | null): Promise<DashboardStats> {
  const response = await fetch(buildUrl('/api/dashboard/stats', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchPerformanceData(accountId: string | null): Promise<PerformanceData> {
  const response = await fetch(buildUrl('/api/dashboard/performance', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch performance data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchScatterData(accountId: string | null): Promise<ScatterData> {
  const response = await fetch(buildUrl('/api/dashboard/scatter', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch scatter data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchPositionsData(accountId: string | null): Promise<PositionsData> {
  const response = await fetch(buildUrl('/api/dashboard/positions', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch positions data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchGoalsPreview(accountId: string | null): Promise<GoalsPreviewData> {
  const response = await fetch(buildUrl('/api/dashboard/goals', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch goals data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchStreaksPreview(accountId: string | null): Promise<StreaksPreviewData> {
  const response = await fetch(buildUrl('/api/dashboard/streaks', accountId));
  if (!response.ok) {
    throw new Error('Failed to fetch streaks data');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

export async function fetchRealtimeCheck(accountId: string | null): Promise<RealtimeCheckData> {
  try {
    const response = await fetch(buildUrl('/api/dashboard/realtime', accountId));
    if (!response.ok) {
      return { hasRealTimeData: false, positionCount: 0 };
    }
    const result = await parseApiJson(response);
    const data = apiData<{ hasRealTimeData?: boolean; positionCount?: number }>(result);
    return {
      hasRealTimeData: data.hasRealTimeData ?? false,
      positionCount: data.positionCount ?? 0,
    };
  } catch {
    return { hasRealTimeData: false, positionCount: 0 };
  }
}

// ============================================================================
// Sync Functions
// ============================================================================

export async function triggerDailySync(): Promise<DailySyncResult> {
  const response = await fetch('/api/sync/daily', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error('Daily sync failed');
  }
  const result = await parseApiJson(response);
  return apiData(result);
}

/**
 * Quick sync - fetches only today's transactions from connected brokerages.
 * Used for pull-to-refresh to get latest trades without full re-sync.
 */
export async function syncToday(snaptradeAccountIds: string[]): Promise<QuickSyncResult> {
  if (snaptradeAccountIds.length === 0) {
    return { success: true, transactionsImported: 0 };
  }

  const today = getLocalDateString();

  const response = await fetch('/api/sync/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snaptradeAccountIds,
      startDate: today,
      endDate: today,
      refresh: true, // Request SnapTrade transaction catch-up before fetching activities
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response).catch(() => ({ message: 'Sync failed' }));
    return { success: false, error: apiMessage(error, 'Sync failed') };
  }

  const result = await parseApiJson(response);
  const data = apiData<{ totalImported?: number }>(result);
  return {
    success: true,
    transactionsImported: data.totalImported ?? 0,
  };
}

// ============================================================================
// LocalStorage Helpers
// ============================================================================

const DISMISSED_SYNC_BANNERS_KEY = 'dismissedSyncBanners';
const DAILY_SYNC_DISMISSED_KEY = 'dailySyncDismissed';

export function getDismissedBanners(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(DISMISSED_SYNC_BANNERS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

export function dismissBanner(accountId: string) {
  try {
    const dismissed = getDismissedBanners();
    dismissed.add(accountId);
    localStorage.setItem(DISMISSED_SYNC_BANNERS_KEY, JSON.stringify([...dismissed]));
  } catch {
    // localStorage might not be available
  }
}

export function isDailySyncDismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const dismissed = localStorage.getItem(DAILY_SYNC_DISMISSED_KEY);
    return dismissed === getLocalDateString();
  } catch {
    return false;
  }
}

export function dismissDailySyncBanner() {
  try {
    localStorage.setItem(DAILY_SYNC_DISMISSED_KEY, getLocalDateString());
  } catch {
    // localStorage might not be available
  }
}

// ============================================================================
// Formatters
// ============================================================================

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Query Keys
// ============================================================================

export const DASHBOARD_QUERY_KEYS = {
  userSettings: ['userSettings'] as const,
  accounts: ['brokerage-accounts'] as const,
  snaptradeStatus: ['snaptrade-status'] as const,
  stats: (accountId: string | null) => ['dashboardStats', accountId] as const,
  performance: (accountId: string | null) => ['dashboardPerformance', accountId] as const,
  scatter: (accountId: string | null) => ['dashboardScatter', accountId] as const,
  positions: (accountId: string | null) => ['dashboardPositions', accountId] as const,
  goalsPreview: (accountId: string | null) => ['dashboardGoalsPreview', accountId] as const,
  streaksPreview: (accountId: string | null) => ['dashboardStreaksPreview', accountId] as const,
  realtimeCheck: (accountId: string | null) => ['realtimeCheck', accountId] as const,
};

// ============================================================================
// Constants
// ============================================================================

export const DASHBOARD_STALE_TIME = 10 * 60 * 1000; // 10 minutes
