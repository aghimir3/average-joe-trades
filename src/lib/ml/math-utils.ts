/**
 * Shared math utilities for ML modules
 * Pure functions with no external dependencies
 */

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculatePercentile(arr: number[], value: number): number {
  if (arr.length === 0) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = sorted.findIndex((v) => v >= value);
  if (index === -1) return 100;
  return (index / sorted.length) * 100;
}

export function calculateWinRate(trades: { realizedPnL: unknown }[]): number {
  if (trades.length === 0) return 0.5;
  const wins = trades.filter((t) => Number(t.realizedPnL) > 0).length;
  return wins / trades.length;
}
