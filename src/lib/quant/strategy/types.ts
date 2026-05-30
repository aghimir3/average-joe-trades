import { z } from 'zod';
import type { OHLCVBar } from '@/lib/quant/data';
import type { StockFeatureRow } from '@/lib/quant/features';

export const SignalSideSchema = z.enum(['buy', 'sell', 'hold']);
export type SignalSide = z.infer<typeof SignalSideSchema>;

export const ConfidenceBandSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;

export const SignalHorizonSchema = z.enum(['intraday', 'swing', 'position']);
export type SignalHorizon = z.infer<typeof SignalHorizonSchema>;

export const QuantSignalSchema = z.object({
  symbol: z.string().min(1).max(20),
  timestamp: z.string().datetime(),
  side: SignalSideSchema,
  strength: z.number().min(0).max(1),
  horizon: SignalHorizonSchema,
  rationaleCodes: z.array(z.string().min(2).max(60)).min(1).max(8),
  confidence: z.number().min(0).max(1),
  confidenceBand: ConfidenceBandSchema,
  expectedReturnPct: z.number(),
  riskFlags: z.array(z.string().min(2).max(60)).max(8),
});

export type QuantSignal = z.infer<typeof QuantSignalSchema>;

export interface StrategyPosition {
  symbol: string;
  quantity: number;
  avgPrice: number;
  side: 'long' | 'short';
}

export interface StrategyInput {
  symbol: string;
  bars: OHLCVBar[];
  features: StockFeatureRow[];
  openPositions: StrategyPosition[];
  asOf: Date;
}

export interface QuantStrategy {
  readonly strategyKey: string;
  generateSignals(input: StrategyInput): QuantSignal[];
}

export function confidenceToBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

