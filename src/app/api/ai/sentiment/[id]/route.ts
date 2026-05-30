/**
 * Sentiment Entry API (single entry)
 * PUT    /api/ai/sentiment/[id] — Update a sentiment entry (logs edit history)
 * DELETE /api/ai/sentiment/[id] — Delete a sentiment entry
 */

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { apiJson } from '@/lib/api/response';

const VALID_SENTIMENTS = ['bullish', 'neutral', 'bearish'] as const;

const updateSentimentSchema = z.object({
  sentiment: z.enum(VALID_SENTIMENTS),
  notes: z.string().max(500).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id } = await params;
    const body = await request.json();
    const validated = updateSentimentSchema.parse(body);

    // Ensure entry exists and belongs to user
    const existing = await prisma.sentimentEntry.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return apiJson(
        { error: 'NOT_FOUND', message: 'Sentiment entry not found' },
        { status: 404 }
      );
    }

    // Log edit history before updating
    await prisma.sentimentEditHistory.create({
      data: {
        sentimentEntryId: existing.id,
        previousSentiment: existing.sentiment,
        previousNotes: existing.notes,
      },
    });

    const updated = await prisma.sentimentEntry.update({
      where: { id },
      data: {
        sentiment: validated.sentiment,
        notes: validated.notes ?? null,
      },
    });

    log.info({ userId, entryId: id }, 'Sentiment entry updated');

    return apiJson({
      data: {
        id: updated.id,
        sentiment: updated.sentiment,
        timeframe: updated.timeframe,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    log.error({ error }, 'Failed to update sentiment entry');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to update sentiment entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id } = await params;

    // Ensure entry exists and belongs to user
    const existing = await prisma.sentimentEntry.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return apiJson(
        { error: 'NOT_FOUND', message: 'Sentiment entry not found' },
        { status: 404 }
      );
    }

    // Delete cascades to edit history
    await prisma.sentimentEntry.delete({ where: { id } });

    log.info({ userId, entryId: id }, 'Sentiment entry deleted');

    return apiJson(null, { status: 204 });
  } catch (error) {
    log.error({ error }, 'Failed to delete sentiment entry');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete sentiment entry' },
      { status: 500 }
    );
  }
}
