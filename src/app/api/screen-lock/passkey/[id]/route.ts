import { apiJson } from '@/lib/api/response';
/**
 * Passkey Management API
 *
 * DELETE - Remove a registered passkey
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';

// ============================================================================
// DELETE - Remove a passkey
// ============================================================================

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id: credentialId } = await params;

    log.info({ userId, credentialId }, 'Deleting passkey');

    // Get user settings to verify ownership
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      include: {
        webauthnCredentials: {
          where: { id: credentialId },
        },
      },
    });

    if (!settings || settings.webauthnCredentials.length === 0) {
      return apiJson(
        { error: 'Not Found', message: 'Passkey not found' },
        { status: 404 }
      );
    }

    // Check if this is the last passkey and screen lock is enabled
    const allCredentials = await prisma.webAuthnCredential.count({
      where: { userSettingsId: settings.id },
    });

    if (allCredentials === 1 && settings.screenLockEnabled && !settings.screenLockPinHash) {
      return apiJson(
        {
          error: 'Bad Request',
          message: 'Cannot delete the last passkey while screen lock is enabled. Please set up a PIN first or disable screen lock.',
        },
        { status: 400 }
      );
    }

    // Delete the credential
    await prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });

    log.info({ userId, credentialId }, 'Passkey deleted');

    return apiJson({ success: true });
  } catch (error) {
    log.error({ error }, 'Error deleting passkey');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete passkey' },
      { status: 500 }
    );
  }
}
