/**
 * PATCH /api/calendar/trade-type
 *
 * Override the auto-computed trade type (daytrade/swingtrade) for a specific trade.
 * Stores the override keyed by composite fields that survive re-derivation.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiJson, apiBadRequest, apiNotFound, apiInternalError } from '@/lib/api/response';

const bodySchema = z.object({
  realizedCloseId: z.string().uuid(),
  tradeType: z.enum(['daytrade', 'swingtrade']),
});

export async function PATCH(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;
    const userId = session.user.id;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return apiBadRequest('Invalid request body', parsed.error.flatten());

    const { realizedCloseId, tradeType } = parsed.data;

    // Look up the RealizedClose to get composite key fields
    const trade = await prisma.realizedClose.findFirst({
      where: { id: realizedCloseId, userId },
      select: {
        symbol: true,
        openDate: true,
        closeDate: true,
        closeType: true,
        optionType: true,
        strike: true,
        expiration: true,
      },
    });

    if (!trade) return apiNotFound('Trade not found');

    // Check if override matches auto-computed value — if so, delete override
    const isSameDay =
      trade.openDate.getUTCFullYear() === trade.closeDate.getUTCFullYear() &&
      trade.openDate.getUTCMonth() === trade.closeDate.getUTCMonth() &&
      trade.openDate.getUTCDate() === trade.closeDate.getUTCDate();
    const autoType = isSameDay ? 'daytrade' : 'swingtrade';

    if (tradeType === autoType) {
      // Remove override — auto value matches
      await prisma.tradeClassification.deleteMany({
        where: {
          userId,
          symbol: trade.symbol,
          openDate: trade.openDate,
          closeDate: trade.closeDate,
          closeType: trade.closeType,
          optionType: trade.optionType,
          strike: trade.strike,
          expiration: trade.expiration,
        },
      });

      log.info({ userId, realizedCloseId, tradeType }, 'Trade type override removed (matches auto)');
      return apiJson({ data: { tradeType, isOverridden: false } });
    }

    // Delete-then-create (avoids composite unique where clause nullable type issues)
    await prisma.tradeClassification.deleteMany({
      where: {
        userId,
        symbol: trade.symbol,
        openDate: trade.openDate,
        closeDate: trade.closeDate,
        closeType: trade.closeType,
        optionType: trade.optionType,
        strike: trade.strike,
        expiration: trade.expiration,
      },
    });
    await prisma.tradeClassification.create({
      data: {
        userId,
        symbol: trade.symbol,
        openDate: trade.openDate,
        closeDate: trade.closeDate,
        closeType: trade.closeType,
        optionType: trade.optionType,
        strike: trade.strike,
        expiration: trade.expiration,
        tradeType,
      },
    });

    log.info({ userId, realizedCloseId, tradeType }, 'Trade type override saved');
    return apiJson({ data: { tradeType, isOverridden: true } });
  } catch (error) {
    log.error({ error, correlationId }, 'Failed to update trade type');
    return apiInternalError('Failed to update trade type');
  }
}
