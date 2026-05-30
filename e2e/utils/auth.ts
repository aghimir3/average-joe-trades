/**
 * E2E Test Authentication Utilities
 *
 * Provides mock authentication for Playwright E2E tests.
 * Creates test users and generates mock session tokens.
 */

import type { PrismaClient } from '@/generated/prisma/client';

// E2E test user email prefix
const E2E_USER_PREFIX = 'e2e-test-user';

/**
 * Create a mock session object for E2E tests.
 * Note: This returns a placeholder token - actual auth is handled via database session.
 */
export function createMockSession() {
  return {
    token: 'e2e-mock-session-token',
    userId: 'e2e-test-user-id',
    email: `${E2E_USER_PREFIX}@test.local`,
    name: 'E2E Test User',
  };
}

/**
 * Get or create the E2E test user in the database.
 * This user is used for all E2E tests.
 */
export async function getOrCreateE2EUser(prisma: PrismaClient) {
  const email = `${E2E_USER_PREFIX}@test.local`;

  // Check if user exists
  let user = await prisma.user.findUnique({
    where: { email },
  });

  // Create if doesn't exist
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: 'E2E Test User',
      },
    });
  }

  return user;
}

/**
 * Get or create a default brokerage account for the E2E test user.
 */
export async function getOrCreateE2EAccount(prisma: PrismaClient, userId: string) {
  // Check if default account exists
  let account = await prisma.brokerageAccount.findFirst({
    where: {
      userId,
      isDefault: true,
      isActive: true,
    },
  });

  // Create if doesn't exist
  if (!account) {
    account = await prisma.brokerageAccount.create({
      data: {
        userId,
        name: 'E2E Test Account',
        broker: 'manual',
        isDefault: true,
        isActive: true,
      },
    });
  }

  return account;
}

/**
 * Clean up E2E test data.
 * Call this before/after test runs to ensure clean state.
 */
export async function cleanupE2EData(prisma: PrismaClient) {
  const email = `${E2E_USER_PREFIX}@test.local`;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) return;

  const userId = user.id;

  // Delete in dependency order
  await prisma.positionLedgerLink.deleteMany({ where: { position: { userId } } });
  await prisma.positionLedgerLink.deleteMany({ where: { realizedClose: { userId } } });
  await prisma.dailyAggregate.deleteMany({ where: { userId } });
  await prisma.realizedClose.deleteMany({ where: { userId } });
  await prisma.derivedPosition.deleteMany({ where: { userId } });
  await prisma.importIssue.deleteMany({ where: { userId } });
  await prisma.importBatch.deleteMany({ where: { userId } });
  // EventTag uses ledgerEventId, so delete via the ledger events
  const ledgerEventIds = await prisma.ledgerEvent.findMany({
    where: { userId },
    select: { id: true },
  });
  if (ledgerEventIds.length > 0) {
    await prisma.eventTag.deleteMany({
      where: { ledgerEventId: { in: ledgerEventIds.map((e: { id: string }) => e.id) } },
    });
  }
  await prisma.ledgerEvent.deleteMany({ where: { userId } });
  await prisma.tag.deleteMany({ where: { userId } });
  await prisma.tradingGoal.deleteMany({ where: { userId } });
  await prisma.tradeNote.deleteMany({ where: { userId } });
  await prisma.dailyJournal.deleteMany({ where: { userId } });
  await prisma.portfolioPolicy.deleteMany({ where: { userId } });
  await prisma.brokerageAccount.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

/**
 * Routes that require authentication.
 */
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/positions',
  '/accounts',
  '/trade/new/stock',
  '/trade/new/option/long_call',
  '/trade/new/option/long_put',
  '/trade/new/option/covered_call',
  '/trade/new/option/cash_secured_put',
  '/trade/close',
  '/import',
  '/issues',
  '/journal',
];

/**
 * Routes that don't require authentication.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/privacy',
  '/policy',
];

/**
 * All routes in the application.
 */
export const ALL_ROUTES = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES];
