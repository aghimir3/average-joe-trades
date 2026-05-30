/**
 * Conversation List/Create API
 *
 * GET  /api/chat/conversations — List user's conversations
 * POST /api/chat/conversations — Create a new conversation
 */

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiCreated, apiBadRequest } from '@/lib/api/response';

export async function GET(req: Request) {
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const archivedOnly = url.searchParams.get('archived') === 'true';

  log.info({ limit, offset }, 'list conversations');

  const where = {
    userId,
    ...(archivedOnly
      ? { isArchived: true }
      : includeArchived
        ? {}
        : { isArchived: false }),
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return apiJson({
    data: {
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        isArchived: c.isArchived,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messageCount: c._count.messages,
        lastMessage: c.messages[0]
          ? { content: c.messages[0].content.slice(0, 100), role: c.messages[0].role, createdAt: c.messages[0].createdAt.toISOString() }
          : null,
      })),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    },
  });
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  let parsed;
  try {
    const body = await req.json();
    parsed = createSchema.parse(body);
  } catch {
    return apiBadRequest('Invalid request body.');
  }

  // Check conversation limit
  const convCount = await prisma.conversation.count({ where: { userId, isArchived: false } });
  if (convCount >= 50) {
    return apiBadRequest('Maximum 50 active conversations reached. Archive or delete some first.');
  }

  const conversation = await prisma.conversation.create({
    data: { userId, title: parsed.title ?? 'New chat' },
  });

  log.info({ conversationId: conversation.id }, 'created conversation');

  return apiCreated({
    data: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
    },
  });
}
