/**
 * Feature Store Service
 * Centralized feature computation, caching, and retrieval for ML models
 */

import { prisma } from '@/lib/prisma';
import type { FeatureType, FeatureVector, CachedFeature } from './types';

// Feature TTL in hours
const FEATURE_TTL: Record<FeatureType, number> = {
  volatility: 24,
  momentum: 24,
  user_pattern: 168, // 1 week
  symbol_profile: 24,
  position_health: 1,
  market_regime: 24,
};

// ============================================================================
// Feature Store CRUD
// ============================================================================

/**
 * Get cached feature if valid, otherwise return null
 */
export async function getCachedFeature(
  userId: string,
  symbol: string,
  featureType: FeatureType
): Promise<CachedFeature | null> {
  const cached = await prisma.featureStore.findUnique({
    where: {
      userId_symbol_featureType: { userId, symbol, featureType },
    },
  });

  if (!cached) return null;

  // Check if expired
  if (new Date() > cached.expiresAt || !cached.isValid) {
    return null;
  }

  return {
    id: cached.id,
    userId: cached.userId,
    symbol: cached.symbol,
    featureType: cached.featureType as FeatureType,
    features: JSON.parse(cached.features) as number[],
    computedAt: cached.computedAt,
    expiresAt: cached.expiresAt,
    isValid: cached.isValid,
  };
}

/**
 * Store computed features in cache
 */
export async function cacheFeature(
  userId: string,
  feature: FeatureVector
): Promise<void> {
  const ttlHours = FEATURE_TTL[feature.featureType];
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await prisma.featureStore.upsert({
    where: {
      userId_symbol_featureType: {
        userId,
        symbol: feature.symbol,
        featureType: feature.featureType,
      },
    },
    create: {
      userId,
      symbol: feature.symbol,
      featureType: feature.featureType,
      features: JSON.stringify(feature.features),
      featureCount: feature.features.length,
      windowStart: feature.windowStart,
      windowEnd: feature.windowEnd,
      computedAt: feature.computedAt,
      expiresAt,
      isValid: true,
    },
    update: {
      features: JSON.stringify(feature.features),
      featureCount: feature.features.length,
      windowStart: feature.windowStart,
      windowEnd: feature.windowEnd,
      computedAt: feature.computedAt,
      expiresAt,
      isValid: true,
    },
  });
}

/**
 * Invalidate cached features for a symbol
 */
export async function invalidateFeatures(
  userId: string,
  symbol?: string,
  featureType?: FeatureType
): Promise<number> {
  const where: {
    userId: string;
    symbol?: string;
    featureType?: string;
  } = { userId };

  if (symbol) where.symbol = symbol;
  if (featureType) where.featureType = featureType;

  const result = await prisma.featureStore.updateMany({
    where,
    data: { isValid: false },
  });

  return result.count;
}

/**
 * Clean up expired features
 */
export async function cleanupExpiredFeatures(): Promise<number> {
  const result = await prisma.featureStore.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { isValid: false }],
    },
  });

  return result.count;
}

/**
 * Get all cached features for a user
 */
export async function getAllCachedFeatures(
  userId: string,
  symbol?: string
): Promise<CachedFeature[]> {
  const where: { userId: string; symbol?: string; isValid: boolean; expiresAt: { gt: Date } } = {
    userId,
    isValid: true,
    expiresAt: { gt: new Date() },
  };

  if (symbol) where.symbol = symbol;

  const cached = await prisma.featureStore.findMany({ where });

  return cached.map((c) => ({
    id: c.id,
    userId: c.userId,
    symbol: c.symbol,
    featureType: c.featureType as FeatureType,
    features: JSON.parse(c.features) as number[],
    computedAt: c.computedAt,
    expiresAt: c.expiresAt,
    isValid: c.isValid,
  }));
}

// ============================================================================
// Feature Computation with Caching
// ============================================================================

/**
 * Get or compute features with automatic caching
 */
export async function getOrComputeFeatures(
  userId: string,
  symbol: string,
  featureType: FeatureType,
  computeFn: () => Promise<FeatureVector>
): Promise<FeatureVector> {
  // Try cache first
  const cached = await getCachedFeature(userId, symbol, featureType);
  if (cached) {
    return {
      featureType: cached.featureType,
      symbol: cached.symbol,
      features: cached.features,
      featureNames: [], // Not stored in cache
      computedAt: cached.computedAt,
    };
  }

  // Compute fresh features
  const feature = await computeFn();

  // Cache for future use
  await cacheFeature(userId, feature);

  return feature;
}

// ============================================================================
// Batch Feature Operations
// ============================================================================

/**
 * Get features for multiple symbols
 */
export async function getBatchFeatures(
  userId: string,
  symbols: string[],
  featureType: FeatureType,
  computeFn: (symbol: string) => Promise<FeatureVector>
): Promise<Map<string, FeatureVector>> {
  const results = new Map<string, FeatureVector>();

  // Get all cached features for this type
  const cached = await prisma.featureStore.findMany({
    where: {
      userId,
      symbol: { in: symbols },
      featureType,
      isValid: true,
      expiresAt: { gt: new Date() },
    },
  });

  const cachedSymbols = new Set(cached.map((c) => c.symbol));

  // Use cached features
  for (const c of cached) {
    results.set(c.symbol, {
      featureType: c.featureType as FeatureType,
      symbol: c.symbol,
      features: JSON.parse(c.features) as number[],
      featureNames: [],
      computedAt: c.computedAt,
    });
  }

  // Compute missing features
  const missingSymbols = symbols.filter((s) => !cachedSymbols.has(s));

  for (const symbol of missingSymbols) {
    try {
      const feature = await computeFn(symbol);
      await cacheFeature(userId, feature);
      results.set(symbol, feature);
    } catch (error) {
      console.error(`Error computing features for ${symbol}:`, error);
    }
  }

  return results;
}

// ============================================================================
// Feature Statistics
// ============================================================================

/**
 * Get feature store statistics for a user
 */
export async function getFeatureStoreStats(userId: string): Promise<{
  totalFeatures: number;
  validFeatures: number;
  expiredFeatures: number;
  byType: Record<string, number>;
  bySymbol: Record<string, number>;
  oldestFeature: Date | null;
  newestFeature: Date | null;
}> {
  const [total, valid, expired, byType, bySymbol, oldest, newest] = await Promise.all([
    prisma.featureStore.count({ where: { userId } }),
    prisma.featureStore.count({ where: { userId, isValid: true, expiresAt: { gt: new Date() } } }),
    prisma.featureStore.count({
      where: { userId, OR: [{ isValid: false }, { expiresAt: { lt: new Date() } }] },
    }),
    prisma.featureStore.groupBy({
      by: ['featureType'],
      where: { userId, isValid: true },
      _count: true,
    }),
    prisma.featureStore.groupBy({
      by: ['symbol'],
      where: { userId, isValid: true },
      _count: true,
    }),
    prisma.featureStore.findFirst({
      where: { userId },
      orderBy: { computedAt: 'asc' },
      select: { computedAt: true },
    }),
    prisma.featureStore.findFirst({
      where: { userId },
      orderBy: { computedAt: 'desc' },
      select: { computedAt: true },
    }),
  ]);

  return {
    totalFeatures: total,
    validFeatures: valid,
    expiredFeatures: expired,
    byType: Object.fromEntries(byType.map((t) => [t.featureType, t._count])),
    bySymbol: Object.fromEntries(bySymbol.map((s) => [s.symbol, s._count])),
    oldestFeature: oldest?.computedAt ?? null,
    newestFeature: newest?.computedAt ?? null,
  };
}
