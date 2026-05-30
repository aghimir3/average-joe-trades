export interface StockTradeObservation {
  symbol: string;
  closeDate: Date;
  holdDays: number;
  returnPct: number;
}

export interface WeightedStockPerformance {
  tradeCount: number;
  effectiveSampleSize: number;
  weightedWinRate: number;
  weightedAvgReturnPct: number;
  weightedVolatilityPct: number;
  weightedDownsidePct: number;
  weightedAvgHoldDays: number;
}

export interface StockModelStatus {
  ready: boolean;
  tradeCount: number;
  uniqueSymbols: number;
  minTradesRequired: number;
  calibrationScore: number; // 0-1
  lastUpdated: string | null;
}

export interface StockActionSignal {
  id: string;
  type: 'add_position' | 'consider_exit' | 'reduce_risk' | 'hold_winner';
  priority: 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  symbol: string;
  title: string;
  description: string;
  reasoning: string[];
  metadata?: {
    currentPnlPercent?: number;
    entryPrice?: number;
    currentPrice?: number;
    dayChangePercent?: number;
    similarTradesCount?: number;
    similarTradesWinRate?: number;
  };
  suggestedAction?: {
    action: string;
    details: string;
  };
}
