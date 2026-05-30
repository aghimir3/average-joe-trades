/**
 * API Request Logger Service
 *
 * Logs external API request metadata to the database for debugging.
 * Response bodies are intentionally not stored because broker APIs can return
 * account identifiers or other sensitive financial payloads.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'api-logger' });

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, unknown> {
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
    'apikey',
    'secret',
    'password',
    'token',
  ];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.some(h => key.toLowerCase().includes(h))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize request parameters to remove sensitive information
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'authorization',
    'cookie',
    'userSecret',
    'user_secret',
    'serviceUserSecret',
    'consumerKey',
    'password',
    'secret',
    'token',
    'accessToken',
    'refreshToken',
    'idToken',
    'apiKey',
    'api_key',
    'databaseUrl',
    'DATABASE_URL',
    'credential',
  ];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParams(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export interface ApiLogContext {
  userId: string;
  service: string;
  correlationId?: string;
  triggeredBy?: string;
}

export interface ApiLogRequest {
  endpoint: string;
  method: string;
  params?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ApiLogResponse {
  statusCode: number;
  body: unknown;
  durationMs: number;
}

export interface ApiLogError {
  message: string;
  code?: string;
  statusCode?: number;
  durationMs: number;
}

/**
 * Log an API request and response to the database
 */
export async function logApiRequest(
  prisma: PrismaClient,
  context: ApiLogContext,
  request: ApiLogRequest,
  response: ApiLogResponse
): Promise<void> {
  try {
    const responseBody = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body, null, 2);

    await prisma.apiRequestLog.create({
      data: {
        userId: context.userId,
        service: context.service,
        endpoint: request.endpoint,
        method: request.method,
        requestParams: request.params ? JSON.stringify(sanitizeParams(request.params)) : null,
        requestHeaders: request.headers ? JSON.stringify(sanitizeHeaders(request.headers)) : null,
        statusCode: response.statusCode,
        responseBody: null,
        responseSize: responseBody.length,
        durationMs: response.durationMs,
        isError: false,
        correlationId: context.correlationId,
        triggeredBy: context.triggeredBy,
      },
    });

    log.debug(
      {
        userId: context.userId,
        service: context.service,
        endpoint: request.endpoint,
        statusCode: response.statusCode,
        durationMs: response.durationMs,
        responseSize: responseBody.length,
      },
      'API request logged'
    );
  } catch (error) {
    // Don't fail the main operation if logging fails
    log.error({ error, context, endpoint: request.endpoint }, 'Failed to log API request');
  }
}

/**
 * Log an API error to the database
 */
export async function logApiError(
  prisma: PrismaClient,
  context: ApiLogContext,
  request: ApiLogRequest,
  error: ApiLogError
): Promise<void> {
  try {
    await prisma.apiRequestLog.create({
      data: {
        userId: context.userId,
        service: context.service,
        endpoint: request.endpoint,
        method: request.method,
        requestParams: request.params ? JSON.stringify(sanitizeParams(request.params)) : null,
        requestHeaders: request.headers ? JSON.stringify(sanitizeHeaders(request.headers)) : null,
        statusCode: error.statusCode,
        durationMs: error.durationMs,
        isError: true,
        errorMessage: error.message,
        errorCode: error.code,
        correlationId: context.correlationId,
        triggeredBy: context.triggeredBy,
      },
    });

    log.debug(
      {
        userId: context.userId,
        service: context.service,
        endpoint: request.endpoint,
        errorMessage: error.message,
        errorCode: error.code,
        durationMs: error.durationMs,
      },
      'API error logged'
    );
  } catch (logError) {
    // Don't fail the main operation if logging fails
    log.error({ error: logError, context, endpoint: request.endpoint }, 'Failed to log API error');
  }
}

/**
 * Create a wrapped function that logs API calls
 */
export function createApiLogger(
  prisma: PrismaClient,
  context: ApiLogContext
) {
  return {
    /**
     * Log a successful API call
     */
    logSuccess: (request: ApiLogRequest, response: ApiLogResponse) =>
      logApiRequest(prisma, context, request, response),

    /**
     * Log a failed API call
     */
    logError: (request: ApiLogRequest, error: ApiLogError) =>
      logApiError(prisma, context, request, error),

    /**
     * Wrap an async function to automatically log its API calls
     */
    wrap: async <T>(
      request: ApiLogRequest,
      fn: () => Promise<{ data: T; status: number }>
    ): Promise<T> => {
      const startTime = Date.now();

      try {
        const result = await fn();
        const durationMs = Date.now() - startTime;

        await logApiRequest(prisma, context, request, {
          statusCode: result.status,
          body: result.data,
          durationMs,
        });

        return result.data;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = (error as { code?: string })?.code;
        const statusCode = (error as { response?: { status?: number } })?.response?.status;

        await logApiError(prisma, context, request, {
          message: errorMessage,
          code: errorCode,
          statusCode,
          durationMs,
        });

        throw error;
      }
    },
  };
}

/**
 * Get recent API logs for a user
 */
export async function getApiLogs(
  prisma: PrismaClient,
  userId: string,
  options?: {
    service?: string;
    limit?: number;
    offset?: number;
    errorsOnly?: boolean;
    correlationId?: string;
  }
): Promise<{
  logs: Awaited<ReturnType<PrismaClient['apiRequestLog']['findMany']>>;
  total: number;
}> {
  const where = {
    userId,
    ...(options?.service && { service: options.service }),
    ...(options?.errorsOnly && { isError: true }),
    ...(options?.correlationId && { correlationId: options.correlationId }),
  };

  const [logs, total] = await Promise.all([
    prisma.apiRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.apiRequestLog.count({ where }),
  ]);

  return { logs, total };
}
