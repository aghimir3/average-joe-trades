/**
 * Test database utilities.
 *
 * Provides Prisma client management for tests.
 * Uses the same MSSQL adapter pattern as the main application.
 */

import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Parse Prisma SQL Server connection string format.
 */
function parseDatabaseUrl(url: string): {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
} {
  const hostMatch = url.match(/sqlserver:\/\/([^:]+):(\d+)/);
  if (!hostMatch) {
    throw new Error('Invalid DATABASE_URL: Could not parse host and port');
  }

  const server = hostMatch[1];
  const port = parseInt(hostMatch[2], 10);

  const paramsString = url.substring(url.indexOf(';') + 1);
  const params: Record<string, string> = {};

  for (const param of paramsString.split(';')) {
    const [key, ...valueParts] = param.split('=');
    if (key && valueParts.length > 0) {
      params[key.toLowerCase()] = valueParts.join('=');
    }
  }

  if (!params.database || !params.user || !params.password) {
    throw new Error('Invalid DATABASE_URL: Missing required parameters');
  }

  return {
    server,
    port,
    database: params.database,
    user: params.user,
    password: params.password,
    encrypt: params.encrypt !== 'false',
    trustServerCertificate: params.trustservercertificate === 'true',
  };
}

const globalForPrisma = globalThis as unknown as {
  testPrisma: PrismaClient | undefined;
};

function createTestPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const dbConfig = parseDatabaseUrl(databaseUrl);

  const adapter = new PrismaMssql({
    server: dbConfig.server,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: dbConfig.encrypt,
      trustServerCertificate: dbConfig.trustServerCertificate,
    },
  });

  return new PrismaClient({ adapter });
}

export const testPrisma = globalForPrisma.testPrisma ?? createTestPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.testPrisma = testPrisma;
}

/**
 * Disconnect the test Prisma client.
 */
export async function disconnectTestPrisma(): Promise<void> {
  await testPrisma.$disconnect();
}

/**
 * Clean up test data for a user.
 * Deletes in correct dependency order to avoid foreign key violations.
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  // First, get IDs of positions and closes to delete their links
  const positions = await testPrisma.derivedPosition.findMany({
    where: { userId },
    select: { id: true },
  });
  const closes = await testPrisma.realizedClose.findMany({
    where: { userId },
    select: { id: true },
  });

  const positionIds = positions.map((p: { id: string }) => p.id);
  const closeIds = closes.map((c: { id: string }) => c.id);

  // Delete position ledger links first (references both positions and closes)
  if (positionIds.length > 0 || closeIds.length > 0) {
    await testPrisma.positionLedgerLink.deleteMany({
      where: {
        OR: [
          ...(positionIds.length > 0 ? [{ positionId: { in: positionIds } }] : []),
          ...(closeIds.length > 0 ? [{ realizedCloseId: { in: closeIds } }] : []),
        ],
      },
    });
  }

  // Now delete in dependency order (sequential to avoid conflicts)
  await testPrisma.importIssue.deleteMany({ where: { userId } });
  await testPrisma.derivedPosition.deleteMany({ where: { userId } });
  await testPrisma.realizedClose.deleteMany({ where: { userId } });
  await testPrisma.dailyAggregate.deleteMany({ where: { userId } });
  await testPrisma.ledgerEvent.deleteMany({ where: { userId } });
  await testPrisma.importBatch.deleteMany({ where: { userId } });

  // Delete SnapTrade cached data and account-related data
  await testPrisma.brokerPosition.deleteMany({ where: { userId } });
  await testPrisma.brokerBalance.deleteMany({ where: { userId } });
  await testPrisma.brokerReturnRate.deleteMany({ where: { userId } });
  await testPrisma.tradingGoal.deleteMany({ where: { userId } });
  await testPrisma.portfolioPolicy.deleteMany({ where: { userId } });

  await testPrisma.brokerageAccount.deleteMany({ where: { userId } });
}

/**
 * Create a test brokerage account.
 */
export async function createTestAccount(
  userId: string,
  data?: Partial<{
    broker: string;
    name: string;
    externalAccountId: string;
    currency: string;
    isDefault: boolean;
  }>
): Promise<{
  id: string;
  broker: string;
  name: string;
  userId: string;
  externalAccountId: string | null;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
}> {
  return testPrisma.brokerageAccount.create({
    data: {
      userId,
      broker: data?.broker || 'manual',
      name: data?.name || 'Test Account',
      externalAccountId: data?.externalAccountId,
      currency: data?.currency || 'USD',
      isDefault: data?.isDefault ?? true,
    },
  });
}
