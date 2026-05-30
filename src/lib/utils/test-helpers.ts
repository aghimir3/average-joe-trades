/**
 * Shared test helpers for Robinhood import tests.
 *
 * Provides mock transaction generators and common test data
 * for stock and option import test files.
 */

import type { TransactionWithId } from './fifo-matcher';

/**
 * Creates a base mock transaction with common defaults.
 * Extend this for specific transaction types.
 */
export function createBaseTransaction(
  overrides: Partial<TransactionWithId>
): TransactionWithId {
  return {
    id: overrides.id ?? 'test-id',
    activityDate: overrides.activityDate ?? new Date('2026-01-13'),
    processDate: overrides.processDate ?? null,
    settleDate: overrides.settleDate ?? null,
    accountType: overrides.accountType ?? null,
    instrument: overrides.instrument ?? 'TEST',
    description: overrides.description ?? 'Test Transaction',
    transCode: overrides.transCode ?? 'BUY',
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? null,
    amount: overrides.amount ?? null,
    suppressed: overrides.suppressed ?? null,
    symbol: overrides.symbol ?? 'TEST',
    isOption: overrides.isOption ?? false,
    optionType: overrides.optionType ?? null,
    strike: overrides.strike ?? null,
    expiration: overrides.expiration ?? null,
  };
}

/**
 * Creates a stock BUY transaction.
 * Note: amount is negative (money paid out).
 */
export function createStockBuy(
  symbol: string,
  quantity: number,
  price: number,
  date: Date,
  id: string = `buy-${symbol}-${Date.now()}`
): TransactionWithId {
  const amount = -(quantity * price);
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument: symbol,
    description: `${symbol} Stock Purchase`,
    transCode: 'BUY',
    quantity,
    price,
    amount,  // negative amount for purchase
    symbol,
    isOption: false,
  });
}

/**
 * Creates a stock SELL transaction.
 */
export function createStockSell(
  symbol: string,
  quantity: number,
  price: number,
  date: Date,
  id: string = `sell-${symbol}-${Date.now()}`
): TransactionWithId {
  const amount = quantity * price;
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument: symbol,
    description: `${symbol} Stock Sale`,
    transCode: 'SELL',
    quantity,
    price,
    amount,
    symbol,
    isOption: false,
  });
}

/**
 * Creates an option BTO (Buy to Open) transaction.
 */
export function createOptionBTO(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  premium: number,
  date: Date,
  id: string = `bto-${symbol}-${Date.now()}`
): TransactionWithId {
  const instrument = `${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  const amount = -(quantity * premium * 100); // Options are 100 shares per contract
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument,
    description: instrument,
    transCode: 'BTO',
    quantity,
    price: premium,
    amount,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Creates an option STO (Sell to Open) transaction.
 */
export function createOptionSTO(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  premium: number,
  date: Date,
  id: string = `sto-${symbol}-${Date.now()}`
): TransactionWithId {
  const instrument = `${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  const amount = quantity * premium * 100;
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument,
    description: instrument,
    transCode: 'STO',
    quantity,
    price: premium,
    amount,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Creates an option STC (Sell to Close) transaction.
 */
export function createOptionSTC(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  premium: number,
  date: Date,
  id: string = `stc-${symbol}-${Date.now()}`
): TransactionWithId {
  const instrument = `${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  const amount = quantity * premium * 100;
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument,
    description: instrument,
    transCode: 'STC',
    quantity,
    price: premium,
    amount,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Creates an option BTC (Buy to Close) transaction.
 */
export function createOptionBTC(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  premium: number,
  date: Date,
  id: string = `btc-${symbol}-${Date.now()}`
): TransactionWithId {
  const instrument = `${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  const amount = -(quantity * premium * 100);
  return createBaseTransaction({
    id,
    activityDate: date,
    instrument,
    description: instrument,
    transCode: 'BTC',
    quantity,
    price: premium,
    amount,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Creates an option expiration (OEXP) transaction.
 */
export function createOptionOEXP(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  id: string = `oexp-${symbol}-${Date.now()}`
): TransactionWithId {
  const description = `Option Expiration for ${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  return createBaseTransaction({
    id,
    activityDate: expiration,
    instrument: symbol,
    description,
    transCode: 'OEXP',
    quantity,
    price: null,
    amount: null,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Creates an option assignment (OASGN) transaction.
 */
export function createOptionOASGN(
  symbol: string,
  optionType: 'call' | 'put',
  strike: number,
  expiration: Date,
  quantity: number,
  id: string = `oasgn-${symbol}-${Date.now()}`
): TransactionWithId {
  const description = `${symbol} ${formatDateForOption(expiration)} ${capitalize(optionType)} $${strike.toFixed(2)}`;
  return createBaseTransaction({
    id,
    activityDate: expiration,
    instrument: symbol,
    description,
    transCode: 'OASGN',
    quantity,
    price: null,
    amount: null,
    symbol,
    isOption: true,
    optionType,
    strike,
    expiration,
  });
}

/**
 * Formats a date for option instrument description (M/D/YYYY).
 */
function formatDateForOption(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Test data generators for specific scenarios.
 */
export const TestScenarios = {
  /**
   * Creates a simple stock round trip (buy then sell).
   */
  stockRoundTrip(
    symbol: string,
    quantity: number,
    buyPrice: number,
    sellPrice: number,
    buyDate: Date,
    sellDate: Date
  ): TransactionWithId[] {
    return [
      createStockBuy(symbol, quantity, buyPrice, buyDate, `buy-${symbol}-1`),
      createStockSell(symbol, quantity, sellPrice, sellDate, `sell-${symbol}-1`),
    ];
  },

  /**
   * Creates a partial stock close scenario.
   */
  stockPartialClose(
    symbol: string,
    buyQuantity: number,
    sellQuantity: number,
    buyPrice: number,
    sellPrice: number,
    buyDate: Date,
    sellDate: Date
  ): TransactionWithId[] {
    return [
      createStockBuy(symbol, buyQuantity, buyPrice, buyDate, `buy-${symbol}-1`),
      createStockSell(symbol, sellQuantity, sellPrice, sellDate, `sell-${symbol}-1`),
    ];
  },

  /**
   * Creates a FIFO stock scenario with multiple buys.
   */
  stockFIFO(
    symbol: string,
    buys: Array<{ quantity: number; price: number; date: Date }>,
    sells: Array<{ quantity: number; price: number; date: Date }>
  ): TransactionWithId[] {
    const transactions: TransactionWithId[] = [];
    buys.forEach((buy, i) => {
      transactions.push(
        createStockBuy(symbol, buy.quantity, buy.price, buy.date, `buy-${symbol}-${i}`)
      );
    });
    sells.forEach((sell, i) => {
      transactions.push(
        createStockSell(symbol, sell.quantity, sell.price, sell.date, `sell-${symbol}-${i}`)
      );
    });
    return transactions;
  },

  /**
   * Creates a covered call scenario.
   */
  coveredCall(
    symbol: string,
    stockQuantity: number,
    stockPrice: number,
    callStrike: number,
    callPremium: number,
    buyDate: Date,
    expiration: Date,
    expiresWorthless: boolean
  ): TransactionWithId[] {
    const transactions: TransactionWithId[] = [
      createStockBuy(symbol, stockQuantity, stockPrice, buyDate, `buy-${symbol}-1`),
      createOptionSTO(
        symbol,
        'call',
        callStrike,
        expiration,
        stockQuantity / 100,
        callPremium,
        buyDate,
        `sto-${symbol}-call-1`
      ),
    ];

    if (expiresWorthless) {
      transactions.push(
        createOptionOEXP(
          symbol,
          'call',
          callStrike,
          expiration,
          stockQuantity / 100,
          `oexp-${symbol}-call-1`
        )
      );
    }

    return transactions;
  },

  /**
   * Creates a cash-secured put scenario.
   */
  cashSecuredPut(
    symbol: string,
    putStrike: number,
    putPremium: number,
    quantity: number,
    sellDate: Date,
    expiration: Date,
    outcome: 'expires' | 'assigned' | 'buyback'
  ): TransactionWithId[] {
    const transactions: TransactionWithId[] = [
      createOptionSTO(
        symbol,
        'put',
        putStrike,
        expiration,
        quantity,
        putPremium,
        sellDate,
        `sto-${symbol}-put-1`
      ),
    ];

    switch (outcome) {
      case 'expires':
        transactions.push(
          createOptionOEXP(
            symbol,
            'put',
            putStrike,
            expiration,
            quantity,
            `oexp-${symbol}-put-1`
          )
        );
        break;
      case 'assigned':
        transactions.push(
          createOptionOASGN(
            symbol,
            'put',
            putStrike,
            expiration,
            quantity,
            `oasgn-${symbol}-put-1`
          )
        );
        // Add the stock buy from assignment
        transactions.push(
          createStockBuy(
            symbol,
            quantity * 100,
            putStrike,
            expiration,
            `buy-${symbol}-assigned-1`
          )
        );
        break;
      case 'buyback':
        // Will be handled by caller specifying BTC
        break;
    }

    return transactions;
  },

  /**
   * Creates a long call/put scenario.
   */
  longOption(
    symbol: string,
    optionType: 'call' | 'put',
    strike: number,
    premium: number,
    quantity: number,
    buyDate: Date,
    expiration: Date,
    outcome: 'expires' | 'sold',
    sellPremium?: number,
    sellDate?: Date
  ): TransactionWithId[] {
    const transactions: TransactionWithId[] = [
      createOptionBTO(
        symbol,
        optionType,
        strike,
        expiration,
        quantity,
        premium,
        buyDate,
        `bto-${symbol}-${optionType}-1`
      ),
    ];

    if (outcome === 'expires') {
      transactions.push(
        createOptionOEXP(
          symbol,
          optionType,
          strike,
          expiration,
          quantity,
          `oexp-${symbol}-${optionType}-1`
        )
      );
    } else if (outcome === 'sold' && sellPremium !== undefined && sellDate) {
      transactions.push(
        createOptionSTC(
          symbol,
          optionType,
          strike,
          expiration,
          quantity,
          sellPremium,
          sellDate,
          `stc-${symbol}-${optionType}-1`
        )
      );
    }

    return transactions;
  },

  /**
   * Creates a short option scenario (STO → BTC).
   */
  shortOption(
    symbol: string,
    optionType: 'call' | 'put',
    strike: number,
    openPremium: number,
    quantity: number,
    sellDate: Date,
    expiration: Date,
    closePremium: number,
    closeDate: Date
  ): TransactionWithId[] {
    return [
      createOptionSTO(
        symbol,
        optionType,
        strike,
        expiration,
        quantity,
        openPremium,
        sellDate,
        `sto-${symbol}-${optionType}-1`
      ),
      createOptionBTC(
        symbol,
        optionType,
        strike,
        expiration,
        quantity,
        closePremium,
        closeDate,
        `btc-${symbol}-${optionType}-1`
      ),
    ];
  },
};
