/**
 * Roll Advisor Tests
 *
 * - Training boundary tests (20 trades minimum)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWheelTradeSet } from './test-factories';

// Hoist mock objects so vi.mock factories can reference them
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    realizedClose: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    derivedPosition: { findUnique: vi.fn().mockResolvedValue(null) },
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
  tensor2d: vi.fn(() => ({ dispose: vi.fn() })),
  train: { adam: vi.fn() },
  regularizers: { l2: vi.fn() },
  callbacks: { earlyStopping: vi.fn() },
  io: { withSaveHandler: vi.fn() },
}));

// Import after mocks
import { trainRollAdvisor } from './roll-advisor';

describe('trainRollAdvisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=false with 19 trades (below minimum)', async () => {
    const trades = createMockWheelTradeSet(19);
    mockPrisma.realizedClose.findMany.mockResolvedValue(trades);

    const result = await trainRollAdvisor('test-user');

    expect(result.success).toBe(false);
    expect(result.error).toContain('20');
  });
});
