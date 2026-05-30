import { apiJson } from '@/lib/api/response';
/**
 * Manual Entry API Route
 *
 * POST /api/entries - Create manual ledger events for stock or option trades
 * GET /api/entries - List ledger events for the current user
 *
 * This endpoint creates LedgerEvent records directly for manual entries,
 * which are then used by the derivation system to compute positions and P&L.
 */


import { checkAuthApi } from '@/lib/auth';
import { createChildLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { createStockTradeSchema, createOptionTradeSchema } from '@/lib/validations/trade';
import { normalizeActivityDate, type NormalizedTransaction, type ImportContext } from '@/lib/importers/types';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import type pino from 'pino';

const log = createChildLogger({ module: 'api-entries' });

/**
 * POST /api/entries
 *
 * Creates a manual ledger event entry. Supports both stock and option trades.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    requestLog.info({ userId }, 'Processing manual entry request');

    const body = await request.json();

    // Check if this is a stock or option trade
    const isOption = body.type === 'option';

    if (isOption) {
      return await handleOptionEntry(body, userId, requestLog);
    } else {
      return await handleStockEntry(body, userId, requestLog);
    }
  } catch (error) {
    requestLog.error({ error }, 'Failed to create manual entry');

    if (error instanceof z.ZodError) {
      return apiJson(
        {
          error: 'Validation Error',
          message: error.issues?.[0]?.message || 'Invalid input',
          details: error.issues
        },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to create entry' },
      { status: 500 }
    );
  }
}

/**
 * Handle stock trade entry.
 */
async function handleStockEntry(
  body: unknown,
  userId: string,
  requestLog: pino.Logger
) {
  // Validate input
  const validated = createStockTradeSchema.parse(body);

  // Get user's default brokerage account
  const account = await getOrCreateDefaultAccount(userId);

  // Create the normalized transaction for the ledger
  const transaction: NormalizedTransaction = {
    activityDate: normalizeActivityDate(validated.entryDate),
    activityTime: validated.entryTime || undefined,
    symbol: validated.ticker,
    transCode: 'BUY',
    quantity: validated.quantity,
    price: validated.entryPrice,
    amount: validated.quantity * validated.entryPrice * -1, // Negative = cash out
    eventType: 'EQUITY_STOCK',
    isOption: false,
    rawInstrument: validated.ticker,
    rawDescription: validated.openingNotes || undefined,
    notes: validated.openingNotes || undefined,
  };

  // Create import context for manual entry
  const context: ImportContext = {
    userId,
    brokerageAccountId: account.id,
    broker: 'manual',
    sourceType: 'manual',
    importBatchId: null,
  };

  // Write to ledger
  const writeResult = await writeLedgerEvents(prisma, context, [transaction]);

  if (writeResult.errors.length > 0) {
    requestLog.error({ errors: writeResult.errors }, 'Failed to write ledger event');
    return apiJson(
      { error: 'Write Error', message: writeResult.errors[0].message },
      { status: 400 }
    );
  }

  // Trigger derivation if event was inserted
  if (writeResult.inserted > 0) {
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }
  }

  requestLog.info(
    { userId, ticker: validated.ticker, inserted: writeResult.inserted },
    'Stock entry created'
  );

  return apiJson(
    {
      data: {
        type: 'stock',
        ticker: validated.ticker,
        quantity: validated.quantity,
        entryPrice: validated.entryPrice,
        entryDate: validated.entryDate,
        inserted: writeResult.inserted,
        duplicates: writeResult.duplicates,
      },
      message: writeResult.duplicates > 0 ? 'Entry already exists' : 'Entry created successfully',
    },
    { status: writeResult.inserted > 0 ? 201 : 200 }
  );
}

/**
 * Handle option trade entry.
 */
async function handleOptionEntry(
  body: unknown,
  userId: string,
  requestLog: pino.Logger
) {
  // Validate input
  const validated = createOptionTradeSchema.parse(body);

  // Get user's default brokerage account
  const account = await getOrCreateDefaultAccount(userId);

  // Generate a position group ID to link all legs of this trade
  const positionGroupId = crypto.randomUUID();

  // Create normalized transactions for each leg
  const transactions: NormalizedTransaction[] = validated.optionLegs.map((leg) => {
    // Determine transaction code based on action
    const transCode = leg.action === 'buy' ? 'BTO' : 'STO';

    // Calculate amount: BTO = cash out (negative), STO = cash in (positive)
    // Premium is per contract, multiply by 100 for shares per contract
    const amount = leg.action === 'buy'
      ? -leg.premium * leg.quantity * 100
      : leg.premium * leg.quantity * 100;

    return {
      activityDate: normalizeActivityDate(validated.entryDate),
      activityTime: validated.entryTime || undefined,
      symbol: validated.ticker,
      transCode,
      quantity: leg.quantity,
      price: leg.premium,
      amount,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: leg.legType,
      strike: leg.strike,
      expiration: normalizeActivityDate(leg.expiration),
      rawInstrument: `${validated.ticker} ${leg.expiration.toISOString().split('T')[0]} ${leg.strike} ${leg.legType.toUpperCase()}`,
      rawDescription: validated.openingNotes || undefined,
      notes: validated.openingNotes || undefined,
      strategy: validated.strategy,
      positionGroupId,
      // Underlying stock price at entry - stored in DB for reporting
      underlyingPrice: validated.underlyingPrice ?? undefined,
    } as NormalizedTransaction;
  });

  // Create import context for manual entry
  const context: ImportContext = {
    userId,
    brokerageAccountId: account.id,
    broker: 'manual',
    sourceType: 'manual',
    importBatchId: null,
  };

  // Write to ledger
  const writeResult = await writeLedgerEvents(prisma, context, transactions);

  if (writeResult.errors.length > 0) {
    requestLog.error({ errors: writeResult.errors }, 'Failed to write ledger events');
    return apiJson(
      { error: 'Write Error', message: writeResult.errors[0].message },
      { status: 400 }
    );
  }

  // Trigger derivation if events were inserted
  if (writeResult.inserted > 0) {
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }
  }

  requestLog.info(
    {
      userId,
      ticker: validated.ticker,
      strategy: validated.strategy,
      legs: validated.optionLegs.length,
      inserted: writeResult.inserted,
    },
    'Option entry created'
  );

  return apiJson(
    {
      data: {
        type: 'option',
        ticker: validated.ticker,
        strategy: validated.strategy,
        legs: validated.optionLegs.length,
        entryDate: validated.entryDate,
        positionGroupId,
        inserted: writeResult.inserted,
        duplicates: writeResult.duplicates,
      },
      message: writeResult.duplicates > 0 ? 'Some entries already exist' : 'Entry created successfully',
    },
    { status: writeResult.inserted > 0 ? 201 : 200 }
  );
}

/**
 * Get or create a default brokerage account for the user.
 */
async function getOrCreateDefaultAccount(userId: string) {
  // Try to find existing default account
  let account = await prisma.brokerageAccount.findFirst({
    where: {
      userId,
      isDefault: true,
      isActive: true,
    },
  });

  // Create one if it doesn't exist
  if (!account) {
    account = await prisma.brokerageAccount.create({
      data: {
        userId,
        name: 'My Trading Account',
        broker: 'manual',
        isDefault: true,
        isActive: true,
      },
    });
  }

  return account;
}

/**
 * GET /api/entries
 *
 * List ledger events for the current user.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    // Validate pagination with strict bounds to prevent DoS
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 100);
    const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const accountId = searchParams.get('accountId');

    requestLog.info({ userId, limit, offset, symbol }, 'Fetching ledger events');

    const where: Prisma.LedgerEventWhereInput = {
      userId,
      deletedAt: null,
    };

    if (symbol) {
      where.symbol = symbol;
    }

    if (accountId) {
      where.brokerageAccountId = accountId;
    }

    const [events, total] = await Promise.all([
      prisma.ledgerEvent.findMany({
        where,
        orderBy: { activityDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.ledgerEvent.count({ where }),
    ]);

    return apiJson({
      data: {
        events,
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    requestLog.error({ error }, 'Failed to fetch ledger events');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch entries' },
      { status: 500 }
    );
  }
}

