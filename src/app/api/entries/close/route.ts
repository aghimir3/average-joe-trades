import { apiJson } from '@/lib/api/response';
/**
 * Close Trade API Route
 *
 * POST /api/entries/close - Close an open position (stock or option)
 *
 * This endpoint creates closing LedgerEvent records for positions,
 * which are then used by the derivation system to compute realized P&L.
 */


import { checkAuthApi } from '@/lib/auth';
import { createChildLogger, type Logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { writeLedgerEvents } from '@/lib/services/ledger-write';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { closeStockTradeSchema, closeOptionTradeSchema, closeFutureTradeSchema } from '@/lib/validations/close-trade';
import { normalizeActivityDate, type NormalizedTransaction, type ImportContext } from '@/lib/importers/types';
import { z } from 'zod';
import type { DerivedPosition } from '@/generated/prisma/client';

const log = createChildLogger({ module: 'api-entries-close' });

/**
 * Schema for the close request body.
 */
const closeRequestSchema = z.object({
  positionId: z.string().uuid('Invalid position ID'),
  type: z.enum(['stock', 'option', 'future']),
});

/**
 * POST /api/entries/close
 *
 * Closes an open position. Supports both stock and option positions.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    requestLog.info({ userId }, 'Processing close trade request');

    const body = await request.json();

    // First validate the basic structure
    const { positionId, type } = closeRequestSchema.parse(body);

    // Extract only the close-specific fields (exclude positionId and type for strict validation)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { positionId: _pid, type: _type, ...closeData } = body as Record<string, unknown>;

    // Fetch the position to close
    const position = await prisma.derivedPosition.findFirst({
      where: {
        id: positionId,
        userId,
        quantity: { gt: 0 },
      },
      include: {
        brokerageAccount: true,
      },
    });

    if (!position) {
      return apiJson(
        { error: 'Not Found', message: 'Position not found or already closed' },
        { status: 404 }
      );
    }

    if (type === 'stock' && position.positionType !== 'stock') {
      return apiJson(
        { error: 'Bad Request', message: 'Position is not a stock trade' },
        { status: 400 }
      );
    }

    if (type === 'option' && position.positionType !== 'option') {
      return apiJson(
        { error: 'Bad Request', message: 'Position is not an option trade' },
        { status: 400 }
      );
    }

    if (type === 'future' && position.positionType !== 'future') {
      return apiJson(
        { error: 'Bad Request', message: 'Position is not a futures trade' },
        { status: 400 }
      );
    }

    if (type === 'option') {
      return await handleOptionClose(closeData, position, userId, requestLog);
    } else if (type === 'future') {
      return await handleFutureClose(closeData, position, userId, requestLog);
    } else {
      return await handleStockClose(closeData, position, userId, requestLog);
    }
  } catch (error) {
    requestLog.error({ error }, 'Failed to close trade');

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
      { error: 'Internal Server Error', message: 'Failed to close trade' },
      { status: 500 }
    );
  }
}

/**
 * Handle stock trade close.
 */
async function handleStockClose(
  body: unknown,
  position: DerivedPosition,
  userId: string,
  requestLog: Logger
) {
  // Validate close input
  const validated = closeStockTradeSchema.parse(body);

  // Create the closing transaction
  const transaction: NormalizedTransaction = {
    activityDate: normalizeActivityDate(validated.exitDate),
    activityTime: validated.exitTime || undefined,
    symbol: position.symbol,
    transCode: 'SELL',
    quantity: position.quantity.toNumber(),
    price: validated.exitPrice,
    amount: position.quantity.toNumber() * validated.exitPrice, // Positive = cash in
    eventType: 'EQUITY_STOCK',
    isOption: false,
    rawInstrument: position.symbol,
    rawDescription: validated.closingNotes || undefined,
    notes: validated.closingNotes || undefined,
  };

  // Create import context
  const context: ImportContext = {
    userId,
    brokerageAccountId: position.brokerageAccountId,
    broker: 'manual',
    sourceType: 'manual',
    importBatchId: null,
  };

  // Write to ledger
  const writeResult = await writeLedgerEvents(prisma, context, [transaction]);

  if (writeResult.errors.length > 0) {
    requestLog.error({ errors: writeResult.errors }, 'Failed to write closing event');
    return apiJson(
      { error: 'Write Error', message: writeResult.errors[0].message },
      { status: 400 }
    );
  }

  // Trigger derivation
  if (writeResult.inserted > 0) {
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }
  }

  // Calculate P&L for response
  const entryValue = position.quantity.toNumber() * position.avgPrice.toNumber();
  const exitValue = position.quantity.toNumber() * validated.exitPrice;
  const realizedPnL = position.side === 'long' ? exitValue - entryValue : entryValue - exitValue;

  requestLog.info(
    { userId, symbol: position.symbol, realizedPnL },
    'Stock trade closed'
  );

  return apiJson(
    {
      data: {
        type: 'stock',
        symbol: position.symbol,
        quantity: position.quantity.toNumber(),
        entryPrice: position.avgPrice.toNumber(),
        exitPrice: validated.exitPrice,
        exitDate: validated.exitDate,
        realizedPnL: Math.round(realizedPnL * 100) / 100,
      },
      message: 'Trade closed successfully',
    },
    { status: 201 }
  );
}

/**
 * Handle futures trade close.
 */
async function handleFutureClose(
  body: unknown,
  position: DerivedPosition,
  userId: string,
  requestLog: Logger
) {
  // Validate close input
  const validated = closeFutureTradeSchema.parse(body);

  // Determine transaction code based on side
  const transCode = position.side === 'short' ? 'BUY' : 'SELL';

  // Amount is cash in for SELL, cash out for BUY
  const amount = transCode === 'SELL'
    ? position.quantity.toNumber() * validated.exitPrice
    : -position.quantity.toNumber() * validated.exitPrice;

  // Create the closing transaction
  const transaction: NormalizedTransaction = {
    activityDate: normalizeActivityDate(validated.exitDate),
    activityTime: validated.exitTime || undefined,
    symbol: position.symbol,
    transCode,
    quantity: position.quantity.toNumber(),
    price: validated.exitPrice,
    amount,
    eventType: 'FUTURES',
    isOption: false,
    rawInstrument: position.symbol,
    rawDescription: validated.closingNotes || undefined,
    notes: validated.closingNotes || undefined,
  };

  // Create import context
  const context: ImportContext = {
    userId,
    brokerageAccountId: position.brokerageAccountId,
    broker: 'manual',
    sourceType: 'manual',
    importBatchId: null,
  };

  // Write to ledger
  const writeResult = await writeLedgerEvents(prisma, context, [transaction]);

  if (writeResult.errors.length > 0) {
    requestLog.error({ errors: writeResult.errors }, 'Failed to write closing event');
    return apiJson(
      { error: 'Write Error', message: writeResult.errors[0].message },
      { status: 400 }
    );
  }

  // Trigger derivation
  if (writeResult.inserted > 0) {
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }
  }

  // Calculate P&L for response
  const entryValue = position.quantity.toNumber() * position.avgPrice.toNumber();
  const exitValue = position.quantity.toNumber() * validated.exitPrice;
  const realizedPnL = position.side === 'long' ? exitValue - entryValue : entryValue - exitValue;

  requestLog.info(
    { userId, symbol: position.symbol, realizedPnL },
    'Future trade closed'
  );

  return apiJson(
    {
      data: {
        type: 'future',
        symbol: position.symbol,
        quantity: position.quantity.toNumber(),
        entryPrice: position.avgPrice.toNumber(),
        exitPrice: validated.exitPrice,
        exitDate: validated.exitDate,
        realizedPnL: Math.round(realizedPnL * 100) / 100,
      },
      message: 'Trade closed successfully',
    },
    { status: 201 }
  );
}

/**
 * Handle option trade close.
 */
async function handleOptionClose(
  body: unknown,
  position: DerivedPosition,
  userId: string,
  requestLog: Logger
) {
  // Validate close input
  const validated = closeOptionTradeSchema.parse(body);

  // For options, we expect optionLegs with exitPremium
  // For now, handle single-leg closes using the position data
  const exitPremium = validated.optionLegs[0]?.exitPremium ?? 0;
  const exitUnderlyingPrice = validated.exitUnderlyingPrice;

  // Determine transaction code based on position side
  // If we're long (BTO), close with STC
  // If we're short (STO), close with BTC
  const transCode = position.side === 'long' ? 'STC' : 'BTC';

  // Calculate amount
  // STC (selling what we bought) = cash in (positive)
  // BTC (buying back what we sold) = cash out (negative)
  const amount = transCode === 'STC'
    ? exitPremium * position.quantity.toNumber() * 100
    : -exitPremium * position.quantity.toNumber() * 100;

  // Create the closing transaction
  const transaction: NormalizedTransaction = {
    activityDate: normalizeActivityDate(validated.exitDate),
    activityTime: validated.exitTime || undefined,
    symbol: position.symbol,
    transCode,
    quantity: position.quantity.toNumber(),
    price: exitPremium,
    amount,
    eventType: 'EQUITY_OPTION',
    isOption: true,
    optionType: position.optionType as 'call' | 'put' | undefined,
    strike: position.strike?.toNumber(),
    expiration: position.expiration ?? undefined,
    rawInstrument: `${position.symbol} ${position.expiration?.toISOString().split('T')[0]} ${position.strike?.toNumber()} ${position.optionType?.toUpperCase()}`,
    rawDescription: validated.closingNotes || undefined,
    notes: validated.closingNotes || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strategy: position.strategy as any,
    // Underlying stock price at exit - stored in DB for reporting
    underlyingPrice: exitUnderlyingPrice ?? undefined,
  };

  // Create import context
  const context: ImportContext = {
    userId,
    brokerageAccountId: position.brokerageAccountId,
    broker: 'manual',
    sourceType: 'manual',
    importBatchId: null,
  };

  // Write to ledger
  const writeResult = await writeLedgerEvents(prisma, context, [transaction]);

  if (writeResult.errors.length > 0) {
    requestLog.error({ errors: writeResult.errors }, 'Failed to write closing event');
    return apiJson(
      { error: 'Write Error', message: writeResult.errors[0].message },
      { status: 400 }
    );
  }

  // Trigger derivation
  if (writeResult.inserted > 0) {
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }
  }

  // Calculate P&L for response
  const entryPremium = position.avgPrice.toNumber();
  const quantity = position.quantity.toNumber();
  let realizedPnL: number;

  if (position.side === 'long') {
    // Long option: profit when exit > entry
    realizedPnL = (exitPremium - entryPremium) * quantity * 100;
  } else {
    // Short option: profit when entry > exit
    realizedPnL = (entryPremium - exitPremium) * quantity * 100;
  }

  requestLog.info(
    { userId, symbol: position.symbol, realizedPnL },
    'Option trade closed'
  );

  return apiJson(
    {
      data: {
        type: 'option',
        symbol: position.symbol,
        optionType: position.optionType,
        strike: position.strike?.toNumber(),
        expiration: position.expiration,
        quantity,
        entryPremium,
        exitPremium,
        exitUnderlyingPrice: exitUnderlyingPrice ?? null,
        exitDate: validated.exitDate,
        realizedPnL: Math.round(realizedPnL * 100) / 100,
      },
      message: 'Trade closed successfully',
    },
    { status: 201 }
  );
}

