import { apiJson } from '@/lib/api/response';
/**
 * Passkey Registration API
 *
 * POST (without body) - Generate registration options
 * POST (with body) - Verify registration response
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  type PasskeyRegistrationResult,
} from '@/lib/services/webauthn';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';

// ============================================================================
// SCHEMAS
// ============================================================================

const registrationResponseSchema = z.object({
  response: z.any(), // RegistrationResponseJSON from browser
  deviceName: z.string().max(100).optional(),
});

// ============================================================================
// POST - Generate options or verify registration
// ============================================================================

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const userEmail = session.user.email || 'user@example.com';

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

    // If no body or empty body, generate registration options
    if (!body || (Object.keys(body).length === 0) || !body.response) {
      return await handleGenerateOptions(userId, userEmail, log);
    }

    // Otherwise, verify registration response
    return await handleVerifyRegistration(userId, body, log);
  } catch (error) {
    log.error({ error }, 'Error in passkey registration');
    return apiJson(
      { error: 'Internal Server Error', message: 'Passkey registration failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function handleGenerateOptions(
  userId: string,
  userEmail: string,
  log: ReturnType<typeof createRequestLogger>
) {
  log.info({ userId }, 'Generating passkey registration options');

  // Get or create user settings
  let settings = await prisma.userSettings.findUnique({
    where: { userId },
    include: {
      webauthnCredentials: {
        select: {
          credentialId: true,
          transports: true,
        },
      },
    },
  });

  if (!settings) {
    settings = await prisma.userSettings.create({
      data: {
        userId,
        autoSyncEnabled: false,
        screenLockEnabled: false,
        screenLockTimeout: 300,
      },
      include: {
        webauthnCredentials: {
          select: {
            credentialId: true,
            transports: true,
          },
        },
      },
    });
  }

  // Generate options excluding existing credentials
  const options = await generatePasskeyRegistrationOptions(
    userId,
    userEmail,
    settings.webauthnCredentials
  );

  return apiJson({ options });
}

async function handleVerifyRegistration(
  userId: string,
  body: Record<string, unknown>,
  log: ReturnType<typeof createRequestLogger>
) {
  const parsed = registrationResponseSchema.safeParse(body);

  if (!parsed.success) {
    return apiJson(
      { error: 'Bad Request', message: 'Invalid registration response', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { response: registrationResponse, deviceName } = parsed.data;

  log.info({ userId }, 'Verifying passkey registration');

  // Verify the registration
  const result = await verifyPasskeyRegistration(
    userId,
    registrationResponse as RegistrationResponseJSON
  );

  // Check if result is an error
  if ('error' in result && result.error) {
    log.warn({ userId, reason: result.reason, details: result.details }, 'Passkey registration failed');
    return apiJson(
      { error: 'Bad Request', message: result.message, reason: result.reason, details: result.details },
      { status: 400 }
    );
  }

  // Type narrowing: result is now PasskeyRegistrationResult
  const registrationResult = result as PasskeyRegistrationResult;

  // Get user settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    return apiJson(
      { error: 'Not Found', message: 'User settings not found' },
      { status: 404 }
    );
  }

  // Store the credential
  const credential = await prisma.webAuthnCredential.create({
    data: {
      userSettingsId: settings.id,
      credentialId: registrationResult.credentialId,
      publicKey: registrationResult.publicKey,
      counter: registrationResult.counter,
      transports: registrationResult.transports,
      credentialType: registrationResult.credentialType,
      deviceName: deviceName || detectDeviceName(),
    },
  });

  log.info({ userId, credentialId: credential.id }, 'Passkey registered successfully');

  return apiJson({
    success: true,
    credential: {
      id: credential.id,
      deviceName: credential.deviceName,
      createdAt: credential.createdAt,
    },
  });
}

/**
 * Attempt to detect device name from user agent (best effort).
 */
function detectDeviceName(): string {
  // In a real implementation, you'd pass the user agent from the request
  // and parse it to detect the device. For now, use a generic name.
  return 'This Device';
}

