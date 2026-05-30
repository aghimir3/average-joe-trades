/**
 * Weekly Return Insights Calculation Tests
 *
 * Tests for the weekly return calculation logic used in Ticker Deep Dive.
 * Formula: Weekly Return = (premium / (currentPrice * 100 * quantity)) * (7 / daysHeld) * 100
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Calculation Functions (mirroring API logic for testing)
// ============================================================================

interface Trade {
  premium: number;
  daysHeld: number;
  quantity: number;
  optionType: 'call' | 'put';
}

/**
 * Calculate weekly return for a single trade rebased to current price
 */
function calculateWeeklyReturn(
  trade: Trade,
  currentPrice: number
): number {
  if (trade.daysHeld <= 0 || trade.quantity <= 0 || currentPrice <= 0) {
    return 0;
  }

  const collateralAtCurrentPrice = currentPrice * 100 * trade.quantity;
  const yieldPct = (trade.premium / collateralAtCurrentPrice) * 100;
  const weeklyReturn = yieldPct * (7 / trade.daysHeld);

  return weeklyReturn;
}

/**
 * Calculate weighted average weekly return for a list of trades
 */
function calculateWeightedAverageWeeklyReturn(
  trades: Trade[],
  currentPrice: number
): number {
  const validTrades = trades.filter(t => t.daysHeld > 0 && t.quantity > 0);

  if (validTrades.length === 0 || currentPrice <= 0) {
    return 0;
  }

  let totalWeightedReturn = 0;
  let totalPremium = 0;

  for (const trade of validTrades) {
    const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);
    totalWeightedReturn += weeklyReturn * trade.premium;
    totalPremium += trade.premium;
  }

  return totalPremium > 0 ? totalWeightedReturn / totalPremium : 0;
}

/**
 * Calculate annualized return from weekly return
 */
function calculateAnnualizedReturn(weeklyReturn: number): number {
  return weeklyReturn * 52;
}

// ============================================================================
// Test Cases
// ============================================================================

describe('Weekly Return Insights Calculations', () => {
  describe('calculateWeeklyReturn', () => {
    it('should calculate correct weekly return for a basic trade', () => {
      // Example: $400 premium on $400 stock with 7-day DTE = 1% weekly return
      const trade: Trade = {
        premium: 400,
        daysHeld: 7,
        quantity: 1,
        optionType: 'call',
      };
      const currentPrice = 400;

      const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);

      // Premium = $400, Collateral = $400 * 100 * 1 = $40,000
      // Yield = 400 / 40000 * 100 = 1%
      // Weekly = 1% * (7/7) = 1%
      expect(weeklyReturn).toBeCloseTo(1.0, 4);
    });

    it('should scale weekly return based on DTE', () => {
      // Same premium but 14-day DTE = 0.5% weekly return
      const trade: Trade = {
        premium: 400,
        daysHeld: 14,
        quantity: 1,
        optionType: 'call',
      };
      const currentPrice = 400;

      const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);

      // Yield = 1%, Weekly = 1% * (7/14) = 0.5%
      expect(weeklyReturn).toBeCloseTo(0.5, 4);
    });

    it('should handle multiple contracts', () => {
      // $800 premium on 2 contracts at $400 = 1% weekly return
      const trade: Trade = {
        premium: 800,
        daysHeld: 7,
        quantity: 2,
        optionType: 'call',
      };
      const currentPrice = 400;

      const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);

      // Collateral = $400 * 100 * 2 = $80,000
      // Yield = 800 / 80000 * 100 = 1%
      expect(weeklyReturn).toBeCloseTo(1.0, 4);
    });

    it('should rebase correctly to different current prices', () => {
      // Historical: $400 premium on $400 stock
      // Current price: $500
      const trade: Trade = {
        premium: 400,
        daysHeld: 7,
        quantity: 1,
        optionType: 'call',
      };
      const currentPrice = 500;

      const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);

      // Collateral at $500 = $500 * 100 = $50,000
      // Yield = 400 / 50000 * 100 = 0.8%
      expect(weeklyReturn).toBeCloseTo(0.8, 4);
    });

    it('should handle short DTE trades', () => {
      // $200 premium with 2-day DTE
      const trade: Trade = {
        premium: 200,
        daysHeld: 2,
        quantity: 1,
        optionType: 'put',
      };
      const currentPrice = 400;

      const weeklyReturn = calculateWeeklyReturn(trade, currentPrice);

      // Collateral = $40,000
      // Yield = 200 / 40000 * 100 = 0.5%
      // Weekly = 0.5% * (7/2) = 1.75%
      expect(weeklyReturn).toBeCloseTo(1.75, 4);
    });

    it('should return 0 for zero days held', () => {
      const trade: Trade = {
        premium: 400,
        daysHeld: 0,
        quantity: 1,
        optionType: 'call',
      };

      const weeklyReturn = calculateWeeklyReturn(trade, 400);
      expect(weeklyReturn).toBe(0);
    });

    it('should return 0 for zero quantity', () => {
      const trade: Trade = {
        premium: 400,
        daysHeld: 7,
        quantity: 0,
        optionType: 'call',
      };

      const weeklyReturn = calculateWeeklyReturn(trade, 400);
      expect(weeklyReturn).toBe(0);
    });

    it('should return 0 for zero current price', () => {
      const trade: Trade = {
        premium: 400,
        daysHeld: 7,
        quantity: 1,
        optionType: 'call',
      };

      const weeklyReturn = calculateWeeklyReturn(trade, 0);
      expect(weeklyReturn).toBe(0);
    });
  });

  describe('calculateWeightedAverageWeeklyReturn', () => {
    it('should calculate weighted average correctly', () => {
      const trades: Trade[] = [
        { premium: 400, daysHeld: 7, quantity: 1, optionType: 'call' }, // 1% weekly
        { premium: 200, daysHeld: 7, quantity: 1, optionType: 'call' }, // 0.5% weekly
      ];
      const currentPrice = 400;

      const avgReturn = calculateWeightedAverageWeeklyReturn(trades, currentPrice);

      // Trade 1: 1% weekly, weight = 400
      // Trade 2: 0.5% weekly, weight = 200
      // Weighted avg = (1 * 400 + 0.5 * 200) / (400 + 200) = 500 / 600 = 0.833%
      expect(avgReturn).toBeCloseTo(0.8333, 3);
    });

    it('should handle single trade', () => {
      const trades: Trade[] = [
        { premium: 400, daysHeld: 7, quantity: 1, optionType: 'call' },
      ];
      const currentPrice = 400;

      const avgReturn = calculateWeightedAverageWeeklyReturn(trades, currentPrice);
      expect(avgReturn).toBeCloseTo(1.0, 4);
    });

    it('should filter out invalid trades', () => {
      const trades: Trade[] = [
        { premium: 400, daysHeld: 7, quantity: 1, optionType: 'call' }, // Valid
        { premium: 200, daysHeld: 0, quantity: 1, optionType: 'call' }, // Invalid - zero DTE
        { premium: 100, daysHeld: 7, quantity: 0, optionType: 'put' }, // Invalid - zero qty
      ];
      const currentPrice = 400;

      const avgReturn = calculateWeightedAverageWeeklyReturn(trades, currentPrice);

      // Only first trade is valid
      expect(avgReturn).toBeCloseTo(1.0, 4);
    });

    it('should return 0 for empty trades array', () => {
      const avgReturn = calculateWeightedAverageWeeklyReturn([], 400);
      expect(avgReturn).toBe(0);
    });

    it('should return 0 for all invalid trades', () => {
      const trades: Trade[] = [
        { premium: 200, daysHeld: 0, quantity: 1, optionType: 'call' },
        { premium: 100, daysHeld: 7, quantity: 0, optionType: 'put' },
      ];

      const avgReturn = calculateWeightedAverageWeeklyReturn(trades, 400);
      expect(avgReturn).toBe(0);
    });
  });

  describe('calculateAnnualizedReturn', () => {
    it('should annualize weekly return correctly', () => {
      // 1% weekly = 52% annual
      expect(calculateAnnualizedReturn(1)).toBe(52);
    });

    it('should handle fractional returns', () => {
      // 0.5% weekly = 26% annual
      expect(calculateAnnualizedReturn(0.5)).toBe(26);
    });

    it('should handle zero return', () => {
      expect(calculateAnnualizedReturn(0)).toBe(0);
    });

    it('should handle negative returns', () => {
      // -0.5% weekly = -26% annual
      expect(calculateAnnualizedReturn(-0.5)).toBe(-26);
    });
  });

  describe('Real-world scenarios', () => {
    it('should calculate TSLA example correctly', () => {
      // TSLA at $400 current price
      // Historical trades: 192 CCs earning $85K, 113 CSPs earning $49K
      // Avg DTE: 2.1 days
      const currentPrice = 400;

      // Simulated trades based on the example
      // CC: ~$443 avg premium per trade
      const ccTrade: Trade = {
        premium: 443,
        daysHeld: 2.1,
        quantity: 1,
        optionType: 'call',
      };

      // CSP: ~$434 avg premium per trade
      const cspTrade: Trade = {
        premium: 434,
        daysHeld: 2.1,
        quantity: 1,
        optionType: 'put',
      };

      const ccWeekly = calculateWeeklyReturn(ccTrade, currentPrice);
      const cspWeekly = calculateWeeklyReturn(cspTrade, currentPrice);

      // CC: Collateral = $40,000
      // Yield = 443/40000 * 100 = 1.1075%
      // Weekly = 1.1075 * (7/2.1) = 3.69%
      expect(ccWeekly).toBeCloseTo(3.69, 1);

      // CSP: Similar calculation
      // Yield = 434/40000 * 100 = 1.085%
      // Weekly = 1.085 * (7/2.1) = 3.62%
      expect(cspWeekly).toBeCloseTo(3.62, 1);
    });

    it('should handle diversified portfolio', () => {
      const trades: Trade[] = [
        // High premium, short DTE
        { premium: 500, daysHeld: 3, quantity: 1, optionType: 'call' },
        // Lower premium, longer DTE
        { premium: 200, daysHeld: 30, quantity: 1, optionType: 'call' },
        // Multiple contracts
        { premium: 300, daysHeld: 7, quantity: 2, optionType: 'put' },
      ];
      const currentPrice = 100;

      const avgReturn = calculateWeightedAverageWeeklyReturn(trades, currentPrice);

      // Trade 1: Yield = 500/10000 = 5%, Weekly = 5 * (7/3) = 11.67%
      // Trade 2: Yield = 200/10000 = 2%, Weekly = 2 * (7/30) = 0.47%
      // Trade 3: Collateral = 20000, Yield = 300/20000 = 1.5%, Weekly = 1.5 * (7/7) = 1.5%
      // Weighted: (11.67*500 + 0.47*200 + 1.5*300) / (500+200+300)
      //         = (5835 + 94 + 450) / 1000 = 6.379%
      expect(avgReturn).toBeCloseTo(6.379, 2);
    });
  });
});
