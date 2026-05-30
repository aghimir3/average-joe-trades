import { apiJson } from '@/lib/api/response';
/**
 * Ticker Wheel Insights API
 *
 * Returns comprehensive wheel strategy insights for a specific ticker.
 * Includes premium history, strike analysis, timeline, and simulator data.
 *
 * GET /api/strategies/wheel/ticker?symbol=AAPL
 */


import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAuthApi } from '@/lib/auth';
import { createRequestLogger } from '@/lib/logger';
import { isDashboardSampleModeEnabled } from '@/lib/dashboard/sample-mode';
import { sampleDashboardWheelTicker, sampleDashboardWheelTickerList } from '@/lib/dashboard/sample-data';
import { calculateWheelCostBasisEvolution, type StockBuyHistoryPoint } from '@/lib/strategies/wheel/cost-basis';

// ============================================================================
// Query Schema
// ============================================================================

const querySchema = z.object({
  symbol: z.string().min(1).optional(),
  brokerageAccountId: z.string().uuid().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getISOWeek(dateStr: string): { week: string; weekLabel: string } {
  const date = new Date(dateStr);
  // Calculate ISO week number
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = date.getFullYear();

  // Get week start date for label
  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - dayNr);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekLabel = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}`;

  return {
    week: `${year}-W${weekNum.toString().padStart(2, '0')}`,
    weekLabel,
  };
}

function calculateDTE(expiration: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiration);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Types
// ============================================================================

interface TickerTrade {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strategy: string;
  strike: number;
  expiration: string;
  openDate: string;
  closeDate: string;
  closeReason: string;
  premium: number;
  daysHeld: number;
  quantity: number;
  openPrice: number;
  closePrice: number;
}

interface StrikeStats {
  strike: number;
  totalTrades: number;
  ccTrades: number;
  cspTrades: number;
  totalPremium: number;
  avgPremium: number;
  winRate: number;
  assignments: number;
  assignmentRate: number;
  avgDTE: number;
}

interface MonthlyBreakdown {
  month: string;
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

interface WeeklyBreakdown {
  week: string; // YYYY-Www format (e.g., "2026-W04")
  weekLabel: string; // Display format (e.g., "Jan 20")
  premium: number;
  tradeCount: number;
  ccPremium: number;
  cspPremium: number;
}

// ============================================================================
// Playbook Types
// ============================================================================

interface PlaybookData {
  bestDteBucket: { range: string; winRate: number; tradeCount: number } | null;
  bestStrikeDistance: { range: string; winRate: number; tradeCount: number } | null;
  bestDayOfWeek: { day: string; winRate: number } | null;
  strategyEdge: { winner: 'csp' | 'cc' | 'even'; cspWinRate: number; ccWinRate: number };
  premiumRegime: 'high' | 'normal' | 'low';
  assignmentDangerZone: { strike: number; rate: number } | null;
}

interface BagholdRecoveryData {
  assignmentPrice: number;
  assignmentDate: string;
  currentPrice: number;
  shares: number;
  unrealizedLoss: number;
  ccPremiumSinceAssignment: number;
  ccTradesSinceAssignment: number;
  remainingToBreakeven: number;
  recoveryProgress: number;
  avgWeeklyCCPremium: number;
  projectedWeeksToBreakeven: number | null;
}

interface StrikeHeatmapCell {
  strike: number;
  dteBucket: string;
  tradeCount: number;
  winRate: number;
  avgPremium: number;
}

interface StrikeHeatmapData {
  cells: StrikeHeatmapCell[];
  strikes: number[];
  dteBuckets: string[];
}

interface ConcentrationRiskData {
  openCspCollateral: number;
  totalCollateralAtRisk: number;
  buyingPower: number | null;
  collateralUtilization: number | null;
  ytdPremiumCollected: number;
  premiumBufferPct: number;
  maxPainLoss: number;
  maxPainDescription: string;
}

interface SimulatorData {
  // Historical averages for simulator
  avgCCPremiumPct: number; // Average CC premium as % of strike
  avgCSPPremiumPct: number; // Average CSP premium as % of strike
  avgDTEAtOpen: number;
  avgDaysHeld: number;
  assignmentRate: number;
  // Premium by DTE range
  premiumByDTE: Array<{
    dteRange: string;
    avgPremiumPct: number;
    tradeCount: number;
  }>;
  // Strike distance analysis (if we have underlying price data)
  strikeDistancePerformance: Array<{
    distanceRange: string;
    avgPremiumPct: number;
    assignmentRate: number;
    tradeCount: number;
  }>;
}

type TradeWithUnderlying = TickerTrade & { underlyingPriceAtOpen: number | null };

// ============================================================================
// Strike Distance Analysis Types
// ============================================================================

interface StrikeDistanceBucket {
  distancePct: string;
  avgDistanceDollars: number;
  tradeCount: number;
  totalPremium: number;
  avgPremium: number;
  winRate: number;
  assignmentRate: number;
  avgDaysHeld: number;
}

interface StrikeDistanceAnalysis {
  cc: StrikeDistanceBucket[];
  csp: StrikeDistanceBucket[];
  tradesWithData: number;
  tradesWithoutData: number;
}

// ============================================================================
// Strike Distance Computation
// ============================================================================

const DISTANCE_BUCKETS = [
  { label: 'ITM', min: -Infinity, max: 0 },
  { label: '0-2%', min: 0, max: 2 },
  { label: '2-5%', min: 2, max: 5 },
  { label: '5-10%', min: 5, max: 10 },
  { label: '10%+', min: 10, max: Infinity },
] as const;

function computeStrikeDistanceAnalysis(
  trades: TradeWithUnderlying[]
): StrikeDistanceAnalysis | null {
  const tradesWithData = trades.filter(
    t => t.underlyingPriceAtOpen != null && t.underlyingPriceAtOpen > 0 && t.strike > 0
  );
  const tradesWithoutData = trades.length - tradesWithData.length;

  if (tradesWithData.length < 3) return null;

  function buildBuckets(
    filteredTrades: TradeWithUnderlying[],
    distanceFn: (t: TradeWithUnderlying) => number
  ): StrikeDistanceBucket[] {
    return DISTANCE_BUCKETS.map(bucket => {
      const bucketTrades = filteredTrades.filter(t => {
        const dist = distanceFn(t);
        return dist >= bucket.min && dist < bucket.max;
      });

      if (bucketTrades.length === 0) {
        return {
          distancePct: bucket.label,
          avgDistanceDollars: 0,
          tradeCount: 0,
          totalPremium: 0,
          avgPremium: 0,
          winRate: 0,
          assignmentRate: 0,
          avgDaysHeld: 0,
        };
      }

      const totalPremium = bucketTrades.reduce((sum, t) => sum + t.premium, 0);
      const wins = bucketTrades.filter(t => t.premium > 0).length;
      const assigns = bucketTrades.filter(t => t.closeReason === 'assigned').length;
      const avgDist = bucketTrades.reduce(
        (sum, t) => sum + Math.abs(t.strike - t.underlyingPriceAtOpen!),
        0
      ) / bucketTrades.length;
      const avgDaysHeld = bucketTrades.reduce((sum, t) => sum + t.daysHeld, 0) / bucketTrades.length;

      return {
        distancePct: bucket.label,
        avgDistanceDollars: Math.round(avgDist * 100) / 100,
        tradeCount: bucketTrades.length,
        totalPremium: Math.round(totalPremium * 100) / 100,
        avgPremium: Math.round((totalPremium / bucketTrades.length) * 100) / 100,
        winRate: Math.round((wins / bucketTrades.length) * 100),
        assignmentRate: Math.round((assigns / bucketTrades.length) * 100),
        avgDaysHeld: Math.round(avgDaysHeld * 10) / 10,
      };
    }).filter(b => b.tradeCount > 0);
  }

  // CC: distance = (strike - marketPrice) / marketPrice * 100
  // Positive = OTM (strike above market), negative = ITM
  const ccTrades = tradesWithData.filter(t => t.optionType === 'call');
  const ccBuckets = buildBuckets(ccTrades, t => {
    return ((t.strike - t.underlyingPriceAtOpen!) / t.underlyingPriceAtOpen!) * 100;
  });

  // CSP: distance = (marketPrice - strike) / marketPrice * 100
  // Positive = OTM (strike below market), negative = ITM
  const cspTrades = tradesWithData.filter(t => t.optionType === 'put');
  const cspBuckets = buildBuckets(cspTrades, t => {
    return ((t.underlyingPriceAtOpen! - t.strike) / t.underlyingPriceAtOpen!) * 100;
  });

  return {
    cc: ccBuckets,
    csp: cspBuckets,
    tradesWithData: tradesWithData.length,
    tradesWithoutData,
  };
}

// ============================================================================
// Playbook Computation
// ============================================================================

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DTE_BUCKETS = [
  { label: '0-7d', min: 0, max: 7 },
  { label: '8-14d', min: 8, max: 14 },
  { label: '15-30d', min: 15, max: 30 },
  { label: '31-45d', min: 31, max: 45 },
  { label: '45+d', min: 46, max: Infinity },
] as const;

const OTM_BUCKETS = [
  { label: '0-3%', min: 0, max: 3 },
  { label: '3-5%', min: 3, max: 5 },
  { label: '5-10%', min: 5, max: 10 },
  { label: '10%+', min: 10, max: Infinity },
] as const;

function computePlaybook(
  trades: TradeWithUnderlying[],
  ccTrades: TickerTrade[],
  cspTrades: TickerTrade[],
  strikeStats: StrikeStats[]
): PlaybookData | null {
  if (trades.length < 5) return null;

  // Best DTE bucket by win rate
  const dteBucketStats = DTE_BUCKETS.map(bucket => {
    const bucketTrades = trades.filter(t => t.daysHeld >= bucket.min && t.daysHeld <= bucket.max);
    const wins = bucketTrades.filter(t => t.premium > 0).length;
    return {
      range: bucket.label,
      winRate: bucketTrades.length >= 3 ? Math.round((wins / bucketTrades.length) * 100) : -1,
      tradeCount: bucketTrades.length,
    };
  }).filter(b => b.winRate >= 0);
  const bestDteBucket = dteBucketStats.length > 0
    ? dteBucketStats.reduce((best, b) => b.winRate > best.winRate ? b : best)
    : null;

  // Best OTM% bucket
  const otmBucketStats = OTM_BUCKETS.map(bucket => {
    const bucketTrades = trades.filter(t => {
      if (!t.underlyingPriceAtOpen || t.underlyingPriceAtOpen <= 0 || t.strike <= 0) return false;
      const otmPct = (Math.abs(t.strike - t.underlyingPriceAtOpen) / t.underlyingPriceAtOpen) * 100;
      return otmPct >= bucket.min && otmPct < bucket.max;
    });
    const wins = bucketTrades.filter(t => t.premium > 0).length;
    return {
      range: bucket.label,
      winRate: bucketTrades.length >= 3 ? Math.round((wins / bucketTrades.length) * 100) : -1,
      tradeCount: bucketTrades.length,
    };
  }).filter(b => b.winRate >= 0);
  const bestStrikeDistance = otmBucketStats.length > 0
    ? otmBucketStats.reduce((best, b) => b.winRate > best.winRate ? b : best)
    : null;

  // Best day of week
  const dayStats = Array(7).fill(null).map(() => ({ wins: 0, total: 0 }));
  for (const trade of trades) {
    const day = new Date(trade.openDate + 'T12:00:00Z').getDay();
    dayStats[day].total++;
    if (trade.premium > 0) dayStats[day].wins++;
  }
  const daysWithData = dayStats
    .map((stat, i) => ({ day: DAY_NAMES[i], winRate: stat.total >= 3 ? Math.round((stat.wins / stat.total) * 100) : -1, total: stat.total }))
    .filter(d => d.winRate >= 0);
  const bestDayOfWeek = daysWithData.length > 0
    ? daysWithData.reduce((best, d) => d.winRate > best.winRate ? d : best)
    : null;

  // Strategy edge
  const ccWins = ccTrades.filter(t => t.premium > 0).length;
  const cspWins = cspTrades.filter(t => t.premium > 0).length;
  const ccWinRate = ccTrades.length > 0 ? Math.round((ccWins / ccTrades.length) * 100) : 0;
  const cspWinRate = cspTrades.length > 0 ? Math.round((cspWins / cspTrades.length) * 100) : 0;
  const winner = Math.abs(ccWinRate - cspWinRate) < 5 ? 'even' as const : ccWinRate > cspWinRate ? 'cc' as const : 'csp' as const;

  // Premium regime (last 5 trades vs all)
  const avgPremium = trades.reduce((sum, t) => sum + t.premium, 0) / trades.length;
  const recentAvg = trades.slice(0, Math.min(5, trades.length)).reduce((sum, t) => sum + t.premium, 0) / Math.min(5, trades.length);
  const premiumRegime = avgPremium > 0 && recentAvg > avgPremium * 1.2 ? 'high' as const
    : avgPremium > 0 && recentAvg < avgPremium * 0.8 ? 'low' as const
    : 'normal' as const;

  // Assignment danger zone
  const dangerStrikes = strikeStats
    .filter(s => s.assignmentRate > 30 && s.totalTrades >= 3)
    .sort((a, b) => b.assignmentRate - a.assignmentRate);
  const assignmentDangerZone = dangerStrikes.length > 0
    ? { strike: dangerStrikes[0].strike, rate: dangerStrikes[0].assignmentRate }
    : null;

  return {
    bestDteBucket,
    bestStrikeDistance,
    bestDayOfWeek: bestDayOfWeek ? { day: bestDayOfWeek.day, winRate: bestDayOfWeek.winRate } : null,
    strategyEdge: { winner, cspWinRate, ccWinRate },
    premiumRegime,
    assignmentDangerZone,
  };
}

// ============================================================================
// Strike Heatmap Computation
// ============================================================================

function computeStrikeHeatmap(trades: TickerTrade[]): StrikeHeatmapData | null {
  if (trades.length < 5) return null;

  const dteBucketLabels = DTE_BUCKETS.map(b => b.label);
  const cellMap = new Map<string, { wins: number; total: number; premiumSum: number }>();

  for (const trade of trades) {
    if (trade.strike <= 0) continue;
    const bucket = DTE_BUCKETS.find(b => trade.daysHeld >= b.min && trade.daysHeld <= b.max);
    if (!bucket) continue;

    const key = `${trade.strike}_${bucket.label}`;
    const existing = cellMap.get(key) || { wins: 0, total: 0, premiumSum: 0 };
    existing.total++;
    if (trade.premium > 0) existing.wins++;
    existing.premiumSum += trade.premium;
    cellMap.set(key, existing);
  }

  const cells: StrikeHeatmapCell[] = [];
  const strikesSet = new Set<number>();

  for (const [key, data] of cellMap) {
    const [strikeStr, dteBucket] = key.split('_');
    const strike = Number(strikeStr);
    strikesSet.add(strike);
    cells.push({
      strike,
      dteBucket,
      tradeCount: data.total,
      winRate: Math.round((data.wins / data.total) * 100),
      avgPremium: Math.round((data.premiumSum / data.total) * 100) / 100,
    });
  }

  const strikes = Array.from(strikesSet).sort((a, b) => a - b);

  return cells.length > 0 ? { cells, strikes, dteBuckets: dteBucketLabels } : null;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  const log = createRequestLogger(correlationId);
  let userId: string | undefined;

  try {
    const { session, response } = await checkAuthApi();
    if (response || !session) return response!;

    userId = session.user.id;

    // Parse query
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validated = querySchema.safeParse(queryParams);

    if (!validated.success) {
      return apiJson(
        { error: 'Bad Request', message: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const { symbol, brokerageAccountId } = validated.data;

    if (await isDashboardSampleModeEnabled(userId)) {
      log.info({ userId, symbol }, 'Returning sample wheel ticker data');
      if (!symbol) {
        return apiJson({ data: sampleDashboardWheelTickerList() });
      }
      return apiJson({ data: sampleDashboardWheelTicker(symbol) });
    }

    // If no symbol provided, return list of traded tickers
    if (!symbol) {
      return await getTickerList(userId, brokerageAccountId, log);
    }

    log.info({ userId, symbol }, 'Fetching ticker wheel insights');

    // Build where clauses for this ticker
    const wheelWhere: Prisma.RealizedCloseWhereInput = {
      userId,
      symbol,
      OR: [
        { strategy: { in: ['covered_call', 'cash_secured_put'] } },
        { side: 'short', isWheelTrade: true },
      ],
    };

    const positionWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      symbol,
      positionType: 'option',
      side: 'short',
    };

    const stockWhere: Prisma.DerivedPositionWhereInput = {
      userId,
      symbol,
      positionType: 'stock',
    };

    if (brokerageAccountId) {
      wheelWhere.brokerageAccountId = brokerageAccountId;
      positionWhere.brokerageAccountId = brokerageAccountId;
      stockWhere.brokerageAccountId = brokerageAccountId;
    }

    // Fetch all data for this ticker
    const stockHistoryWhere: Prisma.LedgerEventWhereInput = {
      userId,
      symbol,
      eventType: 'EQUITY_STOCK',
      transCode: 'BUY',
      deletedAt: null,
    };
    if (brokerageAccountId) {
      stockHistoryWhere.brokerageAccountId = brokerageAccountId;
    }

    const balanceWhere: Prisma.BrokerBalanceWhereInput = { userId };
    if (brokerageAccountId) {
      balanceWhere.brokerageAccountId = brokerageAccountId;
    }

    const [closedTrades, openPositions, stockPositions, stockBuyHistory, brokerBalances] = await Promise.all([
      prisma.realizedClose.findMany({
        where: wheelWhere,
        select: {
          id: true,
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          closeDate: true,
          openDate: true,
          quantity: true,
          realizedPnL: true,
          strategy: true,
          side: true,
          closeReason: true,
          openPrice: true,
          closePrice: true,
          underlyingPriceAtOpen: true,
        },
        orderBy: { closeDate: 'desc' },
      }),

      prisma.derivedPosition.findMany({
        where: positionWhere,
        select: {
          id: true,
          symbol: true,
          optionType: true,
          strike: true,
          expiration: true,
          quantity: true,
          costBasis: true,
          avgPrice: true,
          firstEntryDate: true,
          strategy: true,
          ledgerLinks: {
            where: { openEventId: { not: null } },
            select: { openEventId: true },
            take: 1,
          },
        },
        orderBy: { expiration: 'asc' },
      }),

      prisma.derivedPosition.findMany({
        where: stockWhere,
        select: {
          id: true,
          quantity: true,
          costBasis: true,
          avgPrice: true,
          firstEntryDate: true,
        },
      }),

      prisma.ledgerEvent.findMany({
        where: stockHistoryWhere,
        select: {
          quantity: true,
          amount: true,
          price: true,
        },
      }),

      prisma.brokerBalance.findMany({
        where: balanceWhere,
        select: { buyingPower: true },
      }),
    ]);

    const aggregatedStockShares = stockPositions.reduce(
      (sum, position) => sum + Math.abs(position.quantity.toNumber()),
      0
    );
    const aggregatedStockCostBasis = stockPositions.reduce(
      (sum, position) => sum + Math.abs(position.costBasis.toNumber()),
      0
    );
    const stockPosition = aggregatedStockShares > 0
      ? {
          shares: aggregatedStockShares,
          costBasis: aggregatedStockCostBasis,
          avgPrice: aggregatedStockCostBasis / aggregatedStockShares,
        }
      : null;

    // Convert trades to typed format (with underlying price for OTM% analysis)
    const tradesWithUnderlying = closedTrades.map(t => ({
      id: t.id,
      symbol: t.symbol,
      optionType: (t.optionType as 'call' | 'put') || 'put',
      strategy: t.strategy || (t.optionType === 'call' ? 'covered_call' : 'cash_secured_put'),
      strike: t.strike?.toNumber() || 0,
      expiration: t.expiration?.toISOString().split('T')[0] || '',
      openDate: t.openDate.toISOString().split('T')[0],
      closeDate: t.closeDate.toISOString().split('T')[0],
      closeReason: t.closeReason,
      premium: t.realizedPnL.toNumber(),
      daysHeld: daysBetween(t.openDate, t.closeDate),
      quantity: Math.abs(t.quantity.toNumber()),
      openPrice: t.openPrice.toNumber(),
      closePrice: t.closePrice.toNumber(),
      underlyingPriceAtOpen: t.underlyingPriceAtOpen?.toNumber() ?? null,
    }));
    // TickerTrade type excludes underlyingPriceAtOpen — strip it for the response
    const trades: TickerTrade[] = tradesWithUnderlying;

    // =========================================================================
    // Summary Metrics
    // =========================================================================

    const ccTrades = trades.filter(t => t.optionType === 'call');
    const cspTrades = trades.filter(t => t.optionType === 'put');

    const totalPremium = trades.reduce((sum, t) => sum + t.premium, 0);
    const ccPremium = ccTrades.reduce((sum, t) => sum + t.premium, 0);
    const cspPremium = cspTrades.reduce((sum, t) => sum + t.premium, 0);

    const winCount = trades.filter(t => t.premium > 0).length;
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

    const assignments = trades.filter(t => t.closeReason === 'assigned').length;
    const expirations = trades.filter(t => t.closeReason === 'expired').length;
    const earlyCloses = trades.filter(t => t.closeReason === 'normal').length;

    const assignmentRate = trades.length > 0 ? (assignments / trades.length) * 100 : 0;

    const avgDTE = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.daysHeld, 0) / trades.length
      : 0;

    const avgPremium = trades.length > 0 ? totalPremium / trades.length : 0;

    // =========================================================================
    // Strike Analysis
    // =========================================================================

    const strikeMap = new Map<number, {
      trades: TickerTrade[];
      ccTrades: number;
      cspTrades: number;
    }>();

    for (const trade of trades) {
      const existing = strikeMap.get(trade.strike) || {
        trades: [],
        ccTrades: 0,
        cspTrades: 0,
      };
      existing.trades.push(trade);
      if (trade.optionType === 'call') {
        existing.ccTrades++;
      } else {
        existing.cspTrades++;
      }
      strikeMap.set(trade.strike, existing);
    }

    const strikeStats: StrikeStats[] = Array.from(strikeMap.entries())
      .map(([strike, data]) => {
        const premium = data.trades.reduce((sum, t) => sum + t.premium, 0);
        const wins = data.trades.filter(t => t.premium > 0).length;
        const assigns = data.trades.filter(t => t.closeReason === 'assigned').length;
        const dte = data.trades.reduce((sum, t) => sum + t.daysHeld, 0) / data.trades.length;

        return {
          strike,
          totalTrades: data.trades.length,
          ccTrades: data.ccTrades,
          cspTrades: data.cspTrades,
          totalPremium: Math.round(premium * 100) / 100,
          avgPremium: Math.round((premium / data.trades.length) * 100) / 100,
          winRate: Math.round((wins / data.trades.length) * 100 * 100) / 100,
          assignments: assigns,
          assignmentRate: Math.round((assigns / data.trades.length) * 100 * 100) / 100,
          avgDTE: Math.round(dte * 10) / 10,
        };
      })
      .sort((a, b) => b.totalPremium - a.totalPremium);

    // =========================================================================
    // Monthly Breakdown
    // =========================================================================

    const monthlyMap = new Map<string, MonthlyBreakdown>();

    for (const trade of trades) {
      const month = trade.closeDate.substring(0, 7); // YYYY-MM
      const existing = monthlyMap.get(month) || {
        month,
        premium: 0,
        tradeCount: 0,
        ccPremium: 0,
        cspPremium: 0,
      };

      existing.premium += trade.premium;
      existing.tradeCount++;
      if (trade.optionType === 'call') {
        existing.ccPremium += trade.premium;
      } else {
        existing.cspPremium += trade.premium;
      }

      monthlyMap.set(month, existing);
    }

    const monthlyBreakdown = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        premium: Math.round(m.premium * 100) / 100,
        ccPremium: Math.round(m.ccPremium * 100) / 100,
        cspPremium: Math.round(m.cspPremium * 100) / 100,
      }));

    // =========================================================================
    // Weekly Breakdown
    // =========================================================================

    const weeklyMap = new Map<string, WeeklyBreakdown>();

    for (const trade of trades) {
      const { week, weekLabel } = getISOWeek(trade.closeDate);
      const existing = weeklyMap.get(week) || {
        week,
        weekLabel,
        premium: 0,
        tradeCount: 0,
        ccPremium: 0,
        cspPremium: 0,
      };

      existing.premium += trade.premium;
      existing.tradeCount++;
      if (trade.optionType === 'call') {
        existing.ccPremium += trade.premium;
      } else {
        existing.cspPremium += trade.premium;
      }

      weeklyMap.set(week, existing);
    }

    const weeklyBreakdown = Array.from(weeklyMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map(w => ({
        ...w,
        premium: Math.round(w.premium * 100) / 100,
        ccPremium: Math.round(w.ccPremium * 100) / 100,
        cspPremium: Math.round(w.cspPremium * 100) / 100,
      }));

    // =========================================================================
    // Active Positions
    // =========================================================================

    const activePositions = openPositions.map(p => {
      const strike = p.strike?.toNumber() || 0;
      const qty = Math.abs(p.quantity.toNumber());
      const premium = Math.abs(p.costBasis.toNumber());
      const dte = p.expiration ? calculateDTE(p.expiration) : 0;
      const collateral = strike * 100 * qty;

      return {
        id: p.id,
        ledgerEventId: p.ledgerLinks[0]?.openEventId ?? null,
        optionType: p.optionType as 'call' | 'put',
        strategy: p.optionType === 'call' ? 'covered_call' : 'cash_secured_put',
        strike,
        expiration: p.expiration?.toISOString().split('T')[0] || '',
        dte,
        quantity: qty,
        premium: Math.round(premium * 100) / 100,
        collateral: Math.round(collateral * 100) / 100,
        entryDate: p.firstEntryDate.toISOString().split('T')[0],
      };
    });

    // =========================================================================
    // Simulator Data
    // =========================================================================

    // Calculate averages for simulator
    const ccWithStrike = ccTrades.filter(t => t.strike > 0);
    const cspWithStrike = cspTrades.filter(t => t.strike > 0);

    // Premium as % of strike (approximation of yield)
    const avgCCPremiumPct = ccWithStrike.length > 0
      ? ccWithStrike.reduce((sum, t) => sum + (t.premium / (t.strike * 100 * t.quantity)) * 100, 0) / ccWithStrike.length
      : 0;

    const avgCSPPremiumPct = cspWithStrike.length > 0
      ? cspWithStrike.reduce((sum, t) => sum + (t.premium / (t.strike * 100 * t.quantity)) * 100, 0) / cspWithStrike.length
      : 0;

    // Premium by DTE range
    const dteRanges = [
      { label: '0-7 DTE', min: 0, max: 7 },
      { label: '8-14 DTE', min: 8, max: 14 },
      { label: '15-30 DTE', min: 15, max: 30 },
      { label: '31-45 DTE', min: 31, max: 45 },
      { label: '45+ DTE', min: 46, max: Infinity },
    ];

    const premiumByDTE = dteRanges.map(range => {
      const rangeTrades = trades.filter(t => t.daysHeld >= range.min && t.daysHeld <= range.max);
      const avgPremiumPct = rangeTrades.length > 0
        ? rangeTrades.reduce((sum, t) => {
            if (t.strike <= 0) return sum;
            return sum + (t.premium / (t.strike * 100 * t.quantity)) * 100;
          }, 0) / rangeTrades.length
        : 0;

      return {
        dteRange: range.label,
        avgPremiumPct: Math.round(avgPremiumPct * 100) / 100,
        tradeCount: rangeTrades.length,
      };
    });

    // Cost basis evolution if holding stock
    const stockBuyHistoryPoints: StockBuyHistoryPoint[] = stockBuyHistory.map((event) => {
      const quantity = Math.abs(event.quantity.toNumber());
      const amount = Math.abs(event.amount?.toNumber() ?? 0);
      const price = Math.abs(event.price?.toNumber() ?? 0);
      const notional = amount > 0 ? amount : quantity * price;
      return {
        quantity,
        amount: notional,
        price,
      };
    });
    const totalContractShares = trades.reduce((sum, t) => sum + (t.quantity * 100), 0);

    const costBasisEvolution = calculateWheelCostBasisEvolution({
      stockPosition,
      totalWheelPremium: totalPremium,
      totalContractShares,
      stockBuyHistory: stockBuyHistoryPoints,
    });

    // =========================================================================
    // Weekly Return Insights - Rebased to Current Price
    // =========================================================================

    // Fetch current stock price from BrokerPosition (if user owns the stock)
    const brokerPositionWhere: Prisma.BrokerPositionWhereInput = {
      userId,
      symbol,
      positionType: 'stock',
    };
    if (brokerageAccountId) {
      brokerPositionWhere.brokerageAccountId = brokerageAccountId;
    }

    const brokerStockPositions = await prisma.brokerPosition.findMany({
      where: brokerPositionWhere,
      select: {
        marketPrice: true,
        marketValue: true,
        quantity: true,
        lastSyncAt: true,
      },
    });

    const brokerSharesOwned = brokerStockPositions.reduce(
      (sum, position) => sum + Math.abs(position.quantity.toNumber()),
      0
    );
    const brokerMarketValueFromPrice = brokerStockPositions.reduce((sum, position) => {
      if (!position.marketPrice) return sum;
      return sum + (Math.abs(position.quantity.toNumber()) * Math.abs(position.marketPrice.toNumber()));
    }, 0);
    const brokerMarketValueFromValueField = brokerStockPositions.reduce((sum, position) => {
      if (!position.marketValue) return sum;
      return sum + Math.abs(position.marketValue.toNumber());
    }, 0);
    const brokerLatestSyncAt = brokerStockPositions.reduce<Date | null>((latest, position) => {
      if (!latest || position.lastSyncAt > latest) return position.lastSyncAt;
      return latest;
    }, null);
    const aggregatedCurrentPrice = brokerSharesOwned > 0
      ? (brokerMarketValueFromPrice > 0
          ? brokerMarketValueFromPrice / brokerSharesOwned
          : brokerMarketValueFromValueField / brokerSharesOwned)
      : 0;

    // Calculate weekly return insights only if we have current price data
    let weeklyReturnInsights = null;
    if (aggregatedCurrentPrice > 0 && brokerLatestSyncAt) {
      const currentPrice = aggregatedCurrentPrice;
      const sharesOwned = brokerSharesOwned;
      const lastPriceUpdate = brokerLatestSyncAt;

      // Calculate rebased weekly returns for each trade
      // Weekly Return = (premium / (currentPrice * 100 * quantity)) * (7 / daysHeld) * 100
      const ccTradesWithReturn = ccTrades.filter(t => t.daysHeld > 0 && t.quantity > 0);
      const cspTradesWithReturn = cspTrades.filter(t => t.daysHeld > 0 && t.quantity > 0);

      // Calculate CC weekly returns
      let ccTotalWeightedReturn = 0;
      let ccTotalPremium = 0;
      for (const t of ccTradesWithReturn) {
        const collateralAtCurrentPrice = currentPrice * 100 * t.quantity;
        const yieldPct = (t.premium / collateralAtCurrentPrice) * 100;
        const weeklyReturn = yieldPct * (7 / t.daysHeld);
        ccTotalWeightedReturn += weeklyReturn * t.premium;
        ccTotalPremium += t.premium;
      }
      const avgCCWeeklyReturn = ccTotalPremium > 0 ? ccTotalWeightedReturn / ccTotalPremium : 0;

      // Calculate CSP weekly returns
      let cspTotalWeightedReturn = 0;
      let cspTotalPremium = 0;
      for (const t of cspTradesWithReturn) {
        const collateralAtCurrentPrice = currentPrice * 100 * t.quantity;
        const yieldPct = (t.premium / collateralAtCurrentPrice) * 100;
        const weeklyReturn = yieldPct * (7 / t.daysHeld);
        cspTotalWeightedReturn += weeklyReturn * t.premium;
        cspTotalPremium += t.premium;
      }
      const avgCSPWeeklyReturn = cspTotalPremium > 0 ? cspTotalWeightedReturn / cspTotalPremium : 0;

      // Calculate combined average (weighted by total premium)
      const totalPremiumForCalc = ccTotalPremium + cspTotalPremium;
      const avgTotalWeeklyReturn = totalPremiumForCalc > 0
        ? (ccTotalWeightedReturn + cspTotalWeightedReturn) / totalPremiumForCalc
        : 0;

      // Annualized projections (52 weeks)
      const annualizedCCReturn = avgCCWeeklyReturn * 52;
      const annualizedCSPReturn = avgCSPWeeklyReturn * 52;
      const annualizedTotalReturn = avgTotalWeeklyReturn * 52;

      weeklyReturnInsights = {
        currentPrice: Math.round(currentPrice * 100) / 100,
        sharesOwned: Math.round(sharesOwned * 1000) / 1000, // Handle fractional shares
        lastPriceUpdate: lastPriceUpdate.toISOString(),
        ccWeeklyReturn: Math.round(avgCCWeeklyReturn * 1000) / 1000,
        cspWeeklyReturn: Math.round(avgCSPWeeklyReturn * 1000) / 1000,
        totalWeeklyReturn: Math.round(avgTotalWeeklyReturn * 1000) / 1000,
        annualizedCCReturn: Math.round(annualizedCCReturn * 100) / 100,
        annualizedCSPReturn: Math.round(annualizedCSPReturn * 100) / 100,
        annualizedTotalReturn: Math.round(annualizedTotalReturn * 100) / 100,
        ccTradeCount: ccTradesWithReturn.length,
        cspTradeCount: cspTradesWithReturn.length,
        avgDTEUsed: avgDTE,
      };
    }

    const simulatorData: SimulatorData = {
      avgCCPremiumPct: Math.round(avgCCPremiumPct * 100) / 100,
      avgCSPPremiumPct: Math.round(avgCSPPremiumPct * 100) / 100,
      avgDTEAtOpen: Math.round(avgDTE * 10) / 10,
      avgDaysHeld: Math.round(avgDTE * 10) / 10,
      assignmentRate: Math.round(assignmentRate * 100) / 100,
      premiumByDTE,
      strikeDistancePerformance: [], // Would need underlying price history
    };

    // =========================================================================
    // Playbook (synthesized optimal parameters)
    // =========================================================================

    const playbook = computePlaybook(tradesWithUnderlying, ccTrades, cspTrades, strikeStats);

    // =========================================================================
    // Strike Distance Analysis
    // =========================================================================

    const strikeDistanceAnalysis = computeStrikeDistanceAnalysis(tradesWithUnderlying);

    // =========================================================================
    // Baghold Recovery Tracker
    // =========================================================================

    let bagholdRecovery: BagholdRecoveryData | null = null;
    if (stockPosition && aggregatedCurrentPrice > 0) {
      const cspAssignments = tradesWithUnderlying
        .filter(t => t.optionType === 'put' && t.closeReason === 'assigned')
        .sort((a, b) => b.closeDate.localeCompare(a.closeDate));

      if (cspAssignments.length > 0) {
        const lastAssignment = cspAssignments[0];
        const assignmentPrice = lastAssignment.strike;

        if (aggregatedCurrentPrice < assignmentPrice) {
          const shares = stockPosition.shares;
          const unrealizedLoss = (aggregatedCurrentPrice - assignmentPrice) * shares;
          const ccAfterAssignment = ccTrades.filter(t => t.closeDate > lastAssignment.closeDate);
          const ccPremiumSinceAssignment = ccAfterAssignment.reduce((sum, t) => sum + t.premium, 0);
          const totalLoss = Math.abs(unrealizedLoss);
          const recovered = ccPremiumSinceAssignment;
          const remaining = Math.max(0, totalLoss - recovered);
          const progress = totalLoss > 0 ? Math.min(100, (recovered / totalLoss) * 100) : 0;

          // Calculate avg weekly CC premium rate for projection
          const weeksSinceAssignment = Math.max(1, daysBetween(
            new Date(lastAssignment.closeDate), new Date()
          ) / 7);
          const avgWeeklyCCPremium = ccPremiumSinceAssignment / weeksSinceAssignment;
          const projectedWeeks = avgWeeklyCCPremium > 0 ? Math.ceil(remaining / avgWeeklyCCPremium) : null;

          bagholdRecovery = {
            assignmentPrice: Math.round(assignmentPrice * 100) / 100,
            assignmentDate: lastAssignment.closeDate,
            currentPrice: Math.round(aggregatedCurrentPrice * 100) / 100,
            shares,
            unrealizedLoss: Math.round(unrealizedLoss * 100) / 100,
            ccPremiumSinceAssignment: Math.round(ccPremiumSinceAssignment * 100) / 100,
            ccTradesSinceAssignment: ccAfterAssignment.length,
            remainingToBreakeven: Math.round(remaining * 100) / 100,
            recoveryProgress: Math.round(progress * 10) / 10,
            avgWeeklyCCPremium: Math.round(avgWeeklyCCPremium * 100) / 100,
            projectedWeeksToBreakeven: projectedWeeks,
          };
        }
      }
    }

    // =========================================================================
    // Strike × DTE Heatmap
    // =========================================================================

    const strikeHeatmap = computeStrikeHeatmap(trades);

    // =========================================================================
    // Concentration Risk
    // =========================================================================

    const openCspCollateral = activePositions
      .filter(p => p.optionType === 'put')
      .reduce((sum, p) => sum + p.collateral, 0);
    const totalCollateralAtRisk = activePositions.reduce((sum, p) => sum + p.collateral, 0);

    const totalBuyingPower = brokerBalances.reduce((sum, b) => {
      const bp = b.buyingPower?.toNumber?.() ?? (typeof b.buyingPower === 'number' ? b.buyingPower : null);
      return bp != null ? sum + bp : sum;
    }, 0);
    const hasBuyingPower = brokerBalances.length > 0 && totalBuyingPower > 0;

    const currentYear = new Date().getFullYear();
    const ytdPremiumCollected = trades
      .filter(t => new Date(t.closeDate).getFullYear() === currentYear)
      .reduce((sum, t) => sum + t.premium, 0);

    // Max pain: if all open CSPs assigned at current price
    let maxPainLoss = 0;
    const openCsps = activePositions.filter(p => p.optionType === 'put');
    for (const csp of openCsps) {
      if (aggregatedCurrentPrice > 0 && aggregatedCurrentPrice < csp.strike) {
        maxPainLoss += (csp.strike - aggregatedCurrentPrice) * 100 * csp.quantity;
      }
    }

    const concentrationRisk: ConcentrationRiskData = {
      openCspCollateral: Math.round(openCspCollateral * 100) / 100,
      totalCollateralAtRisk: Math.round(totalCollateralAtRisk * 100) / 100,
      buyingPower: hasBuyingPower ? Math.round(totalBuyingPower * 100) / 100 : null,
      collateralUtilization: hasBuyingPower && totalBuyingPower > 0
        ? Math.round((totalCollateralAtRisk / totalBuyingPower) * 100 * 10) / 10
        : null,
      ytdPremiumCollected: Math.round(ytdPremiumCollected * 100) / 100,
      premiumBufferPct: totalCollateralAtRisk > 0
        ? Math.round((ytdPremiumCollected / totalCollateralAtRisk) * 100 * 10) / 10
        : 0,
      maxPainLoss: Math.round(maxPainLoss * 100) / 100,
      maxPainDescription: openCsps.length > 0
        ? `If all ${openCsps.length} CSP${openCsps.length > 1 ? 's' : ''} assigned at current price`
        : 'No open CSP positions',
    };

    // =========================================================================
    // Timeline Data (all trades chronologically)
    // =========================================================================

    const timeline = [...trades]
      .sort((a, b) => a.openDate.localeCompare(b.openDate))
      .map(t => ({
        ...t,
        premium: Math.round(t.premium * 100) / 100,
        openPrice: Math.round(t.openPrice * 100) / 100,
        closePrice: Math.round(t.closePrice * 100) / 100,
      }));

    log.info({
      userId,
      symbol,
      totalTrades: trades.length,
    }, 'Ticker wheel insights fetched');

    return apiJson({
      data: {
        symbol,

        // Summary
        summary: {
          totalTrades: trades.length,
          ccTrades: ccTrades.length,
          cspTrades: cspTrades.length,
          totalPremium: Math.round(totalPremium * 100) / 100,
          ccPremium: Math.round(ccPremium * 100) / 100,
          cspPremium: Math.round(cspPremium * 100) / 100,
          winRate: Math.round(winRate * 100) / 100,
          assignments,
          expirations,
          earlyCloses,
          assignmentRate: Math.round(assignmentRate * 100) / 100,
          avgDTE: Math.round(avgDTE * 10) / 10,
          avgPremium: Math.round(avgPremium * 100) / 100,
          firstTradeDate: trades.length > 0 ? trades[trades.length - 1].openDate : null,
          lastTradeDate: trades.length > 0 ? trades[0].closeDate : null,
        },

        // Detailed data
        strikeStats,
        monthlyBreakdown,
        weeklyBreakdown,
        activePositions,
        timeline,
        recentTrades: trades.slice(0, 10).map(t => ({
          ...t,
          premium: Math.round(t.premium * 100) / 100,
        })),

        // Cost basis tracking
        costBasisEvolution,

        // Weekly return insights (rebased to current price)
        weeklyReturnInsights,

        // Simulator
        simulatorData,

        // Single-stock features
        playbook,
        bagholdRecovery,
        strikeHeatmap,
        concentrationRisk,
        strikeDistanceAnalysis,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ errorMessage, userId, correlationId }, 'Failed to fetch ticker wheel insights');

    return apiJson(
      {
        error: 'Internal Server Error',
        message: 'Failed to fetch ticker insights',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper: Get list of traded tickers
// ============================================================================

async function getTickerList(
  userId: string,
  brokerageAccountId: string | undefined,
  log: ReturnType<typeof createRequestLogger>
) {
  log.info({ userId }, 'Fetching wheel ticker list');

  const wheelWhere: Prisma.RealizedCloseWhereInput = {
    userId,
    OR: [
      { strategy: { in: ['covered_call', 'cash_secured_put'] } },
      { side: 'short', isWheelTrade: true },
    ],
  };

  if (brokerageAccountId) {
    wheelWhere.brokerageAccountId = brokerageAccountId;
  }

  // Get all unique symbols with their stats
  const trades = await prisma.realizedClose.findMany({
    where: wheelWhere,
    select: {
      symbol: true,
      realizedPnL: true,
      optionType: true,
      closeDate: true,
    },
  });

  // Group by symbol
  const symbolMap = new Map<string, {
    premium: number;
    tradeCount: number;
    lastTradeDate: Date;
  }>();

  for (const trade of trades) {
    const existing = symbolMap.get(trade.symbol) || {
      premium: 0,
      tradeCount: 0,
      lastTradeDate: trade.closeDate,
    };

    existing.premium += trade.realizedPnL.toNumber();
    existing.tradeCount++;
    if (trade.closeDate > existing.lastTradeDate) {
      existing.lastTradeDate = trade.closeDate;
    }

    symbolMap.set(trade.symbol, existing);
  }

  const tickers = Array.from(symbolMap.entries())
    .map(([symbol, data]) => ({
      symbol,
      totalPremium: Math.round(data.premium * 100) / 100,
      tradeCount: data.tradeCount,
      lastTradeDate: formatDate(data.lastTradeDate),
    }))
    .sort((a, b) => b.totalPremium - a.totalPremium);

  return apiJson({
    data: {
      tickers,
      totalTickers: tickers.length,
    },
  });
}

