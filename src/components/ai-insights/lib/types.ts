/**
 * Types for AI Insights Page
 *
 * Shared types for the AI command center, actions, and model management.
 */

// ============================================================================
// Unified AI Status
// ============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface UnifiedAIStatus {
  totalModelsActive: number;
  totalModelsPossible: number;
  overallConfidence: ConfidenceLevel;
  pendingActions: number;
  lastUpdated: string;
  urgentMessage: string | null;
  topOpportunity: { symbol: string; score: number } | null;
  wheelModelsReady: boolean;
  optionsModelsReady: boolean;
  communityModelReady: boolean;
  stockModelsReady: boolean;
  quantModelsReady?: boolean;
}

// ============================================================================
// AI Actions
// ============================================================================

export type AIActionType =
  | 'roll'
  | 'close'
  | 'new_opportunity'
  | 'reduce_risk'
  | 'add_position'
  // Community action types
  | 'hold_winner'
  | 'consider_exit'
  | 'avoid_ticker'
  | 'strategy_switch'
  | 'wheel_opportunity'
  | 'premium_opportunity'
  | 'risk_warning';

export type AIActionPriority = 'high' | 'medium' | 'low';

export type AIActionSource = 'wheel_ml' | 'options_ml' | 'community' | 'risk' | 'stock_ml' | 'quant_signal';

export interface AIAction {
  id: string;
  type: AIActionType;
  priority: AIActionPriority;
  confidence: number; // 0-100
  symbol: string;
  title: string;
  description: string;
  reasoning: string[];
  deadline?: string;
  source: AIActionSource;
  reasonCodes?: string[];
  riskFlags?: string[];
  confidenceBand?: 'low' | 'medium' | 'high';
  expectedValuePct?: number;
  userState?: {
    status?: 'dismissed' | 'snoozed' | 'completed';
    snoozedUntil?: string | null;
    feedback?: 'helpful' | 'not_helpful';
  };
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

export interface AIActionsResponse {
  actions: AIAction[];
  totalCount: number;
  highPriorityCount: number;
  lastUpdated: string;
}

export interface TickerSuggestion {
  symbol: string;
  asOf: string;
  dataFreshness: {
    quoteAsOf: string | null;
    barsAsOf: string | null;
    stale: boolean;
    source: string;
    isDelayed: boolean;
  };
  simple: {
    action: 'buy' | 'avoid' | 'watch' | 'reduce' | 'sell' | 'hold' | 'add';
    confidenceBand: 'low' | 'medium' | 'high';
    confidenceScore: number;
    summary: string;
    reasons: string[];
    riskFlags: string[];
    nextCheck: string;
    optionsPlaybook?: {
      action: string;
      details: string;
    } | null;
  };
  advanced: {
    strategyKey: string;
    signal: {
      symbol: string;
      timestamp: string;
      side: 'buy' | 'sell' | 'hold';
      strength: number;
      horizon: 'intraday' | 'swing' | 'position';
      rationaleCodes: string[];
      confidence: number;
      confidenceBand: 'low' | 'medium' | 'high';
      expectedReturnPct: number;
      riskFlags: string[];
    };
    positionContext: {
      ownsPosition: boolean;
      side: 'long' | 'short' | null;
      quantity: number;
      avgEntryPrice: number | null;
      currentPnlPct: number | null;
      daysHeld: number | null;
    };
    marketContext: {
      currentPrice: number;
      dayChangePercent: number;
      momentum20d: number;
      return5d: number;
      volatility20d: number;
      drawdown20d: number;
    };
    communityContext: {
      available: boolean;
      recommendation: string | null;
      winRatePct: number | null;
      avgReturnPct: number | null;
      sampleSize: number | null;
      uniqueTraders: number | null;
    };
    optionContext: {
      optionPositionCount: number;
      nearestDte: number | null;
      shortOptionCount: number;
      wheelStyleCount: number;
      nearExpiryCount: number;
    };
  };
}

// ============================================================================
// Model Status
// ============================================================================

export interface ModelStatus {
  name: string;
  type: 'wheel' | 'options' | 'community' | 'stock';
  version: number | null;
  isActive: boolean;
  lastTrainedAt: string | null;
  tradesUsed: number;
  accuracy?: number;
  loss?: number;
  minTradesRequired: number;
  currentTradesCount: number;
}

export interface WheelModelStatus {
  candidateRanker: ModelStatus;
  strikeOptimizer: ModelStatus;
  rollAdvisor: ModelStatus;
}

export interface OptionsModelStatus {
  volatilityRegime: ModelStatus;
  entryTiming: ModelStatus;
  exitStrategy: ModelStatus;
  strategyClassifier: ModelStatus;
  riskAnalyzer: ModelStatus;
}

export interface AllModelsStatus {
  wheel: WheelModelStatus;
  options: OptionsModelStatus;
  community: ModelStatus;
  overallReadiness: {
    wheelReady: boolean;
    optionsReady: boolean;
    communityReady: boolean;
  };
}

// ============================================================================
// Training
// ============================================================================

export interface TrainingProgress {
  modelType: string;
  status: 'idle' | 'training' | 'completed' | 'error';
  progress: number; // 0-100
  message?: string;
  error?: string;
}

export interface TrainingResult {
  success: boolean;
  modelType: string;
  stats: {
    tradesUsed: number;
    epochs: number;
    finalLoss: number;
    accuracy?: number;
  };
  error?: string;
}

// ============================================================================
// Tab Types
// ============================================================================

export type AIInsightsTab = 'actions' | 'alpha' | 'risk' | 'models' | 'community' | 'train' | 'sentiment';

// ============================================================================
// Sentiment Logger
// ============================================================================

export type SentimentValue = 'bullish' | 'neutral' | 'bearish';
export type SentimentTimeframe = 'eod' | 'this_week' | 'this_month' | 'this_quarter';

export interface SentimentEditHistoryItem {
  id: string;
  previousSentiment: SentimentValue;
  previousNotes: string | null;
  editedAt: string;
}

export interface SentimentEntry {
  id: string;
  sentiment: SentimentValue;
  timeframe: SentimentTimeframe;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  editHistory: SentimentEditHistoryItem[];
}

export interface TabConfig {
  id: AIInsightsTab;
  label: string;
  icon: string;
  badge?: number;
}
