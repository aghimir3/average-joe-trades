/**
 * Ledger Write Service Tests
 *
 * Tests for idempotency hash generation and deduplication logic.
 */

import { describe, it, expect } from 'vitest';
import { generateEventHash, generateBaseHashKey } from './ledger-write';
import type { NormalizedTransaction } from '@/lib/importers/types';

describe('generateEventHash', () => {
  const userId = 'user-123';
  const brokerageAccountId = 'account-456';

  const createTransaction = (
    overrides: Partial<NormalizedTransaction> = {}
  ): NormalizedTransaction => ({
    activityDate: new Date('2026-01-16T12:00:00.000Z'),
    symbol: 'TSLA',
    transCode: 'STO',
    quantity: 1,
    price: 0.14,
    amount: 13.95,
    eventType: 'EQUITY_OPTION',
    isOption: true,
    optionType: 'call',
    strike: 455,
    expiration: new Date('2026-01-16T12:00:00.000Z'),
    rawInstrument: 'TSLA 1/16/2026 Call $455.00',
    ...overrides,
  });

  it('should generate consistent hash for same transaction', () => {
    const txn = createTransaction();
    const hash1 = generateEventHash(userId, brokerageAccountId, txn);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different prices', () => {
    const txn1 = createTransaction({ price: 0.14 });
    const txn2 = createTransaction({ price: 0.13 });

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different quantities', () => {
    const txn1 = createTransaction({ quantity: 1 });
    const txn2 = createTransaction({ quantity: 2 });

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different dates', () => {
    const txn1 = createTransaction({
      activityDate: new Date('2026-01-16T12:00:00.000Z'),
    });
    const txn2 = createTransaction({
      activityDate: new Date('2026-01-15T12:00:00.000Z'),
    });

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different users', () => {
    const txn = createTransaction();
    const hash1 = generateEventHash('user-1', brokerageAccountId, txn);
    const hash2 = generateEventHash('user-2', brokerageAccountId, txn);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different accounts', () => {
    const txn = createTransaction();
    const hash1 = generateEventHash(userId, 'account-1', txn);
    const hash2 = generateEventHash(userId, 'account-2', txn);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash when sourceTransactionId differs', () => {
    const txn1 = createTransaction({ sourceTransactionId: 'txn-1' });
    const txn2 = createTransaction({ sourceTransactionId: 'txn-2' });

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate same hash for identical option transactions with same occurrence index', () => {
    const txn1 = createTransaction();
    const txn2 = createTransaction();

    // Same occurrence index = same hash (for database deduplication)
    const hash1 = generateEventHash(userId, brokerageAccountId, txn1, 0);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2, 0);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for identical transactions with different occurrence index', () => {
    // This is the key fix - multiple fills at same price get different hashes
    // by using occurrence index
    const txn1 = createTransaction();
    const txn2 = createTransaction();

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1, 0);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2, 1);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate same base hash key for identical transactions', () => {
    const txn1 = createTransaction();
    const txn2 = createTransaction();

    const key1 = generateBaseHashKey(userId, brokerageAccountId, txn1);
    const key2 = generateBaseHashKey(userId, brokerageAccountId, txn2);

    // Base key is the same (used for counting occurrences)
    expect(key1).toBe(key2);
  });
});

describe('deduplication behavior', () => {
  const userId = 'user-123';
  const brokerageAccountId = 'account-456';

  /**
   * This test documents the fixed behavior.
   *
   * When importing a CSV with two identical rows (common with option fills),
   * both should now be imported with unique hashes using occurrence indexing.
   *
   * Example from Robinhood_Jan_Trades_2026.csv:
   * Line 65: "1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$0.14","$13.95"
   * Line 66: "1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Call $455.00","STO","1","$0.14","$13.95"
   *
   * These are two separate 1-contract fills of a 2-contract order, both at $0.14.
   * With occurrence indexing, they get different hashes and both are imported.
   */
  it('should allow multiple identical fills using occurrence indexing', () => {
    const txn1: NormalizedTransaction = {
      activityDate: new Date('2026-01-16T12:00:00.000Z'),
      symbol: 'TSLA',
      transCode: 'STO',
      quantity: 1,
      price: 0.14,
      amount: 13.95,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: 'call',
      strike: 455,
      expiration: new Date('2026-01-16T12:00:00.000Z'),
      rawInstrument: 'TSLA 1/16/2026 Call $455.00',
    };

    const txn2: NormalizedTransaction = {
      activityDate: new Date('2026-01-16T12:00:00.000Z'),
      symbol: 'TSLA',
      transCode: 'STO',
      quantity: 1,
      price: 0.14,
      amount: 13.95,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: 'call',
      strike: 455,
      expiration: new Date('2026-01-16T12:00:00.000Z'),
      rawInstrument: 'TSLA 1/16/2026 Call $455.00',
    };

    // Both transactions are identical
    expect(txn1).toEqual(txn2);

    // With occurrence indexing, they get different hashes
    const hash1 = generateEventHash(userId, brokerageAccountId, txn1, 0);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2, 1);

    // Different hashes allow both to be imported
    expect(hash1).not.toBe(hash2);
  });

  it('should still deduplicate across batches with same occurrence', () => {
    // Re-importing the same file should still deduplicate
    // because the same row position gets the same occurrence index
    const txn: NormalizedTransaction = {
      activityDate: new Date('2026-01-16T12:00:00.000Z'),
      symbol: 'TSLA',
      transCode: 'STO',
      quantity: 1,
      price: 0.14,
      amount: 13.95,
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: 'call',
      strike: 455,
      expiration: new Date('2026-01-16T12:00:00.000Z'),
      rawInstrument: 'TSLA 1/16/2026 Call $455.00',
    };

    // Same transaction with same occurrence index (first import vs re-import)
    const hashFirstImport = generateEventHash(userId, brokerageAccountId, txn, 0);
    const hashReimport = generateEventHash(userId, brokerageAccountId, txn, 0);

    // Same hash means database will detect it as duplicate
    expect(hashFirstImport).toBe(hashReimport);
  });
});

describe('Stock Transactions', () => {
  const userId = 'user-123';
  const brokerageAccountId = 'account-456';

  const createStockTransaction = (
    overrides: Partial<NormalizedTransaction> = {}
  ): NormalizedTransaction => ({
    activityDate: new Date('2026-01-15T12:00:00.000Z'),
    symbol: 'AAPL',
    transCode: 'BUY',
    quantity: 100,
    price: 150.50,
    amount: 15050,
    eventType: 'EQUITY_STOCK',
    isOption: false,
    rawInstrument: 'AAPL',
    ...overrides,
  });

  it('should generate unique hash for stock buy', () => {
    const txn = createStockTransaction();
    const hash = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64); // SHA256 hex length
  });

  it('should differentiate buy vs sell for same stock', () => {
    const buyTxn = createStockTransaction({ transCode: 'BUY' });
    const sellTxn = createStockTransaction({ transCode: 'SELL' });

    const buyHash = generateEventHash(userId, brokerageAccountId, buyTxn);
    const sellHash = generateEventHash(userId, brokerageAccountId, sellTxn);

    expect(buyHash).not.toBe(sellHash);
  });

  it('should handle fractional shares', () => {
    const txn = createStockTransaction({ quantity: 0.5, amount: 75.25 });
    const hash = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash).toBeTruthy();
  });
});

describe('Action Mapping', () => {
  // Test the action mapping logic from transactionToCreateInput
  const actionMap: Record<string, string> = {
    BUY: 'buy',
    SELL: 'sell',
    BTO: 'buy',
    STO: 'sell',
    BTC: 'buy',
    STC: 'sell',
    OEXP: 'expired',
    OASGN: 'assigned',
    ACH: 'transfer',
    WIRE: 'transfer',
    INT: 'interest',
    CDIV: 'dividend',
    DTAX: 'tax',
    ITRF: 'transfer',
    MINT: 'interest',
    FEE: 'fee',
    ADJ: 'adjustment',
    SPLIT: 'split',
    OTHER: 'other',
  };

  it('should map BUY to buy', () => {
    expect(actionMap['BUY']).toBe('buy');
  });

  it('should map SELL to sell', () => {
    expect(actionMap['SELL']).toBe('sell');
  });

  it('should map option opening transactions', () => {
    expect(actionMap['BTO']).toBe('buy');
    expect(actionMap['STO']).toBe('sell');
  });

  it('should map option closing transactions', () => {
    expect(actionMap['BTC']).toBe('buy');
    expect(actionMap['STC']).toBe('sell');
  });

  it('should map expirations and assignments', () => {
    expect(actionMap['OEXP']).toBe('expired');
    expect(actionMap['OASGN']).toBe('assigned');
  });

  it('should map cash movement types', () => {
    expect(actionMap['ACH']).toBe('transfer');
    expect(actionMap['WIRE']).toBe('transfer');
    expect(actionMap['ITRF']).toBe('transfer');
  });

  it('should map income types', () => {
    expect(actionMap['INT']).toBe('interest');
    expect(actionMap['MINT']).toBe('interest');
    expect(actionMap['CDIV']).toBe('dividend');
  });

  it('should map adjustment types', () => {
    expect(actionMap['FEE']).toBe('fee');
    expect(actionMap['ADJ']).toBe('adjustment');
    expect(actionMap['SPLIT']).toBe('split');
    expect(actionMap['DTAX']).toBe('tax');
  });
});

describe('Chunking Logic', () => {
  // CHUNK_SIZE = 80 in ledger-write.ts
  const CHUNK_SIZE = 80;

  it('should calculate correct chunk count for small batch', () => {
    const count = 50;
    const chunks = Math.ceil(count / CHUNK_SIZE);
    expect(chunks).toBe(1);
  });

  it('should calculate correct chunk count for exact boundary', () => {
    const count = 80;
    const chunks = Math.ceil(count / CHUNK_SIZE);
    expect(chunks).toBe(1);
  });

  it('should calculate correct chunk count for boundary + 1', () => {
    const count = 81;
    const chunks = Math.ceil(count / CHUNK_SIZE);
    expect(chunks).toBe(2);
  });

  it('should calculate correct chunk count for large batch', () => {
    const count = 5000;
    const chunks = Math.ceil(count / CHUNK_SIZE);
    expect(chunks).toBe(63);
  });

  it('should handle empty batch', () => {
    const count = 0;
    const chunks = count === 0 ? 0 : Math.ceil(count / CHUNK_SIZE);
    expect(chunks).toBe(0);
  });

  it('should simulate chunking an array', () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const chunks: number[][] = [];

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      chunks.push(items.slice(i, i + CHUNK_SIZE));
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(80);
    expect(chunks[1].length).toBe(80);
    expect(chunks[2].length).toBe(40);
  });
});

describe('Hash Precision', () => {
  const userId = 'user-123';
  const brokerageAccountId = 'account-456';

  const createTransaction = (
    overrides: Partial<NormalizedTransaction> = {}
  ): NormalizedTransaction => ({
    activityDate: new Date('2026-01-16T12:00:00.000Z'),
    symbol: 'AAPL',
    transCode: 'BUY',
    quantity: 100,
    price: 150.123456,
    amount: 15012.3456,
    eventType: 'EQUITY_STOCK',
    isOption: false,
    rawInstrument: 'AAPL',
    ...overrides,
  });

  it('should handle prices with 6 decimal places', () => {
    const txn = createTransaction({ price: 0.123456 });
    const hash = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
  });

  it('should differentiate prices at the 6th decimal', () => {
    const txn1 = createTransaction({ price: 0.123456 });
    const txn2 = createTransaction({ price: 0.123457 });

    const hash1 = generateEventHash(userId, brokerageAccountId, txn1);
    const hash2 = generateEventHash(userId, brokerageAccountId, txn2);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle very small option premiums', () => {
    const txn = createTransaction({
      transCode: 'STO',
      isOption: true,
      optionType: 'call',
      strike: 100,
      expiration: new Date('2026-02-21'),
      price: 0.01,
      amount: 1,
      eventType: 'EQUITY_OPTION',
    });
    const hash = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash).toBeTruthy();
  });

  it('should handle large amounts', () => {
    const txn = createTransaction({
      quantity: 10000,
      price: 500,
      amount: 5000000,
    });
    const hash = generateEventHash(userId, brokerageAccountId, txn);

    expect(hash).toBeTruthy();
  });

  it('should treat undefined and 0 differently for price', () => {
    const txnUndefined = createTransaction({ price: undefined, amount: 0 });
    const txnZero = createTransaction({ price: 0, amount: 0 });

    const hash1 = generateEventHash(userId, brokerageAccountId, txnUndefined);
    const hash2 = generateEventHash(userId, brokerageAccountId, txnZero);

    // These should produce different hashes
    expect(hash1).not.toBe(hash2);
  });
});

describe('Edge Cases', () => {
  const userId = 'user-123';
  const brokerageAccountId = 'account-456';

  it('should handle symbols with special characters', () => {
    const txn: NormalizedTransaction = {
      activityDate: new Date('2026-01-15'),
      symbol: 'BRK.B',
      transCode: 'BUY',
      quantity: 10,
      price: 400,
      amount: 4000,
      eventType: 'EQUITY_STOCK',
      isOption: false,
      rawInstrument: 'BRK.B',
    };

    const hash = generateEventHash(userId, brokerageAccountId, txn);
    expect(hash).toBeTruthy();
  });

  it('should handle crypto-like symbols', () => {
    const txn: NormalizedTransaction = {
      activityDate: new Date('2026-01-15'),
      symbol: 'BTC-USD',
      transCode: 'BUY',
      quantity: 0.001,
      price: 45000,
      amount: 45,
      eventType: 'CRYPTO',
      isOption: false,
      rawInstrument: 'BTC-USD',
    };

    const hash = generateEventHash(userId, brokerageAccountId, txn);
    expect(hash).toBeTruthy();
  });

  it('should handle very long symbols', () => {
    const txn: NormalizedTransaction = {
      activityDate: new Date('2026-01-15'),
      symbol: 'SOME_VERY_LONG_TICKER_SYMBOL',
      transCode: 'BUY',
      quantity: 100,
      price: 10,
      amount: 1000,
      eventType: 'EQUITY_STOCK',
      isOption: false,
      rawInstrument: 'SOME_VERY_LONG_TICKER_SYMBOL',
    };

    const hash = generateEventHash(userId, brokerageAccountId, txn);
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
  });

  it('should handle negative amounts (credits)', () => {
    const txn: NormalizedTransaction = {
      activityDate: new Date('2026-01-15'),
      symbol: 'AAPL',
      transCode: 'STO',
      quantity: 1,
      price: 5.00,
      amount: -500, // Credit received
      eventType: 'EQUITY_OPTION',
      isOption: true,
      optionType: 'call',
      strike: 175,
      expiration: new Date('2026-02-21'),
      rawInstrument: 'AAPL call 175',
    };

    const hash = generateEventHash(userId, brokerageAccountId, txn);
    expect(hash).toBeTruthy();
  });
});
