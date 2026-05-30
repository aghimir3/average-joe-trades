/**
 * ML/DL Types for Wheel Strategy
 * Defines interfaces for feature engineering, model outputs, and predictions
 */

// ============================================================================
// Feature Types (Input to ML Models)
// ============================================================================

/**
 * Features for ranking wheel candidates
 * All data derived from SnapTrade positions + historical ledger
 */
export interface WheelCandidateFeatures {
  // Stock characteristics (from BrokerPosition)
  symbol: string;
  currentPrice: number;
  currentShares: number;
  unrealizedPnl: number;

  // Volatility metrics (DERIVED from user's historical trades)
  estimatedIvRank: number; // 0-100 percentile of recent premiums vs history
  avgPremiumToStrikeRatio: number; // Historical premium/strike %
  premiumTrend: number; // -1, 0, 1 (decreasing, stable, increasing)

  // User's history with this stock (from RealizedClose)
  userWheelTradesCount: number;
  userWheelWinRate: number; // 0.0-1.0
  userAvgPremiumCaptured: number;
  userAvgHoldDays: number;
  userAssignmentRate: number; // 0.0-1.0
  userTotalPnlOnSymbol: number;

  // Price metrics derived from user's trade prices
  priceAtFirstTrade: number;
  priceAtLastTrade: number;
  priceChange30d: number; // % change over last 30 days of trades

  // Timing features
  daysSinceLastWheelTrade: number;
  hasOpenPosition: boolean;

  // Day-of-week patterns (0-6, Sunday-Saturday)
  bestDayOfWeek: number; // Day with highest win rate
  worstDayOfWeek: number; // Day with lowest win rate
  todayWinRate: number; // Win rate for today's day of week
}

/**
 * Features for strike/DTE optimization
 */
export interface StrikeDteFeatures {
  symbol: string;
  currentPrice: number;
  direction: 'csp' | 'covered_call';

  // Volatility estimates from historical trades
  avgPremiumPctByDte: {
    dte_7_14: number;
    dte_14_30: number;
    dte_30_45: number;
    dte_45_plus: number;
  };
  recentPremiumTrend: number;

  // User behavior patterns
  userPreferredDte: number;
  userAvgStrikeDistance: number; // Avg % OTM user typically chooses
  userWinRateByDteBucket: Record<string, number>;
  userWinRateByStrikeDistance: Record<string, number>;

  // Stock behavior from trade history
  avgMoveOverHoldPeriod: number;
  assignmentRateByStrikeDistance: Record<string, number>;

  // User's history on this specific stock
  tradesOnSymbol: number;
  winRateOnSymbol: number;
  avgPnlOnSymbol: number;
  lastTradeDate: Date | null;
}

/**
 * Features for roll decisions
 */
export interface RollDecisionFeatures {
  symbol: string;
  positionType: 'csp' | 'covered_call';
  strike: number;
  daysToExpiration: number;
  currentStockPrice: number;
  isItm: boolean;
  distanceToStrike: number; // % away from strike
  premiumReceived: number;
  premiumCapturedPct: number; // % of max premium already captured
  rollCredit: number; // Estimated net credit if rolled
  stockTrend7d: number; // % change in stock over 7 days
  userRollWinRate: number;
}

// ============================================================================
// Model Output Types
// ============================================================================

/**
 * Output from Candidate Ranker model
 */
export interface WheelRanking {
  symbol: string;
  score: number; // 0-100 composite score
  expectedMonthlyReturn: number; // Predicted % return
  riskScore: number; // 1-10, higher = riskier
  confidence: number; // 0-1 model confidence
  reasoning: string[]; // Explainable factors
}

/**
 * Output from Strike/DTE Optimizer model
 */
export interface StrikeDteRecommendation {
  recommendedStrike: number;
  recommendedDte: number;
  expectedPremium: number;
  expectedReturn: number; // Annualized

  // Probabilities
  probabilityOfProfit: number; // 0-1
  probabilityOfAssignment: number; // 0-1

  // Alternatives for user choice
  alternatives: Array<{
    strike: number;
    dte: number;
    premium: number;
    pop: number; // Probability of profit
    tradeoff: string;
  }>;

  reasoning: string[];
}

/**
 * Output from Roll Advisor model
 */
export type RollAction = 'roll_out' | 'roll_up_out' | 'let_expire' | 'let_assign' | 'close';

export interface RollAdvice {
  recommendation: RollAction;
  confidence: number; // 0-1
  actionProbabilities: {
    roll_out: number;
    let_expire: number;
    close: number;
  };

  reasoning: string[];

  projectedOutcomes: {
    ifRoll: {
      netCredit: number;
      newExpiration: string;
      newStrike: number;
      expectedReturn: number;
    };
    ifLetExpire: {
      pnl: number;
      willBeAssigned: boolean;
      assignmentCost?: number;
    };
    ifClose: {
      pnl: number;
      capitalFreed: number;
    };
  };
}

// ============================================================================
// Training Types
// ============================================================================

export type ModelType = 'candidate-ranker' | 'strike-optimizer' | 'roll-advisor' | 'aggregated-ranker';

export type { TrainingStats } from '../training-utils';
import type { TrainingStats } from '../training-utils';

export interface ModelReport {
  modelType: ModelType;
  success: boolean;
  stats: TrainingStats;
  error?: string;
}

export interface TrainingReport {
  userId: string;
  reports: ModelReport[];
  trainedAt: Date;
}

/**
 * Training example for candidate ranker
 */
export interface CandidateTrainingExample {
  features: number[];
  label: number; // Annualized return or normalized score
}

// ============================================================================
// API Response Types
// ============================================================================

export interface WheelMLInsights {
  rankings: WheelRanking[];
  hasEnoughData: boolean;
  dataStats: {
    totalWheelTrades: number;
    uniqueSymbols: number;
    dateRange: { start: string; end: string } | null;
  };
  modelInfo: {
    candidateRankerVersion: number | null;
    strikeOptimizerVersion: number | null;
    rollAdvisorVersion: number | null;
    lastTrainedAt: string | null;
  };
}

export interface RollAlert {
  positionId: string;
  symbol: string;
  positionType: 'csp' | 'covered_call';
  strike: number;
  expiration: string;
  daysToExpiration: number;
  isItm: boolean;
  distanceToStrike: number;
  advice: RollAdvice;
}
