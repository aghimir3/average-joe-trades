import { apiJson } from '@/lib/api/response';
/**
 * PIN Management API
 *
 * POST - Set or update PIN
 * DELETE - Remove PIN
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { hashPin, validatePinFormat, verifyPin } from '@/lib/services/pin';

// ============================================================================
// SCHEMAS
// ============================================================================

const setPinSchema = z.object({
  pin: z.string().min(4).max(8),
  currentPin: z.string().min(4).max(8).optional(), // Required if PIN already set
});

const deletePinSchema = z.object({
  currentPin: z.string().min(4).max(8),
});

// ============================================================================
// POST - Set or update PIN
// ============================================================================

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const parsed = setPinSchema.safeParse(body);

    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { pin, currentPin } = parsed.data;

    // Validate PIN format
    const validation = validatePinFormat(pin);
    if (!validation.valid) {
      return apiJson(
        { error: 'Bad Request', message: validation.error },
        { status: 400 }
      );
    }

    log.info({ userId }, 'Setting screen lock PIN');

    // Get current settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // If PIN already exists, verify current PIN
    if (settings?.screenLockPinHash) {
      if (!currentPin) {
        return apiJson(
          { error: 'Bad Request', message: 'Current PIN required to change PIN' },
          { status: 400 }
        );
      }

      const isValid = await verifyPin(currentPin, settings.screenLockPinHash);
      if (!isValid) {
        return apiJson(
          { error: 'Unauthorized', message: 'Current PIN is incorrect' },
          { status: 401 }
        );
      }
    }

    // Hash the new PIN
    const hashedPin = await hashPin(pin);

    // Update or create settings
    settings = await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        autoSyncEnabled: false,
        screenLockEnabled: false,
        screenLockTimeout: 300,
        screenLockPinHash: hashedPin,
      },
      update: {
        screenLockPinHash: hashedPin,
      },
    });

    log.info({ userId }, 'Screen lock PIN set successfully');

    return apiJson({
      success: true,
      hasPinConfigured: true,
    });
  } catch (error) {
    log.error({ error }, 'Error setting PIN');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to set PIN' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Remove PIN
// ============================================================================

export async function DELETE(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const parsed = deletePinSchema.safeParse(body);

    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { currentPin } = parsed.data;

    log.info({ userId }, 'Deleting screen lock PIN');

    // Get current settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      include: {
        webauthnCredentials: {
          select: { id: true },
        },
      },
    });

    if (!settings?.screenLockPinHash) {
      return apiJson(
        { error: 'Not Found', message: 'No PIN configured' },
        { status: 404 }
      );
    }

    // Verify current PIN
    const isValid = await verifyPin(currentPin, settings.screenLockPinHash);
    if (!isValid) {
      return apiJson(
        { error: 'Unauthorized', message: 'PIN is incorrect' },
        { status: 401 }
      );
    }

    // Check if this would leave no unlock method with screen lock enabled
    if (settings.screenLockEnabled && settings.webauthnCredentials.length === 0) {
      return apiJson(
        {
          error: 'Bad Request',
          message: 'Cannot remove PIN while screen lock is enabled with no passkeys. Please disable screen lock first.',
        },
        { status: 400 }
      );
    }

    // Remove PIN
    await prisma.userSettings.update({
      where: { userId },
      data: { screenLockPinHash: null },
    });

    log.info({ userId }, 'Screen lock PIN removed');

    return apiJson({
      success: true,
      hasPinConfigured: false,
    });
  } catch (error) {
    log.error({ error }, 'Error deleting PIN');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete PIN' },
      { status: 500 }
    );
  }
}

