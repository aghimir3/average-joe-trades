import { NextResponse } from 'next/server';
import { apiJson } from '@/lib/api/response';
/**
 * Portfolio Policy API
 *
 * Manages user's portfolio policies per brokerage account.
 * GET /api/policy - Get policy (optionally for specific account)
 * POST /api/policy - Create or update policy
 */


import { checkAuthApi } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Validation schema for policy creation/update
const policySchema = z.object({
  brokerageAccountId: z.string().uuid().nullable().optional(),

  // Trading Rules
  maxPositionSizePercent: z.number().min(0).max(100).nullable().optional(),
  maxPositionSizeDollars: z.number().min(0).nullable().optional(),
  defaultPositionSize: z.number().min(0).nullable().optional(),
  entryRules: z.string().max(4000).nullable().optional(),
  exitRules: z.string().max(4000).nullable().optional(),
  maxOpenPositions: z.number().int().min(0).nullable().optional(),
  maxDailyTrades: z.number().int().min(0).nullable().optional(),
  maxDailyLoss: z.number().min(0).nullable().optional(),
  tradingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  tradingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  tradingDays: z.string().max(20).nullable().optional(),

  // Risk Management
  defaultStopLossPercent: z.number().min(0).max(100).nullable().optional(),
  maxStopLossPercent: z.number().min(0).max(100).nullable().optional(),
  useTrailingStops: z.boolean().nullable().optional(),
  trailingStopPercent: z.number().min(0).max(100).nullable().optional(),
  maxDrawdownPercent: z.number().min(0).max(100).nullable().optional(),
  maxWeeklyLossPercent: z.number().min(0).max(100).nullable().optional(),
  maxMonthlyLossPercent: z.number().min(0).max(100).nullable().optional(),
  maxSectorExposurePercent: z.number().min(0).max(100).nullable().optional(),
  maxSingleStockPercent: z.number().min(0).max(100).nullable().optional(),
  maxOptionsPercent: z.number().min(0).max(100).nullable().optional(),
  maxNakedPutsPercent: z.number().min(0).max(100).nullable().optional(),
  maxCoveredCallsPercent: z.number().min(0).max(100).nullable().optional(),
  minDaysToExpiration: z.number().int().min(0).nullable().optional(),

  // Investment Policy
  targetStockPercent: z.number().min(0).max(100).nullable().optional(),
  targetOptionsPercent: z.number().min(0).max(100).nullable().optional(),
  targetCashPercent: z.number().min(0).max(100).nullable().optional(),
  rebalanceFrequency: z.enum(['weekly', 'monthly', 'quarterly', 'annually']).nullable().optional(),
  rebalanceThreshold: z.number().min(0).max(100).nullable().optional(),
  investmentTimeHorizon: z.enum(['day', 'swing', 'position', 'long-term']).nullable().optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).nullable().optional(),
  minPositions: z.number().int().min(0).nullable().optional(),
  maxCorrelatedPositions: z.number().int().min(0).nullable().optional(),

  // Personal Notes
  personalTradingRules: z.string().nullable().optional(),
  preTradeChecklist: z.string().nullable().optional(),
  emotionalRules: z.string().nullable().optional(),
  marketConditionRules: z.string().nullable().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const brokerageAccountId = searchParams.get('brokerageAccountId');

    // Get policy for specific account or default policy
    const policy = await prisma.portfolioPolicy.findFirst({
      where: {
        userId,
        brokerageAccountId: brokerageAccountId || null,
      },
    });

    // Also get account info if specific account requested
    let account = null;
    if (brokerageAccountId) {
      account = await prisma.brokerageAccount.findFirst({
        where: { id: brokerageAccountId, userId },
        select: { id: true, name: true, broker: true },
      });
    }

    return apiJson({
      data: {
        policy: policy ? formatPolicy(policy) : null,
        account,
      },
    });
  } catch (error) {
    console.error('Error fetching policy:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { session, response } = await checkAuthApi();
    if (response) return response;

    const userId = session.user.id;
    const body = await request.json();

    // Validate input
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) {
      return apiJson(
        { error: 'Validation Error', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const brokerageAccountId = data.brokerageAccountId ?? null;

    // If account specified, verify ownership
    if (brokerageAccountId) {
      const account = await prisma.brokerageAccount.findFirst({
        where: { id: brokerageAccountId, userId },
      });
      if (!account) {
        return apiJson({ error: 'Account not found' }, { status: 404 });
      }
    }

    // Find existing policy
    const existingPolicy = await prisma.portfolioPolicy.findFirst({
      where: {
        userId,
        brokerageAccountId: brokerageAccountId,
      },
    });

    // Create or update policy
    let policy;
    if (existingPolicy) {
      policy = await prisma.portfolioPolicy.update({
        where: { id: existingPolicy.id },
        data: buildPolicyData(data),
      });
    } else {
      policy = await prisma.portfolioPolicy.create({
        data: {
          userId,
          brokerageAccountId,
          ...buildPolicyData(data),
        },
      });
    }

    return apiJson({
      data: formatPolicy(policy),
      message: 'Portfolio policy saved successfully',
    });
  } catch (error) {
    console.error('Error saving policy:', error);
    return apiJson({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Helper to build policy data for Prisma
function buildPolicyData(data: z.infer<typeof policySchema>) {
  return {
    // Trading Rules
    maxPositionSizePercent: data.maxPositionSizePercent ?? null,
    maxPositionSizeDollars: data.maxPositionSizeDollars ?? null,
    defaultPositionSize: data.defaultPositionSize ?? null,
    entryRules: data.entryRules ?? null,
    exitRules: data.exitRules ?? null,
    maxOpenPositions: data.maxOpenPositions ?? null,
    maxDailyTrades: data.maxDailyTrades ?? null,
    maxDailyLoss: data.maxDailyLoss ?? null,
    tradingHoursStart: data.tradingHoursStart ?? null,
    tradingHoursEnd: data.tradingHoursEnd ?? null,
    tradingDays: data.tradingDays ?? null,

    // Risk Management
    defaultStopLossPercent: data.defaultStopLossPercent ?? null,
    maxStopLossPercent: data.maxStopLossPercent ?? null,
    useTrailingStops: data.useTrailingStops ?? null,
    trailingStopPercent: data.trailingStopPercent ?? null,
    maxDrawdownPercent: data.maxDrawdownPercent ?? null,
    maxWeeklyLossPercent: data.maxWeeklyLossPercent ?? null,
    maxMonthlyLossPercent: data.maxMonthlyLossPercent ?? null,
    maxSectorExposurePercent: data.maxSectorExposurePercent ?? null,
    maxSingleStockPercent: data.maxSingleStockPercent ?? null,
    maxOptionsPercent: data.maxOptionsPercent ?? null,
    maxNakedPutsPercent: data.maxNakedPutsPercent ?? null,
    maxCoveredCallsPercent: data.maxCoveredCallsPercent ?? null,
    minDaysToExpiration: data.minDaysToExpiration ?? null,

    // Investment Policy
    targetStockPercent: data.targetStockPercent ?? null,
    targetOptionsPercent: data.targetOptionsPercent ?? null,
    targetCashPercent: data.targetCashPercent ?? null,
    rebalanceFrequency: data.rebalanceFrequency ?? null,
    rebalanceThreshold: data.rebalanceThreshold ?? null,
    investmentTimeHorizon: data.investmentTimeHorizon ?? null,
    riskTolerance: data.riskTolerance ?? null,
    minPositions: data.minPositions ?? null,
    maxCorrelatedPositions: data.maxCorrelatedPositions ?? null,

    // Personal Notes
    personalTradingRules: data.personalTradingRules ?? null,
    preTradeChecklist: data.preTradeChecklist ?? null,
    emotionalRules: data.emotionalRules ?? null,
    marketConditionRules: data.marketConditionRules ?? null,
  };
}

// Helper to format policy for response (convert Decimal to number)
function formatPolicy(policy: {
  id: string;
  userId: string;
  brokerageAccountId: string | null;
  maxPositionSizePercent: { toNumber: () => number } | null;
  maxPositionSizeDollars: { toNumber: () => number } | null;
  defaultPositionSize: { toNumber: () => number } | null;
  entryRules: string | null;
  exitRules: string | null;
  maxOpenPositions: number | null;
  maxDailyTrades: number | null;
  maxDailyLoss: { toNumber: () => number } | null;
  tradingHoursStart: string | null;
  tradingHoursEnd: string | null;
  tradingDays: string | null;
  defaultStopLossPercent: { toNumber: () => number } | null;
  maxStopLossPercent: { toNumber: () => number } | null;
  useTrailingStops: boolean | null;
  trailingStopPercent: { toNumber: () => number } | null;
  maxDrawdownPercent: { toNumber: () => number } | null;
  maxWeeklyLossPercent: { toNumber: () => number } | null;
  maxMonthlyLossPercent: { toNumber: () => number } | null;
  maxSectorExposurePercent: { toNumber: () => number } | null;
  maxSingleStockPercent: { toNumber: () => number } | null;
  maxOptionsPercent: { toNumber: () => number } | null;
  maxNakedPutsPercent: { toNumber: () => number } | null;
  maxCoveredCallsPercent: { toNumber: () => number } | null;
  minDaysToExpiration: number | null;
  targetStockPercent: { toNumber: () => number } | null;
  targetOptionsPercent: { toNumber: () => number } | null;
  targetCashPercent: { toNumber: () => number } | null;
  rebalanceFrequency: string | null;
  rebalanceThreshold: { toNumber: () => number } | null;
  investmentTimeHorizon: string | null;
  riskTolerance: string | null;
  minPositions: number | null;
  maxCorrelatedPositions: number | null;
  personalTradingRules: string | null;
  preTradeChecklist: string | null;
  emotionalRules: string | null;
  marketConditionRules: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: policy.id,
    brokerageAccountId: policy.brokerageAccountId,

    // Trading Rules
    maxPositionSizePercent: policy.maxPositionSizePercent?.toNumber() ?? null,
    maxPositionSizeDollars: policy.maxPositionSizeDollars?.toNumber() ?? null,
    defaultPositionSize: policy.defaultPositionSize?.toNumber() ?? null,
    entryRules: policy.entryRules,
    exitRules: policy.exitRules,
    maxOpenPositions: policy.maxOpenPositions,
    maxDailyTrades: policy.maxDailyTrades,
    maxDailyLoss: policy.maxDailyLoss?.toNumber() ?? null,
    tradingHoursStart: policy.tradingHoursStart,
    tradingHoursEnd: policy.tradingHoursEnd,
    tradingDays: policy.tradingDays,

    // Risk Management
    defaultStopLossPercent: policy.defaultStopLossPercent?.toNumber() ?? null,
    maxStopLossPercent: policy.maxStopLossPercent?.toNumber() ?? null,
    useTrailingStops: policy.useTrailingStops,
    trailingStopPercent: policy.trailingStopPercent?.toNumber() ?? null,
    maxDrawdownPercent: policy.maxDrawdownPercent?.toNumber() ?? null,
    maxWeeklyLossPercent: policy.maxWeeklyLossPercent?.toNumber() ?? null,
    maxMonthlyLossPercent: policy.maxMonthlyLossPercent?.toNumber() ?? null,
    maxSectorExposurePercent: policy.maxSectorExposurePercent?.toNumber() ?? null,
    maxSingleStockPercent: policy.maxSingleStockPercent?.toNumber() ?? null,
    maxOptionsPercent: policy.maxOptionsPercent?.toNumber() ?? null,
    maxNakedPutsPercent: policy.maxNakedPutsPercent?.toNumber() ?? null,
    maxCoveredCallsPercent: policy.maxCoveredCallsPercent?.toNumber() ?? null,
    minDaysToExpiration: policy.minDaysToExpiration,

    // Investment Policy
    targetStockPercent: policy.targetStockPercent?.toNumber() ?? null,
    targetOptionsPercent: policy.targetOptionsPercent?.toNumber() ?? null,
    targetCashPercent: policy.targetCashPercent?.toNumber() ?? null,
    rebalanceFrequency: policy.rebalanceFrequency,
    rebalanceThreshold: policy.rebalanceThreshold?.toNumber() ?? null,
    investmentTimeHorizon: policy.investmentTimeHorizon,
    riskTolerance: policy.riskTolerance,
    minPositions: policy.minPositions,
    maxCorrelatedPositions: policy.maxCorrelatedPositions,

    // Personal Notes
    personalTradingRules: policy.personalTradingRules,
    preTradeChecklist: policy.preTradeChecklist,
    emotionalRules: policy.emotionalRules,
    marketConditionRules: policy.marketConditionRules,

    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

