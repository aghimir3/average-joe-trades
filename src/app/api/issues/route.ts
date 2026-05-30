import { apiJson } from '@/lib/api/response';
/**
 * Import Issues API Route
 *
 * GET /api/issues - List import issues for authenticated user
 * POST /api/issues - Bulk dismiss all unresolved issues
 *
 * Features:
 * - Filter by issue type, severity, resolution status
 * - Pagination support
 * - Includes related symbol and close information
 * - Bulk dismiss with reason tracking
 */

import { NextRequest } from 'next/server';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

/**
 * Query parameters schema for listing issues.
 */
const listIssuesQuerySchema = z.object({
  issueType: z.string().optional(),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  isResolved: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v) || 50, 100))
    .optional(),
  offset: z
    .string()
    .transform((v) => parseInt(v) || 0)
    .optional(),
});

/**
 * GET /api/issues
 *
 * List import issues for the authenticated user.
 *
 * Query parameters:
 * - issueType: Filter by issue type (e.g., 'unknown_basis')
 * - severity: Filter by severity ('error', 'warning', 'info')
 * - isResolved: Filter by resolution status (true/false)
 * - limit: Number of results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 *
 * Response:
 * {
 *   data: ImportIssue[];
 *   pagination: { total, limit, offset, hasMore };
 *   summary: { total, unresolved, byType };
 * }
 */
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    log.info({ userId }, 'Fetching import issues');

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = listIssuesQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { issueType, severity, isResolved, limit = 50, offset = 0 } = validation.data;

    // Build where clause
    const where: {
      userId: string;
      issueType?: string;
      severity?: string;
      isResolved?: boolean;
    } = { userId };

    if (issueType) where.issueType = issueType;
    if (severity) where.severity = severity;
    if (isResolved !== undefined) where.isResolved = isResolved;

    // Fetch issues with pagination
    const [issues, total] = await Promise.all([
      prisma.importIssue.findMany({
        where,
        orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.importIssue.count({ where }),
    ]);

    // Get summary stats
    const [unresolvedCount, issuesByType] = await Promise.all([
      prisma.importIssue.count({
        where: { userId, isResolved: false },
      }),
      prisma.importIssue.groupBy({
        by: ['issueType'],
        where: { userId, isResolved: false },
        _count: true,
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const item of issuesByType) {
      byType[item.issueType] = item._count;
    }

    log.info({ userId, count: issues.length, total }, 'Import issues fetched');

    return apiJson({
      data: issues,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + issues.length < total,
      },
      summary: {
        total,
        unresolved: unresolvedCount,
        byType,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch import issues');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch import issues' },
      { status: 500 }
    );
  }
}

/**
 * Schema for bulk dismiss request.
 */
const bulkDismissSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

/**
 * POST /api/issues
 *
 * Bulk dismiss all unresolved issues.
 * Requires a reason explaining why all issues are being dismissed.
 *
 * Request body:
 * {
 *   reason: string (min 10 chars) - The reason for dismissing all issues
 * }
 *
 * Response:
 * {
 *   data: {
 *     dismissedCount: number - Number of issues dismissed
 *     message: string
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    // Auth check
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

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

    const validation = bulkDismissSchema.safeParse(body);
    if (!validation.success) {
      return apiJson(
        { error: 'Bad Request', message: validation.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { reason } = validation.data;

    // Count unresolved issues first
    const unresolvedCount = await prisma.importIssue.count({
      where: { userId, isResolved: false },
    });

    if (unresolvedCount === 0) {
      return apiJson({
        data: {
          dismissedCount: 0,
          message: 'No unresolved issues to dismiss',
        },
      });
    }

    log.info(
      { userId, unresolvedCount, reason },
      'Bulk dismissing all unresolved issues'
    );

    // Bulk update all unresolved issues
    const result = await prisma.importIssue.updateMany({
      where: { userId, isResolved: false },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution: `[Bulk Dismissed] ${reason}`,
      },
    });

    log.info(
      { userId, dismissedCount: result.count, reason },
      'Bulk dismiss completed'
    );

    return apiJson({
      data: {
        dismissedCount: result.count,
        message: `Successfully dismissed ${result.count} issue${result.count !== 1 ? 's' : ''}`,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to bulk dismiss issues');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to dismiss issues' },
      { status: 500 }
    );
  }
}

