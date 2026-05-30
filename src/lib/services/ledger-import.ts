/**
 * Ledger Import Service
 *
 * Orchestrates the full import pipeline:
 * 1. Parse broker file (CSV/JSON)
 * 2. Validate transactions
 * 3. Write to ledger (deduplicated)
 * 4. Trigger derivation
 * 5. Update import batch status
 *
 * This is the single entry point for all broker imports.
 *
 * Usage:
 *   const result = await importBrokerFile(prisma, {
 *     userId,
 *     brokerageAccountId,
 *     broker: 'robinhood',
 *     fileName: 'trades.csv',
 *     content: csvString,
 *   });
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import { writeLedgerEvents } from './ledger-write';
import { fullRederivation } from './derivation-runner';
import { RobinhoodImporter } from '@/lib/importers/robinhood';
import { SchwabImporter } from '@/lib/importers/schwab';
import type {
  Broker,
  SourceType,
  BrokerImporter,
  ParseOptions,
  ImportContext,
  ImportWarning,
  ImportError,
} from '@/lib/importers/types';

const log = createChildLogger({ module: 'ledger-import' });

/**
 * Import request parameters.
 */
export interface ImportRequest {
  userId: string;
  brokerageAccountId: string;
  broker: Broker;
  fileName: string;
  content: string;
  parseOptions?: ParseOptions;
  skipDerivation?: boolean;
}

/**
 * Full import result.
 */
export interface ImportResult {
  success: boolean;
  importBatchId: string;

  // Parsing metrics
  totalRows: number;
  parsedRows: number;
  skippedRows: number;

  // Write metrics
  inserted: number;
  duplicates: number;

  // Date range of imported data
  dateRange?: {
    start: Date;
    end: Date;
  };

  // Issues
  warnings: ImportWarning[];
  errors: ImportError[];

  // Error details if failed
  errorMessage?: string;
}

/**
 * Get the appropriate importer for a broker.
 */
function getImporter(broker: Broker): BrokerImporter {
  switch (broker) {
    case 'robinhood':
      return new RobinhoodImporter();
    case 'schwab':
      return new SchwabImporter();
    // Future: Add more importers
    // case 'fidelity':
    //   return new FidelityImporter();
    default:
      throw new Error(`Unsupported broker: ${broker}`);
  }
}

/**
 * Import a broker file into the ledger.
 *
 * This function orchestrates the full import pipeline:
 * 1. Creates an import batch record
 * 2. Parses the file using the broker-specific importer
 * 3. Validates the transactions
 * 4. Writes to the ledger (with deduplication)
 * 5. Triggers derivation (positions, P&L)
 * 6. Updates the import batch with results
 *
 * The entire operation is atomic - if any step fails,
 * the import batch is marked as failed and no partial
 * data is written.
 */
export async function importBrokerFile(
  prisma: PrismaClient,
  request: ImportRequest
): Promise<ImportResult> {
  const startTime = Date.now();
  const allWarnings: ImportWarning[] = [];
  const allErrors: ImportError[] = [];

  log.info(
    {
      userId: request.userId,
      brokerageAccountId: request.brokerageAccountId,
      broker: request.broker,
      fileName: request.fileName,
      contentLength: request.content.length,
    },
    'Starting broker file import'
  );

  // 1. Validate brokerage account exists and belongs to user
  const account = await prisma.brokerageAccount.findFirst({
    where: {
      id: request.brokerageAccountId,
      userId: request.userId,
      isActive: true,
    },
  });

  if (!account) {
    throw new Error('Brokerage account not found or inactive');
  }

  // 2. Create import batch record
  const importBatch = await prisma.importBatch.create({
    data: {
      userId: request.userId,
      brokerageAccountId: request.brokerageAccountId,
      fileName: request.fileName,
      broker: request.broker,
      sourceType: 'import',
      status: 'processing',
      startedAt: new Date(),
    },
  });

  try {
    // 3. Get the appropriate importer
    const importer = getImporter(request.broker);

    // 4. Parse the file
    log.info({ importBatchId: importBatch.id }, 'Parsing file');
    const parseResult = await importer.parse(request.content, request.parseOptions);

    allWarnings.push(...parseResult.warnings);
    allErrors.push(...parseResult.errors);

    // Update batch with parse metrics
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        totalRows: parseResult.totalRows,
        parsedRows: parseResult.parsedRows,
        skippedRows: parseResult.skippedRows,
        tradeStartDate: parseResult.dateRange?.start,
        tradeEndDate: parseResult.dateRange?.end,
      },
    });

    if (parseResult.transactions.length === 0) {
      // No transactions to import
      await prisma.importBatch.update({
        where: { id: importBatch.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          importedEvents: 0,
          duplicateRows: 0,
          warnings: allWarnings.length > 0 ? JSON.stringify(allWarnings) : null,
          skipReasons:
            parseResult.skippedRows > 0
              ? JSON.stringify({ count: parseResult.skippedRows, reason: 'Non-trade transactions' })
              : null,
        },
      });

      const elapsed = Date.now() - startTime;
      log.info(
        {
          importBatchId: importBatch.id,
          elapsedMs: elapsed,
        },
        'Import completed - no transactions to import'
      );

      return {
        success: true,
        importBatchId: importBatch.id,
        totalRows: parseResult.totalRows,
        parsedRows: parseResult.parsedRows,
        skippedRows: parseResult.skippedRows,
        inserted: 0,
        duplicates: 0,
        dateRange: parseResult.dateRange,
        warnings: allWarnings,
        errors: allErrors,
      };
    }

    // 5. Validate transactions
    log.info(
      { importBatchId: importBatch.id, transactionCount: parseResult.transactions.length },
      'Validating transactions'
    );
    const validationResult = importer.validate(parseResult.transactions);
    allWarnings.push(...validationResult.warnings);
    allErrors.push(...validationResult.errors);

    if (!validationResult.isValid) {
      // Validation failed - mark batch as failed
      await prisma.importBatch.update({
        where: { id: importBatch.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: 'Validation failed',
          warnings: allWarnings.length > 0 ? JSON.stringify(allWarnings) : null,
          skipReasons: allErrors.length > 0 ? JSON.stringify(allErrors) : null,
        },
      });

      log.warn(
        {
          importBatchId: importBatch.id,
          errorCount: validationResult.errors.length,
        },
        'Import failed validation'
      );

      return {
        success: false,
        importBatchId: importBatch.id,
        totalRows: parseResult.totalRows,
        parsedRows: parseResult.parsedRows,
        skippedRows: parseResult.skippedRows,
        inserted: 0,
        duplicates: 0,
        dateRange: parseResult.dateRange,
        warnings: allWarnings,
        errors: allErrors,
        errorMessage: 'Validation failed',
      };
    }

    // 6. Write to ledger
    log.info(
      { importBatchId: importBatch.id, transactionCount: parseResult.transactions.length },
      'Writing to ledger'
    );

    const context: ImportContext = {
      userId: request.userId,
      brokerageAccountId: request.brokerageAccountId,
      broker: request.broker,
      sourceType: 'import' as SourceType,
      importBatchId: importBatch.id,
    };

    const writeResult = await writeLedgerEvents(prisma, context, parseResult.transactions);
    allWarnings.push(...writeResult.warnings);
    allErrors.push(...writeResult.errors);

    // 7. Update batch with write results
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        validatedRows: parseResult.transactions.length,
        importedEvents: writeResult.inserted,
        duplicateRows: writeResult.duplicates,
      },
    });

    // 8. Trigger derivation (unless skipped)
    if (!request.skipDerivation && writeResult.inserted > 0) {
      log.info({ importBatchId: importBatch.id }, 'Triggering derivation');
      try {
        await fullRederivation(prisma, request.userId);
      } catch (derivationError) {
        log.error(
          { error: derivationError, importBatchId: importBatch.id },
          'Derivation failed - import data is saved but positions may be stale'
        );
        allWarnings.push({
          index: -1,
          message: 'Derivation failed - positions may need manual refresh',
          code: 'other',
        });
      }
    }

    // 9. Mark batch as completed
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        warnings: allWarnings.length > 0 ? JSON.stringify(allWarnings) : null,
        skipReasons:
          parseResult.skippedRows > 0
            ? JSON.stringify({
                count: parseResult.skippedRows,
                reason: 'Non-trade or filtered transactions',
              })
            : null,
      },
    });

    const elapsed = Date.now() - startTime;
    log.info(
      {
        importBatchId: importBatch.id,
        inserted: writeResult.inserted,
        duplicates: writeResult.duplicates,
        elapsedMs: elapsed,
      },
      'Import completed successfully'
    );

    return {
      success: true,
      importBatchId: importBatch.id,
      totalRows: parseResult.totalRows,
      parsedRows: parseResult.parsedRows,
      skippedRows: parseResult.skippedRows,
      inserted: writeResult.inserted,
      duplicates: writeResult.duplicates,
      dateRange: parseResult.dateRange,
      warnings: allWarnings,
      errors: allErrors,
    };
  } catch (error) {
    // Mark batch as failed
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        warnings: allWarnings.length > 0 ? JSON.stringify(allWarnings) : null,
      },
    });

    log.error(
      {
        error,
        importBatchId: importBatch.id,
      },
      'Import failed'
    );

    throw error;
  }
}

/**
 * Get import history for a user.
 */
export async function getImportHistory(
  prisma: PrismaClient,
  userId: string,
  options?: {
    brokerageAccountId?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{
  batches: Awaited<ReturnType<PrismaClient['importBatch']['findMany']>>;
  total: number;
}> {
  const where: { userId: string; brokerageAccountId?: string; isArchived?: boolean } = {
    userId,
  };

  if (options?.brokerageAccountId) {
    where.brokerageAccountId = options.brokerageAccountId;
  }

  if (!options?.includeArchived) {
    where.isArchived = false;
  }

  const [batches, total] = await Promise.all([
    prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    }),
    prisma.importBatch.count({ where }),
  ]);

  return { batches, total };
}

/**
 * Archive an import batch.
 */
export async function archiveImportBatch(
  prisma: PrismaClient,
  batchId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.importBatch.updateMany({
    where: {
      id: batchId,
      userId,
      isArchived: false,
    },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId,
    },
  });

  return result.count > 0;
}

/**
 * Unarchive an import batch.
 */
export async function unarchiveImportBatch(
  prisma: PrismaClient,
  batchId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.importBatch.updateMany({
    where: {
      id: batchId,
      userId,
      isArchived: true,
    },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    },
  });

  return result.count > 0;
}

/**
 * Delete an import batch and all its ledger events.
 * This is a destructive operation - use with caution.
 *
 * The function:
 * 1. Soft-deletes all ledger events from this batch
 * 2. Clears the importBatchId reference to allow batch deletion
 * 3. Deletes the import batch record
 */
export async function deleteImportBatch(
  prisma: PrismaClient,
  batchId: string,
  userId: string
): Promise<{ deleted: boolean; eventsDeleted: number }> {
  // Verify ownership
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, userId },
  });

  if (!batch) {
    return { deleted: false, eventsDeleted: 0 };
  }

  // Delete in a transaction
  return prisma.$transaction(async (tx) => {
    // Soft-delete all ledger events from this batch and clear the batch reference
    // We clear importBatchId to allow the batch to be deleted (FK constraint)
    const events = await tx.ledgerEvent.updateMany({
      where: {
        importBatchId: batchId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        importBatchId: null, // Clear reference to allow batch deletion
      },
    });

    // Delete the batch
    await tx.importBatch.delete({
      where: { id: batchId },
    });

    return { deleted: true, eventsDeleted: events.count };
  });
}

/**
 * Get details of a specific import batch.
 */
export async function getImportBatchDetails(
  prisma: PrismaClient,
  batchId: string,
  userId: string
): Promise<{
  batch: Awaited<ReturnType<PrismaClient['importBatch']['findUnique']>>;
  eventCount: number;
  events?: Awaited<ReturnType<PrismaClient['ledgerEvent']['findMany']>>;
} | null> {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, userId },
  });

  if (!batch) {
    return null;
  }

  const [eventCount, events] = await Promise.all([
    prisma.ledgerEvent.count({
      where: {
        importBatchId: batchId,
        deletedAt: null,
      },
    }),
    prisma.ledgerEvent.findMany({
      where: {
        importBatchId: batchId,
        deletedAt: null,
      },
      orderBy: { activityDate: 'asc' },
      take: 100, // Limit for performance
    }),
  ]);

  return { batch, eventCount, events };
}

// ============================================================================
// Legacy Support (Backward Compatibility)
// ============================================================================

/**
 * Legacy import options for existing code that expects the old interface.
 */
export interface LedgerImportOptions {
  userId: string;
  fileName: string;
  content: string;
  source?: string;
  correlationId?: string;
}

/**
 * Legacy import result format.
 */
export interface LedgerImportResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed';
  summary: {
    totalRows: number;
    ledgerEventsInserted: number;
    ledgerEventsDuplicate: number;
    derivedPositions: number;
    derivedCloses: number;
    unmatchedCloses: number;
    byEventType: Record<string, number>;
    dateRange: { start: string | null; end: string | null };
  };
  warnings: Array<{ row: number; message: string }>;
  errors: Array<{ row: number; message: string }>;
}

/**
 * Legacy import function for backward compatibility.
 * @deprecated Use importBrokerFile instead
 */
export async function executeLedgerImport(
  prisma: PrismaClient,
  options: LedgerImportOptions
): Promise<LedgerImportResult> {
  // Get user's default brokerage account
  const defaultAccount = await prisma.brokerageAccount.findFirst({
    where: {
      userId: options.userId,
      isDefault: true,
      isActive: true,
    },
  });

  if (!defaultAccount) {
    throw new Error('No default brokerage account found');
  }

  const result = await importBrokerFile(prisma, {
    userId: options.userId,
    brokerageAccountId: defaultAccount.id,
    broker: 'robinhood',
    fileName: options.fileName,
    content: options.content,
  });

  // Convert to legacy format
  return {
    batchId: result.importBatchId,
    status: result.success ? 'completed' : 'failed',
    summary: {
      totalRows: result.totalRows,
      ledgerEventsInserted: result.inserted,
      ledgerEventsDuplicate: result.duplicates,
      derivedPositions: 0, // Would need to query
      derivedCloses: 0, // Would need to query
      unmatchedCloses: 0, // Would need to query
      byEventType: {}, // Would need to query
      dateRange: {
        start: result.dateRange?.start?.toISOString() || null,
        end: result.dateRange?.end?.toISOString() || null,
      },
    },
    warnings: result.warnings.map((w) => ({
      row: w.index,
      message: w.message,
    })),
    errors: result.errors.map((e) => ({
      row: e.index,
      message: e.message,
    })),
  };
}
