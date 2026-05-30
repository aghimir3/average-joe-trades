import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Login Nicknames API
 *
 * Allows users to set custom names for their brokerage login connections
 * (e.g., "Mine", "Wife's" instead of "Login 1", "Login 2").
 *
 * GET /api/sync/login-nicknames - Get all nicknames for user
 * POST /api/sync/login-nicknames - Set/update a nickname
 * DELETE /api/sync/login-nicknames - Delete a nickname
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const setNicknameSchema = z.object({
  brokerageAuthorizationId: z.string().min(1, 'Authorization ID is required'),
  nickname: z.string().min(1, 'Nickname is required').max(50, 'Nickname must be 50 characters or less'),
});

const deleteNicknameSchema = z.object({
  brokerageAuthorizationId: z.string().min(1, 'Authorization ID is required'),
});

/**
 * GET /api/sync/login-nicknames
 * Get all login nicknames for the current user
 */
export async function GET(): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    const nicknames = await prisma.loginNickname.findMany({
      where: { userId },
      select: {
        brokerageAuthorizationId: true,
        nickname: true,
      },
    });

    // Convert to a map for easy lookup
    const nicknameMap: Record<string, string> = {};
    for (const n of nicknames) {
      nicknameMap[n.brokerageAuthorizationId] = n.nickname;
    }

    log.debug({ userId, count: nicknames.length }, 'Retrieved login nicknames');

    return apiJson({ data: nicknameMap });
  } catch (error) {
    log.error({ error }, 'Failed to get login nicknames');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get login nicknames' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/login-nicknames
 * Set or update a nickname for a login connection
 */
export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const { brokerageAuthorizationId, nickname } = setNicknameSchema.parse(body);

    // Upsert the nickname
    const result = await prisma.loginNickname.upsert({
      where: {
        userId_brokerageAuthorizationId: {
          userId,
          brokerageAuthorizationId,
        },
      },
      update: { nickname },
      create: {
        userId,
        brokerageAuthorizationId,
        nickname,
      },
    });

    log.info({ userId, brokerageAuthorizationId, nickname }, 'Login nickname set');

    return apiJson({ data: { brokerageAuthorizationId: result.brokerageAuthorizationId, nickname: result.nickname } });
  } catch (error) {
    const log = createRequestLogger(correlationId);
    log.error({ error }, 'Failed to set login nickname');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to set login nickname' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sync/login-nicknames
 * Delete a nickname (revert to "Login X")
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const { brokerageAuthorizationId } = deleteNicknameSchema.parse(body);

    await prisma.loginNickname.deleteMany({
      where: {
        userId,
        brokerageAuthorizationId,
      },
    });

    log.info({ userId, brokerageAuthorizationId }, 'Login nickname deleted');

    return apiJson({ data: { success: true } });
  } catch (error) {
    log.error({ error }, 'Failed to delete login nickname');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete login nickname' },
      { status: 500 }
    );
  }
}

