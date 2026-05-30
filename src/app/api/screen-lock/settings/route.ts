import { apiJson } from '@/lib/api/response';
/**
 * Screen Lock Settings API
 *
 * GET - Retrieve current screen lock settings
 * PATCH - Update screen lock settings (enable/disable, timeout)
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const updateSettingsSchema = z.object({
  screenLockEnabled: z.boolean().optional(),
  screenLockTimeout: z.number().min(60).max(3600).optional(), // 1 min to 1 hour
});

// ============================================================================
// GET - Get screen lock settings
// ============================================================================

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Fetching screen lock settings');

    // Get or create user settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
      include: {
        webauthnCredentials: {
          select: {
            id: true,
            deviceName: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
      },
    });

    if (!settings) {
      // Create default settings
      settings = await prisma.userSettings.create({
        data: {
          userId,
          autoSyncEnabled: false,
          screenLockEnabled: false,
          screenLockTimeout: 300, // 5 minutes default
        },
        include: {
          webauthnCredentials: {
            select: {
              id: true,
              deviceName: true,
              createdAt: true,
              lastUsedAt: true,
            },
          },
        },
      });
    }

    return apiJson({
      screenLockEnabled: settings.screenLockEnabled,
      screenLockTimeout: settings.screenLockTimeout,
      hasPinConfigured: !!settings.screenLockPinHash,
      passkeys: settings.webauthnCredentials.map((cred) => ({
        id: cred.id,
        deviceName: cred.deviceName || 'Unknown Device',
        createdAt: cred.createdAt,
        lastUsedAt: cred.lastUsedAt,
      })),
    });
  } catch (error) {
    log.error({ error }, 'Error fetching screen lock settings');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update screen lock settings
// ============================================================================

export async function PATCH(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { screenLockEnabled, screenLockTimeout } = parsed.data;

    log.info({ userId, screenLockEnabled, screenLockTimeout }, 'Updating screen lock settings');

    // Get current settings to check if passkey or PIN is configured
    const currentSettings = await prisma.userSettings.findUnique({
      where: { userId },
      include: {
        webauthnCredentials: {
          select: { id: true },
        },
      },
    });

    // If enabling screen lock, require either passkey or PIN
    if (screenLockEnabled === true) {
      const hasPasskey = currentSettings?.webauthnCredentials.length ?? 0 > 0;
      const hasPin = !!currentSettings?.screenLockPinHash;

      if (!hasPasskey && !hasPin) {
        return apiJson(
          {
            error: 'Bad Request',
            message: 'Please set up a passkey or PIN before enabling screen lock',
          },
          { status: 400 }
        );
      }
    }

    // Update or create settings
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        autoSyncEnabled: false,
        screenLockEnabled: screenLockEnabled ?? false,
        screenLockTimeout: screenLockTimeout ?? 300,
      },
      update: {
        ...(screenLockEnabled !== undefined && { screenLockEnabled }),
        ...(screenLockTimeout !== undefined && { screenLockTimeout }),
      },
    });

    log.info({ userId, screenLockEnabled: settings.screenLockEnabled }, 'Screen lock settings updated');

    return apiJson({
      screenLockEnabled: settings.screenLockEnabled,
      screenLockTimeout: settings.screenLockTimeout,
    });
  } catch (error) {
    log.error({ error }, 'Error updating screen lock settings');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

