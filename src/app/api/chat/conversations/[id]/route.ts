/**
 * Single Conversation API
 *
 * GET    /api/chat/conversations/[id] — Get conversation with messages
 * PATCH  /api/chat/conversations/[id] — Update title or archive
 * DELETE /api/chat/conversations/[id] — Delete conversation
 */

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiBadRequest, apiNotFound } from '@/lib/api/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true, title: true, isArchived: true, createdAt: true, updatedAt: true },
  });

  if (!conversation) {
    return apiNotFound();
  }

  const [messages, totalMessages] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.chatMessage.count({ where: { conversationId: id } }),
  ]);

  log.info({ conversationId: id, messageCount: messages.length }, 'get conversation');

  return apiJson({
    data: {
      ...conversation,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCallId: m.toolCallId,
        toolName: m.toolName,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: { total: totalMessages, limit, offset, hasMore: offset + limit < totalMessages },
    },
  });
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  isArchived: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  let parsed;
  try {
    const body = await req.json();
    parsed = patchSchema.parse(body);
  } catch {
    return apiBadRequest('Invalid request body.');
  }

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!conversation) return apiNotFound();

  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      ...(parsed.title !== undefined && { title: parsed.title }),
      ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
    },
  });

  log.info({ conversationId: id, changes: parsed }, 'updated conversation');

  return apiJson({
    data: {
      id: updated.id,
      title: updated.title,
      isArchived: updated.isArchived,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!conversation) return apiNotFound();

  // Cascade delete (messages are cascade-deleted via Prisma relation)
  await prisma.conversation.delete({ where: { id } });

  log.info({ conversationId: id }, 'deleted conversation');

  return new Response(null, { status: 204 });
}
