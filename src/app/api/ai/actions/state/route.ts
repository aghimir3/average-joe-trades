import { apiJson } from '@/lib/api/response';
/**
 * AI Action State API
 * POST /api/ai/actions/state
 * Body: { actionId, status, snoozedUntil? }
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';

const actionStateSchema = z.object({
  actionId: z.string().min(1).max(128),
  status: z.enum(['dismissed', 'snoozed', 'completed']),
  snoozedUntil: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const validated = actionStateSchema.parse(body);

    if (validated.status === 'snoozed' && !validated.snoozedUntil) {
      return apiJson(
        { error: 'Validation Error', message: 'snoozedUntil is required when status is snoozed' },
        { status: 400 }
      );
    }

    const snoozedUntil = validated.snoozedUntil ? new Date(validated.snoozedUntil) : null;

    const record = await prisma.aIActionState.upsert({
      where: { userId_actionId: { userId, actionId: validated.actionId } },
      update: {
        status: validated.status,
        snoozedUntil: validated.status === 'snoozed' ? snoozedUntil : null,
      },
      create: {
        userId,
        actionId: validated.actionId,
        status: validated.status,
        snoozedUntil: validated.status === 'snoozed' ? snoozedUntil : null,
      },
    });

    log.info({ userId, actionId: validated.actionId, status: validated.status }, 'AI action state updated');

    return apiJson({
      data: {
        id: record.id,
        actionId: record.actionId,
        status: record.status,
        snoozedUntil: record.snoozedUntil?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    log.error({ error }, 'Failed to update AI action state');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to update AI action state' },
      { status: 500 }
    );
  }
}

