import { apiJson } from '@/lib/api/response';
/**
 * Single Entry API Route
 *
 * GET /api/entries/[id] - Get a single ledger event by ID
 * PATCH /api/entries/[id] - Update a ledger event
 * DELETE /api/entries/[id] - Soft delete a ledger event
 *
 * Edit updates the ledger event and re-triggers derivation.
 */


import { checkAuthApi } from '@/lib/auth';
import { createChildLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { fullRederivation } from '@/lib/services/derivation-runner';
import { z } from 'zod';
import crypto from 'crypto';

const log = createChildLogger({ module: 'api-entries-id' });

/**
 * Schema for updating a stock entry.
 */
const updateStockEntrySchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters')
    .optional(),
  entryDate: z.coerce.date().optional(),
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .optional(),
  entryPrice: z
    .coerce.number()
    .positive('Entry price must be positive')
    .multipleOf(0.0001, 'Price can have at most 4 decimal places')
    .optional(),
  notes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

/**
 * Schema for updating an option entry.
 */
const updateOptionEntrySchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters')
    .optional(),
  entryDate: z.coerce.date().optional(),
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .optional(),
  premium: z
    .coerce.number()
    .nonnegative('Premium cannot be negative')
    .multipleOf(0.0001, 'Premium can have at most 4 decimal places')
    .optional(),
  strike: z.coerce
    .number()
    .positive('Strike price must be positive')
    .multipleOf(0.0001, 'Strike can have at most 4 decimal places')
    .optional(),
  expiration: z.coerce.date().optional(),
  notes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

/**
 * GET /api/entries/[id]
 *
 * Get a single ledger event by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id } = await params;

    requestLog.info({ userId, id }, 'Fetching ledger event');

    const event = await prisma.ledgerEvent.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!event) {
      return apiJson(
        { error: 'Not Found', message: 'Entry not found' },
        { status: 404 }
      );
    }

    // Format for frontend consumption
    const formattedEvent = {
      id: event.id,
      type: event.isOption ? 'option' : 'stock',
      symbol: event.symbol,
      transCode: event.transCode,
      quantity: Number(event.quantity),
      price: event.price ? Number(event.price) : null,
      amount: event.amount ? Number(event.amount) : null,
      activityDate: event.activityDate.toISOString(),
      notes: event.notes || event.description,
      // Option-specific fields
      isOption: event.isOption,
      optionType: event.optionType,
      strike: event.strike ? Number(event.strike) : null,
      expiration: event.expiration?.toISOString() || null,
      strategy: event.strategy,
      // Metadata
      broker: event.broker,
      sourceType: event.sourceType,
      eventType: event.eventType,
      createdAt: event.createdAt.toISOString(),
    };

    return apiJson({ data: formattedEvent });
  } catch (error) {
    requestLog.error({ error }, 'Failed to fetch ledger event');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch entry' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/entries/[id]
 *
 * Update a ledger event.
 * This modifies the existing event and re-triggers derivation.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id } = await params;
    const body = await request.json();

    requestLog.info({ userId, id }, 'Updating ledger event');

    // Fetch existing event
    const existingEvent = await prisma.ledgerEvent.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!existingEvent) {
      return apiJson(
        { error: 'Not Found', message: 'Entry not found' },
        { status: 404 }
      );
    }

    // Validate based on type
    const isOption = existingEvent.isOption;
    const validated = isOption
      ? updateOptionEntrySchema.parse(body)
      : updateStockEntrySchema.parse(body);

    // Build update data
    const updateData: Record<string, unknown> = {};

    if ('ticker' in validated && validated.ticker !== undefined) {
      updateData.symbol = validated.ticker;
    }

    if ('entryDate' in validated && validated.entryDate !== undefined) {
      // Normalize to UTC noon
      const date = new Date(validated.entryDate);
      date.setUTCHours(12, 0, 0, 0);
      updateData.activityDate = date;
    }

    if ('quantity' in validated && validated.quantity !== undefined) {
      updateData.quantity = validated.quantity;
    }

    if ('entryPrice' in validated && validated.entryPrice !== undefined) {
      updateData.price = validated.entryPrice;
      // Recalculate amount for stocks
      if (!isOption) {
        const qty = validated.quantity ?? Number(existingEvent.quantity);
        const isBuy = existingEvent.transCode === 'BUY';
        updateData.amount = isBuy
          ? -qty * validated.entryPrice
          : qty * validated.entryPrice;
      }
    }

    // Option-specific updates
    if (isOption) {
      if ('premium' in validated && validated.premium !== undefined) {
        updateData.price = validated.premium;
        // Recalculate amount for options
        const qty = validated.quantity ?? Number(existingEvent.quantity);
        const isBuy = existingEvent.transCode === 'BTO';
        // Options multiply by 100 for contract size
        updateData.amount = isBuy
          ? -validated.premium * qty * 100
          : validated.premium * qty * 100;
      }

      if ('strike' in validated && validated.strike !== undefined) {
        updateData.strike = validated.strike;
      }

      if ('expiration' in validated && validated.expiration !== undefined) {
        updateData.expiration = validated.expiration;
      }
    }

    if ('notes' in validated) {
      updateData.notes = validated.notes;
      updateData.description = validated.notes;
    }

    // Regenerate event hash if key fields changed
    if (
      updateData.activityDate ||
      updateData.symbol ||
      updateData.quantity ||
      updateData.price ||
      updateData.amount
    ) {
      const hashData = {
        userId,
        brokerageAccountId: existingEvent.brokerageAccountId,
        activityDate: (updateData.activityDate as Date || existingEvent.activityDate).toISOString(),
        symbol: (updateData.symbol as string) || existingEvent.symbol,
        transCode: existingEvent.transCode,
        quantity: String(updateData.quantity ?? existingEvent.quantity),
        price: String(updateData.price ?? existingEvent.price ?? ''),
        amount: String(updateData.amount ?? existingEvent.amount ?? ''),
      };
      const hashString = Object.values(hashData).join('|');
      updateData.eventHash = crypto.createHash('sha256').update(hashString).digest('hex');
    }

    // Update the event
    const updatedEvent = await prisma.ledgerEvent.update({
      where: { id },
      data: updateData,
    });

    // Re-trigger derivation
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed after update');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }

    requestLog.info(
      { userId, id, symbol: updatedEvent.symbol },
      'Ledger event updated'
    );

    return apiJson({
      data: {
        id: updatedEvent.id,
        symbol: updatedEvent.symbol,
        type: updatedEvent.isOption ? 'option' : 'stock',
      },
      message: 'Entry updated successfully',
    });
  } catch (error) {
    requestLog.error({ error }, 'Failed to update ledger event');

    if (error instanceof z.ZodError) {
      return apiJson(
        {
          error: 'Validation Error',
          message: error.issues?.[0]?.message || 'Invalid input',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to update entry' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/entries/[id]
 *
 * Soft delete a ledger event.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const requestLog = log.child({ correlationId });

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { id } = await params;

    requestLog.info({ userId, id }, 'Deleting ledger event');

    // Verify ownership
    const existingEvent = await prisma.ledgerEvent.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!existingEvent) {
      return apiJson(
        { error: 'Not Found', message: 'Entry not found' },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.ledgerEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Re-trigger derivation
    try {
      await fullRederivation(prisma, userId);
      requestLog.info({ userId }, 'Derivation completed after delete');
    } catch (derivationError) {
      requestLog.warn({ error: derivationError }, 'Derivation failed - positions may be stale');
    }

    requestLog.info({ userId, id }, 'Ledger event deleted');

    return apiJson({
      data: { id },
      message: 'Entry deleted successfully',
    });
  } catch (error) {
    requestLog.error({ error }, 'Failed to delete ledger event');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete entry' },
      { status: 500 }
    );
  }
}
