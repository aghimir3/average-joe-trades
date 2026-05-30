import { apiJson } from '@/lib/api/response';
/**
 * Passkey Verification API (for unlocking screen)
 *
 * POST (without body) - Generate authentication options
 * POST (with body) - Verify authentication response
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import {
  generatePasskeyAuthOptions,
  verifyPasskeyAuth,
} from '@/lib/services/webauthn';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';

// ============================================================================
// SCHEMAS
// ============================================================================

const authResponseSchema = z.object({
  response: z.any(), // AuthenticationResponseJSON from browser
});

// ============================================================================
// POST - Generate options or verify authentication
// ============================================================================

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Check content type and body to determine action
    const contentType = request.headers.get('content-type');
    let body: Record<string, unknown> | null = null;

    if (contentType?.includes('application/json')) {
      const text = await request.text();
      if (text && text !== '{}') {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
    }

    // If no body or empty body, generate authentication options
    if (!body || (Object.keys(body).length === 0) || !body.response) {
      return await handleGenerateOptions(userId, log);
    }

    // Otherwise, verify authentication response
    return await handleVerifyAuth(userId, body, log);
  } catch (error) {
    log.error({ error }, 'Error in passkey verification');
    return apiJson(
      { error: 'Internal Server Error', message: 'Passkey verification failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function handleGenerateOptions(
  userId: string,
  log: ReturnType<typeof createRequestLogger>
) {
  log.info({ userId }, 'Generating passkey auth options');

  // Get user's credentials
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    include: {
      webauthnCredentials: {
        select: {
          credentialId: true,
          publicKey: true,
          counter: true,
          transports: true,
        },
      },
    },
  });

  if (!settings || settings.webauthnCredentials.length === 0) {
    return apiJson(
      { error: 'Not Found', message: 'No passkeys registered' },
      { status: 404 }
    );
  }

  // Generate options
  const options = await generatePasskeyAuthOptions(
    userId,
    settings.webauthnCredentials
  );

  return apiJson({ options });
}

async function handleVerifyAuth(
  userId: string,
  body: Record<string, unknown>,
  log: ReturnType<typeof createRequestLogger>
) {
  const parsed = authResponseSchema.safeParse(body);

  if (!parsed.success) {
    return apiJson(
      { error: 'Bad Request', message: 'Invalid authentication response', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const authResponse = parsed.data.response as AuthenticationResponseJSON;

  log.info({ userId }, 'Verifying passkey authentication');

  // Find the credential being used
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    include: {
      webauthnCredentials: true,
    },
  });

  if (!settings) {
    return apiJson(
      { error: 'Not Found', message: 'User settings not found' },
      { status: 404 }
    );
  }

  // Find matching credential
  const credential = settings.webauthnCredentials.find(
    (c) => c.credentialId === authResponse.id
  );

  if (!credential) {
    log.warn({ userId, credentialId: authResponse.id }, 'Credential not found');
    return apiJson(
      { error: 'Bad Request', message: 'Unknown credential' },
      { status: 400 }
    );
  }

  // Verify the authentication
  const result = await verifyPasskeyAuth(userId, authResponse, {
    credentialId: credential.credentialId,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
  });

  if (!result) {
    return apiJson(
      { error: 'Unauthorized', message: 'Authentication failed' },
      { status: 401 }
    );
  }

  // Update counter and last used time
  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: {
      counter: result.newCounter,
      lastUsedAt: new Date(),
    },
  });

  log.info({ userId, credentialId: credential.id }, 'Passkey authentication successful');

  return apiJson({
    success: true,
    verified: true,
  });
}

