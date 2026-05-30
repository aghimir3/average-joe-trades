/**
 * Joey Chat API — Streaming Chat Endpoint
 *
 * POST /api/chat
 * Streams AI responses using Vercel AI SDK with tool calling.
 * Provider-agnostic — works with Anthropic, OpenAI, etc. via env vars.
 *
 * Uses AI SDK v6 UIMessage protocol:
 * - Client sends UIMessage[] via DefaultChatTransport
 * - Server converts to model messages via convertToModelMessages()
 * - Server returns toUIMessageStreamResponse()
 */

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { getModel, isAIConfigured, CHAT_MODELS } from '@/lib/chat/ai-provider';
import { JOEY_MODES } from '@/components/chat/lib/constants';
import { createChatTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { chatRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import { apiBadRequest, apiInternalError } from '@/lib/api/response';

const MAX_MESSAGES_TO_SEND = 30;
const MAX_CONVERSATIONS_PER_USER = 50;

export const maxDuration = 60;

export async function POST(req: Request) {
  const correlationId = crypto.randomUUID();
  const { session, response } = await checkAuthApi();
  if (response) return response;
  const userId = session.user.id;
  const log = createRequestLogger(correlationId, { userId });

  // Check AI is configured
  if (!isAIConfigured()) {
    return apiInternalError('AI chat is not configured. Set AI_API_KEY environment variable.');
  }

  // Rate limit
  const rate = chatRateLimiter.check(userId);
  if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

  // Parse body — AI SDK v6 sends { messages: UIMessage[], ...body }
  let body: { messages?: UIMessage[]; conversationId?: string; modelId?: string; modeId?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest('Invalid request body.');
  }

  const messages = body.messages;
  const conversationId = body.conversationId;
  // Validate modelId against allowed list (prevent arbitrary model injection)
  const allowedModelIds: string[] = CHAT_MODELS.map((m) => m.id);
  const modelId = body.modelId && allowedModelIds.includes(body.modelId) ? body.modelId : undefined;
  // Validate modeId against allowed list
  const allowedModeIds: string[] = JOEY_MODES.map((m) => m.id);
  const modeId = body.modeId && allowedModeIds.includes(body.modeId) ? body.modeId : undefined;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return apiBadRequest('Messages array is required.');
  }

  log.info({ conversationId, modeId, messageCount: messages.length }, 'chat request');

  // Verify conversation ownership or create new one
  let convId = conversationId;
  if (convId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: convId, userId },
      select: { id: true },
    });
    if (!conv) {
      return apiBadRequest('Conversation not found.');
    }
  } else {
    // Check conversation limit
    const convCount = await prisma.conversation.count({ where: { userId, isArchived: false } });
    if (convCount >= MAX_CONVERSATIONS_PER_USER) {
      return apiBadRequest(`Maximum ${MAX_CONVERSATIONS_PER_USER} active conversations. Archive or delete some first.`);
    }
    // Create new conversation — title from first user message
    const firstUserMsg = messages.find(m => m.role === 'user');
    const firstText = firstUserMsg?.parts?.find(
      (p): p is { type: 'text'; text: string } => p.type === 'text',
    )?.text ?? 'New chat';
    const title = firstText.slice(0, 100) + (firstText.length > 100 ? '...' : '');
    const newConv = await prisma.conversation.create({
      data: { userId, title },
    });
    convId = newConv.id;
  }

  // Only send the last N messages to keep context manageable
  const recentMessages = messages.slice(-MAX_MESSAGES_TO_SEND);
  const modelMessages = await convertToModelMessages(recentMessages);

  const result = streamText({
    model: getModel(modelId),
    system: buildSystemPrompt(modeId),
    messages: modelMessages,
    tools: createChatTools(userId),
    stopWhen: stepCountIs(5),
    onFinish: async ({ text, usage }) => {
      try {
        // Persist the latest user message
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        const lastUserText = lastUserMsg?.parts?.find(
          (p): p is { type: 'text'; text: string } => p.type === 'text',
        )?.text;

        if (lastUserText) {
          await prisma.chatMessage.create({
            data: {
              conversationId: convId!,
              role: 'user',
              content: lastUserText,
            },
          });
        }

        // Persist assistant response
        if (text) {
          await prisma.chatMessage.create({
            data: {
              conversationId: convId!,
              role: 'assistant',
              content: text,
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
            },
          });
        }

        // Update conversation timestamp
        await prisma.conversation.update({
          where: { id: convId! },
          data: { updatedAt: new Date() },
        });

        log.info(
          { conversationId: convId, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens },
          'chat response completed',
        );
      } catch (err) {
        log.error({ err }, 'Failed to persist chat messages');
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'X-Conversation-Id': convId!,
      'X-Request-Id': correlationId,
    },
  });
}
