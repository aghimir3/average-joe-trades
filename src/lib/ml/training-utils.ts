import type * as tf from '@tensorflow/tfjs';

// ============================================================================
// Shared Training Types
// ============================================================================

export interface TrainingStats {
  tradesUsed: number;
  epochs: number;
  finalLoss: number;
  validationLoss?: number;
  accuracy?: number;
  trainingTime?: number;
  featureImportance?: Record<string, number>;
}

// ============================================================================
// Training Utilities
// ============================================================================

interface TemporalSplitOptions {
  validationFraction?: number;
  minTrainRows?: number;
  minValidationRows?: number;
}

export function temporalSplit<T>(
  rows: T[],
  options: TemporalSplitOptions = {}
): { trainRows: T[]; validationRows: T[] } {
  const validationFraction = options.validationFraction ?? 0.2;
  const minTrainRows = options.minTrainRows ?? 20;
  const minValidationRows = options.minValidationRows ?? 5;

  if (rows.length < minTrainRows + minValidationRows) {
    throw new Error(
      `Not enough rows for temporal split (need at least ${minTrainRows + minValidationRows}, got ${rows.length})`
    );
  }

  const proposedValidationRows = Math.max(
    minValidationRows,
    Math.floor(rows.length * validationFraction)
  );
  const maxValidationRows = rows.length - minTrainRows;
  const validationCount = Math.max(1, Math.min(proposedValidationRows, maxValidationRows));

  return {
    trainRows: rows.slice(0, rows.length - validationCount),
    validationRows: rows.slice(rows.length - validationCount),
  };
}

export function getLastHistoryMetric(
  history: tf.History,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const series = history.history[key];
    if (!Array.isArray(series) || series.length === 0) continue;
    const lastValue = series[series.length - 1];
    if (typeof lastValue === 'number' && Number.isFinite(lastValue)) {
      return lastValue;
    }
  }
  return undefined;
}

