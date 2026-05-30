export interface StockPositionSnapshot {
  shares: number;
  costBasis: number;
  avgPrice: number;
}

export interface StockBuyHistoryPoint {
  quantity: number;
  amount: number;
  price: number;
}

export interface WheelCostBasisEvolution {
  shares: number;
  originalCostBasis: number;
  avgPrice: number;
  historicalAverageEntryPrice: number;
  historicalBoughtShares: number;
  totalPremiumCollected: number;
  effectiveCostBasis: number;
  reductionPerShare: number;
  totalContractShares: number;
  methodology: 'lifetime_wheel_premium_per_current_share';
}

export function calculateWheelCostBasisEvolution(params: {
  stockPosition: StockPositionSnapshot | null;
  totalWheelPremium: number;
  totalContractShares: number;
  stockBuyHistory: StockBuyHistoryPoint[];
}): WheelCostBasisEvolution | null {
  const { stockPosition, totalWheelPremium, totalContractShares, stockBuyHistory } = params;
  if (!stockPosition || stockPosition.shares <= 0) {
    return null;
  }

  const historicalBoughtShares = stockBuyHistory.reduce((sum, event) => sum + event.quantity, 0);
  const historicalBoughtNotional = stockBuyHistory.reduce((sum, event) => sum + event.amount, 0);
  const historicalAverageEntryPrice = historicalBoughtShares > 0
    ? historicalBoughtNotional / historicalBoughtShares
    : stockPosition.avgPrice;

  const reductionPerShare = totalWheelPremium / stockPosition.shares;
  const effectiveCostBasis = stockPosition.avgPrice - reductionPerShare;

  return {
    shares: round(stockPosition.shares, 3),
    originalCostBasis: round(stockPosition.costBasis, 2),
    avgPrice: round(stockPosition.avgPrice, 2),
    historicalAverageEntryPrice: round(historicalAverageEntryPrice, 2),
    historicalBoughtShares: round(historicalBoughtShares, 3),
    totalPremiumCollected: round(totalWheelPremium, 2),
    effectiveCostBasis: round(effectiveCostBasis, 2),
    reductionPerShare: round(reductionPerShare, 2),
    totalContractShares: round(totalContractShares, 3),
    methodology: 'lifetime_wheel_premium_per_current_share',
  };
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
