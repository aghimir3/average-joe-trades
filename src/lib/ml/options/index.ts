/**
 * Options ML Module
 * Unified exports for all options ML/DL functionality
 */

// Types
export type {
  FeatureType,
  FeatureVector,
  CachedFeature,
  OptionsModelType,
  ModelMetadata,
  TrainingStats,
  TrainingResult,
  VolatilityRegime,
  VolatilityRegimeResult,
  EntryTimingResult,
  ExitTiming,
  ExitStrategyResult,
  OptionStrategy,
  StrategyRecommendation,
  PnLAttribution,
  PortfolioRiskAnalysis,
  SimilarTrade,
  SimilaritySearchResult,
  AlertType,
  AlertSeverity,
  PositionHealthAlert,
  DailyInsightSummary,
  ActionItem,
  Opportunity,
  RiskAlert,
  DailyInsights,
  SimulationScenario,
  SimulationRiskMetrics,
  HistoricalComparison,
  SimulationResult,
  EnsemblePrediction,
  OptionsTrainingData,
} from './types';

// Feature Store
export {
  getCachedFeature,
  cacheFeature,
  invalidateFeatures,
  cleanupExpiredFeatures,
  getAllCachedFeatures,
  getOrComputeFeatures,
  getBatchFeatures,
  getFeatureStoreStats,
} from './feature-store';

// Feature Engineering
export {
  extractVolatilityFeatures,
  extractEntryTimingFeatures,
  extractStrategyFeatures,
  extractRiskFeatures,
  extractTradeEmbeddingFeatures,
  getOptionsSymbols,
  getAllTradedStrategies,
  VOLATILITY_FEATURE_NAMES,
  ENTRY_TIMING_FEATURE_NAMES,
  EXIT_STRATEGY_FEATURE_NAMES,
  STRATEGY_CLASSIFIER_FEATURE_NAMES,
  RISK_ANALYZER_FEATURE_NAMES,
  TRADE_EMBEDDING_FEATURE_NAMES,
} from './feature-engineering';

// Model Storage
export {
  saveOptionsModel,
  loadOptionsModel,
  getOptionsModelInfo,
  deleteOptionsModel,
  logPrediction,
  resolvePrediction,
  validateOptionsPredictionsAfterDerivation,
  getModelAccuracyStats,
} from './model-storage';

// Volatility Regime
export {
  buildVolatilityRegimeModel,
  trainVolatilityRegimeModel,
  predictVolatilityRegime,
} from './volatility-regime';

// Entry Timing
export {
  buildEntryTimingModel,
  trainEntryTimingModel,
  predictEntryTiming,
} from './entry-timing';

// Strategy Classifier
export {
  buildStrategyClassifierModel,
  trainStrategyClassifierModel,
  predictStrategy,
} from './strategy-classifier';

// Exit Strategy
export {
  buildExitStrategyModel,
  trainExitStrategyModel,
  predictExitStrategy,
} from './exit-strategy';

// Risk Analyzer
export {
  buildRiskAnalyzerModel,
  trainRiskAnalyzerModel,
  analyzePortfolioRisk,
} from './risk-analyzer';

// P&L Attribution
export {
  calculatePnLAttribution,
  calculatePortfolioPnLAttribution,
  getAttributionByStrategy,
} from './pnl-attribution';

// Trade Similarity
export {
  buildTradeEmbedder,
  trainTradeEmbedder,
  findSimilarTrades,
  refreshAllEmbeddings,
} from './trade-similarity';

// Training Pipeline
export {
  trainAllOptionsModels,
  getOptionsMLStatus,
  checkOptionsTrainingReadiness,
} from './training-pipeline';

// Daily Insights
export {
  generateDailyInsights,
  getDailyInsights,
  getInsightsHistory,
  refreshDailyInsights,
} from './daily-insights';

// Position Health
export {
  checkPositionHealth,
  getActiveAlerts,
  dismissAlert,
  actionAlert,
} from './position-health';

// Ensemble Predictor
export {
  getEnsemblePrediction,
  getPositionEnsemblePrediction,
  getPortfolioEnsemblePredictions,
} from './ensemble-predictor';

export type {
  EnsembleInsight,
  PositionEnsemblePrediction,
} from './ensemble-predictor';
