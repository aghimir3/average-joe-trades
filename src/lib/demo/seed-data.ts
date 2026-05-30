/**
 * Demo seed data for all TanStack Query keys.
 *
 * Contains realistic trading data that showcases every feature of
 * the app. Populates the QueryClient cache so existing client
 * components render without hitting any API endpoints.
 *
 * Data story:
 * - Active options trader with ~$85k across 2 accounts
 * - Robinhood: $55k main trading account
 * - Schwab IRA: $30k wheel-focused account
 * - 68% win rate, $12.5k total realized P&L
 * - 6 months of history
 */

import type { QueryClient } from '@tanstack/react-query';
import { DEMO_USER_ID, DEMO_ACCOUNTS, DEMO_SYMBOLS } from './constants';

// ---------------------------------------------------------------------------
// Date helpers (relative so demo data always looks fresh)
// ---------------------------------------------------------------------------

const now = new Date();
const today = now.toISOString().split('T')[0];

/**
 * Simple seeded PRNG (mulberry32) for deterministic "random" demo data.
 * Avoids hydration mismatches between server and client renders.
 */
function createSeededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seededRandom = createSeededRandom(42);

function daysAgo(n: number): string {
  const d = new Date(now.getTime() - n * 86_400_000);
  return d.toISOString().split('T')[0];
}

function daysFromNow(n: number): string {
  const d = new Date(now.getTime() + n * 86_400_000);
  return d.toISOString().split('T')[0];
}

function isoAgo(n: number): string {
  return new Date(now.getTime() - n * 86_400_000).toISOString();
}

function uid(suffix: string): string {
  return `00000000-0000-0000-demo-${suffix.padStart(12, '0')}`;
}

const RH = DEMO_ACCOUNTS.robinhood;
const SCH = DEMO_ACCOUNTS.schwab;

// ---------------------------------------------------------------------------
// Price History Generator (for TradingView charts)
// ---------------------------------------------------------------------------

/** Known starting prices per symbol for deterministic generation. */
const SYMBOL_PRICES: Record<string, number> = {
  AAPL: 195, TSLA: 280, NVDA: 135, SPY: 520, MSFT: 420,
  AMD: 155, AMZN: 210, META: 570, QQQ: 455, PLTR: 35, HOOD: 28,
};

/**
 * Generate deterministic OHLCV bars for a symbol over a date range.
 * Uses seededRandom to ensure the same data on every render.
 */
function generateDemoBars(symbol: string, daysBack: number) {
  const basePrice = SYMBOL_PRICES[symbol] ?? 100;
  const rng = createSeededRandom(
    // Per-symbol seed so each ticker has unique but deterministic data
    Array.from(symbol).reduce((acc, c) => acc + c.charCodeAt(0), 42)
  );
  let price = basePrice;
  const bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    // Skip weekends
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const dailyReturn = (rng() - 0.48) * 0.04; // slight upward bias
    const open = price;
    const close = +(price * (1 + dailyReturn)).toFixed(2);
    const highExtra = rng() * 0.015;
    const lowExtra = rng() * 0.015;
    const high = +Math.max(open, close, open * (1 + highExtra)).toFixed(2);
    const low = +Math.min(open, close, open * (1 - lowExtra)).toFixed(2);
    const volume = Math.round(5_000_000 + rng() * 20_000_000);

    bars.push({
      timestamp: d.toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return bars;
}

/** Pre-generate bars for all demo symbols (240 trading days ≈ ~1 year). */
const demoPriceHistoryMap = new Map<string, ReturnType<typeof generateDemoBars>>();
for (const sym of DEMO_SYMBOLS) {
  demoPriceHistoryMap.set(sym, generateDemoBars(sym, 365));
}

/**
 * Build a price history response for a symbol filtered to [start, end].
 * Returns the same shape as GET /api/market/price-history.
 */
function buildPriceHistoryResponse(symbol: string, start: string, end: string) {
  const allBars = demoPriceHistoryMap.get(symbol) ?? [];
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime() + 86_400_000; // inclusive end
  const filtered = allBars.filter((b) => {
    const t = new Date(b.timestamp).getTime();
    return t >= startMs && t < endMs;
  });
  return {
    symbol,
    interval: '1d',
    bars: filtered,
    stale: false,
    source: 'demo',
    dataAsOf: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const brokerageAccounts = [
  {
    id: RH.id,
    userId: DEMO_USER_ID,
    name: RH.name,
    broker: RH.broker,
    externalAccountId: 'demo-rh-ext-001',
    currency: 'USD',
    isActive: true,
    isDefault: true,
    createdAt: daysAgo(180),
    updatedAt: today,
    stats: {
      ledgerEventCount: 312,
      importBatchCount: 8,
      openPositionCount: 7,
      totalRealizedPnL: 8750,
    },
  },
  {
    id: SCH.id,
    userId: DEMO_USER_ID,
    name: SCH.name,
    broker: SCH.broker,
    externalAccountId: 'demo-sch-ext-001',
    currency: 'USD',
    isActive: true,
    isDefault: false,
    createdAt: daysAgo(120),
    updatedAt: today,
    stats: {
      ledgerEventCount: 145,
      importBatchCount: 3,
      openPositionCount: 4,
      totalRealizedPnL: 3750,
    },
  },
];

const snaptradeStatus = {
  configured: true,
  isConnected: true,
  connections: [
    {
      id: uid('conn01'),
      brokerageName: 'Robinhood',
      brokerageSlug: 'robinhood',
      brokerageDisplayName: 'Robinhood',
      connectionName: 'Robinhood Individual',
      createdDate: daysAgo(180),
      disabled: false,
      type: 'trade',
    },
    {
      id: uid('conn02'),
      brokerageName: 'Charles Schwab',
      brokerageSlug: 'schwab',
      brokerageDisplayName: 'Charles Schwab',
      connectionName: 'Schwab IRA',
      createdDate: daysAgo(120),
      disabled: false,
      type: 'trade',
    },
  ],
  accounts: [
    {
      id: uid('snap01'),
      name: 'Robinhood Individual',
      institutionName: 'Robinhood',
      isSynced: true,
      brokerageAccountId: RH.id,
      snaptradeSync: {
        isInitialSyncComplete: true,
        firstTransactionDate: daysAgo(180),
        lastSuccessfulSync: isoAgo(0.01),
        status: 'ready' as const,
      },
    },
    {
      id: uid('snap02'),
      name: 'Schwab IRA',
      institutionName: 'Charles Schwab',
      isSynced: true,
      brokerageAccountId: SCH.id,
      snaptradeSync: {
        isInitialSyncComplete: true,
        firstTransactionDate: daysAgo(120),
        lastSuccessfulSync: isoAgo(0.01),
        status: 'ready' as const,
      },
    },
  ],
};

const userSettings = {
  autoSyncEnabled: false,
  dashboardTourSeen: true,
  snaptrade: {
    isConnected: true,
    lastSyncAt: isoAgo(0.01),
    syncStatus: 'ready',
    syncError: null,
    connectedSince: daysAgo(180),
    linkedAccounts: [
      { id: RH.id, name: RH.name, broker: RH.broker, transactionCount: 312 },
      { id: SCH.id, name: SCH.name, broker: SCH.broker, transactionCount: 145 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Dashboard Stats (account = null → all accounts)
// ---------------------------------------------------------------------------

function makeChartData() {
  const data = [];
  let cumPnL = 0;
  for (let i = 180; i >= 0; i -= 1) {
    // Skip weekends
    const d = new Date(now.getTime() - i * 86_400_000);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const dailyPnL = Math.round((seededRandom() * 600 - 200) * 100) / 100;
    cumPnL += dailyPnL;
    const wins = dailyPnL > 0 ? 1 : 0;
    data.push({
      date: d.toISOString().split('T')[0],
      realizedPnL: dailyPnL,
      cumulativePnL: Math.round(cumPnL * 100) / 100,
      tradeCount: Math.floor(seededRandom() * 4) + 1,
      winCount: wins,
      dailyWinRate: wins * 100,
    });
  }
  // Ensure final cumulative ~$12,500
  const lastEntry = data[data.length - 1];
  const adjustment = 12500 - lastEntry.cumulativePnL;
  data.forEach((d, i) => {
    d.cumulativePnL += Math.round((adjustment * (i + 1)) / data.length);
  });
  return data;
}

const chartData = makeChartData();

const dashboardStats = {
  totalPnL: 12500,
  openPositions: 11,
  closedTrades: 156,
  winRate: 68.2,
  profitFactor: 2.15,
  avgWin: 245,
  avgLoss: -118,
  avgTradeSizeStock: 3200,
  avgTradeSizeOption: 850,
  stockTradeCount: 42,
  optionTradeCount: 114,
  totalVolumeStock: 134400,
  totalVolumeOption: 96900,
  wins: 106,
  losses: 50,
  breakeven: 0,
  chartData,
  sampleData: null,
};

// ---------------------------------------------------------------------------
// Dashboard Performance
// ---------------------------------------------------------------------------

const dashboardPerformance = {
  topPerformers: [
    { symbol: 'NVDA', totalPnL: 4250, tradeCount: 18, winRate: 78 },
    { symbol: 'AAPL', totalPnL: 3100, tradeCount: 24, winRate: 72 },
    { symbol: 'HOOD', totalPnL: 2200, tradeCount: 15, winRate: 80 },
    { symbol: 'SPY', totalPnL: 1800, tradeCount: 12, winRate: 67 },
    { symbol: 'PLTR', totalPnL: 1450, tradeCount: 20, winRate: 65 },
  ],
  needsImprovement: [
    { symbol: 'AMD', totalPnL: -320, tradeCount: 8, winRate: 38 },
    { symbol: 'TSLA', totalPnL: -180, tradeCount: 6, winRate: 50 },
  ],
  monthlyBreakdown: Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: d.toISOString().split('T')[0].slice(0, 7),
      totalPnL: Math.round(1500 + seededRandom() * 2500),
      tradeCount: Math.round(20 + seededRandom() * 10),
      wins: Math.round(14 + seededRandom() * 6),
      losses: Math.round(6 + seededRandom() * 4),
      winRate: Math.round(62 + seededRandom() * 12),
      avgTradeSizeStock: 3200,
      avgTradeSizeOption: 850,
      stockTradeCount: Math.round(5 + seededRandom() * 5),
      optionTradeCount: Math.round(12 + seededRandom() * 8),
    };
  }),
  extremeTrades: {
    biggestWins: [
      { id: uid('w1'), symbol: 'NVDA', type: 'option', pnl: 1250, date: daysAgo(12) },
      { id: uid('w2'), symbol: 'AAPL', type: 'option', pnl: 890, date: daysAgo(28) },
      { id: uid('w3'), symbol: 'HOOD', type: 'option', pnl: 720, date: daysAgo(5) },
    ],
    biggestLosses: [
      { id: uid('l1'), symbol: 'AMD', type: 'option', pnl: -450, date: daysAgo(34) },
      { id: uid('l2'), symbol: 'TSLA', type: 'stock', pnl: -380, date: daysAgo(62) },
    ],
  },
};

// ---------------------------------------------------------------------------
// Dashboard Scatter
// ---------------------------------------------------------------------------

const dashboardScatter = {
  openPositions: {
    points: [
      { id: uid('sp1'), symbol: 'AAPL', type: 'stock', avgPrice: 189.50, costBasis: 18950, entryTimestamp: new Date(daysAgo(45)).getTime() },
      { id: uid('sp2'), symbol: 'NVDA', type: 'stock', avgPrice: 132.20, costBasis: 13220, entryTimestamp: new Date(daysAgo(30)).getTime() },
      { id: uid('sp3'), symbol: 'SPY', type: 'stock', avgPrice: 545.00, costBasis: 5450, entryTimestamp: new Date(daysAgo(60)).getTime() },
      { id: uid('sp4'), symbol: 'AAPL', type: 'option', avgPrice: 3.20, costBasis: 320, entryTimestamp: new Date(daysAgo(8)).getTime() },
      { id: uid('sp5'), symbol: 'HOOD', type: 'option', avgPrice: 1.85, costBasis: 185, entryTimestamp: new Date(daysAgo(4)).getTime() },
    ],
    meta: {
      count: 5,
      priceRange: { min: 1.85, max: 545 },
      dateRange: { min: daysAgo(60), max: daysAgo(4) },
    },
  },
  closedTrades: {
    points: Array.from({ length: 30 }, (_, i) => ({
      id: uid(`ct${i}`),
      symbol: DEMO_SYMBOLS[i % DEMO_SYMBOLS.length],
      type: i % 3 === 0 ? 'stock' : 'option',
      pnl: Math.round((seededRandom() * 800 - 200) * 100) / 100,
      closeTimestamp: new Date(daysAgo(Math.floor(seededRandom() * 90))).getTime(),
      isWin: seededRandom() > 0.32,
      isLoss: seededRandom() <= 0.32,
    })),
    meta: {
      count: 30,
      pnlRange: { min: -450, max: 1250 },
      dateRange: { min: daysAgo(90), max: daysAgo(1) },
      wins: 20,
      losses: 10,
    },
  },
};

// ---------------------------------------------------------------------------
// Dashboard Positions
// ---------------------------------------------------------------------------

const dashboardPositions = {
  stocks: [
    { id: uid('ds1'), symbol: 'AAPL', side: 'long', quantity: 100, avgPrice: 189.50, costBasis: 18950, firstEntryDate: daysAgo(45) },
    { id: uid('ds2'), symbol: 'NVDA', side: 'long', quantity: 100, avgPrice: 132.20, costBasis: 13220, firstEntryDate: daysAgo(30) },
    { id: uid('ds3'), symbol: 'SPY', side: 'long', quantity: 10, avgPrice: 545.00, costBasis: 5450, firstEntryDate: daysAgo(60) },
    { id: uid('ds4'), symbol: 'MSFT', side: 'long', quantity: 25, avgPrice: 420.30, costBasis: 10507.50, firstEntryDate: daysAgo(90) },
    { id: uid('ds5'), symbol: 'PLTR', side: 'long', quantity: 200, avgPrice: 78.40, costBasis: 15680, firstEntryDate: daysAgo(75) },
  ],
  options: [
    { id: uid('do1'), symbol: 'AAPL', side: 'short', quantity: -1, avgPrice: 3.20, costBasis: -320, optionType: 'call', strike: 200, expiration: daysFromNow(18), strategy: 'covered_call', firstEntryDate: daysAgo(8) },
    { id: uid('do2'), symbol: 'HOOD', side: 'short', quantity: -2, avgPrice: 1.85, costBasis: -370, optionType: 'put', strike: 45, expiration: daysFromNow(25), strategy: 'cash_secured_put', firstEntryDate: daysAgo(4) },
    { id: uid('do3'), symbol: 'PLTR', side: 'short', quantity: -2, avgPrice: 2.10, costBasis: -420, optionType: 'call', strike: 85, expiration: daysFromNow(11), strategy: 'covered_call', firstEntryDate: daysAgo(14) },
    { id: uid('do4'), symbol: 'NVDA', side: 'long', quantity: 1, avgPrice: 5.50, costBasis: 550, optionType: 'call', strike: 140, expiration: daysFromNow(32), strategy: null, firstEntryDate: daysAgo(3) },
    { id: uid('do5'), symbol: 'AMD', side: 'short', quantity: -1, avgPrice: 1.40, costBasis: -140, optionType: 'put', strike: 145, expiration: daysFromNow(7), strategy: 'cash_secured_put', firstEntryDate: daysAgo(20) },
    { id: uid('do6'), symbol: 'SPY', side: 'long', quantity: 2, avgPrice: 4.80, costBasis: 960, optionType: 'put', strike: 530, expiration: daysFromNow(14), strategy: null, firstEntryDate: daysAgo(2) },
  ],
  futures: [],
  summary: {
    stockCount: 5,
    optionCount: 6,
    futureCount: 0,
    stockCostBasis: 63807.50,
    optionCostBasis: 260,
    futureCostBasis: 0,
    totalCostBasis: 64067.50,
  },
};

// ---------------------------------------------------------------------------
// Goals & Streaks
// ---------------------------------------------------------------------------

const dashboardGoalsPreview = {
  goals: [
    { goalType: 'weekly' as const, targetPnL: 1000, currentPnL: 780, progress: 78, isAchieved: false },
    { goalType: 'monthly' as const, targetPnL: 3500, currentPnL: 2850, progress: 81.4, isAchieved: false },
    { goalType: 'premium_weekly' as const, targetPnL: 500, currentPnL: 520, progress: 100, isAchieved: true },
    { goalType: 'premium_monthly' as const, targetPnL: 2000, currentPnL: 1680, progress: 84, isAchieved: false },
  ],
};

const dashboardStreaksPreview = {
  currentStreak: { type: 'win' as const, count: 4 },
};

const dashboardStreaks = {
  currentStreak: {
    type: 'win' as const, count: 4, startDate: daysAgo(6),
    trades: [
      { id: uid('st1'), symbol: 'AAPL', pnl: 320, date: daysAgo(6) },
      { id: uid('st2'), symbol: 'HOOD', pnl: 185, date: daysAgo(4) },
      { id: uid('st3'), symbol: 'NVDA', pnl: 420, date: daysAgo(2) },
      { id: uid('st4'), symbol: 'PLTR', pnl: 95, date: daysAgo(1) },
    ],
  },
  longestWinStreak: {
    type: 'win' as const, count: 8, startDate: daysAgo(90),
    trades: Array.from({ length: 8 }, (_, i) => ({ id: uid(`lw${i}`), symbol: ['AAPL', 'HOOD', 'NVDA', 'PLTR'][i % 4], pnl: 100 + i * 40, date: daysAgo(90 - i * 2) })),
  },
  longestLossStreak: {
    type: 'loss' as const, count: 3, startDate: daysAgo(60),
    trades: [
      { id: uid('ll1'), symbol: 'AMD', pnl: -180, date: daysAgo(60) },
      { id: uid('ll2'), symbol: 'TSLA', pnl: -220, date: daysAgo(58) },
      { id: uid('ll3'), symbol: 'SPY', pnl: -95, date: daysAgo(56) },
    ],
  },
  totalStreaks: { winStreaks: 22, lossStreaks: 14, avgWinStreakLength: 3.2, avgLossStreakLength: 1.8 },
  recentTrades: [
    { id: uid('rt1'), symbol: 'PLTR', pnl: 95, date: daysAgo(1), isWin: true },
    { id: uid('rt2'), symbol: 'NVDA', pnl: 420, date: daysAgo(2), isWin: true },
    { id: uid('rt3'), symbol: 'HOOD', pnl: 185, date: daysAgo(4), isWin: true },
    { id: uid('rt4'), symbol: 'AAPL', pnl: 320, date: daysAgo(6), isWin: true },
    { id: uid('rt5'), symbol: 'AMD', pnl: -85, date: daysAgo(8), isWin: false },
    { id: uid('rt6'), symbol: 'TSLA', pnl: 210, date: daysAgo(10), isWin: true },
    { id: uid('rt7'), symbol: 'SPY', pnl: -45, date: daysAgo(12), isWin: false },
    { id: uid('rt8'), symbol: 'AAPL', pnl: 155, date: daysAgo(14), isWin: true },
  ],
  streakMetrics: { currentStreakPnL: 1020, recoveryRate: 78, maxConsecutiveGreenDays: 12 },
};

const dashboardGoals = {
  goals: dashboardGoalsPreview.goals,
  history: {
    weekly: [
      { period: 'Week 1', target: 500, actual: 620, achieved: true },
      { period: 'Week 2', target: 500, actual: 380, achieved: false },
      { period: 'Week 3', target: 500, actual: 710, achieved: true },
      { period: 'Week 4', target: 500, actual: 540, achieved: true },
    ],
    monthly: [
      { period: 'Jan', target: 2000, actual: 2250, achieved: true },
      { period: 'Feb', target: 2000, actual: 1800, achieved: false },
    ],
    premium_weekly: [
      { period: 'Week 1', target: 300, actual: 420, achieved: true },
      { period: 'Week 2', target: 300, actual: 280, achieved: false },
      { period: 'Week 3', target: 300, actual: 350, achieved: true },
      { period: 'Week 4', target: 300, actual: 310, achieved: true },
    ],
    premium_monthly: [
      { period: 'Jan', target: 1200, actual: 1360, achieved: true },
      { period: 'Feb', target: 1200, actual: 950, achieved: false },
    ],
  },
};

// ---------------------------------------------------------------------------
// Realtime Check
// ---------------------------------------------------------------------------

const realtimeCheck = {
  hasRealTimeData: true,
  positionCount: 11,
};

const realtimePortfolio = {
  totalMarketValue: 72450,
  totalCash: 12550,
  totalBuyingPower: 20800,
  totalUnrealizedPnL: 3558,
  totalUnrealizedPnLPct: 5.16,
  realizedPnL: 12500,
  totalPnL: 16058,
  todaysChange: 482,
  todaysChangePct: 0.67,
  allocation: {
    stocks: { value: 65200, count: 5, percentage: 76.7 },
    options: { value: 7250, count: 6, percentage: 8.5 },
    futures: { value: 0, count: 0, percentage: 0 },
    cash: { value: 12550, percentage: 14.8 },
  },
  positions: [
    { symbol: 'AAPL', positionType: 'stock' as const, quantity: 100, marketPrice: 198.20, marketValue: 19820, avgCostBasis: 189.50, unrealizedPnL: 870, unrealizedPnLPct: 4.59, priceChangeAbs: 1.30, priceChangePct: 0.66 },
    { symbol: 'NVDA', positionType: 'stock' as const, quantity: 100, marketPrice: 142.80, marketValue: 14280, avgCostBasis: 132.20, unrealizedPnL: 1060, unrealizedPnLPct: 8.02, priceChangeAbs: 2.40, priceChangePct: 1.71 },
    { symbol: 'SPY', positionType: 'stock' as const, quantity: 10, marketPrice: 558.30, marketValue: 5583, avgCostBasis: 545.00, unrealizedPnL: 133, unrealizedPnLPct: 2.44, priceChangeAbs: -0.80, priceChangePct: -0.14 },
    { symbol: 'MSFT', positionType: 'stock' as const, quantity: 25, marketPrice: 432.50, marketValue: 10812.50, avgCostBasis: 420.30, unrealizedPnL: 305, unrealizedPnLPct: 2.90, priceChangeAbs: 0.90, priceChangePct: 0.21 },
    { symbol: 'PLTR', positionType: 'stock' as const, quantity: 200, marketPrice: 82.10, marketValue: 16420, avgCostBasis: 78.40, unrealizedPnL: 740, unrealizedPnLPct: 4.72, priceChangeAbs: -0.30, priceChangePct: -0.36 },
    { symbol: 'AAPL', positionType: 'option' as const, quantity: -1, marketPrice: 1.80, marketValue: -180, avgCostBasis: 3.20, unrealizedPnL: 140, unrealizedPnLPct: 43.75, priceChangeAbs: null, priceChangePct: null, optionType: 'call', strike: 200, expiration: daysFromNow(18) },
    { symbol: 'HOOD', positionType: 'option' as const, quantity: -2, marketPrice: 0.95, marketValue: -190, avgCostBasis: 1.85, unrealizedPnL: 180, unrealizedPnLPct: 48.65, priceChangeAbs: null, priceChangePct: null, optionType: 'put', strike: 45, expiration: daysFromNow(25) },
    { symbol: 'PLTR', positionType: 'option' as const, quantity: -2, marketPrice: 1.20, marketValue: -240, avgCostBasis: 2.10, unrealizedPnL: 180, unrealizedPnLPct: 42.86, priceChangeAbs: null, priceChangePct: null, optionType: 'call', strike: 85, expiration: daysFromNow(11) },
    { symbol: 'NVDA', positionType: 'option' as const, quantity: 1, marketPrice: 7.20, marketValue: 720, avgCostBasis: 5.50, unrealizedPnL: 170, unrealizedPnLPct: 30.91, priceChangeAbs: null, priceChangePct: null, optionType: 'call', strike: 140, expiration: daysFromNow(32) },
    { symbol: 'AMD', positionType: 'option' as const, quantity: -1, marketPrice: 0.60, marketValue: -60, avgCostBasis: 1.40, unrealizedPnL: 80, unrealizedPnLPct: 57.14, priceChangeAbs: null, priceChangePct: null, optionType: 'put', strike: 145, expiration: daysFromNow(7) },
    { symbol: 'SPY', positionType: 'option' as const, quantity: 2, marketPrice: 3.80, marketValue: 760, avgCostBasis: 4.80, unrealizedPnL: -200, unrealizedPnLPct: -20.83, priceChangeAbs: null, priceChangePct: null, optionType: 'put', strike: 530, expiration: daysFromNow(14) },
  ],
  lastSyncAt: isoAgo(0.01),
  positionCount: 11,
  hasRealTimeData: true,
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function makeCalendarData(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let totalPnL = 0;
  let tradingDays = 0;
  let profitDays = 0;
  let lossDays = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      return { day, date, realizedPnL: 0, tradeCount: 0, winCount: 0, lossCount: 0, winRate: 0, isProfit: false, isLoss: false, openPositionCount: 0, openPositions: [] as never[] };
    }
    const hasActivity = seededRandom() > 0.4;
    const pnl = hasActivity ? Math.round((seededRandom() * 600 - 150) * 100) / 100 : 0;
    const tradeCount = hasActivity ? Math.floor(seededRandom() * 4) + 1 : 0;
    const winCount = hasActivity ? Math.floor(seededRandom() * (tradeCount + 1)) : 0;
    const lossCount = tradeCount - winCount;
    const winRate = tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0;
    const isProfit = pnl > 0;
    const isLoss = pnl < 0;

    if (tradeCount > 0) {
      tradingDays++;
      totalTrades += tradeCount;
      totalWins += winCount;
      totalLosses += lossCount;
      totalPnL += pnl;
      if (isProfit) profitDays++;
      if (isLoss) lossDays++;
    }

    return { day, date, realizedPnL: pnl, tradeCount, winCount, lossCount, winRate, isProfit, isLoss, openPositionCount: 0, openPositions: [] as never[] };
  });

  return {
    year,
    month,
    days,
    summary: {
      totalPnL: Math.round(totalPnL * 100) / 100,
      tradingDays,
      profitDays,
      lossDays,
      totalTrades,
      totalWins,
      totalLosses,
      totalOpenPositions: 6,
      winRate: totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0,
    },
  };
}

// Pre-compute calendar at module scope so PRNG state is deterministic
const calYear = now.getFullYear();
const calMonth = now.getMonth() + 1;
const calendarData = makeCalendarData(calYear, calMonth);

// ---------------------------------------------------------------------------
// Per-day trades (for calendar day-click detail modal)
// ---------------------------------------------------------------------------

const TRADE_SYMBOLS = ['NVDA', 'AAPL', 'PLTR', 'AMD', 'HOOD', 'TSLA', 'SPY', 'MSFT'];
const TRADE_STRATEGIES = ['covered_call', 'cash_secured_put', null] as const;
const CLOSE_REASONS = ['expired', 'early_close', 'assignment', null] as const;

interface DemoTrade {
  id: string;
  ledgerEventId: string | null;
  closeEventId: string | null;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  openPrice: number;
  closePrice: number | null;
  realizedPnL: number | null;
  closeReason: string | null;
  optionType?: string | null;
  strike?: number | null;
  strategy?: string | null;
  status: 'open' | 'closed';
}

/** Generate realistic trades for a single calendar day. */
function makeDayTrades(date: string, tradeCount: number, winCount: number, totalPnl: number): DemoTrade[] {
  const trades: DemoTrade[] = [];
  const pnlPerTrade = tradeCount > 0 ? totalPnl / tradeCount : 0;

  for (let i = 0; i < tradeCount; i++) {
    const isWin = i < winCount;
    const pnl = isWin
      ? Math.round((Math.abs(pnlPerTrade) + seededRandom() * 80) * 100) / 100
      : -Math.round((Math.abs(pnlPerTrade) * 0.6 + seededRandom() * 60) * 100) / 100;
    const sym = TRADE_SYMBOLS[Math.floor(seededRandom() * TRADE_SYMBOLS.length)];
    const isOption = seededRandom() > 0.35;
    const strategy = isOption ? TRADE_STRATEGIES[Math.floor(seededRandom() * TRADE_STRATEGIES.length)] : null;
    const openPrice = isOption ? Math.round((1 + seededRandom() * 5) * 100) / 100 : Math.round((50 + seededRandom() * 150) * 100) / 100;
    const closePrice = isOption ? Math.round((openPrice + pnl / 100) * 100) / 100 : Math.round((openPrice + pnl / 1) * 100) / 100;

    trades.push({
      id: uid(`dt-${date}-${i}`),
      ledgerEventId: uid(`dle-${date}-${i}`),
      closeEventId: uid(`dce-${date}-${i}`),
      symbol: sym,
      type: isOption ? 'option' : 'stock',
      side: isOption ? 'short' : 'long',
      quantity: isOption ? Math.floor(seededRandom() * 3) + 1 : Math.floor(seededRandom() * 50) + 10,
      openPrice,
      closePrice: Math.max(0.01, closePrice),
      realizedPnL: pnl,
      closeReason: CLOSE_REASONS[Math.floor(seededRandom() * CLOSE_REASONS.length)],
      optionType: isOption ? (seededRandom() > 0.5 ? 'call' : 'put') : null,
      strike: isOption ? Math.round((openPrice * 20 + seededRandom() * 30) / 5) * 5 : null,
      strategy,
      status: 'closed',
    });
  }
  return trades;
}

/** Map of date → trades for all active calendar days. */
const dayTradesMap = new Map<string, DemoTrade[]>();
for (const day of calendarData.days) {
  if (day.tradeCount > 0) {
    dayTradesMap.set(day.date, makeDayTrades(day.date, day.tradeCount, day.winCount, day.realizedPnL));
  }
}

// ---------------------------------------------------------------------------
// Trading Calendar Seed Data (/calendar page)
// ---------------------------------------------------------------------------

function buildDemoCalendarTrades(year: number, month: number) {
  const trades: Array<{
    id: string; tradeNumber: number; closeDate: string; openDate: string;
    symbol: string; displaySymbol: string; tradeType: 'daytrade' | 'swingtrade';
    isOverridden: boolean; quantity: number; entryTotal: number; exitTotal: number;
    holdingDays: number; returnDollars: number; returnPercent: number; isWin: boolean;
    closeType: string; optionType: string | null; strike: number | null; expiration: string | null;
  }> = [];

  const symbols = ['PLTR', 'TSLA', 'META', 'GOOGL', 'MU', 'HOOD', 'NVDA', 'AAPL', 'CRM', 'CAT', 'GLD', 'IBIT', 'AVAV', 'OKLO', 'GNRC'];
  const monthStr = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  let tradeNum = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends

    const numTrades = Math.floor(seededRandom() * 4);
    for (let t = 0; t < numTrades; t++) {
      tradeNum++;
      const sym = symbols[Math.floor(seededRandom() * symbols.length)];
      const isOption = seededRandom() > 0.3;
      const isDaytrade = seededRandom() > 0.5;
      const holdDays = isDaytrade ? 0 : Math.floor(seededRandom() * 5) + 1;
      const pnl = Math.round((seededRandom() * 2000 - 600) * 100) / 100;
      const entry = Math.round((500 + seededRandom() * 4000) * 100) / 100;
      const exit = Math.round((entry + pnl) * 100) / 100;
      const strike = isOption ? Math.round((100 + seededRandom() * 500) / 5) * 5 : null;
      const optType = isOption ? (seededRandom() > 0.4 ? 'call' : 'put') : null;
      const expMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][Math.floor(seededRandom() * 6)];
      const expDate = isOption ? `${year}-${monthStr}-${String(Math.min(d + 14, 28)).padStart(2, '0')}` : null;
      const closeDate = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
      const openDay = Math.max(1, d - holdDays);
      const openDate = `${year}-${monthStr}-${String(openDay).padStart(2, '0')}`;
      const displaySymbol = isOption ? `${sym} ${expMonth} ${strike} ${optType === 'call' ? 'Call' : 'Put'}` : sym;

      trades.push({
        id: uid(`ct-${d}-${t}`),
        tradeNumber: tradeNum,
        closeDate, openDate,
        symbol: sym, displaySymbol,
        tradeType: isDaytrade ? 'daytrade' : 'swingtrade',
        isOverridden: false,
        quantity: isOption ? Math.floor(seededRandom() * 5) + 1 : Math.floor(seededRandom() * 50) + 5,
        entryTotal: Math.abs(entry), exitTotal: Math.abs(exit),
        holdingDays: holdDays,
        returnDollars: pnl,
        returnPercent: Math.round((pnl / Math.abs(entry)) * 10000) / 100,
        isWin: pnl > 0,
        closeType: isOption ? 'option' : 'stock',
        optionType: optType, strike, expiration: expDate,
      });
    }
  }

  const wins = trades.filter(t => t.isWin).length;
  const losses = trades.filter(t => !t.isWin).length;
  const totalPnL = Math.round(trades.reduce((s, t) => s + t.returnDollars, 0) * 100) / 100;

  return {
    trades,
    pagination: { total: trades.length, limit: 50, offset: 0, hasMore: false },
    monthSummary: {
      totalPnL,
      totalTrades: trades.length,
      wins, losses,
      winRate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
      daytradeCount: trades.filter(t => t.tradeType === 'daytrade').length,
      swingtradeCount: trades.filter(t => t.tradeType === 'swingtrade').length,
    },
  };
}

function buildDemoCalendarDailyDetail(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');
  const symbols = ['TSLA', 'PLTR', 'META', 'MU', 'GOOGL', 'HOOD', 'CRM', 'CAT', 'GLD', 'IBIT', 'AVAV', 'GNRC'];

  const days: Array<{
    date: string; day: number;
    tickers: Array<{ symbol: string; pnl: number; tradeType: 'daytrade' | 'swingtrade' }>;
    dailyTotal: number; tradeCount: number; winCount: number; lossCount: number;
    daytradePnL: number; swingtradePnL: number;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;

    const numTickers = Math.floor(seededRandom() * 5);
    if (numTickers === 0) continue;

    const tickers: Array<{ symbol: string; pnl: number; tradeType: 'daytrade' | 'swingtrade' }> = [];
    let dailyTotal = 0; let winCount = 0; let lossCount = 0;
    let daytradePnL = 0; let swingtradePnL = 0;

    for (let t = 0; t < numTickers; t++) {
      const sym = symbols[Math.floor(seededRandom() * symbols.length)];
      const pnl = Math.round((seededRandom() * 1600 - 500) * 100) / 100;
      const tradeType: 'daytrade' | 'swingtrade' = seededRandom() > 0.5 ? 'daytrade' : 'swingtrade';
      tickers.push({ symbol: sym, pnl, tradeType });
      dailyTotal += pnl;
      if (pnl > 0) winCount++; else lossCount++;
      if (tradeType === 'daytrade') daytradePnL += pnl; else swingtradePnL += pnl;
    }

    days.push({
      date: `${year}-${monthStr}-${String(d).padStart(2, '0')}`,
      day: d, tickers,
      dailyTotal: Math.round(dailyTotal * 100) / 100,
      tradeCount: numTickers, winCount, lossCount,
      daytradePnL: Math.round(daytradePnL * 100) / 100,
      swingtradePnL: Math.round(swingtradePnL * 100) / 100,
    });
  }

  // Compute weekly summaries
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const firstSunday = new Date(firstDay);
  firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay());

  const weekSummaries: Array<{
    weekNumber: number; weekStart: string; weekEnd: string;
    totalPnL: number; runningTotal: number; daytradePnL: number; swingtradePnL: number;
    tradeCount: number; winCount: number; lossCount: number; winRate: number;
  }> = [];

  let weekNum = 1;
  let runningTotal = 0;
  const curr = new Date(firstSunday);

  while (curr <= lastDay) {
    const wStart = curr.toISOString().split('T')[0];
    const wEnd = new Date(curr.getTime() + 6 * 86_400_000).toISOString().split('T')[0];

    let tp = 0; let dtp = 0; let stp = 0; let tc = 0; let wc = 0; let lc = 0;
    for (const day of days) {
      if (day.date >= wStart && day.date <= wEnd) {
        tp += day.dailyTotal; dtp += day.daytradePnL; stp += day.swingtradePnL;
        tc += day.tradeCount; wc += day.winCount; lc += day.lossCount;
      }
    }

    runningTotal += tp;
    weekSummaries.push({
      weekNumber: weekNum, weekStart: wStart, weekEnd: wEnd,
      totalPnL: Math.round(tp * 100) / 100, runningTotal: Math.round(runningTotal * 100) / 100,
      daytradePnL: Math.round(dtp * 100) / 100, swingtradePnL: Math.round(stp * 100) / 100,
      tradeCount: tc, winCount: wc, lossCount: lc,
      winRate: tc > 0 ? Math.round((wc / tc) * 100) : 0,
    });
    weekNum++;
    curr.setUTCDate(curr.getUTCDate() + 7);
  }

  return { days, weekSummaries };
}

// ---------------------------------------------------------------------------
// Recent Trades
// ---------------------------------------------------------------------------

const recentTrades = {
  data: [
    { id: uid('rt1'), ledgerEventId: uid('le1'), closeEventId: uid('ce1'), brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: 'robinhood', symbol: 'NVDA', type: 'option', side: 'short', quantity: 1, openDate: daysAgo(18), closeDate: daysAgo(2), openPrice: 4.50, closePrice: 0.15, costBasis: -450, realizedPnL: 435, closeReason: 'expired', optionType: 'call', strike: 145, expiration: daysAgo(2), strategy: 'covered_call', status: 'closed' as const, isWin: true, isLoss: false },
    { id: uid('rt2'), ledgerEventId: uid('le2'), closeEventId: uid('ce2'), brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: 'robinhood', symbol: 'HOOD', type: 'option', side: 'short', quantity: 2, openDate: daysAgo(30), closeDate: daysAgo(5), openPrice: 2.10, closePrice: 0.30, costBasis: -420, realizedPnL: 360, closeReason: 'expired', optionType: 'put', strike: 42, expiration: daysAgo(5), strategy: 'cash_secured_put', status: 'closed' as const, isWin: true, isLoss: false },
    { id: uid('rt3'), ledgerEventId: uid('le3'), closeEventId: uid('ce3'), brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, broker: 'schwab', symbol: 'AAPL', type: 'option', side: 'short', quantity: 1, openDate: daysAgo(22), closeDate: daysAgo(3), openPrice: 3.80, closePrice: 0.50, costBasis: -380, realizedPnL: 330, closeReason: 'early_close', optionType: 'call', strike: 195, expiration: daysAgo(1), strategy: 'covered_call', status: 'closed' as const, isWin: true, isLoss: false },
    { id: uid('rt4'), ledgerEventId: uid('le4'), closeEventId: uid('ce4'), brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: 'robinhood', symbol: 'PLTR', type: 'stock', side: 'long', quantity: 50, openDate: daysAgo(40), closeDate: daysAgo(7), openPrice: 72.50, closePrice: 79.80, costBasis: 3625, realizedPnL: 365, closeReason: null, optionType: null, strike: null, expiration: null, strategy: null, status: 'closed' as const, isWin: true, isLoss: false },
    { id: uid('rt5'), ledgerEventId: uid('le5'), closeEventId: uid('ce5'), brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: 'robinhood', symbol: 'AMD', type: 'option', side: 'short', quantity: 1, openDate: daysAgo(35), closeDate: daysAgo(10), openPrice: 1.80, closePrice: 2.90, costBasis: -180, realizedPnL: -110, closeReason: 'assignment', optionType: 'put', strike: 150, expiration: daysAgo(10), strategy: 'cash_secured_put', status: 'closed' as const, isWin: false, isLoss: true },
  ],
  pagination: { total: 156, totalOpen: 11, totalClosed: 145, limit: 10, offset: 0, hasMore: true },
};

// ---------------------------------------------------------------------------
// Unified Positions (Positions page)
// ---------------------------------------------------------------------------

const unifiedPositions = {
  positions: [
    { id: uid('up1'), symbol: 'AAPL', positionType: 'stock' as const, quantity: 100, avgCostBasis: 189.50, marketPrice: 198.20, marketValue: 19820, unrealizedPnL: 870, unrealizedPnLPct: 4.59, priceChangeAbs: 1.30, priceChangePct: 0.66, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up2'), symbol: 'NVDA', positionType: 'stock' as const, quantity: 100, avgCostBasis: 132.20, marketPrice: 142.80, marketValue: 14280, unrealizedPnL: 1060, unrealizedPnLPct: 8.02, priceChangeAbs: 2.40, priceChangePct: 1.71, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up3'), symbol: 'SPY', positionType: 'stock' as const, quantity: 10, avgCostBasis: 545.00, marketPrice: 558.30, marketValue: 5583, unrealizedPnL: 133, unrealizedPnLPct: 2.44, priceChangeAbs: -0.80, priceChangePct: -0.14, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up4'), symbol: 'MSFT', positionType: 'stock' as const, quantity: 25, avgCostBasis: 420.30, marketPrice: 432.50, marketValue: 10812.50, unrealizedPnL: 305, unrealizedPnLPct: 2.90, priceChangeAbs: 0.90, priceChangePct: 0.21, dataSource: 'snaptrade' as const, brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, broker: SCH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up5'), symbol: 'PLTR', positionType: 'stock' as const, quantity: 200, avgCostBasis: 78.40, marketPrice: 82.10, marketValue: 16420, unrealizedPnL: 740, unrealizedPnLPct: 4.72, priceChangeAbs: -0.30, priceChangePct: -0.36, dataSource: 'snaptrade' as const, brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, broker: SCH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up6'), symbol: 'AAPL', positionType: 'option' as const, quantity: -1, avgCostBasis: 320, optionType: 'call' as const, strike: 200, expiration: daysFromNow(18), marketPrice: 1.80, marketValue: -180, unrealizedPnL: 140, unrealizedPnLPct: 43.75, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up7'), symbol: 'HOOD', positionType: 'option' as const, quantity: -2, avgCostBasis: 370, optionType: 'put' as const, strike: 45, expiration: daysFromNow(25), marketPrice: 0.95, marketValue: -190, unrealizedPnL: 180, unrealizedPnLPct: 48.65, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up8'), symbol: 'PLTR', positionType: 'option' as const, quantity: -2, avgCostBasis: 420, optionType: 'call' as const, strike: 85, expiration: daysFromNow(11), marketPrice: 1.20, marketValue: -240, unrealizedPnL: 180, unrealizedPnLPct: 42.86, dataSource: 'snaptrade' as const, brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, broker: SCH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up9'), symbol: 'NVDA', positionType: 'option' as const, quantity: 1, avgCostBasis: 550, optionType: 'call' as const, strike: 140, expiration: daysFromNow(32), marketPrice: 7.20, marketValue: 720, unrealizedPnL: 170, unrealizedPnLPct: 30.91, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up10'), symbol: 'AMD', positionType: 'option' as const, quantity: -1, avgCostBasis: 140, optionType: 'put' as const, strike: 145, expiration: daysFromNow(7), marketPrice: 0.60, marketValue: -60, unrealizedPnL: 80, unrealizedPnLPct: 57.14, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
    { id: uid('up11'), symbol: 'SPY', positionType: 'option' as const, quantity: 2, avgCostBasis: 960, optionType: 'put' as const, strike: 530, expiration: daysFromNow(14), marketPrice: 3.80, marketValue: 760, unrealizedPnL: -200, unrealizedPnLPct: -20.83, dataSource: 'snaptrade' as const, brokerageAccountId: RH.id, brokerageAccountName: RH.name, broker: RH.broker, lastSyncAt: isoAgo(0.01), isStale: false },
  ],
  balances: [
    { brokerageAccountId: RH.id, brokerageAccountName: RH.name, currency: 'USD', cash: 8250, buyingPower: 16500, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, currency: 'USD', cash: 4300, buyingPower: 4300, lastSyncAt: isoAgo(0.01) },
  ],
  returnRates: [
    { brokerageAccountId: RH.id, brokerageAccountName: RH.name, timeframe: '1M', returnPercent: 3.2, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: RH.id, brokerageAccountName: RH.name, timeframe: '3M', returnPercent: 8.5, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: RH.id, brokerageAccountName: RH.name, timeframe: '6M', returnPercent: 15.8, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, timeframe: '1M', returnPercent: 2.1, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, timeframe: '3M', returnPercent: 6.4, lastSyncAt: isoAgo(0.01) },
    { brokerageAccountId: SCH.id, brokerageAccountName: SCH.name, timeframe: '6M', returnPercent: 12.5, lastSyncAt: isoAgo(0.01) },
  ],
  stablecoinHoldings: [],
  summary: {
    totalPositions: 11,
    stockPositions: 5,
    optionPositions: 6,
    futurePositions: 0,
    cryptoPositions: 0,
    totalMarketValue: 67965.50,
    totalUnrealizedPnL: 3558,
    totalCash: 12550,
    totalBuyingPower: 20800,
    totalStablecoinBalance: 0,
    needsRefresh: false,
  },
};

// ---------------------------------------------------------------------------
// AI Insights
// ---------------------------------------------------------------------------

const aiUnified = {
  totalModelsActive: 4,
  totalModelsPossible: 5,
  overallConfidence: 'high' as const,
  pendingActions: 3,
  lastUpdated: isoAgo(0.05),
  urgentMessage: null,
  topOpportunity: { symbol: 'HOOD', score: 87 },
  wheelModelsReady: true,
  optionsModelsReady: true,
  communityModelReady: true,
  stockModelsReady: true,
  quantModelsReady: false,
};

const aiActions = {
  actions: [
    {
      id: uid('act1'),
      type: 'wheel_opportunity' as const,
      priority: 'high' as const,
      confidence: 87,
      symbol: 'HOOD',
      title: 'Sell CSP on HOOD - High premium opportunity',
      description: 'HOOD has elevated IV after earnings. Premium is 2.3x the 30-day average for 30 DTE puts.',
      reasoning: ['IV percentile at 82%', 'Strong support at $44', 'Community win rate 78% on similar setups'],
      source: 'wheel_ml' as const,
      confidenceBand: 'high' as const,
      expectedValuePct: 3.2,
      metadata: {
        strike: 44,
        strategy: 'cash_secured_put',
        potentialCredit: 185,
        similarTradesCount: 42,
        similarTradesWinRate: 78,
      },
      suggestedAction: { action: 'Sell 1x HOOD $44P', details: '30 DTE, ~$1.85 credit per contract' },
    },
    {
      id: uid('act2'),
      type: 'roll' as const,
      priority: 'medium' as const,
      confidence: 74,
      symbol: 'PLTR',
      title: 'Consider rolling PLTR $85C',
      description: 'PLTR covered call is approaching expiration with 11 DTE. Stock is near strike — rolling out preserves premium income.',
      reasoning: ['11 DTE remaining', 'Stock at $82.10 (96.6% of strike)', 'Can collect $1.40 net credit rolling to next month'],
      source: 'wheel_ml' as const,
      confidenceBand: 'medium' as const,
      metadata: { daysToExpiration: 11, currentPnlPercent: 42.8, strike: 85, strategy: 'covered_call', potentialCredit: 140 },
      suggestedAction: { action: 'Roll to next month $87C', details: 'Net credit ~$1.40, extends 30 days' },
    },
    {
      id: uid('act3'),
      type: 'premium_opportunity' as const,
      priority: 'medium' as const,
      confidence: 71,
      symbol: 'AAPL',
      title: 'Write covered call on AAPL shares',
      description: 'Your AAPL covered call expires in 18 days. Consider writing a new CC at $205 strike for next expiration.',
      reasoning: ['Currently holding 100 shares at $189.50', 'Current CC at $200 already at 56% profit', 'Can roll up and out for additional credit'],
      source: 'options_ml' as const,
      confidenceBand: 'medium' as const,
      metadata: { daysToExpiration: 18, currentPnlPercent: 43.75, strike: 200, strategy: 'covered_call' },
    },
  ],
  totalCount: 3,
  highPriorityCount: 1,
  lastUpdated: isoAgo(0.05),
};

// ---------------------------------------------------------------------------
// ML Status
// ---------------------------------------------------------------------------

const wheelMLStatus = {
  status: {
    modelInfo: {
      candidateRankerVersion: 3,
      strikeOptimizerVersion: 2,
      rollAdvisorVersion: 2,
      lastTrainedAt: daysAgo(3),
    },
    dataStats: { totalWheelTrades: 89, uniqueSymbols: 8 },
  },
};

const optionsMLStatus = {
  modelInfo: {
    volatilityRegimeVersion: 2,
    entryTimingVersion: 1,
    exitStrategyVersion: 1,
    strategyClassifierVersion: 1,
    riskAnalyzerVersion: 1,
    tradeEmbedderVersion: 1,
    lastTrainedAt: daysAgo(5),
  },
  dataStats: { totalTrades: 114 },
};

const stockMLStatus = {
  ready: true,
  lastUpdated: daysAgo(2),
  tradeCount: 42,
  minTradesRequired: 30,
  calibrationScore: 0.72,
};

const quantModelHealth = {
  summary: { totalModels: 3, stableModels: 2, retrainRecommended: 1 },
};

const communityMLStatus = {
  status: { lastTrainedAt: daysAgo(1), totalTrades: 12450 },
};

// ---------------------------------------------------------------------------
// Strategies — Income Wheel
// ---------------------------------------------------------------------------

const incomeWheel = {
  incomeMetrics: {
    totalPremiumRealized: 8420,
    totalPremiumPending: 1250,
    totalCollateralAtRisk: 28500,
    premiumLast7Days: 520,
    premiumLast30Days: 1850,
    premiumLast90Days: 5200,
    premiumYTD: 7150,
    premium52Weeks: 8420,
    yieldOnCollateral: 4.39,
    annualizedYield: 29.5,
    weeklyAvgPremium: 323,
    monthlyAvgPremium: 1403,
    totalTrades: 89,
    winRate: 82.0,
    avgPremiumPerTrade: 94.6,
    avgDTE: 28,
    ccPremiumRealized: 4850,
    cspPremiumRealized: 3570,
    ccCount: 48,
    cspCount: 41,
  },
  activePositions: [
    { id: uid('ip1'), ledgerEventId: uid('ile1'), symbol: 'AAPL', strategy: 'covered_call' as const, strike: 200, expiration: daysFromNow(18), dte: 18, quantity: 1, premium: 320, collateral: 19820, yieldOnCollateral: 1.61, annualizedYield: 32.7, entryDate: daysAgo(8) },
    { id: uid('ip2'), ledgerEventId: uid('ile2'), symbol: 'HOOD', strategy: 'cash_secured_put' as const, strike: 45, expiration: daysFromNow(25), dte: 25, quantity: 2, premium: 370, collateral: 9000, yieldOnCollateral: 4.11, annualizedYield: 60.0, entryDate: daysAgo(4) },
    { id: uid('ip3'), ledgerEventId: uid('ile3'), symbol: 'PLTR', strategy: 'covered_call' as const, strike: 85, expiration: daysFromNow(11), dte: 11, quantity: 2, premium: 420, collateral: 16420, yieldOnCollateral: 2.56, annualizedYield: 84.9, entryDate: daysAgo(14) },
    { id: uid('ip4'), ledgerEventId: uid('ile4'), symbol: 'AMD', strategy: 'cash_secured_put' as const, strike: 145, expiration: daysFromNow(7), dte: 7, quantity: 1, premium: 140, collateral: 14500, yieldOnCollateral: 0.97, annualizedYield: 50.5, entryDate: daysAgo(20) },
  ],
  weeklyPremiumHistory: Array.from({ length: 12 }, (_, i) => {
    const ws = daysAgo((11 - i) * 7);
    const we = daysAgo((11 - i) * 7 - 6);
    return {
      weekStart: ws,
      weekEnd: we,
      premium: Math.round(250 + seededRandom() * 300),
      tradeCount: Math.floor(2 + seededRandom() * 3),
      ccPremium: Math.round(140 + seededRandom() * 150),
      cspPremium: Math.round(100 + seededRandom() * 150),
    };
  }),
  monthlyPremiumHistory: Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: d.toLocaleString('en', { month: 'short' }),
      year: d.getFullYear(),
      premium: Math.round(1100 + seededRandom() * 600),
      tradeCount: Math.floor(10 + seededRandom() * 8),
      ccPremium: Math.round(600 + seededRandom() * 300),
      cspPremium: Math.round(400 + seededRandom() * 300),
    };
  }),
  stockHoldings: [
    { symbol: 'AAPL', shares: 100, acquisitionDate: daysAgo(45), acquisitionPrice: 189.50, totalPremiumCollected: 2150, effectiveCostBasis: 168.00, currentCCStrike: 200, ccPremiumPending: 320 },
    { symbol: 'PLTR', shares: 200, acquisitionDate: daysAgo(75), acquisitionPrice: 78.40, totalPremiumCollected: 1680, effectiveCostBasis: 70.00, currentCCStrike: 85, ccPremiumPending: 420 },
  ],
  recentTrades: [
    { id: uid('iwt1'), symbol: 'NVDA', strategy: 'covered_call', strike: 145, expiration: daysAgo(2), openDate: daysAgo(18), closeDate: daysAgo(2), closeReason: 'expired', premium: 435, daysHeld: 16 },
    { id: uid('iwt2'), symbol: 'HOOD', strategy: 'cash_secured_put', strike: 42, expiration: daysAgo(5), openDate: daysAgo(30), closeDate: daysAgo(5), closeReason: 'expired', premium: 360, daysHeld: 25 },
    { id: uid('iwt3'), symbol: 'AAPL', strategy: 'covered_call', strike: 195, expiration: daysAgo(1), openDate: daysAgo(22), closeDate: daysAgo(3), closeReason: 'early_close', premium: 330, daysHeld: 19 },
  ],
  symbolPerformance: [
    { symbol: 'AAPL', premium: 2150, trades: 22, ccCount: 14, cspCount: 8, assignments: 1, avgPremium: 97.7 },
    { symbol: 'HOOD', premium: 1850, trades: 18, ccCount: 6, cspCount: 12, assignments: 0, avgPremium: 102.8 },
    { symbol: 'PLTR', premium: 1680, trades: 16, ccCount: 10, cspCount: 6, assignments: 1, avgPremium: 105.0 },
    { symbol: 'NVDA', premium: 1540, trades: 15, ccCount: 12, cspCount: 3, assignments: 0, avgPremium: 102.7 },
    { symbol: 'AMD', premium: 720, trades: 10, ccCount: 3, cspCount: 7, assignments: 2, avgPremium: 72.0 },
    { symbol: 'SPY', premium: 480, trades: 8, ccCount: 3, cspCount: 5, assignments: 0, avgPremium: 60.0 },
  ],
};

// ---------------------------------------------------------------------------
// Strategies — Wheel Dashboard
// ---------------------------------------------------------------------------

const wheelStats = {
  totalPremiumCollected: 8420,
  coveredCallPremium: 4850,
  cashSecuredPutPremium: 3570,
  coveredCallCount: 48,
  cashSecuredPutCount: 41,
  expirations: 62,
  assignments: 4,
  earlyCloses: 18,
  activePositions: 4,
  winRate: 82.0,
  avgPremiumPerTrade: 94.6,
  symbols: [
    { symbol: 'AAPL', premium: 2150, tradeCount: 22, coveredCalls: 14, cashSecuredPuts: 8, assignments: 1 },
    { symbol: 'HOOD', premium: 1850, tradeCount: 18, coveredCalls: 6, cashSecuredPuts: 12, assignments: 0 },
    { symbol: 'PLTR', premium: 1680, tradeCount: 16, coveredCalls: 10, cashSecuredPuts: 6, assignments: 1 },
    { symbol: 'NVDA', premium: 1540, tradeCount: 15, coveredCalls: 12, cashSecuredPuts: 3, assignments: 0 },
    { symbol: 'AMD', premium: 720, tradeCount: 10, coveredCalls: 3, cashSecuredPuts: 7, assignments: 2 },
    { symbol: 'SPY', premium: 480, tradeCount: 8, coveredCalls: 3, cashSecuredPuts: 5, assignments: 0 },
  ],
  assignmentStats: {
    totalTrades: 89,
    totalAssignments: 4,
    assignmentRate: 4.5,
    avgDaysToAssignment: 22,
    avgPremiumOnAssigned: 110,
    avgPremiumOnExpired: 92,
    bySymbol: [
      { symbol: 'AMD', trades: 10, assignments: 2, assignmentRate: 20, avgDaysToAssignment: 18 },
      { symbol: 'AAPL', trades: 22, assignments: 1, assignmentRate: 4.5, avgDaysToAssignment: 25 },
      { symbol: 'PLTR', trades: 16, assignments: 1, assignmentRate: 6.3, avgDaysToAssignment: 28 },
    ],
  },
  wheelCycles: {
    stats: { totalCycles: 3, activeCycles: 2, completedCycles: 1, totalPremium: 4200, avgPremiumPerCycle: 1400, avgCCPerCycle: 3 },
    cycles: [
      {
        id: uid('wc1'), symbol: 'AAPL', startDate: daysAgo(120), endDate: null, status: 'active' as const,
        cspTrade: { id: uid('wct1'), openDate: daysAgo(120), closeDate: daysAgo(90), strike: 180, premium: 280, closeReason: 'assignment' },
        stockAcquired: true, stockAcquisitionDate: daysAgo(90), stockAcquisitionPrice: 180,
        ccTrades: [
          { id: uid('wcc1'), openDate: daysAgo(85), closeDate: daysAgo(55), strike: 190, premium: 320, closeReason: 'expired' },
          { id: uid('wcc2'), openDate: daysAgo(50), closeDate: daysAgo(25), strike: 195, premium: 350, closeReason: 'expired' },
        ],
        totalPremium: 950, totalCycles: 3,
      },
    ],
  },
  rolls: {
    stats: { totalRolls: 5, totalNetCredit: 380, avgNetCredit: 76, avgDaysExtended: 21, byType: { up: 1, down: 0, out: 3, upAndOut: 1, downAndOut: 0 } },
    recentRolls: [
      { id: uid('rl1'), symbol: 'PLTR', rollDate: daysAgo(14), originalStrike: 82, originalExpiration: daysAgo(14), originalType: 'covered_call', closePremium: 1.50, newStrike: 85, newExpiration: daysFromNow(11), newPremium: 2.10, netCredit: 60, rollType: 'up_and_out' as const, daysExtended: 25 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Strategies — Wheel Rankings & Community
// ---------------------------------------------------------------------------

const wheelRankings = {
  rankings: [
    { symbol: 'HOOD', score: 92, expectedMonthlyReturn: 0.032, riskScore: 3, confidence: 0.87, reasoning: ['Highest premium-to-risk ratio', '82% win rate on past 18 wheel trades', 'Strong put premium after earnings'] },
    { symbol: 'AAPL', score: 85, expectedMonthlyReturn: 0.024, riskScore: 2, confidence: 0.82, reasoning: ['Consistent covered call income', '78% win rate with low assignment risk', 'Best at 30 DTE cycle'] },
    { symbol: 'PLTR', score: 80, expectedMonthlyReturn: 0.028, riskScore: 4, confidence: 0.74, reasoning: ['High volatility = high premium', 'Momentum-driven premium opportunities', 'Watch for earnings gaps'] },
    { symbol: 'NVDA', score: 77, expectedMonthlyReturn: 0.021, riskScore: 2, confidence: 0.78, reasoning: ['Strong uptrend supports covered calls', 'Shorter DTE works better', 'High premium but moderate risk'] },
    { symbol: 'AMD', score: 58, expectedMonthlyReturn: 0.012, riskScore: 5, confidence: 0.55, reasoning: ['Lower win rate than peers', 'Higher assignment risk', 'Consider smaller position sizes'] },
  ],
  hasEnoughData: true,
  dataStats: { totalWheelTrades: 89, uniqueSymbols: 8, dateRange: { start: daysAgo(180), end: today } },
  modelInfo: { candidateRankerVersion: 3, strikeOptimizerVersion: 2, rollAdvisorVersion: 2, lastTrainedAt: daysAgo(3) },
};

const communityInsights = {
  insights: [
    { symbol: 'AAPL', score: 88, recommendation: 'strong_buy' as const, winRate: 0.76, totalTrades: 3450, uniqueTraders: 892, avgAnnualizedReturn: 0.245, confidence: 0.91, assignmentRate: 0.08, avgHoldDays: 22, optimalStrategy: { direction: 'covered_call' as const, dte: 30, otmPercent: 0.05 }, insights: ['Highest win rate in tech mega-caps', 'Best at 30 DTE cycle'] },
    { symbol: 'NVDA', score: 82, recommendation: 'buy' as const, winRate: 0.71, totalTrades: 2100, uniqueTraders: 645, avgAnnualizedReturn: 0.281, confidence: 0.84, assignmentRate: 0.12, avgHoldDays: 18, optimalStrategy: { direction: 'covered_call' as const, dte: 21, otmPercent: 0.07 }, insights: ['High premium but more volatile', 'Shorter DTE works better'] },
    { symbol: 'HOOD', score: 79, recommendation: 'buy' as const, winRate: 0.74, totalTrades: 980, uniqueTraders: 312, avgAnnualizedReturn: 0.32, confidence: 0.72, assignmentRate: 0.10, avgHoldDays: 25, optimalStrategy: { direction: 'csp' as const, dte: 30, otmPercent: 0.08 }, insights: ['Great CSP candidate', 'Strong put premium after earnings'] },
    { symbol: 'SPY', score: 75, recommendation: 'buy' as const, winRate: 0.80, totalTrades: 5200, uniqueTraders: 1450, avgAnnualizedReturn: 0.128, confidence: 0.95, assignmentRate: 0.04, avgHoldDays: 32, optimalStrategy: { direction: 'csp' as const, dte: 45, otmPercent: 0.05 }, insights: ['Lowest assignment risk', 'Best for conservative wheel'] },
    { symbol: 'PLTR', score: 72, recommendation: 'buy' as const, winRate: 0.68, totalTrades: 1550, uniqueTraders: 420, avgAnnualizedReturn: 0.262, confidence: 0.68, assignmentRate: 0.14, avgHoldDays: 19, optimalStrategy: { direction: 'covered_call' as const, dte: 21, otmPercent: 0.06 }, insights: ['Momentum-driven premium', 'Watch for earnings gaps'] },
  ],
  status: { hasModel: true, lastTrainedAt: daysAgo(1), totalTickers: 45, totalTrades: 12450, uniqueUsers: 2840 },
};

const rollAlerts = {
  alerts: [
    {
      positionId: uid('do3'),
      symbol: 'PLTR',
      positionType: 'covered_call' as const,
      strike: 85,
      expiration: daysFromNow(11),
      daysToExpiration: 11,
      isItm: false,
      distanceToStrike: 3.53,
      advice: {
        recommendation: 'roll_out' as const,
        confidence: 0.74,
        actionProbabilities: { roll_out: 0.74, let_expire: 0.18, close: 0.08 },
        reasoning: ['11 DTE — approaching expiration', 'Stock near strike at 96.6%', 'Net credit of ~$1.40 available'],
        projectedOutcomes: {
          ifRoll: { netCredit: 140, newExpiration: daysFromNow(32), newStrike: 87, expectedReturn: 0.021 },
          ifLetExpire: { pnl: 420, willBeAssigned: false },
          ifClose: { pnl: 120, capitalFreed: 8500 },
        },
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Ticker Wheel Data (for Ticker Deep Dive)
// ---------------------------------------------------------------------------

const tickerWheelList = {
  tickers: [
    { symbol: 'AAPL', totalPremium: 2150, tradeCount: 22, lastTradeDate: daysAgo(3) },
    { symbol: 'HOOD', totalPremium: 1850, tradeCount: 18, lastTradeDate: daysAgo(4) },
    { symbol: 'PLTR', totalPremium: 1680, tradeCount: 16, lastTradeDate: daysAgo(14) },
    { symbol: 'NVDA', totalPremium: 1540, tradeCount: 15, lastTradeDate: daysAgo(2) },
    { symbol: 'AMD', totalPremium: 720, tradeCount: 10, lastTradeDate: daysAgo(20) },
    { symbol: 'SPY', totalPremium: 480, tradeCount: 8, lastTradeDate: daysAgo(15) },
  ],
};

// ---------------------------------------------------------------------------
// Tax Center
// ---------------------------------------------------------------------------

const currentYear = now.getFullYear();

const taxCenter = {
  summary: {
    year: currentYear,
    realizedShortTermGains: 9800,
    realizedShortTermLosses: -1420,
    realizedLongTermGains: 5200,
    realizedLongTermLosses: -1080,
    totalRealizedGains: 15000,
    totalRealizedLosses: -2500,
    netRealizedPnL: 12500,
    shortTermTradeCount: 120,
    longTermTradeCount: 36,
    totalTradeCount: 156,
    potentialWashSales: 2,
    washSaleDisallowed: 185,
    unrealizedShortTermGains: 2800,
    unrealizedShortTermLosses: -200,
    unrealizedLongTermGains: 760,
    unrealizedLongTermLosses: 0,
    totalUnrealizedGains: 3560,
    totalUnrealizedLosses: -200,
    netUnrealizedPnL: 3360,
    estimatedShortTermTax: 2510,
    estimatedLongTermTax: 618,
    totalEstimatedTax: 3128,
  },
  taxLots: [
    { id: uid('tl1'), symbol: 'NVDA', quantity: 50, costBasis: 6100, costPerShare: 122, acquiredDate: daysAgo(95), soldDate: daysAgo(12), proceeds: 7140, gainLoss: 1040, gainLossPct: 17.0, holdingPeriod: 'short-term' as const, daysHeld: 83, isWashSale: false, type: 'stock' as const, accountName: RH.name, accountId: RH.id },
    { id: uid('tl2'), symbol: 'AAPL', quantity: 1, costBasis: -380, costPerShare: -3.80, acquiredDate: daysAgo(22), soldDate: daysAgo(3), proceeds: -50, gainLoss: 330, gainLossPct: 86.8, holdingPeriod: 'short-term' as const, daysHeld: 19, isWashSale: false, type: 'option' as const, accountName: SCH.name, accountId: SCH.id },
  ],
  taxLossHarvestingOpportunities: [
    { id: uid('tlh1'), symbol: 'SPY', quantity: 2, costBasis: 960, marketValue: 760, unrealizedLoss: -200, unrealizedLossPct: -20.8, daysHeld: 2, holdingPeriod: 'short-term' as const, potentialTaxSavings: 60, hasWashSaleRisk: false, accountName: RH.name, accountId: RH.id },
  ],
  washSaleAlerts: [
    { id: uid('ws1'), symbol: 'AMD', lossDate: daysAgo(38), lossAmount: -210, repurchaseDate: daysAgo(20), repurchaseAmount: 14500, disallowedLoss: 185, accountName: RH.name },
  ],
  availableYears: [currentYear, currentYear - 1],
  accounts: [
    { id: RH.id, name: RH.name },
    { id: SCH.id, name: SCH.name },
  ],
};

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

const journalEntry = {
  entry: {
    id: uid('j1'),
    date: today,
    preMarketNotes: 'Watching NVDA for breakout above $143. AAPL CC expiring in 18 days, may roll early if it approaches $200. Market sentiment is cautiously bullish.',
    preMarketMood: 'focused',
    watchlist: 'NVDA, HOOD, AAPL, PLTR',
    keyLevels: 'SPY 555/560 resistance, NVDA 140 support, AAPL 200 psychological resistance',
    hoursSlept: 7.5,
    sleepQuality: 'good',
    exercised: true,
    caffeineIntake: 'moderate',
    stressLevel: 3,
    postMarketNotes: 'Good day overall. NVDA broke out above $143. Collected $520 in premium this week from wheel positions. Need to watch PLTR CC that is getting close to strike.',
    emotionalState: 'confident',
    followedPlan: true,
    biggestWin: 'NVDA CC expired worthless for full $435 profit',
    biggestMistake: 'Should have closed AMD CSP earlier when it was at 50% profit',
    lessonsLearned: 'Stick to 50% profit target for CSPs on volatile names like AMD',
    marketCondition: 'bullish',
    createdAt: isoAgo(0.5),
    updatedAt: isoAgo(0.1),
  },
  date: today,
};

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const issues = {
  data: [
    {
      id: uid('iss1'),
      issueType: 'unknown_basis',
      severity: 'medium',
      symbol: 'TSLA',
      message: 'Closed position for TSLA but no matching open trade found. Cost basis is unknown.',
      isResolved: false,
      createdAt: daysAgo(45),
      resolvedAt: null,
      resolution: null,
      ledgerEventId: uid('issle1'),
    },
  ],
  pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
  summary: { total: 1, unresolved: 1, byType: { unknown_basis: 1 } },
};

// ---------------------------------------------------------------------------
// Options Analytics (Dashboard)
// ---------------------------------------------------------------------------

const optionsAnalytics = {
  summary: { totalTrades: 114, totalPnL: 9800, winRate: 72.8, avgDTE: 28, wins: 83, losses: 31 },
  dte: {
    buckets: [
      { label: '0-7 DTE', tradeCount: 12, totalPnL: 680, wins: 8, losses: 4, winRate: 66.7, avgPnL: 56.7, avgHoldTime: 4, totalVolume: 8400 },
      { label: '8-21 DTE', tradeCount: 38, totalPnL: 3200, wins: 28, losses: 10, winRate: 73.7, avgPnL: 84.2, avgHoldTime: 14, totalVolume: 32300 },
      { label: '22-45 DTE', tradeCount: 52, totalPnL: 4800, wins: 40, losses: 12, winRate: 76.9, avgPnL: 92.3, avgHoldTime: 26, totalVolume: 44200 },
      { label: '46+ DTE', tradeCount: 12, totalPnL: 1120, wins: 7, losses: 5, winRate: 58.3, avgPnL: 93.3, avgHoldTime: 52, totalVolume: 12000 },
    ],
    sweetSpot: { range: '22-45 DTE', winRate: 76.9, avgPnL: 92.3, reason: 'Best balance of win rate and average P&L' },
  },
  strategy: {
    byStrategy: [
      { strategy: 'covered_call', displayName: 'Covered Call', tradeCount: 48, totalPnL: 4850, wins: 38, losses: 10, winRate: 79.2, avgPnL: 101.0, avgHoldTime: 21, avgDTE: 30 },
      { strategy: 'cash_secured_put', displayName: 'Cash-Secured Put', tradeCount: 41, totalPnL: 3570, wins: 32, losses: 9, winRate: 78.0, avgPnL: 87.1, avgHoldTime: 24, avgDTE: 30 },
      { strategy: 'long_call', displayName: 'Long Call', tradeCount: 15, totalPnL: 1200, wins: 9, losses: 6, winRate: 60.0, avgPnL: 80.0, avgHoldTime: 12, avgDTE: 21 },
      { strategy: 'long_put', displayName: 'Long Put', tradeCount: 10, totalPnL: 180, wins: 4, losses: 6, winRate: 40.0, avgPnL: 18.0, avgHoldTime: 8, avgDTE: 14 },
    ],
    comparison: {
      mostProfitable: 'Covered Call', mostProfitablePnL: 4850,
      highestWinRate: 'Covered Call', highestWinRatePct: 79.2,
      mostActive: 'Covered Call', mostActiveCount: 48,
    },
  },
  winLoss: {
    wins: {
      totalPnL: 12400, tradeCount: 83, avgPnL: 149.4, medianPnL: 120, largestTrade: 1250,
      avgHoldTime: 22, avgDTE: 30, totalVolume: 74000, maxConsecutive: 8,
      cumulativeDaily: chartData.slice(-30).map(d => ({ date: d.date, cumPnL: Math.abs(d.cumulativePnL), count: d.tradeCount })),
    },
    losses: {
      totalPnL: -2600, tradeCount: 31, avgPnL: -83.9, medianPnL: -65, largestTrade: -420,
      avgHoldTime: 12, avgDTE: 18, totalVolume: 22900, maxConsecutive: 3,
      cumulativeDaily: chartData.slice(-30).map(d => ({ date: d.date, cumPnL: -Math.abs(d.cumulativePnL * 0.2), count: Math.max(0, d.tradeCount - 1) })),
    },
    streaks: { currentType: 'win' as const, currentCount: 4, longestWin: 8, longestLoss: 3 },
    recovery: { recoveryRate: 78.5, avgRecoveryDays: 3.2, avgRecoveryAmount: 145, bounceBackRatio: 1.78 },
  },
  exitType: {
    breakdown: [
      { exitType: 'expired', count: 62, totalPnL: 5800, avgPnL: 93.5, winRate: 100, avgHoldTime: 28 },
      { exitType: 'early_close', count: 18, totalPnL: 1400, avgPnL: 77.8, winRate: 88.9, avgHoldTime: 14 },
      { exitType: 'assignment', count: 4, totalPnL: -320, avgPnL: -80, winRate: 0, avgHoldTime: 22 },
      { exitType: 'stop_loss', count: 8, totalPnL: -680, avgPnL: -85, winRate: 0, avgHoldTime: 6 },
      { exitType: 'manual', count: 22, totalPnL: 3600, avgPnL: 163.6, winRate: 72.7, avgHoldTime: 18 },
    ],
    recommendations: [
      { type: 'info', message: 'Your expired options have a 100% win rate — strong premium selling discipline.' },
      { type: 'warning', message: 'Stop-loss exits average -$85 P&L. Consider widening stops on high-IV tickers.' },
    ],
  },
  premium: {
    credit: { totalReceived: 11200, totalKept: 8420, captureRate: 75.2, tradeCount: 89 },
    debit: { totalPaid: 3800, totalPnL: 1380, avgReturn: 36.3, tradeCount: 25 },
  },
  positionSizing: {
    buckets: [
      { label: '$0-$500', tradeCount: 45, totalPnL: 2100, wins: 32, losses: 13, winRate: 71.1, avgPnL: 46.7, avgSize: 280 },
      { label: '$500-$1000', tradeCount: 38, totalPnL: 4200, wins: 28, losses: 10, winRate: 73.7, avgPnL: 110.5, avgSize: 720 },
      { label: '$1000-$2500', tradeCount: 22, totalPnL: 2800, wins: 16, losses: 6, winRate: 72.7, avgPnL: 127.3, avgSize: 1650 },
      { label: '$2500+', tradeCount: 9, totalPnL: 700, wins: 7, losses: 2, winRate: 77.8, avgPnL: 77.8, avgSize: 3200 },
    ],
    optimalRange: { label: '$500-$1000', winRate: 73.7, avgPnL: 110.5, reason: 'Best risk-adjusted returns in this size range' },
    concentration: [
      { symbol: 'AAPL', tradeCount: 24, totalPnL: 2200, percentage: 22.4, winRate: 79.2 },
      { symbol: 'HOOD', tradeCount: 18, totalPnL: 1800, percentage: 18.4, winRate: 77.8 },
      { symbol: 'NVDA', tradeCount: 15, totalPnL: 1540, percentage: 15.7, winRate: 80.0 },
      { symbol: 'PLTR', tradeCount: 16, totalPnL: 1350, percentage: 13.8, winRate: 68.8 },
      { symbol: 'AMD', tradeCount: 10, totalPnL: 320, percentage: 3.3, winRate: 50.0 },
    ],
    avgPositionSize: 850,
    medianPositionSize: 680,
  },
};

// ---------------------------------------------------------------------------
// Risk Dashboard (AI Insights)
// ---------------------------------------------------------------------------

const riskDashboard = {
  asOf: isoAgo(0.02),
  positionCount: 11,
  report: {
    exposures: {
      grossExposurePct: 85.2,
      netExposurePct: 78.4,
      leverageProxy: 1.05,
      largestSymbol: { symbol: 'AAPL', exposurePct: 23.3 },
      largestSector: { sector: 'Technology', exposurePct: 72.1 },
    },
    drawdown: { currentDrawdownPct: -2.1, maxDrawdownPct: -8.4 },
    valueAtRisk: { var95Pct: -3.2, cvar95Pct: -4.8 },
    stressScenarios: [
      { scenario: 'Market crash (-20%)', shockPct: -20, estimatedPnl: -13500, estimatedEquity: 71500 },
      { scenario: 'Tech selloff (-15%)', shockPct: -15, estimatedPnl: -10200, estimatedEquity: 74800 },
      { scenario: 'Rates spike (+100bp)', shockPct: -5, estimatedPnl: -3400, estimatedEquity: 81600 },
    ],
    flags: [
      { code: 'SECTOR_CONCENTRATION', severity: 'warning' as const, message: 'Technology sector exposure above 70%', observedValue: 72.1, threshold: 50 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Community Regime Insights
// ---------------------------------------------------------------------------

const communityRegimeInsights = {
  insights: [
    { regimeKey: 'high_iv_trending', ivRegime: 'high_iv' as const, trendRegime: 'trending' as const, sampleSize: 1250, uniqueTraders: 380, winRate: 72, avgReturnPct: 3.1, confidence: 82 },
    { regimeKey: 'low_iv_mean_reverting', ivRegime: 'low_iv' as const, trendRegime: 'mean_reverting' as const, sampleSize: 890, uniqueTraders: 245, winRate: 68, avgReturnPct: 1.8, confidence: 74 },
  ],
};

// ---------------------------------------------------------------------------
// Time Analytics (Dashboard)
// ---------------------------------------------------------------------------

const timeAnalytics = {
  hourlyStats: Array.from({ length: 7 }, (_, i) => {
    const hour = 9 + i; // 9 AM to 3 PM
    return {
      hour,
      label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
      entryCount: Math.round(8 + seededRandom() * 20),
      exitCount: Math.round(5 + seededRandom() * 15),
      entryPnL: Math.round((seededRandom() * 2000 - 400) * 100) / 100,
      exitPnL: Math.round((seededRandom() * 1800 - 300) * 100) / 100,
      avgEntryPnL: Math.round((seededRandom() * 200 - 40) * 100) / 100,
      avgExitPnL: Math.round((seededRandom() * 180 - 30) * 100) / 100,
    };
  }),
  holdTimeStats: {
    avgHoldDaysWinners: 18.4,
    avgHoldDaysLosers: 8.2,
    avgHoldDaysAll: 14.8,
    medianHoldDaysWinners: 16,
    medianHoldDaysLosers: 6,
    holdTimeDistribution: [
      { range: '0-7 days', winCount: 22, lossCount: 18, totalPnL: 420 },
      { range: '8-14 days', winCount: 28, lossCount: 12, totalPnL: 2800 },
      { range: '15-30 days', winCount: 35, lossCount: 8, totalPnL: 4200 },
      { range: '31-60 days', winCount: 12, lossCount: 4, totalPnL: 1800 },
      { range: '60+ days', winCount: 6, lossCount: 2, totalPnL: 780 },
    ],
  },
  meta: {
    totalTrades: 156,
    tradesWithTime: 142,
    tradesWithEntryTime: 148,
    tradesWithExitTime: 142,
    percentWithTime: 91.0,
  },
};

// ---------------------------------------------------------------------------
// Ticker Performance (Dashboard)
// ---------------------------------------------------------------------------

const tickerPerformance = {
  topPerformers: [
    { symbol: 'NVDA', totalPnL: 4250, tradeCount: 18, winRate: 78 },
    { symbol: 'AAPL', totalPnL: 3100, tradeCount: 24, winRate: 72 },
    { symbol: 'HOOD', totalPnL: 2200, tradeCount: 15, winRate: 80 },
    { symbol: 'SPY', totalPnL: 1800, tradeCount: 12, winRate: 67 },
    { symbol: 'PLTR', totalPnL: 1450, tradeCount: 20, winRate: 65 },
  ],
  needsImprovement: [
    { symbol: 'AMD', totalPnL: -320, tradeCount: 8, winRate: 38 },
    { symbol: 'TSLA', totalPnL: -180, tradeCount: 6, winRate: 50 },
  ],
};

// ---------------------------------------------------------------------------
// Trade Metrics (Dashboard - TradeSizeAnalytics)
// ---------------------------------------------------------------------------

function makePeriodMetrics(scale: number) {
  return {
    avgTradeSize: { stock: Math.round(3200 * scale), option: Math.round(850 * scale), total: Math.round(1450 * scale) },
    volume: {
      capitalDeployed: { stock: Math.round(48000 * scale), option: Math.round(12800 * scale), total: Math.round(60800 * scale) },
      capitalReturned: { stock: Math.round(52000 * scale), option: Math.round(14200 * scale), total: Math.round(66200 * scale) },
      totalTraded: Math.round(127000 * scale),
    },
    tradeCount: { stock: Math.round(15 * scale), option: Math.round(38 * scale), total: Math.round(53 * scale) },
  };
}

const tradeMetrics = {
  timeframes: {
    daily: makePeriodMetrics(0.05),
    weekly: makePeriodMetrics(0.15),
    monthly: makePeriodMetrics(0.35),
    quarterly: makePeriodMetrics(0.7),
    ytd: makePeriodMetrics(0.85),
    last12m: makePeriodMetrics(1.0),
    lastyear: makePeriodMetrics(0.9),
    customRange: null,
  },
  allTime: makePeriodMetrics(1.0),
  periodLabels: {
    daily: 'Today',
    weekly: 'This Week',
    monthly: 'This Month',
    quarterly: 'This Quarter',
    ytd: 'Year to Date',
    last12m: 'Last 12 Months',
    lastyear: 'Last Year',
  },
};

// ---------------------------------------------------------------------------
// Cash Flow (Dashboard - CashFlowAnalytics)
// ---------------------------------------------------------------------------

function makeCashFlowPeriod(scale: number) {
  return {
    contributions: { total: Math.round(5000 * scale), count: Math.round(3 * scale) || 1, items: [{ date: daysAgo(15), amount: Math.round(2500 * scale), description: 'ACH Deposit' }] },
    withdrawals: { total: Math.round(-1000 * scale), count: Math.round(1 * scale) || 0, items: [] },
    dividends: { total: Math.round(320 * scale), count: Math.round(4 * scale) || 1, items: [{ date: daysAgo(30), amount: Math.round(80 * scale), description: 'AAPL Dividend', symbol: 'AAPL' }] },
    interest: { total: Math.round(45 * scale), count: Math.round(2 * scale) || 1, items: [] },
    fees: { total: Math.round(-12 * scale), count: Math.round(2 * scale) || 1, items: [] },
    transfers: { total: 0, count: 0, items: [] },
    netCashFlow: Math.round(4353 * scale),
  };
}

const cashFlow = {
  timeframes: {
    monthly: makeCashFlowPeriod(0.3),
    quarterly: makeCashFlowPeriod(0.7),
    ytd: makeCashFlowPeriod(0.85),
    last12m: makeCashFlowPeriod(1.0),
    lastyear: makeCashFlowPeriod(0.9),
    allTime: makeCashFlowPeriod(1.0),
    customRange: null,
  },
  periodLabels: {
    monthly: 'This Month',
    quarterly: 'This Quarter',
    ytd: 'Year to Date',
    last12m: 'Last 12 Months',
    lastyear: 'Last Year',
    allTime: 'All Time',
  },
};

// ---------------------------------------------------------------------------
// Options Seasonality (Dashboard)
// ---------------------------------------------------------------------------

const optionsSeasonality = {
  summary: { totalTrades: 114, totalPnL: 9800, winRate: 72.8 },
  dayOfWeek: {
    byDay: [
      { day: 'Monday', dayNum: 1, entryCount: 28, exitCount: 18, entryPnL: 2100, exitPnL: 1600, entryWinRate: 71, exitWinRate: 78 },
      { day: 'Tuesday', dayNum: 2, entryCount: 24, exitCount: 22, entryPnL: 1800, exitPnL: 1900, entryWinRate: 75, exitWinRate: 73 },
      { day: 'Wednesday', dayNum: 3, entryCount: 22, exitCount: 20, entryPnL: 1500, exitPnL: 2200, entryWinRate: 68, exitWinRate: 80 },
      { day: 'Thursday', dayNum: 4, entryCount: 20, exitCount: 28, entryPnL: 1200, exitPnL: 2400, entryWinRate: 70, exitWinRate: 75 },
      { day: 'Friday', dayNum: 5, entryCount: 20, exitCount: 26, entryPnL: 1400, exitPnL: 1700, entryWinRate: 65, exitWinRate: 77 },
    ],
    bestEntryDay: { day: 'Tuesday', winRate: 75, count: 24 },
    bestExitDay: { day: 'Wednesday', winRate: 80, count: 20 },
  },
  seasonality: {
    byMonth: Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        month: d.toLocaleString('en', { month: 'short' }),
        monthNum: d.getMonth() + 1,
        tradeCount: Math.round(15 + seededRandom() * 10),
        totalPnL: Math.round(1200 + seededRandom() * 2000),
        winRate: Math.round(60 + seededRandom() * 20),
        avgPnL: Math.round(70 + seededRandom() * 60),
      };
    }),
    bestMonth: { month: 'Jan', pnl: 3200, winRate: 78 },
    worstMonth: { month: 'Mar', pnl: 800, winRate: 58 },
    byQuarter: [
      { quarter: 'Q1', quarterNum: 1, tradeCount: 42, totalPnL: 3800, winRate: 71 },
      { quarter: 'Q2', quarterNum: 2, tradeCount: 38, totalPnL: 3200, winRate: 74 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Options Rolls (Dashboard)
// ---------------------------------------------------------------------------

const optionsRolls = {
  summary: { totalTrades: 114, totalPnL: 9800, winRate: 72.8 },
  rolls: {
    stats: {
      totalRolls: 5,
      successfulRolls: 4,
      successRate: 80,
      avgRollCredit: 76,
      totalRollPnL: 380,
      avgDaysExtended: 21,
    },
    bySymbol: [
      { symbol: 'PLTR', rollCount: 2, successRate: 100, totalCredit: 160 },
      { symbol: 'AAPL', rollCount: 2, successRate: 100, totalCredit: 140 },
      { symbol: 'AMD', rollCount: 1, successRate: 0, totalCredit: 80 },
    ],
    insight: 'Your rolls have an 80% success rate. PLTR and AAPL rolls consistently generate net credits.',
  },
};

// ---------------------------------------------------------------------------
// ML Options Status & Insights (Dashboard)
// ---------------------------------------------------------------------------

const mlOptionsStatus = {
  enabled: true,
  hasEnoughData: true,
  dataStats: {
    totalTrades: 156,
    optionTrades: 114,
    uniqueSymbols: 8,
    strategiesUsed: 4,
    dateRange: { start: daysAgo(180), end: today },
  },
  modelInfo: {
    volatilityRegimeVersion: 2,
    entryTimingVersion: 1,
    exitStrategyVersion: 1,
    strategyClassifierVersion: 1,
    riskAnalyzerVersion: 1,
    tradeEmbedderVersion: 1,
    lastTrainedAt: daysAgo(5),
  },
  readiness: {
    ready: true,
    tradeCount: 156,
    optionTradeCount: 114,
    recommendations: [],
  },
};

const mlOptionsInsights = {
  date: today,
  summary: {
    totalPositions: 6,
    netDelta: 0.32,
    dailyTheta: -18.5,
    unrealizedPnL: 550,
    portfolioValue: 72450,
  },
  actionItems: [
    { type: 'roll', symbol: 'PLTR', priority: 'high' as const, description: 'PLTR $85C approaching strike at 11 DTE', recommendation: 'Roll out to next month $87C for ~$1.40 net credit' },
    { type: 'close', symbol: 'AMD', priority: 'medium' as const, description: 'AMD $145P at 57% profit with 7 DTE', recommendation: 'Close for profit — approaching max gain territory' },
  ],
  opportunities: [
    { symbol: 'HOOD', strategy: 'cash_secured_put', confidence: 0.82, expectedReturn: 3.2, reasoning: ['Elevated IV after earnings', 'Strong support at $44'] },
  ],
  riskAlerts: [
    { type: 'dte_warning', severity: 'medium' as const, description: 'AMD CSP has only 7 DTE remaining', action: 'Monitor for early close or assignment' },
  ],
  learnings: ['Covered calls on tech stocks have outperformed CSPs this quarter', 'Your optimal DTE window is 22-45 days based on win rate analysis'],
};

const mlOptionsAttribution = {
  totalPnL: 9800,
  breakdown: {
    deltaContribution: 4200,
    thetaContribution: 3800,
    vegaContribution: 1200,
    executionImpact: 380,
    otherFactors: 220,
  },
  percentages: {
    delta: 42.9,
    theta: 38.8,
    vega: 12.2,
    execution: 3.9,
    other: 2.2,
  },
  insights: ['Theta decay accounts for 39% of your P&L — premium selling is your core edge', 'Delta contribution is high, suggesting good directional timing on entries'],
};

const mlOptionsAlerts = [
  { id: uid('mla1'), alertType: 'dte_warning', severity: 'medium' as const, symbol: 'AMD', title: 'Low DTE Warning', message: 'AMD $145P has only 7 DTE remaining. Consider closing to lock in profits.', suggestedAction: 'Close position at 57% profit', isDismissed: false, createdAt: isoAgo(0.5) },
  { id: uid('mla2'), alertType: 'strike_proximity', severity: 'low' as const, symbol: 'PLTR', title: 'Near Strike Price', message: 'PLTR is at $82.10, approaching the $85 CC strike. Monitor for potential assignment.', suggestedAction: 'Consider rolling up and out', isDismissed: false, createdAt: isoAgo(1) },
];

// ---------------------------------------------------------------------------
// Position Actions (Dashboard - ML predictions for option positions)
// ---------------------------------------------------------------------------

const positionActions = {
  positions: [
    {
      positionId: uid('do1'), symbol: 'AAPL', timestamp: isoAgo(0.1),
      exitRecommendation: { action: 'hold' as const, confidence: 0.78, targetPrice: 0.50, stopLoss: 5.00 },
      exitStrategy: { targetProfitPercent: 50, stopLossPercent: 200, confidence: 0.78, rollProbability: 0.15, exitTiming: 'at_target', exitTimingProbabilities: { early: 0.25, at_target: 0.55, expiration: 0.20 } },
      risk: { currentRiskLevel: 'low' as const, riskScore: 22, daysToExpiry: 18, thetaDecay: -1.8 },
      uncertainty: { overall: 0.22, confidence95CI: [-120, 340] as [number, number] },
      insights: [{ type: 'theta', source: 'time_decay', message: 'Time decay is working in your favor — $1.8/day', weight: 0.8 }],
    },
    {
      positionId: uid('do3'), symbol: 'PLTR', timestamp: isoAgo(0.1),
      exitRecommendation: { action: 'roll' as const, confidence: 0.74, rollSuggestion: 'Roll to next month $87C' },
      exitStrategy: { targetProfitPercent: 50, stopLossPercent: 150, confidence: 0.74, rollProbability: 0.65, exitTiming: 'early' },
      risk: { currentRiskLevel: 'medium' as const, riskScore: 55, daysToExpiry: 11, thetaDecay: -3.2 },
      uncertainty: { overall: 0.35, confidence95CI: [-200, 420] as [number, number] },
      insights: [{ type: 'proximity', source: 'strike_analysis', message: 'Stock at 96.6% of strike — roll before assignment risk increases', weight: 0.9 }],
    },
    {
      positionId: uid('do5'), symbol: 'AMD', timestamp: isoAgo(0.1),
      exitRecommendation: { action: 'close' as const, confidence: 0.82, targetPrice: 0.30 },
      exitStrategy: { targetProfitPercent: 50, stopLossPercent: 100, confidence: 0.82, rollProbability: 0.08, exitTiming: 'early' },
      risk: { currentRiskLevel: 'low' as const, riskScore: 18, daysToExpiry: 7, thetaDecay: -2.1 },
      uncertainty: { overall: 0.18, confidence95CI: [40, 140] as [number, number] },
      insights: [{ type: 'profit', source: 'pnl_analysis', message: 'At 57% of max profit with 7 DTE — optimal close window', weight: 0.95 }],
    },
  ],
  summary: {
    totalPositions: 3,
    highRiskCount: 0,
    actionRequired: 2,
    averageConfidence: 0.78,
    portfolioRiskScore: 32,
  },
};

// ---------------------------------------------------------------------------
// Account-specific data variations
// ---------------------------------------------------------------------------
// RH = active options trading ($55k), SCH = conservative wheel IRA ($30k)
// "All Accounts" (null) uses the full combined data above.

// --- Dashboard Stats per account ---
const chartDataRH = makeChartData(); // re-seed is fine — different curve
const dashboardStatsRH = {
  totalPnL: 8750,
  openPositions: 7,
  closedTrades: 108,
  winRate: 70.4,
  profitFactor: 2.35,
  avgWin: 265,
  avgLoss: -125,
  avgTradeSizeStock: 3400,
  avgTradeSizeOption: 880,
  stockTradeCount: 28,
  optionTradeCount: 80,
  totalVolumeStock: 95200,
  totalVolumeOption: 70400,
  wins: 76,
  losses: 32,
  breakeven: 0,
  chartData: chartDataRH,
  sampleData: null,
};

const chartDataSCH = makeChartData();
const dashboardStatsSCH = {
  totalPnL: 3750,
  openPositions: 4,
  closedTrades: 48,
  winRate: 64.6,
  profitFactor: 1.85,
  avgWin: 210,
  avgLoss: -108,
  avgTradeSizeStock: 2800,
  avgTradeSizeOption: 790,
  stockTradeCount: 14,
  optionTradeCount: 34,
  totalVolumeStock: 39200,
  totalVolumeOption: 26500,
  wins: 31,
  losses: 17,
  breakeven: 0,
  chartData: chartDataSCH,
  sampleData: null,
};

// --- Dashboard Positions per account ---
const dashboardPositionsRH = {
  stocks: dashboardPositions.stocks.filter((_s, i) => i < 2), // AAPL, NVDA
  options: dashboardPositions.options.filter((_o, i) => [0, 1, 3, 4, 5].includes(i)), // AAPL CC, HOOD CSP, NVDA call, AMD CSP, SPY put
  futures: [],
  summary: { stockCount: 2, optionCount: 5, futureCount: 0, stockCostBasis: 32170, optionCostBasis: -30, futureCostBasis: 0, totalCostBasis: 32140 },
};

const dashboardPositionsSCH = {
  stocks: dashboardPositions.stocks.filter((_s, i) => i >= 2), // SPY, MSFT, PLTR
  options: dashboardPositions.options.filter((_o, i) => i === 2), // PLTR CC
  futures: [],
  summary: { stockCount: 3, optionCount: 1, futureCount: 0, stockCostBasis: 31637.50, optionCostBasis: -420, futureCostBasis: 0, totalCostBasis: 31217.50 },
};

// --- Realtime Portfolio per account ---
const rhPositions = realtimePortfolio.positions.filter((_p, i) => [0, 1, 5, 6, 8, 9, 10].includes(i));
const schPositions = realtimePortfolio.positions.filter((_p, i) => [2, 3, 4, 7].includes(i));
const sumMV = (arr: typeof realtimePortfolio.positions) => arr.reduce((s, p) => s + Math.abs(p.marketValue), 0);
const sumPnL = (arr: typeof realtimePortfolio.positions) => arr.reduce((s, p) => s + p.unrealizedPnL, 0);

const realtimePortfolioRH = {
  totalMarketValue: sumMV(rhPositions),
  totalCash: 8250,
  totalBuyingPower: 16500,
  totalUnrealizedPnL: sumPnL(rhPositions),
  totalUnrealizedPnLPct: 3.8,
  realizedPnL: 8750,
  totalPnL: 8750 + sumPnL(rhPositions),
  todaysChange: 312,
  todaysChangePct: 0.58,
  allocation: {
    stocks: { value: 34100, count: 2, percentage: 80.4 },
    options: { value: 1070, count: 5, percentage: 2.5 },
    futures: { value: 0, count: 0, percentage: 0 },
    cash: { value: 8250, percentage: 19.5 },
  },
  positions: rhPositions,
  lastSyncAt: isoAgo(0.01),
  positionCount: 7,
  hasRealTimeData: true,
};

const realtimePortfolioSCH = {
  totalMarketValue: sumMV(schPositions),
  totalCash: 4300,
  totalBuyingPower: 4300,
  totalUnrealizedPnL: sumPnL(schPositions),
  totalUnrealizedPnLPct: 3.5,
  realizedPnL: 3750,
  totalPnL: 3750 + sumPnL(schPositions),
  todaysChange: 170,
  todaysChangePct: 0.52,
  allocation: {
    stocks: { value: 32815.50, count: 3, percentage: 88.4 },
    options: { value: 240, count: 1, percentage: 0.6 },
    futures: { value: 0, count: 0, percentage: 0 },
    cash: { value: 4300, percentage: 11.6 },
  },
  positions: schPositions,
  lastSyncAt: isoAgo(0.01),
  positionCount: 4,
  hasRealTimeData: true,
};

// --- Unified Positions per account ---
const unifiedPositionsRH = {
  positions: unifiedPositions.positions.filter((p) => p.brokerageAccountId === RH.id),
  balances: unifiedPositions.balances.filter((b) => b.brokerageAccountId === RH.id),
  returnRates: unifiedPositions.returnRates.filter((r) => r.brokerageAccountId === RH.id),
  stablecoinHoldings: [],
  summary: {
    totalPositions: 7, stockPositions: 2, optionPositions: 5, futurePositions: 0, cryptoPositions: 0,
    totalMarketValue: sumMV(rhPositions), totalUnrealizedPnL: sumPnL(rhPositions),
    totalCash: 8250, totalBuyingPower: 16500, totalStablecoinBalance: 0, needsRefresh: false,
  },
};

const unifiedPositionsSCH = {
  positions: unifiedPositions.positions.filter((p) => p.brokerageAccountId === SCH.id),
  balances: unifiedPositions.balances.filter((b) => b.brokerageAccountId === SCH.id),
  returnRates: unifiedPositions.returnRates.filter((r) => r.brokerageAccountId === SCH.id),
  stablecoinHoldings: [],
  summary: {
    totalPositions: 4, stockPositions: 3, optionPositions: 1, futurePositions: 0, cryptoPositions: 0,
    totalMarketValue: sumMV(schPositions), totalUnrealizedPnL: sumPnL(schPositions),
    totalCash: 4300, totalBuyingPower: 4300, totalStablecoinBalance: 0, needsRefresh: false,
  },
};

// --- Recent Trades per account ---
const recentTradesRH = {
  data: recentTrades.data.filter((t) => t.brokerageAccountId === RH.id),
  pagination: { total: 108, totalOpen: 7, totalClosed: 101, limit: 10, offset: 0, hasMore: true },
};
const recentTradesSCH = {
  data: recentTrades.data.filter((t) => t.brokerageAccountId === SCH.id),
  pagination: { total: 48, totalOpen: 4, totalClosed: 44, limit: 10, offset: 0, hasMore: true },
};

// --- Performance per account ---
const dashboardPerformanceRH = {
  topPerformers: [
    { symbol: 'NVDA', totalPnL: 3200, tradeCount: 14, winRate: 79 },
    { symbol: 'HOOD', totalPnL: 2200, tradeCount: 15, winRate: 80 },
    { symbol: 'AAPL', totalPnL: 1800, tradeCount: 16, winRate: 75 },
    { symbol: 'AMD', totalPnL: 850, tradeCount: 12, winRate: 58 },
  ],
  needsImprovement: [
    { symbol: 'TSLA', totalPnL: -180, tradeCount: 6, winRate: 50 },
  ],
  monthlyBreakdown: dashboardPerformance.monthlyBreakdown.map((m) => ({
    ...m, totalPnL: Math.round(m.totalPnL * 0.7), tradeCount: Math.round(m.tradeCount * 0.7),
    wins: Math.round(m.wins * 0.7), losses: Math.round(m.losses * 0.7),
  })),
  extremeTrades: {
    biggestWins: dashboardPerformance.extremeTrades.biggestWins,
    biggestLosses: dashboardPerformance.extremeTrades.biggestLosses,
  },
};

const dashboardPerformanceSCH = {
  topPerformers: [
    { symbol: 'AAPL', totalPnL: 1300, tradeCount: 8, winRate: 68 },
    { symbol: 'SPY', totalPnL: 1800, tradeCount: 12, winRate: 67 },
    { symbol: 'PLTR', totalPnL: 1450, tradeCount: 8, winRate: 63 },
  ],
  needsImprovement: [
    { symbol: 'AMD', totalPnL: -320, tradeCount: 4, winRate: 25 },
  ],
  monthlyBreakdown: dashboardPerformance.monthlyBreakdown.map((m) => ({
    ...m, totalPnL: Math.round(m.totalPnL * 0.3), tradeCount: Math.round(m.tradeCount * 0.3),
    wins: Math.round(m.wins * 0.3), losses: Math.round(m.losses * 0.3),
  })),
  extremeTrades: {
    biggestWins: [{ id: uid('sw1'), symbol: 'SPY', type: 'option', pnl: 480, date: daysAgo(15) }],
    biggestLosses: [{ id: uid('sl1'), symbol: 'AMD', type: 'option', pnl: -280, date: daysAgo(40) }],
  },
};

// --- Realtime Check per account ---
const realtimeCheckRH = { hasRealTimeData: true, positionCount: 7 };
const realtimeCheckSCH = { hasRealTimeData: true, positionCount: 4 };

// --- Wheel / Strategies per account (RH = active, SCH = conservative) ---
const incomeWheelRH = {
  ...incomeWheel,
  incomeMetrics: {
    ...incomeWheel.incomeMetrics,
    totalPremiumRealized: 5650,
    totalPremiumPending: 830,
    totalCollateralAtRisk: 18500,
    totalTrades: 58,
    ccPremiumRealized: 3200,
    cspPremiumRealized: 2450,
    ccCount: 30,
    cspCount: 28,
  },
  activePositions: incomeWheel.activePositions.filter((_p, i) => i !== 2), // AAPL CC, HOOD CSP, AMD CSP
};

const incomeWheelSCH = {
  ...incomeWheel,
  incomeMetrics: {
    ...incomeWheel.incomeMetrics,
    totalPremiumRealized: 2770,
    totalPremiumPending: 420,
    totalCollateralAtRisk: 10000,
    totalTrades: 31,
    ccPremiumRealized: 1650,
    cspPremiumRealized: 1120,
    ccCount: 18,
    cspCount: 13,
  },
  activePositions: incomeWheel.activePositions.filter((_p, i) => i === 2), // PLTR CC
};

// --- Options Analytics per account ---
const optionsAnalyticsRH = {
  ...optionsAnalytics,
  strategy: {
    ...optionsAnalytics.strategy,
    byStrategy: optionsAnalytics.strategy.byStrategy.map((s: Record<string, unknown>) => ({
      ...s,
      tradeCount: Math.round((s.tradeCount as number) * 0.7),
      totalPnL: Math.round((s.totalPnL as number) * 0.7),
      wins: Math.round((s.wins as number) * 0.7),
      losses: Math.round((s.losses as number) * 0.7),
    })),
  },
};

const optionsAnalyticsSCH = {
  ...optionsAnalytics,
  strategy: {
    ...optionsAnalytics.strategy,
    byStrategy: optionsAnalytics.strategy.byStrategy.map((s: Record<string, unknown>) => ({
      ...s,
      tradeCount: Math.round((s.tradeCount as number) * 0.3),
      totalPnL: Math.round((s.totalPnL as number) * 0.3),
      wins: Math.round((s.wins as number) * 0.3),
      losses: Math.round((s.losses as number) * 0.3),
    })),
  },
};

// ---------------------------------------------------------------------------
// Populate cache function
// ---------------------------------------------------------------------------

/**
 * Pre-populate a QueryClient cache with all demo data.
 * Sets staleTime: Infinity so queries never attempt to fetch.
 */
export function populateDemoCache(qc: QueryClient): void {
  const set = <T>(key: readonly unknown[], data: T) => {
    qc.setQueryData(key, data);
  };

  // Accounts & global
  set(['brokerage-accounts'], brokerageAccounts);
  set(['accounts'], brokerageAccounts); // positions page uses this key
  set(['snaptrade-status'], snaptradeStatus);
  set(['userSettings'], userSettings);

  // Dashboard (null = all accounts view)
  set(['dashboardStats', null], dashboardStats);
  set(['dashboardPerformance', null], dashboardPerformance);
  set(['dashboardScatter', null], dashboardScatter);
  set(['dashboardPositions', null], dashboardPositions);
  set(['dashboardGoalsPreview', null], dashboardGoalsPreview);
  set(['dashboardStreaksPreview', null], dashboardStreaksPreview);
  set(['realtimeCheck', null], realtimeCheck);
  set(['realtimePortfolio', null], realtimePortfolio);
  set(['dashboardStreaks', null], dashboardStreaks);
  set(['dashboardGoals', null], dashboardGoals);

  // Account-specific data (different stats/positions per account)
  set(['dashboardStats', RH.id], dashboardStatsRH);
  set(['dashboardStats', SCH.id], dashboardStatsSCH);
  set(['dashboardPerformance', RH.id], dashboardPerformanceRH);
  set(['dashboardPerformance', SCH.id], dashboardPerformanceSCH);
  set(['dashboardPositions', RH.id], dashboardPositionsRH);
  set(['dashboardPositions', SCH.id], dashboardPositionsSCH);
  set(['realtimeCheck', RH.id], realtimeCheckRH);
  set(['realtimeCheck', SCH.id], realtimeCheckSCH);
  set(['realtimePortfolio', RH.id], realtimePortfolioRH);
  set(['realtimePortfolio', SCH.id], realtimePortfolioSCH);
  // Scatter, goals, streaks — use same data for all accounts (less critical)
  for (const acct of [RH, SCH]) {
    set(['dashboardScatter', acct.id], dashboardScatter);
    set(['dashboardGoalsPreview', acct.id], dashboardGoalsPreview);
    set(['dashboardStreaksPreview', acct.id], dashboardStreaksPreview);
    set(['dashboardStreaks', acct.id], dashboardStreaks);
    set(['dashboardGoals', acct.id], dashboardGoals);
  }

  // Time Analytics
  set(['timeAnalytics', null], timeAnalytics);
  set(['timeAnalytics', RH.id], timeAnalytics);
  set(['timeAnalytics', SCH.id], timeAnalytics);

  // Ticker Performance (default timeframe is 'all')
  set(['tickerPerformance', null, 'all'], tickerPerformance);
  set(['tickerPerformance', RH.id, 'all'], tickerPerformance);
  set(['tickerPerformance', SCH.id, 'all'], tickerPerformance);

  // Trade Metrics (TradeSizeAnalytics — default has no date range)
  set(['tradeMetrics', null, undefined, undefined], tradeMetrics);
  set(['tradeMetrics', RH.id, undefined, undefined], tradeMetrics);

  // Cash Flow (CashFlowAnalytics)
  set(['cashFlow', null], cashFlow);
  set(['cashFlow', RH.id], cashFlow);
  set(['cashFlow', SCH.id], cashFlow);

  // Options Seasonality (default timeframe is 'all')
  set(['options-seasonality', null, 'all'], optionsSeasonality);
  set(['options-seasonality', RH.id, 'all'], optionsSeasonality);

  // Options Rolls
  set(['options-rolls', null], optionsRolls);
  set(['options-rolls', RH.id], optionsRolls);

  // ML Options (Dashboard deep-dive section)
  set(['ml-options-status'], mlOptionsStatus);
  set(['ml-options-insights'], mlOptionsInsights);
  set(['ml-options-attribution'], mlOptionsAttribution);
  set(['ml-options-alerts'], mlOptionsAlerts);

  // Position Actions (ML predictions for option positions)
  set(['position-actions', null], positionActions);
  set(['position-actions', RH.id], positionActions);

  // Calendar (current month — pre-computed at module scope for deterministic PRNG)
  set(['dashboardCalendar', calYear, calMonth, null], calendarData);
  set(['dashboardCalendar', calYear, calMonth, RH.id], calendarData);
  set(['dashboardCalendar', calYear, calMonth, SCH.id], calendarData);

  // Per-day trades (calendar day-click modal)
  for (const [date, trades] of dayTradesMap) {
    set(['dayTrades', date, null], trades);
    set(['dayTrades', date, RH.id], trades);
    set(['dayTrades', date, SCH.id], trades);
  }

  // Week trades (calendar week-click modal) — mirrors PnLCalendar's grid logic
  {
    type CalDay = (typeof calendarData.days)[number] | null;
    const grid: CalDay[] = [];
    const firstDow = new Date(calYear, calMonth - 1, 1).getDay();
    for (let i = 0; i < firstDow; i++) grid.push(null);
    for (const d of calendarData.days) grid.push(d);
    for (let i = 0; i < grid.length; i += 7) {
      const week = grid.slice(i, i + 7);
      const actual = week.filter((d): d is NonNullable<CalDay> => d !== null);
      if (actual.length === 0) continue;
      const weekStart = actual[0].date;
      const weekEnd = actual[actual.length - 1].date;
      const weekTrades: DemoTrade[] = [];
      for (const d of actual) {
        const dt = dayTradesMap.get(d.date);
        if (dt) weekTrades.push(...dt);
      }
      if (weekTrades.length > 0) {
        set(['weekTrades', weekStart, weekEnd, null], weekTrades);
        set(['weekTrades', weekStart, weekEnd, RH.id], weekTrades);
        set(['weekTrades', weekStart, weekEnd, SCH.id], weekTrades);
      }
    }
  }

  // Trades (filtered per account)
  set(['dashboardTrades', 'all', 'all', '', 10, null], recentTrades);
  set(['dashboardTrades', 'all', 'all', '', 10, RH.id], recentTradesRH);
  set(['dashboardTrades', 'all', 'all', '', 10, SCH.id], recentTradesSCH);

  // Options analytics (per account)
  set(['options-analytics', null, 'all'], optionsAnalytics);
  set(['options-analytics', RH.id, 'all'], optionsAnalyticsRH);
  set(['options-analytics', SCH.id, 'all'], optionsAnalyticsSCH);

  // Unified Positions (Positions page — filtered per account)
  set(['unified-positions', undefined], unifiedPositions);
  set(['unified-positions', null], unifiedPositions);
  set(['unified-positions', RH.id], unifiedPositionsRH);
  set(['unified-positions', SCH.id], unifiedPositionsSCH);

  // Open orders (empty in demo)
  set(['open-orders', undefined], { orders: [], summary: { totalOrders: 0, pendingBuyValue: 0, pendingSellValue: 0 } });
  set(['open-orders', null], { orders: [], summary: { totalOrders: 0, pendingBuyValue: 0, pendingSellValue: 0 } });

  // AI Insights
  set(['ai-unified', null], aiUnified);
  set(['ai-unified', RH.id], aiUnified);
  set(['ai-actions', null], aiActions);
  set(['ai-actions', RH.id], aiActions);
  set(['wheel-ml-status'], wheelMLStatus);
  set(['options-ml-status'], optionsMLStatus);
  set(['stock-ml-status'], stockMLStatus);
  set(['quant-model-health'], quantModelHealth);
  set(['community-ml-status'], communityMLStatus);
  set(['community-regime-insights'], communityRegimeInsights);
  set(['quant-risk-dashboard', null], riskDashboard);
  set(['quant-risk-dashboard', RH.id], riskDashboard);
  set(['isAdmin'], false);

  // Strategies (per account)
  set(['incomeWheel', null], incomeWheel);
  set(['incomeWheel', RH.id], incomeWheelRH);
  set(['incomeWheel', SCH.id], incomeWheelSCH);
  set(['wheelStats', null], wheelStats);
  set(['wheelStats', RH.id], wheelStats);
  set(['wheelStats', SCH.id], wheelStats);
  set(['wheel-rankings', 'current', null], wheelRankings);
  set(['wheel-rankings', 'current', RH.id], wheelRankings);
  set(['roll-alerts', null], rollAlerts);
  set(['roll-alerts', RH.id], rollAlerts);
  set(['communityInsights'], communityInsights);
  set(['tickerWheelList', null], tickerWheelList);
  set(['tickerWheelList', RH.id], tickerWheelList);
  set(['tickerWheelList', SCH.id], tickerWheelList);
  set(['ml-training-status'], { status: wheelMLStatus.status, readiness: { ready: true, recommendations: [] } });

  // Tax center
  set(['tax-center', currentYear, undefined], taxCenter);
  set(['tax-center', currentYear, null], taxCenter);

  // Journal (today)
  set(['journal', today], journalEntry);

  // Issues
  set(['issues', false], issues);
  set(['issues', undefined], issues);

  // Portfolio policy (null = no policy set, which is normal)
  set(['portfolioPolicy', null], { policy: null, account: null });
  set(['portfolioPolicy', RH.id], { policy: null, account: { id: RH.id, name: RH.name, broker: RH.broker } });

  // Price History (for TradingView charts)
  // Seed common time ranges: 1W, 1M, 3M, 6M, 1Y, YTD, ALL
  const todayStr = now.toISOString().slice(0, 10);
  const ranges: Array<{ start: string; end: string }> = [];
  // 1W
  const d1w = new Date(now); d1w.setDate(d1w.getDate() - 7);
  ranges.push({ start: d1w.toISOString().slice(0, 10), end: todayStr });
  // 1M
  const d1m = new Date(now); d1m.setMonth(d1m.getMonth() - 1);
  ranges.push({ start: d1m.toISOString().slice(0, 10), end: todayStr });
  // 3M
  const d3m = new Date(now); d3m.setMonth(d3m.getMonth() - 3);
  ranges.push({ start: d3m.toISOString().slice(0, 10), end: todayStr });
  // 6M
  const d6m = new Date(now); d6m.setMonth(d6m.getMonth() - 6);
  ranges.push({ start: d6m.toISOString().slice(0, 10), end: todayStr });
  // 1Y
  const d1y = new Date(now); d1y.setFullYear(d1y.getFullYear() - 1);
  ranges.push({ start: d1y.toISOString().slice(0, 10), end: todayStr });
  // YTD
  const dytd = new Date(now); dytd.setMonth(0, 1);
  ranges.push({ start: dytd.toISOString().slice(0, 10), end: todayStr });
  // ALL (2 years)
  const dall = new Date(now); dall.setFullYear(dall.getFullYear() - 2);
  ranges.push({ start: dall.toISOString().slice(0, 10), end: todayStr });

  for (const sym of DEMO_SYMBOLS) {
    for (const { start, end } of ranges) {
      set(['priceHistory', sym, start, end], buildPriceHistoryResponse(sym, start, end));
    }
  }

  // Seed "custom" ranges used by trade-view-modal (position.firstEntryDate → today)
  const positionStartDays = [2, 3, 4, 8, 14, 20, 30, 45, 60, 75, 90];
  for (const sym of DEMO_SYMBOLS) {
    for (const n of positionStartDays) {
      const customStart = daysAgo(n);
      set(['priceHistory', sym, customStart, todayStr], buildPriceHistoryResponse(sym, customStart, todayStr));
    }
  }

  // Trading Calendar (new /calendar page)
  const calendarTrades = buildDemoCalendarTrades(calYear, calMonth);
  const calendarDailyDetail = buildDemoCalendarDailyDetail(calYear, calMonth);
  for (const acctId of [null, RH.id, SCH.id]) {
    set(['calendarTrades', calYear, calMonth, acctId], calendarTrades);
    set(['calendarDailyDetail', calYear, calMonth, acctId], calendarDailyDetail);
  }
}
