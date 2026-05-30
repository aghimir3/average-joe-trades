import { apiJson } from '@/lib/api/response';
/**
 * Trade Notes API Route
 *
 * GET /api/notes - List trade notes with pagination
 * POST /api/notes - Create a new trade note
 * PATCH /api/notes - Update or upsert a note by ledgerEventId
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Validation schema for trade note
const noteSchema = z.object({
  ledgerEventId: z.string().uuid().optional().nullable(),
  realizedCloseId: z.string().uuid().optional().nullable(),
  noteType: z.enum(['entry_thesis', 'exit_review', 'adjustment', 'general']),
  content: z.string().min(1).max(4000),
  entryReason: z.string().max(1000).optional().nullable(),
  exitReason: z.string().max(1000).optional().nullable(),
  whatWorked: z.string().max(1000).optional().nullable(),
  whatDidntWork: z.string().max(1000).optional().nullable(),
  emotionAtEntry: z.enum(['confident', 'uncertain', 'fomo', 'fearful']).optional().nullable(),
  emotionAtExit: z.enum(['satisfied', 'regretful', 'relieved', 'frustrated']).optional().nullable(),
  tradeRating: z.number().int().min(1).max(5).optional().nullable(),
});

/**
 * GET /api/notes
 * List trade notes with pagination and optional filtering
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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;
    const ledgerEventId = searchParams.get('ledgerEventId');
    const realizedCloseId = searchParams.get('realizedCloseId');
    const noteType = searchParams.get('noteType');

    log.info({ userId, page, limit, ledgerEventId, realizedCloseId, noteType }, 'Fetching notes');

    // Build where clause
    const where: {
      userId: string;
      ledgerEventId?: string;
      realizedCloseId?: string;
      noteType?: string;
    } = { userId };
    if (ledgerEventId) where.ledgerEventId = ledgerEventId;
    if (realizedCloseId) where.realizedCloseId = realizedCloseId;
    if (noteType) where.noteType = noteType;

    // Fetch notes and count
    const [notes, total] = await Promise.all([
      prisma.tradeNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tradeNote.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Format notes for response
    const formattedNotes = notes.map((note) => ({
      id: note.id,
      ledgerEventId: note.ledgerEventId,
      realizedCloseId: note.realizedCloseId,
      noteType: note.noteType,
      content: note.content,
      entryReason: note.entryReason,
      exitReason: note.exitReason,
      whatWorked: note.whatWorked,
      whatDidntWork: note.whatDidntWork,
      emotionAtEntry: note.emotionAtEntry,
      emotionAtExit: note.emotionAtExit,
      tradeRating: note.tradeRating,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }));

    log.info({ userId, count: notes.length }, 'Notes fetched');

    return apiJson({
      notes: formattedNotes,
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
    log.error({ errorMessage, correlationId }, 'Failed to fetch notes');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes
 * Create a new trade note
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
    const validated = noteSchema.parse(body);

    log.info(
      { userId, noteType: validated.noteType, ledgerEventId: validated.ledgerEventId },
      'Creating trade note'
    );

    // Create the note
    const note = await prisma.tradeNote.create({
      data: {
        userId,
        ledgerEventId: validated.ledgerEventId,
        realizedCloseId: validated.realizedCloseId,
        noteType: validated.noteType,
        content: validated.content,
        entryReason: validated.entryReason,
        exitReason: validated.exitReason,
        whatWorked: validated.whatWorked,
        whatDidntWork: validated.whatDidntWork,
        emotionAtEntry: validated.emotionAtEntry,
        emotionAtExit: validated.emotionAtExit,
        tradeRating: validated.tradeRating,
      },
    });

    log.info({ userId, noteId: note.id }, 'Trade note created');

    return apiJson(
      {
        success: true,
        note: {
          id: note.id,
          noteType: note.noteType,
          createdAt: note.createdAt.toISOString(),
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

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, correlationId }, 'Failed to create note');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

// Validation schema for updating a note
const updateNoteSchema = z.object({
  ledgerEventId: z.string().uuid(),
  content: z.string().max(4000),
  noteType: z.enum(['entry_thesis', 'exit_review', 'adjustment', 'general']).default('general'),
});

/**
 * PATCH /api/notes
 * Update or upsert a trade note by ledgerEventId
 * If content is empty, deletes the note
 */
export async function PATCH(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const body = await request.json();

    // Validate input
    const validated = updateNoteSchema.parse(body);

    log.info(
      { userId, ledgerEventId: validated.ledgerEventId },
      'Updating/upserting trade note'
    );

    // If content is empty, delete the note
    if (!validated.content.trim()) {
      await prisma.tradeNote.deleteMany({
        where: {
          userId,
          ledgerEventId: validated.ledgerEventId,
        },
      });

      log.info({ userId, ledgerEventId: validated.ledgerEventId }, 'Trade note deleted');

      return apiJson({ success: true, deleted: true });
    }

    // Upsert the note
    const existingNote = await prisma.tradeNote.findFirst({
      where: {
        userId,
        ledgerEventId: validated.ledgerEventId,
      },
    });

    let note;
    if (existingNote) {
      // Update existing
      note = await prisma.tradeNote.update({
        where: { id: existingNote.id },
        data: {
          content: validated.content,
          noteType: validated.noteType,
        },
      });
      log.info({ userId, noteId: note.id }, 'Trade note updated');
    } else {
      // Create new
      note = await prisma.tradeNote.create({
        data: {
          userId,
          ledgerEventId: validated.ledgerEventId,
          noteType: validated.noteType,
          content: validated.content,
        },
      });
      log.info({ userId, noteId: note.id }, 'Trade note created via upsert');
    }

    return apiJson({
      success: true,
      note: {
        id: note.id,
        content: note.content,
        noteType: note.noteType,
        updatedAt: note.updatedAt.toISOString(),
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
    log.error({ errorMessage, correlationId }, 'Failed to update note');

    return apiJson(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}

