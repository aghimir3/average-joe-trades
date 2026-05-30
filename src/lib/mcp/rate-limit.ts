/**
 * MCP Rate Limiter
 *
 * Dedicated rate limiter for MCP tool calls.
 * 120 requests per minute per user (2/second burst).
 */

import { RateLimiter } from '@/lib/security/rate-limit';

export const mcpRateLimiter = new RateLimiter({
  maxTokens: 120,
  refillRate: 2,
  refillIntervalMs: 1000, // 2 tokens per second
});
