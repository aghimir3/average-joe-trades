export function applyTransactionCost(notional: number, transactionCostBps: number): number {
  return Math.abs(notional) * (transactionCostBps / 10_000);
}

export function applySlippageCost(notional: number, slippageBps: number): number {
  return Math.abs(notional) * (slippageBps / 10_000);
}

export function executionPriceWithSlippage(
  referencePrice: number,
  side: 'buy' | 'sell',
  slippageBps: number
): number {
  const impact = slippageBps / 10_000;
  if (side === 'buy') {
    return referencePrice * (1 + impact);
  }
  return referencePrice * (1 - impact);
}

