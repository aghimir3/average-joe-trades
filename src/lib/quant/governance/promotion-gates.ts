import { evaluateCalibration, type CalibrationPoint } from '@/lib/quant/eval/harness';

export interface PromotionSample {
  confidence: number;
  wasAccurate: boolean;
}

export interface PromotionCurrentMetrics {
  loss: number | null;
  validationLoss: number | null;
  accuracy: number | null;
  tradesUsed: number;
}

export interface PromotionBaselineMetrics {
  loss: number | null;
  accuracy: number | null;
}

export interface PromotionGateInput {
  current: PromotionCurrentMetrics;
  calibrationSamples: PromotionSample[];
  baseline?: PromotionBaselineMetrics | null;
  minTrades?: number;
  minCalibrationSamples?: number;
}

export interface PromotionGateDecision {
  pass: boolean;
  status: 'draft' | 'stable';
  reasons: string[];
  oos: {
    pass: boolean;
    loss: number | null;
    validationLoss: number | null;
    generalizationRatio: number | null;
    minTrades: number;
    tradesUsed: number;
  };
  calibration: {
    pass: boolean;
    sampleSize: number;
    minSampleSize: number;
    score: number | null;
    brierScore: number | null;
    expectedCalibrationError: number | null;
  };
  drift: {
    pass: boolean;
    score: number;
    status: 'stable' | 'watch' | 'drift';
    baselineLoss: number | null;
    baselineAccuracy: number | null;
    currentLoss: number | null;
    currentAccuracy: number | null;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceToProbability(value: number): number {
  // Support both [0,1] and legacy percentage inputs.
  if (value > 1) return clamp(value / 100, 0, 1);
  return clamp(value, 0, 1);
}

function buildCalibrationDecision(
  samples: PromotionSample[],
  minCalibrationSamples: number
): PromotionGateDecision['calibration'] {
  const validSamples = samples
    .map((sample) => ({
      confidence: confidenceToProbability(sample.confidence),
      wasAccurate: sample.wasAccurate,
    }))
    .filter((sample) => Number.isFinite(sample.confidence));

  if (validSamples.length < minCalibrationSamples) {
    return {
      pass: false,
      sampleSize: validSamples.length,
      minSampleSize: minCalibrationSamples,
      score: null,
      brierScore: null,
      expectedCalibrationError: null,
    };
  }

  const points: CalibrationPoint[] = validSamples.map((sample) => ({
    predictedProbability: sample.confidence,
    outcome: sample.wasAccurate ? 1 : 0,
  }));
  const report = evaluateCalibration(points, 10);
  const calibrationScore = clamp(
    1 - (report.brierScore * 0.6 + report.expectedCalibrationError * 0.4),
    0,
    1
  );

  return {
    pass: calibrationScore >= 0.55 && report.expectedCalibrationError <= 0.2,
    sampleSize: report.sampleSize,
    minSampleSize: minCalibrationSamples,
    score: calibrationScore,
    brierScore: report.brierScore,
    expectedCalibrationError: report.expectedCalibrationError,
  };
}

function buildOosDecision(
  current: PromotionCurrentMetrics,
  minTrades: number
): PromotionGateDecision['oos'] {
  const loss = toNumeric(current.loss);
  const validationLoss = toNumeric(current.validationLoss);
  const ratio = loss !== null && validationLoss !== null && loss > 0
    ? validationLoss / loss
    : null;

  const pass =
    current.tradesUsed >= minTrades
    && loss !== null
    && validationLoss !== null
    && ratio !== null
    && ratio <= 1.35;

  return {
    pass,
    loss,
    validationLoss,
    generalizationRatio: ratio,
    minTrades,
    tradesUsed: current.tradesUsed,
  };
}

function buildDriftDecision(
  current: PromotionCurrentMetrics,
  baseline?: PromotionBaselineMetrics | null
): PromotionGateDecision['drift'] {
  const baselineLoss = toNumeric(baseline?.loss);
  const baselineAccuracy = toNumeric(baseline?.accuracy);
  const currentLoss = toNumeric(current.loss);
  const currentAccuracy = toNumeric(current.accuracy);

  if (baselineLoss === null && baselineAccuracy === null) {
    return {
      pass: true,
      score: 0,
      status: 'stable',
      baselineLoss,
      baselineAccuracy,
      currentLoss,
      currentAccuracy,
    };
  }

  const lossDrift = baselineLoss !== null && currentLoss !== null && baselineLoss > 0
    ? Math.max(0, (currentLoss - baselineLoss) / baselineLoss)
    : 0;
  const accuracyDrift = baselineAccuracy !== null && currentAccuracy !== null && baselineAccuracy > 0
    ? Math.max(0, (baselineAccuracy - currentAccuracy) / baselineAccuracy)
    : 0;

  const driftScore = clamp(lossDrift * 0.7 + accuracyDrift * 0.3, 0, 1);
  const status: PromotionGateDecision['drift']['status'] =
    driftScore >= 0.35 ? 'drift' : driftScore >= 0.2 ? 'watch' : 'stable';

  return {
    pass: driftScore < 0.35,
    score: driftScore,
    status,
    baselineLoss,
    baselineAccuracy,
    currentLoss,
    currentAccuracy,
  };
}

export function evaluatePromotionGate(input: PromotionGateInput): PromotionGateDecision {
  const minTrades = input.minTrades ?? 20;
  const minCalibrationSamples = input.minCalibrationSamples ?? 25;
  const oos = buildOosDecision(input.current, minTrades);
  const calibration = buildCalibrationDecision(input.calibrationSamples, minCalibrationSamples);
  const drift = buildDriftDecision(input.current, input.baseline);

  const reasons: string[] = [];
  if (!oos.pass) {
    reasons.push('oos_gate_failed');
  }
  if (!calibration.pass) {
    reasons.push(
      calibration.sampleSize < calibration.minSampleSize
        ? 'calibration_insufficient_samples'
        : 'calibration_gate_failed'
    );
  }
  if (!drift.pass) {
    reasons.push('drift_gate_failed');
  }

  const pass = oos.pass && calibration.pass && drift.pass;
  return {
    pass,
    status: pass ? 'stable' : 'draft',
    reasons,
    oos,
    calibration,
    drift,
  };
}

