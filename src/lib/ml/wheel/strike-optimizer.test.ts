/**
 * Strike Optimizer Tests
 *
 * - DTE-aware OTM scaling regression anchors
 * - Training boundary tests (50 trades minimum)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWheelTradeSet } from './test-factories';

// Hoist mock objects so vi.mock factories can reference them
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    realizedClose: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    brokerPosition: { findFirst: vi.fn().mockResolvedValue(null) },
    wheelMLModel: {
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mock TensorFlow
vi.mock('@tensorflow/tfjs', () => ({
  sequential: vi.fn(),
  input: vi.fn(() => ({})),
  layers: {
    dense: vi.fn(() => ({ apply: vi.fn(() => ({})) })),
    dropout: vi.fn(() => ({ apply: vi.fn(() => ({})) })),
    concatenate: vi.fn(() => ({ apply: vi.fn(() => ({})) })),
  },
  model: vi.fn(() => ({
    compile: vi.fn(),
    fit: vi.fn().mockResolvedValue({
      epoch: [0, 1, 2],
      history: { loss: [0.5, 0.3, 0.2], val_loss: [0.6, 0.4, 0.3] },
    }),
    save: vi.fn(),
    predict: vi.fn(),
    dispose: vi.fn(),
    toJSON: vi.fn(),
    getWeights: vi.fn(() => []),
  })),
  tensor2d: vi.fn(() => ({ dispose: vi.fn() })),
  train: { adam: vi.fn() },
  regularizers: { l2: vi.fn() },
  callbacks: { earlyStopping: vi.fn() },
  io: { withSaveHandler: vi.fn() },
}));

// Import after mocks
import { getOtmRangeForDte } from './strike-optimizer';

// ============================================================================
// DTE-Aware OTM Scaling Tests
// ============================================================================

describe('getOtmRangeForDte', () => {
  it('returns 1-4% OTM for 0-7 day DTE', () => {
    expect(getOtmRangeForDte(0)).toEqual({ min: 0.01, max: 0.04 });
    expect(getOtmRangeForDte(7)).toEqual({ min: 0.01, max: 0.04 });
  });

  it('returns 2-6% OTM for 8-14 day DTE', () => {
    expect(getOtmRangeForDte(8)).toEqual({ min: 0.02, max: 0.06 });
    expect(getOtmRangeForDte(14)).toEqual({ min: 0.02, max: 0.06 });
  });

  it('returns 2-8% OTM for 15-21 day DTE', () => {
    expect(getOtmRangeForDte(15)).toEqual({ min: 0.02, max: 0.08 });
    expect(getOtmRangeForDte(21)).toEqual({ min: 0.02, max: 0.08 });
  });

  it('returns 3-10% OTM for 22-30 day DTE', () => {
    expect(getOtmRangeForDte(22)).toEqual({ min: 0.03, max: 0.10 });
    expect(getOtmRangeForDte(30)).toEqual({ min: 0.03, max: 0.10 });
  });

  it('returns 3-15% OTM for 31+ day DTE', () => {
    expect(getOtmRangeForDte(31)).toEqual({ min: 0.03, max: 0.15 });
    expect(getOtmRangeForDte(45)).toEqual({ min: 0.03, max: 0.15 });
    expect(getOtmRangeForDte(60)).toEqual({ min: 0.03, max: 0.15 });
  });

  it('handles exact bucket boundaries correctly', () => {
    expect(getOtmRangeForDte(7)).toEqual({ min: 0.01, max: 0.04 });
    expect(getOtmRangeForDte(8)).toEqual({ min: 0.02, max: 0.06 });
    expect(getOtmRangeForDte(14)).toEqual({ min: 0.02, max: 0.06 });
    expect(getOtmRangeForDte(15)).toEqual({ min: 0.02, max: 0.08 });
    expect(getOtmRangeForDte(21)).toEqual({ min: 0.02, max: 0.08 });
    expect(getOtmRangeForDte(22)).toEqual({ min: 0.03, max: 0.10 });
    expect(getOtmRangeForDte(30)).toEqual({ min: 0.03, max: 0.10 });
    expect(getOtmRangeForDte(31)).toEqual({ min: 0.03, max: 0.15 });
  });

  it('min < max for all DTE values', () => {
    for (let dte = 0; dte <= 90; dte++) {
      const range = getOtmRangeForDte(dte);
      expect(range.min).toBeLessThan(range.max);
      expect(range.min).toBeGreaterThan(0);
      expect(range.max).toBeGreaterThan(0);
    }
  });

  it('range width grows monotonically with DTE buckets', () => {
    const ranges = [0, 8, 15, 22, 31].map((dte) => {
      const r = getOtmRangeForDte(dte);
      return r.max - r.min;
    });

    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]).toBeGreaterThanOrEqual(ranges[i - 1]);
    }
  });

  it('negative DTE returns same as 0-7 bucket', () => {
    expect(getOtmRangeForDte(-1)).toEqual(getOtmRangeForDte(0));
    expect(getOtmRangeForDte(-30)).toEqual(getOtmRangeForDte(0));
  });
});

// ============================================================================
// Training Boundary Tests
// ============================================================================

describe('trainStrikeOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=false with 49 trades', async () => {
    const trades = createMockWheelTradeSet(49);
    mockPrisma.realizedClose.findMany.mockResolvedValue(trades);

    const { trainStrikeOptimizer } = await import('./strike-optimizer');
    const result = await trainStrikeOptimizer('test-user');

    expect(result.success).toBe(false);
    expect(result.error).toContain('50');
  });
});
