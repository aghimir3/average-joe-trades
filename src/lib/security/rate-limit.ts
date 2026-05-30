/**
 * In-Memory Rate Limiter
 *
 * A simple token bucket rate limiter for protecting API endpoints.
 * Note: This is per-instance only. For production with multiple servers,
 * use Redis-based rate limiting (e.g., @upstash/ratelimit).
 *
 * @see https://en.wikipedia.org/wiki/Token_bucket
 */

import type { NextResponse } from 'next/server';
import { createChildLogger } from '@/lib/logger';
import { apiRateLimited } from '@/lib/api/response';

const log = createChildLogger({ module: 'rate-limit' });

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  /** Maximum tokens (requests) allowed in the bucket */
  maxTokens: number;
  /** How many tokens to add per refill interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
}

/**
 * In-memory rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private buckets = new Map<string, RateLimitEntry>();
  private config: RateLimiterConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    // Cleanup old entries every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request should be allowed
   * @param key - Unique identifier (e.g., userId, IP address)
   * @returns { success: boolean, remaining: number, resetMs: number }
   */
  check(key: string): { success: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      // First request from this key - create bucket with full tokens
      entry = { tokens: this.config.maxTokens, lastRefill: now };
      this.buckets.set(key, entry);
    }

    // Calculate tokens to add based on time elapsed
    const elapsed = now - entry.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.config.refillIntervalMs) * this.config.refillRate;

    if (tokensToAdd > 0) {
      entry.tokens = Math.min(this.config.maxTokens, entry.tokens + tokensToAdd);
      entry.lastRefill = now;
    }

    // Calculate time until next token
    const resetMs = this.config.refillIntervalMs - (elapsed % this.config.refillIntervalMs);

    if (entry.tokens > 0) {
      entry.tokens--;
      return { success: true, remaining: entry.tokens, resetMs };
    }

    log.warn({ key, remaining: 0 }, 'Rate limit exceeded');
    return { success: false, remaining: 0, resetMs };
  }

  /**
   * Remove stale entries (no activity for > 1 hour)
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 60 * 60 * 1000; // 1 hour
    let cleaned = 0;

    for (const [key, entry] of this.buckets) {
      if (now - entry.lastRefill > staleThreshold) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned, remaining: this.buckets.size }, 'Cleaned up stale rate limit entries');
    }
  }

  /**
   * Dispose of the rate limiter (clear cleanup interval)
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Pre-configured rate limiters for different endpoints
// These are singletons - instantiated once and reused

/**
 * Import endpoint rate limiter
 * Allows 10 imports per hour per user (generous for legitimate use)
 */
export const importRateLimiter = new RateLimiter({
  maxTokens: 10,
  refillRate: 1,
  refillIntervalMs: 6 * 60 * 1000, // 1 token per 6 minutes
});

/**
 * Bulk delete rate limiter
 * Allows 5 bulk deletes per hour per user
 */
export const bulkDeleteRateLimiter = new RateLimiter({
  maxTokens: 5,
  refillRate: 1,
  refillIntervalMs: 12 * 60 * 1000, // 1 token per 12 minutes
});

/**
 * SnapTrade sync rate limiter
 * Allows 20 syncs per hour per user
 */
export const syncRateLimiter = new RateLimiter({
  maxTokens: 20,
  refillRate: 1,
  refillIntervalMs: 3 * 60 * 1000, // 1 token per 3 minutes
});

/**
 * Generic API rate limiter
 * More generous - 100 requests per minute per user
 */
export const apiRateLimiter = new RateLimiter({
  maxTokens: 100,
  refillRate: 10,
  refillIntervalMs: 6 * 1000, // 10 tokens per 6 seconds
});

/**
 * AI endpoint limiter
 * Allows ~30 requests/minute per user for expensive multi-model aggregation routes.
 */
export const aiInsightsRateLimiter = new RateLimiter({
  maxTokens: 30,
  refillRate: 3,
  refillIntervalMs: 6 * 1000, // 3 tokens per 6 seconds
});

/**
 * ML inference limiter
 * Allows ~20 inference requests/minute per user for model prediction routes.
 */
export const mlInferenceRateLimiter = new RateLimiter({
  maxTokens: 20,
  refillRate: 2,
  refillIntervalMs: 6 * 1000, // 2 tokens per 6 seconds
});

/**
 * ML training limiter
 * Restricts expensive retraining jobs to 4 requests/hour per user.
 */
export const mlTrainingRateLimiter = new RateLimiter({
  maxTokens: 4,
  refillRate: 1,
  refillIntervalMs: 15 * 60 * 1000, // 1 token per 15 minutes
});

/**
 * Joey chat limiter
 * Allows 30 chat messages per minute per user.
 */
export const chatRateLimiter = new RateLimiter({
  maxTokens: 30,
  refillRate: 1,
  refillIntervalMs: 2000, // 1 token per 2 seconds
});

/**
 * API key management limiter
 * Allows 5 key create/revoke operations per hour per user.
 */
export const apiKeyRateLimiter = new RateLimiter({
  maxTokens: 5,
  refillRate: 1,
  refillIntervalMs: 12 * 60 * 1000, // 1 token per 12 minutes
});

/**
 * Helper function to create rate limit response
 */
export function rateLimitResponse(remaining: number, resetMs: number): NextResponse {
  const retryAfterSeconds = Math.ceil(resetMs / 1000);

  return apiRateLimited(
    'Rate limit exceeded. Please try again later.',
    { retryAfter: retryAfterSeconds },
    {
      headers: {
        'X-RateLimit-Remaining': remaining.toString(),
        'Retry-After': retryAfterSeconds.toString(),
      },
    }
  );
}
