import { apiJson } from '@/lib/api/response';
/**
 * Single Import Issue API Route
 *
 * GET /api/issues/[id] - Get issue details with related data
 * PATCH /api/issues/[id] - Resolve unknown basis issue
 * DELETE /api/issues/[id] - Delete a resolved issue
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { resolveUnknownBasis } from '@/lib/services/issue-resolution';

/**
 * Schema for resolving unknown basis issue.
 */
const resolveUnknownBasisSchema = z.object({
  action: z.literal('resolve_unknown_basis'),
  openDate: z.string().transform((v) => new Date(v)),
  openPrice: z.number().positive('Open price must be positive'),
  openQuantity: z.number().positive('Quantity must be positive').optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Schema for marking issue as resolved (general).
 */
const markResolvedSchema = z.object({
  action: z.literal('mark_resolved'),
  resolution: z.string().max(500),
});

/**
 * Schema for dismissing an issue.
 * Requires a reason explaining why the issue cannot be resolved.
 */
const dismissSchema = z.object({
  action: z.literal('dismiss'),
  reason: z.string().min(10, 'Please provide a reason (at least 10 characters)').max(500),
});

const patchBodySchema = z.discriminatedUnion('action', [
  resolveUnknownBasisSchema,
  markResolvedSchema,
  dismissSchema,
]);

/**
 * GET /api/issues/[id]
 *
 * Get detailed information about an import issue.
 * Includes related RealizedClose and LedgerEvent data for unknown basis issues.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  const { id } = await params;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId, issueId: id }, 'Fetching issue details');

    // Fetch issue
    const issue = await prisma.importIssue.findFirst({
      where: { id, userId },
    });

    if (!issue) {
      return apiJson(
        { error: 'Not Found', message: 'Issue not found' },
        { status: 404 }
      );
    }

    // Parse details JSON
    let details: Record<string, unknown> = {};
    if (issue.details) {
      try {
        details = JSON.parse(issue.details);
      } catch {
        details = { raw: issue.details };
      }
    }

    // For unknown basis issues, fetch the related RealizedClose
    let relatedClose = null;
    let relatedEvent = null;

    if (issue.issueType === 'unknown_basis' && issue.ledgerEventId) {
      // Find the RealizedClose that has hasUnknownBasis and matches this close event
      relatedClose = await prisma.realizedClose.findFirst({
        where: {
          userId,
          hasUnknownBasis: true,
        },
        include: {
          ledgerLinks: {
            where: { closeEventId: issue.ledgerEventId },
          },
        },
      });

      // Get the ledger event details
      relatedEvent = await prisma.ledgerEvent.findUnique({
        where: { id: issue.ledgerEventId },
        select: {
          id: true,
          activityDate: true,
          symbol: true,
          transCode: true,
          quantity: true,
          price: true,
          amount: true,
          isOption: true,
          optionType: true,
          strike: true,
          expiration: true,
          instrument: true,
          description: true,
        },
      });
    }

    log.info({ userId, issueId: id }, 'Issue details fetched');

    return apiJson({
      data: {
        ...issue,
        details,
        relatedClose: relatedClose
          ? {
              id: relatedClose.id,
              symbol: relatedClose.symbol,
              closeType: relatedClose.closeType,
              side: relatedClose.side,
              quantity: relatedClose.quantity,
              closeDate: relatedClose.closeDate,
              closePrice: relatedClose.closePrice,
              closeAmount: relatedClose.closeAmount,
              closeReason: relatedClose.closeReason,
              optionType: relatedClose.optionType,
              strike: relatedClose.strike,
              expiration: relatedClose.expiration,
            }
          : null,
        relatedEvent,
      },
    });
  } catch (error) {
    log.error({ error, issueId: id }, 'Failed to fetch issue details');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch issue details' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/issues/[id]
 *
 * Resolve an import issue.
 *
 * For unknown_basis issues:
 * - Creates a manual LedgerEvent for the missing open
 * - Triggers re-derivation to match with the close
 * - Marks the issue as resolved
 *
 * For other issues:
 * - Simply marks as resolved with a note
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  const { id } = await params;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId, issueId: id }, 'Resolving issue');

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = patchBodySchema.safeParse(body);
    if (!validation.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Fetch the issue
    const issue = await prisma.importIssue.findFirst({
      where: { id, userId },
    });

    if (!issue) {
      return apiJson(
        { error: 'Not Found', message: 'Issue not found' },
        { status: 404 }
      );
    }

    if (issue.isResolved) {
      return apiJson(
        { error: 'Conflict', message: 'Issue is already resolved' },
        { status: 409 }
      );
    }

    const data = validation.data;

    if (data.action === 'resolve_unknown_basis') {
      // Must be an unknown_basis issue
      if (issue.issueType !== 'unknown_basis') {
        return apiJson(
          { error: 'Bad Request', message: 'This action is only valid for unknown_basis issues' },
          { status: 400 }
        );
      }

      if (!issue.ledgerEventId) {
        return apiJson(
          { error: 'Bad Request', message: 'Issue is missing ledger event reference' },
          { status: 400 }
        );
      }

      // Resolve the unknown basis
      const result = await resolveUnknownBasis(prisma, {
        userId,
        issueId: id,
        closeEventId: issue.ledgerEventId,
        openDate: data.openDate,
        openPrice: data.openPrice,
        openQuantity: data.openQuantity,
        notes: data.notes,
      });

      log.info(
        { userId, issueId: id, newPnL: result.newPnL },
        'Unknown basis issue resolved'
      );

      return apiJson({
        data: {
          resolved: true,
          newOpenEventId: result.newOpenEventId,
          newPnL: result.newPnL,
          message: `Created opening position and recalculated P&L: ${result.newPnL >= 0 ? '+' : ''}$${result.newPnL.toFixed(2)}`,
        },
      });
    } else if (data.action === 'dismiss') {
      // Dismiss the issue with a reason
      await prisma.importIssue.update({
        where: { id },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolution: `[Dismissed] ${data.reason}`,
        },
      });

      log.info({ userId, issueId: id, reason: data.reason }, 'Issue dismissed');

      return apiJson({
        data: {
          dismissed: true,
          message: 'Issue dismissed',
        },
      });
    } else {
      // Mark as resolved with note
      await prisma.importIssue.update({
        where: { id },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolution: data.resolution,
        },
      });

      log.info({ userId, issueId: id }, 'Issue marked as resolved');

      return apiJson({
        data: {
          resolved: true,
          message: 'Issue marked as resolved',
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error, issueId: id }, 'Failed to resolve issue');
    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to resolve issue',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/issues/[id]
 *
 * Delete a resolved issue (cleanup).
 * Only allows deleting issues that are already resolved.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  const { id } = await params;

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId, issueId: id }, 'Deleting issue');

    // Fetch the issue
    const issue = await prisma.importIssue.findFirst({
      where: { id, userId },
    });

    if (!issue) {
      return apiJson(
        { error: 'Not Found', message: 'Issue not found' },
        { status: 404 }
      );
    }

    if (!issue.isResolved) {
      return apiJson(
        { error: 'Bad Request', message: 'Cannot delete unresolved issues' },
        { status: 400 }
      );
    }

    // Delete the issue
    await prisma.importIssue.delete({
      where: { id },
    });

    log.info({ userId, issueId: id }, 'Issue deleted');

    return apiJson({
      data: { deleted: true },
    });
  } catch (error) {
    log.error({ error, issueId: id }, 'Failed to delete issue');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to delete issue' },
      { status: 500 }
    );
  }
}
