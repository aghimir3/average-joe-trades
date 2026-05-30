import { describe, expect, it } from 'vitest';
import { evaluatePromotionGate } from './promotion-gates';

describe('evaluatePromotionGate', () => {
  it('returns stable when OOS, calibration, and drift all pass', () => {
    const decision = evaluatePromotionGate({
      current: {
        loss: 0.4,
        validationLoss: 0.46,
        accuracy: 0.68,
        tradesUsed: 80,
      },
      baseline: {
        loss: 0.42,
        accuracy: 0.67,
      },
      calibrationSamples: Array.from({ length: 40 }, () => ({
        confidence: 0.9,
        wasAccurate: true,
      })),
      minTrades: 20,
      minCalibrationSamples: 20,
    });

    expect(decision.pass).toBe(true);
    expect(decision.status).toBe('stable');
    expect(decision.reasons).toEqual([]);
  });

  it('fails when OOS gate does not pass generalization ratio', () => {
    const decision = evaluatePromotionGate({
      current: {
        loss: 0.4,
        validationLoss: 0.7,
        accuracy: 0.62,
        tradesUsed: 120,
      },
      calibrationSamples: Array.from({ length: 30 }, () => ({
        confidence: 0.7,
        wasAccurate: true,
      })),
    });

    expect(decision.pass).toBe(false);
    expect(decision.status).toBe('draft');
    expect(decision.oos.pass).toBe(false);
    expect(decision.reasons).toContain('oos_gate_failed');
  });

  it('fails when calibration sample size is below threshold', () => {
    const decision = evaluatePromotionGate({
      current: {
        loss: 0.3,
        validationLoss: 0.34,
        accuracy: 0.7,
        tradesUsed: 60,
      },
      calibrationSamples: [
        { confidence: 0.8, wasAccurate: true },
        { confidence: 0.4, wasAccurate: false },
      ],
      minCalibrationSamples: 10,
    });

    expect(decision.pass).toBe(false);
    expect(decision.calibration.pass).toBe(false);
    expect(decision.reasons).toContain('calibration_insufficient_samples');
  });

  it('fails when drift score exceeds threshold', () => {
    const decision = evaluatePromotionGate({
      current: {
        loss: 0.9,
        validationLoss: 1.1,
        accuracy: 0.35,
        tradesUsed: 80,
      },
      baseline: {
        loss: 0.4,
        accuracy: 0.7,
      },
      calibrationSamples: Array.from({ length: 30 }, () => ({
        confidence: 0.8,
        wasAccurate: true,
      })),
    });

    expect(decision.pass).toBe(false);
    expect(decision.drift.pass).toBe(false);
    expect(decision.drift.status).toBe('drift');
    expect(decision.reasons).toContain('drift_gate_failed');
  });

  it('normalizes percentage confidence samples', () => {
    const decision = evaluatePromotionGate({
      current: {
        loss: 0.25,
        validationLoss: 0.29,
        accuracy: 0.75,
        tradesUsed: 60,
      },
      calibrationSamples: Array.from({ length: 30 }, (_, i) => ({
        confidence: i % 2 === 0 ? 80 : 30,
        wasAccurate: i % 2 === 0,
      })),
    });

    expect(decision.calibration.sampleSize).toBe(30);
    expect(decision.calibration.brierScore).not.toBeNull();
  });
});
