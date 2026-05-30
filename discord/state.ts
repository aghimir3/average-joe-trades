import type { FilteredThreadEntry } from './types';

// ---------------------------------------------------------------------------
// In-memory runtime state (maps, sets, cooldowns)
// ---------------------------------------------------------------------------

// Deduplication — threadCreate can fire multiple times for forum threads
const recentlyProcessed = new Set<string>();

export function markProcessed(threadId: string): boolean {
  if (recentlyProcessed.has(threadId)) return false;
  recentlyProcessed.add(threadId);
  setTimeout(() => recentlyProcessed.delete(threadId), 60_000);
  return true;
}

/**
 * In-memory cache of Discord thread ID → GitHub issue number.
 * Populated when issues are created. For threads created before bot restart,
 * falls back to GitHub Search API.
 */
export const threadToIssue = new Map<string, number>();

/** Per-thread cooldown to prevent spam replies (thread ID → last reply timestamp) */
export const statusCooldowns = new Map<string, number>();
export const STATUS_COOLDOWN_MS = 60_000; // 1 minute between status replies per thread

/** Tracks threads rejected by the spam filter for re-classification on edit */
export const filteredThreads = new Map<string, FilteredThreadEntry>();
export const MAX_RECLASSIFY_ATTEMPTS = 3;
export const RECLASSIFY_COOLDOWN_MS = 2 * 60 * 1000; // 2 min between re-classification attempts
const FILTERED_THREAD_TTL_MS = 24 * 60 * 60 * 1000; // 24h expiry

/** Track which forum channels have already been tag-checked (channel ID set) */
export const forumTagsEnsured = new Set<string>();

/** Purge expired entries from filteredThreads */
export function cleanupFilteredThreads(): void {
  const now = Date.now();
  for (const [threadId, entry] of filteredThreads) {
    if (now - entry.lastAttemptAt > FILTERED_THREAD_TTL_MS) {
      filteredThreads.delete(threadId);
    }
  }
}
