/**
 * Vitest setup for smoke tests.
 *
 * Extends the base setup with database-specific configurations.
 * Smoke tests run against a real database, so we need different mocking strategy.
 */

import { vi, beforeAll, afterAll } from 'vitest';
import { disconnectTestPrisma } from './db';

// Silence loggers during tests unless DEBUG is set
if (!process.env.DEBUG) {
  process.env.LOG_LEVEL = 'silent';
}

// Mock crypto.randomUUID if not available
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } as Crypto;
}

// Mock logger to avoid noise in test output
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
  createRequestLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Disconnect Prisma after all tests complete
afterAll(async () => {
  await disconnectTestPrisma();
});

// Warn if DATABASE_URL looks like production
beforeAll(() => {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('production') || dbUrl.includes('prod.')) {
    throw new Error(
      'DATABASE_URL appears to point to a production database! ' +
      'Set DATABASE_URL to a test database for smoke tests.'
    );
  }
});
