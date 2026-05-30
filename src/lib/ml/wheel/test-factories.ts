/**
 * Synthetic Trade Factory for Wheel ML Tests
 *
 * Pure TypeScript, no DB, no TF.js.
 * Provides mock RealizedClose-shaped objects for unit tests.
 */

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMD', 'AMZN', 'GOOG', 'META'];
const STRATEGIES = ['cash_secured_put', 'covered_call'] as const;

interface MockWheelTrade {
  id: string;
  userId: string;
  brokerageAccountId: string;
  symbol: string;
  closeType: string;
  side: string;
  optionType: string;
  strike: number;
  expiration: Date;
  strategy: string;
  openDate: Date;
  closeDate: Date;
  quantity: number;
  openPrice: number;
  closePrice: number;
  openAmount: number;
  closeAmount: number;
  realizedPnL: number;
  fees: number;
  closeReason: string;
  underlyingPriceAtOpen: number;
  underlyingPriceAtClose: number;
  isAssignment: boolean;
  isWheelTrade: boolean;
  hasUnknownBasis: boolean;
  derivedAt: Date;
  derivationVersion: number;
}

/**
 * Create a single mock wheel trade with sensible defaults.
 * Defaults: AAPL CSP, won, 14-day hold, $150 strike.
 */
export function createMockWheelTrade(overrides?: Partial<MockWheelTrade>): MockWheelTrade {
  const openDate = new Date('2025-06-01T12:00:00Z');
  const closeDate = new Date('2025-06-15T12:00:00Z');

  return {
    id: crypto.randomUUID(),
    userId: 'test-user-001',
    brokerageAccountId: 'test-account-001',
    symbol: 'AAPL',
    closeType: 'option',
    side: 'short',
    optionType: 'put',
    strike: 150,
    expiration: new Date('2025-06-20T00:00:00Z'),
    strategy: 'cash_secured_put',
    openDate,
    closeDate,
    quantity: 1,
    openPrice: 3.5,
    closePrice: 0.5,
    openAmount: 3.5,
    closeAmount: 0.5,
    realizedPnL: 300,
    fees: 1.3,
    closeReason: 'expired',
    underlyingPriceAtOpen: 155,
    underlyingPriceAtClose: 158,
    isAssignment: false,
    isWheelTrade: true,
    hasUnknownBasis: false,
    derivedAt: closeDate,
    derivationVersion: 1,
    ...overrides,
  };
}

/**
 * Create a set of mock wheel trades cycling through symbols/strategies.
 * ~65% win rate, spread across dates.
 */
export function createMockWheelTradeSet(
  count: number,
  options?: { userId?: string; startDate?: Date }
): MockWheelTrade[] {
  const userId = options?.userId ?? 'test-user-001';
  const startDate = options?.startDate ?? new Date('2024-01-15T12:00:00Z');
  const trades: MockWheelTrade[] = [];

  for (let i = 0; i < count; i++) {
    const symbol = SYMBOLS[i % SYMBOLS.length];
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const isWin = i % 20 < 13; // ~65% win rate
    const holdDays = 7 + (i % 38); // 7-44 day holds

    const openDate = new Date(startDate.getTime() + i * 3 * 24 * 60 * 60 * 1000); // 3-day spacing
    const closeDate = new Date(openDate.getTime() + holdDays * 24 * 60 * 60 * 1000);
    const expiration = new Date(closeDate.getTime() + 5 * 24 * 60 * 60 * 1000);

    const baseStrike = 100 + (i % 10) * 10;
    const premium = 2 + (i % 5) * 0.5;
    const pnl = isWin ? premium * 100 * 0.7 : -(premium * 100 * 0.3);

    trades.push(
      createMockWheelTrade({
        id: `mock-trade-${String(i).padStart(4, '0')}`,
        userId,
        symbol,
        strategy,
        optionType: strategy === 'cash_secured_put' ? 'put' : 'call',
        strike: baseStrike,
        expiration,
        openDate,
        closeDate,
        openPrice: premium,
        closePrice: isWin ? premium * 0.1 : premium * 1.3,
        openAmount: premium,
        closeAmount: isWin ? premium * 0.1 : premium * 1.3,
        realizedPnL: pnl,
        closeReason: isWin ? 'expired' : 'normal',
        underlyingPriceAtOpen: baseStrike + 5,
        underlyingPriceAtClose: baseStrike + (isWin ? 3 : -3),
        isAssignment: !isWin && i % 5 === 0,
      })
    );
  }

  return trades;
}
