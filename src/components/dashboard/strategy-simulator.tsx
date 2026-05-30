/**
 * Strategy Simulator Component
 * Simulates trades and shows ML predictions before execution
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Activity,
  ChevronRight,
  Sparkles,
  Loader2,
  Info,
  ArrowRight,
  Shield,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface EnsemblePrediction {
  symbol: string;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'avoid';
  confidence: number;
  uncertaintyRange: [number, number];
  components: {
    volatilityRegime?: {
      regime: string;
      confidence: number;
    };
    entryTiming?: {
      signal: string;
      probability: number;
      confidence: number;
    };
    strategyRecommendation?: {
      strategy: string;
      confidence: number;
      historicalWinRate: number;
      expectedReturn: number;
    };
    riskAnalysis?: {
      riskScore: number;
      alerts: Array<{ message: string; severity: string }>;
    };
    similarTrades?: {
      aggregateStats: {
        totalFound: number;
        winCount: number;
        avgReturn: number;
        avgHoldDays: number;
      };
    };
  };
  insights: Array<{
    type: string;
    source: string;
    message: string;
    weight: number;
  }>;
  riskAdjusted: {
    expectedReturn: number;
    maxDrawdownRisk: number;
    sharpeEstimate: number;
    kellyFraction: number;
  };
  uncertainty: {
    modelDisagreement: number;
    dataConfidence: number;
    marketRegimeUncertainty: number;
    overallUncertainty: number;
  };
}

const STRATEGIES = [
  { value: 'long_call', label: 'Long Call', type: 'bullish' },
  { value: 'long_put', label: 'Long Put', type: 'bearish' },
  { value: 'covered_call', label: 'Covered Call', type: 'neutral' },
  { value: 'cash_secured_put', label: 'Cash Secured Put', type: 'bullish' },
  { value: 'bull_call_spread', label: 'Bull Call Spread', type: 'bullish' },
  { value: 'bear_put_spread', label: 'Bear Put Spread', type: 'bearish' },
  { value: 'iron_condor', label: 'Iron Condor', type: 'neutral' },
  { value: 'straddle', label: 'Straddle', type: 'neutral' },
];

// ============================================================================
// API Function
// ============================================================================

async function fetchEnsemblePrediction(
  symbol: string,
  strategy?: string,
  strike?: number,
  dte?: number,
  premium?: number
): Promise<EnsemblePrediction> {
  const params = new URLSearchParams({ type: 'symbol', symbol });
  if (strategy) params.set('strategy', strategy);
  if (strike) params.set('strike', strike.toString());
  if (dte) params.set('dte', dte.toString());
  if (premium) params.set('premium', premium.toString());

  const res = await fetch(`/api/ml/options/ensemble?${params}`);
  if (!res.ok) throw new Error('Failed to fetch prediction');
  const data = await parseApiJson(res);
  return apiData(data);
}

// ============================================================================
// Component
// ============================================================================

interface StrategySimulatorProps {
  accountId?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- accountId will be used for account-specific predictions
export function StrategySimulator({ accountId }: StrategySimulatorProps) {
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState<string>('');
  const [strike, setStrike] = useState<string>('');
  const [dte, setDte] = useState<string>('30');
  const [premium, setPremium] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Query for prediction when simulating
  const predictionQuery = useQuery({
    queryKey: ['ensemble-prediction', symbol, strategy, strike, dte, premium],
    queryFn: () => fetchEnsemblePrediction(
      symbol.toUpperCase(),
      strategy || undefined,
      strike ? parseFloat(strike) : undefined,
      dte ? parseInt(dte) : undefined,
      premium ? parseFloat(premium) : undefined
    ),
    enabled: isSimulating && symbol.length > 0,
    staleTime: 60 * 1000,
  });

  const handleSimulate = useCallback(() => {
    if (symbol.trim()) {
      setIsSimulating(true);
    }
  }, [symbol]);

  const handleReset = useCallback(() => {
    setIsSimulating(false);
    setSymbol('');
    setStrategy('');
    setStrike('');
    setDte('30');
    setPremium('');
  }, []);

  const prediction = predictionQuery.data;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-linear-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
            <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Strategy Simulator</CardTitle>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Test trade ideas with ML predictions before executing
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!isSimulating ? (
          <SimulatorForm
            symbol={symbol}
            setSymbol={setSymbol}
            strategy={strategy}
            setStrategy={setStrategy}
            strike={strike}
            setStrike={setStrike}
            dte={dte}
            setDte={setDte}
            premium={premium}
            setPremium={setPremium}
            onSimulate={handleSimulate}
          />
        ) : predictionQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
            <p className="text-zinc-500">Analyzing {symbol.toUpperCase()}...</p>
            <p className="text-sm text-zinc-400">Running ML models</p>
          </div>
        ) : predictionQuery.isError ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
            <p className="font-medium mb-2">Prediction Failed</p>
            <p className="text-sm text-zinc-500 mb-4">Unable to generate prediction for {symbol}</p>
            <Button variant="outline" onClick={handleReset}>Try Again</Button>
          </div>
        ) : prediction ? (
          <SimulatorResults prediction={prediction} onReset={handleReset} />
        ) : null}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Simulator Form
// ============================================================================

function SimulatorForm({
  symbol,
  setSymbol,
  strategy,
  setStrategy,
  strike,
  setStrike,
  dte,
  setDte,
  premium,
  setPremium,
  onSimulate,
}: {
  symbol: string;
  setSymbol: (v: string) => void;
  strategy: string;
  setStrategy: (v: string) => void;
  strike: string;
  setStrike: (v: string) => void;
  dte: string;
  setDte: (v: string) => void;
  premium: string;
  setPremium: (v: string) => void;
  onSimulate: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Symbol Input */}
      <div className="space-y-2">
        <Label htmlFor="symbol">Symbol</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            id="symbol"
            placeholder="e.g., AAPL, TSLA, SPY"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="pl-10"
          />
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="space-y-2">
        <Label htmlFor="strategy">Strategy (Optional)</Label>
        <Select value={strategy} onValueChange={setStrategy}>
          <SelectTrigger>
            <SelectValue placeholder="Select a strategy" />
          </SelectTrigger>
          <SelectContent>
            {STRATEGIES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <div className="flex items-center gap-2">
                  {s.label}
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      s.type === 'bullish' && 'border-green-500 text-green-600',
                      s.type === 'bearish' && 'border-red-500 text-red-600',
                      s.type === 'neutral' && 'border-zinc-500 text-zinc-600'
                    )}
                  >
                    {s.type}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Optional Parameters */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="strike">Strike</Label>
          <Input
            id="strike"
            type="number"
            placeholder="100"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dte">DTE</Label>
          <Input
            id="dte"
            type="number"
            placeholder="30"
            value={dte}
            onChange={(e) => setDte(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="premium">Premium</Label>
          <Input
            id="premium"
            type="number"
            step="0.01"
            placeholder="1.50"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
          />
        </div>
      </div>

      {/* Simulate Button */}
      <Button
        className="w-full"
        onClick={onSimulate}
        disabled={!symbol.trim()}
      >
        <Brain className="h-4 w-4 mr-2" />
        Analyze Trade
      </Button>

      {/* Info */}
      <p className="text-xs text-zinc-500 text-center flex items-center justify-center gap-1">
        <Info className="h-3 w-3" />
        ML predictions based on your trading history
      </p>
    </div>
  );
}

// ============================================================================
// Simulator Results
// ============================================================================

function SimulatorResults({
  prediction,
  onReset,
}: {
  prediction: EnsemblePrediction;
  onReset: () => void;
}) {
  const recommendationColors = {
    strong_buy: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    buy: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hold: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
    reduce: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    avoid: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  };

  const recommendationLabels = {
    strong_buy: 'Strong Buy',
    buy: 'Buy',
    hold: 'Hold',
    reduce: 'Reduce',
    avoid: 'Avoid',
  };

  return (
    <div className="space-y-4">
      {/* Main Recommendation */}
      <div className={cn(
        'p-4 rounded-xl border-2 text-center',
        recommendationColors[prediction.recommendation]
      )}>
        <p className="text-sm opacity-80 mb-1">ML Recommendation for {prediction.symbol}</p>
        <p className="text-2xl font-bold mb-2">
          {recommendationLabels[prediction.recommendation]}
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm">Confidence:</span>
          <span className="font-semibold">{(prediction.confidence * 100).toFixed(0)}%</span>
          <span className="text-xs opacity-70">
            (95% CI: {(prediction.uncertaintyRange[0] * 100).toFixed(0)}-{(prediction.uncertaintyRange[1] * 100).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* Risk-Adjusted Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={TrendingUp}
          label="Expected Return"
          value={`${(prediction.riskAdjusted.expectedReturn * 100).toFixed(1)}%`}
          color={prediction.riskAdjusted.expectedReturn > 0 ? 'green' : 'red'}
        />
        <MetricCard
          icon={Shield}
          label="Max Drawdown"
          value={`${(prediction.riskAdjusted.maxDrawdownRisk * 100).toFixed(1)}%`}
          color="amber"
        />
        <MetricCard
          icon={BarChart3}
          label="Sharpe Est."
          value={prediction.riskAdjusted.sharpeEstimate.toFixed(2)}
          color={prediction.riskAdjusted.sharpeEstimate > 1 ? 'green' : 'zinc'}
        />
        <MetricCard
          icon={DollarSign}
          label="Kelly Size"
          value={`${(prediction.riskAdjusted.kellyFraction * 100).toFixed(0)}%`}
          color="blue"
        />
      </div>

      {/* Component Breakdown */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-violet-500" />
          Model Analysis
        </h4>
        <div className="space-y-3">
          {prediction.components.volatilityRegime && (
            <ComponentRow
              label="Volatility"
              value={prediction.components.volatilityRegime.regime}
              confidence={prediction.components.volatilityRegime.confidence}
            />
          )}
          {prediction.components.entryTiming && (
            <ComponentRow
              label="Entry Signal"
              value={prediction.components.entryTiming.signal}
              confidence={prediction.components.entryTiming.confidence}
              extra={`${(prediction.components.entryTiming.probability * 100).toFixed(0)}% prob`}
            />
          )}
          {prediction.components.strategyRecommendation && (
            <ComponentRow
              label="Best Strategy"
              value={prediction.components.strategyRecommendation.strategy.replace('_', ' ')}
              confidence={prediction.components.strategyRecommendation.confidence}
              extra={`${(prediction.components.strategyRecommendation.historicalWinRate * 100).toFixed(0)}% win rate`}
            />
          )}
          {prediction.components.similarTrades && (
            <ComponentRow
              label="Similar Trades"
              value={`${prediction.components.similarTrades.aggregateStats.totalFound} found`}
              extra={`${(prediction.components.similarTrades.aggregateStats.winCount / prediction.components.similarTrades.aggregateStats.totalFound * 100).toFixed(0)}% won`}
            />
          )}
        </div>
      </div>

      {/* Uncertainty Breakdown */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Uncertainty Analysis
        </h4>
        <div className="space-y-2">
          <UncertaintyBar
            label="Model Agreement"
            value={1 - prediction.uncertainty.modelDisagreement}
          />
          <UncertaintyBar
            label="Data Confidence"
            value={1 - prediction.uncertainty.dataConfidence}
          />
          <UncertaintyBar
            label="Market Clarity"
            value={1 - prediction.uncertainty.marketRegimeUncertainty}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Overall uncertainty: {(prediction.uncertainty.overallUncertainty * 100).toFixed(0)}%
        </p>
      </div>

      {/* Insights */}
      {prediction.insights.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Key Insights
          </h4>
          <ul className="space-y-2">
            {prediction.insights.slice(0, 5).map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <InsightIcon type={insight.type} />
                <div>
                  <span className="text-zinc-500 text-xs">{insight.source}:</span>{' '}
                  {insight.message}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onReset}>
          New Simulation
        </Button>
        <Button className="flex-1">
          <ArrowRight className="h-4 w-4 mr-2" />
          Execute Trade
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  color: 'green' | 'red' | 'amber' | 'blue' | 'zinc';
}) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600',
  };

  return (
    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('p-1 rounded', colorClasses[color])}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function ComponentRow({
  label,
  value,
  confidence,
  extra,
}: {
  label: string;
  value: string;
  confidence?: number;
  extra?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium capitalize">{value}</span>
        {confidence !== undefined && (
          <Badge variant="outline" className="text-xs">
            {(confidence * 100).toFixed(0)}%
          </Badge>
        )}
        {extra && (
          <span className="text-xs text-zinc-500">{extra}</span>
        )}
      </div>
    </div>
  );
}

function UncertaintyBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <Progress value={value * 100} className="h-1.5" />
    </div>
  );
}

function InsightIcon({ type }: { type: string }) {
  switch (type) {
    case 'bullish':
      return <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />;
    case 'bearish':
      return <TrendingDown className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />;
    case 'caution':
      return <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />;
    case 'opportunity':
      return <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />;
    default:
      return <ChevronRight className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />;
  }
}

export default StrategySimulator;
