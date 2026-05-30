import { prisma } from '@/lib/prisma';

type CacheEntry = {
  enabled: boolean;
  expiresAt: number;
};

const SAMPLE_MODE_CACHE = new Map<string, CacheEntry>();
const SAMPLE_MODE_TTL_MS = 10_000;

/**
 * Enables sample mode for manual-first users with no imported/synced/manual trade data yet.
 * Sample mode automatically disables after first manual trade or successful broker/file import.
 */
export async function isDashboardSampleModeEnabled(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = SAMPLE_MODE_CACHE.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  const [manualAccountCount, ledgerEventCount, importOrApiBatchCount] = await Promise.all([
    prisma.brokerageAccount.count({
      where: {
        userId,
        isActive: true,
        broker: 'manual',
      },
    }),
    prisma.ledgerEvent.count({
      where: { userId },
    }),
    prisma.importBatch.count({
      where: {
        userId,
        sourceType: { in: ['import', 'api'] },
        status: { in: ['processing', 'completed'] },
      },
    }),
  ]);

  const enabled = manualAccountCount > 0 && ledgerEventCount === 0 && importOrApiBatchCount === 0;
  SAMPLE_MODE_CACHE.set(userId, {
    enabled,
    expiresAt: now + SAMPLE_MODE_TTL_MS,
  });

  return enabled;
}

export function clearDashboardSampleModeCache(userId?: string) {
  if (userId) {
    SAMPLE_MODE_CACHE.delete(userId);
    return;
  }
  SAMPLE_MODE_CACHE.clear();
}
