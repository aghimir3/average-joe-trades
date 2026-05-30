export type {
  ModelLifecycleStatus,
  ModelScope,
  RecordEvaluationInput,
  RegisterModelInput,
} from './model-registry';

export {
  ensureBaselineRegistryEntries,
  getLatestStableModel,
  getModelHealthSummary,
  hashTrainingDataset,
  recordModelEvaluation,
  registerModelVersion,
  setStableModel,
} from './model-registry';

export type {
  PromotionBaselineMetrics,
  PromotionCurrentMetrics,
  PromotionGateDecision,
  PromotionGateInput,
  PromotionSample,
} from './promotion-gates';

export { evaluatePromotionGate } from './promotion-gates';
