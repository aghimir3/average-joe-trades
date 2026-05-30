/**
 * Ledger Write Service
 *
 * Handles writing normalized transactions to the LedgerEvent table.
 * This is the single point of entry for all ledger writes, ensuring:
 * - Idempotency via eventHash uniqueness
 * - Proper chunking for SQL Server parameter limits
 * - Consistent audit trail
 *
 * Usage:
 *   const result = await writeLedgerEvents(prisma, context, transactions);
 */

import { createHash } from 'crypto';
import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import type {
  NormalizedTransaction,
  ImportContext,
  LedgerWriteResult,
  ImportWarning,
  ImportError,
} from '@/lib/importers/types';
import {
  normalizeSymbol,
  getInstrumentKey,
  validateTransaction,
} from '@/lib/importers/types';

const log = createChildLogger({ module: 'ledger-write' });

// SQL Server has a 2100 parameter limit. With ~25 fields per event,
// we can safely insert ~80 events per batch.
const CHUNK_SIZE = 80;

/**
 * Generate an idempotency hash for a ledger event.
 *
 * Hash includes:
 * - userId, brokerageAccountId (scopes to user+account)
 * - activityDate (day only)
 * - instrumentKey (symbol + option details if applicable)
 * - transCode, quantity, price, amount
 * - sourceTransactionId (if broker provides one)
 *
 * This ensures the same transaction from the same source produces the same hash.
 */
/**
 * Generate a base key for grouping identical transactions.
 * This key is used to count occurrences of identical transactions within a batch.
 */
export function generateBaseHashKey(
  userId: string,
  brokerageAccountId: string,
  txn: NormalizedTransaction
): string {
  const instrumentKey = getInstrumentKey(txn);
  const dateStr = txn.activityDate.toISOString().split('T')[0];

  // Round numbers to avoid floating point precision issues
  const priceStr = txn.price !== undefined ? txn.price.toFixed(6) : '';
  const amountStr = txn.amount !== undefined ? txn.amount.toFixed(6) : '';
  const qtyStr = txn.quantity.toFixed(6);

  return [
    userId,
    brokerageAccountId,
    dateStr,
    instrumentKey,
    txn.transCode,
    qtyStr,
    priceStr,
    amountStr,
    txn.sourceTransactionId || '',
  ].join('|');
}

/**
 * Generate an idempotency hash for a ledger event.
 *
 * Hash includes:
 * - userId, brokerageAccountId (scopes to user+account)
 * - activityDate (day only)
 * - instrumentKey (symbol + option details if applicable)
 * - transCode, quantity, price, amount
 * - sourceTransactionId (if broker provides one)
 * - occurrenceIndex (distinguishes multiple identical fills within a batch)
 *
 * This ensures the same transaction from the same source produces the same hash,
 * while allowing multiple identical fills (common with options) to be imported.
 *
 * @param userId - User ID
 * @param brokerageAccountId - Brokerage account ID
 * @param txn - Normalized transaction
 * @param occurrenceIndex - Index for this occurrence of identical transactions (0-based)
 */
export function generateEventHash(
  userId: string,
  brokerageAccountId: string,
  txn: NormalizedTransaction,
  occurrenceIndex: number = 0
): string {
  const baseKey = generateBaseHashKey(userId, brokerageAccountId, txn);

  // Include occurrence index to distinguish multiple identical fills
  const parts = occurrenceIndex > 0
    ? `${baseKey}|occ:${occurrenceIndex}`
    : baseKey;

  const hash = createHash('sha256')
    .update(parts)
    .digest('hex');

  return hash;
}

/**
 * Convert a NormalizedTransaction to a Prisma create input.
 */
function transactionToCreateInput(
  context: ImportContext,
  txn: NormalizedTransaction,
  eventHash: string
): Prisma.LedgerEventCreateManyInput {
  return {
    userId: context.userId,
    brokerageAccountId: context.brokerageAccountId,
    importBatchId: context.importBatchId || undefined,

    // Source tracking
    broker: context.broker,
    sourceType: context.sourceType,
    sourceTransactionId: txn.sourceTransactionId || undefined,

    // Core fields
    activityDate: txn.activityDate,
    activityTime: txn.activityTime || undefined,
    processDate: txn.processDate || undefined,
    settleDate: txn.settleDate || undefined,
    instrument: txn.rawInstrument,
    description: txn.rawDescription || undefined,
    transCode: txn.transCode,
    quantity: txn.quantity,
    price: txn.price || undefined,
    amount: txn.amount || undefined,
    fees: txn.fees || undefined,

    // Normalized fields
    symbol: normalizeSymbol(txn.symbol),
    eventType: txn.eventType,
    action: getActionFromTransCode(txn.transCode),
    isOption: txn.isOption,
    optionType: txn.optionType || undefined,
    strike: txn.strike || undefined,
    expiration: txn.expiration || undefined,

    // Manual entry fields
    strategy: txn.strategy || undefined,
    positionGroupId: txn.positionGroupId || undefined,
    notes: txn.notes || undefined,

    // Underlying price (for options - optional, typically from manual entries)
    underlyingPrice: txn.underlyingPrice || undefined,

    // Idempotency
    eventHash,
  };
}

/**
 * Get action string from transaction code.
 */
function getActionFromTransCode(transCode: string): string {
  const actionMap: Record<string, string> = {
    BUY: 'buy',
    SELL: 'sell',
    BTO: 'buy',
    STO: 'sell',
    BTC: 'buy',
    STC: 'sell',
    OEXP: 'expired',
    OASGN: 'assigned',
    ACH: 'transfer',
    WIRE: 'transfer',
    INT: 'interest',
    CDIV: 'dividend',
    DTAX: 'tax',
    ITRF: 'transfer',
    MINT: 'interest',
    FEE: 'fee',
    ADJ: 'adjustment',
    SPLIT: 'split',
    OTHER: 'other',
  };
  return actionMap[transCode] || 'other';
}

/**
 * Write normalized transactions to the ledger.
 *
 * This function:
 * 1. Validates all transactions
 * 2. Generates event hashes for idempotency
 * 3. Filters out duplicates (same hash already exists)
 * 4. Inserts new events in chunks
 *
 * @param prisma - Prisma client
 * @param context - Import context (user, account, broker, source)
 * @param transactions - Normalized transactions to write
 * @returns Result with counts and any errors/warnings
 */
export async function writeLedgerEvents(
  prisma: PrismaClient,
  context: ImportContext,
  transactions: NormalizedTransaction[]
): Promise<LedgerWriteResult> {
  const startTime = Date.now();
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];
  const insertedIds: string[] = [];

  log.info(
    {
      userId: context.userId,
      brokerageAccountId: context.brokerageAccountId,
      broker: context.broker,
      transactionCount: transactions.length,
    },
    'Starting ledger write'
  );

  // 1. Validate all transactions and handle multiple identical fills
  const validTransactions: NormalizedTransaction[] = [];
  const hashMap = new Map<string, NormalizedTransaction>();

  // Track occurrence counts for identical transactions (same base key)
  // This allows multiple fills at the same price to be imported
  const baseKeyOccurrences = new Map<string, number>();

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const validationErrors = validateTransaction(txn);

    if (validationErrors.length > 0) {
      // Log first few validation failures for debugging
      if (errors.length < 5) {
        log.debug(
          {
            index: i,
            txn: {
              symbol: txn.symbol,
              transCode: txn.transCode,
              quantity: txn.quantity,
              isOption: txn.isOption,
              optionType: txn.optionType,
              strike: txn.strike,
              expiration: txn.expiration,
              activityDate: txn.activityDate,
            },
            validationErrors,
          },
          'Transaction failed validation'
        );
      }
      // Add index to each error
      for (const err of validationErrors) {
        errors.push({ ...err, index: i });
      }
      continue;
    }

    // Generate base key to count occurrences of identical transactions
    const baseKey = generateBaseHashKey(context.userId, context.brokerageAccountId, txn);

    // Get current occurrence count for this base key
    const occurrenceIndex = baseKeyOccurrences.get(baseKey) || 0;

    // Generate unique hash including the occurrence index
    // First occurrence (index 0) has same hash as before for backwards compatibility
    const hash = generateEventHash(context.userId, context.brokerageAccountId, txn, occurrenceIndex);

    // Increment occurrence count for next identical transaction
    baseKeyOccurrences.set(baseKey, occurrenceIndex + 1);

    // Check if this exact hash already exists in this batch (shouldn't happen with occurrence index)
    if (hashMap.has(hash)) {
      // This should only happen if there's a bug in our logic
      log.warn(
        { hash, symbol: txn.symbol, occurrenceIndex },
        'Unexpected hash collision after occurrence indexing'
      );
      warnings.push({
        index: i,
        symbol: txn.symbol,
        message: 'Unexpected hash collision',
        code: 'other',
      });
      continue;
    }

    hashMap.set(hash, txn);
    validTransactions.push(txn);
  }

  if (validTransactions.length === 0) {
    log.warn(
      { userId: context.userId, errorCount: errors.length },
      'No valid transactions to write'
    );
    return {
      inserted: 0,
      duplicates: 0,
      insertedIds: [],
      warnings,
      errors,
    };
  }

  // 2. Check for existing hashes in the database (excluding soft-deleted events)
  const hashes = Array.from(hashMap.keys());
  const existingHashes = new Set<string>();

  // Query in chunks to avoid parameter limits
  // Important: Only check non-deleted events so re-importing after account deletion works
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const existing = await prisma.ledgerEvent.findMany({
      where: {
        eventHash: { in: chunk },
        deletedAt: null, // Exclude soft-deleted events
      },
      select: { eventHash: true },
    });
    for (const e of existing) {
      existingHashes.add(e.eventHash);
    }
  }

  // Filter out duplicates
  const newHashes = hashes.filter((h) => !existingHashes.has(h));
  const duplicateCount = hashes.length - newHashes.length;

  if (duplicateCount > 0) {
    log.info(
      { duplicateCount, newCount: newHashes.length },
      'Filtered out duplicate events'
    );
  }

  if (newHashes.length === 0) {
    log.info({ userId: context.userId }, 'All transactions are duplicates');
    return {
      inserted: 0,
      duplicates: duplicateCount,
      insertedIds: [],
      warnings,
      errors,
    };
  }

  // 3. Prepare create inputs for new transactions
  const createInputs: Prisma.LedgerEventCreateManyInput[] = [];
  for (const hash of newHashes) {
    const txn = hashMap.get(hash)!;
    createInputs.push(transactionToCreateInput(context, txn, hash));
  }

  // 4. Insert in chunks
  let totalInserted = 0;

  for (let i = 0; i < createInputs.length; i += CHUNK_SIZE) {
    const chunk = createInputs.slice(i, i + CHUNK_SIZE);

    try {
      // Note: SQL Server doesn't support skipDuplicates in createMany.
      // We handle deduplication via eventHash checks beforehand.
      const result = await prisma.ledgerEvent.createMany({
        data: chunk,
      });
      totalInserted += result.count;
    } catch (error) {
      log.error(
        { error, chunkIndex: i / CHUNK_SIZE, chunkSize: chunk.length },
        'Failed to insert chunk'
      );

      // Add error for each item in the failed chunk
      for (let j = 0; j < chunk.length; j++) {
        errors.push({
          index: i + j,
          symbol: chunk[j].symbol,
          message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'database_error',
        });
      }
    }
  }

  // 5. Retrieve inserted IDs (for audit trail)
  if (totalInserted > 0) {
    const inserted = await prisma.ledgerEvent.findMany({
      where: {
        eventHash: { in: newHashes },
      },
      select: { id: true },
    });
    for (const e of inserted) {
      insertedIds.push(e.id);
    }
  }

  const elapsed = Date.now() - startTime;
  log.info(
    {
      userId: context.userId,
      inserted: totalInserted,
      duplicates: duplicateCount,
      errors: errors.length,
      warnings: warnings.length,
      elapsedMs: elapsed,
    },
    'Ledger write completed'
  );

  return {
    inserted: totalInserted,
    duplicates: duplicateCount,
    insertedIds,
    warnings,
    errors,
  };
}

/**
 * Write a single transaction to the ledger.
 * Convenience wrapper for single manual entries.
 */
export async function writeSingleLedgerEvent(
  prisma: PrismaClient,
  context: ImportContext,
  transaction: NormalizedTransaction
): Promise<LedgerWriteResult> {
  return writeLedgerEvents(prisma, context, [transaction]);
}

/**
 * Check if a transaction already exists in the ledger.
 * Excludes soft-deleted events so re-importing after deletion works.
 */
export async function checkDuplicate(
  prisma: PrismaClient,
  userId: string,
  brokerageAccountId: string,
  transaction: NormalizedTransaction
): Promise<boolean> {
  const hash = generateEventHash(userId, brokerageAccountId, transaction);
  const existing = await prisma.ledgerEvent.findFirst({
    where: {
      eventHash: hash,
      deletedAt: null, // Exclude soft-deleted events
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Soft-delete a ledger event.
 * Used for corrections - events are never hard-deleted.
 */
export async function softDeleteLedgerEvent(
  prisma: PrismaClient,
  eventId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await prisma.ledgerEvent.updateMany({
      where: {
        id: eventId,
        userId,
        deletedAt: null, // Only delete if not already deleted
      },
      data: {
        deletedAt: new Date(),
      },
    });
    return result.count > 0;
  } catch (error) {
    log.error({ error, eventId, userId }, 'Failed to soft-delete ledger event');
    return false;
  }
}

/**
 * Get ledger events for a user/account, optionally filtered.
 */
export async function getLedgerEvents(
  prisma: PrismaClient,
  userId: string,
  options?: {
    brokerageAccountId?: string;
    symbol?: string;
    dateRange?: { start?: Date; end?: Date };
    eventTypes?: string[];
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{
  events: Awaited<ReturnType<PrismaClient['ledgerEvent']['findMany']>>;
  total: number;
}> {
  const where: Prisma.LedgerEventWhereInput = {
    userId,
  };

  if (options?.brokerageAccountId) {
    where.brokerageAccountId = options.brokerageAccountId;
  }

  if (options?.symbol) {
    where.symbol = options.symbol;
  }

  if (options?.dateRange) {
    where.activityDate = {};
    if (options.dateRange.start) {
      where.activityDate.gte = options.dateRange.start;
    }
    if (options.dateRange.end) {
      where.activityDate.lte = options.dateRange.end;
    }
  }

  if (options?.eventTypes && options.eventTypes.length > 0) {
    where.eventType = { in: options.eventTypes };
  }

  if (!options?.includeDeleted) {
    where.deletedAt = null;
  }

  const [events, total] = await Promise.all([
    prisma.ledgerEvent.findMany({
      where,
      orderBy: { activityDate: 'asc' },
      take: options?.limit,
      skip: options?.offset,
    }),
    prisma.ledgerEvent.count({ where }),
  ]);

  return { events, total };
}
