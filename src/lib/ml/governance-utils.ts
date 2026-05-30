/**
 * Shared utilities for ML model governance (used by training API routes)
 */

export function parseBaselineMetrics(
  metricsSnapshot: string | null
): { loss: number | null; accuracy: number | null } {
  if (!metricsSnapshot) return { loss: null, accuracy: null };
  try {
    const parsed = JSON.parse(metricsSnapshot) as Record<string, unknown>;
    const loss = Number(parsed.loss);
    const accuracy = Number(parsed.accuracy);
    return {
      loss: Number.isFinite(loss) ? loss : null,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
    };
  } catch {
    return { loss: null, accuracy: null };
  }
}
