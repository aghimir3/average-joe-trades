/**
 * Bulk Archive Conversations API
 *
 * PATCH /api/chat/conversations/archive-all — Archive all active conversations
 */

import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiInternalError } from '@/lib/api/response';

export async function PATCH() {
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  try {
    const result = await prisma.conversation.updateMany({
      where: { userId, isArchived: false },
      data: { isArchived: true },
    });

    log.info({ archived: result.count }, 'bulk archived conversations');

    return apiJson({ data: { archived: result.count } });
  } catch (err) {
    log.error({ err }, 'failed to bulk archive conversations');
    return apiInternalError('Failed to archive conversations.');
  }
}
