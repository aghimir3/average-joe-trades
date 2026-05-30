/**
 * ML Options Insights Component
 * Displays ML-powered predictions, attribution, and insights
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Lightbulb,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Clock,
  Activity,
  PieChart,
  Zap,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  Shield,
  DollarSign,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency, cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface MLStatus {
  enabled: boolean;
  hasEnoughData: boolean;
  dataStats: {
    totalTrades: number;
    optionTrades: number;
    uniqueSymbols: number;
    strategiesUsed: number;
    dateRange: { start: string; end: string } | null;
  };
  modelInfo: {
    volatilityRegimeVersion: number | null;
    entryTimingVersion: number | null;
    exitStrategyVersion: number | null;
    strategyClassifierVersion: number | null;
    riskAnalyzerVersion: number | null;
    tradeEmbedderVersion: number | null;
    lastTrainedAt: string | null;
  };
  readiness: {
    ready: boolean;
    tradeCount: number;
    optionTradeCount: number;
    recommendations: string[];
  };
}

interface DailyInsights {
  date: string;
  summary: {
    totalPositions: number;
    netDelta: number;
    dailyTheta: number;
    unrealizedPnL: number;
    portfolioValue: number;
  };
  actionItems: Array<{
    type: string;
    symbol: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
    deadline?: string;
  }>;
  opportunities: Array<{
    symbol: string;
    strategy: string;
    confidence: number;
    expectedReturn: number;
    reasoning: string[];
  }>;
  riskAlerts: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    action: string;
  }>;
  learnings: string[];
}

interface PnLAttribution {
  totalPnL: number;
  breakdown: {
    deltaContribution: number;
    thetaContribution: number;
    vegaContribution: number;
    executionImpact: number;
    otherFactors: number;
  };
  percentages: {
    delta: number;
    theta: number;
    vega: number;
    execution: number;
    other: number;
  };
  insights: string[];
}

interface PositionHealthAlert {
  id: string;
  alertType: string;
  severity: 'high' | 'medium' | 'low';
  symbol: string;
  title: string;
  message: string;
  suggestedAction: string;
  isDismissed: boolean;
  createdAt: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchMLStatus(): Promise<MLStatus> {
  const res = await fetch('/api/ml/options/status');
  if (!res.ok) throw new Error('Failed to fetch ML status');
  const data = await parseApiJson(res);
  return apiData(data);
}

async function fetchDailyInsights(): Promise<DailyInsights | null> {
  const res = await fetch('/api/ml/options/insights?type=daily');
  if (!res.ok) throw new Error('Failed to fetch insights');
  const data = apiData<{ insights?: DailyInsights }>(await parseApiJson(res));
  return data.insights ?? null;
}

async function fetchPnLAttribution(): Promise<PnLAttribution | null> {
  const res = await fetch('/api/ml/options/attribution?type=portfolio');
  if (!res.ok) throw new Error('Failed to fetch attribution');
  return apiData<PnLAttribution>(await parseApiJson(res));
}

async function fetchActiveAlerts(): Promise<PositionHealthAlert[]> {
  const res = await fetch('/api/ml/options/insights?type=alerts');
  if (!res.ok) throw new Error('Failed to fetch alerts');
  const data = apiData<{ alerts?: PositionHealthAlert[] }>(await parseApiJson(res));
  return data.alerts ?? [];
}

async function trainModels(): Promise<{ success: boolean; modelsTrainedCount: number }> {
  const res = await fetch('/api/ml/options/train', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to train models');
  const data = await parseApiJson(res);
  return apiData(data);
}

async function refreshInsights(): Promise<DailyInsights> {
  const res = await fetch('/api/ml/options/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'refresh' }),
  });
  if (!res.ok) throw new Error('Failed to refresh insights');
  const data = apiData<{ insights: DailyInsights }>(await parseApiJson(res));
  return data.insights;
}

// ============================================================================
// Component
// ============================================================================

interface MLOptionsInsightsProps {
  accountId?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- accountId will be used for account-specific ML insights
export function MLOptionsInsights({ accountId }: MLOptionsInsightsProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  // Queries
  const statusQuery = useQuery({
    queryKey: ['ml-options-status'],
    queryFn: fetchMLStatus,
    staleTime: 5 * 60 * 1000,
  });

  const insightsQuery = useQuery({
    queryKey: ['ml-options-insights'],
    queryFn: fetchDailyInsights,
    staleTime: 5 * 60 * 1000,
    enabled: statusQuery.data?.hasEnoughData ?? false,
  });

  const attributionQuery = useQuery({
    queryKey: ['ml-options-attribution'],
    queryFn: fetchPnLAttribution,
    staleTime: 5 * 60 * 1000,
    enabled: statusQuery.data?.hasEnoughData ?? false,
  });

  const alertsQuery = useQuery({
    queryKey: ['ml-options-alerts'],
    queryFn: fetchActiveAlerts,
    staleTime: 2 * 60 * 1000,
    enabled: statusQuery.data?.hasEnoughData ?? false,
  });

  // Training mutation
  const trainMutation = useMutation({
    mutationFn: trainModels,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-options-status'] });
      queryClient.invalidateQueries({ queryKey: ['ml-options-insights'] });
      queryClient.invalidateQueries({ queryKey: ['ml-options-attribution'] });
    },
  });

  // Refresh insights mutation
  const refreshMutation = useMutation({
    mutationFn: refreshInsights,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-options-insights'] });
    },
  });

  const status = statusQuery.data;
  const insights = insightsQuery.data;
  const attribution = attributionQuery.data;
  const alerts = alertsQuery.data || [];

  // Check if feature is disabled
  if (status && 'enabled' in status && status.enabled === false) {
    return null; // Feature disabled, don't render anything
  }

  // Loading state
  if (statusQuery.isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <CardTitle className="text-lg font-semibold">ML Options Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3" />
            <div className="h-24 bg-zinc-200 dark:bg-zinc-700 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not enough data state
  if (status && !status.hasEnoughData) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <CardTitle className="text-lg font-semibold">ML Options Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="p-4 rounded-full bg-violet-100 dark:bg-violet-900/30 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Building Your ML Models</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-4 max-w-md mx-auto">
              ML predictions require at least 30 trades to train personalized models.
              You have {status.dataStats.totalTrades} trades so far.
            </p>
            <div className="mb-4">
              <Progress
                value={(status.dataStats.totalTrades / 30) * 100}
                className="h-2 max-w-xs mx-auto"
              />
              <p className="text-sm text-zinc-500 mt-2">
                {30 - status.dataStats.totalTrades} more trades needed
              </p>
            </div>
            {status.readiness.recommendations.length > 0 && (
              <div className="text-left max-w-md mx-auto mt-6 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <p className="text-sm font-medium mb-2">Recommendations:</p>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                  {status.readiness.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Count active alerts by severity
  const highAlerts = alerts.filter(a => a.severity === 'high' && !a.isDismissed).length;
  const mediumAlerts = alerts.filter(a => a.severity === 'medium' && !a.isDismissed).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">ML Options Insights</CardTitle>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Personalized predictions powered by your trading history
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {highAlerts > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {highAlerts}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => trainMutation.mutate()}
              disabled={trainMutation.isPending}
            >
              {trainMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">
                {trainMutation.isPending ? 'Training...' : 'Retrain'}
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-4 px-4 mb-4 no-scrollbar snap-x scroll-smooth touch-pan-x [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 sm:w-full">
              <TabsTrigger value="overview" className="text-xs sm:text-sm flex-1 sm:flex-none whitespace-nowrap data-[state=active]:bg-violet-600! data-[state=active]:text-white! snap-start">
                <Zap className="h-4 w-4 mr-1.5 hidden sm:inline" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="attribution" className="text-xs sm:text-sm flex-1 sm:flex-none whitespace-nowrap data-[state=active]:bg-violet-600! data-[state=active]:text-white! snap-start">
                <PieChart className="h-4 w-4 mr-1.5 hidden sm:inline" />
                <span className="sm:hidden">P&L</span>
                <span className="hidden sm:inline">P&L Breakdown</span>
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs sm:text-sm relative flex-1 sm:flex-none whitespace-nowrap data-[state=active]:bg-violet-600! data-[state=active]:text-white! snap-start">
                <AlertTriangle className="h-4 w-4 mr-1.5 hidden sm:inline" />
                Alerts
                {(highAlerts + mediumAlerts) > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {highAlerts + mediumAlerts}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="insights" className="text-xs sm:text-sm flex-1 sm:flex-none whitespace-nowrap data-[state=active]:bg-violet-600! data-[state=active]:text-white! snap-start">
                <Lightbulb className="h-4 w-4 mr-1.5 hidden sm:inline" />
                Insights
              </TabsTrigger>
              <TabsTrigger value="simulator" className="text-xs sm:text-sm flex-1 sm:flex-none whitespace-nowrap data-[state=active]:bg-violet-600! data-[state=active]:text-white! snap-start">
                <Target className="h-4 w-4 mr-1.5 hidden sm:inline" />
                Simulator
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <OverviewTab
              status={status!}
              insights={insights ?? null}
              alerts={alerts}
            />
          </TabsContent>

          {/* P&L Attribution Tab */}
          <TabsContent value="attribution" className="space-y-4">
            <AttributionTab attribution={attribution ?? null} />
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <AlertsTab alerts={alerts} />
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4">
            <InsightsTab
              insights={insights ?? null}
              onRefresh={() => refreshMutation.mutate()}
              isRefreshing={refreshMutation.isPending}
            />
          </TabsContent>

          {/* Simulator Tab */}
          <TabsContent value="simulator" className="space-y-4">
            <SimulatorTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab({
  status,
  insights,
  alerts
}: {
  status: MLStatus;
  insights: DailyInsights | null;
  alerts: PositionHealthAlert[];
}) {
  // Count actual model versions (exclude lastTrainedAt which is a date string, not a model)
  const modelVersions = [
    status.modelInfo.volatilityRegimeVersion,
    status.modelInfo.entryTimingVersion,
    status.modelInfo.exitStrategyVersion,
    status.modelInfo.strategyClassifierVersion,
    status.modelInfo.riskAnalyzerVersion,
    status.modelInfo.tradeEmbedderVersion,
  ];
  const modelsReady = modelVersions.filter(v => v !== null).length;
  const totalModels = 6;
  const activeAlerts = alerts.filter(a => !a.isDismissed);

  return (
    <div className="space-y-4">
      {/* Model Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Models Ready"
          value={`${modelsReady}/${totalModels}`}
          icon={Brain}
          color={modelsReady === totalModels ? 'green' : 'amber'}
        />
        <StatCard
          label="Trade History"
          value={status.dataStats.totalTrades.toString()}
          icon={Activity}
          color="blue"
        />
        <StatCard
          label="Active Alerts"
          value={activeAlerts.length.toString()}
          icon={AlertTriangle}
          color={activeAlerts.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Net Delta"
          value={insights?.summary.netDelta?.toFixed(1) || '—'}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      {insights && insights.actionItems.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-500" />
            Priority Actions
          </h4>
          <div className="space-y-2">
            {insights.actionItems.slice(0, 3).map((item, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-lg flex items-start gap-3',
                  item.priority === 'high' && 'bg-red-50 dark:bg-red-900/20',
                  item.priority === 'medium' && 'bg-amber-50 dark:bg-amber-900/20',
                  item.priority === 'low' && 'bg-zinc-50 dark:bg-zinc-800/50'
                )}
              >
                <Badge
                  variant={item.priority === 'high' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {item.priority}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.symbol}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                  <p className="text-xs text-zinc-500 mt-1">{item.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {insights && insights.opportunities.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Opportunities
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.opportunities.slice(0, 2).map((opp, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{opp.symbol}</span>
                  <Badge variant="outline" className="text-xs">
                    {(opp.confidence * 100).toFixed(0)}% conf
                  </Badge>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  Recommended: <span className="font-medium">{opp.strategy.replace('_', ' ')}</span>
                </p>
                {opp.reasoning.length > 0 && (
                  <p className="text-xs text-zinc-500">{opp.reasoning[0]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Info */}
      {status.modelInfo.lastTrainedAt && (
        <p className="text-xs text-zinc-500 text-center">
          <Clock className="h-3 w-3 inline mr-1" />
          Models last trained: {new Date(status.modelInfo.lastTrainedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Attribution Tab
// ============================================================================

function AttributionTab({ attribution }: { attribution: PnLAttribution | null }) {
  if (!attribution) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <PieChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No P&L attribution data available</p>
        <p className="text-sm">Close some option trades to see attribution analysis</p>
      </div>
    );
  }

  const factors = [
    {
      name: 'Delta (Price Movement)',
      value: attribution.breakdown.deltaContribution,
      percent: attribution.percentages.delta,
      color: 'bg-blue-500',
      icon: TrendingUp,
      tooltip: 'Delta measures how much an option price changes when the underlying stock moves $1. A delta of 0.50 means the option gains/loses $0.50 for each $1 move in the stock.',
    },
    {
      name: 'Theta (Time Decay)',
      value: attribution.breakdown.thetaContribution,
      percent: attribution.percentages.theta,
      color: 'bg-green-500',
      icon: Clock,
      tooltip: 'Theta represents the daily time decay of an option. Options lose value as expiration approaches. Sellers benefit from theta decay, while buyers are hurt by it.',
    },
    {
      name: 'Vega (Volatility)',
      value: attribution.breakdown.vegaContribution,
      percent: attribution.percentages.vega,
      color: 'bg-purple-500',
      icon: Activity,
      tooltip: 'Vega measures sensitivity to implied volatility (IV). Higher IV increases option prices. A vega of 0.10 means the option gains/loses $0.10 for each 1% change in IV.',
    },
    {
      name: 'Execution',
      value: attribution.breakdown.executionImpact,
      percent: attribution.percentages.execution,
      color: 'bg-amber-500',
      icon: Zap,
      tooltip: 'Execution impact reflects the difference between your fill price and the mid-market price. Good fills (below mid for buys, above for sells) contribute positively.',
    },
    {
      name: 'Other Factors',
      value: attribution.breakdown.otherFactors,
      percent: attribution.percentages.other,
      color: 'bg-zinc-500',
      icon: BarChart3,
      tooltip: 'Other factors include gamma (rate of delta change), early assignment risk, dividend impacts, and any unexplained variance in P&L attribution.',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Total P&L */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 text-center">
        <p className="text-sm text-zinc-500 mb-1">Total Portfolio P&L</p>
        <p className={cn(
          'text-2xl font-bold',
          attribution.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {formatCurrency(attribution.totalPnL)}
        </p>
      </div>

      {/* Attribution Bars */}
      <TooltipProvider>
        <div className="space-y-3">
          {factors.map((factor) => (
            <div key={factor.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <factor.icon className="h-4 w-4 text-zinc-500" />
                      <span>{factor.name}</span>
                      <Info className="h-3 w-3 text-zinc-400" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {factor.tooltip}
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-medium',
                    factor.value >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {formatCurrency(factor.value)}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    ({factor.percent.toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', factor.color)}
                  style={{ width: `${Math.min(factor.percent, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>

      {/* Insights */}
      {attribution.insights.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Key Insights
          </h4>
          <ul className="space-y-2">
            {attribution.insights.map((insight, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Alerts Tab
// ============================================================================

function AlertsTab({ alerts }: { alerts: PositionHealthAlert[] }) {
  const activeAlerts = alerts.filter(a => !a.isDismissed);

  if (activeAlerts.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
        <p className="font-medium text-zinc-900 dark:text-zinc-100">All Clear!</p>
        <p className="text-sm">No position alerts at this time</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'p-4 rounded-xl border',
            alert.severity === 'high' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
            alert.severity === 'medium' && 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
            alert.severity === 'low' && 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50'
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              alert.severity === 'high' && 'bg-red-100 dark:bg-red-900/50',
              alert.severity === 'medium' && 'bg-amber-100 dark:bg-amber-900/50',
              alert.severity === 'low' && 'bg-zinc-100 dark:bg-zinc-800'
            )}>
              <AlertTriangle className={cn(
                'h-4 w-4',
                alert.severity === 'high' && 'text-red-600',
                alert.severity === 'medium' && 'text-amber-600',
                alert.severity === 'low' && 'text-zinc-600'
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{alert.symbol}</span>
                <Badge
                  variant={alert.severity === 'high' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {alert.severity}
                </Badge>
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{alert.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{alert.message}</p>
              <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                <Target className="h-3 w-3" />
                {alert.suggestedAction}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Insights Tab
// ============================================================================

function InsightsTab({
  insights,
  onRefresh,
  isRefreshing,
}: {
  insights: DailyInsights | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  if (!insights) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Generating your daily insights...</p>
        <p className="text-sm">Check back after some trading activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio Summary with Refresh Button */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Portfolio Summary</h4>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-7 px-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/30"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Positions" value={insights.summary.totalPositions} />
        <MiniStat label="Net Delta" value={insights.summary.netDelta.toFixed(1)} />
        <MiniStat label="Daily Theta" value={formatCurrency(insights.summary.dailyTheta)} />
        <MiniStat label="Portfolio" value={formatCurrency(insights.summary.portfolioValue)} />
      </div>

      {/* Risk Alerts */}
      {insights.riskAlerts.length > 0 && (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Risk Alerts
          </h4>
          <ul className="space-y-2">
            {insights.riskAlerts.map((alert, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <span className="font-medium">{alert.description}</span>
                  <p className="text-xs text-amber-700 dark:text-amber-300">{alert.action}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learnings */}
      {insights.learnings.length > 0 && (
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            Personalized Learnings
          </h4>
          <ul className="space-y-2">
            {insights.learnings.map((learning, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
                {learning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color
}: {
  label: string;
  value: string;
  icon: typeof Brain;
  color: 'green' | 'red' | 'blue' | 'purple' | 'amber';
}) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    purple: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
  };

  return (
    <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('p-1.5 rounded-lg', colorClasses[color])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-center">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

// ============================================================================
// Simulator Tab Types
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
// Simulator Tab
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

function SimulatorTab() {
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState<string>('');
  const [strike, setStrike] = useState<string>('');
  const [dte, setDte] = useState<string>('30');
  const [premium, setPremium] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);

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

  const handleSimulate = () => {
    if (symbol.trim()) {
      setIsSimulating(true);
    }
  };

  const handleReset = () => {
    setIsSimulating(false);
    setSymbol('');
    setStrategy('');
    setStrike('');
    setDte('30');
    setPremium('');
  };

  const prediction = predictionQuery.data;

  if (!isSimulating) {
    return (
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
    );
  }

  if (predictionQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
        <p className="text-zinc-500">Analyzing {symbol.toUpperCase()}...</p>
        <p className="text-sm text-zinc-400">Running ML models</p>
      </div>
    );
  }

  if (predictionQuery.isError) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
        <p className="font-medium mb-2">Prediction Failed</p>
        <p className="text-sm text-zinc-500 mb-4">Unable to generate prediction for {symbol}</p>
        <Button variant="outline" onClick={handleReset}>Try Again</Button>
      </div>
    );
  }

  if (prediction) {
    return <SimulatorResults prediction={prediction} onReset={handleReset} />;
  }

  return null;
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
      <div className="space-y-2">
        <Label htmlFor="sim-symbol">Symbol</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            id="sim-symbol"
            placeholder="e.g., AAPL, TSLA, SPY"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sim-strategy">Strategy (Optional)</Label>
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

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sim-strike">Strike</Label>
          <Input
            id="sim-strike"
            type="number"
            placeholder="100"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sim-dte">DTE</Label>
          <Input
            id="sim-dte"
            type="number"
            placeholder="30"
            value={dte}
            onChange={(e) => setDte(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sim-premium">Premium</Label>
          <Input
            id="sim-premium"
            type="number"
            step="0.01"
            placeholder="1.50"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
          />
        </div>
      </div>

      <Button
        className="w-full bg-violet-600 hover:bg-violet-700"
        onClick={onSimulate}
        disabled={!symbol.trim()}
      >
        <Brain className="h-4 w-4 mr-2" />
        Analyze Trade
      </Button>

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
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-sm">Confidence:</span>
          <span className="font-semibold">{(prediction.confidence * 100).toFixed(0)}%</span>
          <span className="text-xs opacity-70">
            (95% CI: {(prediction.uncertaintyRange[0] * 100).toFixed(0)}-{(prediction.uncertaintyRange[1] * 100).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* Risk-Adjusted Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SimMetricCard
          icon={TrendingUp}
          label="Expected Return"
          value={`${(prediction.riskAdjusted.expectedReturn * 100).toFixed(1)}%`}
          color={prediction.riskAdjusted.expectedReturn > 0 ? 'green' : 'red'}
        />
        <SimMetricCard
          icon={Shield}
          label="Max Drawdown"
          value={`${(prediction.riskAdjusted.maxDrawdownRisk * 100).toFixed(1)}%`}
          color="amber"
        />
        <SimMetricCard
          icon={BarChart3}
          label="Sharpe Est."
          value={prediction.riskAdjusted.sharpeEstimate.toFixed(2)}
          color={prediction.riskAdjusted.sharpeEstimate > 1 ? 'green' : 'zinc'}
        />
        <SimMetricCard
          icon={DollarSign}
          label="Kelly Size"
          value={`${(prediction.riskAdjusted.kellyFraction * 100).toFixed(0)}%`}
          color="violet"
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
        <Button className="flex-1 bg-violet-600 hover:bg-violet-700">
          <ArrowRight className="h-4 w-4 mr-2" />
          Execute Trade
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Simulator Helper Components
// ============================================================================

function SimMetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  color: 'green' | 'red' | 'amber' | 'violet' | 'zinc';
}) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600',
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

export default MLOptionsInsights;
