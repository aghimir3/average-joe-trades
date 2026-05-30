/**
 * Types for Options ML/DL System
 * Extends beyond wheel strategy to all options trading
 */

// ============================================================================
// Feature Types
// ============================================================================

export type FeatureType =
  | 'volatility'
  | 'momentum'
  | 'user_pattern'
  | 'symbol_profile'
  | 'position_health'
  | 'market_regime';

export interface FeatureVector {
  featureType: FeatureType;
  symbol: string;
  features: number[];
  featureNames: string[];
  computedAt: Date;
  windowStart?: Date;
  windowEnd?: Date;
}

export interface CachedFeature {
  id: string;
  userId: string;
  symbol: string;
  featureType: FeatureType;
  features: number[];
  computedAt: Date;
  expiresAt: Date;
  isValid: boolean;
}

// ============================================================================
// Model Types
// ============================================================================

export type OptionsModelType =
  | 'volatility-regime'
  | 'entry-timing'
  | 'exit-strategy'
  | 'strategy-classifier'
  | 'risk-analyzer'
  | 'trade-embedder'
  | 'ensemble';

export interface ModelMetadata {
  modelType: OptionsModelType;
  version: number;
  architecture: string;
  tradesUsed: number;
  accuracy?: number;
  loss: number;
  trainedAt: Date;
}

export type { TrainingStats } from '../training-utils';
import type { TrainingStats } from '../training-utils';

export interface TrainingResult {
  success: boolean;
  modelType: OptionsModelType;
  stats: TrainingStats;
  error?: string;
}

// ============================================================================
// Volatility Regime
// ============================================================================

export type VolatilityRegime = 'low' | 'medium' | 'high' | 'extreme';

export interface VolatilityRegimeResult {
  regime: VolatilityRegime;
  confidence: number;
  probabilities: {
    low: number;
    medium: number;
    high: number;
    extreme: number;
  };
  indicators: {
    premiumPercentile: number;
    tradeFrequencyChange: number;
    winRateChange: number;
  };
  recommendation: string;
}

// ============================================================================
// Entry Timing
// ============================================================================

export interface EntryTimingResult {
  entryScore: number; // 0-1, higher = better time to enter
  confidence: number;
  reasoning: string[];
  suggestedWait?: string; // e.g., "Wait 2-3 days"
  dayOfWeekAnalysis: {
    dayName: string;
    historicalWinRate: number;
    avgReturn: number;
  }[];
  optimalConditions: string[];
}

// ============================================================================
// Exit Strategy
// ============================================================================

export type ExitTiming = 'early' | 'at_target' | 'expiration';

export interface ExitStrategyResult {
  targetProfitPercent: number;
  stopLossPercent: number;
  exitTiming: ExitTiming;
  exitTimingProbabilities: {
    early: number;
    at_target: number;
    expiration: number;
  };
  rollProbability: number;
  confidence: number;
  reasoning: string[];
}

// ============================================================================
// Strategy Classifier
// ============================================================================

export type OptionStrategy =
  | 'long_call'
  | 'long_put'
  | 'covered_call'
  | 'cash_secured_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'iron_condor'
  | 'straddle'
  | 'strangle'
  | 'calendar_spread';

export interface StrategyRecommendation {
  strategy: OptionStrategy;
  confidence: number;
  probability: number;
  alternatives: {
    strategy: OptionStrategy;
    probability: number;
    reasoning: string;
  }[];
  reasoning: string[];
  riskLevel: 'low' | 'medium' | 'high';
  expectedReturn: number;
  historicalWinRate: number;
}

// ============================================================================
// P&L Attribution
// ============================================================================

export interface PnLAttribution {
  totalPnL: number;
  breakdown: {
    deltaContribution: number;
    thetaContribution: number;
    vegaContribution: number;
    executionImpact: number;
    otherFactors: number;
  };
  percentages: {
    delta: number;
    theta: number;
    vega: number;
    execution: number;
    other: number;
  };
  insights: string[];
}

// ============================================================================
// Portfolio Risk
// ============================================================================

export interface PortfolioRiskAnalysis {
  riskScore: number; // 1-10
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high';
  metrics: {
    netDelta: number;
    netTheta: number;
    netVega: number;
    concentration: number; // % in single symbol
    correlationRisk: number;
    dteDistribution: {
      nearTerm: number; // % expiring < 7 days
      midTerm: number; // % 7-30 days
      longTerm: number; // % > 30 days
    };
  };
  alerts: {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
  }[];
  recommendations: string[];
}

// ============================================================================
// Trade Similarity
// ============================================================================

export interface SimilarTrade {
  tradeId: string;
  symbol: string;
  strategy: string;
  similarity: number; // 0-1
  outcome: 'win' | 'loss' | 'breakeven';
  pnlPercent: number;
  holdDays: number;
  features?: Record<string, number>;
}

export interface SimilaritySearchResult {
  similarTrades: SimilarTrade[];
  aggregateStats: {
    totalFound: number;
    winCount: number;
    lossCount: number;
    avgReturn: number;
    avgHoldDays: number;
  };
  pattern?: string; // Common pattern description
}

// ============================================================================
// Position Health
// ============================================================================

export type AlertType =
  | 'THETA_DECAY_OPTIMAL'
  | 'APPROACHING_EXPIRATION'
  | 'ADVERSE_MOVE'
  | 'PROFIT_TARGET_HIT'
  | 'STOP_LOSS_TRIGGERED'
  | 'CORRELATION_ALERT'
  | 'CONCENTRATION_WARNING'
  | 'ROLL_OPPORTUNITY';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface PositionHealthAlert {
  id: string;
  alertType: AlertType;
  severity: AlertSeverity;
  symbol: string;
  positionId?: string;
  title: string;
  description: string;
  recommendation?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  expiresAt?: Date;
}

// ============================================================================
// Daily Insights
// ============================================================================

export interface DailyInsightSummary {
  totalPositions: number;
  netDelta: number;
  dailyTheta: number;
  unrealizedPnL: number;
  portfolioValue: number;
}

export interface ActionItem {
  type: 'close' | 'roll' | 'adjust' | 'monitor';
  symbol: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  deadline?: Date;
}

export interface Opportunity {
  symbol: string;
  strategy: OptionStrategy;
  confidence: number;
  expectedReturn: number;
  reasoning: string[];
}

export interface RiskAlert {
  type: string;
  severity: AlertSeverity;
  description: string;
  action: string;
}

export interface DailyInsights {
  date: Date;
  summary: DailyInsightSummary;
  actionItems: ActionItem[];
  opportunities: Opportunity[];
  riskAlerts: RiskAlert[];
  learnings: string[];
  generatedAt: Date;
}

// ============================================================================
// Strategy Simulation
// ============================================================================

export interface SimulationScenario {
  scenario: 'bullish' | 'neutral' | 'bearish';
  probability: number;
  pnl: number;
  description: string;
}

export interface SimulationRiskMetrics {
  maxLoss: number;
  maxProfit: number;
  breakeven: number | number[]; // Can be multiple for spreads
  probabilityOfProfit: number;
  probabilityOfMaxProfit: number;
  probabilityOfMaxLoss: number;
}

export interface HistoricalComparison {
  similarTradesCount: number;
  historicalWinRate: number;
  avgReturn: number;
  avgHoldDays: number;
  bestReturn: number;
  worstReturn: number;
}

export interface SimulationResult {
  symbol: string;
  strategy: OptionStrategy;
  parameters: {
    strike: number;
    strike2?: number;
    dte: number;
    positionSize: number;
    premium?: number;
  };
  expectedOutcomes: SimulationScenario[];
  riskMetrics: SimulationRiskMetrics;
  greeks: {
    delta: number;
    theta: number;
    vega: number;
    gamma: number;
  };
  historicalComparison?: HistoricalComparison;
  recommendation: string;
  confidence: number;
}

// ============================================================================
// Ensemble & Uncertainty
// ============================================================================

export interface EnsemblePrediction<T> {
  prediction: T;
  confidence: number;
  uncertainty: number;
  ensembleAgreement: number; // 0-1, how much models agree
  memberPredictions: {
    modelType: string;
    prediction: T;
    weight: number;
  }[];
  recommendationStrength: 'weak' | 'moderate' | 'strong';
}

// ============================================================================
// Training Data
// ============================================================================

export interface OptionsTrainingData {
  id: string;
  symbol: string;
  strategy: OptionStrategy;
  features: number[];
  featureNames: string[];
  labels: {
    totalReturn: number;
    annualizedReturn: number;
    wasSuccessful: boolean;
    holdDays: number;
    exitType: 'profit_target' | 'stop_loss' | 'expiration' | 'manual';
  };
  tradeDate: Date;
  closeDate: Date;
}
