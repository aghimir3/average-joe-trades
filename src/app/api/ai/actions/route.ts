import { apiJson } from '@/lib/api/response';
/**
 * AI Actions API
 *
 * Aggregates actionable recommendations from multiple ML sources.
 *
 * GET /api/ai/actions?accountId=xxx
 */


import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { generateCommunityActions } from '@/lib/ml/community';
import { generateStockActions } from '@/lib/ml/stocks';
import { buildAccountScope } from '@/lib/db/account-scope';
import { generateQuantActionSignals } from '@/lib/quant/services';
import { ensureQuotesCached } from '@/lib/market/cache';
import { aiInsightsRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';

const ACTION_STATUS_VALUES = ['dismissed', 'snoozed', 'completed'] as const;
const ACTION_FEEDBACK_VALUES = ['helpful', 'not_helpful'] as const;

type ActionStatus = (typeof ACTION_STATUS_VALUES)[number];
type ActionFeedback = (typeof ACTION_FEEDBACK_VALUES)[number];

interface AIAction {
  id: string;
  type: 'roll' | 'close' | 'new_opportunity' | 'reduce_risk' | 'add_position' | 'hold_winner' | 'consider_exit' | 'avoid_ticker' | 'strategy_switch' | 'wheel_opportunity' | 'premium_opportunity' | 'risk_warning';
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  symbol: string;
  title: string;
  description: string;
  reasoning: string[];
  deadline?: string;
  source: 'wheel_ml' | 'options_ml' | 'community' | 'risk' | 'stock_ml' | 'quant_signal';
  reasonCodes?: string[];
  riskFlags?: string[];
  confidenceBand?: 'low' | 'medium' | 'high';
  expectedValuePct?: number;
  metadata?: {
    daysToExpiration?: number;
    currentPnlPercent?: number;
    strike?: number;
    strategy?: string;
    potentialCredit?: number;
    similarTradesCount?: number;
    similarTradesWinRate?: number;
    entryPrice?: number;
    currentPrice?: number;
    dayChangePercent?: number;
    quoteAsOf?: string;
    isDelayed?: boolean;
  };
  suggestedAction?: {
    action: string;
    details: string;
  };
  userState?: {
    status?: ActionStatus;
    snoozedUntil?: string | null;
    feedback?: ActionFeedback;
  };
  communityData?: {
    totalTrades: number;
    uniqueTraders: number;
    winRate: number;
    recommendation: string;
  };
  advanced?: {
    quant?: {
      side: 'buy' | 'sell' | 'hold';
      strength: number;
      horizon: 'intraday' | 'swing' | 'position';
      timestamp: string;
    };
    dataFreshness?: {
      quoteAsOf?: string | null;
      barsAsOf?: string | null;
      stale?: boolean;
    };
  };
}

interface AIActionsResponse {
  actions: AIAction[];
  totalCount: number;
  highPriorityCount: number;
  lastUpdated: string;
}

const actionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum([
    'roll',
    'close',
    'new_opportunity',
    'reduce_risk',
    'add_position',
    'hold_winner',
    'consider_exit',
    'avoid_ticker',
    'strategy_switch',
    'wheel_opportunity',
    'premium_opportunity',
    'risk_warning',
  ]),
  priority: z.enum(['high', 'medium', 'low']),
  confidence: z.number().min(0).max(100),
  symbol: z.string().min(1).max(20),
  title: z.string().min(1),
  description: z.string().min(1),
  reasoning: z.array(z.string()),
  deadline: z.string().datetime().optional(),
  source: z.enum(['wheel_ml', 'options_ml', 'community', 'risk', 'stock_ml', 'quant_signal']),
  reasonCodes: z.array(z.string()).optional(),
  riskFlags: z.array(z.string()).optional(),
  confidenceBand: z.enum(['low', 'medium', 'high']).optional(),
  expectedValuePct: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  suggestedAction: z
    .object({
      action: z.string(),
      details: z.string(),
    })
    .optional(),
  userState: z
    .object({
      status: z.enum(['dismissed', 'snoozed', 'completed']).optional(),
      snoozedUntil: z.string().datetime().nullable().optional(),
      feedback: z.enum(['helpful', 'not_helpful']).optional(),
    })
    .optional(),
  communityData: z
    .object({
      totalTrades: z.number(),
      uniqueTraders: z.number(),
      winRate: z.number(),
      recommendation: z.string(),
    })
    .optional(),
  advanced: z
    .object({
      quant: z
        .object({
          side: z.enum(['buy', 'sell', 'hold']),
          strength: z.number().min(0).max(1),
          horizon: z.enum(['intraday', 'swing', 'position']),
          timestamp: z.string().datetime(),
        })
        .optional(),
      dataFreshness: z
        .object({
          quoteAsOf: z.string().datetime().nullable().optional(),
          barsAsOf: z.string().datetime().nullable().optional(),
          stale: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

const actionsResponseSchema = z.object({
  actions: z.array(actionSchema),
  totalCount: z.number().int().nonnegative(),
  highPriorityCount: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
});

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
});

// Extract underlying ticker from option symbol (e.g., "AAPL 240119C150" -> "AAPL")
function extractUnderlyingSymbol(symbol: string): string {
  const match = symbol.match(/^([A-Z]+(?:\.[A-Z])?)/);
  return match ? match[1] : symbol;
}

function isActionStatus(value: string | null): value is ActionStatus {
  if (!value) return false;
  return ACTION_STATUS_VALUES.includes(value as ActionStatus);
}

function isActionFeedback(value: string | null): value is ActionFeedback {
  if (!value) return false;
  return ACTION_FEEDBACK_VALUES.includes(value as ActionFeedback);
}

type TimedTaskResult<T> = {
  value: T | null;
  durationMs: number;
  timedOut: boolean;
};

async function runTimedTask<T>(
  label: string,
  timeoutMs: number,
  task: () => Promise<T>,
  log: ReturnType<typeof createRequestLogger>
): Promise<TimedTaskResult<T>> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timedTask = task()
    .then((value) => ({ kind: 'value' as const, value }))
    .catch((error) => ({ kind: 'error' as const, error }));

  const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  try {
    const result = await Promise.race([timedTask, timeout]);
    const durationMs = Date.now() - startedAt;

    if (result.kind === 'timeout') {
      log.warn({ label, timeoutMs, durationMs }, 'AI actions subtask timed out');
      return { value: null, durationMs, timedOut: true };
    }

    if (result.kind === 'error') {
      log.warn({ label, durationMs, error: result.error }, 'AI actions subtask failed');
      return { value: null, durationMs, timedOut: false };
    }

    return { value: result.value, durationMs, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  const requestStartedAt = Date.now();

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      accountId: searchParams.get('accountId') ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid accountId parameter' },
        { status: 400 }
      );
    }
    const { accountId } = parsedQuery.data;
    const rate = aiInsightsRateLimiter.check(userId);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const actions: AIAction[] = [];
    const accountScope = buildAccountScope(accountId);

    // Launch heavier model generators in parallel and guard with deadlines so
    // the Actions tab remains responsive under load.
    const communityTaskPromise = runTimedTask(
      'community_actions',
      3200,
      () => generateCommunityActions(userId, accountId),
      log
    );
    const stockTaskPromise = runTimedTask(
      'stock_actions',
      3200,
      () => generateStockActions(userId, accountId),
      log
    );
    const quantTaskPromise = runTimedTask(
      'quant_action_signals',
      5000,
      () => generateQuantActionSignals(userId, accountId),
      log
    );

    // 1. Option-based action scaffolding (fast path)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [activeOptionPositions, nearExpiryPositions, positionsBySymbol] = await Promise.all([
      prisma.derivedPosition.findMany({
        where: {
          userId,
          positionType: 'option',
          quantity: { not: 0 },
          ...accountScope,
        },
        select: {
          symbol: true,
        },
        take: 40,
        orderBy: { firstEntryDate: 'desc' },
      }),
      prisma.derivedPosition.findMany({
        where: {
          userId,
          strategy: { in: ['covered_call', 'cash_secured_put'] },
          positionType: 'option',
          expiration: {
            lte: sevenDaysFromNow,
            gte: new Date(),
          },
          ...accountScope,
        },
        select: {
          id: true,
          symbol: true,
          optionType: true,
          side: true,
          strategy: true,
          strike: true,
          expiration: true,
          costBasis: true,
          quantity: true,
        },
        take: 10,
        orderBy: { expiration: 'asc' },
      }),
      prisma.derivedPosition.groupBy({
        by: ['symbol'],
        where: {
          userId,
          positionType: 'option',
          ...accountScope,
        },
        _count: true,
        _sum: { costBasis: true },
      }),
    ]);

    const optionUnderlyings = Array.from(
      new Set([
        ...activeOptionPositions.map((position) => extractUnderlyingSymbol(position.symbol)),
        ...nearExpiryPositions.map((position) => extractUnderlyingSymbol(position.symbol)),
      ])
    );
    const optionQuotes = await ensureQuotesCached(optionUnderlyings, {
      triggerSource: 'ai_actions_option_positions',
    });

    for (const position of nearExpiryPositions) {
      if (!position.expiration) continue;

      const daysToExp = Math.ceil(
        (position.expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const priority: 'high' | 'medium' | 'low' =
        daysToExp <= 2 ? 'high' : daysToExp <= 5 ? 'medium' : 'low';

      const confidence = Math.max(50, 90 - daysToExp * 5);

      const underlyingSymbol = extractUnderlyingSymbol(position.symbol);
      const quote = optionQuotes.get(underlyingSymbol);
      const strike = Number(position.strike);
      const currentPrice = quote?.price;
      const moneyness =
        typeof currentPrice === 'number' && Number.isFinite(currentPrice) && Number.isFinite(strike) && strike > 0
          ? ((currentPrice - strike) / strike) * 100
          : null;
      const optionsTypeLabel = position.optionType === 'put' ? 'put' : 'call';

      actions.push({
        id: `roll-${position.id}`,
        type: 'roll',
        priority,
        confidence,
        symbol: underlyingSymbol,
        title: `Roll ${position.strategy === 'covered_call' ? 'CC' : 'CSP'} - ${daysToExp} days to expiry`,
        description: `Your ${position.strategy === 'covered_call' ? 'covered call' : 'cash-secured put'} ${optionsTypeLabel} at $${Number(position.strike)} expires in ${daysToExp} days. Consider rolling to capture more premium.`,
        reasoning: [
          `Position expires ${position.expiration.toLocaleDateString()}`,
          moneyness === null
            ? 'Underlying quote unavailable; using position-only heuristics.'
            : `Underlying is ${moneyness >= 0 ? '+' : ''}${moneyness.toFixed(1)}% vs strike.`,
          daysToExp <= 2
            ? 'Urgent: Very close to expiration'
            : 'Standard theta decay window approaching',
        ],
        deadline: position.expiration.toISOString(),
        source: 'wheel_ml',
        metadata: {
          daysToExpiration: daysToExp,
          strike: Number(position.strike),
          strategy: position.strategy || undefined,
          currentPrice: quote?.price,
          dayChangePercent: quote?.dayChangePercent,
          quoteAsOf: quote?.fetchedAt,
          isDelayed: quote?.isDelayed,
        },
        advanced: {
          dataFreshness: {
            quoteAsOf: quote?.fetchedAt ?? null,
            barsAsOf: null,
            stale: quote?.stale ?? false,
          },
        },
      });
    }

    // 2. Check for concentration risk in option positions
    const totalValue = positionsBySymbol.reduce(
      (sum, p) => sum + Math.abs(Number(p._sum.costBasis) || 0),
      0
    );

    // Group by underlying symbol
    const underlyingGroups = new Map<string, { count: number; value: number }>();
    for (const group of positionsBySymbol) {
      const underlying = extractUnderlyingSymbol(group.symbol);
      const existing = underlyingGroups.get(underlying) || { count: 0, value: 0 };
      existing.count += group._count;
      existing.value += Math.abs(Number(group._sum.costBasis) || 0);
      underlyingGroups.set(underlying, existing);
    }

    for (const [underlying, data] of underlyingGroups) {
      const concentration = totalValue > 0 ? (data.value / totalValue) * 100 : 0;

      if (concentration >= 30 && data.count >= 2) {
        actions.push({
          id: `risk-${underlying}`,
          type: 'reduce_risk',
          priority: concentration >= 50 ? 'high' : 'medium',
          confidence: 70,
          symbol: underlying,
          title: `High concentration: ${concentration.toFixed(0)}%`,
          description: `${underlying} represents ${concentration.toFixed(0)}% of your option positions. Consider diversifying to reduce single-stock risk.`,
          reasoning: [
            `${data.count} positions in ${underlying}`,
            concentration >= 50
              ? 'Critical: Very high concentration'
              : 'Elevated concentration risk',
          ],
          source: 'risk',
        });
      }
    }

    // 3-5. Merge heavier generator outputs (best effort, deadline-bounded)
    const [communityTask, stockTask, quantTask] = await Promise.all([
      communityTaskPromise,
      stockTaskPromise,
      quantTaskPromise,
    ]);

    if (communityTask.value) {
      for (const ca of communityTask.value) {
        actions.push({
          id: ca.id,
          type: ca.type,
          priority: ca.priority,
          confidence: ca.confidence,
          symbol: ca.symbol,
          title: ca.title,
          description: ca.description,
          reasoning: ca.reasoning,
          source: 'community',
          suggestedAction: ca.suggestedAction,
          communityData: ca.communityData,
        });
      }
    }

    if (stockTask.value) {
      for (const sa of stockTask.value) {
        actions.push({
          id: sa.id,
          type: sa.type,
          priority: sa.priority,
          confidence: sa.confidence,
          symbol: sa.symbol,
          title: sa.title,
          description: sa.description,
          reasoning: sa.reasoning,
          source: 'stock_ml',
          metadata: sa.metadata,
          suggestedAction: sa.suggestedAction,
        });
      }
    }

    if (quantTask.value) {
      for (const signal of quantTask.value) {
        const type: AIAction['type'] =
          signal.side === 'buy'
            ? 'add_position'
            : signal.side === 'sell'
              ? 'consider_exit'
              : signal.expectedReturnPct >= 0
                ? 'hold_winner'
                : 'reduce_risk';
        const priority: AIAction['priority'] =
          signal.riskFlags.length > 0
            ? 'high'
            : signal.confidence >= 0.75
              ? 'medium'
              : 'low';

        actions.push({
          id: signal.id,
          type,
          priority,
          confidence: Math.round(signal.confidence * 100),
          symbol: signal.symbol,
          title:
            signal.side === 'buy'
              ? `Quant signal: accumulate ${signal.symbol}`
              : signal.side === 'sell'
                ? `Quant signal: reduce ${signal.symbol}`
                : `Quant signal: hold ${signal.symbol}`,
          description: `Expected return ${signal.expectedReturnPct.toFixed(2)}% over swing horizon.`,
          reasoning: signal.rationaleCodes.map((code) => code.replace(/_/g, ' ')),
          source: 'quant_signal',
          reasonCodes: signal.rationaleCodes,
          riskFlags: signal.riskFlags,
          confidenceBand: signal.confidenceBand,
          expectedValuePct: signal.expectedReturnPct,
          suggestedAction: {
            action:
              signal.side === 'buy'
                ? 'Scale in incrementally'
                : signal.side === 'sell'
                  ? 'Trim or close'
                  : 'Hold with risk controls',
            details: 'Signal generated from no-lookahead feature pipeline with explicit risk flags.',
          },
          advanced: {
            quant: {
              side: signal.side,
              strength: signal.strength,
              horizon: signal.horizon,
              timestamp: signal.timestamp,
            },
            dataFreshness: signal.dataFreshness,
          },
        });
      }
    }

    log.info(
      {
        communityMs: communityTask.durationMs,
        stockMs: stockTask.durationMs,
        quantMs: quantTask.durationMs,
        communityTimedOut: communityTask.timedOut,
        stockTimedOut: stockTask.timedOut,
        quantTimedOut: quantTask.timedOut,
      },
      'AI actions model generation timings'
    );

    // Filter out dismissed/completed/snoozed actions
    const actionIds = actions.map((action) => action.id);
    let actionStates: Array<{
      actionId: string;
      status: string | null;
      snoozedUntil: Date | null;
      feedback: string | null;
    }> = [];

    if (actionIds.length > 0) {
      try {
        actionStates = await prisma.aIActionState.findMany({
          where: { userId, actionId: { in: actionIds } },
          select: { actionId: true, status: true, snoozedUntil: true, feedback: true },
        });
      } catch (stateError) {
        log.warn(
          { error: stateError },
          'Failed to load AI action state; continuing without per-action status'
        );
        actionStates = [];
      }
    }

    const stateMap = new Map(actionStates.map((state) => [state.actionId, state]));
    const now = new Date();

    const filteredActions = actions.filter((action) => {
      const state = stateMap.get(action.id);
      if (!state || !state.status) return true;
      if (state.status === 'dismissed' || state.status === 'completed') return false;
      if (state.status === 'snoozed' && state.snoozedUntil && state.snoozedUntil > now) {
        return false;
      }
      return true;
    });

    // Sort by priority then confidence
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    filteredActions.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Limit to top 10 actions (increased to include community)
    const limitedActions = filteredActions.slice(0, 10).map((action) => {
      const state = stateMap.get(action.id);
      if (!state) return action;
      return {
        ...action,
        userState: {
          status: isActionStatus(state.status) ? state.status : undefined,
          snoozedUntil: state.snoozedUntil?.toISOString() ?? null,
          feedback: isActionFeedback(state.feedback) ? state.feedback : undefined,
        },
      };
    });

    const responseData: AIActionsResponse = {
      actions: limitedActions,
      totalCount: filteredActions.length,
      highPriorityCount: filteredActions.filter((a) => a.priority === 'high').length,
      lastUpdated: new Date().toISOString(),
    };

    const validatedResponse = actionsResponseSchema.parse(responseData);
    log.info(
      {
        durationMs: Date.now() - requestStartedAt,
        generatedActions: actions.length,
        returnedActions: validatedResponse.actions.length,
      },
      'AI actions request completed'
    );
    return apiJson({ data: validatedResponse });
  } catch (error) {
    log.error({ error }, 'Failed to fetch AI actions');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch AI actions' },
      { status: 500 }
    );
  }
}

