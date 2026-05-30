/**
 * Rate Limiter Unit Tests
 *
 * Tests for the token bucket rate limiter used by MCP, imports, and sync.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { RateLimiter } from '@/lib/security/rate-limit';

describe('RateLimiter', () => {
  const limiterInstances: RateLimiter[] = [];

  function createLimiter(config: { maxTokens: number; refillRate: number; refillIntervalMs: number }) {
    const limiter = new RateLimiter(config);
    limiterInstances.push(limiter);
    return limiter;
  }

  afterEach(() => {
    for (const limiter of limiterInstances) {
      limiter.dispose();
    }
    limiterInstances.length = 0;
  });

  describe('basic token bucket behavior', () => {
    it('should allow requests up to maxTokens', () => {
      const limiter = createLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('user1');
        expect(result.success).toBe(true);
      }
    });

    it('should deny request after tokens exhausted', () => {
      const limiter = createLimiter({ maxTokens: 3, refillRate: 1, refillIntervalMs: 60000 });

      // Use all tokens
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      // Next should fail
      const result = limiter.check('user1');
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track remaining tokens correctly', () => {
      const limiter = createLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 60000 });

      const r1 = limiter.check('user1');
      expect(r1.remaining).toBe(4);

      const r2 = limiter.check('user1');
      expect(r2.remaining).toBe(3);

      const r3 = limiter.check('user1');
      expect(r3.remaining).toBe(2);
    });
  });

  describe('user isolation', () => {
    it('should track different users independently', () => {
      const limiter = createLimiter({ maxTokens: 2, refillRate: 1, refillIntervalMs: 60000 });

      // Exhaust user1
      limiter.check('user1');
      limiter.check('user1');
      const r1 = limiter.check('user1');
      expect(r1.success).toBe(false);

      // user2 should still have tokens
      const r2 = limiter.check('user2');
      expect(r2.success).toBe(true);
      expect(r2.remaining).toBe(1);
    });

    it('should not leak tokens between users', () => {
      const limiter = createLimiter({ maxTokens: 3, refillRate: 1, refillIntervalMs: 60000 });

      limiter.check('userA');
      limiter.check('userA');

      // userB should have full tokens
      const result = limiter.check('userB');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2); // 3 - 1 = 2
    });
  });

  describe('first request', () => {
    it('should create bucket with full tokens on first request', () => {
      const limiter = createLimiter({ maxTokens: 10, refillRate: 1, refillIntervalMs: 1000 });

      const result = limiter.check('new-user');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1
    });
  });

  describe('resetMs calculation', () => {
    it('should return a positive resetMs value', () => {
      const limiter = createLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });

      const result = limiter.check('user1');
      expect(result.resetMs).toBeGreaterThan(0);
      expect(result.resetMs).toBeLessThanOrEqual(1000);
    });
  });

  describe('MCP rate limiter config', () => {
    it('should allow 120 requests per minute (MCP config)', () => {
      // Simulate the MCP config: 120 maxTokens, 2/sec refill
      const limiter = createLimiter({ maxTokens: 120, refillRate: 2, refillIntervalMs: 1000 });

      // Should allow first 120 requests
      for (let i = 0; i < 120; i++) {
        const result = limiter.check('mcp-user');
        expect(result.success).toBe(true);
      }

      // 121st should fail
      const result = limiter.check('mcp-user');
      expect(result.success).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear the cleanup interval', () => {
      const limiter = createLimiter({ maxTokens: 5, refillRate: 1, refillIntervalMs: 1000 });
      // Should not throw
      limiter.dispose();
      limiter.dispose(); // Double dispose should be safe
    });
  });
});
