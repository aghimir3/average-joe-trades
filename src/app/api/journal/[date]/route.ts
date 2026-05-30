import { apiJson } from '@/lib/api/response';
/**
 * Single Journal Entry API Route
 *
 * GET /api/journal/[date] - Get journal entry for a specific date
 * DELETE /api/journal/[date] - Delete journal entry for a specific date
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ date: string }>;
}

/**
 * GET /api/journal/[date]
 * Get journal entry for a specific date
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const { date } = await params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiJson(
        { error: 'Bad Request', message: 'Date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const journalDate = new Date(date + 'T12:00:00.000Z');

    log.info({ userId, date }, 'Fetching journal entry');

    const entry = await prisma.dailyJournal.findUnique({
      where: {
        userId_date: {
          userId,
          date: journalDate,
        },
      },
    });

    if (!entry) {
      // Return empty entry template for this date
      return apiJson({
        entry: null,
        date,
      });
    }

    log.info({ userId, entryId: entry.id }, 'Journal entry found');

    return apiJson({
      entry: {
        id: entry.id,
        date: entry.date.toISOString().split('T')[0],
        preMarketNotes: entry.preMarketNotes,
        preMarketMood: entry.preMarketMood,
        watchlist: entry.watchlist,
        keyLevels: entry.keyLevels,
        hoursSlept: entry.hoursSlept ? Number(entry.hoursSlept) : null,
        sleepQuality: entry.sleepQuality,
        exercised: entry.exercised,
        caffeineIntake: entry.caffeineIntake,
        stressLevel: entry.stressLevel,
        postMarketNotes: entry.postMarketNotes,
        emotionalState: entry.emotionalState,
        followedPlan: entry.followedPlan,
        biggestWin: entry.biggestWin,
        biggestMistake: entry.biggestMistake,
        lessonsLearned: entry.lessonsLearned,
        marketCondition: entry.marketCondition,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, correlationId }, 'Failed to fetch journal entry');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/journal/[date]
 * Delete journal entry for a specific date
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const { date } = await params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiJson(
        { error: 'Bad Request', message: 'Date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const journalDate = new Date(date + 'T12:00:00.000Z');

    log.info({ userId, date }, 'Deleting journal entry');

    // Delete the entry
    const deleted = await prisma.dailyJournal.deleteMany({
      where: {
        userId,
        date: journalDate,
      },
    });

    if (deleted.count === 0) {
      return apiJson(
        { error: 'Not Found', message: 'Journal entry not found' },
        { status: 404 }
      );
    }

    log.info({ userId, date }, 'Journal entry deleted');

    return apiJson({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, correlationId }, 'Failed to delete journal entry');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}
