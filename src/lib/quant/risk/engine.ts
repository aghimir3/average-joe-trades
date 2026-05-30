import type { EquityPoint } from '@/lib/quant/backtest';
import {
  DEFAULT_RISK_LIMITS,
  type RiskFlag,
  type RiskLimits,
  type RiskPosition,
  type RiskReport,
  type StressScenario,
} from './types';

interface RiskInput {
  equity: number;
  positions: RiskPosition[];
  dailyReturns: number[];
  equityCurve?: EquityPoint[];
  limits?: Partial<RiskLimits>;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function estimateVarAndCvar(returns: number[]): { var95Pct: number; cvar95Pct: number } {
  if (returns.length < 5) {
    return { var95Pct: 0, cvar95Pct: 0 };
  }
  const var5 = percentile(returns, 5);
  const tail = returns.filter((value) => value <= var5);
  const cvar = tail.length > 0 ? tail.reduce((sum, value) => sum + value, 0) / tail.length : var5;
  return {
    var95Pct: Math.abs(var5) * 100,
    cvar95Pct: Math.abs(cvar) * 100,
  };
}

function deriveDrawdown(equityCurve?: EquityPoint[]): { currentDrawdownPct: number; maxDrawdownPct: number } {
  if (!equityCurve || equityCurve.length === 0) {
    return { currentDrawdownPct: 0, maxDrawdownPct: 0 };
  }
  const maxDrawdownPct = Math.abs(Math.min(...equityCurve.map((point) => point.drawdownPct), 0)) * 100;
  const latest = equityCurve[equityCurve.length - 1];
  return {
    currentDrawdownPct: Math.abs(Math.min(0, latest.drawdownPct)) * 100,
    maxDrawdownPct,
  };
}

function deriveStressScenarios(equity: number, positions: RiskPosition[]): StressScenario[] {
  const netMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const shocks = [-0.03, -0.05, -0.1];

  return shocks.map((shockPct) => {
    const estimatedPnl = netMarketValue * shockPct;
    return {
      scenario: `${Math.abs(shockPct * 100).toFixed(0)}% broad market shock`,
      shockPct: shockPct * 100,
      estimatedPnl,
      estimatedEquity: equity + estimatedPnl,
    };
  });
}

function symbolExposureMap(positions: RiskPosition[], equity: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const position of positions) {
    const next = (map.get(position.symbol) ?? 0) + Math.abs(position.marketValue);
    map.set(position.symbol, next);
  }
  for (const [symbol, value] of map) {
    map.set(symbol, equity > 0 ? (value / equity) * 100 : 0);
  }
  return map;
}

function sectorExposureMap(positions: RiskPosition[], equity: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const position of positions) {
    const key = position.sector ?? 'unknown';
    const next = (map.get(key) ?? 0) + Math.abs(position.marketValue);
    map.set(key, next);
  }
  for (const [sector, value] of map) {
    map.set(sector, equity > 0 ? (value / equity) * 100 : 0);
  }
  return map;
}

function createRiskFlags(
  limits: RiskLimits,
  report: Omit<RiskReport, 'flags'>
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (report.exposures.largestSymbol && report.exposures.largestSymbol.exposurePct > limits.maxSingleSymbolExposurePct) {
    flags.push({
      code: 'SYMBOL_CONCENTRATION',
      severity: report.exposures.largestSymbol.exposurePct > limits.maxSingleSymbolExposurePct * 1.3 ? 'critical' : 'warning',
      message: `${report.exposures.largestSymbol.symbol} exceeds single-name exposure limit`,
      observedValue: report.exposures.largestSymbol.exposurePct,
      threshold: limits.maxSingleSymbolExposurePct,
    });
  }

  if (report.exposures.grossExposurePct > limits.maxGrossExposurePct) {
    flags.push({
      code: 'GROSS_EXPOSURE_LIMIT',
      severity: 'critical',
      message: 'Gross exposure above configured limit',
      observedValue: report.exposures.grossExposurePct,
      threshold: limits.maxGrossExposurePct,
    });
  }

  if (Math.abs(report.exposures.netExposurePct) > limits.maxNetExposurePct) {
    flags.push({
      code: 'NET_EXPOSURE_LIMIT',
      severity: 'warning',
      message: 'Net exposure above configured limit',
      observedValue: Math.abs(report.exposures.netExposurePct),
      threshold: limits.maxNetExposurePct,
    });
  }

  if (report.drawdown.currentDrawdownPct > limits.maxDrawdownPct) {
    flags.push({
      code: 'DRAWDOWN_GUARDRAIL',
      severity: 'critical',
      message: 'Current drawdown exceeds guardrail',
      observedValue: report.drawdown.currentDrawdownPct,
      threshold: limits.maxDrawdownPct,
    });
  }

  if (report.exposures.leverageProxy > limits.maxLeverageProxy) {
    flags.push({
      code: 'LEVERAGE_PROXY',
      severity: 'warning',
      message: 'Leverage proxy is above risk policy threshold',
      observedValue: report.exposures.leverageProxy,
      threshold: limits.maxLeverageProxy,
    });
  }

  return flags;
}

export function evaluatePortfolioRisk(input: RiskInput): RiskReport {
  const limits: RiskLimits = { ...DEFAULT_RISK_LIMITS, ...input.limits };
  const equity = input.equity;
  const grossMarketValue = input.positions.reduce((sum, position) => sum + Math.abs(position.marketValue), 0);
  const netMarketValue = input.positions.reduce((sum, position) => sum + position.marketValue, 0);

  const symbolExposures = symbolExposureMap(input.positions, equity);
  const sectorExposures = sectorExposureMap(input.positions, equity);
  const largestSymbol = Array.from(symbolExposures.entries())
    .sort((a, b) => b[1] - a[1])[0];
  const largestSector = Array.from(sectorExposures.entries())
    .sort((a, b) => b[1] - a[1])[0];

  const leverageProxy = equity > 0 ? grossMarketValue / equity : 0;
  const drawdown = deriveDrawdown(input.equityCurve);
  const valueAtRisk = estimateVarAndCvar(input.dailyReturns);
  const stressScenarios = deriveStressScenarios(equity, input.positions);

  const reportCore = {
    exposures: {
      grossExposurePct: equity > 0 ? (grossMarketValue / equity) * 100 : 0,
      netExposurePct: equity > 0 ? (netMarketValue / equity) * 100 : 0,
      largestSymbol: largestSymbol ? { symbol: largestSymbol[0], exposurePct: largestSymbol[1] } : null,
      largestSector: largestSector ? { sector: largestSector[0], exposurePct: largestSector[1] } : null,
      leverageProxy,
    },
    drawdown,
    valueAtRisk,
    stressScenarios,
  };

  return {
    ...reportCore,
    flags: createRiskFlags(limits, reportCore),
  };
}

