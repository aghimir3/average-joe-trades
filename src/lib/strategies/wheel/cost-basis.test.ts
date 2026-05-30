import { describe, expect, it } from 'vitest';
import { calculateWheelCostBasisEvolution } from '@/lib/strategies/wheel/cost-basis';

describe('calculateWheelCostBasisEvolution', () => {
  it('applies lifetime premium to current shares for effective basis', () => {
    const result = calculateWheelCostBasisEvolution({
      stockPosition: {
        shares: 200,
        costBasis: 86_000,
        avgPrice: 430,
      },
      totalWheelPremium: 3_000,
      totalContractShares: 2_400,
      stockBuyHistory: [
        { quantity: 100, amount: 40_000, price: 400 },
        { quantity: 100, amount: 43_000, price: 430 },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.avgPrice).toBe(430);
    expect(result?.reductionPerShare).toBe(15);
    expect(result?.effectiveCostBasis).toBe(415);
    expect(result?.historicalAverageEntryPrice).toBe(415);
  });

  it('returns null when there are no open shares', () => {
    const result = calculateWheelCostBasisEvolution({
      stockPosition: null,
      totalWheelPremium: 2_500,
      totalContractShares: 1_000,
      stockBuyHistory: [],
    });

    expect(result).toBeNull();
  });

  it('falls back to current avg price when historical buy history is unavailable', () => {
    const result = calculateWheelCostBasisEvolution({
      stockPosition: {
        shares: 50,
        costBasis: 6_500,
        avgPrice: 130,
      },
      totalWheelPremium: 500,
      totalContractShares: 700,
      stockBuyHistory: [],
    });

    expect(result?.historicalAverageEntryPrice).toBe(130);
    expect(result?.reductionPerShare).toBe(10);
    expect(result?.effectiveCostBasis).toBe(120);
  });
});
