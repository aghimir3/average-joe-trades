import { prisma } from '@/lib/prisma';
import { buildAccountScope } from '@/lib/db/account-scope';
import { getCommunityInsight } from '@/lib/ml/community';
import { ensurePriceHistoryCached, ensureQuoteCached } from '@/lib/market/cache';
import { buildLeakageSafeStockFeatures } from '@/lib/quant/features';
import { StockTrendStrategy } from '@/lib/quant/strategy';
import type { ConfidenceBand, QuantSignal } from '@/lib/quant/strategy';

export type TickerAdvisorAction = 'buy' | 'avoid' | 'watch' | 'reduce' | 'sell' | 'hold' | 'add';

export interface TickerAdvisorResult {
  symbol: string;
  asOf: string;
  dataFreshness: {
    quoteAsOf: string | null;
    barsAsOf: string | null;
    stale: boolean;
    source: string;
    isDelayed: boolean;
  };
  simple: {
    action: TickerAdvisorAction;
    confidenceBand: ConfidenceBand;
    confidenceScore: number;
    summary: string;
    reasons: string[];
    riskFlags: string[];
    nextCheck: string;
    optionsPlaybook?: {
      action: string;
      details: string;
    } | null;
  };
  advanced: {
    strategyKey: string;
    signal: QuantSignal;
    positionContext: {
      ownsPosition: boolean;
      side: 'long' | 'short' | null;
      quantity: number;
      avgEntryPrice: number | null;
      currentPnlPct: number | null;
      daysHeld: number | null;
    };
    marketContext: {
      currentPrice: number;
      dayChangePercent: number;
      momentum20d: number;
      return5d: number;
      volatility20d: number;
      drawdown20d: number;
    };
    communityContext: {
      available: boolean;
      recommendation: string | null;
      winRatePct: number | null;
      avgReturnPct: number | null;
      sampleSize: number | null;
      uniqueTraders: number | null;
    };
    optionContext: {
      optionPositionCount: number;
      nearestDte: number | null;
      shortOptionCount: number;
      wheelStyleCount: number;
      nearExpiryCount: number;
    };
  };
}

interface TickerAdvisorInput {
  userId: string;
  symbol: string;
  accountId?: string | null;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().split(' ')[0];
}

function confidenceToNextCheck(confidence: number): string {
  if (confidence >= 0.75) return 'Recheck at next daily close or on a >2% move.';
  if (confidence >= 0.5) return 'Recheck tomorrow or after major market moves.';
  return 'Recheck after new data arrives; current edge is weak.';
}

function summarizeAction(action: TickerAdvisorAction, symbol: string, ownsPosition: boolean): string {
  if (action === 'sell') return `Suggested action: sell ${symbol} to reduce downside risk.`;
  if (action === 'reduce') return `Suggested action: trim ${symbol} to lock gains and cut risk.`;
  if (action === 'add') return `Suggested action: add to ${symbol} in small increments.`;
  if (action === 'hold') return `Suggested action: hold ${symbol} and monitor risk flags.`;
  if (action === 'buy') return `Suggested action: buy ${symbol} with disciplined sizing.`;
  if (action === 'avoid') return `Suggested action: avoid new ${symbol} exposure for now.`;
  if (ownsPosition) return `Suggested action: hold and wait for clearer edge on ${symbol}.`;
  return `Suggested action: watch ${symbol} and wait for better setup quality.`;
}

function mapSignalToAction(
  signal: QuantSignal,
  ownsPosition: boolean,
  currentPnlPct: number | null
): TickerAdvisorAction {
  if (ownsPosition) {
    if (signal.side === 'sell') {
      if (currentPnlPct !== null && currentPnlPct > 4) return 'reduce';
      return 'sell';
    }
    if (signal.side === 'buy') return 'add';
    if (signal.expectedReturnPct < 0 || signal.riskFlags.length > 0) return 'watch';
    return 'hold';
  }

  if (signal.side === 'buy' && signal.confidence >= 0.7) return 'buy';
  if (signal.side === 'sell') return 'avoid';
  return signal.confidence >= 0.55 ? 'watch' : 'avoid';
}

export async function getTickerAdvisorRecommendation(
  input: TickerAdvisorInput
): Promise<TickerAdvisorResult> {
  const userId = input.userId;
  const symbol = normalizeSymbol(input.symbol);
  const scope = buildAccountScope(input.accountId);

  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 3);

  const [barsResult, quote, position, optionPositions, community] = await Promise.all([
    ensurePriceHistoryCached({
      symbol,
      start,
      end: now,
      interval: '1d',
      triggerSource: 'ticker_advisor',
    }),
    ensureQuoteCached(symbol, {
      triggerSource: 'ticker_advisor',
    }),
    prisma.derivedPosition.findFirst({
      where: {
        userId,
        positionType: 'stock',
        symbol,
        quantity: { not: 0 },
        ...scope,
      },
      select: {
        side: true,
        quantity: true,
        avgPrice: true,
        firstEntryDate: true,
      },
    }),
    prisma.derivedPosition.findMany({
      where: {
        userId,
        positionType: 'option',
        symbol: { startsWith: symbol },
        quantity: { not: 0 },
        ...scope,
      },
      select: {
        id: true,
        side: true,
        strategy: true,
        expiration: true,
      },
      take: 30,
      orderBy: { expiration: 'asc' },
    }),
    getCommunityInsight(symbol).catch(() => null),
  ]);

  if (barsResult.bars.length < 40) {
    throw new Error(`Not enough market history for ${symbol}. Need at least 40 daily bars.`);
  }

  const features = buildLeakageSafeStockFeatures(barsResult.bars);
  if (features.length === 0) {
    throw new Error(`No feature rows available for ${symbol}.`);
  }

  const strategy = new StockTrendStrategy();
  const latestFeature = features[features.length - 1];
  const openPositions = position
    ? [{
        symbol,
        quantity: Number(position.quantity),
        avgPrice: Number(position.avgPrice),
        side: position.side === 'short' ? 'short' : 'long',
      } as const]
    : [];

  const generated = strategy.generateSignals({
    symbol,
    bars: barsResult.bars,
    features,
    openPositions,
    asOf: latestFeature.timestamp,
  });
  const signal = generated[generated.length - 1];
  if (!signal) {
    throw new Error(`No signal generated for ${symbol}.`);
  }

  const ownsPosition = Boolean(position);
  const avgEntryPrice = position ? Number(position.avgPrice) : null;
  const quantity = position ? Number(position.quantity) : 0;
  const currentPnlPct =
    avgEntryPrice && avgEntryPrice > 0
      ? (((quote.price - avgEntryPrice) / avgEntryPrice) * 100) * (position?.side === 'short' ? -1 : 1)
      : null;
  const daysHeld = position
    ? Math.max(1, Math.ceil((now.getTime() - position.firstEntryDate.getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  const action = mapSignalToAction(signal, ownsPosition, currentPnlPct);
  const confidenceScore = Math.round(signal.confidence * 100);

  const reasons: string[] = [
    `Signal: ${signal.side.toUpperCase()} with ${confidenceScore}% confidence.`,
    `Momentum (20d): ${(latestFeature.momentum20d * 100).toFixed(2)}%, volatility (20d): ${(latestFeature.volatility20d * 100).toFixed(2)}%.`,
    community
      ? `Community context: ${community.recommendation.replace('_', ' ')} from ${community.totalTrades} trades.`
      : 'Community context unavailable; this recommendation is personalized + market-driven.',
  ];

  const optionPositionCount = optionPositions.length;
  const nearestDte = optionPositions
    .filter((positionRow) => positionRow.expiration)
    .map((positionRow) =>
      Math.max(
        0,
        Math.ceil((new Date(positionRow.expiration as Date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      )
    )
    .sort((a, b) => a - b)[0] ?? null;
  const shortOptionCount = optionPositions.filter((positionRow) => positionRow.side === 'short').length;
  const wheelStyleCount = optionPositions.filter(
    (positionRow) => positionRow.strategy === 'covered_call' || positionRow.strategy === 'cash_secured_put'
  ).length;
  const nearExpiryCount = optionPositions.filter((positionRow) => {
    if (!positionRow.expiration) return false;
    const dte = Math.max(
      0,
      Math.ceil((new Date(positionRow.expiration).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    return dte <= 7;
  }).length;

  let optionsPlaybook: TickerAdvisorResult['simple']['optionsPlaybook'] = null;
  if (optionPositionCount > 0) {
    if (nearExpiryCount > 0) {
      optionsPlaybook = {
        action: 'Review roll/close candidates',
        details: `${nearExpiryCount} option position${nearExpiryCount === 1 ? '' : 's'} on ${symbol} expire within 7 days.`,
      };
      reasons.push(`${nearExpiryCount} option position${nearExpiryCount === 1 ? '' : 's'} are near expiration.`);
    } else if (shortOptionCount > 0) {
      optionsPlaybook = {
        action: 'Monitor short premium risk',
        details: `${shortOptionCount} short option position${shortOptionCount === 1 ? '' : 's'} active on ${symbol}.`,
      };
      reasons.push(`${shortOptionCount} short option position${shortOptionCount === 1 ? '' : 's'} active on this ticker.`);
    } else {
      optionsPlaybook = {
        action: 'Track option structure health',
        details: `${optionPositionCount} open option position${optionPositionCount === 1 ? '' : 's'} tied to ${symbol}.`,
      };
    }
  } else if (community && community.wheelStats.trades >= 20 && community.wheelStats.winRate >= 0.55) {
    optionsPlaybook = {
      action: 'Consider wheel entry',
      details: `Community wheel stats on ${symbol}: ${(community.wheelStats.winRate * 100).toFixed(0)}% win rate across ${community.wheelStats.trades} trades.`,
    };
  }

  const communityContext = community
    ? {
        available: true,
        recommendation: community.recommendation,
        winRatePct: Number((community.stockStats.winRate * 100).toFixed(1)),
        avgReturnPct: Number(community.stockStats.avgReturnPct.toFixed(2)),
        sampleSize: community.totalTrades,
        uniqueTraders: community.uniqueTraders,
      }
    : {
        available: false,
        recommendation: null,
        winRatePct: null,
        avgReturnPct: null,
        sampleSize: null,
        uniqueTraders: null,
      };

  return {
    symbol,
    asOf: now.toISOString(),
    dataFreshness: {
      quoteAsOf: quote.fetchedAt,
      barsAsOf: barsResult.dataAsOf,
      stale: quote.stale || barsResult.stale,
      source: quote.source,
      isDelayed: quote.isDelayed,
    },
    simple: {
      action,
      confidenceBand: signal.confidenceBand,
      confidenceScore,
      summary: summarizeAction(action, symbol, ownsPosition),
      reasons,
      riskFlags: signal.riskFlags,
      nextCheck: confidenceToNextCheck(signal.confidence),
      optionsPlaybook,
    },
    advanced: {
      strategyKey: strategy.strategyKey,
      signal,
      positionContext: {
        ownsPosition,
        side: position ? (position.side === 'short' ? 'short' : 'long') : null,
        quantity,
        avgEntryPrice: avgEntryPrice === null ? null : Number(avgEntryPrice.toFixed(2)),
        currentPnlPct: currentPnlPct === null ? null : Number(currentPnlPct.toFixed(2)),
        daysHeld,
      },
      marketContext: {
        currentPrice: Number(quote.price.toFixed(2)),
        dayChangePercent: Number(quote.dayChangePercent.toFixed(2)),
        momentum20d: Number(latestFeature.momentum20d.toFixed(4)),
        return5d: Number(latestFeature.return5d.toFixed(4)),
        volatility20d: Number(latestFeature.volatility20d.toFixed(4)),
        drawdown20d: Number(latestFeature.drawdown20d.toFixed(4)),
      },
      communityContext,
      optionContext: {
        optionPositionCount,
        nearestDte,
        shortOptionCount,
        wheelStyleCount,
        nearExpiryCount,
      },
    },
  };
}
