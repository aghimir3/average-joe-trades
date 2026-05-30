/**
 * Income Wheel Strategy Tests
 *
 * Tests for the income-focused wheel strategy calculations:
 * - Week start/end calculations
 * - DTE (Days to Expiration) calculations
 * - Yield calculations (on collateral, annualized)
 * - Premium aggregations
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Helper Functions (matching the API route implementation)
// ============================================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateDTE(expiration: Date, today: Date = new Date()): number {
  const todayNormalized = new Date(today);
  todayNormalized.setHours(0, 0, 0, 0);
  const exp = new Date(expiration);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - todayNormalized.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateYieldOnCollateral(premium: number, collateral: number): number {
  if (collateral <= 0) return 0;
  return (premium / collateral) * 100;
}

function calculateAnnualizedYield(premium: number, collateral: number, dte: number): number {
  if (collateral <= 0 || dte <= 0) return 0;
  return (premium / collateral) * (365 / dte) * 100;
}

function calculateCollateral(strike: number, quantity: number): number {
  return strike * 100 * quantity;
}

// ============================================================================
// Tests
// ============================================================================

describe('Income Wheel Helper Functions', () => {
  describe('getWeekStart', () => {
    it('returns Monday for a Wednesday', () => {
      // Wednesday, January 15, 2025
      const wednesday = new Date(2025, 0, 15);
      const weekStart = getWeekStart(wednesday);

      expect(weekStart.getDay()).toBe(1); // Monday
      expect(formatDate(weekStart)).toBe('2025-01-13');
    });

    it('returns Monday for a Monday', () => {
      // Monday, January 13, 2025
      const monday = new Date(2025, 0, 13);
      const weekStart = getWeekStart(monday);

      expect(weekStart.getDay()).toBe(1);
      expect(formatDate(weekStart)).toBe('2025-01-13');
    });

    it('returns previous Monday for a Sunday', () => {
      // Sunday, January 19, 2025
      const sunday = new Date(2025, 0, 19);
      const weekStart = getWeekStart(sunday);

      expect(weekStart.getDay()).toBe(1);
      expect(formatDate(weekStart)).toBe('2025-01-13');
    });

    it('handles end of month correctly', () => {
      // Friday, January 31, 2025
      const friday = new Date(2025, 0, 31);
      const weekStart = getWeekStart(friday);

      expect(weekStart.getDay()).toBe(1);
      expect(formatDate(weekStart)).toBe('2025-01-27');
    });
  });

  describe('getWeekEnd', () => {
    it('returns Sunday for a week', () => {
      // Wednesday, January 15, 2025
      const wednesday = new Date(2025, 0, 15);
      const weekEnd = getWeekEnd(wednesday);

      expect(weekEnd.getDay()).toBe(0); // Sunday
      expect(formatDate(weekEnd)).toBe('2025-01-19');
    });

    it('week end is 6 days after week start', () => {
      const date = new Date(2025, 0, 15);
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);

      expect(daysBetween(weekStart, weekEnd)).toBe(6);
    });
  });

  describe('daysBetween', () => {
    it('returns 0 for same day', () => {
      const date = new Date(2025, 0, 15);
      expect(daysBetween(date, date)).toBe(0);
    });

    it('returns correct days for different dates', () => {
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 0, 15);
      expect(daysBetween(start, end)).toBe(14);
    });

    it('works regardless of order', () => {
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 0, 15);
      expect(daysBetween(start, end)).toBe(daysBetween(end, start));
    });

    it('handles month boundaries', () => {
      const jan31 = new Date(2025, 0, 31);
      const feb1 = new Date(2025, 1, 1);
      expect(daysBetween(jan31, feb1)).toBe(1);
    });
  });

  describe('calculateDTE', () => {
    it('returns positive DTE for future expiration', () => {
      const today = new Date(2025, 0, 15);
      const expiration = new Date(2025, 0, 31);

      expect(calculateDTE(expiration, today)).toBe(16);
    });

    it('returns 0 for same day expiration', () => {
      const today = new Date(2025, 0, 15);
      const expiration = new Date(2025, 0, 15);

      expect(calculateDTE(expiration, today)).toBe(0);
    });

    it('returns negative DTE for past expiration', () => {
      const today = new Date(2025, 0, 20);
      const expiration = new Date(2025, 0, 15);

      expect(calculateDTE(expiration, today)).toBe(-5);
    });
  });

  describe('calculateCollateral', () => {
    it('calculates collateral for CSP correctly', () => {
      // Strike $150, 1 contract = $15,000 collateral
      expect(calculateCollateral(150, 1)).toBe(15000);
    });

    it('calculates collateral for multiple contracts', () => {
      // Strike $145, 3 contracts = $43,500 collateral
      expect(calculateCollateral(145, 3)).toBe(43500);
    });

    it('handles decimal strikes', () => {
      // Strike $27.50, 2 contracts = $5,500 collateral
      expect(calculateCollateral(27.5, 2)).toBe(5500);
    });
  });

  describe('calculateYieldOnCollateral', () => {
    it('calculates yield correctly', () => {
      // $150 premium on $15,000 collateral = 1%
      const yieldPct = calculateYieldOnCollateral(150, 15000);
      expect(yieldPct).toBe(1);
    });

    it('returns 0 for zero collateral', () => {
      expect(calculateYieldOnCollateral(100, 0)).toBe(0);
    });

    it('returns 0 for negative collateral', () => {
      expect(calculateYieldOnCollateral(100, -1000)).toBe(0);
    });

    it('handles high yields correctly', () => {
      // $500 premium on $5,000 collateral = 10%
      const yieldPct = calculateYieldOnCollateral(500, 5000);
      expect(yieldPct).toBe(10);
    });
  });

  describe('calculateAnnualizedYield', () => {
    it('calculates annualized yield correctly for 30 DTE', () => {
      // $150 premium on $15,000 collateral, 30 DTE
      // (150/15000) * (365/30) * 100 = 12.17%
      const annualized = calculateAnnualizedYield(150, 15000, 30);
      expect(annualized).toBeCloseTo(12.17, 1);
    });

    it('calculates annualized yield correctly for 45 DTE', () => {
      // $200 premium on $10,000 collateral, 45 DTE
      // (200/10000) * (365/45) * 100 = 16.22%
      const annualized = calculateAnnualizedYield(200, 10000, 45);
      expect(annualized).toBeCloseTo(16.22, 1);
    });

    it('returns 0 for zero DTE', () => {
      expect(calculateAnnualizedYield(150, 15000, 0)).toBe(0);
    });

    it('returns 0 for zero collateral', () => {
      expect(calculateAnnualizedYield(150, 0, 30)).toBe(0);
    });

    it('handles 1-day DTE (high annualized yield)', () => {
      // $10 premium on $10,000 collateral, 1 DTE
      // (10/10000) * (365/1) * 100 = 36.5%
      const annualized = calculateAnnualizedYield(10, 10000, 1);
      expect(annualized).toBe(36.5);
    });
  });
});

describe('Income Wheel Metrics Calculations', () => {
  describe('Premium Aggregations', () => {
    interface ClosedTrade {
      closeDate: Date;
      realizedPnL: number;
      strategy: string;
      optionType: string;
      side: string;
    }

    function calculatePremiumInRange(trades: ClosedTrade[], startDate: Date): number {
      return trades
        .filter(t => t.closeDate >= startDate)
        .reduce((sum, t) => sum + t.realizedPnL, 0);
    }

    function isCC(trade: ClosedTrade): boolean {
      return trade.strategy === 'covered_call' ||
        (trade.optionType === 'call' && trade.side === 'short');
    }

    function isCSP(trade: ClosedTrade): boolean {
      return trade.strategy === 'cash_secured_put' ||
        (trade.optionType === 'put' && trade.side === 'short');
    }

    it('calculates total premium from closed trades', () => {
      const trades: ClosedTrade[] = [
        { closeDate: new Date(2025, 0, 10), realizedPnL: 150, strategy: 'covered_call', optionType: 'call', side: 'short' },
        { closeDate: new Date(2025, 0, 15), realizedPnL: 200, strategy: 'cash_secured_put', optionType: 'put', side: 'short' },
        { closeDate: new Date(2025, 0, 20), realizedPnL: 175, strategy: 'covered_call', optionType: 'call', side: 'short' },
      ];

      const totalPremium = trades.reduce((sum, t) => sum + t.realizedPnL, 0);
      expect(totalPremium).toBe(525);
    });

    it('separates CC and CSP premiums', () => {
      const trades: ClosedTrade[] = [
        { closeDate: new Date(2025, 0, 10), realizedPnL: 150, strategy: 'covered_call', optionType: 'call', side: 'short' },
        { closeDate: new Date(2025, 0, 15), realizedPnL: 200, strategy: 'cash_secured_put', optionType: 'put', side: 'short' },
        { closeDate: new Date(2025, 0, 20), realizedPnL: 175, strategy: 'covered_call', optionType: 'call', side: 'short' },
      ];

      const ccPremium = trades.filter(isCC).reduce((sum, t) => sum + t.realizedPnL, 0);
      const cspPremium = trades.filter(isCSP).reduce((sum, t) => sum + t.realizedPnL, 0);

      expect(ccPremium).toBe(325);
      expect(cspPremium).toBe(200);
    });

    it('filters premiums by date range', () => {
      const trades: ClosedTrade[] = [
        { closeDate: new Date(2025, 0, 5), realizedPnL: 100, strategy: 'covered_call', optionType: 'call', side: 'short' },
        { closeDate: new Date(2025, 0, 10), realizedPnL: 150, strategy: 'covered_call', optionType: 'call', side: 'short' },
        { closeDate: new Date(2025, 0, 20), realizedPnL: 200, strategy: 'covered_call', optionType: 'call', side: 'short' },
      ];

      const startDate = new Date(2025, 0, 8);
      const filteredPremium = calculatePremiumInRange(trades, startDate);

      expect(filteredPremium).toBe(350); // 150 + 200 (excludes 100)
    });
  });

  describe('Win Rate Calculations', () => {
    it('calculates win rate correctly', () => {
      const trades = [
        { realizedPnL: 150 },  // Win
        { realizedPnL: -50 },  // Loss
        { realizedPnL: 200 },  // Win
        { realizedPnL: 100 },  // Win
        { realizedPnL: -30 },  // Loss
      ];

      const winCount = trades.filter(t => t.realizedPnL > 0).length;
      const winRate = (winCount / trades.length) * 100;

      expect(winRate).toBe(60);
    });

    it('returns 0% for all losses', () => {
      const trades = [
        { realizedPnL: -50 },
        { realizedPnL: -30 },
      ];

      const winCount = trades.filter(t => t.realizedPnL > 0).length;
      const winRate = (winCount / trades.length) * 100;

      expect(winRate).toBe(0);
    });

    it('returns 100% for all wins', () => {
      const trades = [
        { realizedPnL: 150 },
        { realizedPnL: 200 },
      ];

      const winCount = trades.filter(t => t.realizedPnL > 0).length;
      const winRate = (winCount / trades.length) * 100;

      expect(winRate).toBe(100);
    });
  });

  describe('Weekly Premium History', () => {
    it('groups trades by week correctly', () => {
      const trades = [
        { closeDate: new Date(2025, 0, 13), realizedPnL: 100 }, // Week of Jan 13
        { closeDate: new Date(2025, 0, 15), realizedPnL: 150 }, // Week of Jan 13
        { closeDate: new Date(2025, 0, 20), realizedPnL: 200 }, // Week of Jan 20
      ];

      const weeklyMap = new Map<string, number>();

      for (const trade of trades) {
        const weekStart = getWeekStart(trade.closeDate);
        const key = formatDate(weekStart);
        const existing = weeklyMap.get(key) || 0;
        weeklyMap.set(key, existing + trade.realizedPnL);
      }

      expect(weeklyMap.get('2025-01-13')).toBe(250);
      expect(weeklyMap.get('2025-01-20')).toBe(200);
    });
  });
});

describe('Cost Basis Evolution', () => {
  interface StockHolding {
    symbol: string;
    shares: number;
    acquisitionPrice: number;
    totalPremiumCollected: number;
  }

  function calculateEffectiveCostBasis(holding: StockHolding): number {
    const totalCost = holding.acquisitionPrice * holding.shares;
    return (totalCost - holding.totalPremiumCollected) / holding.shares;
  }

  it('reduces cost basis with CSP premium', () => {
    const holding: StockHolding = {
      symbol: 'AAPL',
      shares: 100,
      acquisitionPrice: 150, // Bought at $150 via CSP assignment
      totalPremiumCollected: 250, // CSP premium collected
    };

    const effectiveCostBasis = calculateEffectiveCostBasis(holding);

    // ($150 * 100 - $250) / 100 = $147.50
    expect(effectiveCostBasis).toBe(147.5);
  });

  it('continues reducing with CC premium', () => {
    const holding: StockHolding = {
      symbol: 'AAPL',
      shares: 100,
      acquisitionPrice: 150,
      totalPremiumCollected: 750, // $250 CSP + $500 CC premiums
    };

    const effectiveCostBasis = calculateEffectiveCostBasis(holding);

    // ($150 * 100 - $750) / 100 = $142.50
    expect(effectiveCostBasis).toBe(142.5);
  });

  it('can go negative (free shares!)', () => {
    const holding: StockHolding = {
      symbol: 'SOXL',
      shares: 100,
      acquisitionPrice: 30,
      totalPremiumCollected: 3500, // Lots of wheel cycles
    };

    const effectiveCostBasis = calculateEffectiveCostBasis(holding);

    // ($30 * 100 - $3500) / 100 = -$5
    expect(effectiveCostBasis).toBe(-5);
  });
});

describe('Position Management', () => {
  describe('DTE Classification', () => {
    function getDTEStatus(dte: number): 'danger' | 'warning' | 'safe' {
      if (dte <= 7) return 'danger';
      if (dte <= 14) return 'warning';
      return 'safe';
    }

    it('classifies DTE <= 7 as danger', () => {
      expect(getDTEStatus(0)).toBe('danger');
      expect(getDTEStatus(3)).toBe('danger');
      expect(getDTEStatus(7)).toBe('danger');
    });

    it('classifies DTE 8-14 as warning', () => {
      expect(getDTEStatus(8)).toBe('warning');
      expect(getDTEStatus(10)).toBe('warning');
      expect(getDTEStatus(14)).toBe('warning');
    });

    it('classifies DTE > 14 as safe', () => {
      expect(getDTEStatus(15)).toBe('safe');
      expect(getDTEStatus(30)).toBe('safe');
      expect(getDTEStatus(45)).toBe('safe');
    });
  });

  describe('Position Yield Calculations', () => {
    interface Position {
      strike: number;
      quantity: number;
      premium: number;
      dte: number;
    }

    function getPositionMetrics(position: Position) {
      const collateral = position.strike * 100 * position.quantity;
      const yieldOnCollateral = calculateYieldOnCollateral(position.premium, collateral);
      const annualizedYield = calculateAnnualizedYield(position.premium, collateral, position.dte);

      return { collateral, yieldOnCollateral, annualizedYield };
    }

    it('calculates metrics for a typical CSP', () => {
      const csp: Position = {
        strike: 145,
        quantity: 1,
        premium: 200,
        dte: 30,
      };

      const metrics = getPositionMetrics(csp);

      expect(metrics.collateral).toBe(14500);
      expect(metrics.yieldOnCollateral).toBeCloseTo(1.38, 1);
      expect(metrics.annualizedYield).toBeCloseTo(16.78, 1);
    });

    it('calculates metrics for multiple contracts', () => {
      const csp: Position = {
        strike: 50,
        quantity: 5,
        premium: 750,
        dte: 45,
      };

      const metrics = getPositionMetrics(csp);

      expect(metrics.collateral).toBe(25000);
      expect(metrics.yieldOnCollateral).toBe(3);
      expect(metrics.annualizedYield).toBeCloseTo(24.33, 1);
    });
  });
});

describe('Income Metrics Summary', () => {
  it('calculates weekly average correctly', () => {
    const premium52Weeks = 5200; // $5,200 over 52 weeks
    const weeklyAvg = premium52Weeks / 52;

    expect(weeklyAvg).toBe(100);
  });

  it('calculates monthly average from weekly', () => {
    const weeklyAvg = 100;
    const monthlyAvg = weeklyAvg * 4.33;

    expect(monthlyAvg).toBeCloseTo(433, 0);
  });

  it('calculates average premium per trade', () => {
    const totalPremium = 5000;
    const tradeCount = 25;
    const avgPremium = totalPremium / tradeCount;

    expect(avgPremium).toBe(200);
  });
});
