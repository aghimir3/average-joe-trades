import { describe, expect, it } from 'vitest';
import {
  applySlippageCost,
  applyTransactionCost,
  executionPriceWithSlippage,
} from './cost-model';

describe('quant backtest cost model', () => {
  it('applies transaction costs in basis points', () => {
    const cost = applyTransactionCost(10_000, 5);
    expect(cost).toBeCloseTo(5, 6);
  });

  it('applies slippage costs in basis points', () => {
    const slippage = applySlippageCost(25_000, 8);
    expect(slippage).toBeCloseTo(20, 6);
  });

  it('adjusts execution price by slippage side', () => {
    const buy = executionPriceWithSlippage(100, 'buy', 10);
    const sell = executionPriceWithSlippage(100, 'sell', 10);
    expect(buy).toBeCloseTo(100.1, 6);
    expect(sell).toBeCloseTo(99.9, 6);
  });
});

