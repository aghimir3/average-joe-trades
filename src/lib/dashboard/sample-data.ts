/**
 * Lightweight dashboard sample payloads for manual-first onboarding.
 *
 * This file intentionally keeps sample fixtures compact while covering every
 * dashboard module contract.
 */

type TradeStatus = 'open' | 'closed';
type TradeType = 'stock' | 'option' | 'future';

interface SampleTrade {
  id: string;
  symbol: string;
  type: TradeType;
  side: 'long' | 'short';
  quantity: number;
  openDate: string;
  closeDate: string | null;
  openPrice: number;
  closePrice: number | null;
  realizedPnL: number | null;
  optionType: 'call' | 'put' | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  closeReason: string | null;
  status: TradeStatus;
}

const SAMPLE_ACCOUNT_ID = 'sample-manual-account';
const SAMPLE_ACCOUNT_NAME = 'Manual Starter Account';

export const DASHBOARD_SAMPLE_NOTICE = {
  isActive: true,
  title: 'Sample data is enabled',
  message:
    'These are example numbers so your dashboard is not empty. They disappear automatically after your first manual trade or broker sync/import.',
};

function dateDaysAgo(daysAgo: number): Date {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function baseTrades(): SampleTrade[] {
  return [
    {
      id: 'sample-1',
      symbol: 'SPY',
      type: 'option',
      side: 'short',
      quantity: 1,
      openDate: isoDate(dateDaysAgo(42)),
      closeDate: isoDate(dateDaysAgo(35)),
      openPrice: 2.4,
      closePrice: 0.5,
      realizedPnL: 190,
      optionType: 'put',
      strike: 560,
      expiration: isoDate(dateDaysAgo(35)),
      strategy: 'cash_secured_put',
      closeReason: 'expired',
      status: 'closed',
    },
    {
      id: 'sample-2',
      symbol: 'QQQ',
      type: 'option',
      side: 'short',
      quantity: 1,
      openDate: isoDate(dateDaysAgo(30)),
      closeDate: isoDate(dateDaysAgo(22)),
      openPrice: 1.9,
      closePrice: 3.2,
      realizedPnL: -130,
      optionType: 'call',
      strike: 525,
      expiration: isoDate(dateDaysAgo(22)),
      strategy: 'covered_call',
      closeReason: 'normal',
      status: 'closed',
    },
    {
      id: 'sample-3',
      symbol: 'NVDA',
      type: 'stock',
      side: 'long',
      quantity: 10,
      openDate: isoDate(dateDaysAgo(20)),
      closeDate: isoDate(dateDaysAgo(12)),
      openPrice: 126,
      closePrice: 135,
      realizedPnL: 90,
      optionType: null,
      strike: null,
      expiration: null,
      strategy: 'swing',
      closeReason: 'target',
      status: 'closed',
    },
    {
      id: 'sample-4',
      symbol: 'SPY',
      type: 'option',
      side: 'short',
      quantity: 1,
      openDate: isoDate(dateDaysAgo(8)),
      closeDate: null,
      openPrice: 2.1,
      closePrice: null,
      realizedPnL: null,
      optionType: 'put',
      strike: 570,
      expiration: isoDate(dateDaysAgo(-10)),
      strategy: 'cash_secured_put',
      closeReason: null,
      status: 'open',
    },
    {
      id: 'sample-5',
      symbol: 'QQQ',
      type: 'option',
      side: 'short',
      quantity: 1,
      openDate: isoDate(dateDaysAgo(6)),
      closeDate: null,
      openPrice: 1.7,
      closePrice: null,
      realizedPnL: null,
      optionType: 'call',
      strike: 535,
      expiration: isoDate(dateDaysAgo(-8)),
      strategy: 'covered_call',
      closeReason: null,
      status: 'open',
    },
    {
      id: 'sample-6',
      symbol: 'MES',
      type: 'future',
      side: 'long',
      quantity: 1,
      openDate: isoDate(dateDaysAgo(3)),
      closeDate: null,
      openPrice: 5398,
      closePrice: null,
      realizedPnL: null,
      optionType: null,
      strike: null,
      expiration: null,
      strategy: 'futures-swing',
      closeReason: null,
      status: 'open',
    },
  ];
}

export function sampleDashboardStats() {
  const seeds = [120, -40, 55, 0, -25, 75, 43, -18, 66, -12, 81, 36, -20, 28];
  let cumulative = 0;
  const chartData = seeds.map((value, index) => {
    cumulative += value;
    return {
      date: isoDate(dateDaysAgo(seeds.length - index)),
      realizedPnL: round(value),
      cumulativePnL: round(cumulative),
      tradeCount: value === 0 ? 0 : 1 + (Math.abs(value) > 60 ? 1 : 0),
      winCount: value > 0 ? 1 : 0,
      dailyWinRate: value > 0 ? 100 : value < 0 ? 0 : 0,
    };
  });

  return {
    totalPnL: 820.5,
    openPositions: 3,
    closedTrades: 3,
    winRate: 66.7,
    profitFactor: 1.73,
    avgWin: 140,
    avgLoss: -95,
    avgTradeSizeStock: 1260,
    avgTradeSizeOption: 220,
    stockTradeCount: 1,
    optionTradeCount: 2,
    totalVolumeStock: 1260,
    totalVolumeOption: 430,
    wins: 2,
    losses: 1,
    breakeven: 0,
    chartData,
    sampleData: DASHBOARD_SAMPLE_NOTICE,
  };
}

export function sampleDashboardPerformance() {
  const m1 = isoDate(dateDaysAgo(5)).slice(0, 7);
  const m2 = isoDate(dateDaysAgo(35)).slice(0, 7);

  return {
    topPerformers: [
      { symbol: 'SPY', totalPnL: 190, tradeCount: 1, winRate: 100 },
      { symbol: 'NVDA', totalPnL: 90, tradeCount: 1, winRate: 100 },
    ],
    needsImprovement: [
      { symbol: 'QQQ', totalPnL: -130, tradeCount: 1, winRate: 0 },
    ],
    monthlyBreakdown: [
      {
        month: m1,
        totalPnL: 90,
        tradeCount: 1,
        wins: 1,
        losses: 0,
        winRate: 100,
        avgTradeSizeStock: 1260,
        avgTradeSizeOption: 0,
        stockTradeCount: 1,
        optionTradeCount: 0,
      },
      {
        month: m2,
        totalPnL: 60,
        tradeCount: 2,
        wins: 1,
        losses: 1,
        winRate: 50,
        avgTradeSizeStock: 0,
        avgTradeSizeOption: 215,
        stockTradeCount: 0,
        optionTradeCount: 2,
      },
    ],
    extremeTrades: {
      biggestWins: [{ id: 'sample-1', symbol: 'SPY', type: 'option', pnl: 190, date: isoDate(dateDaysAgo(35)) }],
      biggestLosses: [{ id: 'sample-2', symbol: 'QQQ', type: 'option', pnl: -130, date: isoDate(dateDaysAgo(22)) }],
    },
  };
}

export function sampleDashboardPositions() {
  const stocks = [
    {
      id: 'position-stock-1',
      symbol: 'NVDA',
      side: 'long',
      quantity: 8,
      avgPrice: 132.2,
      costBasis: 1057.6,
      firstEntryDate: isoDate(dateDaysAgo(4)),
      account: { id: SAMPLE_ACCOUNT_ID, name: SAMPLE_ACCOUNT_NAME, broker: 'manual' },
    },
  ];

  const options = [
    {
      id: 'position-option-1',
      symbol: 'SPY',
      side: 'short',
      quantity: 1,
      avgPrice: 2.1,
      costBasis: 210,
      optionType: 'put',
      strike: 570,
      expiration: isoDate(dateDaysAgo(-10)),
      firstEntryDate: isoDate(dateDaysAgo(8)),
      strategy: 'cash_secured_put',
      account: { id: SAMPLE_ACCOUNT_ID, name: SAMPLE_ACCOUNT_NAME, broker: 'manual' },
    },
    {
      id: 'position-option-2',
      symbol: 'QQQ',
      side: 'short',
      quantity: 1,
      avgPrice: 1.7,
      costBasis: 170,
      optionType: 'call',
      strike: 535,
      expiration: isoDate(dateDaysAgo(-8)),
      firstEntryDate: isoDate(dateDaysAgo(6)),
      strategy: 'covered_call',
      account: { id: SAMPLE_ACCOUNT_ID, name: SAMPLE_ACCOUNT_NAME, broker: 'manual' },
    },
  ];

  const futures = [
    {
      id: 'position-future-1',
      symbol: 'MES',
      side: 'long',
      quantity: 1,
      avgPrice: 5398,
      costBasis: 5398,
      firstEntryDate: isoDate(dateDaysAgo(3)),
      account: { id: SAMPLE_ACCOUNT_ID, name: SAMPLE_ACCOUNT_NAME, broker: 'manual' },
    },
  ];

  return {
    stocks,
    options,
    futures,
    summary: {
      stockCount: 1,
      optionCount: 2,
      futureCount: 1,
      stockCostBasis: 1057.6,
      optionCostBasis: 380,
      futureCostBasis: 5398,
      totalCostBasis: 6835.6,
    },
  };
}

interface SampleTradesQuery {
  limit: number;
  offset: number;
  symbol?: string;
  type: TradeType | 'all';
  status: TradeStatus | 'all';
  date?: string;
  startDate?: string;
  endDate?: string;
}

function matchesRange(date: string, startDate?: string, endDate?: string): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function sampleDashboardTrades(query: SampleTradesQuery) {
  const trades = baseTrades();
  const typed = trades.filter((trade) => (query.type === 'all' ? true : trade.type === query.type));

  const baseFiltered = typed.filter((trade) => {
    const tradeDate = trade.closeDate ?? trade.openDate;
    if (query.symbol && !trade.symbol.includes(query.symbol.toUpperCase())) return false;
    if (query.date && tradeDate !== query.date) return false;
    if (!matchesRange(tradeDate, query.startDate, query.endDate)) return false;
    return true;
  });

  const totalOpen = baseFiltered.filter((trade) => trade.status === 'open').length;
  const totalClosed = baseFiltered.filter((trade) => trade.status === 'closed').length;

  const filtered = baseFiltered.filter((trade) => {
    if (query.status === 'all') return true;
    return trade.status === query.status;
  });

  const sorted = [...filtered].sort((a, b) => (b.closeDate ?? b.openDate).localeCompare(a.closeDate ?? a.openDate));
  const paginated = sorted.slice(query.offset, query.offset + query.limit);
  const total = query.status === 'open' ? totalOpen : query.status === 'closed' ? totalClosed : totalOpen + totalClosed;

  return {
    data: paginated.map((trade) => ({
      id: trade.id,
      ledgerEventId: trade.status === 'open' ? `${trade.id}-open` : `${trade.id}-entry`,
      closeEventId: trade.status === 'closed' ? `${trade.id}-close` : null,
      brokerageAccountId: SAMPLE_ACCOUNT_ID,
      brokerageAccountName: SAMPLE_ACCOUNT_NAME,
      broker: 'manual',
      symbol: trade.symbol,
      type: trade.type,
      side: trade.side,
      quantity: trade.quantity,
      openDate: trade.openDate,
      closeDate: trade.closeDate,
      openPrice: trade.openPrice,
      closePrice: trade.closePrice,
      costBasis: round(Math.abs(trade.quantity * trade.openPrice * (trade.type === 'option' ? 100 : 1))),
      realizedPnL: trade.realizedPnL,
      closeReason: trade.closeReason,
      optionType: trade.optionType,
      strike: trade.strike,
      expiration: trade.expiration,
      strategy: trade.strategy,
      returnPercent: trade.realizedPnL != null
        ? round((trade.realizedPnL / Math.abs(trade.quantity * trade.openPrice * (trade.type === 'option' ? 100 : 1))) * 100)
        : null,
      status: trade.status,
      isWin: (trade.realizedPnL ?? 0) > 0,
      isLoss: (trade.realizedPnL ?? 0) < 0,
    })),
    pagination: {
      total,
      totalOpen,
      totalClosed,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + paginated.length < total,
    },
  };
}

export function sampleDashboardCalendar(type: 'trading' | 'wheel', year: number, month: number, symbol?: string) {
  const tradingDays = [3, 7, 10, 14, 18, 21, 24, 28];
  const pnls = [120, -40, 65, 95, -30, 88, 44, 72];
  const trades = [1, 1, 2, 2, 1, 1, 1, 2];

  if (type === 'trading') {
    const days = tradingDays.map((day, index) => {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const tradeCount = trades[index];
      const winCount = pnls[index] > 0 ? tradeCount : Math.max(0, tradeCount - 1);
      const lossCount = tradeCount - winCount;

      return {
        date,
        day,
        realizedPnL: pnls[index],
        tradeCount,
        winCount,
        lossCount,
        winRate: tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0,
        stockPnL: round(pnls[index] * 0.35),
        optionPnL: round(pnls[index] * 0.65),
        isProfit: pnls[index] > 0,
        isLoss: pnls[index] < 0,
        hasActivity: true,
        openPositionCount: index % 3 === 0 ? 1 : 0,
        openPositions: index % 3 === 0
          ? [
              {
                id: 'sample-open-calendar',
                ledgerEventId: 'sample-open-calendar-ledger',
                symbol: 'SPY',
                type: 'option',
                side: 'short',
                quantity: 1,
                avgPrice: 2.1,
                costBasis: 210,
                optionType: 'put',
                strike: 570,
                expiration: isoDate(dateDaysAgo(-10)),
                strategy: 'cash_secured_put',
              },
            ]
          : [],
      };
    });

    const totalTrades = days.reduce((sum, day) => sum + day.tradeCount, 0);
    const totalWins = days.reduce((sum, day) => sum + day.winCount, 0);

    return {
      type: 'trading',
      year,
      month,
      days,
      summary: {
        totalPnL: round(days.reduce((sum, day) => sum + day.realizedPnL, 0)),
        tradingDays: days.length,
        profitDays: days.filter((day) => day.realizedPnL > 0).length,
        lossDays: days.filter((day) => day.realizedPnL < 0).length,
        totalTrades,
        totalWins,
        totalLosses: totalTrades - totalWins,
        totalOpenPositions: days.reduce((sum, day) => sum + day.openPositionCount, 0),
        winRate: totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0,
      },
    };
  }

  const wheelSymbol = (symbol ?? 'SPY').toUpperCase();
  const days = tradingDays.map((day, index) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ccPremium = round(60 + index * 3);
    const cspPremium = round(80 + index * 4);
    const premiumCollected = round(ccPremium + cspPremium);

    return {
      date,
      day,
      premiumCollected,
      ccPremium,
      cspPremium,
      tradeCount: 1 + (index % 2),
      ccCount: 1,
      cspCount: index % 2,
      assignmentCount: index === 4 ? 1 : 0,
      expirationCount: index % 3 === 0 ? 1 : 0,
      earlyCloseCount: index % 3 === 2 ? 1 : 0,
      trades: [
        {
          id: `sample-wheel-day-${index}`,
          symbol: wheelSymbol,
          strategy: index % 2 === 0 ? 'covered_call' : 'cash_secured_put',
          strike: index % 2 === 0 ? 575 : 565,
          expiration: isoDate(dateDaysAgo(-7 - index)),
          premium: round(premiumCollected / 2),
          closeReason: index % 3 === 0 ? 'expired' : index === 4 ? 'assigned' : 'normal',
          openDate: isoDate(dateDaysAgo(20 + index)),
          closeDate: date,
        },
      ],
    };
  });

  return {
    type: 'wheel',
    year,
    month,
    symbol: wheelSymbol,
    days,
    summary: {
      totalPremium: round(days.reduce((sum, day) => sum + day.premiumCollected, 0)),
      ccPremium: round(days.reduce((sum, day) => sum + day.ccPremium, 0)),
      cspPremium: round(days.reduce((sum, day) => sum + day.cspPremium, 0)),
      totalTrades: days.reduce((sum, day) => sum + day.tradeCount, 0),
      ccCount: days.reduce((sum, day) => sum + day.ccCount, 0),
      cspCount: days.reduce((sum, day) => sum + day.cspCount, 0),
      assignments: days.reduce((sum, day) => sum + day.assignmentCount, 0),
      expirations: days.reduce((sum, day) => sum + day.expirationCount, 0),
      tradingDays: days.length,
      premiumDays: days.length,
    },
  };
}

export function sampleDashboardRealtime() {
  return {
    totalMarketValue: 20410,
    totalCash: 6990,
    totalBuyingPower: 31420,
    totalUnrealizedPnL: 486,
    totalUnrealizedPnLPct: 2.51,
    realizedPnL: 820.5,
    totalPnL: 1306.5,
    todaysChange: 117.4,
    todaysChangePct: 0.58,
    allocation: {
      stocks: { value: 9260, count: 2, percentage: 33.8 },
      options: { value: 3850, count: 3, percentage: 14.1 },
      futures: { value: 7300, count: 1, percentage: 26.6 },
      cash: { value: 6990, percentage: 25.5 },
    },
    positions: [
      { symbol: 'NVDA', positionType: 'stock', quantity: 8, marketPrice: 139.8, marketValue: 1118.4, avgCostBasis: 132.2, unrealizedPnL: 60.8, unrealizedPnLPct: 5.75, priceChangeAbs: 1.4, priceChangePct: 1.0 },
      { symbol: 'SPY', positionType: 'option', quantity: 1, marketPrice: 1.75, marketValue: 175, avgCostBasis: 2.1, unrealizedPnL: 35, unrealizedPnLPct: 16.7, priceChangeAbs: 0.13, priceChangePct: 8.0, optionType: 'put', strike: 570, expiration: isoDate(dateDaysAgo(-10)) },
      { symbol: 'QQQ', positionType: 'option', quantity: 1, marketPrice: 1.1, marketValue: 110, avgCostBasis: 1.7, unrealizedPnL: 60, unrealizedPnLPct: 35.3, priceChangeAbs: 0.2, priceChangePct: 14.2, optionType: 'call', strike: 535, expiration: isoDate(dateDaysAgo(-8)) },
      { symbol: 'MES', positionType: 'future', quantity: 1, marketPrice: 5421, marketValue: 5421, avgCostBasis: 5398, unrealizedPnL: 23, unrealizedPnLPct: 0.43, priceChangeAbs: 7.2, priceChangePct: 0.13 },
    ],
    lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    positionCount: 4,
    hasRealTimeData: true,
  };
}

export function sampleDashboardScatter() {
  const positions = sampleDashboardPositions();
  const closed = baseTrades().filter((trade) => trade.status === 'closed');

  return {
    openPositions: {
      points: [
        ...positions.stocks.map((position) => ({
          id: position.id,
          symbol: position.symbol,
          type: 'stock',
          side: position.side,
          quantity: position.quantity,
          avgPrice: position.avgPrice,
          costBasis: position.costBasis,
          entryDate: position.firstEntryDate,
          entryTimestamp: new Date(`${position.firstEntryDate}T12:00:00.000Z`).getTime(),
          optionType: null,
          strike: null,
          expiration: null,
        })),
        ...positions.options.map((position) => ({
          id: position.id,
          symbol: position.symbol,
          type: 'option',
          side: position.side,
          quantity: position.quantity,
          avgPrice: position.avgPrice,
          costBasis: position.costBasis,
          entryDate: position.firstEntryDate,
          entryTimestamp: new Date(`${position.firstEntryDate}T12:00:00.000Z`).getTime(),
          optionType: position.optionType,
          strike: position.strike,
          expiration: position.expiration,
        })),
      ],
      meta: {
        count: 3,
        priceRange: { min: 1.7, max: 132.2 },
        dateRange: { min: isoDate(dateDaysAgo(8)), max: isoDate(dateDaysAgo(4)) },
      },
    },
    closedTrades: {
      points: closed.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.type,
        side: trade.side,
        quantity: trade.quantity,
        pnl: trade.realizedPnL ?? 0,
        closeDate: trade.closeDate ?? trade.openDate,
        closeTimestamp: new Date(`${trade.closeDate ?? trade.openDate}T12:00:00.000Z`).getTime(),
        openPrice: trade.openPrice,
        closePrice: trade.closePrice ?? trade.openPrice,
        isWin: (trade.realizedPnL ?? 0) > 0,
        isLoss: (trade.realizedPnL ?? 0) < 0,
        hasUnknownBasis: false,
      })),
      meta: {
        count: 3,
        pnlRange: { min: -130, max: 190 },
        dateRange: { min: isoDate(dateDaysAgo(35)), max: isoDate(dateDaysAgo(12)) },
        wins: 2,
        losses: 1,
      },
    },
  };
}

export function sampleDashboardTradeMetrics() {
  const template = {
    avgTradeSize: { stock: 1260, option: 215, total: 563.3 },
    volume: {
      capitalDeployed: { stock: 1260, option: 430, total: 1690 },
      capitalReturned: { stock: 1350, option: 490, total: 1840 },
      totalTraded: 3530,
    },
    tradeCount: { stock: 1, option: 2, total: 3 },
  };

  return {
    timeframes: {
      daily: template,
      weekly: template,
      monthly: template,
      quarterly: template,
      ytd: template,
      last12m: template,
      lastyear: template,
      customRange: null,
    },
    allTime: template,
    periodLabels: {
      daily: 'Today',
      weekly: 'This Week',
      monthly: 'This Month',
      quarterly: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
      ytd: `${new Date().getFullYear()} Year to Date`,
      last12m: 'Last 12 Months',
      lastyear: String(new Date().getFullYear() - 1),
    },
  };
}

export function sampleDashboardCashFlow() {
  const period = {
    contributions: { total: 3200, count: 2, items: [{ date: isoDate(dateDaysAgo(9)), amount: 1600, description: 'ACH deposit' }] },
    withdrawals: { total: 450, count: 1, items: [{ date: isoDate(dateDaysAgo(6)), amount: -450, description: 'ACH withdrawal' }] },
    dividends: { total: 84, count: 2, items: [{ date: isoDate(dateDaysAgo(5)), amount: 42, description: 'Dividend' }] },
    interest: { total: 9, count: 1, items: [{ date: isoDate(dateDaysAgo(3)), amount: 9, description: 'Credit interest' }] },
    fees: { total: 22, count: 2, items: [{ date: isoDate(dateDaysAgo(2)), amount: -11, description: 'Contract fees' }] },
    transfers: { total: 300, count: 1, items: [{ date: isoDate(dateDaysAgo(7)), amount: 300, description: 'Internal transfer' }] },
    netCashFlow: 2821,
  };

  return {
    timeframes: {
      monthly: period,
      quarterly: period,
      ytd: period,
      last12m: period,
      lastyear: period,
      allTime: period,
      customRange: null,
    },
    periodLabels: {
      monthly: 'This Month',
      quarterly: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
      ytd: `${new Date().getFullYear()} Year to Date`,
      last12m: 'Last 12 Months',
      lastyear: String(new Date().getFullYear() - 1),
      allTime: 'All Time',
    },
  };
}

export function sampleDashboardTimeAnalytics() {
  return {
    hourlyStats: Array.from({ length: 24 }).map((_, hour) => ({
      hour,
      label: hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`,
      entryCount: [9, 10, 11, 13].includes(hour) ? 2 : 0,
      exitCount: [11, 12, 14].includes(hour) ? 2 : 0,
      entryPnL: [9, 10, 11, 13].includes(hour) ? (hour % 2 === 0 ? 58 : -22) : 0,
      exitPnL: [11, 12, 14].includes(hour) ? (hour === 14 ? 80 : 24) : 0,
      avgEntryPnL: [9, 10, 11, 13].includes(hour) ? (hour % 2 === 0 ? 29 : -11) : 0,
      avgExitPnL: [11, 12, 14].includes(hour) ? (hour === 14 ? 40 : 12) : 0,
    })),
    holdTimeStats: {
      avgHoldDaysWinners: 6.8,
      avgHoldDaysLosers: 4.2,
      avgHoldDaysAll: 5.9,
      medianHoldDaysWinners: 6,
      medianHoldDaysLosers: 3,
      holdTimeDistribution: [
        { range: 'Same day', winCount: 1, lossCount: 1, totalPnL: 10 },
        { range: '1 day', winCount: 2, lossCount: 1, totalPnL: 60 },
        { range: '2-3 days', winCount: 3, lossCount: 1, totalPnL: 140 },
        { range: '4-7 days', winCount: 2, lossCount: 0, totalPnL: 110 },
      ],
    },
    meta: {
      totalTrades: 12,
      tradesWithTime: 11,
      tradesWithEntryTime: 10,
      tradesWithExitTime: 8,
      percentWithTime: 92,
    },
  };
}

export function sampleDashboardGoals() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 12));

  return {
    goals: [
      {
        goalType: 'weekly',
        targetPnL: 500,
        currentPnL: 320,
        progress: 64,
        isAchieved: false,
        periodStart: isoDate(weekStart),
        periodEnd: isoDate(weekEnd),
        daysRemaining: Math.max(0, Math.ceil((weekEnd.getTime() - now.getTime()) / 86_400_000)),
        tradesInPeriod: 3,
        winsInPeriod: 2,
        streak: 2,
      },
      {
        goalType: 'monthly',
        targetPnL: 2000,
        currentPnL: 1340,
        progress: 67,
        isAchieved: false,
        periodStart: isoDate(monthStart),
        periodEnd: isoDate(monthEnd),
        daysRemaining: Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000)),
        tradesInPeriod: 10,
        winsInPeriod: 7,
        streak: 3,
      },
    ],
    history: {
      weekly: [
        { period: '2026-W04', target: 500, actual: 580, achieved: true },
        { period: '2026-W03', target: 500, actual: 520, achieved: true },
        { period: '2026-W02', target: 500, actual: 430, achieved: false },
      ],
      monthly: [
        { period: isoDate(dateDaysAgo(10)).slice(0, 7), target: 2000, actual: 1340, achieved: false },
      ],
      premium_weekly: [],
      premium_monthly: [],
    },
  };
}

export function sampleDashboardStreaks() {
  return {
    currentStreak: {
      type: 'win',
      count: 2,
      startDate: isoDate(dateDaysAgo(5)),
      trades: [
        { id: 'streak-1', symbol: 'SPY', pnl: 190, date: isoDate(dateDaysAgo(5)) },
        { id: 'streak-2', symbol: 'NVDA', pnl: 90, date: isoDate(dateDaysAgo(4)) },
      ],
    },
    longestWinStreak: {
      type: 'win',
      count: 3,
      startDate: isoDate(dateDaysAgo(18)),
      trades: [
        { id: 'streak-3', symbol: 'SPY', pnl: 80, date: isoDate(dateDaysAgo(18)) },
        { id: 'streak-4', symbol: 'QQQ', pnl: 60, date: isoDate(dateDaysAgo(17)) },
        { id: 'streak-5', symbol: 'SPY', pnl: 70, date: isoDate(dateDaysAgo(16)) },
      ],
    },
    longestLossStreak: {
      type: 'loss',
      count: 1,
      startDate: isoDate(dateDaysAgo(10)),
      trades: [{ id: 'streak-6', symbol: 'QQQ', pnl: -130, date: isoDate(dateDaysAgo(10)) }],
    },
    totalStreaks: {
      winStreaks: 3,
      lossStreaks: 2,
      avgWinStreakLength: 1.7,
      avgLossStreakLength: 1.3,
    },
    recentTrades: [
      { id: 'rt-1', symbol: 'SPY', pnl: 190, date: isoDate(dateDaysAgo(5)), isWin: true },
      { id: 'rt-2', symbol: 'NVDA', pnl: 90, date: isoDate(dateDaysAgo(4)), isWin: true },
      { id: 'rt-3', symbol: 'QQQ', pnl: -130, date: isoDate(dateDaysAgo(10)), isWin: false },
    ],
    streakMetrics: {
      currentStreakPnL: 280,
      recoveryRate: 67,
      maxConsecutiveGreenDays: 3,
    },
  };
}

export function sampleDashboardOptionsAnalytics() {
  return {
    summary: {
      totalTrades: 26,
      totalPnL: 1432.5,
      winRate: 69,
      avgDTE: 12.4,
      wins: 18,
      losses: 8,
    },
    dte: {
      buckets: [
        { label: 'Same day', tradeCount: 2, totalPnL: 38, wins: 1, losses: 1, winRate: 50, avgPnL: 19, avgHoldTime: 0, totalVolume: 620 },
        { label: '1 day', tradeCount: 4, totalPnL: 165, wins: 3, losses: 1, winRate: 75, avgPnL: 41.25, avgHoldTime: 1, totalVolume: 1240 },
        { label: '2 days', tradeCount: 3, totalPnL: 112, wins: 2, losses: 1, winRate: 67, avgPnL: 37.33, avgHoldTime: 2, totalVolume: 980 },
        { label: '3 days', tradeCount: 3, totalPnL: 144, wins: 2, losses: 1, winRate: 67, avgPnL: 48, avgHoldTime: 3, totalVolume: 1160 },
        { label: '4 days', tradeCount: 2, totalPnL: 72, wins: 1, losses: 1, winRate: 50, avgPnL: 36, avgHoldTime: 4, totalVolume: 880 },
        { label: '5 days', tradeCount: 3, totalPnL: 210, wins: 3, losses: 0, winRate: 100, avgPnL: 70, avgHoldTime: 5, totalVolume: 1500 },
        { label: '6 days', tradeCount: 2, totalPnL: 96, wins: 2, losses: 0, winRate: 100, avgPnL: 48, avgHoldTime: 6, totalVolume: 940 },
        { label: '7 days', tradeCount: 2, totalPnL: 88, wins: 1, losses: 1, winRate: 50, avgPnL: 44, avgHoldTime: 7, totalVolume: 920 },
        { label: '8 days', tradeCount: 1, totalPnL: 42, wins: 1, losses: 0, winRate: 100, avgPnL: 42, avgHoldTime: 8, totalVolume: 410 },
        { label: '9 days', tradeCount: 1, totalPnL: -36, wins: 0, losses: 1, winRate: 0, avgPnL: -36, avgHoldTime: 9, totalVolume: 390 },
        { label: '10+ days', tradeCount: 3, totalPnL: 501.5, wins: 2, losses: 1, winRate: 67, avgPnL: 167.17, avgHoldTime: 16, totalVolume: 2240 },
      ],
      sweetSpot: {
        range: '5 days',
        winRate: 100,
        avgPnL: 70,
        reason: 'Best consistency with strong average premium capture.',
      },
    },
    strategy: {
      byStrategy: [
        { strategy: 'covered_call', displayName: 'Covered Call', tradeCount: 11, totalPnL: 612, wins: 8, losses: 3, winRate: 73, avgPnL: 55.64, avgHoldTime: 7.8, avgDTE: 11.3 },
        { strategy: 'cash_secured_put', displayName: 'Cash Secured Put', tradeCount: 9, totalPnL: 544, wins: 7, losses: 2, winRate: 78, avgPnL: 60.44, avgHoldTime: 8.1, avgDTE: 12.8 },
        { strategy: 'put_credit_spread', displayName: 'Put Credit Spread', tradeCount: 4, totalPnL: 228, wins: 2, losses: 2, winRate: 50, avgPnL: 57, avgHoldTime: 5.3, avgDTE: 9.4 },
        { strategy: 'long_call', displayName: 'Long Call', tradeCount: 2, totalPnL: 48.5, wins: 1, losses: 1, winRate: 50, avgPnL: 24.25, avgHoldTime: 4.5, avgDTE: 6.5 },
      ],
      comparison: {
        mostProfitable: 'Covered Call',
        mostProfitablePnL: 612,
        highestWinRate: 'Cash Secured Put',
        highestWinRatePct: 78,
        mostActive: 'Covered Call',
        mostActiveCount: 11,
      },
    },
    winLoss: {
      wins: {
        totalPnL: 1840,
        tradeCount: 18,
        avgPnL: 102.22,
        medianPnL: 86,
        largestTrade: 240,
        avgHoldTime: 7.1,
        avgDTE: 11.8,
        totalVolume: 8220,
        maxConsecutive: 5,
        cumulativeDaily: [
          { date: isoDate(dateDaysAgo(26)), cumPnL: 95, count: 1 },
          { date: isoDate(dateDaysAgo(21)), cumPnL: 261, count: 2 },
          { date: isoDate(dateDaysAgo(17)), cumPnL: 418, count: 1 },
          { date: isoDate(dateDaysAgo(13)), cumPnL: 644, count: 2 },
          { date: isoDate(dateDaysAgo(9)), cumPnL: 932, count: 3 },
          { date: isoDate(dateDaysAgo(5)), cumPnL: 1268, count: 4 },
          { date: isoDate(dateDaysAgo(2)), cumPnL: 1840, count: 5 },
        ],
      },
      losses: {
        totalPnL: -407.5,
        tradeCount: 8,
        avgPnL: -50.94,
        medianPnL: -42,
        largestTrade: -132,
        avgHoldTime: 4.9,
        avgDTE: 8.6,
        totalVolume: 3980,
        maxConsecutive: 2,
        cumulativeDaily: [
          { date: isoDate(dateDaysAgo(24)), cumPnL: -44, count: 1 },
          { date: isoDate(dateDaysAgo(18)), cumPnL: -112, count: 1 },
          { date: isoDate(dateDaysAgo(14)), cumPnL: -188, count: 2 },
          { date: isoDate(dateDaysAgo(8)), cumPnL: -275, count: 2 },
          { date: isoDate(dateDaysAgo(3)), cumPnL: -407.5, count: 2 },
        ],
      },
      streaks: {
        currentType: 'win',
        currentCount: 3,
        longestWin: 5,
        longestLoss: 2,
      },
      recovery: {
        recoveryRate: 63,
        avgRecoveryDays: 2.4,
        avgRecoveryAmount: 118.3,
        bounceBackRatio: 2.01,
      },
    },
    exitType: {
      breakdown: [
        { exitType: 'expired', count: 10, totalPnL: 721, avgPnL: 72.1, winRate: 80, avgHoldTime: 9.2 },
        { exitType: 'assigned', count: 3, totalPnL: 214, avgPnL: 71.33, winRate: 67, avgHoldTime: 11.7 },
        { exitType: 'closed_early', count: 9, totalPnL: 372.5, avgPnL: 41.39, winRate: 67, avgHoldTime: 4.4 },
        { exitType: 'closed_at_expiry', count: 4, totalPnL: 125, avgPnL: 31.25, winRate: 50, avgHoldTime: 8.9 },
      ],
      recommendations: [
        { type: 'hold_longer', message: 'Expired trades show stronger win-rate than early exits. Let high-quality setups breathe when risk is controlled.' },
      ],
    },
    premium: {
      credit: {
        totalReceived: 4210,
        totalKept: 2980,
        captureRate: 71,
        tradeCount: 20,
      },
      debit: {
        totalPaid: 1620,
        totalPnL: 142.5,
        avgReturn: 8.8,
        tradeCount: 6,
      },
    },
    positionSizing: {
      buckets: [
        { label: 'Micro ($0-500)', tradeCount: 6, totalPnL: 188, wins: 4, losses: 2, winRate: 67, avgPnL: 31.33, avgSize: 320 },
        { label: 'Small ($501-2K)', tradeCount: 13, totalPnL: 698.5, wins: 10, losses: 3, winRate: 77, avgPnL: 53.73, avgSize: 1150 },
        { label: 'Medium ($2K-5K)', tradeCount: 6, totalPnL: 421, wins: 3, losses: 3, winRate: 50, avgPnL: 70.17, avgSize: 2850 },
        { label: 'Large ($5K-10K)', tradeCount: 1, totalPnL: 125, wins: 1, losses: 0, winRate: 100, avgPnL: 125, avgSize: 5600 },
      ],
      optimalRange: {
        label: 'Small ($501-2K)',
        winRate: 77,
        avgPnL: 53.73,
        reason: 'Most balanced mix of win-rate and repeatable premium capture.',
      },
      concentration: [
        { symbol: 'SPY', tradeCount: 10, totalPnL: 592, percentage: 38, winRate: 70 },
        { symbol: 'QQQ', tradeCount: 8, totalPnL: 348, percentage: 31, winRate: 63 },
        { symbol: 'IWM', tradeCount: 4, totalPnL: 221, percentage: 15, winRate: 75 },
        { symbol: 'NVDA', tradeCount: 2, totalPnL: 152.5, percentage: 8, winRate: 50 },
        { symbol: 'AAPL', tradeCount: 2, totalPnL: 119, percentage: 8, winRate: 100 },
      ],
      avgPositionSize: 1480,
      medianPositionSize: 1120,
    },
  };
}

export function sampleDashboardOptionsTiming() {
  return {
    summary: {
      totalTrades: 26,
      totalPnL: 1432.5,
      winRate: 69,
    },
    expiryCycles: {
      weekly: {
        tradeCount: 16,
        totalPnL: 904,
        winRate: 75,
        avgPnL: 56.5,
        avgHoldTime: 6.2,
      },
      monthly: {
        tradeCount: 10,
        totalPnL: 528.5,
        winRate: 60,
        avgPnL: 52.85,
        avgHoldTime: 10.8,
      },
      insight: 'Weekly expirations have delivered better consistency for your recent setups.',
    },
    opexWeek: {
      opex: {
        tradeCount: 7,
        totalPnL: 468,
        winRate: 71,
        avgPnL: 66.86,
        avgHoldTime: 6.8,
      },
      nonOpex: {
        tradeCount: 19,
        totalPnL: 964.5,
        winRate: 68,
        avgPnL: 50.76,
        avgHoldTime: 7.9,
      },
      insight: 'Performance is slightly stronger during OpEx week, but both regimes remain profitable.',
    },
    dayOfWeek: {
      byDay: [
        { day: 'Monday', dayNum: 1, entryCount: 6, exitCount: 5, entryPnL: 362, exitPnL: 295, entryWinRate: 67, exitWinRate: 60 },
        { day: 'Tuesday', dayNum: 2, entryCount: 4, exitCount: 4, entryPnL: 188, exitPnL: 172, entryWinRate: 75, exitWinRate: 75 },
        { day: 'Wednesday', dayNum: 3, entryCount: 5, exitCount: 6, entryPnL: 210, exitPnL: 284, entryWinRate: 60, exitWinRate: 67 },
        { day: 'Thursday', dayNum: 4, entryCount: 6, exitCount: 7, entryPnL: 398, exitPnL: 412.5, entryWinRate: 83, exitWinRate: 71 },
        { day: 'Friday', dayNum: 5, entryCount: 5, exitCount: 4, entryPnL: 274.5, exitPnL: 269, entryWinRate: 60, exitWinRate: 75 },
      ],
      bestEntryDay: { day: 'Thursday', winRate: 83, count: 6 },
      bestExitDay: { day: 'Friday', winRate: 75, count: 4 },
    },
    seasonality: {
      byMonth: [
        { month: 'Sep', monthNum: 8, tradeCount: 4, totalPnL: 198, winRate: 75, avgPnL: 49.5 },
        { month: 'Oct', monthNum: 9, tradeCount: 5, totalPnL: 264, winRate: 60, avgPnL: 52.8 },
        { month: 'Nov', monthNum: 10, tradeCount: 6, totalPnL: 332, winRate: 67, avgPnL: 55.33 },
        { month: 'Dec', monthNum: 11, tradeCount: 4, totalPnL: 246.5, winRate: 75, avgPnL: 61.63 },
        { month: 'Jan', monthNum: 0, tradeCount: 4, totalPnL: 188, winRate: 50, avgPnL: 47 },
        { month: 'Feb', monthNum: 1, tradeCount: 3, totalPnL: 204, winRate: 67, avgPnL: 68 },
      ],
      bestMonth: { month: 'Nov', pnl: 332, winRate: 67 },
      worstMonth: { month: 'Jan', pnl: 188, winRate: 50 },
      byQuarter: [
        { quarter: 'Q3', quarterNum: 3, tradeCount: 4, totalPnL: 198, winRate: 75 },
        { quarter: 'Q4', quarterNum: 4, tradeCount: 15, totalPnL: 842.5, winRate: 67 },
        { quarter: 'Q1', quarterNum: 1, tradeCount: 7, totalPnL: 392, winRate: 57 },
      ],
    },
    rolls: {
      stats: {
        totalRolls: 6,
        successfulRolls: 4,
        successRate: 67,
        avgRollCredit: 52.5,
        totalRollPnL: 315,
        avgDaysExtended: 11.3,
      },
      bySymbol: [
        { symbol: 'SPY', rollCount: 3, successRate: 67, totalCredit: 182 },
        { symbol: 'QQQ', rollCount: 2, successRate: 50, totalCredit: 88 },
        { symbol: 'IWM', rollCount: 1, successRate: 100, totalCredit: 45 },
      ],
      insight: 'Rolls are adding net credit overall. Keep using them selectively when risk flags are controlled.',
    },
  };
}

export function sampleDashboardWheel() {
  return {
    totalPremiumCollected: 1164,
    coveredCallPremium: 612,
    cashSecuredPutPremium: 552,
    coveredCallCount: 11,
    cashSecuredPutCount: 9,
    expirations: 8,
    assignments: 4,
    earlyCloses: 8,
    activePositions: 2,
    activeCoveredCalls: 1,
    activeCashSecuredPuts: 1,
    pendingPremium: 388,
    pendingCoveredCallPremium: 172,
    pendingCashSecuredPutPremium: 216,
    totalCollateral: 112500,
    cspCollateral: 56500,
    ccCollateral: 56000,
    winRate: 70,
    avgPremiumPerTrade: 58.2,
    symbols: [
      { symbol: 'SPY', premium: 544, tradeCount: 8, coveredCalls: 4, cashSecuredPuts: 4, assignments: 2 },
      { symbol: 'QQQ', premium: 328, tradeCount: 6, coveredCalls: 4, cashSecuredPuts: 2, assignments: 1 },
      { symbol: 'IWM', premium: 172, tradeCount: 4, coveredCalls: 2, cashSecuredPuts: 2, assignments: 1 },
      { symbol: 'AAPL', premium: 120, tradeCount: 2, coveredCalls: 1, cashSecuredPuts: 1, assignments: 0 },
    ],
    recentTrades: [
      {
        id: 'wheel-recent-1',
        symbol: 'SPY',
        type: 'Covered Call',
        strike: 580,
        expiration: isoDate(dateDaysAgo(-7)),
        closeReason: 'expired',
        closeDate: isoDate(dateDaysAgo(2)),
        premium: 82,
      },
      {
        id: 'wheel-recent-2',
        symbol: 'QQQ',
        type: 'Cash Secured Put',
        strike: 525,
        expiration: isoDate(dateDaysAgo(-9)),
        closeReason: 'normal',
        closeDate: isoDate(dateDaysAgo(4)),
        premium: 56,
      },
    ],
    openPositions: [
      {
        id: 'wheel-open-1',
        ledgerEventId: 'wheel-open-ledger-1',
        symbol: 'SPY',
        type: 'Cash Secured Put',
        strike: 570,
        expiration: isoDate(dateDaysAgo(-10)),
        quantity: 1,
        pendingPremium: 216,
        entryDate: isoDate(dateDaysAgo(7)),
        collateral: 57000,
      },
      {
        id: 'wheel-open-2',
        ledgerEventId: 'wheel-open-ledger-2',
        symbol: 'QQQ',
        type: 'Covered Call',
        strike: 560,
        expiration: isoDate(dateDaysAgo(-12)),
        quantity: 1,
        pendingPremium: 172,
        entryDate: isoDate(dateDaysAgo(6)),
        collateral: 56000,
      },
    ],
    assignmentStats: {
      totalTrades: 20,
      totalAssignments: 4,
      assignmentRate: 20,
      avgDaysToAssignment: 9.5,
      avgPremiumOnAssigned: 64.5,
      avgPremiumOnExpired: 72.8,
      bySymbol: [
        { symbol: 'SPY', trades: 8, assignments: 2, assignmentRate: 25, avgDaysToAssignment: 10.5 },
        { symbol: 'QQQ', trades: 6, assignments: 1, assignmentRate: 16.67, avgDaysToAssignment: 8 },
        { symbol: 'IWM', trades: 4, assignments: 1, assignmentRate: 25, avgDaysToAssignment: 9 },
      ],
    },
    wheelCycles: {
      stats: {
        totalCycles: 3,
        activeCycles: 1,
        completedCycles: 2,
        totalPremium: 842,
        avgPremiumPerCycle: 280.67,
        avgCCPerCycle: 1.7,
      },
      cycles: [
        {
          id: 'wheel-cycle-1',
          symbol: 'SPY',
          startDate: isoDate(dateDaysAgo(54)),
          endDate: isoDate(dateDaysAgo(18)),
          status: 'completed',
          cspTrade: {
            id: 'wheel-csp-1',
            openDate: isoDate(dateDaysAgo(54)),
            closeDate: isoDate(dateDaysAgo(44)),
            strike: 555,
            premium: 132,
            closeReason: 'assigned',
          },
          stockAcquired: true,
          stockAcquisitionDate: isoDate(dateDaysAgo(44)),
          stockAcquisitionPrice: 555,
          ccTrades: [
            {
              id: 'wheel-cc-1',
              openDate: isoDate(dateDaysAgo(41)),
              closeDate: isoDate(dateDaysAgo(32)),
              strike: 565,
              premium: 74,
              closeReason: 'expired',
            },
            {
              id: 'wheel-cc-2',
              openDate: isoDate(dateDaysAgo(27)),
              closeDate: isoDate(dateDaysAgo(18)),
              strike: 570,
              premium: 88,
              closeReason: 'assigned',
            },
          ],
          totalPremium: 294,
          totalCycles: 2,
        },
        {
          id: 'wheel-cycle-2',
          symbol: 'QQQ',
          startDate: isoDate(dateDaysAgo(37)),
          endDate: null,
          status: 'active',
          cspTrade: {
            id: 'wheel-csp-2',
            openDate: isoDate(dateDaysAgo(37)),
            closeDate: isoDate(dateDaysAgo(29)),
            strike: 510,
            premium: 116,
            closeReason: 'assigned',
          },
          stockAcquired: true,
          stockAcquisitionDate: isoDate(dateDaysAgo(29)),
          stockAcquisitionPrice: 510,
          ccTrades: [
            {
              id: 'wheel-cc-3',
              openDate: isoDate(dateDaysAgo(22)),
              closeDate: isoDate(dateDaysAgo(13)),
              strike: 525,
              premium: 78,
              closeReason: 'expired',
            },
          ],
          totalPremium: 194,
          totalCycles: 1,
        },
      ],
    },
    rolls: {
      stats: {
        totalRolls: 5,
        totalNetCredit: 248,
        avgNetCredit: 49.6,
        avgDaysExtended: 10.8,
        byType: {
          up: 1,
          down: 1,
          out: 1,
          upAndOut: 1,
          downAndOut: 1,
        },
      },
      recentRolls: [
        {
          id: 'wheel-roll-1',
          symbol: 'SPY',
          rollDate: isoDate(dateDaysAgo(6)),
          originalStrike: 575,
          originalExpiration: isoDate(dateDaysAgo(-3)),
          originalType: 'Cash Secured Put',
          closePremium: -84,
          newStrike: 570,
          newExpiration: isoDate(dateDaysAgo(-10)),
          newPremium: 216,
          netCredit: 132,
          rollType: 'down_and_out',
          daysExtended: 7,
        },
      ],
    },
  };
}

export function sampleDashboardIncomeWheel() {
  const weeklyPremiumHistory = Array.from({ length: 12 }).map((_, idx) => {
    const weekStart = dateDaysAgo((11 - idx) * 7 + 6);
    const weekEnd = dateDaysAgo((11 - idx) * 7);
    const premium = [84, 62, 95, 118, 73, 140, 102, 88, 126, 92, 134, 104][idx];
    const ccPremium = round(premium * 0.48);
    const cspPremium = round(premium - ccPremium);

    return {
      weekStart: isoDate(weekStart),
      weekEnd: isoDate(weekEnd),
      premium,
      tradeCount: 1 + (idx % 2),
      ccPremium,
      cspPremium,
    };
  });

  const monthlyPremiumHistory = Array.from({ length: 6 }).map((_, idx) => {
    const monthDate = new Date();
    monthDate.setUTCDate(1);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - (5 - idx));
    const month = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const premium = [392, 418, 366, 442, 501, 468][idx];
    const ccPremium = round(premium * 0.52);
    const cspPremium = round(premium - ccPremium);

    return {
      month,
      year: monthDate.getUTCFullYear(),
      premium,
      tradeCount: 4 + (idx % 3),
      ccPremium,
      cspPremium,
    };
  });

  return {
    incomeMetrics: {
      totalPremiumRealized: 2587,
      totalPremiumPending: 388,
      totalCollateralAtRisk: 112500,
      premiumLast7Days: 104,
      premiumLast30Days: 468,
      premiumLast90Days: 1354,
      premiumYTD: 1652,
      premium52Weeks: 4128,
      yieldOnCollateral: 0.34,
      annualizedYield: 8.72,
      weeklyAvgPremium: 79.38,
      monthlyAvgPremium: 343.7,
      totalTrades: 42,
      winRate: 71,
      avgPremiumPerTrade: 61.6,
      avgDTE: 9.8,
      ccPremiumRealized: 1344,
      cspPremiumRealized: 1243,
      ccCount: 23,
      cspCount: 19,
    },
    activePositions: [
      {
        id: 'income-open-1',
        ledgerEventId: 'income-open-ledger-1',
        symbol: 'SPY',
        strategy: 'cash_secured_put',
        strike: 570,
        expiration: isoDate(dateDaysAgo(-10)),
        dte: 10,
        quantity: 1,
        premium: 216,
        collateral: 57000,
        yieldOnCollateral: 0.38,
        annualizedYield: 13.87,
        entryDate: isoDate(dateDaysAgo(7)),
      },
      {
        id: 'income-open-2',
        ledgerEventId: 'income-open-ledger-2',
        symbol: 'QQQ',
        strategy: 'covered_call',
        strike: 560,
        expiration: isoDate(dateDaysAgo(-12)),
        dte: 12,
        quantity: 1,
        premium: 172,
        collateral: 56000,
        yieldOnCollateral: 0.31,
        annualizedYield: 9.24,
        entryDate: isoDate(dateDaysAgo(6)),
      },
    ],
    weeklyPremiumHistory,
    monthlyPremiumHistory,
    stockHoldings: [
      {
        symbol: 'SPY',
        shares: 100,
        acquisitionDate: isoDate(dateDaysAgo(44)),
        acquisitionPrice: 555,
        totalPremiumCollected: 624,
        effectiveCostBasis: 548.76,
        currentCCStrike: 580,
        ccPremiumPending: 172,
      },
      {
        symbol: 'QQQ',
        shares: 100,
        acquisitionDate: isoDate(dateDaysAgo(29)),
        acquisitionPrice: 510,
        totalPremiumCollected: 498,
        effectiveCostBasis: 505.02,
        currentCCStrike: 560,
        ccPremiumPending: 0,
      },
    ],
    recentTrades: [
      {
        id: 'income-trade-1',
        symbol: 'SPY',
        strategy: 'covered_call',
        strike: 580,
        expiration: isoDate(dateDaysAgo(-7)),
        openDate: isoDate(dateDaysAgo(11)),
        closeDate: isoDate(dateDaysAgo(2)),
        closeReason: 'expired',
        premium: 82,
        daysHeld: 9,
      },
      {
        id: 'income-trade-2',
        symbol: 'QQQ',
        strategy: 'cash_secured_put',
        strike: 525,
        expiration: isoDate(dateDaysAgo(-9)),
        openDate: isoDate(dateDaysAgo(13)),
        closeDate: isoDate(dateDaysAgo(4)),
        closeReason: 'normal',
        premium: 56,
        daysHeld: 9,
      },
    ],
    symbolPerformance: [
      { symbol: 'SPY', premium: 1122, trades: 18, ccCount: 10, cspCount: 8, assignments: 3, avgPremium: 62.33 },
      { symbol: 'QQQ', premium: 904, trades: 14, ccCount: 8, cspCount: 6, assignments: 2, avgPremium: 64.57 },
      { symbol: 'IWM', premium: 561, trades: 10, ccCount: 5, cspCount: 5, assignments: 1, avgPremium: 56.1 },
    ],
  };
}

export function sampleDashboardWheelTickerList() {
  return {
    tickers: [
      { symbol: 'SPY', totalPremium: 1122, tradeCount: 18, lastTradeDate: isoDate(dateDaysAgo(2)) },
      { symbol: 'QQQ', totalPremium: 904, tradeCount: 14, lastTradeDate: isoDate(dateDaysAgo(4)) },
      { symbol: 'IWM', totalPremium: 561, tradeCount: 10, lastTradeDate: isoDate(dateDaysAgo(6)) },
    ],
    totalTickers: 3,
  };
}

export function sampleDashboardWheelTicker(symbol: string) {
  const ticker = symbol.toUpperCase();
  const isSpy = ticker === 'SPY';
  const baseStrike = isSpy ? 570 : 530;
  const altStrike = baseStrike + 10;

  return {
    symbol: ticker,
    summary: {
      totalTrades: 14,
      ccTrades: 8,
      cspTrades: 6,
      totalPremium: 904,
      ccPremium: 486,
      cspPremium: 418,
      winRate: 71.43,
      assignments: 2,
      expirations: 6,
      earlyCloses: 6,
      assignmentRate: 14.29,
      avgDTE: 9.6,
      avgPremium: 64.57,
      firstTradeDate: isoDate(dateDaysAgo(92)),
      lastTradeDate: isoDate(dateDaysAgo(4)),
    },
    strikeStats: [
      {
        strike: baseStrike,
        totalTrades: 6,
        ccTrades: 3,
        cspTrades: 3,
        totalPremium: 372,
        avgPremium: 62,
        winRate: 67,
        assignments: 1,
        assignmentRate: 16.67,
        avgDTE: 9.2,
      },
      {
        strike: altStrike,
        totalTrades: 5,
        ccTrades: 3,
        cspTrades: 2,
        totalPremium: 336,
        avgPremium: 67.2,
        winRate: 80,
        assignments: 1,
        assignmentRate: 20,
        avgDTE: 10.1,
      },
    ],
    monthlyBreakdown: [
      { month: '2025-10', premium: 182, tradeCount: 3, ccPremium: 96, cspPremium: 86 },
      { month: '2025-11', premium: 214, tradeCount: 3, ccPremium: 108, cspPremium: 106 },
      { month: '2025-12', premium: 168, tradeCount: 2, ccPremium: 84, cspPremium: 84 },
      { month: '2026-01', premium: 340, tradeCount: 6, ccPremium: 198, cspPremium: 142 },
    ],
    weeklyBreakdown: [
      { week: '2026-W03', weekLabel: 'Jan 13', premium: 84, tradeCount: 1, ccPremium: 84, cspPremium: 0 },
      { week: '2026-W04', weekLabel: 'Jan 20', premium: 126, tradeCount: 2, ccPremium: 62, cspPremium: 64 },
      { week: '2026-W05', weekLabel: 'Jan 27', premium: 98, tradeCount: 2, ccPremium: 48, cspPremium: 50 },
      { week: '2026-W06', weekLabel: 'Feb 3', premium: 132, tradeCount: 2, ccPremium: 76, cspPremium: 56 },
    ],
    activePositions: [
      {
        id: `${ticker}-active-1`,
        ledgerEventId: `${ticker}-active-ledger-1`,
        optionType: 'put',
        strategy: 'cash_secured_put',
        strike: baseStrike,
        expiration: isoDate(dateDaysAgo(-10)),
        dte: 10,
        quantity: 1,
        premium: 216,
        collateral: baseStrike * 100,
        entryDate: isoDate(dateDaysAgo(7)),
      },
      {
        id: `${ticker}-active-2`,
        ledgerEventId: `${ticker}-active-ledger-2`,
        optionType: 'call',
        strategy: 'covered_call',
        strike: altStrike,
        expiration: isoDate(dateDaysAgo(-12)),
        dte: 12,
        quantity: 1,
        premium: 172,
        collateral: altStrike * 100,
        entryDate: isoDate(dateDaysAgo(6)),
      },
    ],
    timeline: [
      {
        id: `${ticker}-trade-1`,
        symbol: ticker,
        optionType: 'put',
        strategy: 'cash_secured_put',
        strike: baseStrike,
        expiration: isoDate(dateDaysAgo(84)),
        openDate: isoDate(dateDaysAgo(92)),
        closeDate: isoDate(dateDaysAgo(84)),
        closeReason: 'assigned',
        premium: 132,
        daysHeld: 8,
        quantity: 1,
      },
      {
        id: `${ticker}-trade-2`,
        symbol: ticker,
        optionType: 'call',
        strategy: 'covered_call',
        strike: altStrike,
        expiration: isoDate(dateDaysAgo(76)),
        openDate: isoDate(dateDaysAgo(83)),
        closeDate: isoDate(dateDaysAgo(76)),
        closeReason: 'expired',
        premium: 74,
        daysHeld: 7,
        quantity: 1,
      },
      {
        id: `${ticker}-trade-3`,
        symbol: ticker,
        optionType: 'call',
        strategy: 'covered_call',
        strike: altStrike + 5,
        expiration: isoDate(dateDaysAgo(67)),
        openDate: isoDate(dateDaysAgo(74)),
        closeDate: isoDate(dateDaysAgo(67)),
        closeReason: 'normal',
        premium: 56,
        daysHeld: 7,
        quantity: 1,
      },
    ],
    recentTrades: [
      {
        id: `${ticker}-recent-1`,
        symbol: ticker,
        optionType: 'call',
        strategy: 'covered_call',
        strike: altStrike,
        expiration: isoDate(dateDaysAgo(-7)),
        openDate: isoDate(dateDaysAgo(11)),
        closeDate: isoDate(dateDaysAgo(2)),
        closeReason: 'expired',
        premium: 82,
        daysHeld: 9,
        quantity: 1,
      },
      {
        id: `${ticker}-recent-2`,
        symbol: ticker,
        optionType: 'put',
        strategy: 'cash_secured_put',
        strike: baseStrike,
        expiration: isoDate(dateDaysAgo(-9)),
        openDate: isoDate(dateDaysAgo(13)),
        closeDate: isoDate(dateDaysAgo(4)),
        closeReason: 'normal',
        premium: 56,
        daysHeld: 9,
        quantity: 1,
      },
    ],
    costBasisEvolution: {
      shares: 100,
      originalCostBasis: baseStrike * 100,
      avgPrice: baseStrike,
      historicalAverageEntryPrice: round(baseStrike + 2.35),
      historicalBoughtShares: 400,
      totalPremiumCollected: 904,
      effectiveCostBasis: round(baseStrike - 9.04),
      reductionPerShare: 9.04,
      totalContractShares: 1400,
      methodology: 'lifetime_wheel_premium_per_current_share',
    },
    weeklyReturnInsights: {
      currentPrice: baseStrike + 18,
      sharesOwned: 100,
      lastPriceUpdate: new Date(Date.now() - 4 * 60_000).toISOString(),
      ccWeeklyReturn: 0.47,
      cspWeeklyReturn: 0.42,
      totalWeeklyReturn: 0.45,
      annualizedCCReturn: 24.44,
      annualizedCSPReturn: 21.84,
      annualizedTotalReturn: 23.4,
      ccTradeCount: 8,
      cspTradeCount: 6,
      avgDTEUsed: 9.6,
    },
    simulatorData: {
      avgCCPremiumPct: 1.18,
      avgCSPPremiumPct: 1.11,
      avgDTEAtOpen: 10.2,
      avgDaysHeld: 8.7,
      assignmentRate: 14.29,
      premiumByDTE: [
        { dteRange: '0-7 DTE', avgPremiumPct: 0.84, tradeCount: 3 },
        { dteRange: '8-14 DTE', avgPremiumPct: 1.16, tradeCount: 7 },
        { dteRange: '15-30 DTE', avgPremiumPct: 1.44, tradeCount: 4 },
        { dteRange: '31-45 DTE', avgPremiumPct: 0, tradeCount: 0 },
        { dteRange: '45+ DTE', avgPremiumPct: 0, tradeCount: 0 },
      ],
      strikeDistancePerformance: [],
    },

    // Single-stock features
    playbook: {
      bestDteBucket: { range: '8-14d', winRate: 86, tradeCount: 7 },
      bestStrikeDistance: { range: '3-5%', winRate: 83, tradeCount: 5 },
      bestDayOfWeek: { day: 'Mon', winRate: 90 },
      strategyEdge: { winner: 'csp' as const, cspWinRate: 86, ccWinRate: 80 },
      premiumRegime: 'normal' as const,
      assignmentDangerZone: null,
    },
    bagholdRecovery: null,
    strikeHeatmap: {
      cells: [
        { strike: baseStrike, dteBucket: '0-7d', tradeCount: 2, winRate: 100, avgPremium: 42 },
        { strike: baseStrike, dteBucket: '8-14d', tradeCount: 4, winRate: 75, avgPremium: 68 },
        { strike: baseStrike, dteBucket: '15-30d', tradeCount: 2, winRate: 100, avgPremium: 95 },
        { strike: altStrike, dteBucket: '0-7d', tradeCount: 1, winRate: 100, avgPremium: 35 },
        { strike: altStrike, dteBucket: '8-14d', tradeCount: 3, winRate: 67, avgPremium: 55 },
        { strike: altStrike, dteBucket: '15-30d', tradeCount: 2, winRate: 50, avgPremium: 80 },
      ],
      strikes: [baseStrike, altStrike],
      dteBuckets: ['0-7d', '8-14d', '15-30d', '31-45d', '45+d'],
    },
    strikeDistanceAnalysis: {
      cc: [
        { distancePct: '0-2%', avgDistanceDollars: 5.20, tradeCount: 3, totalPremium: 186, avgPremium: 62, winRate: 67, assignmentRate: 33, avgDaysHeld: 8.2 },
        { distancePct: '2-5%', avgDistanceDollars: 18.50, tradeCount: 3, totalPremium: 204, avgPremium: 68, winRate: 100, assignmentRate: 0, avgDaysHeld: 9.5 },
        { distancePct: '5-10%', avgDistanceDollars: 38.00, tradeCount: 2, totalPremium: 96, avgPremium: 48, winRate: 100, assignmentRate: 0, avgDaysHeld: 7.0 },
      ],
      csp: [
        { distancePct: '0-2%', avgDistanceDollars: 4.80, tradeCount: 2, totalPremium: 148, avgPremium: 74, winRate: 50, assignmentRate: 50, avgDaysHeld: 8.0 },
        { distancePct: '2-5%', avgDistanceDollars: 16.20, tradeCount: 3, totalPremium: 198, avgPremium: 66, winRate: 100, assignmentRate: 0, avgDaysHeld: 10.3 },
        { distancePct: '5-10%', avgDistanceDollars: 32.00, tradeCount: 1, totalPremium: 72, avgPremium: 72, winRate: 100, assignmentRate: 0, avgDaysHeld: 11.0 },
      ],
      tradesWithData: 14,
      tradesWithoutData: 0,
    },
    concentrationRisk: {
      openCspCollateral: isSpy ? 57000 : 53000,
      totalCollateralAtRisk: isSpy ? 114000 : 106000,
      buyingPower: 250000,
      collateralUtilization: isSpy ? 45.6 : 42.4,
      ytdPremiumCollected: isSpy ? 1122 : 904,
      premiumBufferPct: isSpy ? 0.98 : 0.85,
      maxPainLoss: 0,
      maxPainDescription: 'No open CSP positions',
    },
  };
}
