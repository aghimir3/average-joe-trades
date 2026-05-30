import { apiJson } from '@/lib/api/response';
/**
 * Daily Journal API Route
 *
 * GET /api/journal - List daily journal entries with pagination
 * POST /api/journal - Create or update a daily journal entry
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Validation schema for journal entry
const journalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  // Pre-market fields
  preMarketNotes: z.string().max(4000).optional().nullable(),
  preMarketMood: z.enum(['confident', 'neutral', 'cautious', 'anxious']).optional().nullable(),
  watchlist: z.string().max(1000).optional().nullable(),
  keyLevels: z.string().max(1000).optional().nullable(),
  // Health & wellness
  hoursSlept: z.number().min(0).max(24).optional().nullable(),
  sleepQuality: z.enum(['excellent', 'good', 'fair', 'poor']).optional().nullable(),
  exercised: z.boolean().optional().nullable(),
  caffeineIntake: z.enum(['none', 'light', 'moderate', 'heavy']).optional().nullable(),
  stressLevel: z.number().int().min(1).max(10).optional().nullable(),
  // Post-market fields
  postMarketNotes: z.string().max(4000).optional().nullable(),
  emotionalState: z
    .enum(['calm', 'disciplined', 'frustrated', 'greedy', 'fearful'])
    .optional()
    .nullable(),
  followedPlan: z.boolean().optional().nullable(),
  biggestWin: z.string().max(500).optional().nullable(),
  biggestMistake: z.string().max(500).optional().nullable(),
  lessonsLearned: z.string().max(2000).optional().nullable(),
  // Market conditions
  marketCondition: z
    .enum(['bullish', 'bearish', 'choppy', 'trending', 'ranging'])
    .optional()
    .nullable(),
});

/**
 * GET /api/journal
 * List daily journal entries with pagination
 */
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));
    const skip = (page - 1) * limit;

    // Optional date filter
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    log.info({ userId, page, limit, startDate, endDate }, 'Fetching journal entries');

    // Build where clause
    const where: { userId: string; date?: { gte?: Date; lte?: Date } } = { userId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Fetch entries and count
    const [entries, total] = await Promise.all([
      prisma.dailyJournal.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dailyJournal.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Format entries for response
    const formattedEntries = entries.map((entry) => ({
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
    }));

    log.info({ userId, count: entries.length }, 'Journal entries fetched');

    return apiJson({
      entries: formattedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, correlationId }, 'Failed to fetch journal entries');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/journal
 * Create or update a daily journal entry (upsert by date)
 */
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const body = await request.json();

    // Validate input
    const validated = journalSchema.parse(body);
    const journalDate = new Date(validated.date + 'T12:00:00.000Z');

    log.info({ userId, date: validated.date }, 'Creating/updating journal entry');

    // Upsert the journal entry
    const entry = await prisma.dailyJournal.upsert({
      where: {
        userId_date: {
          userId,
          date: journalDate,
        },
      },
      update: {
        preMarketNotes: validated.preMarketNotes,
        preMarketMood: validated.preMarketMood,
        watchlist: validated.watchlist,
        keyLevels: validated.keyLevels,
        hoursSlept: validated.hoursSlept,
        sleepQuality: validated.sleepQuality,
        exercised: validated.exercised,
        caffeineIntake: validated.caffeineIntake,
        stressLevel: validated.stressLevel,
        postMarketNotes: validated.postMarketNotes,
        emotionalState: validated.emotionalState,
        followedPlan: validated.followedPlan,
        biggestWin: validated.biggestWin,
        biggestMistake: validated.biggestMistake,
        lessonsLearned: validated.lessonsLearned,
        marketCondition: validated.marketCondition,
      },
      create: {
        userId,
        date: journalDate,
        preMarketNotes: validated.preMarketNotes,
        preMarketMood: validated.preMarketMood,
        watchlist: validated.watchlist,
        keyLevels: validated.keyLevels,
        hoursSlept: validated.hoursSlept,
        sleepQuality: validated.sleepQuality,
        exercised: validated.exercised,
        caffeineIntake: validated.caffeineIntake,
        stressLevel: validated.stressLevel,
        postMarketNotes: validated.postMarketNotes,
        emotionalState: validated.emotionalState,
        followedPlan: validated.followedPlan,
        biggestWin: validated.biggestWin,
        biggestMistake: validated.biggestMistake,
        lessonsLearned: validated.lessonsLearned,
        marketCondition: validated.marketCondition,
      },
    });

    log.info({ userId, entryId: entry.id }, 'Journal entry saved');

    return apiJson({
      success: true,
      entry: {
        id: entry.id,
        date: entry.date.toISOString().split('T')[0],
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, correlationId }, 'Failed to save journal entry');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

