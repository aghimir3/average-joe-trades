/**
 * Wheel Strategy ML/DL Module
 * Exports all wheel ML functionality
 */

// Types
export * from './types';

// Feature Engineering
export {
  extractCandidateFeatures,
  extractStrikeFeatures,
  extractRollFeatures,
  candidateFeaturesToArray,
  strikeFeaturesToArray,
  rollFeaturesToArray,
  prepareCandidateTrainingData,
  getWheelSymbols,
  CANDIDATE_FEATURE_NAMES,
  STRIKE_FEATURE_NAMES,
  ROLL_FEATURE_NAMES,
} from './feature-engineering';

// Model Storage
export {
  saveModelToSQL,
  loadModelFromSQL,
  hasTrainedModel,
  getModelInfo,
  getAllModelInfo,
  deleteAllModels,
  storePrediction,
  updatePredictionOutcome,
  getPredictionAccuracy,
  validatePredictionsAfterDerivation,
} from './model-storage';

// Candidate Ranker
export {
  buildCandidateRanker,
  trainCandidateRanker,
  getWheelRankings,
  getFeatureImportance,
} from './candidate-ranker';

// Strike Optimizer
export {
  buildStrikeOptimizer,
  trainStrikeOptimizer,
  getStrikeRecommendation,
} from './strike-optimizer';

// Roll Advisor
export {
  buildRollAdvisor,
  trainRollAdvisor,
  getRollAdvice,
  getRollAlerts,
} from './roll-advisor';

// Training Pipeline
export {
  trainAllModels,
  checkTrainingReadiness,
  getMLStatus,
} from './training-pipeline';

// Aggregated Model (Community Insights)
export {
  collectAggregatedStats,
  trainAggregatedModel,
  getCommunityInsight,
  getAllCommunityInsights,
  getAggregatedModelStatus,
} from './aggregated-model';
export type {
  AggregatedTickerStats,
  CommunityInsight,
} from './aggregated-model';
