/**
 * Prisma Client for Average Joe Trades (Prisma v7+)
 *
 * This file creates a singleton instance of PrismaClient with the MSSQL adapter
 * to prevent multiple connections in serverless environments (Next.js App Router).
 *
 * Prisma v7 Changes:
 * - Uses @prisma/adapter-mssql for SQL Server connections
 * - Client is generated to src/generated/prisma (not node_modules)
 * - Requires explicit dotenv loading for adapters
 */

import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from './logger';

const prismaLogger = createChildLogger({ module: 'prisma' });

/**
 * Parse Prisma SQL Server connection string format.
 *
 * Format: sqlserver://HOST:PORT;database=DB;user=USER;password=PASSWORD;encrypt=true;...
 *
 * @param url - The DATABASE_URL environment variable
 * @returns Parsed connection config for MSSQL adapter
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
  // Parse: sqlserver://HOST:PORT;key=value;key=value...
  const hostMatch = url.match(/sqlserver:\/\/([^:]+):(\d+)/);
  if (!hostMatch) {
    throw new Error('Invalid DATABASE_URL: Could not parse host and port');
  }

  const server = hostMatch[1];
  const port = parseInt(hostMatch[2], 10);

  // Parse key=value pairs after the host:port
  const paramsString = url.substring(url.indexOf(';') + 1);
  const params: Record<string, string> = {};

  for (const param of paramsString.split(';')) {
    const [key, ...valueParts] = param.split('=');
    if (key && valueParts.length > 0) {
      // Rejoin in case password contains '='
      params[key.toLowerCase()] = valueParts.join('=');
    }
  }

  if (!params.database || !params.user || !params.password) {
    throw new Error('Invalid DATABASE_URL: Missing required parameters (database, user, password)');
  }

  const isLocalServer = ['localhost', '127.0.0.1', '::1'].includes(server.toLowerCase());

  return {
    server,
    port,
    database: params.database,
    user: params.user,
    password: params.password,
    encrypt: params.encrypt !== 'false',
    trustServerCertificate:
      params.trustservercertificate === 'true' ||
      (process.env.NODE_ENV !== 'production' && isLocalServer),
  };
}

/**
 * Global prisma client for development hot-reload persistence.
 *
 * In development, Next.js hot-reloads cause multiple PrismaClient instances.
 * This global prevents that by reusing the same instance across reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaQueryLoggerRegistered: boolean | undefined;
};

/**
 * Create Prisma Client with MSSQL adapter.
 *
 * Prisma v7 uses the adapter pattern for database connections.
 * This provides better connection pooling and performance.
 */
function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const dbConfig = parseDatabaseUrl(databaseUrl);

  prismaLogger.debug(
    {
      server: dbConfig.server,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      encrypt: dbConfig.encrypt,
    },
    'Creating MSSQL adapter with config'
  );

  const adapter = new PrismaMssql({
    server: dbConfig.server,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    pool: {
      max: 12,
      min: 0,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 60000,
    },
    options: {
      encrypt: dbConfig.encrypt,
      trustServerCertificate: dbConfig.trustServerCertificate,
    },
  });

  const client = new PrismaClient({ adapter });

  prismaLogger.info('Prisma Client initialized with MSSQL adapter');
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/**
 * Preserve prisma instance in development for hot-reload.
 */
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Note: Prisma handles connection cleanup automatically.
 * No need to manually register beforeExit handlers in Next.js.
 * The adapter manages the connection pool.
 */
