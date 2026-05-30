/**
 * Zod validation schemas for trade-related operations.
 *
 * These schemas validate incoming API requests and form data.
 * They match the database schema but with additional constraints
 * and transformations for user input.
 *
 * @see src/db/schema.ts for database types
 */

import { z } from 'zod';
import {
  TRADE_TYPES,
  TRADE_STATUSES,
  OPTION_STRATEGIES,
  LEG_TYPES,
  LEG_ACTIONS,
} from '@/db/constants';

/**
 * Schema for option leg input.
 *
 * Validates a single option leg for trade creation.
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const optionLegSchema = z.object({
  legType: z.enum(LEG_TYPES, {
    message: 'Leg type must be "call" or "put"',
  }),
  action: z.enum(LEG_ACTIONS, {
    message: 'Action must be "buy" or "sell"',
  }),
  strike: z.coerce
    .number()
    .positive('Strike price must be positive')
    .multipleOf(0.0001, 'Strike can have at most 4 decimal places'),
  expiration: z.coerce.date(),
  premium: z
    .coerce.number()
    .nonnegative('Premium cannot be negative')
    .multipleOf(0.0001, 'Premium can have at most 4 decimal places'),
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  exitPremium: z
    .coerce.number()
    .nonnegative('Exit premium cannot be negative')
    .multipleOf(0.0001, 'Exit premium can have at most 4 decimal places')
    .optional()
    .nullable(),
}).strict();

/**
 * Time validation schema (HH:MM format)
 */
const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format')
  .optional()
  .nullable();

/**
 * Schema for creating a new stock trade.
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const createStockTradeSchema = z.object({
  type: z.literal('stock'),
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters'),
  entryDate: z.coerce.date(),
  entryTime: timeSchema,
  exitDate: z.coerce.date().optional().nullable(),
  exitTime: timeSchema,
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  entryPrice: z
    .coerce.number()
    .positive('Entry price must be positive')
    .multipleOf(0.0001, 'Price can have at most 4 decimal places'),
  exitPrice: z
    .coerce.number()
    .positive('Exit price must be positive')
    .multipleOf(0.0001, 'Price can have at most 4 decimal places')
    .optional()
    .nullable(),
  openingNotes: z.string().max(5000, 'Opening notes too long').optional().nullable(),
  closingNotes: z.string().max(5000, 'Closing notes too long').optional().nullable(),
}).strict();

/**
 * Schema for creating a new option trade.
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const createOptionTradeSchema = z.object({
  type: z.literal('option'),
  strategy: z.enum(OPTION_STRATEGIES, {
    message: 'Invalid option strategy',
  }),
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters'),
  entryDate: z.coerce.date(),
  entryTime: timeSchema,
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  entryPrice: z
    .coerce.number()
    .nonnegative('Entry price cannot be negative')
    .multipleOf(0.0001, 'Price can have at most 4 decimal places'),
  underlyingPrice: z
    .coerce.number()
    .positive('Underlying price must be positive')
    .multipleOf(0.0001, 'Underlying price can have at most 4 decimal places')
    .optional()
    .nullable(),
  openingNotes: z.string().max(5000, 'Opening notes too long').optional().nullable(),
  closingNotes: z.string().max(5000, 'Closing notes too long').optional().nullable(),
  optionLegs: z
    .array(optionLegSchema)
    .min(1, 'At least one option leg is required')
    .max(4, 'Maximum 4 legs per trade'),
}).strict();

/**
 * Combined schema for creating any trade type.
 */
export const createTradeSchema = z.discriminatedUnion('type', [
  createStockTradeSchema,
  createOptionTradeSchema,
]);

/**
 * Schema for updating a trade (closing it).
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const updateTradeSchema = z.object({
  exitDate: z.coerce.date()
    .optional(),
  exitPrice: z
    .coerce.number()
    .nonnegative('Exit price cannot be negative')
    .multipleOf(0.01)
    .optional()
    .nullable(),
  status: z.enum(TRADE_STATUSES).optional(),
  openingNotes: z.string().max(5000, 'Opening notes too long').optional().nullable(),
  closingNotes: z.string().max(5000, 'Closing notes too long').optional().nullable(),
  // For updating option legs
  optionLegs: z
    .array(
      z.object({
        id: z.string().uuid(),
        exitPremium: z.coerce.number().nonnegative().multipleOf(0.01).optional().nullable(),
      }).strict()
    )
    .optional(),
}).strict();

/**
 * Schema for trade list query parameters.
 *
 * Note: limit max is 1000 to support dashboard components that need all trades
 * (calendar, charts, etc.). For very large portfolios, consider server-side aggregation.
 */
export const tradeListQuerySchema = z.object({
  type: z.enum(TRADE_TYPES).optional(),
  status: z.enum(TRADE_STATUSES).optional(),
  ticker: z.string().toUpperCase().optional(),
  strategy: z.enum(OPTION_STRATEGIES).optional(),
  startDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  endDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Type exports
export type CreateStockTradeInput = z.infer<typeof createStockTradeSchema>;
export type CreateOptionTradeInput = z.infer<typeof createOptionTradeSchema>;
export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;
export type TradeListQuery = z.infer<typeof tradeListQuerySchema>;
export type OptionLegInput = z.infer<typeof optionLegSchema>;
