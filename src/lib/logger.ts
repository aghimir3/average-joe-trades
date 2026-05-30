/**
 * Centralized Pino logger configuration for the application.
 *
 * Provides structured JSON logging with:
 * - Pretty printing in development for readability
 * - JSON output in production for log aggregation services
 * - Child logger support for module-specific context
 * - Correlation ID support for request tracing
 *
 * @example
 * // Basic usage
 * import { logger } from '@/lib/logger';
 * logger.info({ userId: '123' }, 'User logged in');
 *
 * @example
 * // Create module-specific child logger
 * const log = logger.child({ module: 'trades' });
 * log.info({ tradeId: 'abc' }, 'Trade created');
 */

import pino from 'pino';

/**
 * Determines if we're running in development mode.
 * Used to toggle pretty printing vs JSON output.
 */
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Base Pino configuration options.
 *
 * Log levels (in order of severity):
 * - trace: Verbose debugging (loop iterations, detailed state)
 * - debug: Development details (query params, intermediate values)
 * - info: Business events (trade created, user logged in)
 * - warn: Recoverable issues (retry succeeded, deprecated usage)
 * - error: Failures requiring attention (DB error, auth failure)
 */
const baseOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Redact sensitive fields to prevent accidental logging of secrets
  // Extended list covers common patterns and nested objects
  redact: {
    paths: [
      // Direct field names (common secret patterns)
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'secret',
      'apiKey',
      'privateKey',
      'credentials',
      'idToken',
      // Nested patterns (*.field matches any parent object)
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.secret',
      '*.apiKey',
      '*.privateKey',
      '*.credentials',
      '*.idToken',
      // Request/response headers
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      // Database connection strings (may contain passwords)
      'connectionString',
      '*.connectionString',
      'DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },

  // Add timestamp in ISO format for production log aggregation
  timestamp: pino.stdTimeFunctions.isoTime,

  // Base context included in all log entries
  base: {
    env: process.env.NODE_ENV,
    app: 'average-joe-trades',
  },
};

/**
 * Development transport configuration.
 * Uses pino-pretty for human-readable colored output.
 */
const developmentTransport: pino.TransportSingleOptions = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname,env,app',
  },
};

/**
 * Main application logger instance.
 *
 * Use this directly for general logging, or create child loggers
 * for module-specific context using logger.child({ module: 'name' }).
 *
 * @example
 * logger.info('Application started');
 * logger.error({ err, userId }, 'Failed to process request');
 */
export const logger =
  typeof window === 'undefined' && isDevelopment && pino.transport
    ? pino(baseOptions, pino.transport(developmentTransport))
    : pino(baseOptions);

/**
 * Creates a child logger with additional context.
 * Useful for adding module or request-specific context.
 *
 * @param context - Additional context to include in all log entries
 * @returns A new logger instance with the merged context
 *
 * @example
 * const authLogger = createChildLogger({ module: 'auth' });
 * authLogger.info({ userId }, 'Sign-in successful');
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Creates a request-scoped logger with correlation ID.
 * Use this in API routes and middleware to trace requests.
 *
 * @param correlationId - Unique identifier for the request (use crypto.randomUUID())
 * @param additionalContext - Optional extra context (userId, etc.)
 * @returns A logger instance with correlation ID in all entries
 *
 * @example
 * const requestLogger = createRequestLogger(crypto.randomUUID(), { userId });
 * requestLogger.info('Processing trade creation');
 */
export function createRequestLogger(
  correlationId: string,
  additionalContext?: Record<string, unknown>
) {
  return logger.child({
    correlationId,
    ...additionalContext,
  });
}

// Export type for use in other modules
export type Logger = pino.Logger;
