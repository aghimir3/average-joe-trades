import { z } from 'zod';

export const StockFeatureRowSchema = z.object({
  symbol: z.string().min(1).max(20),
  timestamp: z.date(),
  sourceWindowEnd: z.date(),
  close: z.number().finite(),
  return1d: z.number().finite(),
  return5d: z.number().finite(),
  momentum20d: z.number().finite(),
  volatility20d: z.number().nonnegative().finite(),
  downsideVolatility20d: z.number().nonnegative().finite(),
  volumeZScore20d: z.number().finite(),
  drawdown20d: z.number().finite(),
});

export type StockFeatureRow = z.infer<typeof StockFeatureRowSchema>;

export const FeatureSetVersion = {
  STOCK_V1: 'stock-v1',
} as const;

export type FeatureSetVersionId = (typeof FeatureSetVersion)[keyof typeof FeatureSetVersion];

export interface NormalizationStats {
  keys: string[];
  means: Record<string, number>;
  stds: Record<string, number>;
}
