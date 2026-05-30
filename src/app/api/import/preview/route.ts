import { apiJson } from '@/lib/api/response';
/**
 * Import Preview API Route
 *
 * Preview file import without actually importing.
 * Shows summary statistics, sample trades, and any warnings/errors.
 * Supports multiple brokers (Robinhood CSV, Schwab JSON).
 *
 * POST /api/import/preview
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { RobinhoodImporter } from '@/lib/importers/robinhood';
import { SchwabImporter } from '@/lib/importers/schwab';
import { generateEventHash } from '@/lib/services/ledger-write';
import type { BrokerImporter } from '@/lib/importers/types';
import { z } from 'zod';

/** Maximum file content size for preview (25 MB, matches import route) */
const MAX_PREVIEW_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Supported broker types for preview.
 */
const SUPPORTED_BROKERS = ['robinhood', 'schwab'] as const;
type PreviewBroker = typeof SUPPORTED_BROKERS[number];

/**
 * Request schema for preview endpoint.
 */
const previewRequestSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  content: z.string().min(1, 'File content is required'),
  skipDuplicates: z.boolean().optional().default(true),
  broker: z.enum(SUPPORTED_BROKERS).optional(),
});

/**
 * Get the appropriate importer for a broker.
 */
function getImporter(broker: PreviewBroker): BrokerImporter {
  switch (broker) {
    case 'robinhood':
      return new RobinhoodImporter();
    case 'schwab':
      return new SchwabImporter();
    default:
      throw new Error(`Unsupported broker: ${broker}`);
  }
}

/**
 * Auto-detect broker from file name and content.
 */
function detectBroker(fileName: string, content: string): PreviewBroker | null {
  // Check file extension first
  const ext = fileName.toLowerCase().split('.').pop();

  if (ext === 'json') {
    // Try to parse as Schwab JSON
    try {
      const data = JSON.parse(content);
      if (data.BrokerageTransactions && Array.isArray(data.BrokerageTransactions)) {
        return 'schwab';
      }
    } catch {
      // Not valid JSON
    }
  }

  if (ext === 'csv') {
    // Check for Robinhood CSV headers
    const robinhoodImporter = new RobinhoodImporter();
    if (robinhoodImporter.canHandle(content, fileName)) {
      return 'robinhood';
    }
  }

  return null;
}

/**
 * POST /api/import/preview
 *
 * Preview CSV file without importing.
 *
 * Request body:
 * {
 *   fileName: string;
 *   content: string; // Raw CSV content
 *   skipDuplicates?: boolean;
 * }
 *
 * Response:
 * {
 *   summary: {
 *     totalRows: number;
 *     parsed: number;
 *     validated: number;
 *     duplicates: number;
 *     toImport: number;
 *     skipped: number;
 *     byType: { stocks: number; options: number };
 *     byStatus: { open: number; partial: number; closed: number };
 *   };
 *   sampleTrades: Array<{...}>;
 *   warnings: Array<{...}>;
 *   errors: Array<{...}>;
 * }
 */
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response: authResponse } = await checkAuthApi();
    if (authResponse) return authResponse;

    const userId = session.user.id;
    log.info({ userId }, 'Starting CSV preview');

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

    const validation = previewRequestSchema.safeParse(body);
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

    const { fileName, content, skipDuplicates, broker: requestedBroker } = validation.data;

    // Enforce file size limit (matches /api/import)
    const contentSizeBytes = new TextEncoder().encode(content).byteLength;
    if (contentSizeBytes > MAX_PREVIEW_SIZE_BYTES) {
      const sizeMB = (contentSizeBytes / (1024 * 1024)).toFixed(1);
      log.warn({ userId, contentSizeBytes }, 'Preview rejected — file too large');
      return apiJson(
        {
          error: 'Payload Too Large',
          message: `File is ${sizeMB} MB which exceeds the 25 MB limit. Please split the file into smaller batches.`,
        },
        { status: 413 }
      );
    }

    log.info({ fileName, skipDuplicates, requestedBroker }, 'Parsing file for preview');

    // Determine broker - use requested broker or auto-detect
    const broker = requestedBroker || detectBroker(fileName, content);

    if (!broker) {
      return apiJson(
        {
          error: 'Bad Request',
          message: 'Could not determine file format. Please ensure you are uploading a Robinhood CSV or Schwab JSON file.',
        },
        { status: 400 }
      );
    }

    log.info({ broker }, 'Using broker importer');

    // Get the appropriate importer
    const importer = getImporter(broker);

    // Check if this importer can handle the file
    if (!importer.canHandle(content, fileName)) {
      const fileType = broker === 'schwab' ? 'JSON' : 'CSV';
      return apiJson(
        {
          error: 'Bad Request',
          message: `File format not recognized as ${broker.charAt(0).toUpperCase() + broker.slice(1)} ${fileType}. Please check that you exported the correct file format.`,
        },
        { status: 400 }
      );
    }

    // Parse the file
    const parseResult = await importer.parse(content);

    // Check if parsing failed completely (no transactions and has errors)
    if (parseResult.transactions.length === 0 && parseResult.errors.length > 0) {
      const fileType = broker === 'schwab' ? 'JSON' : 'CSV';
      return apiJson(
        {
          error: 'Parse Error',
          message: `Failed to parse ${broker.charAt(0).toUpperCase() + broker.slice(1)} ${fileType} file. Please verify the file is a valid export from your broker.`,
          errors: parseResult.errors,
        },
        { status: 400 }
      );
    }

    // Validate transactions
    const validationResult = importer.validate(parseResult.transactions);

    // Get valid transactions by filtering out those with errors
    // ValidationResult only has isValid, errors, warnings - not validTransactions
    const errorIndices = new Set(validationResult.errors.map((e) => e.index));
    const validTransactions = parseResult.transactions.filter(
      (_, index) => !errorIndices.has(index)
    );

    // Check for duplicates if requested
    let duplicateCount = 0;
    let nonDuplicateTransactions = validTransactions;
    let duplicateCheckApproximate = false;

    if (skipDuplicates && validTransactions.length > 0) {
      // Get user's accounts to check for duplicates
      const userAccounts = await prisma.brokerageAccount.findMany({
        where: { userId, isActive: true },
        select: { id: true },
      });

      if (userAccounts.length > 0) {
        // Generate all hashes for all account combinations
        const hashToTransaction = new Map<string, typeof validTransactions[0]>();
        const allHashes: string[] = [];

        for (const txn of validTransactions) {
          for (const account of userAccounts) {
            const hash = generateEventHash(userId, account.id, txn);
            if (!hashToTransaction.has(hash)) {
              hashToTransaction.set(hash, txn);
              allHashes.push(hash);
            }
          }
        }

        // For large files (>10k hashes), sample check instead of full check
        const LARGE_FILE_THRESHOLD = 10000;
        const SAMPLE_SIZE = 500;

        if (allHashes.length > LARGE_FILE_THRESHOLD) {
          log.info(
            { totalHashes: allHashes.length, sampleSize: SAMPLE_SIZE },
            'Large file detected, using approximate duplicate check'
          );
          duplicateCheckApproximate = true;

          // Sample random hashes to estimate duplicate rate
          const sampleIndices = new Set<number>();
          while (sampleIndices.size < Math.min(SAMPLE_SIZE, allHashes.length)) {
            sampleIndices.add(Math.floor(Math.random() * allHashes.length));
          }
          const sampleHashes = Array.from(sampleIndices).map((i) => allHashes[i]);

          // Check sample for duplicates in batches
          const existingHashes = new Set<string>();
          const BATCH_SIZE = 100;
          for (let i = 0; i < sampleHashes.length; i += BATCH_SIZE) {
            const batch = sampleHashes.slice(i, i + BATCH_SIZE);
            const existing = await prisma.ledgerEvent.findMany({
              where: { eventHash: { in: batch } },
              select: { eventHash: true },
            });
            existing.forEach((e) => existingHashes.add(e.eventHash));
          }

          // Extrapolate duplicate count from sample
          const sampleDuplicates = existingHashes.size;
          const duplicateRate = sampleDuplicates / sampleHashes.length;
          duplicateCount = Math.round(validTransactions.length * duplicateRate);

          // For preview, we don't filter individual transactions, just estimate
          nonDuplicateTransactions = validTransactions;
        } else {
          // Small enough file - do full duplicate check in batches
          const existingHashes = new Set<string>();
          const BATCH_SIZE = 500;

          for (let i = 0; i < allHashes.length; i += BATCH_SIZE) {
            const batch = allHashes.slice(i, i + BATCH_SIZE);
            const existing = await prisma.ledgerEvent.findMany({
              where: { eventHash: { in: batch } },
              select: { eventHash: true },
            });
            existing.forEach((e) => existingHashes.add(e.eventHash));
          }

          // Filter out duplicates
          const seenTransactions = new Set<typeof validTransactions[0]>();
          for (const hash of allHashes) {
            if (!existingHashes.has(hash)) {
              const txn = hashToTransaction.get(hash);
              if (txn && !seenTransactions.has(txn)) {
                seenTransactions.add(txn);
              }
            }
          }
          nonDuplicateTransactions = Array.from(seenTransactions);
          duplicateCount = validTransactions.length - nonDuplicateTransactions.length;
        }
      }
    }

    // Calculate summary statistics
    const transactionsToCount = nonDuplicateTransactions;

    let stockCount = 0;
    let optionCount = 0;
    let openCount = 0;
    let closedCount = 0;

    for (const txn of transactionsToCount) {
      // Count by type
      if (txn.isOption) {
        optionCount++;
      } else {
        stockCount++;
      }

      // Count by status (open vs closed)
      const openingCodes = ['BUY', 'BTO', 'STO'];
      const closingCodes = ['SELL', 'BTC', 'STC', 'OEXP', 'OASGN'];

      if (openingCodes.includes(txn.transCode)) {
        openCount++;
      } else if (closingCodes.includes(txn.transCode)) {
        closedCount++;
      }
    }

    // Create sample trades (up to 10)
    const sampleTrades = transactionsToCount.slice(0, 10).map((txn) => ({
      ticker: txn.symbol,
      type: txn.isOption ? 'Option' : 'Stock',
      status: ['BUY', 'BTO', 'STO'].includes(txn.transCode) ? 'Opening' : 'Closing',
      strategy: txn.isOption
        ? `${txn.optionType?.toUpperCase() || 'OPTION'} ${txn.strike || '?'}${txn.expiration ? ` ${txn.expiration}` : ''}`
        : null,
      entryDate: txn.activityDate,
      quantity: txn.quantity,
      entryPrice: txn.price?.toFixed(2) || '0.00',
      realizedPnL: txn.amount?.toFixed(2) || null,
    }));

    // Format warnings and errors for response
    const formattedWarnings = [
      ...parseResult.warnings.map((w) => ({
        row: w.index + 1,
        message: w.message,
        ticker: w.symbol,
      })),
      ...validationResult.warnings.map((w) => ({
        row: w.index + 1,
        message: w.message,
        ticker: w.symbol,
      })),
    ];

    const formattedErrors = [
      ...parseResult.errors.map((e) => ({
        row: e.index + 1,
        message: e.message,
        ticker: e.symbol,
      })),
      ...validationResult.errors.map((e) => ({
        row: e.index + 1,
        message: e.message,
        ticker: e.symbol,
      })),
    ];

    const response = {
      summary: {
        totalRows: parseResult.totalRows,
        parsed: parseResult.parsedRows,
        validated: validTransactions.length,
        duplicates: duplicateCount,
        toImport: duplicateCheckApproximate
          ? validTransactions.length - duplicateCount
          : nonDuplicateTransactions.length,
        skipped: parseResult.skippedRows,
        byType: {
          stocks: stockCount,
          options: optionCount,
        },
        byStatus: {
          open: openCount,
          partial: 0, // We don't track partial in preview
          closed: closedCount,
        },
        isApproximate: duplicateCheckApproximate,
        isLargeFile: parseResult.totalRows > 5000,
      },
      sampleTrades,
      warnings: formattedWarnings,
      errors: formattedErrors,
    };

    log.info(
      {
        totalRows: response.summary.totalRows,
        toImport: response.summary.toImport,
        duplicates: response.summary.duplicates,
      },
      'Preview completed'
    );

    return apiJson(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    log.error(
      {
        errorMessage,
        errorStack,
        correlationId,
      },
      'Preview failed'
    );

    return apiJson(
      {
        error: 'Internal Server Error',
        message: errorMessage || 'Failed to preview CSV',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

