import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import {
  buildLeakageSafeStockFeatures,
  evaluateStrategyWalkForward,
  detectPerformanceDrift,
  runSignalBacktest,
  StockTrendStrategy,
  getDefaultMarketDataProvider,
} from '@/lib/quant';
import {
  ensureBaselineRegistryEntries,
  hashTrainingDataset,
  recordModelEvaluation,
  registerModelVersion,
} from '@/lib/quant/governance';
import { evaluatePortfolioRisk } from '@/lib/quant/risk';
import type { QuantSignal } from '@/lib/quant/strategy';

const log = createChildLogger({ module: 'quant-alpha-lab-service' });

export interface AlphaLabInput {
  symbol: string;
  startDate: Date;
  endDate: Date;
  strategyKey?: 'stock_trend_v1';
}

export interface AlphaLabResult {
  symbol: string;
  strategyKey: string;
  personalBacktest: {
    metrics: ReturnType<typeof runSignalBacktest>['metrics'];
    equityCurve: Array<{ timestamp: string; equity: number }>;
    trades: ReturnType<typeof runSignalBacktest>['trades'];
  };
  walkForward: {
    windows: number;
    aggregate: ReturnType<typeof evaluateStrategyWalkForward>['aggregate'];
  };
  drift: ReturnType<typeof detectPerformanceDrift>;
  riskSummary: ReturnType<typeof evaluatePortfolioRisk>;
}

function buildSignalsForBars(symbol: string, strategy: StockTrendStrategy, bars: Array<{
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>): QuantSignal[] {
  const features = buildLeakageSafeStockFeatures(bars);
  const signals: QuantSignal[] = [];

  for (const feature of features) {
    const historicalBars = bars.filter((bar) => bar.timestamp.getTime() <= feature.timestamp.getTime());
    const historicalFeatures = features.filter(
      (candidate) => candidate.timestamp.getTime() <= feature.timestamp.getTime()
    );
    const generated = strategy.generateSignals({
      symbol,
      bars: historicalBars,
      features: historicalFeatures,
      openPositions: [],
      asOf: feature.timestamp,
    });
    signals.push(...generated);
  }

  return signals;
}

async function persistEvaluationArtifacts(
  userId: string,
  symbol: string,
  strategy: StockTrendStrategy,
  walkForward: ReturnType<typeof evaluateStrategyWalkForward>
): Promise<void> {
  await ensureBaselineRegistryEntries(userId);
  const datasetHash = hashTrainingDataset({
    symbol,
    strategyKey: strategy.strategyKey,
    windows: walkForward.windows.map((window) => ({
      trainStart: window.trainStart,
      trainEnd: window.trainEnd,
      testStart: window.testStart,
      testEnd: window.testEnd,
      metrics: window.result.metrics,
    })),
  });

  const modelRow = await registerModelVersion({
    userId,
    scope: 'personal',
    modelFamily: 'stocks',
    modelName: strategy.strategyKey,
    semanticVersion: '1.0.0',
    featureSchemaVersion: 'stock-v1',
    trainingDatasetHash: datasetHash,
    status: 'stable',
    isStable: true,
    trainedAt: new Date(),
    metricsSnapshot: {
      walkForwardAggregate: walkForward.aggregate,
      windows: walkForward.windows.length,
    },
  });

  await recordModelEvaluation({
    userId,
    modelRegistryId: modelRow.id,
    evaluationType: 'walk_forward',
    windowStart: walkForward.windows[0] ? new Date(walkForward.windows[0].trainStart) : undefined,
    windowEnd: walkForward.windows[walkForward.windows.length - 1]
      ? new Date(walkForward.windows[walkForward.windows.length - 1].testEnd)
      : undefined,
    metrics: {
      aggregate: walkForward.aggregate,
      windows: walkForward.windows.map((window) => ({
        windowIndex: window.windowIndex,
        metrics: window.result.metrics,
      })),
    },
  });
}

export async function runAlphaLabForUser(userId: string, input: AlphaLabInput): Promise<AlphaLabResult> {
  const provider = getDefaultMarketDataProvider();
  const symbol = input.symbol.toUpperCase();
  const strategy = new StockTrendStrategy();

  const bars = await provider.getPriceHistory({
    symbol,
    start: input.startDate,
    end: input.endDate,
    interval: '1d',
    triggerSource: 'alpha_lab',
  });

  if (bars.length < 80) {
    throw new Error(`Not enough bars for backtest on ${symbol}; need at least 80 daily bars`);
  }

  const signals = buildSignalsForBars(symbol, strategy, bars);
  const personalBacktest = runSignalBacktest({
    strategyKey: strategy.strategyKey,
    symbol,
    bars,
    signals,
  });

  const walkForward = evaluateStrategyWalkForward({
    strategy,
    symbol,
    bars,
  });

  const midpoint = Math.max(1, Math.floor(walkForward.windows.length / 2));
  const baselineSharpe = walkForward.windows.slice(0, midpoint).map((window) => window.result.metrics.sharpe);
  const baselineReturns = walkForward.windows.slice(0, midpoint).map((window) => window.result.metrics.totalReturnPct);
  const recentSharpe = walkForward.windows.slice(midpoint).map((window) => window.result.metrics.sharpe);
  const recentReturns = walkForward.windows.slice(midpoint).map((window) => window.result.metrics.totalReturnPct);

  const drift = detectPerformanceDrift(
    {
      totalReturnPct: baselineReturns.length > 0
        ? baselineReturns.reduce((sum, value) => sum + value, 0) / baselineReturns.length
        : personalBacktest.metrics.totalReturnPct,
      sharpe: baselineSharpe.length > 0
        ? baselineSharpe.reduce((sum, value) => sum + value, 0) / baselineSharpe.length
        : personalBacktest.metrics.sharpe,
    },
    {
      totalReturnPct: recentReturns.length > 0
        ? recentReturns.reduce((sum, value) => sum + value, 0) / recentReturns.length
        : personalBacktest.metrics.totalReturnPct,
      sharpe: recentSharpe.length > 0
        ? recentSharpe.reduce((sum, value) => sum + value, 0) / recentSharpe.length
        : personalBacktest.metrics.sharpe,
    }
  );

  const openPositions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'stock',
      quantity: { not: 0 },
    },
    select: {
      symbol: true,
      quantity: true,
      avgPrice: true,
      side: true,
    },
  });

  const latestEquityPoint = personalBacktest.equityCurve[personalBacktest.equityCurve.length - 1];
  const riskSummary = evaluatePortfolioRisk({
    equity: latestEquityPoint?.equity ?? 100_000,
    positions: openPositions.map((position) => ({
      symbol: position.symbol,
      marketValue: Number(position.avgPrice) * Number(position.quantity),
      side: position.side === 'short' ? 'short' : 'long',
      sector: null,
    })),
    dailyReturns: personalBacktest.equityCurve.slice(1).map((point, index) => {
      const prev = personalBacktest.equityCurve[index].equity;
      return prev !== 0 ? (point.equity - prev) / prev : 0;
    }),
    equityCurve: personalBacktest.equityCurve,
  });

  try {
    await persistEvaluationArtifacts(userId, symbol, strategy, walkForward);
  } catch (error) {
    log.warn({ error, userId, symbol }, 'Failed to persist quant evaluation artifacts');
  }

  return {
    symbol,
    strategyKey: strategy.strategyKey,
    personalBacktest: {
      metrics: personalBacktest.metrics,
      equityCurve: personalBacktest.equityCurve.map((point) => ({
        timestamp: point.timestamp,
        equity: point.equity,
      })),
      trades: personalBacktest.trades,
    },
    walkForward: {
      windows: walkForward.windows.length,
      aggregate: walkForward.aggregate,
    },
    drift,
    riskSummary,
  };
}

export async function enqueueAlphaLabRun(userId: string, input: AlphaLabInput): Promise<{ runId: string }> {
  const row = await prisma.quantBacktestRun.create({
    data: {
      userId,
      strategyKey: input.strategyKey ?? 'stock_trend_v1',
      symbol: input.symbol.toUpperCase(),
      configJson: JSON.stringify({
        startDate: input.startDate.toISOString(),
        endDate: input.endDate.toISOString(),
      }),
      status: 'pending',
    },
    select: { id: true },
  });

  return { runId: row.id };
}

export async function processAlphaLabRun(userId: string, runId: string) {
  const run = await prisma.quantBacktestRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return null;

  if (run.status === 'completed' || run.status === 'failed') {
    return run;
  }

  if (run.status === 'pending') {
    await prisma.quantBacktestRun.update({
      where: { id: run.id },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  try {
    const parsedConfig = JSON.parse(run.configJson) as { startDate: string; endDate: string };
    const result = await runAlphaLabForUser(userId, {
      symbol: run.symbol ?? 'SPY',
      startDate: new Date(parsedConfig.startDate),
      endDate: new Date(parsedConfig.endDate),
      strategyKey: run.strategyKey === 'stock_trend_v1' ? 'stock_trend_v1' : 'stock_trend_v1',
    });

    return prisma.quantBacktestRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        metricsJson: JSON.stringify({
          personal: result.personalBacktest.metrics,
          walkForward: result.walkForward.aggregate,
          drift: result.drift,
        }),
        equityCurve: JSON.stringify(result.personalBacktest.equityCurve),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown alpha-lab run failure';
    return prisma.quantBacktestRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message.slice(0, 1000),
      },
    });
  }
}

export async function getAlphaLabRun(userId: string, runId: string) {
  return prisma.quantBacktestRun.findFirst({
    where: { id: runId, userId },
  });
}
