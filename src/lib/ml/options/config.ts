/**
 * ML Options Feature Configuration
 *
 * This file controls the ML options trading features.
 * Set ML_OPTIONS_ENABLED to false to disable all ML options features.
 *
 * To fully remove this feature:
 * 1. Set ML_OPTIONS_ENABLED = false
 * 2. Remove the /api/ml/options/* routes
 * 3. Delete the src/lib/ml/options directory
 * 4. Remove ML-related tables from prisma schema (OptionsMLModel, PredictionLog, FeatureStore, etc.)
 * 5. Run: npx prisma db push
 *
 * Git checkpoint for easy revert: Look for commit with message containing "feat: add ML options trading system"
 */

// Feature flag to enable/disable ML options features
export const ML_OPTIONS_ENABLED = true;

// Minimum trade requirements for training models
export const MIN_TRADES_FOR_TRAINING = 30;
export const MIN_OPTION_TRADES_FOR_TRAINING = 20;
export const MIN_STRATEGIES_FOR_CLASSIFIER = 3;

// Model configuration
export const MODEL_CACHE_TTL_HOURS = 24; // How long to cache trained models
export const FEATURE_CACHE_TTL_HOURS = 1; // How long to cache computed features
export const PREDICTION_LOG_RETENTION_DAYS = 90; // How long to keep prediction logs

// Training configuration
export const DEFAULT_EPOCHS = 100;
export const DEFAULT_BATCH_SIZE = 32;
export const EARLY_STOPPING_PATIENCE = 10;

// API configuration
export const MAX_PREDICTIONS_PER_MINUTE = 60;
export const MAX_TRAINING_REQUESTS_PER_HOUR = 5;
