/**
 * API Keys Management
 *
 * GET    /api/settings/api-keys  - List user's API keys
 * POST   /api/settings/api-keys  - Generate a new API key
 * DELETE  /api/settings/api-keys  - Revoke an API key by ID
 */

import { NextResponse } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiOk, apiCreated, apiBadRequest, apiInternalError } from '@/lib/api/response';
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/services/api-keys';
import { apiKeyRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { z } from 'zod';

// ============================================================================
// GET — List API keys
// ============================================================================

export async function GET(): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const keys = await listApiKeys(userId);

    return apiOk(keys);
  } catch (err) {
    log.error({ err }, 'Failed to list API keys');
    return apiInternalError('Failed to list API keys');
  }
}

// ============================================================================
// POST — Create API key
// ============================================================================

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    const rateLimit = apiKeyRateLimiter.check(userId);
    if (!rateLimit.success) return rateLimitResponse(rateLimit.remaining, rateLimit.resetMs);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest('Invalid request', parsed.error.flatten());
    }

    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : undefined;

    const result = await createApiKey(userId, parsed.data.name, expiresAt);

    log.info({ userId, keyId: result.id }, 'API key created');

    return apiCreated(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create API key';
    if (message.includes('Maximum')) {
      return apiBadRequest(message);
    }
    log.error({ err }, 'Failed to create API key');
    return apiInternalError('Failed to create API key');
  }
}

// ============================================================================
// DELETE — Revoke API key
// ============================================================================

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    const rateLimit = apiKeyRateLimiter.check(userId);
    if (!rateLimit.success) return rateLimitResponse(rateLimit.remaining, rateLimit.resetMs);

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest('Invalid request', parsed.error.flatten());
    }

    await revokeApiKey(userId, parsed.data.id);

    log.info({ userId, keyId: parsed.data.id }, 'API key revoked');

    return apiJson({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to revoke API key';
    if (message.includes('not found')) {
      return apiBadRequest(message);
    }
    log.error({ err }, 'Failed to revoke API key');
    return apiInternalError('Failed to revoke API key');
  }
}
