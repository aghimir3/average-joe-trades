/**
 * Calendar feature — API fetch functions and TanStack Query keys.
 */

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';
import type {
  CalendarTradesResponse,
  CalendarDailyDetailResponse,
  TradeType,
} from './types';

// ============================================================================
// Query Keys
// ============================================================================

export const CALENDAR_QUERY_KEYS = {
  trades: (year: number, month: number, accountId: string | null) =>
    ['calendarTrades', year, month, accountId] as const,
  dailyDetail: (year: number, month: number, accountId: string | null) =>
    ['calendarDailyDetail', year, month, accountId] as const,
};

export const CALENDAR_STALE_TIME = 2 * 60 * 1000; // 2 minutes

// ============================================================================
// Fetch Functions
// ============================================================================

export async function fetchCalendarTrades(
  year: number,
  month: number,
  accountId: string | null,
  limit = 50,
  offset = 0,
): Promise<CalendarTradesResponse> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    limit: String(limit),
    offset: String(offset),
  });
  if (accountId) params.set('brokerageAccountId', accountId);

  const res = await fetch(`/api/calendar/trades?${params}`);
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to fetch calendar trades'));
  return apiData<CalendarTradesResponse>(payload);
}

export async function fetchCalendarDailyDetail(
  year: number,
  month: number,
  accountId: string | null,
): Promise<CalendarDailyDetailResponse> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (accountId) params.set('brokerageAccountId', accountId);

  const res = await fetch(`/api/calendar/daily-detail?${params}`);
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to fetch calendar daily detail'));
  return apiData<CalendarDailyDetailResponse>(payload);
}

export async function updateTradeType(
  realizedCloseId: string,
  tradeType: TradeType,
): Promise<{ tradeType: TradeType; isOverridden: boolean }> {
  const res = await fetch('/api/calendar/trade-type', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ realizedCloseId, tradeType }),
  });
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to update trade type'));
  return apiData(payload);
}
