/**
 * Zod validation schemas for closing trades.
 *
 * These schemas validate the exit data when users close their trades.
 * They ensure exit dates are valid, prices are positive, and all
 * required fields for each trade type are provided.
 *
 * @see src/lib/validations/trade.ts for trade creation schemas
 */

import { z } from 'zod';

/**
 * Time validation schema (HH:MM format)
 */
const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format')
  .optional()
  .nullable();

/**
 * Schema for closing a stock trade.
 *
 * Validates exit date and exit price. Exit date must be >= entry date
 * (enforced at form level, not schema level).
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const closeStockTradeSchema = z.object({
  exitDate: z.coerce.date(),
  exitTime: timeSchema,
  exitPrice: z.coerce
    .number()
    .positive('Exit price must be positive')
    .multipleOf(0.0001, 'Exit price can have at most 4 decimal places'),
  closingNotes: z.string().max(5000, 'Closing notes too long').optional().nullable(),
}).strict();

/**
 * Schema for closing an option trade.
 *
 * Requires exit date and exit premiums for all legs.
 * Each leg must have its exitPremium field populated.
 * Uses strict() to reject unknown fields (prevents mass assignment).
 */
export const closeOptionTradeSchema = z.object({
  exitDate: z.coerce.date(),
  exitTime: timeSchema,
  exitUnderlyingPrice: z
    .coerce.number()
    .positive('Stock price must be positive')
    .multipleOf(0.0001, 'Stock price can have at most 4 decimal places')
    .optional()
    .nullable(),
  optionLegs: z
    .array(
      z.object({
        id: z.string().uuid('Invalid leg ID'),
        exitPremium: z.coerce
          .number()
          .nonnegative('Exit premium cannot be negative')
          .multipleOf(0.0001, 'Exit premium can have at most 4 decimal places'),
      }).strict()
    )
    .min(1, 'At least one option leg is required'),
  closingNotes: z.string().max(5000, 'Closing notes too long').optional().nullable(),
}).strict();

/**
 * Schema for closing a futures trade.
 *
 * Futures exits mirror stock exits (date/time/price) but are tracked as futures
 * for downstream analytics and UI.
 */
export const closeFutureTradeSchema = closeStockTradeSchema;

// Type exports
export type CloseStockTradeInput = z.infer<typeof closeStockTradeSchema>;
export type CloseOptionTradeInput = z.infer<typeof closeOptionTradeSchema>;
export type CloseFutureTradeInput = z.infer<typeof closeFutureTradeSchema>;
