import { apiJson } from '@/lib/api/response';
/**
 * Batch Import API Route
 *
 * Multi-account import system: Upload → Process → Import ALL IN ONE
 *
 * POST /api/import
 *
 * Features:
 * - Multi-account support (requires brokerageAccountId)
 * - Multi-broker support (Robinhood now, Schwab/Fidelity later)
 * - Atomic operation (all-or-nothing)
 * - Idempotent (safe to re-run via eventHash)
 * - Fast (bulk operations, chunked writes)
 * - Full derivation (positions, P&L computed after import)
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { importBrokerFile, getImportHistory } from '@/lib/services/ledger-import';
import { BROKERS } from '@/lib/importers/types';
import { z } from 'zod';
import { importRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

/**
 * Security limits for CSV import.
 * These prevent DoS attacks via large file uploads.
 * Limits are set high to accommodate comprehensive trading histories.
 */
const MAX_CSV_SIZE_BYTES = 25 * 1024 * 1024; // 25MB max file size
const MAX_CSV_ROWS = 50000; // 50,000 rows max

/**
 * Request schema for import endpoint.
 */
const importRequestSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  content: z.string().min(1, 'File content is required'),
  brokerageAccountId: z.string().uuid('Invalid account ID'),
  broker: z.enum(BROKERS).default('robinhood'),
  skipDerivation: z.boolean().optional().default(false),
});

/**
 * POST /api/import
 *
 * Execute batch import of trades from CSV file.
 *
 * Request body:
 * {
 *   fileName: string;
 *   content: string; // Raw CSV content
 *   brokerageAccountId: string; // Target account
 *   broker?: string; // 'robinhood' | 'schwab' | 'fidelity' etc.
 *   skipDerivation?: boolean; // Skip position/P&L derivation
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   importBatchId: string;
 *   totalRows: number;
 *   parsedRows: number;
 *   skippedRows: number;
 *   inserted: number;
 *   duplicates: number;
 *   dateRange?: { start: Date; end: Date };
 *   warnings: ImportWarning[];
 *   errors: ImportError[];
 * }
 */
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Rate limit check - protect against abuse
    const rateLimit = importRateLimiter.check(userId);
    if (!rateLimit.success) {
      log.warn({ userId, remaining: rateLimit.remaining }, 'Import rate limit exceeded');
      return rateLimitResponse(rateLimit.remaining, rateLimit.resetMs);
    }

    log.info({ userId }, 'Starting CSV import');

    // Verify user exists in database (JWT session may be stale after DB wipe)
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      log.warn({ userId }, 'User not found in database - session is stale');
      return apiJson(
        {
          error: 'Session Expired',
          message: 'Your session is no longer valid. Please sign out and sign back in to continue.',
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = importRequestSchema.safeParse(body);
    if (!validation.success) {
      log.warn({ errors: validation.error.flatten() }, 'Validation failed');
      return apiJson(
        {
          error: 'Bad Request',
          message: 'Validation failed',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { fileName, content, brokerageAccountId, broker, skipDerivation } = validation.data;

    // Security: Check file size limit
    if (content.length > MAX_CSV_SIZE_BYTES) {
      log.warn(
        { fileName, contentSize: content.length, maxSize: MAX_CSV_SIZE_BYTES },
        'Import rejected - file too large'
      );
      return apiJson(
        {
          error: 'File Too Large',
          message: `Maximum file size is ${MAX_CSV_SIZE_BYTES / 1024 / 1024}MB. Your file is ${(content.length / 1024 / 1024).toFixed(2)}MB.`,
        },
        { status: 413 }
      );
    }

    // Security: Check estimated row count (rough estimate: newlines)
    const estimatedRows = (content.match(/\n/g) || []).length;
    if (estimatedRows > MAX_CSV_ROWS) {
      log.warn(
        { fileName, estimatedRows, maxRows: MAX_CSV_ROWS },
        'Import rejected - too many rows'
      );
      return apiJson(
        {
          error: 'Too Many Rows',
          message: `Maximum ${MAX_CSV_ROWS.toLocaleString()} rows allowed. Your file has approximately ${estimatedRows.toLocaleString()} rows.`,
        },
        { status: 413 }
      );
    }

    log.info({ fileName, broker, brokerageAccountId, skipDerivation, contentSize: content.length }, 'Executing import');

    // Execute import using the new multi-account pipeline
    const result = await importBrokerFile(prisma, {
      userId,
      brokerageAccountId,
      broker,
      fileName,
      content,
      skipDerivation,
    });

    log.info(
      {
        importBatchId: result.importBatchId,
        inserted: result.inserted,
        duplicates: result.duplicates,
        success: result.success,
      },
      'Import completed'
    );

    return apiJson({
      ...result,
      // Convert dates to ISO strings for JSON
      dateRange: result.dateRange
        ? {
            start: result.dateRange.start.toISOString(),
            end: result.dateRange.end.toISOString(),
          }
        : undefined,
    }, { status: result.success ? 200 : 400 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    log.error(
      {
        errorMessage,
        errorStack,
        correlationId,
      },
      'Import failed'
    );

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to import CSV',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/import
 *
 * Get import history for authenticated user.
 *
 * Query parameters:
 * - brokerageAccountId: Filter by account (optional)
 * - limit: Number of results (default 20, max 100)
 * - offset: Pagination offset (default 0)
 * - includeArchived: Include archived batches (default false)
 *
 * Response:
 * {
 *   batches: ImportBatch[];
 *   pagination: {
 *     total: number;
 *     limit: number;
 *     offset: number;
 *     hasMore: boolean;
 *   };
 * }
 */
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query parameters with strict bounds
    const url = new URL(request.url);
    const brokerageAccountId = url.searchParams.get('brokerageAccountId') || undefined;
    const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
    const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 20 : limitParam, 1), 100);
    const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    log.info({ userId, brokerageAccountId, limit, offset, includeArchived }, 'Fetching import history');

    // Fetch using the service function
    const { batches, total } = await getImportHistory(prisma, userId, {
      brokerageAccountId,
      includeArchived,
      limit,
      offset,
    });

    log.info({ count: batches.length, total }, 'Import history fetched');

    return apiJson({
      batches,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + batches.length < total,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch import history');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch import history' },
      { status: 500 }
    );
  }
}

