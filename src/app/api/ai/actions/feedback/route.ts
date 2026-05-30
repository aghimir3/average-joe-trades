import { apiJson } from '@/lib/api/response';
/**
 * AI Action Feedback API
 * POST /api/ai/actions/feedback
 * Body: { actionId, feedback }
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';

const feedbackSchema = z.object({
  actionId: z.string().min(1).max(128),
  feedback: z.enum(['helpful', 'not_helpful']),
});

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const validated = feedbackSchema.parse(body);

    const record = await prisma.aIActionState.upsert({
      where: { userId_actionId: { userId, actionId: validated.actionId } },
      update: {
        feedback: validated.feedback,
        feedbackAt: new Date(),
      },
      create: {
        userId,
        actionId: validated.actionId,
        feedback: validated.feedback,
        feedbackAt: new Date(),
      },
    });

    log.info({ userId, actionId: validated.actionId, feedback: validated.feedback }, 'AI action feedback recorded');

    return apiJson({
      data: {
        id: record.id,
        actionId: record.actionId,
        feedback: record.feedback,
        feedbackAt: record.feedbackAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    log.error({ error }, 'Failed to record AI action feedback');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to record AI action feedback' },
      { status: 500 }
    );
  }
}

