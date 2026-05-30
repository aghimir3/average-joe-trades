import { apiJson } from '@/lib/api/response';

import { z } from 'zod';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { apiRateLimiter, rateLimitResponse } from '@/lib/security/rate-limit';
import {
  enqueueAlphaLabRun,
  getAlphaLabRun,
  processAlphaLabRun,
} from '@/lib/quant/services';

const createRunSchema = z.object({
  symbol: z.string().min(1).max(20).transform((value) => value.toUpperCase()),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const querySchema = z.object({
  runId: z.string().uuid().optional(),
});

function parseJsonSafe(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`quant-alpha-lab:get:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const url = new URL(request.url);
    const validatedQuery = querySchema.safeParse({
      runId: url.searchParams.get('runId') ?? undefined,
    });
    if (!validatedQuery.success || !validatedQuery.data.runId) {
      return apiJson(
        { error: 'Bad Request', message: 'runId is required' },
        { status: 400 }
      );
    }

    const existing = await getAlphaLabRun(userId, validatedQuery.data.runId);
    if (!existing) {
      return apiJson(
        { error: 'Not Found', message: 'Alpha lab run not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'pending' || existing.status === 'running') {
      await processAlphaLabRun(userId, existing.id);
    }

    const updated = await getAlphaLabRun(userId, existing.id);
    if (!updated) {
      return apiJson(
        { error: 'Not Found', message: 'Alpha lab run not found after processing' },
        { status: 404 }
      );
    }

    return apiJson({
      data: {
        runId: updated.id,
        status: updated.status,
        symbol: updated.symbol,
        strategyKey: updated.strategyKey,
        metrics: parseJsonSafe(updated.metricsJson),
        equityCurve: parseJsonSafe(updated.equityCurve),
        error: updated.errorMessage,
        startedAt: updated.startedAt?.toISOString() ?? null,
        completedAt: updated.completedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to fetch/process alpha lab run');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to fetch alpha lab run' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);

  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;
    const userId = session.user.id;

    const rate = apiRateLimiter.check(`quant-alpha-lab:post:${userId}`);
    if (!rate.success) return rateLimitResponse(rate.remaining, rate.resetMs);

    const parsedBody = createRunSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiJson(
        { error: 'Validation Error', message: parsedBody.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      );
    }

    const startDate = new Date(parsedBody.data.startDate);
    const endDate = new Date(parsedBody.data.endDate);
    if (startDate >= endDate) {
      return apiJson(
        { error: 'Validation Error', message: 'startDate must be before endDate' },
        { status: 400 }
      );
    }

    const run = await enqueueAlphaLabRun(userId, {
      symbol: parsedBody.data.symbol,
      startDate,
      endDate,
      strategyKey: 'stock_trend_v1',
    });

    log.info({ userId, runId: run.runId, symbol: parsedBody.data.symbol }, 'Queued alpha lab run');

    return apiJson(
      {
        data: {
          runId: run.runId,
          status: 'pending',
        },
      },
      { status: 202 }
    );
  } catch (error) {
    log.error({ error }, 'Failed to enqueue alpha lab run');
    return apiJson(
      { error: 'Internal Server Error', message: 'Failed to enqueue alpha lab run' },
      { status: 500 }
    );
  }
}


