export interface RiskLimits {
  maxSingleSymbolExposurePct: number;
  maxGrossExposurePct: number;
  maxNetExposurePct: number;
  maxDrawdownPct: number;
  maxLeverageProxy: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxSingleSymbolExposurePct: 25,
  maxGrossExposurePct: 120,
  maxNetExposurePct: 80,
  maxDrawdownPct: 15,
  maxLeverageProxy: 1.3,
};

export interface RiskPosition {
  symbol: string;
  marketValue: number;
  side: 'long' | 'short';
  sector?: string | null;
}

export interface StressScenario {
  scenario: string;
  shockPct: number;
  estimatedPnl: number;
  estimatedEquity: number;
}

export interface RiskFlag {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  observedValue: number;
  threshold: number;
}

export interface RiskReport {
  exposures: {
    grossExposurePct: number;
    netExposurePct: number;
    largestSymbol: { symbol: string; exposurePct: number } | null;
    largestSector: { sector: string; exposurePct: number } | null;
    leverageProxy: number;
  };
  drawdown: {
    currentDrawdownPct: number;
    maxDrawdownPct: number;
  };
  valueAtRisk: {
    var95Pct: number;
    cvar95Pct: number;
  };
  stressScenarios: StressScenario[];
  flags: RiskFlag[];
}

