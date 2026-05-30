/**
 * SnapTrade Service Unit Tests
 *
 * Tests the transformation logic and helper functions.
 * Does NOT test actual API calls (those require integration tests).
 *
 * Note: SnapTrade API uses snake_case field names (trade_date, option_symbol, etc.)
 */

import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformToNormalizedTransaction,
  isSnapTradeConfigured,
  syncBrokerageAuthorizationTransactions,
  type SnapTradeTransaction,
} from './snaptrade';

describe('SnapTrade Service', () => {
  function setEnv(name: string, value: string): void {
    process.env[name] = value;
  }

  describe('isSnapTradeConfigured', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true when both credentials are set', () => {
      setEnv('SNAPTRADE_CONSUMER_KEY', 'test-key');
      setEnv('SNAPTRADE_CLIENT_ID', 'test-id');
      expect(isSnapTradeConfigured()).toBe(true);
    });

    it('should return false when consumer key is missing', () => {
      setEnv('SNAPTRADE_CONSUMER_KEY', '');
      setEnv('SNAPTRADE_CLIENT_ID', 'test-id');
      expect(isSnapTradeConfigured()).toBe(false);
    });

    it('should return false when client id is missing', () => {
      setEnv('SNAPTRADE_CONSUMER_KEY', 'test-key');
      setEnv('SNAPTRADE_CLIENT_ID', '');
      expect(isSnapTradeConfigured()).toBe(false);
    });

    it('should return false when both credentials are missing', () => {
      delete process.env.SNAPTRADE_CONSUMER_KEY;
      delete process.env.SNAPTRADE_CLIENT_ID;
      expect(isSnapTradeConfigured()).toBe(false);
    });
  });

  describe('syncBrokerageAuthorizationTransactions', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
      process.env = {
        ...originalEnv,
        SNAPTRADE_CONSUMER_KEY: 'test-key',
        SNAPTRADE_CLIENT_ID: 'test-client-id',
      };
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      process.env = originalEnv;
    });

    it('should call the transaction sync endpoint with SnapTrade signature auth', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'sync scheduled' }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await syncBrokerageAuthorizationTransactions(
        { userId: 'snap-user-123', userSecret: 'snap-secret-456' },
        'auth-789'
      );

      const path = '/authorizations/auth-789/transactions/sync';
      const query = new URLSearchParams({
        clientId: 'test-client-id',
        timestamp: '1779364800',
        userId: 'snap-user-123',
        userSecret: 'snap-secret-456',
      }).toString();
      const signaturePayload = JSON.stringify(
        { content: null, path: `/api/v1${path}`, query },
        ['content', 'path', 'query']
      );
      const expectedSignature = createHmac('sha256', encodeURI('test-key'))
        .update(signaturePayload)
        .digest('base64');

      expect(result).toEqual({ detail: 'sync scheduled' });
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.snaptrade.com/api/v1${path}?${query}`,
        expect.objectContaining({
          method: 'POST',
          headers: { Signature: expectedSignature },
        })
      );
    });
  });

  describe('transformToNormalizedTransaction', () => {
    describe('Stock Transactions', () => {
      it('should transform a BUY stock transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-123',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL', description: 'Apple Inc.' },
          type: 'BUY',
          units: 100,
          price: 150.5,
          amount: -15050,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
          settlement_date: '2026-01-17',
          description: 'Bought 100 shares of AAPL',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.symbol).toBe('AAPL');
        expect(result!.transCode).toBe('BUY');
        expect(result!.quantity).toBe(100);
        expect(result!.price).toBe(150.5);
        expect(result!.amount).toBe(-15050);
        expect(result!.eventType).toBe('EQUITY_STOCK');
        expect(result!.isOption).toBe(false);
        expect(result!.sourceTransactionId).toBe('txn-123');
        expect(result!.activityDate).toEqual(new Date('2026-01-15'));
        expect(result!.settleDate).toEqual(new Date('2026-01-17'));
      });

      it('should transform a SELL stock transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-456',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-2', symbol: 'TSLA', description: 'Tesla Inc.' },
          type: 'SELL',
          units: -50, // Negative for sells
          price: 420.0,
          amount: 21000,
          fee: 0.65,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-16',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.symbol).toBe('TSLA');
        expect(result!.transCode).toBe('SELL');
        expect(result!.quantity).toBe(50); // Absolute value
        expect(result!.price).toBe(420.0);
        expect(result!.fees).toBe(0.65);
        expect(result!.eventType).toBe('EQUITY_STOCK');
        expect(result!.isOption).toBe(false);
      });

      it('should handle missing settlement date', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-789',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'NVDA' },
          type: 'BUY',
          units: 25,
          price: 500.0,
          amount: -12500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-18',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.settleDate).toBeUndefined();
      });

      it('should uppercase symbol', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-001',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'aapl' },
          type: 'BUY',
          units: 10,
          price: 150.0,
          amount: -1500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.symbol).toBe('AAPL');
      });
    });

    describe('Option Transactions', () => {
      it('should transform a BUY option transaction as BTO (default)', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-1',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-opt', symbol: 'AAPL' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL 260221C00155000',
            strike_price: 155.0,
            expiration_date: '2026-02-21',
            option_type: 'CALL',
          },
          type: 'BUY',
          units: 2,
          price: 5.5,
          amount: -1100,
          fee: 1.3,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
          description: 'Bought 2 AAPL Feb 21 155 Call',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.symbol).toBe('AAPL');
        expect(result!.transCode).toBe('BTO');
        expect(result!.quantity).toBe(2);
        expect(result!.price).toBe(5.5);
        expect(result!.eventType).toBe('EQUITY_OPTION');
        expect(result!.isOption).toBe(true);
        expect(result!.optionType).toBe('call');
        expect(result!.strike).toBe(155.0);
        expect(result!.expiration).toEqual(new Date('2026-02-21'));
      });

      it('should transform BUY_TO_OPEN option transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-bto',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL 260221C00155000',
            strike_price: 155.0,
            expiration_date: '2026-02-21',
            option_type: 'CALL',
          },
          type: 'BUY',
          option_type: 'BUY_TO_OPEN',
          units: 2,
          price: 5.5,
          amount: -1100,
          fee: 1.3,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.transCode).toBe('BTO');
      });

      it('should transform BUY_TO_CLOSE option transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-btc',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL 260221C00155000',
            strike_price: 155.0,
            expiration_date: '2026-02-21',
            option_type: 'CALL',
          },
          type: 'BUY',
          option_type: 'BUY_TO_CLOSE',
          units: 2,
          price: 5.5,
          amount: -1100,
          fee: 1.3,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.transCode).toBe('BTC');
      });

      it('should transform SELL_TO_OPEN option transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-sto',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL 260221P00145000',
            strike_price: 145.0,
            expiration_date: '2026-02-21',
            option_type: 'PUT',
          },
          type: 'SELL',
          option_type: 'SELL_TO_OPEN',
          units: -1,
          price: 3.0,
          amount: 300,
          fee: 0.65,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.transCode).toBe('STO');
      });

      it('should transform SELL_TO_CLOSE option transaction', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-stc',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'TSLA 260117P00440000',
            strike_price: 440.0,
            expiration_date: '2026-01-17',
            option_type: 'PUT',
          },
          type: 'SELL',
          option_type: 'SELL_TO_CLOSE',
          units: -1,
          price: 3.0,
          amount: 300,
          fee: 0.65,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-16',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.symbol).toBe('TSLA');
        expect(result!.transCode).toBe('STC');
        expect(result!.quantity).toBe(1);
        expect(result!.eventType).toBe('EQUITY_OPTION');
        expect(result!.isOption).toBe(true);
        expect(result!.optionType).toBe('put');
        expect(result!.strike).toBe(440.0);
      });

      it('should handle option with lowercase option type', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-3',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-opt', symbol: 'SPY' },
          option_symbol: {
            id: 'opt-sym-3',
            ticker: 'SPY 260321C00500000',
            strike_price: 500.0,
            expiration_date: '2026-03-21',
            option_type: 'CALL',
          },
          type: 'BUY',
          units: 5,
          price: 10.0,
          amount: -5000,
          fee: 3.25,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.optionType).toBe('call');
      });

      it('should extract underlying symbol from OCC ticker', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-opt-occ',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL  261218C00240000', // OCC format with spaces
            strike_price: 240.0,
            expiration_date: '2026-12-18',
            option_type: 'CALL',
          },
          type: 'BUY',
          option_type: 'BUY_TO_OPEN',
          units: 1,
          price: 5.0,
          amount: -500,
          fee: 0.65,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.symbol).toBe('AAPL');
      });
    });

    describe('Skipped Transactions', () => {
      it('should return null for DIVIDEND transactions', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-div',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'DIVIDEND',
          units: 0,
          price: 0,
          amount: 25.5,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });

      it('should return null for INTEREST transactions', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-int',
          account: { id: 'acc-1', name: 'Main Account' },
          type: 'INTEREST',
          units: 0,
          price: 0,
          amount: 1.23,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });

      it('should return null for TRANSFER transactions', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-transfer',
          account: { id: 'acc-1', name: 'Main Account' },
          type: 'TRANSFER',
          units: 0,
          price: 0,
          amount: 5000,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });

      it('should return null for OPTIONEXPIRATION transactions', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-exp',
          account: { id: 'acc-1', name: 'Main Account' },
          option_symbol: {
            id: 'opt-sym-1',
            ticker: 'AAPL 260117C00150000',
            strike_price: 150.0,
            expiration_date: '2026-01-17',
            option_type: 'CALL',
          },
          type: 'OPTIONEXPIRATION',
          units: 0,
          price: 0,
          amount: 0,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-17',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });

      it('should return null for transactions missing symbol', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-no-symbol',
          account: { id: 'acc-1', name: 'Main Account' },
          type: 'BUY',
          units: 100,
          price: 150.0,
          amount: -15000,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });

      it('should return null for zero-quantity transactions', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-zero',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 0,
          price: 150.0,
          amount: 0,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-15',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).toBeNull();
      });
    });

    describe('Edge Cases', () => {
      it('should handle zero fees', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-zero-fee',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 10,
          price: 150.0,
          amount: -1500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.fees).toBe(0);
      });

      it('should handle undefined fees', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-undef-fee',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 10,
          price: 150.0,
          amount: -1500,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.fees).toBe(0);
      });

      it('should handle negative units (selling)', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-neg-units',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'SELL',
          units: -100, // API returns negative for sells
          price: 155.0,
          amount: 15500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.quantity).toBe(100); // Should be absolute value
      });

      it('should handle negative price (for consistency)', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-neg-price',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 10,
          price: -150.0, // Unusual but handle it
          amount: -1500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.price).toBe(150.0); // Absolute value
      });

      it('should preserve rawInstrument from symbol', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-raw',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL', description: 'Apple Inc. Common Stock' },
          type: 'BUY',
          units: 10,
          price: 150.0,
          amount: -1500,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result!.rawInstrument).toBe('AAPL');
        expect(result!.rawDescription).toBe('Apple Inc. Common Stock');
      });

      it('should handle fractional shares', () => {
        const tx: SnapTradeTransaction = {
          id: 'txn-fractional',
          account: { id: 'acc-1', name: 'Main Account' },
          symbol: { id: 'sym-1', symbol: 'AAPL' },
          type: 'BUY',
          units: 0.241631,
          price: 150.0,
          amount: -36.24,
          fee: 0,
          currency: { id: 'cur-1', code: 'USD' },
          trade_date: '2026-01-20',
        };

        const result = transformToNormalizedTransaction(tx);

        expect(result).not.toBeNull();
        expect(result!.quantity).toBe(0.241631);
      });
    });
  });
});
