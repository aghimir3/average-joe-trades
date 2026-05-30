/**
 * Z-score normalization utilities for ML training/inference
 * Shared by wheel/aggregated-model.ts and community/community-model.ts
 */

export interface NormalizationParams {
  featureMeans: number[];
  featureStds: number[];
  labelMean: number;
  labelStd: number;
}

/**
 * Calculate z-score normalization parameters from training data
 */
export function calculateNormalizationParams(
  features: number[][],
  labels: number[]
): NormalizationParams {
  const numSamples = features.length;
  const numFeatures = features[0]?.length ?? 0;

  if (numSamples === 0 || numFeatures === 0) {
    return { featureMeans: [], featureStds: [], labelMean: 0, labelStd: 1 };
  }

  // Calculate feature means
  const featureMeans = Array(numFeatures).fill(0) as number[];
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) {
      featureMeans[j] += row[j] / numSamples;
    }
  }

  // Calculate feature standard deviations
  const featureStds = Array(numFeatures).fill(0) as number[];
  for (const row of features) {
    for (let j = 0; j < numFeatures; j++) {
      featureStds[j] += Math.pow(row[j] - featureMeans[j], 2) / numSamples;
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    featureStds[j] = Math.sqrt(featureStds[j]) || 1; // Avoid division by zero
  }

  // Calculate label mean and std
  const labelMean = labels.reduce((a, b) => a + b, 0) / labels.length;
  const labelStd =
    Math.sqrt(
      labels.reduce((sum, l) => sum + Math.pow(l - labelMean, 2), 0) / labels.length
    ) || 1;

  return { featureMeans, featureStds, labelMean, labelStd };
}

/**
 * Apply z-score normalization to a 2D feature matrix
 */
export function normalizeFeatures(
  features: number[][],
  params: NormalizationParams
): number[][] {
  return features.map((row) =>
    row.map((val, j) => (val - params.featureMeans[j]) / params.featureStds[j])
  );
}

/**
 * Apply z-score normalization to a single feature vector
 */
export function normalizeSingleFeature(
  features: number[],
  params: NormalizationParams
): number[] {
  return features.map((val, j) => (val - params.featureMeans[j]) / params.featureStds[j]);
}

/**
 * Create default normalization params (for fallback/uninitialized models)
 */
export function getDefaultNormParams(numFeatures: number): NormalizationParams {
  return {
    featureMeans: Array(numFeatures).fill(0.5) as number[],
    featureStds: Array(numFeatures).fill(0.3) as number[],
    labelMean: 50,
    labelStd: 25,
  };
}
