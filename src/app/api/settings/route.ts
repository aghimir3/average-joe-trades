import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * User Settings API
 *
 * GET /api/settings - Get user settings including SnapTrade connection status
 * PATCH /api/settings - Update user settings
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { SNAPTRADE_SERVICE } from '@/lib/services/snaptrade-logged';

const updateSettingsSchema = z.object({
  autoSyncEnabled: z.boolean().optional(),
  dashboardTourSeen: z.boolean().optional(),
});

/**
 * GET /api/settings
 * Get user settings including SnapTrade connection status
 */
export async function GET(): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Fetch settings and SnapTrade info in parallel
    const [settings, snaptradeCredential, linkedAccounts] = await Promise.all([
      // Get or create user settings
      prisma.userSettings.findUnique({
        where: { userId },
      }),
      // Get ACTIVE SnapTrade credential
      prisma.serviceCredential.findFirst({
        where: {
          userId,
          service: SNAPTRADE_SERVICE,
          isActive: true,
        },
        select: {
          isActive: true,
          lastSyncAt: true,
          syncStatus: true,
          syncError: true,
          createdAt: true,
        },
      }),
      // Get linked brokerage accounts
      prisma.brokerageAccount.findMany({
        where: {
          userId,
          externalAccountId: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          broker: true,
          externalAccountId: true,
          _count: {
            select: {
              ledgerEvents: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Create settings if they don't exist
    let userSettings = settings;
    if (!userSettings) {
      userSettings = await prisma.userSettings.create({
        data: {
          userId,
          autoSyncEnabled: false,
          dashboardTourSeen: false,
        },
      });
      log.info({ userId }, 'Created default user settings');
    }

    // Build SnapTrade connection status
    const snaptradeStatus = snaptradeCredential
      ? {
          isConnected: snaptradeCredential.isActive,
          lastSyncAt: snaptradeCredential.lastSyncAt?.toISOString() || null,
          syncStatus: snaptradeCredential.syncStatus,
          syncError: snaptradeCredential.syncError,
          connectedSince: snaptradeCredential.createdAt.toISOString(),
          linkedAccounts: linkedAccounts.map((acc) => ({
            id: acc.id,
            name: acc.name,
            broker: acc.broker,
            transactionCount: acc._count.ledgerEvents,
          })),
        }
      : {
          isConnected: false,
          lastSyncAt: null,
          syncStatus: null,
          syncError: null,
          connectedSince: null,
          linkedAccounts: [],
        };

    return apiJson({
      data: {
        autoSyncEnabled: userSettings.autoSyncEnabled,
        dashboardTourSeen: userSettings.dashboardTourSeen,
        snaptrade: snaptradeStatus,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Failed to get user settings');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Update user settings
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse and validate request
    const body = await request.json();
    const updates = updateSettingsSchema.parse(body);

    if (Object.keys(updates).length === 0) {
      return apiJson(
        { error: 'Bad Request', message: 'No updates provided' },
        { status: 400 }
      );
    }

    // Upsert user settings
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        autoSyncEnabled: updates.autoSyncEnabled ?? false,
        dashboardTourSeen: updates.dashboardTourSeen ?? false,
      },
      update: updates,
    });

    log.info({ userId, updates }, 'Updated user settings');

    return apiJson({
      data: {
        autoSyncEnabled: settings.autoSyncEnabled,
        dashboardTourSeen: settings.dashboardTourSeen,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Failed to update user settings');

    if (error instanceof z.ZodError) {
      return apiJson(
        { error: 'Validation Error', message: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

