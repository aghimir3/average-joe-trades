/**
 * Chat API Client
 *
 * Client-side fetch functions for conversation CRUD.
 */

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';
import type { ConversationListResponse, ConversationDetail, ConversationSummary } from './types';

/** List conversations */
export async function fetchConversations(
  limit = 30,
  offset = 0,
  archivedOnly = false
): Promise<ConversationListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (archivedOnly) params.set('archived', 'true');
  const res = await fetch(`/api/chat/conversations?${params}`);
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to load conversations'));
  return apiData<ConversationListResponse>(payload);
}

/** Get a single conversation with messages */
export async function fetchConversation(
  id: string,
  limit = 50,
  offset = 0
): Promise<ConversationDetail> {
  const res = await fetch(`/api/chat/conversations/${id}?limit=${limit}&offset=${offset}`);
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to load conversation'));
  return apiData<ConversationDetail>(payload);
}

/** Create a new conversation */
export async function createConversation(title: string): Promise<ConversationSummary> {
  const res = await fetch('/api/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to create conversation'));
  return apiData<ConversationSummary>(payload);
}

/** Update conversation title or archive status */
export async function updateConversation(
  id: string,
  data: { title?: string; isArchived?: boolean }
): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const payload = await parseApiJson(res);
    throw new Error(apiMessage(payload, 'Failed to update conversation'));
  }
}

/** Delete a conversation */
export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to delete conversation');
  }
}

/** Archive all active conversations */
export async function archiveAllConversations(): Promise<{ archived: number }> {
  const res = await fetch('/api/chat/conversations/archive-all', { method: 'PATCH' });
  const payload = await parseApiJson(res);
  if (!res.ok) throw new Error(apiMessage(payload, 'Failed to archive conversations'));
  return apiData<{ archived: number }>(payload);
}
