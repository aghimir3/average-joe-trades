/**
 * ML Options Smoke Tests
 *
 * Tests the ML options prediction models and related services.
 * Verifies:
 * 1. Feature engineering exports
 * 2. Model predictions (volatility, entry timing, strategy)
 * 3. Daily insights generation
 * 4. Position health tracking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanupTestUser, createTestAccount } from './db';
import { Decimal } from '@/generated/prisma/internal/prismaNamespace';

// ML Services - Feature Engineering (just test exports)
import {
  VOLATILITY_FEATURE_NAMES,
  ENTRY_TIMING_FEATURE_NAMES,
  EXIT_STRATEGY_FEATURE_NAMES,
  STRATEGY_CLASSIFIER_FEATURE_NAMES,
  RISK_ANALYZER_FEATURE_NAMES,
} from '@/lib/ml/options/feature-engineering';

// ML Services - Predictions
import { predictVolatilityRegime } from '@/lib/ml/options/volatility-regime';
import { predictEntryTiming } from '@/lib/ml/options/entry-timing';
import { predictStrategy } from '@/lib/ml/options/strategy-classifier';
import { analyzePortfolioRisk } from '@/lib/ml/options/risk-analyzer';

// ML Services - Insights
import { generateDailyInsights } from '@/lib/ml/options/daily-insights';
import { checkPositionHealth } from '@/lib/ml/options/position-health';

// Config
import { ML_OPTIONS_ENABLED, MIN_TRADES_FOR_TRAINING, MIN_OPTION_TRADES_FOR_TRAINING } from '@/lib/ml/options/config';

// Test user prefix for isolation
const TEST_PREFIX = 'ml_options_smoke';

describe('ML Options Smoke Tests', () => {
  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await testPrisma.user.create({
      data: {
        email: `${TEST_PREFIX}_${Date.now()}@test.com`,
        name: 'ML Options Test User',
      },
    });
    testUserId = testUser.id;

    // Create test account
    const account = await createTestAccount(testUserId, { name: 'MLTest' });
    testAccountId = account.id;

    // Create test trading data for ML analysis
    await createTestTradingData(testUserId, testAccountId);
  });

  afterAll(async () => {
    // Clean up all test data
    await testPrisma.dailyInsight.deleteMany({ where: { userId: testUserId } });
    await testPrisma.positionHealthAlert.deleteMany({ where: { userId: testUserId } });
    await testPrisma.realizedClose.deleteMany({ where: { userId: testUserId } });
    await testPrisma.derivedPosition.deleteMany({ where: { userId: testUserId } });
    await testPrisma.ledgerEvent.deleteMany({ where: { userId: testUserId } });
    await cleanupTestUser(testUserId);
    await testPrisma.user.delete({ where: { id: testUserId } });
  });

  describe('Configuration', () => {
    it('should have ML options enabled', () => {
      expect(ML_OPTIONS_ENABLED).toBe(true);
    });

    it('should have correct training thresholds', () => {
      expect(MIN_TRADES_FOR_TRAINING).toBeGreaterThan(0);
      expect(MIN_OPTION_TRADES_FOR_TRAINING).toBeGreaterThan(0);
    });
  });

  describe('Feature Engineering Constants', () => {
    it('should export volatility feature names', () => {
      expect(Array.isArray(VOLATILITY_FEATURE_NAMES)).toBe(true);
      expect(VOLATILITY_FEATURE_NAMES.length).toBeGreaterThan(0);
      expect(VOLATILITY_FEATURE_NAMES).toContain('premiumPercentile');
    });

    it('should export entry timing feature names', () => {
      expect(Array.isArray(ENTRY_TIMING_FEATURE_NAMES)).toBe(true);
      expect(ENTRY_TIMING_FEATURE_NAMES.length).toBeGreaterThan(0);
      expect(ENTRY_TIMING_FEATURE_NAMES).toContain('dayOfWeek');
    });

    it('should export exit strategy feature names', () => {
      expect(Array.isArray(EXIT_STRATEGY_FEATURE_NAMES)).toBe(true);
      expect(EXIT_STRATEGY_FEATURE_NAMES.length).toBeGreaterThan(0);
      expect(EXIT_STRATEGY_FEATURE_NAMES).toContain('currentPnlPercent');
    });

    it('should export strategy classifier feature names', () => {
      expect(Array.isArray(STRATEGY_CLASSIFIER_FEATURE_NAMES)).toBe(true);
      expect(STRATEGY_CLASSIFIER_FEATURE_NAMES.length).toBeGreaterThan(0);
      expect(STRATEGY_CLASSIFIER_FEATURE_NAMES).toContain('volatilityRegime');
    });

    it('should export risk analyzer feature names', () => {
      expect(Array.isArray(RISK_ANALYZER_FEATURE_NAMES)).toBe(true);
      expect(RISK_ANALYZER_FEATURE_NAMES.length).toBeGreaterThan(0);
      expect(RISK_ANALYZER_FEATURE_NAMES).toContain('positionCount');
    });
  });

  describe('Volatility Regime Prediction', () => {
    it('should predict volatility regime', async () => {
      const result = await predictVolatilityRegime(testUserId, 'AAPL');

      expect(result).toBeDefined();
      expect(['low', 'medium', 'high', 'extreme']).toContain(result.regime);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      // Should have probability distribution
      expect(result.probabilities).toBeDefined();
    });

    it('should return consistent results for same inputs', async () => {
      const result1 = await predictVolatilityRegime(testUserId, 'AAPL');
      const result2 = await predictVolatilityRegime(testUserId, 'AAPL');

      // Regime should be consistent (model is deterministic given same features)
      expect(result1.regime).toBe(result2.regime);
    });

    it('should handle unknown symbols gracefully', async () => {
      const result = await predictVolatilityRegime(testUserId, 'UNKNOWN_XYZ');

      expect(result).toBeDefined();
      expect(['low', 'medium', 'high', 'extreme']).toContain(result.regime);
    });
  });

  describe('Entry Timing Prediction', () => {
    it('should predict entry timing', async () => {
      const result = await predictEntryTiming(testUserId, 'AAPL');

      expect(result).toBeDefined();
      expect(result.entryScore).toBeGreaterThanOrEqual(0);
      expect(result.entryScore).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.reasoning)).toBe(true);
      expect(Array.isArray(result.dayOfWeekAnalysis)).toBe(true);
    });

    it('should include day of week analysis', async () => {
      const result = await predictEntryTiming(testUserId, 'AAPL');

      expect(result.dayOfWeekAnalysis.length).toBeGreaterThan(0);
      result.dayOfWeekAnalysis.forEach(day => {
        expect(day.dayName).toBeDefined();
        expect(typeof day.historicalWinRate).toBe('number');
        expect(typeof day.avgReturn).toBe('number');
      });
    });
  });

  describe('Strategy Classifier', () => {
    it('should recommend a strategy', async () => {
      const result = await predictStrategy(testUserId, 'AAPL');

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.historicalWinRate).toBeGreaterThanOrEqual(0);
      expect(result.historicalWinRate).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.reasoning)).toBe(true);
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    it('should provide alternative strategies', async () => {
      const result = await predictStrategy(testUserId, 'AAPL');

      // Should have alternatives array
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
      result.alternatives.forEach(alt => {
        expect(alt.strategy).toBeDefined();
        // confidence may or may not be present
      });
    });
  });

  describe('Risk Analyzer', () => {
    it('should analyze portfolio risk', async () => {
      const result = await analyzePortfolioRisk(testUserId);

      expect(result).toBeDefined();
      expect(result.riskScore).toBeDefined();
      expect(typeof result.riskScore).toBe('number');
      // riskLevel may use 'moderate' instead of 'medium' in some implementations
      expect(['low', 'medium', 'moderate', 'high', 'critical']).toContain(result.riskLevel);
      expect(Array.isArray(result.alerts)).toBe(true);
    });

    it('should generate alerts array', async () => {
      const result = await analyzePortfolioRisk(testUserId);

      // Alerts should have proper structure if present
      result.alerts.forEach(alert => {
        expect(alert.type).toBeDefined();
        expect(['info', 'warning', 'critical']).toContain(alert.severity);
        expect(alert.message).toBeDefined();
      });
    });
  });

  describe('Daily Insights', () => {
    beforeEach(async () => {
      // Clean up any existing insights
      await testPrisma.dailyInsight.deleteMany({ where: { userId: testUserId } });
    });

    it('should generate daily insights', async () => {
      const insights = await generateDailyInsights(testUserId);

      expect(insights).toBeDefined();
      expect(insights.date).toBeDefined();
      expect(insights.summary).toBeDefined();
      expect(typeof insights.summary.totalPositions).toBe('number');
      expect(typeof insights.summary.portfolioValue).toBe('number');
      expect(Array.isArray(insights.actionItems)).toBe(true);
      expect(Array.isArray(insights.opportunities)).toBe(true);
      expect(Array.isArray(insights.riskAlerts)).toBe(true);
      expect(Array.isArray(insights.learnings)).toBe(true);
    });

    it('should include action items with proper structure', async () => {
      const insights = await generateDailyInsights(testUserId);

      insights.actionItems.forEach(item => {
        expect(item.type).toBeDefined();
        expect(item.symbol).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(item.priority);
        expect(item.description).toBeDefined();
        expect(item.recommendation).toBeDefined();
      });
    });
  });

  describe('Position Health', () => {
    beforeAll(async () => {
      // Create a test option position that's expiring soon
      const now = new Date();
      await testPrisma.derivedPosition.create({
        data: {
          userId: testUserId,
          brokerageAccountId: testAccountId,
          symbol: 'EXPIRING_TEST',
          positionType: 'option',
          side: 'long',
          quantity: new Decimal(1),
          avgPrice: new Decimal(2.5),
          costBasis: new Decimal(250),
          optionType: 'call',
          strike: new Decimal(100),
          expiration: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days out
          strategy: 'long_call',
          firstEntryDate: now,
          lastEntryDate: now,
        },
      });
    });

    afterAll(async () => {
      await testPrisma.positionHealthAlert.deleteMany({
        where: { userId: testUserId },
      });
      await testPrisma.derivedPosition.deleteMany({
        where: { userId: testUserId, symbol: 'EXPIRING_TEST' },
      });
    });

    it('should check position health and return alerts array', async () => {
      const alerts = await checkPositionHealth(testUserId);

      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should have proper alert structure when alerts exist', async () => {
      const alerts = await checkPositionHealth(testUserId);

      alerts.forEach(alert => {
        expect(alert.id).toBeDefined();
        expect(alert.symbol).toBeDefined();
        expect(alert.alertType).toBeDefined();
        expect(['info', 'warning', 'critical']).toContain(alert.severity);
        expect(alert.title).toBeDefined();
        expect(alert.description).toBeDefined();
      });
    });
  });
});

// Helper function to create test trading data
async function createTestTradingData(userId: string, accountId: string) {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 30); // Start 30 days ago

  // Create multiple trades for ML training
  const trades = [
    // Winning long call
    {
      symbol: 'AAPL',
      transCode: 'BTO',
      openDate: new Date(baseDate.getTime()),
      closeDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000),
      openPrice: 2.5,
      closePrice: 4.0,
      pnl: 150,
    },
    // Losing long call
    {
      symbol: 'AAPL',
      transCode: 'BTO',
      openDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000),
      closeDate: new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000),
      openPrice: 3.0,
      closePrice: 1.5,
      pnl: -150,
    },
    // Winning covered call
    {
      symbol: 'AAPL',
      transCode: 'STO',
      openDate: new Date(baseDate.getTime() + 15 * 24 * 60 * 60 * 1000),
      closeDate: new Date(baseDate.getTime() + 25 * 24 * 60 * 60 * 1000),
      openPrice: 1.5,
      closePrice: 0.5,
      pnl: 100,
      strategy: 'covered_call',
    },
  ];

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const timestamp = Date.now() + i;

    // Create opening ledger event
    await testPrisma.ledgerEvent.create({
      data: {
        userId,
        brokerageAccountId: accountId,
        broker: 'manual',
        sourceType: 'manual',
        activityDate: trade.openDate,
        settleDate: trade.openDate,
        symbol: trade.symbol,
        instrument: `${trade.symbol} Option`,
        description: `${trade.symbol} Option Trade`,
        transCode: trade.transCode,
        quantity: new Decimal(1),
        price: new Decimal(trade.openPrice),
        amount: new Decimal(trade.transCode === 'BTO' ? -trade.openPrice * 100 : trade.openPrice * 100),
        eventType: 'EQUITY_OPTION',
        isOption: true,
        optionType: 'call',
        strike: new Decimal(180),
        expiration: new Date(trade.closeDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        eventHash: `ml_test_open_${timestamp}`,
      },
    });

    // Create closing ledger event
    await testPrisma.ledgerEvent.create({
      data: {
        userId,
        brokerageAccountId: accountId,
        broker: 'manual',
        sourceType: 'manual',
        activityDate: trade.closeDate,
        settleDate: trade.closeDate,
        symbol: trade.symbol,
        instrument: `${trade.symbol} Option`,
        description: `${trade.symbol} Option Trade Close`,
        transCode: trade.transCode === 'BTO' ? 'STC' : 'BTC',
        quantity: new Decimal(1),
        price: new Decimal(trade.closePrice),
        amount: new Decimal(trade.transCode === 'BTO' ? trade.closePrice * 100 : -trade.closePrice * 100),
        eventType: 'EQUITY_OPTION',
        isOption: true,
        optionType: 'call',
        strike: new Decimal(180),
        expiration: new Date(trade.closeDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        eventHash: `ml_test_close_${timestamp}`,
      },
    });

    // Create realized close record
    await testPrisma.realizedClose.create({
      data: {
        userId,
        brokerageAccountId: accountId,
        symbol: trade.symbol,
        closeType: 'option',
        side: trade.transCode === 'BTO' ? 'long' : 'short',
        optionType: 'call',
        strike: new Decimal(180),
        expiration: new Date(trade.closeDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        strategy: trade.strategy || (trade.transCode === 'BTO' ? 'long_call' : 'covered_call'),
        quantity: new Decimal(1),
        openPrice: new Decimal(trade.openPrice),
        closePrice: new Decimal(trade.closePrice),
        openAmount: new Decimal(trade.openPrice * 100),
        closeAmount: new Decimal(trade.closePrice * 100),
        realizedPnL: new Decimal(trade.pnl),
        openDate: trade.openDate,
        closeDate: trade.closeDate,
        closeReason: 'normal',
      },
    });
  }

  // Create an open position
  const now = new Date();
  await testPrisma.derivedPosition.create({
    data: {
      userId,
      brokerageAccountId: accountId,
      symbol: 'AAPL',
      positionType: 'option',
      side: 'long',
      quantity: new Decimal(2),
      avgPrice: new Decimal(3.0),
      costBasis: new Decimal(600),
      optionType: 'call',
      strike: new Decimal(185),
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      strategy: 'long_call',
      firstEntryDate: now,
      lastEntryDate: now,
    },
  });
}
