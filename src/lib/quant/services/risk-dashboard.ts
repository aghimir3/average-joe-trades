import { prisma } from '@/lib/prisma';
import { buildAccountScope } from '@/lib/db/account-scope';
import { evaluatePortfolioRisk } from '@/lib/quant/risk';

export async function getPortfolioRiskDashboard(userId: string, accountId?: string | null) {
  const scope = buildAccountScope(accountId);

  const [derivedPositions, brokerPositions, dailyAggregates] = await Promise.all([
    prisma.derivedPosition.findMany({
      where: {
        userId,
        quantity: { not: 0 },
        ...scope,
      },
      select: {
        symbol: true,
        side: true,
        quantity: true,
        avgPrice: true,
      },
    }),
    prisma.brokerPosition.findMany({
      where: {
        userId,
        ...scope,
      },
      select: {
        symbol: true,
        marketValue: true,
      },
    }),
    prisma.dailyAggregate.findMany({
      where: {
        userId,
        ...scope,
      },
      orderBy: { date: 'asc' },
      take: 252,
      select: {
        realizedPnL: true,
      },
    }),
  ]);

  const brokerMarketValueBySymbol = new Map<string, number>();
  for (const brokerPosition of brokerPositions) {
    const existing = brokerMarketValueBySymbol.get(brokerPosition.symbol) ?? 0;
    brokerMarketValueBySymbol.set(
      brokerPosition.symbol,
      existing + Number(brokerPosition.marketValue)
    );
  }

  const positions = derivedPositions.map((position) => {
    const fallbackMarketValue = Number(position.avgPrice) * Number(position.quantity);
    const brokerMarketValue = brokerMarketValueBySymbol.get(position.symbol);
    return {
      symbol: position.symbol,
      marketValue: Number.isFinite(brokerMarketValue ?? NaN)
        ? Number(brokerMarketValue)
        : fallbackMarketValue,
      side: position.side === 'short' ? 'short' as const : 'long' as const,
      sector: null,
    };
  });

  const equityEstimate = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const dailyReturns = dailyAggregates.map((row) =>
    Number(row.realizedPnL) / Math.max(1, Math.abs(equityEstimate))
  );

  const report = evaluatePortfolioRisk({
    equity: Math.max(1, equityEstimate),
    positions,
    dailyReturns,
  });

  return {
    asOf: new Date().toISOString(),
    report,
    positionCount: positions.length,
  };
}
