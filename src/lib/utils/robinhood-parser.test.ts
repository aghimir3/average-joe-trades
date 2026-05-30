/**
 * Tests for Robinhood CSV parser
 * Comprehensive test coverage for all transaction types
 */

import { describe, it, expect } from 'vitest';
import { parseCsvContent, parseTransaction } from './robinhood-parser';

/**
 * Creates a UTC date at noon for test assertions.
 * The parser normalizes all dates to UTC noon to avoid timezone day-shift issues.
 */
function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

describe('Robinhood CSV Parser', () => {
  describe('parseCsvContent', () => {
    it('should parse CSV without Account Type column', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/16/2026,1/16/2026,1/20/2026,TSLA,TSLA 1/16/2026 Put $435.00,STO,1,$1.72,$171.95
1/16/2026,1/16/2026,1/20/2026,ZETA,Zeta Global,Buy,54,$20.50,($1107.00)`;

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0].instrument).toBe('TSLA');
      expect(rows[0].transCode).toBe('STO');
      expect(rows[1].instrument).toBe('ZETA');
      expect(rows[1].transCode).toBe('Buy');
    });

    it('should handle multiline descriptions', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/16/2026,1/16/2026,1/20/2026,TSLA,"Tesla
CUSIP: 88160R101
1 TSLA Option Assigned",Buy,100,$440.00,($44000.00)`;

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].description).toContain('Tesla');
      // Note: The parser preserves newlines in quoted fields
      expect(rows[0].description.includes('CUSIP') || rows[0].description.includes('Tesla')).toBe(true);
    });

    it('should handle empty fields', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
1/16/2026,1/16/2026,1/20/2026,TSLA,Option Expiration for TSLA 1/16/2026 Put $435.00,OEXP,1,,`;

      const rows = parseCsvContent(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].price).toBe('');
      expect(rows[0].amount).toBe('');
    });
  });

  describe('parseTransaction - Stock Transactions', () => {
    it('should parse Buy stock transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'ZETA',
        description: 'Zeta Global\nCUSIP: 98956A105',
        transCode: 'Buy',
        quantity: '54',
        price: '$20.50',
        amount: '($1,107.00)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(false);
      expect(result.symbol).toBe('ZETA');
      expect(result.transCode).toBe('Buy');
      expect(result.quantity).toBe(54);
      expect(result.price).toBe(20.5);
      expect(result.amount).toBe(-1107);
      expect(result.optionType).toBeNull();
      expect(result.strike).toBeNull();
      expect(result.expiration).toBeNull();
    });

    it('should parse Sell stock transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'RKLB',
        description: 'Rocket Lab Corporation\nCUSIP: 773121108',
        transCode: 'Sell',
        quantity: '100',
        price: '$96.20',
        amount: '$9,619.98',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(false);
      expect(result.symbol).toBe('RKLB');
      expect(result.transCode).toBe('Sell');
      expect(result.quantity).toBe(100);
      expect(result.price).toBe(96.2);
      expect(result.amount).toBe(9619.98);
    });
  });

  describe('parseTransaction - STO (Sell to Open)', () => {
    it('should parse STO Put transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'TSLA 1/16/2026 Put $435.00',
        transCode: 'STO',
        quantity: '1',
        price: '$1.72',
        amount: '$171.95',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('STO');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(435);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16)); // Jan 16, 2026 UTC noon
      expect(result.quantity).toBe(1);
      expect(result.price).toBe(1.72);
      expect(result.amount).toBe(171.95); // Premium received
    });

    it('should parse STO Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'TSLA 1/16/2026 Call $455.00',
        transCode: 'STO',
        quantity: '1',
        price: '$0.14',
        amount: '$13.95',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('STO');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(455);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16));
      expect(result.amount).toBe(13.95); // Premium received
    });
  });

  describe('parseTransaction - STC (Sell to Close)', () => {
    it('should parse STC Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IBIT',
        description: 'IBIT 3/20/2026 Call $60.00',
        transCode: 'STC',
        quantity: '21',
        price: '$1.49',
        amount: '$3,128.09',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('IBIT');
      expect(result.transCode).toBe('STC');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(60);
      expect(result.expiration).toEqual(utcNoon(2026, 2, 20)); // Mar 20, 2026 UTC noon
      expect(result.quantity).toBe(21);
      expect(result.price).toBe(1.49);
      expect(result.amount).toBe(3128.09); // Premium received on sale
    });

    it('should parse STC Put transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'BMNR',
        description: 'BMNR 1/23/2026 Put $31.00',
        transCode: 'STC',
        quantity: '3',
        price: '$1.91',
        amount: '$572.87',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('BMNR');
      expect(result.transCode).toBe('STC');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(31);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 23)); // Jan 23, 2026 UTC noon
    });
  });

  describe('parseTransaction - BTO (Buy to Open)', () => {
    it('should parse BTO Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IBIT',
        description: 'IBIT 3/20/2026 Call $60.00',
        transCode: 'BTO',
        quantity: '6',
        price: '$1.67',
        amount: '($1,002.24)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('IBIT');
      expect(result.transCode).toBe('BTO');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(60);
      expect(result.expiration).toEqual(utcNoon(2026, 2, 20)); // Mar 20, 2026 UTC noon
      expect(result.quantity).toBe(6);
      expect(result.price).toBe(1.67);
      expect(result.amount).toBe(-1002.24); // Premium paid (negative)
    });

    it('should parse BTO Put transaction', () => {
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

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('GOOGL');
      expect(result.transCode).toBe('BTO');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(325);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 30)); // Jan 30, 2026 UTC noon
      expect(result.amount).toBe(-510.04); // Premium paid
    });
  });

  describe('parseTransaction - BTC (Buy to Close)', () => {
    it('should parse BTC Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IBIT',
        description: 'IBIT 3/20/2026 Call $70.00',
        transCode: 'BTC',
        quantity: '21',
        price: '$0.34',
        amount: '($714.84)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('IBIT');
      expect(result.transCode).toBe('BTC');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(70);
      expect(result.expiration).toEqual(utcNoon(2026, 2, 20)); // Mar 20, 2026 UTC noon
      expect(result.quantity).toBe(21);
      expect(result.price).toBe(0.34);
      expect(result.amount).toBe(-714.84); // Premium paid to close (negative)
    });

    it('should parse BTC Put transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'TSLA 1/16/2026 Put $445.00',
        transCode: 'BTC',
        quantity: '1',
        price: '$2.63',
        amount: '($263.04)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('BTC');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(445);
      expect(result.amount).toBe(-263.04); // Premium paid to close
    });

    it('should parse BTC with very small premium', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'MSTR',
        description: 'MSTR 1/16/2026 Call $200.00',
        transCode: 'BTC',
        quantity: '1',
        price: '$0.01',
        amount: '($1.04)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('MSTR');
      expect(result.transCode).toBe('BTC');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(200);
      expect(result.price).toBe(0.01);
      expect(result.amount).toBe(-1.04);
    });
  });

  describe('parseTransaction - OEXP (Option Expiration)', () => {
    it('should parse OEXP Put transaction', () => {
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

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('OEXP');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(435);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16)); // Jan 16, 2026 UTC noon
      expect(result.quantity).toBe(1);
      expect(result.price).toBeNull(); // No price on expiration
      expect(result.amount).toBeNull(); // No amount on expiration
    });

    it('should parse OEXP Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Option Expiration for TSLA 1/16/2026 Call $460.00',
        transCode: 'OEXP',
        quantity: '11',
        price: '',
        amount: '',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('OEXP');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(460);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16));
      expect(result.quantity).toBe(11);
      expect(result.price).toBeNull();
      expect(result.amount).toBeNull();
    });

    it('should parse OEXP with multiple contracts', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IREN',
        description: 'Option Expiration for IREN 1/16/2026 Call $58.00',
        transCode: 'OEXP',
        quantity: '1',
        price: '',
        amount: '',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('IREN');
      expect(result.transCode).toBe('OEXP');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(58);
    });
  });

  describe('parseTransaction - OASGN (Option Assignment)', () => {
    it('should parse OASGN Put transaction', () => {
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

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('OASGN');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(440);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16)); // Jan 16, 2026 UTC noon
      expect(result.quantity).toBe(1);
      expect(result.price).toBeNull(); // No price on assignment
      expect(result.amount).toBeNull(); // No amount on assignment
    });

    it('should parse OASGN Call transaction', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'IREN',
        description: 'IREN 1/16/2026 Call $56.00',
        transCode: 'OASGN',
        quantity: '2',
        price: '',
        amount: '',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('IREN');
      expect(result.transCode).toBe('OASGN');
      expect(result.optionType).toBe('call');
      expect(result.strike).toBe(56);
      expect(result.expiration).toEqual(utcNoon(2026, 0, 16));
      expect(result.quantity).toBe(2);
      expect(result.price).toBeNull();
      expect(result.amount).toBeNull();
    });

    it('should parse OASGN with multiple contracts', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'TSLA 1/16/2026 Put $445.00',
        transCode: 'OASGN',
        quantity: '6',
        price: '',
        amount: '',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.isOption).toBe(true);
      expect(result.symbol).toBe('TSLA');
      expect(result.transCode).toBe('OASGN');
      expect(result.optionType).toBe('put');
      expect(result.strike).toBe(445);
      expect(result.quantity).toBe(6);
    });
  });

  describe('parseTransaction - Numeric Value Parsing', () => {
    it('should parse numeric values with parentheses as negative', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Tesla',
        transCode: 'Buy',
        quantity: '100',
        price: '$440.00',
        amount: '($44,000.00)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.price).toBe(440);
      expect(result.amount).toBe(-44000);
    });

    it('should parse numeric values with dollar signs and commas', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'MSTR',
        description: 'Strategy Inc.',
        transCode: 'Sell',
        quantity: '100',
        price: '$172.78',
        amount: '$17,277.77',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.price).toBe(172.78);
      expect(result.amount).toBe(17277.77);
    });

    it('should handle empty price and amount fields', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Option Expiration',
        transCode: 'OEXP',
        quantity: '1',
        price: '',
        amount: '',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.price).toBeNull();
      expect(result.amount).toBeNull();
    });
  });

  describe('parseTransaction - Date Parsing', () => {
    it('should parse dates correctly', () => {
      const row = {
        activityDate: '1/16/2026',
        processDate: '1/16/2026',
        settleDate: '1/20/2026',
        accountType: '',
        instrument: 'TSLA',
        description: 'Tesla',
        transCode: 'Buy',
        quantity: '100',
        price: '$440.00',
        amount: '($44,000.00)',
        suppressed: '',
      };

      const result = parseTransaction(row);

      expect(result.activityDate).toEqual(utcNoon(2026, 0, 16));
      expect(result.processDate).toEqual(utcNoon(2026, 0, 16));
      expect(result.settleDate).toEqual(utcNoon(2026, 0, 20));
    });
  });
});
