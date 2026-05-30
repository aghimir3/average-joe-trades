/**
 * MCP Security Layer
 *
 * Input validation schemas, output sanitization, and account ownership checks.
 * All MCP tool inputs are validated via Zod. User-generated text fields in
 * outputs are sanitized to prevent prompt injection.
 */

import { z } from 'zod';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'mcp-security' });

// ============================================================================
// Shared Input Schemas
// ============================================================================

/** Optional account ID filter — validates UUID format */
export const accountIdSchema = z.string().uuid().optional().describe(
  'Filter by a specific brokerage account ID. Omit for all accounts.'
);

/** Symbol filter — uppercase alphanumeric + dot */
export const symbolSchema = z.string().max(20).regex(/^[A-Z0-9.]+$/i).optional().describe(
  'Stock or option ticker symbol (e.g. AAPL, TSLA).'
);

/** Date string in YYYY-MM-DD format */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(
  'Date in YYYY-MM-DD format.'
);

/** Pagination limit */
export const limitSchema = z.number().int().min(1).max(100).default(25).describe(
  'Maximum number of results to return (1-100).'
);

/** Asset type filter */
export const assetTypeSchema = z.enum(['stock', 'option', 'all']).default('all').describe(
  'Filter by asset type.'
);

// ============================================================================
// Account Ownership Validation
// ============================================================================

/**
 * Verify that an account belongs to the given user.
 * Returns true if owned, false otherwise.
 */
export async function validateAccountOwnership(
  userId: string,
  accountId: string,
): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const account = await prisma.brokerageAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true },
  });
  return account !== null;
}

/**
 * Build a Prisma where clause scoped to the user, optionally filtered by account.
 * Throws if the accountId doesn't belong to the user.
 */
export async function buildScopedWhere(
  userId: string,
  accountId?: string,
): Promise<{ userId: string; brokerageAccountId?: string }> {
  if (accountId) {
    const owned = await validateAccountOwnership(userId, accountId);
    if (!owned) {
      throw new Error('Account not found or not owned by this user');
    }
    return { userId, brokerageAccountId: accountId };
  }
  return { userId };
}

// ============================================================================
// Output Sanitization
// ============================================================================

/** Patterns commonly used for prompt injection attempts */
const INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /ignore\s+(the\s+)?above/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your|previous)\b/i,
  /new\s+instructions?\s*:/i,
  /override\s+(your|the|all)\s+/i,
  /do\s+not\s+follow\s+(the\s+)?(previous|above|prior)/i,

  // Role/identity hijacking
  /you\s+are\s+now\s+/i,
  /act\s+as\s+(a|an|if)\s+/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /switch\s+to\s+.{0,20}\s+mode/i,
  /enter\s+.{0,20}\s+mode/i,

  // System prompt / role markers
  /system\s*:/i,
  /system[_\s]?prompt/i,
  /\[system\s*\]/i,
  /\bhuman\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,

  // Model-specific injection markers
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<<SYS>>/i,
  /<<\/SYS>>/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,

  // Tool/function call injection
  /\btool_call\s*:/i,
  /\bfunction_call\s*:/i,
  /\{"tool":/i,
  /\{"function":/i,
];

/**
 * Sanitize a string value to strip potential prompt injection content.
 * Returns the original string if clean, or a filtered version.
 */
function sanitizeString(value: string): string {
  let result = value;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(result)) {
      log.warn({ pattern: pattern.source }, 'Prompt injection pattern detected in output');
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      result = result.replace(new RegExp(pattern.source, flags), '[filtered]');
    }
  }
  return result;
}

/**
 * Recursively sanitize user-generated text fields in an object.
 * Only sanitizes string values — numbers, booleans, dates are untouched.
 */
export function sanitizeOutput<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeOutput) as T;
  }

  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeOutput(value);
    }
    return result as T;
  }

  return obj;
}
