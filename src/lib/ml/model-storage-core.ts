/**
 * Shared model storage primitives for ML modules
 * Extracted from wheel/model-storage.ts and options/model-storage.ts
 *
 * Provides: types, cache management, weight serialization, model loading
 * Each module keeps its own Map instance and Prisma-specific queries.
 */

import * as tf from '@tensorflow/tfjs';

// ============================================================================
// Types
// ============================================================================

/** Structure stored in the modelTopology DB column */
export interface SavedModelArtifacts {
  modelTopology: unknown;
  weightSpecs: Array<{ name: string; dtype: string; shape: number[] }>;
}

/** In-memory cached model entry */
export interface CachedModel {
  model: tf.LayersModel;
  version: number;
  loadedAt: number; // timestamp
}

// ============================================================================
// Cache Management
// ============================================================================

/** Cache TTL: 30 minutes (protects against stale models in multi-server deployments) */
export const CACHE_TTL_MS = 30 * 60 * 1000;

/** Build a cache key from userId + modelType */
export function getCacheKey(userId: string, modelType: string): string {
  return `${userId}:${modelType}`;
}

/**
 * Clear cached model(s) for a user, optionally filtered by model type.
 * Disposes TF.js tensors to free GPU/CPU memory.
 */
export function clearCacheForUser(
  cache: Map<string, CachedModel>,
  userId: string,
  modelType?: string
): void {
  if (modelType) {
    const key = getCacheKey(userId, modelType);
    const cached = cache.get(key);
    if (cached) {
      cached.model.dispose();
      cache.delete(key);
    }
  } else {
    for (const [key, cached] of cache.entries()) {
      if (key.startsWith(`${userId}:`)) {
        cached.model.dispose();
        cache.delete(key);
      }
    }
  }
}

/** Clear entire model cache (for server shutdown/restart) */
export function clearEntireCache(cache: Map<string, CachedModel>): void {
  for (const cached of cache.values()) {
    cached.model.dispose();
  }
  cache.clear();
}

/**
 * Return cached model if valid (correct version + within TTL), else null.
 */
export function getValidCachedModel(
  cache: Map<string, CachedModel>,
  cacheKey: string,
  dbVersion: number
): tf.LayersModel | null {
  const cached = cache.get(cacheKey);
  if (
    cached &&
    cached.version === dbVersion &&
    Date.now() - cached.loadedAt < CACHE_TTL_MS
  ) {
    return cached.model;
  }
  return null;
}

/**
 * Store a model in cache, disposing any previously cached model for this key.
 */
export function updateCache(
  cache: Map<string, CachedModel>,
  cacheKey: string,
  model: tf.LayersModel,
  version: number
): void {
  const existing = cache.get(cacheKey);
  if (existing) {
    existing.model.dispose();
  }
  cache.set(cacheKey, { model, version, loadedAt: Date.now() });
}

// ============================================================================
// Weight Serialization
// ============================================================================

/** Convert TF.js weightData (ArrayBuffer | ArrayBuffer[] | undefined) to Buffer for SQL storage */
export function weightsToBuffer(
  weightData: ArrayBuffer | ArrayBuffer[] | undefined
): Buffer {
  if (!weightData) {
    return Buffer.alloc(0);
  }
  if (weightData instanceof ArrayBuffer) {
    return Buffer.from(weightData);
  }
  if (Array.isArray(weightData)) {
    const buffers = weightData.map((buf) => Buffer.from(buf));
    return Buffer.concat(buffers);
  }
  return Buffer.alloc(0);
}

/** Build SavedModelArtifacts from TF.js save handler output */
export function buildSavedArtifacts(artifacts: tf.io.ModelArtifacts): SavedModelArtifacts {
  return {
    modelTopology: artifacts.modelTopology,
    weightSpecs: artifacts.weightSpecs ?? [],
  };
}

// ============================================================================
// Model Loading
// ============================================================================

/** Parse the modelTopology column, handling both old (raw) and new (nested) formats */
export function parseModelTopology(
  raw: string,
  modelType: string,
  userId: string
): { modelTopology: unknown; weightSpecs: Array<{ name: string; dtype: string; shape: number[] }> | undefined } {
  const parsed = JSON.parse(raw);

  if (parsed.modelTopology && parsed.weightSpecs !== undefined) {
    return { modelTopology: parsed.modelTopology, weightSpecs: parsed.weightSpecs };
  }

  // Old format: raw modelTopology, no weightSpecs saved
  console.warn(
    `Model ${modelType} for user ${userId} uses old format without weightSpecs. Please retrain the model.`
  );
  return { modelTopology: parsed, weightSpecs: undefined };
}

/** Convert a Prisma Uint8Array/Buffer to ArrayBuffer for TF.js */
export function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

/** Load a TF.js LayersModel from parsed topology + weights */
export async function loadModelFromArtifacts(
  modelTopology: unknown,
  weightSpecs: Array<{ name: string; dtype: string; shape: number[] }> | undefined,
  weightsArrayBuffer: ArrayBuffer
): Promise<tf.LayersModel> {
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology,
      weightSpecs: weightSpecs ?? [],
      weightData: weightsArrayBuffer,
    })
  );
}
