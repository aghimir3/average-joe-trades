/**
 * Manual Entry Service
 *
 * Handles manual trade entry by converting user input to ledger events.
 * This replaces the legacy Trade table writes for manual entries.
 *
 * Flow:
 * 1. User submits manual trade form
 * 2. Form data is validated with Zod
 * 3. ManualEntryService converts to NormalizedTransaction(s)
 * 4. Ledger write service persists to LedgerEvent
 * 5. Derivation runner re-derives positions and P&L
 * 6. Returns the created position/close IDs for UI
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import {
  writeLedgerEvents,
  writeSingleLedgerEvent,
} from './ledger-write';
import { fullRederivation } from './derivation-runner';
import type {
  NormalizedTransaction,
  ImportContext,
  TransCode,
  EventType,
  OptionType,
  OptionStrategy,
} from '@/lib/importers/types';
import {
  normalizeActivityDate,
  normalizeSymbol,
} from '@/lib/importers/types';

const log = createChildLogger({ module: 'manual-entry' });

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating a manual stock trade.
 */
export interface ManualStockInput {
  brokerageAccountId: string;
  action: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price: number;
  date: Date;
  fees?: number;
  notes?: string;
}

/**
 * Input for creating a manual option trade (single leg).
 */
export interface ManualOptionInput {
  brokerageAccountId: string;
  action: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  quantity: number;
  premium: number; // Per contract
  date: Date;
  strategy?: OptionStrategy;
  fees?: number;
  notes?: string;
}

/**
 * Input for a single leg in a multi-leg option trade.
 */
export interface OptionLegInput {
  action: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  quantity: number;
  premium: number;
}

/**
 * Input for creating a multi-leg option trade (spread, straddle, etc.).
 */
export interface ManualMultiLegOptionInput {
  brokerageAccountId: string;
  symbol: string;
  strategy: OptionStrategy;
  legs: OptionLegInput[];
  date: Date;
  fees?: number;
  notes?: string;
}

/**
 * Input for closing an open position.
 */
export interface ClosePositionInput {
  positionId: string; // DerivedPosition.id
  quantity: number;
  price: number;
  date: Date;
  fees?: number;
  notes?: string;
}

/**
 * Input for recording an option expiration.
 */
export interface ExpireOptionInput {
  positionId: string;
  date: Date;
  notes?: string;
}

/**
 * Input for recording an option assignment.
 */
export interface AssignOptionInput {
  positionId: string;
  date: Date;
  notes?: string;
}

/**
 * Result from a manual entry operation.
 */
export interface ManualEntryResult {
  success: boolean;
  ledgerEventIds: string[];
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTransCodeForStockAction(action: 'buy' | 'sell'): TransCode {
  return action === 'buy' ? 'BUY' : 'SELL';
}

function getTransCodeForOptionAction(
  action: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close'
): TransCode {
  switch (action) {
    case 'buy_to_open':
      return 'BTO';
    case 'sell_to_open':
      return 'STO';
    case 'buy_to_close':
      return 'BTC';
    case 'sell_to_close':
      return 'STC';
  }
}

function generatePositionGroupId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Manual Entry Functions
// ============================================================================

/**
 * Create a manual stock trade.
 */
export async function createManualStockTrade(
  prisma: PrismaClient,
  userId: string,
  input: ManualStockInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Creating manual stock trade');

  try {
    const transCode = getTransCodeForStockAction(input.action);
    const normalizedDate = normalizeActivityDate(input.date);
    const symbol = normalizeSymbol(input.symbol);

    // Calculate total amount
    const amount = input.quantity * input.price;

    const transaction: NormalizedTransaction = {
      activityDate: normalizedDate,
      symbol,
      transCode,
      quantity: input.quantity,
      price: input.price,
      amount,
      fees: input.fees,
      eventType: 'EQUITY_STOCK',
      isOption: false,
      rawInstrument: symbol,
      rawDescription: `Manual ${input.action.toUpperCase()} ${input.quantity} ${symbol} @ ${input.price}`,
      notes: input.notes,
    };

    const context: ImportContext = {
      userId,
      brokerageAccountId: input.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeSingleLedgerEvent(prisma, context, transaction);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    // Re-derive positions
    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Manual stock trade created');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to create manual stock trade');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Create a manual single-leg option trade.
 */
export async function createManualOptionTrade(
  prisma: PrismaClient,
  userId: string,
  input: ManualOptionInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Creating manual option trade');

  try {
    const transCode = getTransCodeForOptionAction(input.action);
    const normalizedDate = normalizeActivityDate(input.date);
    const symbol = normalizeSymbol(input.symbol);
    const expNormalized = normalizeActivityDate(input.expiration);

    // Option premium is per contract, amount = premium * quantity * 100
    const amount = input.premium * input.quantity * 100;

    // Build instrument string
    const expStr = input.expiration.toISOString().split('T')[0];
    const instrument = `${symbol} ${expStr} ${input.strike} ${input.optionType.toUpperCase()}`;

    const transaction: NormalizedTransaction = {
      activityDate: normalizedDate,
      symbol,
      transCode,
      quantity: input.quantity,
      price: input.premium,
      amount,
      fees: input.fees,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: input.optionType,
      strike: input.strike,
      expiration: expNormalized,
      rawInstrument: instrument,
      rawDescription: `Manual ${transCode} ${input.quantity} ${instrument} @ ${input.premium}`,
      strategy: input.strategy,
      notes: input.notes,
    };

    const context: ImportContext = {
      userId,
      brokerageAccountId: input.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeSingleLedgerEvent(prisma, context, transaction);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Manual option trade created');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to create manual option trade');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Create a manual multi-leg option trade (spread, straddle, etc.).
 * All legs share the same positionGroupId for grouping.
 */
export async function createManualMultiLegOptionTrade(
  prisma: PrismaClient,
  userId: string,
  input: ManualMultiLegOptionInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Creating manual multi-leg option trade');

  try {
    const normalizedDate = normalizeActivityDate(input.date);
    const symbol = normalizeSymbol(input.symbol);
    const positionGroupId = generatePositionGroupId();

    const transactions: NormalizedTransaction[] = input.legs.map((leg, index) => {
      const transCode = getTransCodeForOptionAction(leg.action);
      const expNormalized = normalizeActivityDate(leg.expiration);
      const amount = leg.premium * leg.quantity * 100;

      const expStr = leg.expiration.toISOString().split('T')[0];
      const instrument = `${symbol} ${expStr} ${leg.strike} ${leg.optionType.toUpperCase()}`;

      return {
        activityDate: normalizedDate,
        symbol,
        transCode,
        quantity: leg.quantity,
        price: leg.premium,
        amount,
        fees: index === 0 ? input.fees : undefined, // Fees only on first leg
        eventType: 'EQUITY_OPTION' as EventType,
        isOption: true,
        optionType: leg.optionType as OptionType,
        strike: leg.strike,
        expiration: expNormalized,
        rawInstrument: instrument,
        rawDescription: `Manual ${transCode} ${leg.quantity} ${instrument} @ ${leg.premium}`,
        strategy: input.strategy,
        positionGroupId,
        notes: index === 0 ? input.notes : undefined,
      };
    });

    const context: ImportContext = {
      userId,
      brokerageAccountId: input.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeLedgerEvents(prisma, context, transactions);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Manual multi-leg option trade created');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to create manual multi-leg option trade');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Close an open position by creating a closing ledger event.
 */
export async function closePosition(
  prisma: PrismaClient,
  userId: string,
  input: ClosePositionInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Closing position');

  try {
    // Fetch the position to get instrument details
    const position = await prisma.derivedPosition.findFirst({
      where: {
        id: input.positionId,
        userId,
      },
    });

    if (!position) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: ['Position not found'],
        warnings: [],
      };
    }

    // Validate quantity
    if (input.quantity > Number(position.quantity)) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: [`Cannot close ${input.quantity} - only ${position.quantity} available`],
        warnings: [],
      };
    }

    const normalizedDate = normalizeActivityDate(input.date);

    // Determine transaction code based on position
    let transCode: TransCode;
    if (position.positionType === 'stock' || position.positionType === 'future') {
      transCode = position.side === 'long' ? 'SELL' : 'BUY';
    } else {
      transCode = position.side === 'long' ? 'STC' : 'BTC';
    }

    // Calculate amount
    const amount = position.positionType === 'option'
      ? input.price * input.quantity * 100
      : input.price * input.quantity;

    // Build instrument string
    let instrument: string;
    if (position.positionType === 'option') {
      const expStr = position.expiration?.toISOString().split('T')[0] || '';
      instrument = `${position.symbol} ${expStr} ${position.strike} ${position.optionType?.toUpperCase()}`;
    } else {
      instrument = position.symbol;
    }

    const transaction: NormalizedTransaction = {
      activityDate: normalizedDate,
      symbol: position.symbol,
      transCode,
      quantity: input.quantity,
      price: input.price,
      amount,
      fees: input.fees,
      eventType: position.positionType === 'option'
        ? 'EQUITY_OPTION'
        : position.positionType === 'future'
          ? 'FUTURES'
          : 'EQUITY_STOCK',
      isOption: position.positionType === 'option',
      optionType: position.optionType as OptionType | undefined,
      strike: position.strike ? Number(position.strike) : undefined,
      expiration: position.expiration || undefined,
      rawInstrument: instrument,
      rawDescription: `Manual close ${transCode} ${input.quantity} ${instrument} @ ${input.price}`,
      notes: input.notes,
    };

    const context: ImportContext = {
      userId,
      brokerageAccountId: position.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeSingleLedgerEvent(prisma, context, transaction);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Position closed');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to close position');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Record an option expiration.
 */
export async function expireOption(
  prisma: PrismaClient,
  userId: string,
  input: ExpireOptionInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Recording option expiration');

  try {
    const position = await prisma.derivedPosition.findFirst({
      where: {
        id: input.positionId,
        userId,
        positionType: 'option',
      },
    });

    if (!position) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: ['Option position not found'],
        warnings: [],
      };
    }

    const normalizedDate = normalizeActivityDate(input.date);
    const expStr = position.expiration?.toISOString().split('T')[0] || '';
    const instrument = `${position.symbol} ${expStr} ${position.strike} ${position.optionType?.toUpperCase()}`;

    const transaction: NormalizedTransaction = {
      activityDate: normalizedDate,
      symbol: position.symbol,
      transCode: 'OEXP',
      quantity: Number(position.quantity),
      price: 0,
      amount: 0,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: position.optionType as OptionType | undefined,
      strike: position.strike ? Number(position.strike) : undefined,
      expiration: position.expiration || undefined,
      rawInstrument: instrument,
      rawDescription: `Option expired: ${instrument}`,
      notes: input.notes,
    };

    const context: ImportContext = {
      userId,
      brokerageAccountId: position.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeSingleLedgerEvent(prisma, context, transaction);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Option expiration recorded');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to record option expiration');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Record an option assignment.
 */
export async function assignOption(
  prisma: PrismaClient,
  userId: string,
  input: AssignOptionInput
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, input }, 'Recording option assignment');

  try {
    const position = await prisma.derivedPosition.findFirst({
      where: {
        id: input.positionId,
        userId,
        positionType: 'option',
      },
    });

    if (!position) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: ['Option position not found'],
        warnings: [],
      };
    }

    const normalizedDate = normalizeActivityDate(input.date);
    const expStr = position.expiration?.toISOString().split('T')[0] || '';
    const instrument = `${position.symbol} ${expStr} ${position.strike} ${position.optionType?.toUpperCase()}`;

    const transaction: NormalizedTransaction = {
      activityDate: normalizedDate,
      symbol: position.symbol,
      transCode: 'OASGN',
      quantity: Number(position.quantity),
      price: 0,
      amount: 0,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: position.optionType as OptionType | undefined,
      strike: position.strike ? Number(position.strike) : undefined,
      expiration: position.expiration || undefined,
      rawInstrument: instrument,
      rawDescription: `Option assigned: ${instrument}`,
      notes: input.notes,
    };

    const context: ImportContext = {
      userId,
      brokerageAccountId: position.brokerageAccountId,
      broker: 'manual',
      sourceType: 'manual',
    };

    const result = await writeSingleLedgerEvent(prisma, context, transaction);

    if (result.errors.length > 0) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: result.errors.map(e => e.message),
        warnings: result.warnings.map(w => w.message),
      };
    }

    await fullRederivation(prisma, userId);

    log.info({ correlationId, eventIds: result.insertedIds }, 'Option assignment recorded');

    return {
      success: true,
      ledgerEventIds: result.insertedIds,
      errors: [],
      warnings: result.warnings.map(w => w.message),
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to record option assignment');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}

/**
 * Delete a manual ledger event (soft delete).
 * Re-derives positions after deletion.
 */
export async function deleteManualEntry(
  prisma: PrismaClient,
  userId: string,
  ledgerEventId: string
): Promise<ManualEntryResult> {
  const correlationId = crypto.randomUUID();
  log.info({ correlationId, userId, ledgerEventId }, 'Deleting manual entry');

  try {
    // Verify ownership and that it's a manual entry
    const event = await prisma.ledgerEvent.findFirst({
      where: {
        id: ledgerEventId,
        userId,
        sourceType: 'manual',
        deletedAt: null,
      },
    });

    if (!event) {
      return {
        success: false,
        ledgerEventIds: [],
        errors: ['Manual entry not found or already deleted'],
        warnings: [],
      };
    }

    // Soft delete
    await prisma.ledgerEvent.update({
      where: { id: ledgerEventId },
      data: { deletedAt: new Date() },
    });

    // Re-derive positions
    await fullRederivation(prisma, userId);

    log.info({ correlationId, ledgerEventId }, 'Manual entry deleted');

    return {
      success: true,
      ledgerEventIds: [ledgerEventId],
      errors: [],
      warnings: [],
    };
  } catch (error) {
    log.error({ correlationId, error }, 'Failed to delete manual entry');
    return {
      success: false,
      ledgerEventIds: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      warnings: [],
    };
  }
}
