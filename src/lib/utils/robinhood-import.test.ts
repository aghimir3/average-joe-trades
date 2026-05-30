/**
 * Robinhood CSV Parser Tests
 *
 * Tests for CSV parsing functionality shared across stock and option imports.
 * Specific stock and option import tests are in:
 * - stock-import.test.ts: BUY/SELL flows, partial closes, FIFO, P&L
 * - option-import.test.ts: STO/BTO/STC/BTC, OEXP, OASGN, strategies
 */

import { describe, it, expect } from 'vitest';
import { parseCsvContent, parseTransaction } from './robinhood-parser';

describe('Robinhood CSV Parser', () => {
  describe('Multi-line descriptions', () => {
    it('should parse CSV with multi-line descriptions containing CUSIP', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","TSLA","Tesla\nCUSIP: 88160R101\n1 TSLA Option Assigned","Buy","100","$440.00","($44,000.00)"';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].instrument).toBe('TSLA');
      expect(rows[0].description).toContain('Tesla');
      expect(rows[0].description).toContain('CUSIP: 88160R101');
      expect(rows[0].description).toContain('1 TSLA Option Assigned');
      expect(rows[0].transCode).toBe('Buy');
      expect(rows[0].quantity).toBe('100');
      expect(rows[0].price).toBe('$440.00');
      expect(rows[0].amount).toBe('($44,000.00)');
    });

    it('should handle multiple rows with complex descriptions', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","TSLA","TSLA 1/16/2026 Put $440.00","OASGN","1","",""\n' +
        '"1/16/2026","1/16/2026","1/20/2026","TSLA","Tesla\nCUSIP: 88160R101\n1 TSLA Option Assigned","Buy","100","$440.00","($44,000.00)"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","IREN","Option Expiration for IREN 1/16/2026 Call $58.00","OEXP","1","",""';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(3);
      expect(rows[0].transCode).toBe('OASGN');
      expect(rows[1].transCode).toBe('Buy');
      expect(rows[2].transCode).toBe('OEXP');
    });

    it('should handle empty descriptions', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","AAPL","","BUY","100","$150.00","($15,000.00)"';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe('');
      expect(rows[0].transCode).toBe('BUY');
    });

    it('should handle special characters in descriptions', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","BRK.B","Berkshire Hathaway Inc. Class B","BUY","10","$350.00","($3,500.00)"';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].instrument).toBe('BRK.B');
      expect(rows[0].description).toContain('Berkshire');
    });
  });

  describe('Option parsing', () => {
    it('should parse OEXP format: "Option Expiration for SYMBOL DATE TYPE STRIKE"', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Option Expiration for TSLA 1/16/2026 Put $435.00',
        transCode: 'OEXP',
        quantity: '1',
        price: '',
        amount: '',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('TSLA');
      expect(parsed.isOption).toBe(true);
      expect(parsed.optionType).toBe('put');
      expect(parsed.strike).toBe(435.00);
      expect(parsed.expiration).toBeInstanceOf(Date);
      expect(parsed.quantity).toBe(1);
      expect(parsed.price).toBeNull();
      expect(parsed.amount).toBeNull();
    });

    it('should parse OASGN format: "SYMBOL DATE TYPE STRIKE"', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'TSLA 1/16/2026 Put $440.00',
        transCode: 'OASGN',
        quantity: '1',
        price: '',
        amount: '',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('TSLA');
      expect(parsed.isOption).toBe(true);
      expect(parsed.optionType).toBe('put');
      expect(parsed.strike).toBe(440.00);
      expect(parsed.expiration).toBeInstanceOf(Date);
    });

    it('should parse standard option format: "SYMBOL DATE Call/Put $STRIKE"', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'GOOGL',
        description: 'GOOGL 1/30/2026 Put $325.00',
        transCode: 'BTO',
        quantity: '1',
        price: '$5.10',
        amount: '($510.04)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('GOOGL');
      expect(parsed.isOption).toBe(true);
      expect(parsed.optionType).toBe('put');
      expect(parsed.strike).toBe(325.00);
      expect(parsed.price).toBe(5.10);
      expect(parsed.amount).toBe(-510.04);
    });

    it('should parse negative amounts in parentheses', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Tesla\nCUSIP: 88160R101',
        transCode: 'Buy',
        quantity: '100',
        price: '$440.00',
        amount: '($44,000.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.price).toBe(440.00);
      expect(parsed.amount).toBe(-44000.00);
    });

    it('should parse call options correctly', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'AAPL',
        description: 'AAPL 2/20/2026 Call $185.00',
        transCode: 'BTO',
        quantity: '2',
        price: '$3.50',
        amount: '($700.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('AAPL');
      expect(parsed.isOption).toBe(true);
      expect(parsed.optionType).toBe('call');
      expect(parsed.strike).toBe(185.00);
    });

    it('should handle high strike prices', () => {
      // Robinhood doesn't use commas in strike prices in the description field
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'NVDA',
        description: 'NVDA 3/20/2026 Call $1500.00',
        transCode: 'STO',
        quantity: '1',
        price: '$25.00',
        amount: '$2,500.00',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('NVDA');
      expect(parsed.strike).toBe(1500.00);
      expect(parsed.amount).toBe(2500.00);
    });

    it('should handle decimal strike prices', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'SNDL',
        description: 'SNDL 2/20/2026 Call $2.50',
        transCode: 'STO',
        quantity: '10',
        price: '$0.05',
        amount: '$50.00',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.strike).toBe(2.50);
      expect(parsed.price).toBe(0.05);
    });
  });

  describe('Stock transaction parsing', () => {
    it('should identify stock BUY transactions', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'AAPL',
        description: 'Apple Inc.',
        transCode: 'BUY',
        quantity: '50',
        price: '$175.00',
        amount: '($8,750.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('AAPL');
      expect(parsed.isOption).toBe(false);
      expect(parsed.optionType).toBeNull();
      expect(parsed.strike).toBeNull();
      expect(parsed.expiration).toBeNull();
      expect(parsed.quantity).toBe(50);
      expect(parsed.price).toBe(175.00);
      expect(parsed.amount).toBe(-8750.00);
    });

    it('should identify stock SELL transactions', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'MSFT',
        description: 'Microsoft Corporation',
        transCode: 'SELL',
        quantity: '25',
        price: '$380.00',
        amount: '$9,500.00',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('MSFT');
      expect(parsed.isOption).toBe(false);
      expect(parsed.transCode).toBe('SELL');
      expect(parsed.quantity).toBe(25);
      expect(parsed.price).toBe(380.00);
      expect(parsed.amount).toBe(9500.00);
    });

    it('should handle Buy (lowercase variation) from assignment', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Tesla\nCUSIP: 88160R101\n1 TSLA Option Assigned',
        transCode: 'Buy',
        quantity: '100',
        price: '$445.00',
        amount: '($44,500.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('TSLA');
      expect(parsed.isOption).toBe(false);
      expect(parsed.transCode).toBe('Buy');
    });
  });

  describe('Date parsing', () => {
    it('should parse activity date correctly', () => {
      const row = {
        activityDate: '12/31/2025',
        processDate: '12/31/2025',
        settleDate: '1/3/2026',
        accountType: '',
        instrument: 'SPY',
        description: 'SPDR S&P 500 ETF',
        transCode: 'BUY',
        quantity: '10',
        price: '$450.00',
        amount: '($4,500.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.activityDate).toBeInstanceOf(Date);
      expect(parsed.activityDate!.getMonth()).toBe(11); // December (0-indexed)
      expect(parsed.activityDate!.getDate()).toBe(31);
      expect(parsed.activityDate!.getFullYear()).toBe(2025);
    });

    it('should parse option expiration date from description', () => {
      const row = {
        activityDate: '2/15/2026',
        processDate: '2/15/2026',
        settleDate: '2/18/2026',
        accountType: '',
        instrument: 'AAPL',
        description: 'AAPL 3/20/2026 Call $185.00',
        transCode: 'BTO',
        quantity: '1',
        price: '$5.00',
        amount: '($500.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.expiration).toBeInstanceOf(Date);
      expect(parsed.expiration?.getMonth()).toBe(2); // March (0-indexed)
      expect(parsed.expiration?.getDate()).toBe(20);
      expect(parsed.expiration?.getFullYear()).toBe(2026);
    });
  });

  describe('Amount parsing', () => {
    it('should parse positive amounts', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'AAPL',
        description: 'AAPL 2/20/2026 Call $185.00',
        transCode: 'STO',
        quantity: '2',
        price: '$3.50',
        amount: '$700.00',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.amount).toBe(700.00);
    });

    it('should parse negative amounts in parentheses', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'AAPL',
        description: 'AAPL 2/20/2026 Put $170.00',
        transCode: 'BTO',
        quantity: '1',
        price: '$4.00',
        amount: '($400.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.amount).toBe(-400.00);
    });

    it('should handle amounts with thousands separator', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'AMZN',
        description: 'Amazon.com Inc.',
        transCode: 'BUY',
        quantity: '100',
        price: '$185.00',
        amount: '($18,500.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.amount).toBe(-18500.00);
    });

    it('should handle empty amounts (OEXP/OASGN)', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Option Expiration for TSLA 1/16/2026 Put $430.00',
        transCode: 'OEXP',
        quantity: '1',
        price: '',
        amount: '',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.price).toBeNull();
      expect(parsed.amount).toBeNull();
    });
  });

  describe('Transaction code handling', () => {
    const transactionCodes = [
      { code: 'BTO', description: 'Buy to Open' },
      { code: 'STO', description: 'Sell to Open' },
      { code: 'BTC', description: 'Buy to Close' },
      { code: 'STC', description: 'Sell to Close' },
      { code: 'OEXP', description: 'Option Expiration' },
      { code: 'OASGN', description: 'Option Assignment' },
      { code: 'BUY', description: 'Stock Buy' },
      { code: 'SELL', description: 'Stock Sell' },
      { code: 'Buy', description: 'Stock Buy (variant)' },
      { code: 'Sell', description: 'Stock Sell (variant)' },
    ];

    transactionCodes.forEach(({ code }) => {
      it(`should preserve transaction code: ${code}`, () => {
        const row = {
          activityDate: '1/16/2026',
          processDate: '1/16/2026',
          settleDate: '1/20/2026',
          accountType: '',
          instrument: 'TEST',
          description: 'Test Description',
          transCode: code,
          quantity: '1',
          price: '',
          amount: '',
          suppressed: '',
        };

        const parsed = parseTransaction(row);

        expect(parsed.transCode).toBe(code);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle CSV with Windows line endings', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\r\n' +
        '"1/16/2026","1/16/2026","1/20/2026","AAPL","Apple Inc.","BUY","10","$175.00","($1,750.00)"\r\n';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].instrument).toBe('AAPL');
    });

    it('should handle trailing empty rows', () => {
      const csv = '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n' +
        '"1/16/2026","1/16/2026","1/20/2026","AAPL","Apple Inc.","BUY","10","$175.00","($1,750.00)"\n' +
        '\n\n';

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
    });

    it('should handle symbols with dots', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'BRK.B',
        description: 'Berkshire Hathaway',
        transCode: 'BUY',
        quantity: '5',
        price: '$350.00',
        amount: '($1,750.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('BRK.B');
    });

    it('should handle symbols with numbers', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IBIT',
        description: 'iShares Bitcoin Trust',
        transCode: 'BUY',
        quantity: '100',
        price: '$55.00',
        amount: '($5,500.00)',
        suppressed: '',
      };

      const parsed = parseTransaction(row);

      expect(parsed.symbol).toBe('IBIT');
    });
  });
});
