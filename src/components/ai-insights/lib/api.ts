import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';
/**
 * API Functions for AI Insights
 *
 * Centralized API calls for the AI Insights page.
 */

import type {
  UnifiedAIStatus,
  AIActionsResponse,
  AllModelsStatus,
  TrainingResult,
  TickerSuggestion,
  SentimentEntry,
  SentimentValue,
  SentimentTimeframe,
} from './types';

// ============================================================================
// Helper
// ============================================================================

function buildUrl(baseUrl: string, accountId?: string | null): string {
  if (!accountId) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}accountId=${accountId}`;
}

// ============================================================================
// Unified Status
// ============================================================================

export async function fetchUnifiedStatus(
  accountId?: string | null
): Promise<UnifiedAIStatus> {
  const response = await fetch(buildUrl('/api/ai/unified', accountId));
  if (!response.ok) throw new Error('Failed to fetch AI status');
  const data = await parseApiJson(response);
  return apiData(data);
}

// ============================================================================
// Actions
// ============================================================================

export async function fetchAIActions(
  accountId?: string | null
): Promise<AIActionsResponse> {
  const response = await fetch(buildUrl('/api/ai/actions', accountId));
  if (!response.ok) throw new Error('Failed to fetch AI actions');
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function updateActionState(params: {
  actionId: string;
  status: 'dismissed' | 'snoozed' | 'completed';
  snoozedUntil?: string;
}): Promise<void> {
  const response = await fetch('/api/ai/actions/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error('Failed to update action state');
}

export async function submitActionFeedback(params: {
  actionId: string;
  feedback: 'helpful' | 'not_helpful';
}): Promise<void> {
  const response = await fetch('/api/ai/actions/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error('Failed to submit feedback');
}

export async function fetchTickerSuggestion(
  symbol: string,
  accountId?: string | null
): Promise<TickerSuggestion> {
  const safe = symbol.trim().toUpperCase();
  if (!safe) throw new Error('Ticker is required');
  const response = await fetch(
    buildUrl(`/api/ai/ticker-suggestion?symbol=${encodeURIComponent(safe)}`, accountId)
  );
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to fetch ticker suggestion'));
  }
  const data = await parseApiJson(response);
  return apiData<TickerSuggestion>(data);
}

// ============================================================================
// Models Status
// ============================================================================

export async function fetchModelsStatus(): Promise<AllModelsStatus> {
  const response = await fetch('/api/ai/models');
  if (!response.ok) throw new Error('Failed to fetch models status');
  const data = await parseApiJson(response);
  return apiData(data);
}

// ============================================================================
// Training
// ============================================================================

export async function trainWheelModels(): Promise<TrainingResult[]> {
  const response = await fetch('/api/ml/wheel/train', {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to train wheel models');
  const data = apiData<{
    report?: { reports?: TrainingResult[] };
    reports?: TrainingResult[];
  }>(await parseApiJson(response));

  return data.report?.reports ?? data.reports ?? [];
}

export async function trainOptionsModels(): Promise<TrainingResult[]> {
  const response = await fetch('/api/ml/options/train', {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to train options models');
  const data = apiData<{
    reports?: TrainingResult[];
    results?: Array<{
      modelType: string;
      success: boolean;
      tradesUsed?: number;
      epochs?: number;
      finalLoss?: number;
      accuracy?: number;
      error?: string;
    }>;
  }>(await parseApiJson(response));

  if (Array.isArray(data.reports)) {
    return data.reports;
  }

  return (data.results ?? []).map((result) => ({
    modelType: result.modelType,
    success: result.success,
    stats: {
      tradesUsed: result.tradesUsed ?? 0,
      epochs: result.epochs ?? 0,
      finalLoss: result.finalLoss ?? 0,
      accuracy: result.accuracy,
    },
    error: result.error,
  }));
}

// ============================================================================
// Sentiment Logger
// ============================================================================

export async function fetchSentimentEntries(): Promise<SentimentEntry[]> {
  const response = await fetch('/api/ai/sentiment');
  if (!response.ok) throw new Error('Failed to fetch sentiment entries');
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function createOrUpdateSentiment(params: {
  sentiment: SentimentValue;
  timeframe: SentimentTimeframe;
  notes?: string;
}): Promise<SentimentEntry> {
  const response = await fetch('/api/ai/sentiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to save sentiment'));
  }
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function updateSentimentEntry(
  id: string,
  params: { sentiment: SentimentValue; notes?: string }
): Promise<SentimentEntry> {
  const response = await fetch(`/api/ai/sentiment/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await parseApiJson(response).catch(() => ({}));
    throw new Error(apiMessage(err, 'Failed to update sentiment'));
  }
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function deleteSentimentEntry(id: string): Promise<void> {
  const response = await fetch(`/api/ai/sentiment/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete sentiment entry');
}

