/**
 * Robinhood Option Matching Utility
 *
 * Matches option opening and closing transactions to calculate P&L.
 * Handles: STO, BTO, STC, BTC, OEXP, OASGN
 *
 * Algorithm:
 * - Groups transactions by option contract (symbol + expiration + strike + type)
 * - Uses FIFO (First In, First Out) matching
 * - Calculates P&L for each matched pair
 */

import { ParsedTransaction } from './robinhood-parser';
import { createChildLogger } from '@/lib/logger';

const logger = createChildLogger({ module: 'robinhood-option-matcher' });

/**
 * Unique identifier for an option contract
 */
export interface OptionKey {
  symbol: string;
  expiration: Date;
  strike: number;
  optionType: 'call' | 'put';
}

/**
 * An open option position in the queue
 */
interface OpenPosition {
  transaction: ParsedTransaction;
  remainingQuantity: number;
  premium: number; // Per-contract premium
}

/**
 * A matched option trade with calculated P&L
 */
export interface MatchedOption {
  symbol: string;
  expiration: Date;
  strike: number;
  optionType: 'call' | 'put';
  openDate: Date;
  closeDate: Date;
  openAction: string; // STO or BTO
  closeAction: string; // STC, BTC, OEXP, or OASGN
  quantity: number;
  openPremium: number; // Total premium for quantity
  closePremium: number; // Total premium for quantity (0 for OEXP/OASGN)
  pnl: number; // Calculated P&L
  stockTransaction?: ParsedTransaction; // For OASGN, the resulting stock Buy/Sell
}

/**
 * Create a unique key for an option contract
 */
function createOptionKey(tx: ParsedTransaction): string {
  if (!tx.isOption || !tx.expiration) {
    throw new Error('Transaction is not an option');
  }

  const expStr = tx.expiration.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${tx.symbol}-${expStr}-${tx.strike}-${tx.optionType}`;
}

/**
 * Match option transactions and calculate P&L
 *
 * @param transactions - Array of parsed Robinhood transactions
 * @returns Array of matched option trades with P&L
 */
export function matchOptionTransactions(transactions: ParsedTransaction[]): MatchedOption[] {
  const matched: MatchedOption[] = [];

  // Filter only option transactions
  const optionTxs = transactions.filter(tx => tx.isOption);

  // Group by option contract
  const grouped = new Map<string, ParsedTransaction[]>();
  for (const tx of optionTxs) {
    try {
      const key = createOptionKey(tx);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(tx);
    } catch (error) {
      logger.warn({ transaction: tx, error }, 'Failed to create option key');
    }
  }

  // Process each option contract
  for (const [, txs] of grouped.entries()) {
    // Sort by activity date
    const sorted = txs.sort((a, b) => {
      const dateA = a.activityDate?.getTime() || 0;
      const dateB = b.activityDate?.getTime() || 0;
      return dateA - dateB;
    });

    // Match transactions for this contract
    const contractMatches = matchContract(sorted, transactions);
    matched.push(...contractMatches);
  }

  return matched;
}

/**
 * Match transactions for a single option contract
 */
function matchContract(
  optionTxs: ParsedTransaction[],
  allTransactions: ParsedTransaction[]
): MatchedOption[] {
  const matched: MatchedOption[] = [];

  // Queues for open positions (FIFO)
  const longQueue: OpenPosition[] = []; // BTO positions
  const shortQueue: OpenPosition[] = []; // STO positions

  for (const tx of optionTxs) {
    const { transCode, quantity, price } = tx;

    if (transCode === 'BTO') {
      // Buy to Open - open long position
      longQueue.push({
        transaction: tx,
        remainingQuantity: quantity,
        premium: Math.abs(price || 0), // Premium paid per contract
      });
    } else if (transCode === 'STO') {
      // Sell to Open - open short position
      shortQueue.push({
        transaction: tx,
        remainingQuantity: quantity,
        premium: Math.abs(price || 0), // Premium received per contract
      });
    } else if (transCode === 'STC') {
      // Sell to Close - close long position
      matchClose(longQueue, tx, quantity, Math.abs(price || 0), 'STC', matched);
    } else if (transCode === 'BTC') {
      // Buy to Close - close short position
      matchClose(shortQueue, tx, quantity, Math.abs(price || 0), 'BTC', matched);
    } else if (transCode === 'OEXP') {
      // Option Expiration - close both long and short positions
      matchExpiration(longQueue, shortQueue, tx, quantity, matched);
    } else if (transCode === 'OASGN') {
      // Option Assignment - close short position + find stock transaction
      const stockTx = findStockTransaction(tx, allTransactions);
      matchAssignment(shortQueue, tx, quantity, matched, stockTx);
    }
  }

  // Log remaining open positions (unmatched)
  if (longQueue.length > 0 || shortQueue.length > 0) {
    logger.debug(
      {
        symbol: optionTxs[0]?.symbol,
        longRemaining: longQueue.reduce((sum, pos) => sum + pos.remainingQuantity, 0),
        shortRemaining: shortQueue.reduce((sum, pos) => sum + pos.remainingQuantity, 0),
      },
      'Option contract has remaining open positions'
    );
  }

  return matched;
}

/**
 * Match a closing transaction (STC or BTC) against open positions
 */
function matchClose(
  queue: OpenPosition[],
  closeTx: ParsedTransaction,
  quantity: number,
  closePremium: number,
  closeAction: 'STC' | 'BTC',
  matched: MatchedOption[]
): void {
  let remaining = quantity;

  while (remaining > 0 && queue.length > 0) {
    const openPos = queue[0];
    const matchQty = Math.min(remaining, openPos.remainingQuantity);

    // Calculate P&L
    const openAction = openPos.transaction.transCode as 'STO' | 'BTO';
    const pnl = calculatePnL(
      openAction,
      closeAction,
      openPos.premium,
      closePremium,
      matchQty
    );

    matched.push({
      symbol: closeTx.symbol,
      expiration: closeTx.expiration!,
      strike: closeTx.strike!,
      optionType: closeTx.optionType!,
      openDate: openPos.transaction.activityDate!,
      closeDate: closeTx.activityDate!,
      openAction,
      closeAction,
      quantity: matchQty,
      openPremium: openPos.premium * matchQty,
      closePremium: closePremium * matchQty,
      pnl,
    });

    // Update quantities
    openPos.remainingQuantity -= matchQty;
    remaining -= matchQty;

    // Remove from queue if fully matched
    if (openPos.remainingQuantity === 0) {
      queue.shift();
    }
  }

  if (remaining > 0) {
    logger.warn(
      {
        symbol: closeTx.symbol,
        closeAction,
        quantity,
        remaining,
      },
      'Closing more contracts than open positions'
    );
  }
}

/**
 * Match an option expiration (OEXP) against open positions
 * Tries short queue first (STO), then long queue (BTO)
 */
function matchExpiration(
  longQueue: OpenPosition[],
  shortQueue: OpenPosition[],
  expTx: ParsedTransaction,
  quantity: number,
  matched: MatchedOption[]
): void {
  let remaining = quantity;

  // First, match against short positions (STO → OEXP)
  while (remaining > 0 && shortQueue.length > 0) {
    const openPos = shortQueue[0];
    const matchQty = Math.min(remaining, openPos.remainingQuantity);

    // For STO → OEXP: Keep full premium (option expired worthless)
    const pnl = calculatePnL('STO', 'OEXP', openPos.premium, 0, matchQty);

    matched.push({
      symbol: expTx.symbol,
      expiration: expTx.expiration!,
      strike: expTx.strike!,
      optionType: expTx.optionType!,
      openDate: openPos.transaction.activityDate!,
      closeDate: expTx.activityDate!,
      openAction: 'STO',
      closeAction: 'OEXP',
      quantity: matchQty,
      openPremium: openPos.premium * matchQty,
      closePremium: 0, // No premium on expiration
      pnl,
    });

    openPos.remainingQuantity -= matchQty;
    remaining -= matchQty;

    if (openPos.remainingQuantity === 0) {
      shortQueue.shift();
    }
  }

  // Then, match against long positions (BTO → OEXP)
  while (remaining > 0 && longQueue.length > 0) {
    const openPos = longQueue[0];
    const matchQty = Math.min(remaining, openPos.remainingQuantity);

    // For BTO → OEXP: Lose full premium (option expired worthless)
    const pnl = calculatePnL('BTO', 'OEXP', openPos.premium, 0, matchQty);

    matched.push({
      symbol: expTx.symbol,
      expiration: expTx.expiration!,
      strike: expTx.strike!,
      optionType: expTx.optionType!,
      openDate: openPos.transaction.activityDate!,
      closeDate: expTx.activityDate!,
      openAction: 'BTO',
      closeAction: 'OEXP',
      quantity: matchQty,
      openPremium: openPos.premium * matchQty,
      closePremium: 0,
      pnl,
    });

    openPos.remainingQuantity -= matchQty;
    remaining -= matchQty;

    if (openPos.remainingQuantity === 0) {
      longQueue.shift();
    }
  }

  if (remaining > 0) {
    logger.warn(
      {
        symbol: expTx.symbol,
        quantity,
        remaining,
      },
      'Option expiration with no matching open positions'
    );
  }
}

/**
 * Match an option assignment (OASGN) against short positions
 */
function matchAssignment(
  shortQueue: OpenPosition[],
  asgnTx: ParsedTransaction,
  quantity: number,
  matched: MatchedOption[],
  stockTx?: ParsedTransaction
): void {
  let remaining = quantity;

  while (remaining > 0 && shortQueue.length > 0) {
    const openPos = shortQueue[0];
    const matchQty = Math.min(remaining, openPos.remainingQuantity);

    // For STO → OASGN: Keep full premium (option assigned but premium kept)
    const pnl = calculatePnL('STO', 'OASGN', openPos.premium, 0, matchQty);

    matched.push({
      symbol: asgnTx.symbol,
      expiration: asgnTx.expiration!,
      strike: asgnTx.strike!,
      optionType: asgnTx.optionType!,
      openDate: openPos.transaction.activityDate!,
      closeDate: asgnTx.activityDate!,
      openAction: 'STO',
      closeAction: 'OASGN',
      quantity: matchQty,
      openPremium: openPos.premium * matchQty,
      closePremium: 0, // No premium on assignment
      pnl,
      stockTransaction: stockTx,
    });

    openPos.remainingQuantity -= matchQty;
    remaining -= matchQty;

    if (openPos.remainingQuantity === 0) {
      shortQueue.shift();
    }
  }

  if (remaining > 0) {
    logger.warn(
      {
        symbol: asgnTx.symbol,
        quantity,
        remaining,
      },
      'Option assignment with no matching short positions'
    );
  }
}

/**
 * Find the stock transaction resulting from option assignment
 *
 * For put assignment: Buy stock at strike
 * For call assignment: Sell stock at strike
 */
function findStockTransaction(
  asgnTx: ParsedTransaction,
  allTransactions: ParsedTransaction[]
): ParsedTransaction | undefined {
  // Look for stock transaction on same date with matching symbol
  const sameDate = allTransactions.filter(
    tx =>
      !tx.isOption &&
      tx.symbol === asgnTx.symbol &&
      tx.activityDate?.toDateString() === asgnTx.activityDate?.toDateString()
  );

  // For put assignment: expect Buy
  // For call assignment: expect Sell
  const expectedAction = asgnTx.optionType === 'put' ? 'Buy' : 'Sell';

  const stockTx = sameDate.find(tx => tx.transCode === expectedAction);

  if (!stockTx) {
    logger.warn(
      {
        symbol: asgnTx.symbol,
        optionType: asgnTx.optionType,
        date: asgnTx.activityDate,
        expectedAction,
      },
      'Could not find stock transaction for option assignment'
    );
  }

  return stockTx;
}

/**
 * Calculate P&L for a matched option trade
 *
 * @param openAction - STO or BTO
 * @param closeAction - STC, BTC, OEXP, or OASGN
 * @param openPremium - Premium per contract when opening
 * @param closePremium - Premium per contract when closing
 * @param quantity - Number of contracts matched
 * @returns P&L in dollars (rounded to 2 decimal places)
 */
function calculatePnL(
  openAction: 'STO' | 'BTO',
  closeAction: 'STC' | 'BTC' | 'OEXP' | 'OASGN',
  openPremium: number,
  closePremium: number,
  quantity: number
): number {
  // Each contract = 100 shares
  const multiplier = 100;
  let pnl = 0;

  if (openAction === 'STO') {
    // Sold to open (short position)
    if (closeAction === 'BTC') {
      // STO → BTC: Profit = (premium received - premium paid to close) × quantity × 100
      pnl = (openPremium - closePremium) * quantity * multiplier;
    } else if (closeAction === 'OEXP' || closeAction === 'OASGN') {
      // STO → OEXP/OASGN: Profit = premium received × quantity × 100 (keep full premium)
      pnl = openPremium * quantity * multiplier;
    }
  } else if (openAction === 'BTO') {
    // Bought to open (long position)
    if (closeAction === 'STC') {
      // BTO → STC: Profit = (premium received on sale - premium paid) × quantity × 100
      pnl = (closePremium - openPremium) * quantity * multiplier;
    } else if (closeAction === 'OEXP') {
      // BTO → OEXP: Loss = -premium paid × quantity × 100 (lose full premium)
      pnl = -openPremium * quantity * multiplier;
    }
  }

  if (pnl === 0 && (closeAction === 'STC' || closeAction === 'BTC' || closeAction === 'OEXP' || closeAction === 'OASGN')) {
    logger.warn(
      { openAction, closeAction, openPremium, closePremium, quantity },
      'Unexpected option action combination'
    );
  }

  // Round to whole dollars to avoid floating point precision issues
  return Math.round(pnl);
}
