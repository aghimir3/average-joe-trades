/**
 * FIFO Matching Logic
 *
 * Matches opening and closing transactions using First-In-First-Out accounting.
 * Handles stocks and options separately with proper transaction code mapping.
 */

import { createChildLogger } from '@/lib/logger';
import type { ParsedTransaction } from './robinhood-parser';

const logger = createChildLogger({ module: 'fifo-matcher' });

/**
 * Transaction with ID for tracking.
 */
export interface TransactionWithId extends ParsedTransaction {
  id: string;
}

/**
 * How the trade was closed.
 * - 'btc': Bought to close (BTC)
 * - 'stc': Sold to close (STC)
 * - 'expired': Option expired worthless (OEXP)
 * - 'assigned': Option was assigned (OASGN)
 * - null: Trade is still open
 */
export type CloseType = 'btc' | 'stc' | 'expired' | 'assigned' | null;

/**
 * Matched trade result.
 */
export interface MatchedTrade {
  symbol: string;
  isOption: boolean;
  optionType: 'call' | 'put' | null;
  strike: number | null;
  expiration: Date | null;

  // Opening transactions
  openTransactionIds: string[];
  openDate: Date;
  openQuantity: number;
  openPrice: number;
  openAmount: number;
  openAction: 'buy' | 'sell'; // BTO/Buy = buy, STO/Sell = sell

  // Closing transactions (null if still open)
  closeTransactionIds: string[] | null;
  closeDate: Date | null;
  closeQuantity: number | null;
  closePrice: number | null;
  closeAmount: number | null;
  closeType: CloseType;

  // P&L
  realizedPnL: number | null;

  // Status
  status: 'open' | 'closed' | 'partial';
}

/**
 * Unmatched transaction (couldn't find matching open/close).
 */
export interface UnmatchedTransaction {
  transactionId: string;
  symbol: string;
  transCode: string;
  quantity: number;
  date: Date;
  reason: string;
}

/**
 * FIFO matching result.
 */
export interface FifoMatchingResult {
  matched: MatchedTrade[];
  unmatched: UnmatchedTransaction[];
}

/**
 * Match transactions using FIFO accounting.
 */
export function matchTransactionsFifo(transactions: TransactionWithId[]): FifoMatchingResult {
  const matched: MatchedTrade[] = [];
  const unmatched: UnmatchedTransaction[] = [];

  // Group by symbol + option details
  const grouped = groupByInstrument(transactions);

  // Process each instrument separately
  for (const [, txns] of grouped.entries()) {
    const result = matchInstrumentFifo(txns);
    matched.push(...result.matched);
    unmatched.push(...result.unmatched);
  }

  logger.info(
    { totalMatched: matched.length, totalUnmatched: unmatched.length },
    'FIFO matching completed'
  );

  return { matched, unmatched };
}

/**
 * Group transactions by instrument (symbol + option details).
 */
function groupByInstrument(
  transactions: TransactionWithId[]
): Map<string, TransactionWithId[]> {
  const grouped = new Map<string, TransactionWithId[]>();

  for (const txn of transactions) {
    const key = getInstrumentKey(txn);
    const group = grouped.get(key) || [];
    group.push(txn);
    grouped.set(key, group);
  }

  return grouped;
}

/**
 * Get unique key for instrument.
 */
function getInstrumentKey(txn: ParsedTransaction): string {
  if (txn.isOption) {
    return `${txn.symbol}|${txn.optionType}|${txn.strike}|${txn.expiration?.toISOString()}`;
  }
  return `${txn.symbol}|stock`;
}

/**
 * Match transactions for a single instrument using FIFO.
 *
 * Ensures close date >= open date to create valid trades.
 * Closes without matching opens are marked as unmatched.
 */
function matchInstrumentFifo(transactions: TransactionWithId[]): FifoMatchingResult {
  const matched: MatchedTrade[] = [];
  const unmatched: UnmatchedTransaction[] = [];

  // Sort by date (FIFO)
  const sorted = [...transactions].sort(
    (a, b) => (a.activityDate?.getTime() || 0) - (b.activityDate?.getTime() || 0)
  );

  // Separate opening and closing transactions
  const opens: Array<TransactionWithId & { remainingQty: number }> = [];
  const closes: Array<TransactionWithId & { remainingQty: number }> = [];

  for (const txn of sorted) {
    if (isOpeningTransaction(txn.transCode)) {
      opens.push({ ...txn, remainingQty: Math.abs(txn.quantity) });
    } else if (isClosingTransaction(txn.transCode)) {
      closes.push({ ...txn, remainingQty: Math.abs(txn.quantity) });
    } else {
      // Ignore other transaction types (dividends, fees, etc.)
      logger.debug({ transCode: txn.transCode }, 'Ignoring non-trade transaction');
    }
  }

  // Match using FIFO: each close must match an open that occurred on or before the close date
  for (const closeTxn of closes) {
    const closeDate = closeTxn.activityDate?.getTime() || 0;

    // Find earliest open that:
    // 1. Has remaining quantity
    // 2. Occurred on or before the close date
    let matchedOpen: typeof opens[0] | null = null;

    for (const open of opens) {
      const openDate = open.activityDate?.getTime() || 0;

      if (open.remainingQty > 0 && openDate <= closeDate) {
        matchedOpen = open;
        break; // FIFO: take the first (earliest) matching open
      }
    }

    if (!matchedOpen) {
      // No matching open found - this is a close without an opening position
      unmatched.push({
        transactionId: closeTxn.id,
        symbol: closeTxn.symbol,
        transCode: closeTxn.transCode,
        quantity: closeTxn.quantity,
        date: closeTxn.activityDate || new Date(),
        reason: 'No matching open transaction found (closing without opening position)',
      });
      continue;
    }

    // Match quantities
    const matchQty = Math.min(matchedOpen.remainingQty, closeTxn.remainingQty);

    if (matchQty > 0) {
      // Determine status based on whether this fully closes the open position
      const status =
        matchedOpen.remainingQty === matchQty && closeTxn.remainingQty === matchQty
          ? 'closed'
          : 'partial';

      // Create the matched trade with correct quantity
      const trade = createMatchedTrade(
        [{ ...matchedOpen, quantity: matchQty }],
        [{ ...closeTxn, quantity: matchQty }],
        matchQty,
        status
      );
      matched.push(trade);

      // Update remaining quantities
      matchedOpen.remainingQty -= matchQty;
      closeTxn.remainingQty -= matchQty;
    }

    // If close still has remaining quantity, continue matching with next opens
    while (closeTxn.remainingQty > 0) {
      // Find next available open
      let nextOpen: typeof opens[0] | null = null;
      for (let i = 0; i < opens.length; i++) {
        const open = opens[i];
        const openDate = open.activityDate?.getTime() || 0;

        if (open.remainingQty > 0 && openDate <= closeDate) {
          nextOpen = open;
          break;
        }
      }

      if (!nextOpen) {
        // No more matching opens, remaining close qty is orphaned
        unmatched.push({
          transactionId: `${closeTxn.id}-remaining`,
          symbol: closeTxn.symbol,
          transCode: closeTxn.transCode,
          quantity: closeTxn.remainingQty,
          date: closeTxn.activityDate || new Date(),
          reason: 'Partial close without matching open (position opened before data range)',
        });
        break;
      }

      const nextMatchQty = Math.min(nextOpen.remainingQty, closeTxn.remainingQty);

      const trade = createMatchedTrade(
        [{ ...nextOpen, quantity: nextMatchQty }],
        [{ ...closeTxn, quantity: nextMatchQty }],
        nextMatchQty,
        'partial'
      );
      matched.push(trade);

      nextOpen.remainingQty -= nextMatchQty;
      closeTxn.remainingQty -= nextMatchQty;
    }
  }

  // Any remaining opens are still open positions
  for (const open of opens) {
    if (open.remainingQty > 0) {
      const trade = createMatchedTrade(
        [{ ...open, quantity: open.remainingQty }],
        null,
        open.remainingQty,
        'open'
      );
      matched.push(trade);
    }
  }

  return { matched, unmatched };
}

/**
 * Check if transaction code is an opening transaction.
 */
function isOpeningTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  return ['BTO', 'STO', 'BUY'].includes(code);
}

/**
 * Check if transaction code is a closing transaction.
 * Includes:
 * - STC/BTC: Sell/buy to close
 * - SELL: Stock sale
 * - OEXP: Option expiration (worthless) - closes the position
 * - OASGN: Option assignment - closes the option position
 */
function isClosingTransaction(transCode: string): boolean {
  const code = transCode.toUpperCase().trim();
  return ['STC', 'BTC', 'SELL', 'OEXP', 'OASGN'].includes(code);
}

/**
 * Calculate weighted average price from transactions.
 *
 * Uses the actual `price` field from transactions (per-unit price),
 * not the `amount` field (total cash flow).
 *
 * For single transactions: returns the price directly.
 * For multiple transactions: calculates quantity-weighted average.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateWeightedPrice(txns: TransactionWithId[], _totalQuantity: number): number {
  if (txns.length === 0) return 0;

  // If single transaction, use its price directly
  if (txns.length === 1) {
    return Math.abs(txns[0].price || 0);
  }

  // For multiple transactions, calculate weighted average
  let totalWeightedPrice = 0;
  let totalQty = 0;

  for (const txn of txns) {
    const qty = Math.abs(txn.quantity);
    const price = Math.abs(txn.price || 0);
    totalWeightedPrice += price * qty;
    totalQty += qty;
  }

  // Avoid division by zero
  if (totalQty === 0) return 0;

  return totalWeightedPrice / totalQty;
}

/**
 * Create matched trade from transactions.
 *
 * IMPORTANT: Robinhood CSV has two price-related columns:
 * - Price: The per-share/per-contract price (e.g., $1.72 for option premium)
 * - Amount: The total cash flow (e.g., $171.95 for total received/paid)
 *
 * We use `price` for per-unit tracking and `amount` for P&L calculations.
 */
function createMatchedTrade(
  openTxns: TransactionWithId[],
  closeTxns: TransactionWithId[] | null,
  quantity: number,
  status: 'open' | 'closed' | 'partial'
): MatchedTrade {
  const firstOpen = openTxns[0];
  const openCode = firstOpen.transCode.toUpperCase().trim();

  // Determine opening action (buy vs sell)
  const openAction: 'buy' | 'sell' =
    openCode === 'STO' || openCode === 'SELL' ? 'sell' : 'buy';

  // Calculate totals using actual amounts for P&L
  const openAmount = openTxns.reduce((sum, txn) => sum + Math.abs(txn.amount || 0), 0);

  // Use actual per-unit price from transactions, not calculated from amount
  // For multiple transactions, use weighted average of actual prices
  const openPrice = calculateWeightedPrice(openTxns, quantity);

  let closeAmount: number | null = null;
  let closePrice: number | null = null;
  let realizedPnL: number | null = null;
  let closeDate: Date | null = null;
  let closeType: CloseType = null;

  if (closeTxns && closeTxns.length > 0) {
    const firstClose = closeTxns[0];
    const closeCode = firstClose.transCode.toUpperCase().trim();

    // Determine close type from transaction code
    if (closeCode === 'OEXP') {
      closeType = 'expired';
    } else if (closeCode === 'OASGN') {
      closeType = 'assigned';
    } else if (closeCode === 'BTC') {
      closeType = 'btc';
    } else if (closeCode === 'STC' || closeCode === 'SELL') {
      closeType = 'stc';
    }

    // Handle special cases: OEXP and OASGN have no premium/price (expired worthless or assigned)
    if (closeCode === 'OEXP' || closeCode === 'OASGN') {
      closeAmount = 0;
      closePrice = 0;
      closeDate = firstClose.activityDate || null;

      // For OEXP/OASGN:
      // - If opened with STO (sold to open): kept full premium = profit
      // - If opened with BTO (bought to open): lost full premium = loss
      const isShort = openAction === 'sell';

      if (isShort) {
        // STO → OEXP/OASGN: Kept full premium (close price = $0, open price = premium)
        realizedPnL = openAmount; // Full opening premium is profit
      } else {
        // BTO → OEXP/OASGN: Lost full premium (close price = $0, open price = premium paid)
        realizedPnL = -openAmount; // Full opening premium is loss
      }
    } else {
      // Normal close (STC, BTC, SELL with actual price)
      closeAmount = closeTxns.reduce((sum, txn) => sum + Math.abs(txn.amount || 0), 0);

      // Use actual per-unit price from close transactions
      closePrice = calculateWeightedPrice(closeTxns, quantity);
      closeDate = firstClose.activityDate || null;

      // Calculate P&L using total amounts (already in dollars)
      // The amounts from Robinhood are already in total dollars (not per-share)
      // For stocks: total dollars = price × quantity
      // For options: total dollars = premium × quantity × 100 (already calculated)
      // So we just need to subtract: closeAmount - openAmount

      // For opening shorts (STO) and closing (BTC): profit when close < open
      // For opening longs (BTO) and closing (STC): profit when close > open
      const isShort = openAction === 'sell';

      if (isShort) {
        // Short: profit = amount received - amount paid back
        realizedPnL = openAmount - closeAmount;
      } else {
        // Long: profit = amount received - amount paid
        realizedPnL = closeAmount - openAmount;
      }
    }
  }

  return {
    symbol: firstOpen.symbol,
    isOption: firstOpen.isOption,
    optionType: firstOpen.optionType,
    strike: firstOpen.strike,
    expiration: firstOpen.expiration,
    openTransactionIds: openTxns.map(t => t.id),
    openDate: firstOpen.activityDate || new Date(),
    openQuantity: quantity,
    openPrice,
    openAmount,
    openAction,
    closeTransactionIds: closeTxns ? closeTxns.map(t => t.id) : null,
    closeDate,
    closeQuantity: closeTxns ? quantity : null,
    closePrice,
    closeAmount,
    closeType,
    realizedPnL,
    status,
  };
}
