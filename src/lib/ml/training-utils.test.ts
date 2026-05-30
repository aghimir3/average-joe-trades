import type * as tf from '@tensorflow/tfjs';
import { describe, expect, it } from 'vitest';
import { temporalSplit, getLastHistoryMetric } from '@/lib/ml/training-utils';

describe('training-utils', () => {
  it('temporalSplit keeps chronological order and minimum train window', () => {
    const rows = Array.from({ length: 30 }, (_, index) => index + 1);
    const split = temporalSplit(rows, {
      validationFraction: 0.2,
      minTrainRows: 20,
      minValidationRows: 5,
    });

    expect(split.trainRows.length).toBe(24);
    expect(split.validationRows.length).toBe(6);
    expect(split.trainRows.at(0)).toBe(1);
    expect(split.trainRows.at(-1)).toBe(24);
    expect(split.validationRows.at(0)).toBe(25);
    expect(split.validationRows.at(-1)).toBe(30);
  });

  it('temporalSplit throws when not enough rows exist', () => {
    const rows = Array.from({ length: 10 }, (_, index) => index + 1);
    expect(() =>
      temporalSplit(rows, {
        minTrainRows: 8,
        minValidationRows: 4,
      })
    ).toThrow('Not enough rows for temporal split');
  });

  it('getLastHistoryMetric reads the last available metric in key order', () => {
    const history = {
      history: {
        loss: [0.9, 0.7, 0.5],
        val_loss: [1.1, 0.8, 0.6],
      },
      epoch: [0, 1, 2],
    } as unknown as tf.History;

    expect(getLastHistoryMetric(history, ['accuracy', 'acc', 'loss'])).toBe(0.5);
    expect(getLastHistoryMetric(history, ['val_loss'])).toBe(0.6);
    expect(getLastHistoryMetric(history, ['accuracy'])).toBeUndefined();
  });
});
