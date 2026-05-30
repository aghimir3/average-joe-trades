/**
 * API Key Service
 *
 * Manages personal API keys for MCP server authentication.
 * Keys are HMAC-SHA-256 hashed before storage using AUTH_SECRET as a server-side pepper.
 * Plaintext is shown once at creation.
 * Prefix "ajt_" identifies keys, first 8 chars stored for display.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'api-keys' });

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ApiKeyCreateResult {
  id: string;
  key: string; // Full key — shown ONCE, never retrievable
  prefix: string;
}

// ============================================================================
// Constants
// ============================================================================

const KEY_PREFIX = 'ajt_';
const MAX_KEYS_PER_USER = 5;

// ============================================================================
// Internal Helpers
// ============================================================================

function hashKey(rawKey: string): string {
  const hashSecret = process.env.AUTH_SECRET;
  if (!hashSecret) {
    if (process.env.NODE_ENV === 'test') {
      return crypto.createHmac('sha256', 'test-api-key-hash-secret').update(rawKey).digest('hex');
    }
    throw new Error('AUTH_SECRET is required for API key hashing');
  }

  return crypto.createHmac('sha256', hashSecret).update(rawKey).digest('hex');
}

function generateRawKey(): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(32).toString('base64url');
  const key = `${KEY_PREFIX}${random}`;
  const hash = hashKey(key);
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
}

// ============================================================================
// Validation (called on every MCP request)
// ============================================================================

/**
 * Validate an API key and return the associated userId.
 * Returns null if the key is invalid, expired, or revoked.
 * Updates lastUsedAt asynchronously (fire-and-forget).
 */
export async function validateApiKey(
  rawKey: string,
): Promise<{ userId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const hash = hashKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, userId: true, isActive: true, expiresAt: true },
  });

  if (!apiKey) return null;
  if (!apiKey.isActive) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update lastUsedAt asynchronously — don't block the response
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      log.warn({ err, keyId: apiKey.id }, 'Failed to update lastUsedAt');
    });

  return { userId: apiKey.userId };
}

// ============================================================================
// CRUD
// ============================================================================

/** Create a new API key. Returns the full key (shown ONCE). */
export async function createApiKey(
  userId: string,
  name: string,
  expiresAt?: Date,
): Promise<ApiKeyCreateResult> {
  // Enforce max keys per user
  const count = await prisma.apiKey.count({
    where: { userId, isActive: true },
  });
  if (count >= MAX_KEYS_PER_USER) {
    throw new Error(`Maximum ${MAX_KEYS_PER_USER} active API keys allowed`);
  }

  const { key, hash, prefix } = generateRawKey();

  const record = await prisma.apiKey.create({
    data: {
      userId,
      name: name.trim().slice(0, 100),
      keyHash: hash,
      keyPrefix: prefix,
      expiresAt: expiresAt ?? null,
    },
  });

  log.info({ userId, keyId: record.id, prefix }, 'API key created');

  return { id: record.id, key, prefix };
}

/** List all API keys for a user (never returns hash). */
export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return keys;
}

/** Revoke (soft-delete) an API key. Only the owning user can revoke. */
export async function revokeApiKey(
  userId: string,
  keyId: string,
): Promise<void> {
  const result = await prisma.apiKey.updateMany({
    where: { id: keyId, userId },
    data: { isActive: false },
  });

  if (result.count === 0) {
    throw new Error('API key not found');
  }

  log.info({ userId, keyId }, 'API key revoked');
}
