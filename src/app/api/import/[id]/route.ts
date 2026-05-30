import { apiJson } from '@/lib/api/response';
/**
 * Import Batch Report API Route
 *
 * GET /api/import/[id] - Get details of a specific import batch
 * DELETE /api/import/[id] - Delete an import batch and its ledger events
 *
 * Supports pagination for transactions via query params:
 *   - page: Page number (1-indexed, default: 1)
 *   - limit: Items per page (default: 50, max: 100)
 *   - symbol: Filter by symbol
 *   - type: Filter by type ('stock' or 'option')
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { deleteImportBatch } from '@/lib/services/ledger-import';
import { fullRederivation } from '@/lib/services/derivation-runner';
import type { Prisma } from '@/generated/prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/import/[id]
 *
 * Get details of a specific import batch including:
 * - Batch metadata (file name, status, dates)
 * - Import metrics (rows, duplicates, etc.)
 * - Paginated transactions
 * - Breakdown by type (stocks, options)
 * - Any warnings/errors
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const { id: batchId } = await params;

    // Parse query params for pagination and filtering
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const symbolFilter = searchParams.get('symbol') || undefined;
    const typeFilter = searchParams.get('type') as 'stock' | 'option' | undefined;
    const skip = (page - 1) * limit;

    log.info({ userId, batchId, page, limit, symbolFilter, typeFilter }, 'Fetching import batch details');

    // Get the batch
    const batch = await prisma.importBatch.findFirst({
      where: { id: batchId, userId },
      include: {
        brokerageAccount: {
          select: { id: true, name: true, broker: true },
        },
      },
    });

    if (!batch) {
      return apiJson(
        { error: 'Not Found', message: 'Import batch not found' },
        { status: 404 }
      );
    }

    // Build where clause for transactions
    const baseWhere: Prisma.LedgerEventWhereInput = {
      importBatchId: batchId,
      deletedAt: null,
    };

    if (symbolFilter) {
      baseWhere.symbol = symbolFilter;
    }

    if (typeFilter === 'stock') {
      baseWhere.isOption = false;
    } else if (typeFilter === 'option') {
      baseWhere.isOption = true;
    }

    // Get paginated transactions and counts
    const [events, filteredCount, totalCount] = await Promise.all([
      prisma.ledgerEvent.findMany({
        where: baseWhere,
        orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.ledgerEvent.count({ where: baseWhere }),
      prisma.ledgerEvent.count({
        where: {
          importBatchId: batchId,
          deletedAt: null,
        },
      }),
    ]);

    // Get breakdown statistics (from all events, not just current page)
    const allEvents = await prisma.ledgerEvent.findMany({
      where: {
        importBatchId: batchId,
        deletedAt: null,
      },
      select: {
        symbol: true,
        isOption: true,
        transCode: true,
      },
    });

    // Calculate breakdowns
    let stockCount = 0;
    let optionCount = 0;
    let openingCount = 0;
    let closingCount = 0;
    const symbolCounts: Record<string, number> = {};
    const transCodeCounts: Record<string, number> = {};

    const openingCodes = ['BUY', 'BTO', 'STO'];
    const closingCodes = ['SELL', 'BTC', 'STC', 'OEXP', 'OASGN'];

    for (const event of allEvents) {
      // Count by type
      if (event.isOption) {
        optionCount++;
      } else {
        stockCount++;
      }

      // Count by opening/closing
      if (openingCodes.includes(event.transCode)) {
        openingCount++;
      } else if (closingCodes.includes(event.transCode)) {
        closingCount++;
      }

      // Count by symbol
      symbolCounts[event.symbol] = (symbolCounts[event.symbol] || 0) + 1;

      // Count by trans code
      transCodeCounts[event.transCode] = (transCodeCounts[event.transCode] || 0) + 1;
    }

    // Top symbols (sorted by count) - get all for filtering dropdown
    const allSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, count]) => ({ symbol, count }));

    const topSymbols = allSymbols.slice(0, 10);

    // Transaction code breakdown
    const transCodeBreakdown = Object.entries(transCodeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    // Parse warnings and errors from batch
    let warnings: Array<{ row?: number; message: string; symbol?: string }> = [];
    let errors: Array<{ row?: number; message: string; symbol?: string }> = [];

    if (batch.warnings) {
      try {
        warnings = JSON.parse(batch.warnings);
      } catch {
        // Ignore parse errors
      }
    }

    if (batch.skipReasons) {
      try {
        const skipReasons = JSON.parse(batch.skipReasons);
        if (Array.isArray(skipReasons)) {
          errors = skipReasons;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Format transactions for display
    const transactions = events.map((event) => ({
      id: event.id,
      activityDate: event.activityDate.toISOString(),
      symbol: event.symbol,
      transCode: event.transCode,
      quantity: Number(event.quantity),
      price: event.price ? Number(event.price) : null,
      amount: event.amount ? Number(event.amount) : null,
      isOption: event.isOption,
      optionType: event.optionType,
      strike: event.strike ? Number(event.strike) : null,
      expiration: event.expiration?.toISOString().split('T')[0] || null,
      description: event.description,
      instrument: event.instrument,
    }));

    const totalPages = Math.ceil(filteredCount / limit);

    const response = {
      batch: {
        id: batch.id,
        fileName: batch.fileName,
        broker: batch.broker,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() || null,
        completedAt: batch.completedAt?.toISOString() || null,
        account: batch.brokerageAccount,
        dateRange: {
          start: batch.tradeStartDate?.toISOString() || null,
          end: batch.tradeEndDate?.toISOString() || null,
        },
        isArchived: batch.isArchived,
        errorMessage: batch.errorMessage,
      },
      metrics: {
        totalRows: batch.totalRows,
        parsedRows: batch.parsedRows,
        validatedRows: batch.validatedRows,
        importedEvents: batch.importedEvents,
        duplicateRows: batch.duplicateRows,
        skippedRows: batch.skippedRows,
        eventCount: totalCount, // Actual count of events in DB
      },
      breakdown: {
        byType: {
          stocks: stockCount,
          options: optionCount,
        },
        byStatus: {
          opening: openingCount,
          closing: closingCount,
        },
        topSymbols,
        allSymbols, // For filter dropdown
        transCodeBreakdown,
      },
      transactions,
      pagination: {
        page,
        limit,
        totalItems: filteredCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        symbol: symbolFilter || null,
        type: typeFilter || null,
      },
      warnings,
      errors,
    };

    log.info({ batchId, totalCount, page, limit }, 'Import batch details fetched');

    return apiJson(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error(
      {
        errorMessage,
        correlationId,
      },
      'Failed to fetch import batch details'
    );

    return apiJson(
      {
        error: 'Internal Server Error',
        message: errorMessage || 'Failed to fetch import batch details',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/import/[id]
 *
 * Delete an import batch and all its associated ledger events.
 * This soft-deletes the ledger events and hard-deletes the batch.
 * After deletion, runs full re-derivation to update positions and P&L.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    const { id: batchId } = await params;

    log.info({ userId, batchId }, 'Deleting import batch');

    // Delete the batch and its events
    const result = await deleteImportBatch(prisma, batchId, userId);

    if (!result.deleted) {
      return apiJson(
        { error: 'Not Found', message: 'Import batch not found' },
        { status: 404 }
      );
    }

    log.info({ batchId, eventsDeleted: result.eventsDeleted }, 'Import batch deleted');

    // Re-derive positions and P&L after deletion
    if (result.eventsDeleted > 0) {
      log.info({ userId }, 'Running re-derivation after import deletion');
      try {
        await fullRederivation(prisma, userId);
        log.info({ userId }, 'Re-derivation completed');
      } catch (derivationError) {
        log.error({ error: derivationError }, 'Re-derivation failed after import deletion');
        // Don't fail the delete - the data is already deleted
      }
    }

    return apiJson({
      data: {
        success: true,
        eventsDeleted: result.eventsDeleted,
      },
      message: `Import batch deleted successfully. ${result.eventsDeleted} trades removed.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error(
      {
        errorMessage,
        correlationId,
      },
      'Failed to delete import batch'
    );

    return apiJson(
      {
        error: 'Internal Server Error',
        message: errorMessage || 'Failed to delete import batch',
      },
      { status: 500 }
    );
  }
}
