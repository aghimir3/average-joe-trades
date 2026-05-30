import { prisma } from '@/lib/prisma';
import { buildAccountScope } from '@/lib/db/account-scope';
import { buildLeakageSafeStockFeatures } from '@/lib/quant/features';
import { StockTrendStrategy } from '@/lib/quant/strategy';
import { ensurePriceHistoryCached, ensureQuotesCached } from '@/lib/market/cache';

export interface QuantActionSignal {
  id: string;
  symbol: string;
  side: 'buy' | 'sell' | 'hold';
  strength: number;
  horizon: 'intraday' | 'swing' | 'position';
  confidence: number;
  confidenceBand: 'low' | 'medium' | 'high';
  expectedReturnPct: number;
  rationaleCodes: string[];
  riskFlags: string[];
  timestamp: string;
  dataFreshness?: {
    quoteAsOf?: string | null;
    barsAsOf?: string | null;
    stale?: boolean;
  };
}

export async function generateQuantActionSignals(
  userId: string,
  accountId?: string | null
): Promise<QuantActionSignal[]> {
  const scope = buildAccountScope(accountId);
  const positions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'stock',
      quantity: { not: 0 },
      ...scope,
    },
    select: {
      id: true,
      symbol: true,
      side: true,
      quantity: true,
      avgPrice: true,
    },
    take: 24,
    orderBy: { firstEntryDate: 'desc' },
  });

  if (positions.length === 0) return [];

  const strategy = new StockTrendStrategy();
  const now = new Date();
  const historyStart = new Date(now);
  historyStart.setFullYear(now.getFullYear() - 2);

  const symbols = Array.from(new Set(positions.map((position) => position.symbol.split(' ')[0]))).slice(0, 12);
  const positionsBySymbol = new Map<
    string,
    Array<{
      symbol: string;
      quantity: number;
      avgPrice: number;
      side: 'long' | 'short';
    }>
  >();

  for (const position of positions) {
    const symbol = position.symbol.split(' ')[0];
    if (!symbols.includes(symbol)) continue;
    const existing = positionsBySymbol.get(symbol) || [];
    existing.push({
      symbol,
      quantity: Number(position.quantity),
      avgPrice: Number(position.avgPrice),
      side: position.side === 'short' ? 'short' : 'long',
    });
    positionsBySymbol.set(symbol, existing);
  }

  const quoteMap = await ensureQuotesCached(symbols, {
    triggerSource: 'ai_actions_quant_signal',
  });
  const signalGroups = await Promise.all(
    symbols.map(async (symbol): Promise<QuantActionSignal[]> => {
      try {
        const barsResult = await ensurePriceHistoryCached({
          symbol,
          start: historyStart,
          end: now,
          interval: '1d',
          triggerSource: 'ai_actions_quant_signal',
        });
        const bars = barsResult.bars;

        const features = buildLeakageSafeStockFeatures(bars);
        if (features.length === 0) return [];

        const latestFeature = features[features.length - 1];
        const generated = strategy.generateSignals({
          symbol,
          bars,
          features,
          openPositions: positionsBySymbol.get(symbol) || [],
          asOf: latestFeature.timestamp,
        });

        return generated.map((signal) => ({
          id: `quant-${symbol}-${signal.side}-${signal.timestamp}`,
          symbol,
          side: signal.side,
          strength: signal.strength,
          horizon: signal.horizon,
          confidence: signal.confidence,
          confidenceBand: signal.confidenceBand,
          expectedReturnPct: signal.expectedReturnPct,
          rationaleCodes: signal.rationaleCodes,
          riskFlags: signal.riskFlags,
          timestamp: signal.timestamp,
          dataFreshness: {
            quoteAsOf: quoteMap.get(symbol)?.fetchedAt ?? null,
            barsAsOf: barsResult.dataAsOf,
            stale: barsResult.stale || quoteMap.get(symbol)?.stale === true,
          },
        }));
      } catch {
        // Best-effort generation: skip symbols with missing market data.
        return [];
      }
    })
  );

  const signals = signalGroups.flat();

  return signals
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}
