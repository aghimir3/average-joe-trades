/**
 * Issue Resolution Service
 *
 * Handles resolution of import issues, particularly unknown basis issues.
 * When a user provides the missing basis information, this service:
 * 1. Creates a manual LedgerEvent for the missing open position
 * 2. Triggers re-derivation to match with the existing close
 * 3. Marks the issue as resolved
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';
import { generateEventHash } from './ledger-write';
import { fullRederivation } from './derivation-runner';
import type { NormalizedTransaction, TransCode, EventType, OptionType } from '@/lib/importers/types';

const log = createChildLogger({ module: 'issue-resolution' });

export interface ResolveUnknownBasisParams {
  userId: string;
  issueId: string;
  closeEventId: string;
  openDate: Date;
  openPrice: number;
  openQuantity?: number;
  notes?: string;
}

export interface ResolveUnknownBasisResult {
  newOpenEventId: string;
  newPnL: number;
  resolved: boolean;
}

/**
 * Resolve an unknown basis issue by creating the missing open position.
 *
 * This function:
 * 1. Fetches the close event to understand what was closed
 * 2. Creates a matching open event (BUY for stock, BTO/STO for options)
 * 3. Triggers full re-derivation to recalculate P&L
 * 4. Marks the issue as resolved
 *
 * @param prisma - Prisma client
 * @param params - Resolution parameters
 * @returns Result with new event ID and calculated P&L
 */
export async function resolveUnknownBasis(
  prisma: PrismaClient,
  params: ResolveUnknownBasisParams
): Promise<ResolveUnknownBasisResult> {
  const { userId, issueId, closeEventId, openDate, openPrice, openQuantity, notes } = params;

  log.info(
    { userId, issueId, closeEventId, openDate, openPrice },
    'Resolving unknown basis issue'
  );

  // 1. Fetch the close event
  const closeEvent = await prisma.ledgerEvent.findUnique({
    where: { id: closeEventId },
  });

  if (!closeEvent) {
    throw new Error('Close event not found');
  }

  if (closeEvent.userId !== userId) {
    throw new Error('Unauthorized access to close event');
  }

  // 2. Determine the correct opening transaction code
  const openTransCode = getOpeningTransCode(closeEvent.transCode, closeEvent.isOption);
  const quantity = openQuantity ?? Number(closeEvent.quantity);
  const amount = quantity * openPrice * (closeEvent.isOption ? 100 : 1);

  // 3. Get the user's default brokerage account (or the same as the close event)
  const brokerageAccountId = closeEvent.brokerageAccountId;

  // 4. Create the normalized transaction for hash generation
  const normalizedTxn: NormalizedTransaction = {
    activityDate: openDate,
    symbol: closeEvent.symbol,
    transCode: openTransCode as TransCode,
    quantity,
    price: openPrice,
    amount: openTransCode === 'STO' ? amount : -amount, // STO receives premium, others pay
    eventType: closeEvent.eventType as EventType,
    isOption: closeEvent.isOption,
    optionType: (closeEvent.optionType as OptionType) ?? undefined,
    strike: closeEvent.strike ? Number(closeEvent.strike) : undefined,
    expiration: closeEvent.expiration ?? undefined,
    rawInstrument: closeEvent.instrument,
    rawDescription: `Manual basis entry for ${closeEvent.symbol}`,
    notes: notes || `Basis correction for unknown basis close on ${closeEvent.activityDate.toISOString().split('T')[0]}`,
  };

  // 5. Generate event hash
  const eventHash = generateEventHash(userId, brokerageAccountId, normalizedTxn);

  // 6. Check if this exact event already exists (idempotency)
  const existingEvent = await prisma.ledgerEvent.findUnique({
    where: { eventHash },
  });

  if (existingEvent) {
    throw new Error('A matching open position already exists');
  }

  // 7. Create the new open event and resolve the issue in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the new ledger event
    const newEvent = await tx.ledgerEvent.create({
      data: {
        userId,
        brokerageAccountId,
        broker: 'manual',
        sourceType: 'manual',
        activityDate: openDate,
        instrument: closeEvent.instrument,
        description: normalizedTxn.rawDescription,
        transCode: openTransCode,
        quantity: new Prisma.Decimal(quantity),
        price: new Prisma.Decimal(openPrice),
        amount: new Prisma.Decimal(normalizedTxn.amount ?? 0),
        symbol: closeEvent.symbol,
        eventType: closeEvent.eventType,
        action: getActionFromTransCode(openTransCode),
        isOption: closeEvent.isOption,
        optionType: closeEvent.optionType,
        strike: closeEvent.strike,
        expiration: closeEvent.expiration,
        notes: normalizedTxn.notes,
        eventHash,
      },
    });

    // Mark the issue as resolved
    await tx.importIssue.update({
      where: { id: issueId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution: `Created manual open position (${openTransCode}) dated ${openDate.toISOString().split('T')[0]} at $${openPrice.toFixed(2)}`,
      },
    });

    return newEvent;
  });

  log.info(
    { userId, issueId, newEventId: result.id },
    'Created manual open position, triggering re-derivation'
  );

  // 8. Trigger full re-derivation to recalculate P&L
  const derivationResult = await fullRederivation(prisma, userId);

  // 9. Find the new P&L for the close
  // Look for the realized close that matches our close event
  const updatedClose = await prisma.realizedClose.findFirst({
    where: {
      userId,
      symbol: closeEvent.symbol,
      closeDate: closeEvent.activityDate,
      hasUnknownBasis: false, // Should now be resolved
    },
    include: {
      ledgerLinks: {
        where: { closeEventId },
      },
    },
    orderBy: { derivedAt: 'desc' },
  });

  const newPnL = updatedClose ? Number(updatedClose.realizedPnL) : 0;

  log.info(
    {
      userId,
      issueId,
      newEventId: result.id,
      newPnL,
      totalPositions: derivationResult.allAccountsSummary.totalPositions,
      totalCloses: derivationResult.allAccountsSummary.totalCloses,
    },
    'Unknown basis issue resolved successfully'
  );

  return {
    newOpenEventId: result.id,
    newPnL,
    resolved: true,
  };
}

/**
 * Get the opening transaction code that corresponds to a closing transaction.
 */
function getOpeningTransCode(closeTransCode: string, isOption: boolean): string {
  const code = closeTransCode.toUpperCase();

  if (!isOption) {
    // Stock: SELL closes a BUY
    return 'BUY';
  }

  // Options
  switch (code) {
    case 'STC': // Sell to Close - closes a long position
      return 'BTO'; // Buy to Open
    case 'BTC': // Buy to Close - closes a short position
      return 'STO'; // Sell to Open
    case 'OEXP': // Expiration - could be either
    case 'OASGN': // Assignment - could be either
      // Default to STO for wheel strategies (most common unknown basis case)
      // User can adjust if needed
      return 'STO';
    default:
      return 'BTO';
  }
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
  };
  return actionMap[transCode] || 'buy';
}

/**
 * Get unresolved issues count for a user.
 * Useful for displaying a badge in the navigation.
 */
export async function getUnresolvedIssueCount(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  return prisma.importIssue.count({
    where: {
      userId,
      isResolved: false,
    },
  });
}

/**
 * Get unknown basis issues for a user.
 */
export async function getUnknownBasisIssues(
  prisma: PrismaClient,
  userId: string
): Promise<
  Array<{
    id: string;
    symbol: string | null;
    message: string;
    createdAt: Date;
    ledgerEventId: string | null;
  }>
> {
  return prisma.importIssue.findMany({
    where: {
      userId,
      issueType: 'unknown_basis',
      isResolved: false,
    },
    select: {
      id: true,
      symbol: true,
      message: true,
      createdAt: true,
      ledgerEventId: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}
