import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import { getCommunityInsight } from '@/lib/ml/community';
import { ensureQuotesCached } from '@/lib/market/cache';
import { buildAccountScope } from '@/lib/db/account-scope';
import type {
  StockActionSignal,
  StockModelStatus,
  StockTradeObservation,
  WeightedStockPerformance,
} from './types';
import {
  blendWithCommunity,
  clamp,
  computeWeightedPerformance,
  decideStockAction,
  shrinkToBaseline,
} from './signal-utils';

const log = createChildLogger({ module: 'stock-model' });

const MIN_STOCK_TRADES = 15;

interface MarketSnapshot {
  currentPrice: number;
  dayChangePercent: number;
  source: 'broker' | 'yahoo';
}

function normalizeStockSymbol(symbol: string): string {
  return symbol.split(' ')[0];
}

function buildTradeObservation(row: {
  symbol: string;
  openDate: Date;
  closeDate: Date;
  openAmount: unknown;
  realizedPnL: unknown;
}): StockTradeObservation | null {
  const openAmount = Math.abs(Number(row.openAmount));
  const realizedPnL = Number(row.realizedPnL);

  if (!Number.isFinite(openAmount) || openAmount <= 0 || !Number.isFinite(realizedPnL)) {
    return null;
  }

  const returnPct = (realizedPnL / openAmount) * 100;
  const holdDays = Math.max(
    1,
    Math.ceil((row.closeDate.getTime() - row.openDate.getTime()) / (24 * 60 * 60 * 1000))
  );

  return {
    symbol: normalizeStockSymbol(row.symbol),
    closeDate: row.closeDate,
    holdDays,
    returnPct,
  };
}

async function buildMarketSnapshotMap(
  userId: string,
  symbols: string[],
  accountId?: string | null
): Promise<Map<string, MarketSnapshot>> {
  const snapshots = new Map<string, MarketSnapshot>();
  const accountScope = buildAccountScope(accountId);

  const brokerRows = await prisma.brokerPosition.findMany({
    where: {
      userId,
      positionType: 'stock',
      symbol: { in: symbols },
      ...accountScope,
    },
    select: {
      symbol: true,
      marketPrice: true,
      priceChangePct: true,
      lastSyncAt: true,
    },
    orderBy: { lastSyncAt: 'desc' },
  });

  for (const row of brokerRows) {
    const symbol = normalizeStockSymbol(row.symbol);
    if (snapshots.has(symbol)) continue;

    const marketPrice = Number(row.marketPrice);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) continue;

    snapshots.set(symbol, {
      currentPrice: marketPrice,
      dayChangePercent: Number(row.priceChangePct) || 0,
      source: 'broker',
    });
  }

  const missingSymbols = symbols.filter((symbol) => !snapshots.has(symbol));
  if (missingSymbols.length === 0) return snapshots;

  const quoteMap = await ensureQuotesCached(missingSymbols, {
    triggerSource: 'stock_model_actions',
  });
  for (const [symbol, snapshot] of quoteMap.entries()) {
    if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) continue;
    snapshots.set(symbol, {
      currentPrice: snapshot.price,
      dayChangePercent: snapshot.dayChangePercent,
      source: 'yahoo',
    });
  }

  return snapshots;
}

async function loadUserStockHistory(userId: string, accountId?: string | null) {
  const accountScope = buildAccountScope(accountId);

  const rows = await prisma.realizedClose.findMany({
    where: {
      userId,
      closeType: 'stock',
      hasUnknownBasis: false,
      ...accountScope,
    },
    select: {
      symbol: true,
      openDate: true,
      closeDate: true,
      openAmount: true,
      realizedPnL: true,
    },
  });

  const observations: StockTradeObservation[] = [];
  for (const row of rows) {
    const obs = buildTradeObservation(row);
    if (obs) observations.push(obs);
  }

  return observations;
}

function getDefaultPerformance(): WeightedStockPerformance {
  return {
    tradeCount: 0,
    effectiveSampleSize: 0,
    weightedWinRate: 0.5,
    weightedAvgReturnPct: 0,
    weightedVolatilityPct: 12,
    weightedDownsidePct: -8,
    weightedAvgHoldDays: 0,
  };
}

export async function getStockModelStatus(userId: string): Promise<StockModelStatus> {
  const [tradeCount, uniqueSymbolsRows, latestTrade] = await Promise.all([
    prisma.realizedClose.count({
      where: {
        userId,
        closeType: 'stock',
        hasUnknownBasis: false,
      },
    }),
    prisma.realizedClose.groupBy({
      by: ['symbol'],
      where: {
        userId,
        closeType: 'stock',
        hasUnknownBasis: false,
      },
    }),
    prisma.realizedClose.findFirst({
      where: {
        userId,
        closeType: 'stock',
        hasUnknownBasis: false,
      },
      orderBy: { closeDate: 'desc' },
      select: { closeDate: true },
    }),
  ]);

  const calibrationScore = clamp(0.35 + tradeCount / 100, 0.35, 0.9);

  return {
    ready: tradeCount >= MIN_STOCK_TRADES,
    tradeCount,
    uniqueSymbols: uniqueSymbolsRows.length,
    minTradesRequired: MIN_STOCK_TRADES,
    calibrationScore,
    lastUpdated: latestTrade?.closeDate.toISOString() ?? null,
  };
}

export async function generateStockActions(
  userId: string,
  accountId?: string | null
): Promise<StockActionSignal[]> {
  const accountScope = buildAccountScope(accountId);

  const positions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'stock',
      quantity: { not: 0 },
      ...accountScope,
    },
    select: {
      id: true,
      symbol: true,
      side: true,
      quantity: true,
      avgPrice: true,
      firstEntryDate: true,
    },
  });

  if (positions.length === 0) return [];

  const normalizedSymbols = Array.from(
    new Set(positions.map((position) => normalizeStockSymbol(position.symbol)))
  );

  const [history, marketSnapshots, communityInsights] = await Promise.all([
    loadUserStockHistory(userId, accountId),
    buildMarketSnapshotMap(userId, normalizedSymbols, accountId),
    Promise.all(
      normalizedSymbols.map(async (symbol) => {
        try {
          const insight = await getCommunityInsight(symbol);
          return [symbol, insight] as const;
        } catch (error) {
          log.debug({ symbol, error }, 'Unable to fetch community insight for stock model');
          return [symbol, null] as const;
        }
      })
    ),
  ]);

  const now = new Date();
  const baselinePerformance =
    history.length > 0 ? computeWeightedPerformance(history, now) : getDefaultPerformance();

  const historyBySymbol = new Map<string, StockTradeObservation[]>();
  for (const obs of history) {
    const current = historyBySymbol.get(obs.symbol) || [];
    current.push(obs);
    historyBySymbol.set(obs.symbol, current);
  }

  const communityMap = new Map(communityInsights);
  const actions: StockActionSignal[] = [];

  for (const position of positions) {
    const symbol = normalizeStockSymbol(position.symbol);
    const market = marketSnapshots.get(symbol);
    if (!market) continue;

    const entryPrice = Number(position.avgPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue;

    const direction = position.side === 'short' ? -1 : 1;
    const pnlPercent = ((market.currentPrice - entryPrice) / entryPrice) * 100 * direction;
    const ageDays = Math.max(
      1,
      Math.ceil((now.getTime() - position.firstEntryDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    const symbolHistory = historyBySymbol.get(symbol) || [];
    const symbolPerformance =
      symbolHistory.length > 0 ? computeWeightedPerformance(symbolHistory, now) : baselinePerformance;
    const shrunkPerformance = shrinkToBaseline(symbolPerformance, baselinePerformance);

    const communityInsight = communityMap.get(symbol);
    const blendedSignal = blendWithCommunity(
      shrunkPerformance,
      communityInsight
        ? {
            winRate: communityInsight.stockStats.winRate,
            avgReturnPct: communityInsight.stockStats.avgReturnPct,
            confidence: communityInsight.confidence,
          }
        : null
    );

    const decision = decideStockAction({
      symbol,
      pnlPercent,
      dayChangePercent: market.dayChangePercent,
      blendedSignal,
      ageDays,
      communityRecommendation: communityInsight?.recommendation,
    });

    if (!decision) continue;

    const confidence = Math.round(
      clamp(
        100 * (
          blendedSignal.confidence * 0.55
          + Math.min(shrunkPerformance.effectiveSampleSize / 20, 1) * 0.25
          + (market.source === 'broker' ? 0.2 : 0.15)
        ),
        45,
        95
      )
    );

    const reasoning = [
      `Current ${symbol} is $${market.currentPrice.toFixed(2)} vs entry $${entryPrice.toFixed(2)} (${pnlPercent.toFixed(1)}%).`,
      `Personal stock edge: ${(shrunkPerformance.weightedWinRate * 100).toFixed(0)}% win rate across ${Math.round(shrunkPerformance.effectiveSampleSize)} effective trades.`,
      communityInsight
        ? `Community stock edge: ${(communityInsight.stockStats.winRate * 100).toFixed(0)}% win rate (${communityInsight.stockStats.trades} trades).`
        : 'Community stock signal unavailable; recommendation is personalized only.',
      `Expected return profile: ${blendedSignal.expectedReturnPct.toFixed(1)}% with downside near ${blendedSignal.downsidePct.toFixed(1)}%.`,
    ];

    actions.push({
      id: `stock-${decision.type}-${position.id}`,
      type: decision.type,
      priority: decision.priority,
      confidence,
      symbol,
      title: decision.title,
      description: `${decision.recommendation} Position age ${ageDays} day${ageDays === 1 ? '' : 's'}.`,
      reasoning,
      metadata: {
        currentPnlPercent: Number(pnlPercent.toFixed(2)),
        entryPrice: Number(entryPrice.toFixed(2)),
        currentPrice: Number(market.currentPrice.toFixed(2)),
        dayChangePercent: Number(market.dayChangePercent.toFixed(2)),
        similarTradesCount: Math.round(shrunkPerformance.effectiveSampleSize),
        similarTradesWinRate: Number((shrunkPerformance.weightedWinRate * 100).toFixed(1)),
      },
      suggestedAction: {
        action:
          decision.type === 'add_position'
            ? 'Add incrementally'
            : decision.type === 'hold_winner'
              ? 'Hold and monitor'
              : decision.type === 'reduce_risk'
                ? 'Take partial profits'
                : 'Reduce or close position',
        details: `Signal uses ${market.source === 'broker' ? 'broker' : 'market quote'} pricing + your historical stock outcomes.`,
      },
    });
  }

  actions.sort((a, b) => {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return b.confidence - a.confidence;
  });

  return actions.slice(0, 6);
}
