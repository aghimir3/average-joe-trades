import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Tax Export API
 *
 * GET /api/export/tax - Export realized closes in IRS Form 8949 compatible CSV format
 *
 * IRS Form 8949 Columns (per official instructions):
 * - (a) Description of property (e.g., "100 sh AAPL")
 * - (b) Date acquired (MM/DD/YYYY)
 * - (c) Date sold or disposed of (MM/DD/YYYY)
 * - (d) Proceeds (sales price)
 * - (e) Cost or other basis
 * - (f) Adjustment code (W for wash sale, etc.)
 * - (g) Amount of adjustment
 * - (h) Gain or loss
 *
 * The CSV separates short-term (Part I) and long-term (Part II) transactions.
 *
 * Sources:
 * - IRS Instructions for Form 8949: https://www.irs.gov/instructions/i8949
 * - Form8949.com CSV formats: https://www.form8949.com/broker-csv-files.html
 */


import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const exportQuerySchema = z.object({
  year: z.coerce.number().min(2000).max(2100),
  brokerageAccountId: z.string().uuid().optional(),
  format: z.enum(['csv', 'txf']).default('csv'),
});

/**
 * Format a date as MM/DD/YYYY for IRS forms
 */
function formatTaxDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Escape a CSV field (wrap in quotes if it contains commas, quotes, or newlines)
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Determine if a trade is long-term (held > 1 year)
 * Per IRS rules: Long-term = held more than 1 year
 */
function isLongTerm(openDate: Date, closeDate: Date): boolean {
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  return closeDate.getTime() - openDate.getTime() > oneYearMs;
}

/**
 * Generate description per IRS Form 8949 Column (a) guidelines:
 * - For stock: "100 sh AAPL" (number of shares and ticker symbol)
 * - For options: "1 AAPL Jan 20 2026 150 Call" (contracts, symbol, expiration, strike, type)
 */
function generateDescription(close: {
  symbol: string;
  quantity: number;
  closeType: string;
  optionType: string | null;
  strike: number | null;
  expiration: Date | null;
}): string {
  if (close.closeType !== 'option') {
    const qty = Math.abs(close.quantity);
    return `${qty} sh ${close.symbol}`;
  }

  // Option description per IRS guidelines
  const qty = Math.abs(close.quantity);
  const optType = close.optionType === 'call' ? 'Call' : 'Put';

  if (close.expiration && close.strike !== null) {
    const expDate = new Date(close.expiration);
    const month = expDate.toLocaleString('en-US', { month: 'short' });
    const day = expDate.getDate();
    const year = expDate.getFullYear();
    return `${qty} ${close.symbol} ${month} ${day} ${year} ${close.strike} ${optType}`;
  }

  return `${qty} ${close.symbol} ${optType}`;
}

/**
 * GET /api/export/tax
 * Export realized closes as TurboTax-compatible CSV
 */
export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;

    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = exportQuerySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Year parameter is required (e.g., ?year=2025)' },
        { status: 400 }
      );
    }

    const { year, brokerageAccountId } = validated.data;

    // Define the date range for the tax year
    const startDate = new Date(year, 0, 1); // Jan 1
    const endDate = new Date(year, 11, 31, 23, 59, 59); // Dec 31

    log.info({ userId, year, brokerageAccountId }, 'Generating tax export');

    // Fetch all realized closes for the tax year
    const closes = await prisma.realizedClose.findMany({
      where: {
        userId,
        closeDate: {
          gte: startDate,
          lte: endDate,
        },
        ...(brokerageAccountId ? { brokerageAccountId } : {}),
        // Exclude trades with unknown basis - they need manual handling
        hasUnknownBasis: false,
      },
      include: {
        brokerageAccount: {
          select: {
            name: true,
            broker: true,
          },
        },
      },
      orderBy: [
        { closeDate: 'asc' },
        { symbol: 'asc' },
      ],
    });

    if (closes.length === 0) {
      return apiJson(
        { error: 'No Data', message: `No closed trades found for tax year ${year}` },
        { status: 404 }
      );
    }

    // Separate short-term and long-term transactions (Form 8949 Part I vs Part II)
    const shortTermTrades: typeof closes = [];
    const longTermTrades: typeof closes = [];

    for (const close of closes) {
      const openDate = new Date(close.openDate);
      const closeDate = new Date(close.closeDate);
      if (isLongTerm(openDate, closeDate)) {
        longTermTrades.push(close);
      } else {
        shortTermTrades.push(close);
      }
    }

    // IRS Form 8949 official column headers
    // Matching columns (a) through (h) per IRS instructions
    const headers = [
      '(a) Description of property',
      '(b) Date acquired',
      '(c) Date sold',
      '(d) Proceeds (sales price)',
      '(e) Cost or other basis',
      '(f) Code',
      '(g) Adjustment',
      '(h) Gain or (loss)',
    ];

    /**
     * Generate rows for a set of trades
     */
    function generateRows(trades: typeof closes): string[][] {
      const rows: string[][] = [];

      for (const close of trades) {
        const description = generateDescription({
          symbol: close.symbol,
          quantity: close.quantity.toNumber(),
          closeType: close.closeType,
          optionType: close.optionType,
          strike: close.strike?.toNumber() ?? null,
          expiration: close.expiration,
        });

        const openDate = new Date(close.openDate);
        const closeDate = new Date(close.closeDate);
        const proceeds = close.closeAmount.toNumber();
        const costBasis = close.openAmount.toNumber();
        const gainLoss = close.realizedPnL.toNumber();

        // Column (f) adjustment codes per IRS:
        // W = Wash sale loss disallowed
        // (empty) = No adjustment needed
        const adjustmentCode = '';
        const adjustmentAmount = '';

        rows.push([
          description,
          formatTaxDate(openDate),
          formatTaxDate(closeDate),
          proceeds.toFixed(2),
          costBasis.toFixed(2),
          adjustmentCode,
          adjustmentAmount,
          gainLoss.toFixed(2),
        ]);
      }

      return rows;
    }

    // Build CSV with clear section headers for TurboTax/tax software import
    const csvLines: string[] = [];

    // Add file header with metadata
    csvLines.push(`# Form 8949 Export - Tax Year ${year}`);
    csvLines.push(`# Generated: ${new Date().toISOString()}`);
    csvLines.push(`# Source: Average Joe Trades Trading Journal`);
    csvLines.push('');

    // Part I - Short-Term Capital Gains and Losses (held 1 year or less)
    csvLines.push('# PART I - SHORT-TERM (held 1 year or less)');
    csvLines.push(`# ${shortTermTrades.length} transactions`);
    csvLines.push(headers.map(escapeCsvField).join(','));
    const shortTermRows = generateRows(shortTermTrades);
    for (const row of shortTermRows) {
      csvLines.push(row.map(escapeCsvField).join(','));
    }

    // Subtotal for short-term
    if (shortTermTrades.length > 0) {
      const stProceeds = shortTermTrades.reduce((sum, c) => sum + c.closeAmount.toNumber(), 0);
      const stBasis = shortTermTrades.reduce((sum, c) => sum + c.openAmount.toNumber(), 0);
      const stGainLoss = shortTermTrades.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
      csvLines.push(`Short-Term Totals,,,${stProceeds.toFixed(2)},${stBasis.toFixed(2)},,,"${stGainLoss.toFixed(2)}"`);
    }

    csvLines.push('');

    // Part II - Long-Term Capital Gains and Losses (held more than 1 year)
    csvLines.push('# PART II - LONG-TERM (held more than 1 year)');
    csvLines.push(`# ${longTermTrades.length} transactions`);
    csvLines.push(headers.map(escapeCsvField).join(','));
    const longTermRows = generateRows(longTermTrades);
    for (const row of longTermRows) {
      csvLines.push(row.map(escapeCsvField).join(','));
    }

    // Subtotal for long-term
    if (longTermTrades.length > 0) {
      const ltProceeds = longTermTrades.reduce((sum, c) => sum + c.closeAmount.toNumber(), 0);
      const ltBasis = longTermTrades.reduce((sum, c) => sum + c.openAmount.toNumber(), 0);
      const ltGainLoss = longTermTrades.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
      csvLines.push(`Long-Term Totals,,,${ltProceeds.toFixed(2)},${ltBasis.toFixed(2)},,,"${ltGainLoss.toFixed(2)}"`);
    }

    const csvContent = csvLines.join('\n');

    // Calculate summary for logging
    const totalGainLoss = closes.reduce((sum, c) => sum + c.realizedPnL.toNumber(), 0);
    const shortTermCount = shortTermTrades.length;
    const longTermCount = longTermTrades.length;

    log.info(
      {
        userId,
        year,
        totalTrades: closes.length,
        shortTermCount,
        longTermCount,
        totalGainLoss,
      },
      'Tax export generated'
    );

    // Return CSV file
    const filename = brokerageAccountId
      ? `tax-export-${year}-account.csv`
      : `tax-export-${year}-all-accounts.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Request-Id': correlationId,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Failed to generate tax export');

    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to generate tax export' },
      { status: 500 }
    );
  }
}

