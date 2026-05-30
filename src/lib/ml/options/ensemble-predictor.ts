/**
 * Ensemble Predictor with Uncertainty Quantification
 * Combines predictions from multiple models with calibrated confidence
 */

import { prisma } from '@/lib/prisma';
import { predictVolatilityRegime } from './volatility-regime';
import { predictEntryTiming } from './entry-timing';
import { predictStrategy } from './strategy-classifier';
import { predictExitStrategy } from './exit-strategy';
import { analyzePortfolioRisk } from './risk-analyzer';
import { findSimilarTrades } from './trade-similarity';
import type {
  VolatilityRegimeResult,
  EntryTimingResult,
  StrategyRecommendation,
  ExitStrategyResult,
  PortfolioRiskAnalysis,
  SimilaritySearchResult,
} from './types';

// Type aliases for backward compatibility in this file
type VolatilityRegimePrediction = VolatilityRegimeResult;
type EntryTimingPrediction = EntryTimingResult;
type ExitStrategyPrediction = ExitStrategyResult;
type RiskAnalysis = PortfolioRiskAnalysis;

// ============================================================================
// Types
// ============================================================================

export interface EnsemblePrediction {
  symbol: string;
  timestamp: Date;

  // Overall recommendation
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'avoid';
  confidence: number; // 0-1
  uncertaintyRange: [number, number]; // 95% CI for confidence

  // Component predictions
  components: {
    volatilityRegime?: VolatilityRegimePrediction;
    entryTiming?: EntryTimingPrediction;
    strategyRecommendation?: StrategyRecommendation;
    riskAnalysis?: RiskAnalysis;
    similarTrades?: SimilaritySearchResult;
  };

  // Unified insights
  insights: EnsembleInsight[];

  // Risk-adjusted metrics
  riskAdjusted: {
    expectedReturn: number;
    maxDrawdownRisk: number;
    sharpeEstimate: number;
    kellyFraction: number; // Optimal position size
  };

  // Uncertainty breakdown
  uncertainty: {
    modelDisagreement: number; // How much models disagree
    dataConfidence: number; // Based on training data relevance
    marketRegimeUncertainty: number; // Based on volatility regime
    overallUncertainty: number;
  };
}

export interface EnsembleInsight {
  type: 'bullish' | 'bearish' | 'neutral' | 'caution' | 'opportunity';
  source: string;
  message: string;
  weight: number;
}

export interface PositionEnsemblePrediction {
  positionId: string;
  symbol: string;
  timestamp: Date;

  // Exit recommendation
  exitRecommendation: {
    action: 'hold' | 'close' | 'roll' | 'hedge';
    confidence: number;
    targetPrice?: number;
    stopLoss?: number;
    rollSuggestion?: string;
  };

  // Exit strategy from model
  exitStrategy?: ExitStrategyPrediction;

  // Risk assessment
  risk: {
    currentRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    daysToExpiry?: number;
    thetaDecay?: number;
  };

  // Uncertainty
  uncertainty: {
    overall: number;
    confidence95CI: [number, number];
  };

  insights: EnsembleInsight[];
}

// ============================================================================
// Ensemble Prediction for New Trade
// ============================================================================

export async function getEnsemblePrediction(
  userId: string,
  symbol: string,
  tradeSetup?: {
    strategy?: string;
    strike?: number;
    dte?: number;
    premium?: number;
  }
): Promise<EnsemblePrediction> {
  const timestamp = new Date();

  // Fetch all component predictions in parallel
  const [
    volatilityResult,
    entryResult,
    strategyResult,
    riskResult,
    similarResult,
  ] = await Promise.allSettled([
    predictVolatilityRegime(userId, symbol),
    predictEntryTiming(userId, symbol),
    predictStrategy(userId, symbol),
    analyzePortfolioRisk(userId),
    tradeSetup ? findSimilarTrades(userId, {
      symbol,
      strategy: tradeSetup.strategy || null,
      strike: tradeSetup.strike || 100,
      dte: tradeSetup.dte || 30,
      premium: tradeSetup.premium || 1,
    }) : Promise.resolve(null),
  ]);

  // Extract successful predictions
  const volatility = volatilityResult.status === 'fulfilled' ? volatilityResult.value : undefined;
  const entry = entryResult.status === 'fulfilled' ? entryResult.value : undefined;
  const strategy = strategyResult.status === 'fulfilled' ? strategyResult.value : undefined;
  const risk = riskResult.status === 'fulfilled' ? riskResult.value : undefined;
  const similar = similarResult.status === 'fulfilled' ? similarResult.value : undefined;

  // Calculate ensemble recommendation
  const { recommendation, confidence, insights } = calculateEnsembleRecommendation(
    volatility,
    entry,
    strategy,
    risk,
    similar
  );

  // Calculate uncertainty
  const uncertainty = calculateUncertainty(volatility, entry, strategy, risk, similar);

  // Calculate risk-adjusted metrics
  const riskAdjusted = calculateRiskAdjustedMetrics(
    strategy?.expectedReturn || 0,
    risk?.riskScore || 0.5,
    similar?.aggregateStats?.avgReturn || 0
  );

  // Calculate 95% confidence interval
  const uncertaintyRange = calculateConfidenceInterval(confidence, uncertainty.overallUncertainty);

  return {
    symbol,
    timestamp,
    recommendation,
    confidence,
    uncertaintyRange,
    components: {
      volatilityRegime: volatility,
      entryTiming: entry,
      strategyRecommendation: strategy,
      riskAnalysis: risk,
      similarTrades: similar || undefined,
    },
    insights,
    riskAdjusted,
    uncertainty,
  };
}

// ============================================================================
// Ensemble Prediction for Existing Position
// ============================================================================

export async function getPositionEnsemblePrediction(
  userId: string,
  positionId: string
): Promise<PositionEnsemblePrediction> {
  const timestamp = new Date();

  // Get position details
  const position = await prisma.derivedPosition.findUnique({
    where: { id: positionId },
  });

  if (!position) {
    throw new Error(`Position ${positionId} not found`);
  }

  // Get exit strategy prediction and risk analysis
  const [exitResult, riskResult] = await Promise.allSettled([
    predictExitStrategy(userId, positionId),
    analyzePortfolioRisk(userId),
  ]);

  const exitStrategy = exitResult.status === 'fulfilled' ? exitResult.value : undefined;
  const risk = riskResult.status === 'fulfilled' ? riskResult.value : undefined;

  // Calculate days to expiry
  const daysToExpiry = position.expiration
    ? Math.max(0, Math.ceil((position.expiration.getTime() - timestamp.getTime()) / (24 * 60 * 60 * 1000)))
    : undefined;

  // Determine exit recommendation
  const { action, confidence: exitConfidence } = determineExitAction(
    exitStrategy,
    daysToExpiry,
    risk?.riskScore || 0.5
  );

  // Calculate risk level
  const riskLevel = calculatePositionRiskLevel(daysToExpiry, risk?.riskScore || 0.5, position);

  // Generate insights
  const insights = generatePositionInsights(position, exitStrategy, daysToExpiry, riskLevel);

  // Calculate uncertainty
  const overallUncertainty = exitStrategy
    ? 1 - exitStrategy.confidence
    : 0.5;

  return {
    positionId,
    symbol: position.symbol,
    timestamp,
    exitRecommendation: {
      action,
      confidence: exitConfidence,
      targetPrice: exitStrategy?.targetProfitPercent,
      stopLoss: exitStrategy?.stopLossPercent,
      rollSuggestion: exitStrategy?.rollProbability !== undefined && exitStrategy.rollProbability > 0.5 && daysToExpiry !== undefined && daysToExpiry < 7
        ? `Consider rolling to ${daysToExpiry + 30} DTE`
        : undefined,
    },
    exitStrategy,
    risk: {
      currentRiskLevel: riskLevel,
      riskScore: risk?.riskScore || 0.5,
      daysToExpiry,
      thetaDecay: exitStrategy?.exitTiming !== undefined
        ? -0.02 * Number(position.avgPrice) * Number(position.quantity)
        : undefined,
    },
    uncertainty: {
      overall: overallUncertainty,
      confidence95CI: calculateConfidenceInterval(exitConfidence, overallUncertainty),
    },
    insights,
  };
}

// ============================================================================
// Batch Predictions
// ============================================================================

export async function getPortfolioEnsemblePredictions(
  userId: string,
  brokerageAccountId?: string | null
): Promise<{
  positions: PositionEnsemblePrediction[];
  summary: {
    totalPositions: number;
    highRiskCount: number;
    actionRequired: number;
    averageConfidence: number;
    portfolioRiskScore: number;
  };
}> {
  // Get open positions - filter by account if provided
  const positions = await prisma.derivedPosition.findMany({
    where: {
      userId,
      positionType: 'option',
      // Filter by account if specified, otherwise get all
      ...(brokerageAccountId ? { brokerageAccountId } : {}),
    },
  });

  // Get predictions for each position
  const predictions = await Promise.all(
    positions.map(pos => getPositionEnsemblePrediction(userId, pos.id).catch(() => null))
  );

  const validPredictions = predictions.filter((p): p is PositionEnsemblePrediction => p !== null);

  // Calculate summary
  const highRiskCount = validPredictions.filter(p =>
    p.risk.currentRiskLevel === 'high' || p.risk.currentRiskLevel === 'critical'
  ).length;

  const actionRequired = validPredictions.filter(p =>
    p.exitRecommendation.action !== 'hold'
  ).length;

  const averageConfidence = validPredictions.length > 0
    ? validPredictions.reduce((sum, p) => sum + p.exitRecommendation.confidence, 0) / validPredictions.length
    : 0;

  const portfolioRiskScore = validPredictions.length > 0
    ? validPredictions.reduce((sum, p) => sum + p.risk.riskScore, 0) / validPredictions.length
    : 0;

  return {
    positions: validPredictions,
    summary: {
      totalPositions: positions.length,
      highRiskCount,
      actionRequired,
      averageConfidence,
      portfolioRiskScore,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function calculateEnsembleRecommendation(
  volatility?: VolatilityRegimePrediction,
  entry?: EntryTimingPrediction,
  strategy?: StrategyRecommendation,
  risk?: RiskAnalysis,
  similar?: SimilaritySearchResult | null
): {
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'avoid';
  confidence: number;
  insights: EnsembleInsight[];
} {
  const insights: EnsembleInsight[] = [];
  let score = 0; // -2 to +2 scale
  let weights = 0;

  // Volatility regime contribution
  if (volatility) {
    const volWeight = volatility.confidence;
    if (volatility.regime === 'low') {
      score += 0.5 * volWeight;
      insights.push({
        type: 'bullish',
        source: 'Volatility',
        message: 'Low volatility environment favors premium selling',
        weight: volWeight,
      });
    } else if (volatility.regime === 'high') {
      score -= 0.5 * volWeight;
      insights.push({
        type: 'caution',
        source: 'Volatility',
        message: 'High volatility increases risk',
        weight: volWeight,
      });
    }
    weights += volWeight;
  }

  // Entry timing contribution
  if (entry) {
    const entryWeight = entry.confidence;
    // entryScore 0-1: higher = better time to enter
    if (entry.entryScore > 0.7) {
      score += 1.0 * entryWeight;
      insights.push({
        type: 'opportunity',
        source: 'Entry Timing',
        message: `Strong entry signal detected (${(entry.entryScore * 100).toFixed(0)}% score)`,
        weight: entryWeight,
      });
    } else if (entry.entryScore < 0.4) {
      score -= 0.3 * entryWeight;
      insights.push({
        type: 'neutral',
        source: 'Entry Timing',
        message: entry.suggestedWait || 'Consider waiting for better entry',
        weight: entryWeight,
      });
    }
    weights += entryWeight;
  }

  // Strategy recommendation contribution
  if (strategy) {
    const stratWeight = strategy.confidence;
    if (strategy.historicalWinRate > 0.6) {
      score += 0.8 * stratWeight;
      insights.push({
        type: 'bullish',
        source: 'Strategy',
        message: `${strategy.strategy.replace('_', ' ')} has ${(strategy.historicalWinRate * 100).toFixed(0)}% historical win rate`,
        weight: stratWeight,
      });
    } else if (strategy.historicalWinRate < 0.4) {
      score -= 0.5 * stratWeight;
      insights.push({
        type: 'caution',
        source: 'Strategy',
        message: 'Historical win rate below 40%',
        weight: stratWeight,
      });
    }
    weights += stratWeight;
  }

  // Risk analysis contribution
  if (risk) {
    if (risk.riskScore > 0.7) {
      score -= 1.0;
      insights.push({
        type: 'caution',
        source: 'Risk',
        message: 'Portfolio risk is elevated',
        weight: 1.0,
      });
    } else if (risk.riskScore < 0.3) {
      score += 0.3;
      insights.push({
        type: 'bullish',
        source: 'Risk',
        message: 'Portfolio has room for additional risk',
        weight: 0.5,
      });
    }
    weights += 1.0;
  }

  // Similar trades contribution
  if (similar && similar.aggregateStats.totalFound >= 5) {
    const winRate = similar.aggregateStats.winCount / similar.aggregateStats.totalFound;
    const simWeight = 0.8;

    if (winRate > 0.6 && similar.aggregateStats.avgReturn > 0) {
      score += 0.7 * simWeight;
      insights.push({
        type: 'opportunity',
        source: 'Similar Trades',
        message: `Similar trades won ${(winRate * 100).toFixed(0)}% of the time`,
        weight: simWeight,
      });
    } else if (winRate < 0.4) {
      score -= 0.7 * simWeight;
      insights.push({
        type: 'caution',
        source: 'Similar Trades',
        message: `Similar trades only won ${(winRate * 100).toFixed(0)}% of the time`,
        weight: simWeight,
      });
    }
    weights += simWeight;
  }

  // Normalize score to recommendation
  const normalizedScore = weights > 0 ? score / weights : 0;

  let recommendation: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'avoid';
  if (normalizedScore > 0.6) recommendation = 'strong_buy';
  else if (normalizedScore > 0.2) recommendation = 'buy';
  else if (normalizedScore > -0.2) recommendation = 'hold';
  else if (normalizedScore > -0.6) recommendation = 'reduce';
  else recommendation = 'avoid';

  // Calculate confidence based on model agreement
  const confidenceScores = [
    volatility?.confidence,
    entry?.confidence,
    strategy?.confidence,
  ].filter((c): c is number => c !== undefined);

  const avgConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    : 0.5;

  return { recommendation, confidence: avgConfidence, insights };
}

function calculateUncertainty(
  volatility?: VolatilityRegimePrediction,
  entry?: EntryTimingPrediction,
  strategy?: StrategyRecommendation,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future risk-based uncertainty
  _risk?: RiskAnalysis,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future similarity-based uncertainty
  _similar?: SimilaritySearchResult | null
): {
  modelDisagreement: number;
  dataConfidence: number;
  marketRegimeUncertainty: number;
  overallUncertainty: number;
} {
  // Model disagreement: variance in recommendations
  const scores: number[] = [];
  if (entry?.entryScore !== undefined && entry.entryScore > 0.7) scores.push(1);
  else if (entry?.entryScore !== undefined && entry.entryScore < 0.4) scores.push(0);
  if (strategy && strategy.historicalWinRate > 0.5) scores.push(1);
  else if (strategy) scores.push(0);
  if (volatility?.regime === 'low') scores.push(0.8);
  else if (volatility?.regime === 'high') scores.push(0.2);

  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
  const variance = scores.length > 0
    ? scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
    : 0.25;
  const modelDisagreement = Math.sqrt(variance);

  // Data confidence based on model confidences
  const confidences = [
    volatility?.confidence,
    entry?.confidence,
    strategy?.confidence,
  ].filter((c): c is number => c !== undefined);

  const dataConfidence = confidences.length > 0
    ? 1 - (confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0.5;

  // Market regime uncertainty
  const marketRegimeUncertainty = volatility
    ? 1 - volatility.confidence
    : 0.5;

  // Overall uncertainty (weighted combination)
  const overallUncertainty = (
    modelDisagreement * 0.4 +
    dataConfidence * 0.3 +
    marketRegimeUncertainty * 0.3
  );

  return {
    modelDisagreement,
    dataConfidence,
    marketRegimeUncertainty,
    overallUncertainty,
  };
}

function calculateRiskAdjustedMetrics(
  expectedReturn: number,
  riskScore: number,
  historicalAvgReturn: number
): {
  expectedReturn: number;
  maxDrawdownRisk: number;
  sharpeEstimate: number;
  kellyFraction: number;
} {
  // Use the higher of model prediction or historical return
  const adjustedReturn = Math.max(expectedReturn, historicalAvgReturn);

  // Max drawdown risk estimation
  const maxDrawdownRisk = riskScore * 0.5; // Rough estimate

  // Sharpe ratio estimate (assuming ~20% annual volatility for options)
  const annualizedReturn = adjustedReturn * 12; // Monthly to annual
  const assumedVolatility = 0.2 + riskScore * 0.3;
  const sharpeEstimate = assumedVolatility > 0
    ? annualizedReturn / assumedVolatility
    : 0;

  // Kelly criterion for position sizing
  // Kelly = (p * b - q) / b where p = win prob, b = win/loss ratio, q = 1 - p
  const winProbability = Math.max(0.3, Math.min(0.7, 0.5 + adjustedReturn));
  const winLossRatio = 1.5; // Assume 1.5:1 reward/risk
  const kellyFraction = Math.max(0, Math.min(0.25,
    (winProbability * winLossRatio - (1 - winProbability)) / winLossRatio
  ));

  return {
    expectedReturn: adjustedReturn,
    maxDrawdownRisk,
    sharpeEstimate,
    kellyFraction,
  };
}

function calculateConfidenceInterval(
  confidence: number,
  uncertainty: number
): [number, number] {
  // 95% CI using normal approximation
  const margin = 1.96 * uncertainty * 0.5;
  return [
    Math.max(0, confidence - margin),
    Math.min(1, confidence + margin),
  ];
}

function determineExitAction(
  exitStrategy?: ExitStrategyPrediction,
  daysToExpiry?: number,
  riskScore?: number
): {
  action: 'hold' | 'close' | 'roll' | 'hedge';
  confidence: number;
} {
  // Critical expiration - must act
  if (daysToExpiry !== undefined && daysToExpiry <= 1) {
    return { action: 'close', confidence: 0.95 };
  }

  // Very close to expiration
  if (daysToExpiry !== undefined && daysToExpiry <= 3) {
    if (exitStrategy?.rollProbability && exitStrategy.rollProbability > 0.6) {
      return { action: 'roll', confidence: exitStrategy.confidence };
    }
    return { action: 'close', confidence: 0.8 };
  }

  // Use exit strategy model if available
  if (exitStrategy) {
    // High stop loss probability (stopLossPercent is negative threshold)
    if (exitStrategy.stopLossPercent < -0.3 && exitStrategy.confidence > 0.6) {
      return { action: 'close', confidence: exitStrategy.confidence };
    }

    // Good roll opportunity
    if (exitStrategy.rollProbability > 0.7) {
      return { action: 'roll', confidence: exitStrategy.rollProbability };
    }

    // Target profit likely to be hit
    if (exitStrategy.targetProfitPercent > 0.3 && exitStrategy.confidence > 0.7) {
      return { action: 'hold', confidence: exitStrategy.confidence };
    }
  }

  // High portfolio risk - consider hedging
  if (riskScore && riskScore > 0.8) {
    return { action: 'hedge', confidence: 0.6 };
  }

  // Default to hold
  return { action: 'hold', confidence: 0.5 };
}

function calculatePositionRiskLevel(
  daysToExpiry: number | undefined,
  riskScore: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for position-type-based risk calculation
  _position: { positionType: string; optionType: string | null }
): 'low' | 'medium' | 'high' | 'critical' {
  // Critical if expiring very soon
  if (daysToExpiry !== undefined && daysToExpiry <= 1) {
    return 'critical';
  }

  // High risk factors
  if (daysToExpiry !== undefined && daysToExpiry <= 3) {
    return 'high';
  }

  if (riskScore > 0.7) {
    return 'high';
  }

  if (riskScore > 0.4 || (daysToExpiry !== undefined && daysToExpiry <= 7)) {
    return 'medium';
  }

  return 'low';
}

function generatePositionInsights(
  position: { symbol: string; optionType: string | null; expiration: Date | null },
  exitStrategy?: ExitStrategyPrediction,
  daysToExpiry?: number,
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
): EnsembleInsight[] {
  const insights: EnsembleInsight[] = [];

  // Expiration insights
  if (daysToExpiry !== undefined) {
    if (daysToExpiry <= 1) {
      insights.push({
        type: 'caution',
        source: 'Expiration',
        message: `${position.symbol} expires ${daysToExpiry === 0 ? 'today' : 'tomorrow'} - action required`,
        weight: 1.0,
      });
    } else if (daysToExpiry <= 7) {
      insights.push({
        type: 'caution',
        source: 'Expiration',
        message: `${daysToExpiry} days to expiration - monitor closely`,
        weight: 0.8,
      });
    }
  }

  // Exit strategy insights
  if (exitStrategy) {
    if (exitStrategy.rollProbability > 0.6) {
      insights.push({
        type: 'opportunity',
        source: 'Exit Model',
        message: 'Rolling the position may improve returns',
        weight: exitStrategy.rollProbability,
      });
    }

    if (exitStrategy.targetProfitPercent > 0) {
      insights.push({
        type: 'bullish',
        source: 'Exit Model',
        // targetProfitPercent is already in percent form (e.g., 50 = 50%)
        message: `Target profit: ${exitStrategy.targetProfitPercent.toFixed(0)}%`,
        weight: exitStrategy.confidence,
      });
    }
  }

  // Risk level insight with specific reasons
  if (riskLevel === 'high' || riskLevel === 'critical') {
    let riskReason = '';
    if (daysToExpiry !== undefined && daysToExpiry <= 3) {
      riskReason = `expiring in ${daysToExpiry} day${daysToExpiry !== 1 ? 's' : ''}`;
    } else if (daysToExpiry !== undefined && daysToExpiry <= 7) {
      riskReason = 'approaching expiration';
    } else {
      riskReason = 'high concentration or volatility exposure';
    }
    insights.push({
      type: 'caution',
      source: 'Risk Analysis',
      message: `High risk: ${riskReason}. Consider hedging to protect gains.`,
      weight: 0.9,
    });
  }

  return insights;
}
