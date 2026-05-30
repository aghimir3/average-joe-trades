/**
 * Sentiment Logger API
 * GET  /api/ai/sentiment — List user's sentiment entries (with edit history)
 * POST /api/ai/sentiment — Create or update a sentiment entry for a timeframe
 */

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { apiJson } from '@/lib/api/response';

const VALID_SENTIMENTS = ['bullish', 'neutral', 'bearish'] as const;
const VALID_TIMEFRAMES = ['eod', 'this_week', 'this_month', 'this_quarter'] as const;

const createSentimentSchema = z.object({
  sentiment: z.enum(VALID_SENTIMENTS),
  timeframe: z.enum(VALID_TIMEFRAMES),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    const entries = await prisma.sentimentEntry.findMany({
      where: { userId },
      include: {
        editHistory: {
          orderBy: { editedAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = entries.map((entry) => ({
      id: entry.id,
      sentiment: entry.sentiment,
      timeframe: entry.timeframe,
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      editHistory: entry.editHistory.map((h) => ({
        id: h.id,
        previousSentiment: h.previousSentiment,
        previousNotes: h.previousNotes,
        editedAt: h.editedAt.toISOString(),
      })),
    }));

    return apiJson({ data });
  } catch (error) {
    log.error({ error }, 'Failed to fetch sentiment entries');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch sentiment entries' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();
    const validated = createSentimentSchema.parse(body);

    // Check if an entry already exists for this timeframe (upsert behavior)
    const existing = await prisma.sentimentEntry.findUnique({
      where: { userId_timeframe: { userId, timeframe: validated.timeframe } },
    });

    if (existing) {
      // Log edit history before updating
      await prisma.sentimentEditHistory.create({
        data: {
          sentimentEntryId: existing.id,
          previousSentiment: existing.sentiment,
          previousNotes: existing.notes,
        },
      });

      const updated = await prisma.sentimentEntry.update({
        where: { id: existing.id },
        data: {
          sentiment: validated.sentiment,
          notes: validated.notes ?? null,
        },
      });

      log.info({ userId, timeframe: validated.timeframe }, 'Sentiment entry updated');

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
    }

    // Create new entry
    const entry = await prisma.sentimentEntry.create({
      data: {
        userId,
        sentiment: validated.sentiment,
        timeframe: validated.timeframe,
        notes: validated.notes ?? null,
      },
    });

    log.info({ userId, timeframe: validated.timeframe }, 'Sentiment entry created');

    return apiJson(
      {
        data: {
          id: entry.id,
          sentiment: entry.sentiment,
          timeframe: entry.timeframe,
          notes: entry.notes,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    log.error({ error }, 'Failed to create sentiment entry');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to create sentiment entry' },
      { status: 500 }
    );
  }
}
