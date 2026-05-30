import { prisma } from '@/lib/prisma';

export interface CommunityRegimeInsight {
  regimeKey: string;
  ivRegime: 'high_iv' | 'low_iv';
  trendRegime: 'trending' | 'mean_reverting';
  sampleSize: number;
  uniqueTraders: number;
  winRate: number;
  avgReturnPct: number;
  confidence: number;
  significance: 'low' | 'medium' | 'high';
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export async function getCommunityRegimeInsights(): Promise<CommunityRegimeInsight[]> {
  const trades = await prisma.realizedClose.findMany({
    where: {
      hasUnknownBasis: false,
      closeType: 'option',
    },
    select: {
      userId: true,
      openAmount: true,
      realizedPnL: true,
      strike: true,
      openDate: true,
      closeDate: true,
    },
    take: 20_000,
    orderBy: { closeDate: 'desc' },
  });

  if (trades.length < 50) {
    return [];
  }

  const premiumPctSamples = trades
    .filter((trade) => Number(trade.strike) > 0)
    .map((trade) => Math.abs(Number(trade.openAmount)) / (Number(trade.strike) * 100));

  const ivSplit = percentile(premiumPctSamples, 60);
  const trendSplit = percentile(
    trades.map((trade) => {
      const days = Math.max(
        1,
        Math.ceil((trade.closeDate.getTime() - trade.openDate.getTime()) / (24 * 60 * 60 * 1000))
      );
      return days;
    }),
    50
  );

  const grouped = new Map<string, Array<typeof trades[number]>>();
  for (const trade of trades) {
    const strike = Number(trade.strike) || 0;
    const premiumPct = strike > 0 ? Math.abs(Number(trade.openAmount)) / (strike * 100) : 0;
    const holdDays = Math.max(
      1,
      Math.ceil((trade.closeDate.getTime() - trade.openDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    const ivRegime: 'high_iv' | 'low_iv' = premiumPct >= ivSplit ? 'high_iv' : 'low_iv';
    const trendRegime: 'trending' | 'mean_reverting' = holdDays >= trendSplit ? 'trending' : 'mean_reverting';
    const key = `${ivRegime}:${trendRegime}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(trade);
    grouped.set(key, bucket);
  }

  const insights: CommunityRegimeInsight[] = [];
  for (const [regimeKey, bucket] of grouped.entries()) {
    if (bucket.length < 20) continue;
    const wins = bucket.filter((trade) => Number(trade.realizedPnL) > 0).length;
    const returns = bucket.map((trade) => {
      const cost = Math.max(1, Math.abs(Number(trade.openAmount)));
      return (Number(trade.realizedPnL) / cost) * 100;
    });
    const avgReturnPct = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const uniqueTraders = new Set(bucket.map((trade) => trade.userId)).size;
    const winRate = wins / bucket.length;
    const confidence = Math.min(1, bucket.length / 120) * Math.min(1, uniqueTraders / 15);

    const [ivRegime, trendRegime] = regimeKey.split(':') as ['high_iv' | 'low_iv', 'trending' | 'mean_reverting'];
    insights.push({
      regimeKey,
      ivRegime,
      trendRegime,
      sampleSize: bucket.length,
      uniqueTraders,
      winRate,
      avgReturnPct,
      confidence,
      significance:
        bucket.length >= 200 && uniqueTraders >= 20
          ? 'high'
          : bucket.length >= 80 && uniqueTraders >= 10
            ? 'medium'
            : 'low',
    });
  }

  return insights.sort((a, b) => b.confidence - a.confidence);
}

