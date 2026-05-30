/**
 * Utility functions for the application.
 *
 * This module provides common helpers used across components,
 * particularly for styling, class name management, and formatting.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ============================================================================
// Currency Formatting
// ============================================================================

/**
 * Format a number as currency with $ sign and commas.
 *
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "$1,234.56" or "-$500.00")
 *
 * @example
 * formatCurrency(1234.5)    // => "$1,234.50"
 * formatCurrency(-500)      // => "-$500.00"
 * formatCurrency(0)         // => "$0.00"
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${absValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format currency in compact form (K/M for large values).
 * Used in mobile views and space-constrained areas.
 *
 * @param value - The numeric value to format
 * @returns Compact currency string (e.g., "$1.5K", "$2.3M")
 *
 * @example
 * formatCompactCurrency(1500000)  // => "$1.5M"
 * formatCompactCurrency(15000)    // => "$15K"
 * formatCompactCurrency(1500)     // => "$1.5K"
 * formatCompactCurrency(500)      // => "$500.00"
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null) return '$0';
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  }
  if (absValue >= 10_000) {
    return `${sign}$${(absValue / 1_000).toFixed(0)}K`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

/**
 * Format a number as a percentage with sign.
 *
 * @param value - The numeric value to format
 * @returns Formatted percentage string (e.g., "+12.5%" or "-3.2%")
 *
 * @example
 * formatPercent(12.5)   // => "+12.5%"
 * formatPercent(-3.2)   // => "-3.2%"
 * formatPercent(0)      // => "+0.0%"
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '0.0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format currency with explicit +/- sign for P&L displays.
 * Positive values get a + prefix, negative values get -.
 *
 * @param value - The numeric value to format
 * @param compact - Whether to use compact notation for large values
 * @returns Signed currency string (e.g., "+$1,234.50" or "-$500.00")
 *
 * @example
 * formatSignedCurrency(1234.5)         // => "+$1,234.50"
 * formatSignedCurrency(-500)           // => "-$500.00"
 * formatSignedCurrency(15000, true)    // => "+$15K"
 */
export function formatSignedCurrency(
  value: number | null | undefined,
  compact = false
): string {
  if (value == null) return '$0.00';
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';

  if (compact) {
    if (absValue >= 1_000_000) {
      return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
    }
    if (absValue >= 1_000) {
      return `${sign}$${(absValue / 1_000).toFixed(1)}K`;
    }
  }

  return `${sign}$${absValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ============================================================================
// Chart.js Styling
// ============================================================================

/**
 * Standard tooltip style for Chart.js charts.
 * Provides consistent dark theme tooltip across all charts.
 *
 * @example
 * const options = {
 *   plugins: {
 *     tooltip: { ...chartTooltipStyle, callbacks: {...} }
 *   }
 * };
 */
export const chartTooltipStyle = {
  backgroundColor: 'rgba(39, 39, 42, 0.95)',
  titleFont: { size: 13, weight: 'bold' as const },
  bodyFont: { size: 12 },
  titleColor: '#fafafa',
  bodyColor: '#a1a1aa',
  padding: 12,
  cornerRadius: 8,
  displayColors: false,
};

// ============================================================================
// Class Name Management
// ============================================================================

/**
 * Combines class names using clsx and merges Tailwind classes intelligently.
 *
 * This utility:
 * 1. Accepts any number of class values (strings, objects, arrays)
 * 2. Filters out falsy values (for conditional classes)
 * 3. Merges conflicting Tailwind classes (last one wins)
 *
 * @param inputs - Class values to combine
 * @returns Merged class string with Tailwind conflicts resolved
 *
 * @example
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500')
 * // => 'px-4 py-2 bg-blue-500'
 *
 * @example
 * // Conditional classes
 * cn('base-class', isActive && 'active-class')
 * // => 'base-class active-class' (if isActive is true)
 *
 * @example
 * // Tailwind conflict resolution
 * cn('px-4', 'px-6')
 * // => 'px-6' (later class wins)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get today's date in YYYY-MM-DD format using the browser's local timezone.
 * Use this for date input default values to show the correct local date.
 *
 * @returns Date string in YYYY-MM-DD format (local timezone)
 *
 * @example
 * // If local time is Jan 15, 2026 at 11 PM EST
 * getLocalDateString()
 * // => '2026-01-15' (not '2026-01-16' which toISOString would give)
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a local date string (YYYY-MM-DD) to a UTC Date at noon.
 * This ensures the date is preserved regardless of timezone when stored in DB.
 *
 * The date input from the browser represents a local date (e.g., "2026-01-15").
 * We store it at noon UTC to avoid date shifts when converting back.
 *
 * @param dateStr - Date string in YYYY-MM-DD format (from date input)
 * @returns Date object set to noon UTC on that date
 *
 * @example
 * // User selects Jan 15, 2026 in the date picker
 * localDateToUTC('2026-01-15')
 * // => Date representing 2026-01-15T12:00:00.000Z
 */
export function localDateToUTC(dateStr: string): Date {
  // Parse the date string as local date components
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create UTC date at noon to avoid timezone edge cases
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * Convert a UTC Date to a local date string (YYYY-MM-DD) for display.
 * Use this when populating date inputs with data from the database.
 *
 * @param date - Date object from database (stored as UTC)
 * @returns Date string in YYYY-MM-DD format (preserves the date)
 *
 * @example
 * // DB stores 2026-01-15T12:00:00.000Z
 * utcToLocalDateString(new Date('2026-01-15T12:00:00.000Z'))
 * // => '2026-01-15'
 */
export function utcToLocalDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Use UTC methods to extract the date parts to avoid timezone conversion
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
