import { apiJson } from '@/lib/api/response';
/**
 * PIN Verification API (for unlocking screen)
 *
 * POST - Verify PIN to unlock
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import {
  verifyPin,
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
} from '@/lib/services/pin';

// ============================================================================
// SCHEMAS
// ============================================================================

const verifyPinSchema = z.object({
  pin: z.string().min(4).max(8),
});

// ============================================================================
// POST - Verify PIN
// ============================================================================

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const parsed = verifyPinSchema.safeParse(body);

    if (!parsed.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid PIN format' },
        { status: 400 }
      );
    }

    const { pin } = parsed.data;

    // Check for lockout
    const lockout = checkLockout(userId);
    if (lockout.locked) {
      log.warn({ userId, remainingSeconds: lockout.remainingSeconds }, 'User is locked out');
      return apiJson(
        {
          error: 'Too Many Requests',
          message: `Too many failed attempts. Please try again in ${lockout.remainingSeconds} seconds.`,
          lockedOut: true,
          remainingSeconds: lockout.remainingSeconds,
        },
        { status: 429 }
      );
    }

    log.info({ userId }, 'Verifying screen lock PIN');

    // Get user settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings?.screenLockPinHash) {
      return apiJson(
        { error: 'Not Found', message: 'No PIN configured' },
        { status: 404 }
      );
    }

    // Verify PIN
    const isValid = await verifyPin(pin, settings.screenLockPinHash);

    if (!isValid) {
      const { attempts, lockedOut } = recordFailedAttempt(userId);
      log.warn({ userId, attempts, lockedOut }, 'PIN verification failed');

      if (lockedOut) {
        return apiJson(
          {
            error: 'Too Many Requests',
            message: 'Too many failed attempts. Please try again in 15 minutes.',
            lockedOut: true,
            remainingSeconds: 15 * 60,
          },
          { status: 429 }
        );
      }

      return apiJson(
        {
          error: 'Unauthorized',
          message: 'Incorrect PIN',
          attemptsRemaining: 5 - attempts,
        },
        { status: 401 }
      );
    }

    // Reset attempts on successful verification
    resetAttempts(userId);

    log.info({ userId }, 'PIN verification successful');

    return apiJson({
      success: true,
      verified: true,
    });
  } catch (error) {
    log.error({ error }, 'Error verifying PIN');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to verify PIN' },
      { status: 500 }
    );
  }
}

