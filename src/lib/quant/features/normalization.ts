import type { NormalizationStats } from './schema';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[], avg: number): number {
  if (values.length === 0) return 1;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

export function fitZScoreNormalizer<T extends Record<string, unknown>>(
  rows: T[],
  keys: (keyof T & string)[]
): NormalizationStats {
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};

  for (const key of keys) {
    const values = rows
      .map((row) => Number(row[key]))
      .filter((value) => Number.isFinite(value));
    const avg = mean(values);
    means[key] = avg;
    stds[key] = std(values, avg);
  }

  return {
    keys,
    means,
    stds,
  };
}

export function applyZScoreNormalizer<T extends Record<string, unknown>>(
  rows: T[],
  stats: NormalizationStats
): T[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = { ...row };
    for (const key of stats.keys) {
      const rawValue = Number(row[key]);
      if (!Number.isFinite(rawValue)) continue;
      const avg = stats.means[key] ?? 0;
      const deviation = stats.stds[key] ?? 1;
      normalized[key] = (rawValue - avg) / (deviation || 1);
    }
    return normalized as T;
  });
}
