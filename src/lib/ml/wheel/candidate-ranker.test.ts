/**
 * Candidate Ranker Tests
 *
 * - Training boundary tests (30 trades minimum)
 * - 0 trades → graceful failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWheelTradeSet } from './test-factories';

// Hoist mock objects so vi.mock factories can reference them
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    realizedClose: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    brokerPosition: { findFirst: vi.fn().mockResolvedValue(null) },
    wheelMLModel: {
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    wheelPrediction: { create: vi.fn().mockResolvedValue({ id: 'pred-1' }) },
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
  sequential: vi.fn(() => ({
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
  layers: {
    dense: vi.fn(() => ({})),
    dropout: vi.fn(() => ({})),
  },
  tensor2d: vi.fn(() => ({ dispose: vi.fn(), data: vi.fn().mockResolvedValue(new Float32Array([0.5])) })),
  train: { adam: vi.fn() },
  regularizers: { l2: vi.fn() },
  callbacks: { earlyStopping: vi.fn() },
  io: { withSaveHandler: vi.fn() },
}));

// Import after mocks
import { trainCandidateRanker } from './candidate-ranker';

describe('trainCandidateRanker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=false with 0 trades', async () => {
    mockPrisma.realizedClose.findMany.mockResolvedValue([]);

    const result = await trainCandidateRanker('test-user');

    expect(result.success).toBe(false);
    expect(result.stats.tradesUsed).toBe(0);
  });

  it('returns success=false with 29 trades (below minimum)', async () => {
    // prepareCandidateTrainingData needs 10+ trades to produce training data,
    // then trainCandidateRanker requires 30+ training examples.
    // With 29 raw trades and feature engineering overhead, we'll get fewer than 30 examples.
    const trades = createMockWheelTradeSet(29);
    mockPrisma.realizedClose.findMany.mockResolvedValue(trades);

    const result = await trainCandidateRanker('test-user');

    expect(result.success).toBe(false);
    expect(result.error).toContain('30');
  });
});
