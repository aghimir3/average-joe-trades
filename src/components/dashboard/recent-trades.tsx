'use client';

import { parseApiJson, apiData, apiDataOr } from '@/lib/api/client';

/**
 * Recent Trades Component
 *
 * Displays a table of trades with filters for status, type, and search.
 * Supports both open positions and closed trades.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Search,
  Filter,
  X,
  Edit3,
  LogOut,
  TrendingUp,
  Zap,
  Activity,
  ChevronDown,
  Loader2,
  List,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { TradeViewModal } from './trade-view-modal';
import { formatSignedCurrency, formatCompactCurrency, formatPercent } from '@/lib/utils';

type StatusFilter = 'all' | 'open' | 'closed';
type TypeFilter = 'all' | 'stock' | 'option' | 'future';

interface Trade {
  id: string;
  ledgerEventId: string | null;
  closeEventId: string | null;
  brokerageAccountId: string;
  brokerageAccountName: string;
  broker: string;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  openDate: string;
  closeDate: string | null;
  openPrice: number;
  closePrice: number | null;
  costBasis: number | null;
  realizedPnL: number | null;
  closeReason: string | null;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  returnPercent: number | null;
  status: 'open' | 'closed';
  isWin: boolean;
  isLoss: boolean;
}

interface TradesResponse {
  data: Trade[];
  pagination: {
    total: number;
    totalOpen: number;
    totalClosed: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface PolicyData {
  brokerageAccountId: string | null;
  maxPositionSizePercent: number | null;
  maxPositionSizeDollars: number | null;
  defaultPositionSize: number | null;
  entryRules: string | null;
  exitRules: string | null;
  maxOpenPositions: number | null;
  maxDailyTrades: number | null;
  maxDailyLoss: number | null;
  tradingHoursStart: string | null;
  tradingHoursEnd: string | null;
  tradingDays: string | null;
  defaultStopLossPercent: number | null;
  maxStopLossPercent: number | null;
  useTrailingStops: boolean | null;
  trailingStopPercent: number | null;
  maxDrawdownPercent: number | null;
  maxWeeklyLossPercent: number | null;
  maxMonthlyLossPercent: number | null;
  maxSectorExposurePercent: number | null;
  maxSingleStockPercent: number | null;
  maxOptionsPercent: number | null;
  maxNakedPutsPercent: number | null;
  maxCoveredCallsPercent: number | null;
  minDaysToExpiration: number | null;
  targetStockPercent: number | null;
  targetOptionsPercent: number | null;
  targetCashPercent: number | null;
  rebalanceFrequency: string | null;
  rebalanceThreshold: number | null;
  investmentTimeHorizon: string | null;
  riskTolerance: string | null;
  minPositions: number | null;
  maxCorrelatedPositions: number | null;
  personalTradingRules: string | null;
  preTradeChecklist: string | null;
  emotionalRules: string | null;
  marketConditionRules: string | null;
}

interface PolicyResponse {
  policy: PolicyData | null;
  account: { id: string; name: string; broker: string } | null;
}

interface RealtimePortfolioData {
  totalMarketValue: number;
  totalCash: number;
  allocation: {
    stocks: { value: number; percentage: number };
    options: { value: number; percentage: number };
    cash: { value: number; percentage: number };
  };
}

type PolicyViolationSeverity = 'critical' | 'warning' | 'info';

interface PolicyViolation {
  title: string;
  detail: string;
  severity: PolicyViolationSeverity;
  usesSnapshot?: boolean;
}

// Initial display limit for trades
const INITIAL_LIMIT = 10;
const LOAD_MORE_INCREMENT = 20;

async function fetchTrades(
  status: StatusFilter,
  type: TypeFilter,
  symbol: string,
  limit: number = INITIAL_LIMIT,
  accountId?: string | null
): Promise<TradesResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    status,
    type,
  });
  if (symbol) {
    params.set('symbol', symbol);
  }
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const response = await fetch(`/api/dashboard/trades?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch trades');
  }
  const parsed = await parseApiJson(response);
  return {
    data: apiDataOr<Trade[]>(parsed, []),
    pagination: parsed.pagination as TradesResponse['pagination'],
  };
}

async function fetchPolicy(accountId: string | null): Promise<PolicyResponse> {
  const params = accountId ? `?brokerageAccountId=${accountId}` : '';
  const response = await fetch(`/api/policy${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch policy');
  }
  const json = await parseApiJson(response);
  return apiData(json);
}

async function fetchRealtimePortfolio(accountId: string | null): Promise<RealtimePortfolioData | null> {
  const params = accountId ? `?brokerageAccountId=${accountId}` : '';
  const response = await fetch(`/api/dashboard/realtime${params}`);
  if (!response.ok) return null;
  const json = await parseApiJson(response);
  return apiData(json);
}

async function fetchDailyTradeCount(date: string, accountId?: string | null): Promise<number> {
  const params = new URLSearchParams({
    date,
    status: 'all',
    type: 'all',
    limit: '200',
  });
  if (accountId) {
    params.set('brokerageAccountId', accountId);
  }
  const response = await fetch(`/api/dashboard/trades?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch daily trade count');
  }
  const parsed = await parseApiJson(response);
  const pagination = parsed.pagination as TradesResponse['pagination'] | undefined;
  return pagination?.total ?? 0;
}

function calculatePositionSize(trade: Trade): number {
  // Use costBasis directly when available (accurate for all trade types)
  if (trade.costBasis !== null) {
    return Math.abs(trade.costBasis);
  }
  // Fallback: calculate from openPrice (for options, multiply by 100)
  const multiplier = trade.type === 'option' ? 100 : 1;
  return Math.abs(trade.quantity * trade.openPrice * multiplier);
}

function calculatePnLPercent(trade: Trade): number | null {
  if (trade.realizedPnL === null) return null;
  const size = calculatePositionSize(trade);
  if (size === 0) return null;
  return (trade.realizedPnL / size) * 100;
}

function formatExpiration(expiration: string | null): string {
  if (!expiration) return '';
  const date = new Date(expiration);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPercentPlain(value: number): string {
  return formatPercent(value).replace('+', '');
}

function normalizePolicyDays(days: string | null): string[] {
  if (!days) return [];
  return days
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function getTradeDayKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getUTCDay()];
}

function hasEvaluatablePolicy(policy: PolicyData | null): boolean {
  if (!policy) return false;
  return [
    policy.maxPositionSizePercent,
    policy.maxPositionSizeDollars,
    policy.defaultPositionSize,
    policy.maxDailyTrades,
    policy.tradingDays,
    policy.defaultStopLossPercent,
    policy.maxStopLossPercent,
    policy.maxOptionsPercent,
    policy.maxNakedPutsPercent,
    policy.maxCoveredCallsPercent,
    policy.minDaysToExpiration,
  ].some((value) => value !== null && value !== undefined && value !== '');
}

function evaluateTradeAgainstPolicy({
  trade,
  policy,
  portfolio,
  dailyTradeCount,
}: {
  trade: Trade;
  policy: PolicyData;
  portfolio: RealtimePortfolioData | null;
  dailyTradeCount: number | null;
}): { violations: PolicyViolation[]; usedSnapshot: boolean } {
  const violations: PolicyViolation[] = [];
  const tradeSize = calculatePositionSize(trade);
  const tradeDate = trade.openDate;
  const pnlPercent = calculatePnLPercent(trade);

  const portfolioValue = portfolio
    ? portfolio.totalMarketValue + portfolio.totalCash
    : null;

  if (policy.maxPositionSizeDollars !== null && tradeSize > policy.maxPositionSizeDollars) {
    const overBy = tradeSize - policy.maxPositionSizeDollars;
    violations.push({
      title: 'Oversized position',
      detail: `Policy max is ${formatCompactCurrency(policy.maxPositionSizeDollars)}. This entry was ${formatCompactCurrency(tradeSize)} (${formatCompactCurrency(overBy)} over). Consider scaling in or trimming size.`,
      severity: 'critical',
    });
  }

  if (policy.maxPositionSizePercent !== null && portfolioValue && portfolioValue > 0) {
    const pct = (tradeSize / portfolioValue) * 100;
    if (pct > policy.maxPositionSizePercent) {
      violations.push({
        title: 'Position size above portfolio cap',
        detail: `This trade is ~${formatPercentPlain(pct)} of your portfolio vs max ${formatPercentPlain(policy.maxPositionSizePercent)}. Consider splitting into smaller tranches.`,
        severity: 'critical',
        usesSnapshot: true,
      });
    }
  }

  if (policy.defaultPositionSize !== null && tradeSize > policy.defaultPositionSize * 1.5) {
    violations.push({
      title: 'Position size drift',
      detail: `Your default size is ${formatCompactCurrency(policy.defaultPositionSize)}. This trade was ${formatCompactCurrency(tradeSize)}, which is significantly larger.`,
      severity: 'warning',
    });
  }

  if (policy.tradingDays) {
    const allowed = normalizePolicyDays(policy.tradingDays);
    const dayKey = getTradeDayKey(tradeDate);
    if (allowed.length > 0 && !allowed.includes(dayKey)) {
      violations.push({
        title: 'Traded outside your allowed days',
        detail: `Policy allows trading on ${allowed.join(', ')}. This trade opened on ${dayKey}.`,
        severity: 'warning',
      });
    }
  }

  if (policy.maxDailyTrades !== null && dailyTradeCount !== null && dailyTradeCount > policy.maxDailyTrades) {
    violations.push({
      title: 'Daily trade cap exceeded',
      detail: `You placed ${dailyTradeCount} trades on ${tradeDate}. Policy max is ${policy.maxDailyTrades}. Overtrading often leads to rushed decisions.`,
      severity: 'warning',
    });
  }

  if (trade.type === 'option' && policy.minDaysToExpiration !== null && trade.expiration) {
    const openDate = new Date(`${trade.openDate}T00:00:00Z`);
    const expDate = new Date(`${trade.expiration}T00:00:00Z`);
    const dte = Math.ceil((expDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isFinite(dte) && dte < policy.minDaysToExpiration) {
      violations.push({
        title: 'Option too close to expiration',
        detail: `Minimum DTE is ${policy.minDaysToExpiration} days. This contract had ${dte} days, increasing gamma risk.`,
        severity: 'warning',
      });
    }
  }

  if (trade.status === 'closed' && pnlPercent !== null && pnlPercent < 0) {
    const lossPct = Math.abs(pnlPercent);
    if (policy.maxStopLossPercent !== null && lossPct > policy.maxStopLossPercent) {
      violations.push({
        title: 'Loss exceeded max stop-loss',
        detail: `Policy max stop-loss is ${formatPercentPlain(policy.maxStopLossPercent)}, but this trade closed at ${formatPercentPlain(lossPct)}.`,
        severity: 'critical',
      });
    } else if (policy.defaultStopLossPercent !== null && lossPct > policy.defaultStopLossPercent) {
      violations.push({
        title: 'Loss beyond your default stop',
        detail: `Default stop-loss is ${formatPercentPlain(policy.defaultStopLossPercent)}, but this trade closed at ${formatPercentPlain(lossPct)}.`,
        severity: 'warning',
      });
    }
  }

  if (trade.type === 'option' && portfolioValue && portfolioValue > 0) {
    const postTradePortfolio = portfolioValue + tradeSize;
    const optionsValue = portfolio?.allocation?.options?.value ?? 0;
    const postTradeOptionsPct = (optionsValue + tradeSize) / postTradePortfolio * 100;

    if (policy.maxOptionsPercent !== null && postTradeOptionsPct > policy.maxOptionsPercent) {
      violations.push({
        title: 'Options exposure above cap',
        detail: `Estimated options allocation after this trade is ~${formatPercentPlain(postTradeOptionsPct)} vs max ${formatPercentPlain(policy.maxOptionsPercent)}.`,
        severity: 'warning',
        usesSnapshot: true,
      });
    }

    if (trade.strategy === 'cash_secured_put' && policy.maxNakedPutsPercent !== null) {
      const tradePct = (tradeSize / portfolioValue) * 100;
      if (tradePct > policy.maxNakedPutsPercent) {
        violations.push({
          title: 'CSP allocation above limit',
          detail: `This cash-secured put is ~${formatPercentPlain(tradePct)} of your portfolio vs max ${formatPercentPlain(policy.maxNakedPutsPercent)}.`,
          severity: 'warning',
          usesSnapshot: true,
        });
      }
    }

    if (trade.strategy === 'covered_call' && policy.maxCoveredCallsPercent !== null) {
      const tradePct = (tradeSize / portfolioValue) * 100;
      if (tradePct > policy.maxCoveredCallsPercent) {
        violations.push({
          title: 'Covered call allocation above limit',
          detail: `This covered call is ~${formatPercentPlain(tradePct)} of your portfolio vs max ${formatPercentPlain(policy.maxCoveredCallsPercent)}.`,
          severity: 'warning',
          usesSnapshot: true,
        });
      }
    }
  }

  const usedSnapshot = violations.some(v => v.usesSnapshot);
  return { violations, usedSnapshot };
}

function PolicyReviewView({
  violations,
  isLoading,
  usedSnapshot,
}: {
  violations: PolicyViolation[];
  isLoading: boolean;
  usedSnapshot: boolean;
}) {
  const hasViolations = violations.length > 0;

  const severityStyles: Record<PolicyViolationSeverity, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {hasViolations ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Policy Check</p>
        </div>
        <span className={`text-xs font-medium ${hasViolations ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {hasViolations ? `${violations.length} issue${violations.length === 1 ? '' : 's'}` : 'On policy'}
        </span>
      </div>

      {isLoading && (
        <p className="text-xs text-zinc-500">Analyzing trade vs your policy...</p>
      )}

      {!isLoading && !hasViolations && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          No policy violations detected for this trade. Nice discipline.
        </p>
      )}

      {!isLoading && hasViolations && (
        <div className="space-y-2">
          {violations.map((violation, index) => (
            <div
              key={`${violation.title}-${index}`}
              className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${severityStyles[violation.severity]}`}>
                !
              </span>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{violation.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{violation.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {usedSnapshot && !isLoading && (
        <p className="mt-2 text-[11px] text-zinc-400">
          Based on your current portfolio snapshot; actual allocation on the trade date may differ.
        </p>
      )}
    </div>
  );
}

/**
 * Trade Detail Modal for both open and closed positions
 */
function TradeModal({
  trade,
  onClose,
  onViewTimeline,
}: {
  trade: Trade;
  onClose: () => void;
  onViewTimeline: () => void;
}) {
  const router = useRouter();
  const isStock = trade.type === 'stock';
  const isOption = trade.type === 'option';
  const isFuture = trade.type === 'future';
  const isOpen = trade.status === 'open';
  const quantityLabel = isOption || isFuture ? 'Contracts' : 'Shares';

  const policyQuery = useQuery({
    queryKey: ['portfolioPolicy', trade.brokerageAccountId ?? 'default'],
    queryFn: () => fetchPolicy(trade.brokerageAccountId ?? null),
  });

  const policy = policyQuery.data?.policy ?? null;
  const hasPolicy = hasEvaluatablePolicy(policy);

  const needsPortfolioSnapshot = !!(
    policy?.maxPositionSizePercent ||
    policy?.maxOptionsPercent ||
    policy?.maxNakedPutsPercent ||
    policy?.maxCoveredCallsPercent
  );

  const portfolioQuery = useQuery({
    queryKey: ['portfolioRealtime', trade.brokerageAccountId ?? 'all'],
    queryFn: () => fetchRealtimePortfolio(trade.brokerageAccountId ?? null),
    enabled: hasPolicy && needsPortfolioSnapshot,
  });

  const dailyCountQuery = useQuery({
    queryKey: ['dailyTradeCount', trade.brokerageAccountId ?? 'all', trade.openDate],
    queryFn: () => fetchDailyTradeCount(trade.openDate, trade.brokerageAccountId ?? null),
    enabled: hasPolicy && policy?.maxDailyTrades !== null,
  });

  const policyEvaluation = hasPolicy && policy
    ? evaluateTradeAgainstPolicy({
        trade,
        policy,
        portfolio: portfolioQuery.data ?? null,
        dailyTradeCount: dailyCountQuery.data ?? null,
      })
    : { violations: [], usedSnapshot: false };

  const policyLoading = hasPolicy && (
    policyQuery.isLoading ||
    portfolioQuery.isLoading ||
    dailyCountQuery.isLoading
  );

  const policyReview = hasPolicy ? (
    <PolicyReviewView
      violations={policyEvaluation.violations}
      usedSnapshot={policyEvaluation.usedSnapshot}
      isLoading={policyLoading}
    />
  ) : null;

  const handleEdit = () => {
    // Use ledgerEventId for editing (links to actual LedgerEvent)
    const editId = trade.ledgerEventId || trade.id;
    // For closed trades, include closeEventId in query params
    const closeParam = trade.closeEventId ? `?closeEventId=${trade.closeEventId}` : '';
    if (isOption) {
      router.push(`/trade/edit/option/${editId}${closeParam}`);
    } else {
      router.push(`/trade/edit/stock/${editId}${closeParam}`);
    }
    onClose();
  };

  const handleCloseTrade = () => {
    router.push(`/trade/close?positionId=${trade.id}`);
    onClose();
  };

  const handleViewTimeline = () => {
    onClose();
    onViewTimeline();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Mobile: Bottom Sheet */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-xl">
        <div className="p-5">
          {/* Handle */}
          <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isStock ? (
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              ) : isFuture ? (
                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                  <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              ) : (
                <div className={`p-2.5 rounded-xl ${trade.optionType === 'call' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                  <Zap className={`h-5 w-5 ${trade.optionType === 'call' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`} />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
                  {trade.symbol}
                  {isOption && trade.strike && (
                    <span className="text-zinc-500 ml-1">
                      ${trade.strike} {trade.optionType?.toUpperCase()}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-zinc-500">
                  {isOpen ? 'Open Position' : 'Closed Trade'} | {trade.side}
                </p>
              </div>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="rounded-full"
            >
              <X className="h-5 w-5 text-zinc-400" />
            </Button>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">{quantityLabel}</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.quantity}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Entry Price</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">${trade.openPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Opened</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.openDate}</span>
            </div>
            {!isOpen && trade.closePrice !== null && (
              <>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Exit Price</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">${trade.closePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Closed</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.closeDate}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">P&L</span>
                  <span className={`font-semibold ${trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'}`}>
                    {formatSignedCurrency(trade.realizedPnL)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Return</span>
                  <span className={`font-semibold ${trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'}`}>
                    {formatPercent(trade.returnPercent ?? calculatePnLPercent(trade))}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Result</span>
                  <Badge variant={trade.isWin ? 'profit' : trade.isLoss ? 'loss' : 'warning'}>
                    {trade.isWin ? 'Win' : trade.isLoss ? 'Loss' : 'Break Even'}
                  </Badge>
                </div>
              </>
            )}
            {isOption && trade.expiration && (
              <div className="flex justify-between py-2">
                <span className="text-zinc-500">Expiration</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {formatExpiration(trade.expiration)}
                </span>
              </div>
            )}
          </div>

          {policyReview}

          {/* Actions */}
          <div className="space-y-3">
            {isOpen && (
              <Button
                onClick={handleViewTimeline}
                className="w-full gap-2 py-6 bg-blue-500 hover:bg-blue-600"
              >
                <List className="h-4 w-4" />
                <span>View All Entries</span>
              </Button>
            )}
            {isOpen ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  className="gap-2 py-6"
                  disabled={!trade.ledgerEventId}
                >
                  <Edit3 className="h-4 w-4" />
                  <span>Edit</span>
                </Button>
                <Button
                  onClick={handleCloseTrade}
                  className="gap-2 py-6 bg-orange-500 hover:bg-orange-600"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Close</span>
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleEdit}
                variant="outline"
                className="w-full gap-2 py-6"
                disabled={!trade.ledgerEventId}
              >
                <Edit3 className="h-4 w-4" />
                <span>Edit Trade</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: Centered Modal */}
      <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {isStock ? (
                  <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                    <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                ) : isFuture ? (
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                ) : (
                  <div className={`p-2.5 rounded-xl ${trade.optionType === 'call' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                    <Zap className={`h-5 w-5 ${trade.optionType === 'call' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`} />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
                    {trade.symbol}
                    {isOption && trade.strike && (
                      <span className="text-zinc-500 ml-1">
                        ${trade.strike} {trade.optionType?.toUpperCase()}
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-zinc-500">
                    {isOpen ? 'Open Position' : 'Closed Trade'} | {trade.side}
                  </p>
                </div>
              </div>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="rounded-full"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </Button>
            </div>

            {/* Details */}
            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">{quantityLabel}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.quantity}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Entry Price</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">${trade.openPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Opened</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.openDate}</span>
              </div>
              {!isOpen && trade.closePrice !== null && (
                <>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Exit Price</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">${trade.closePrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Closed</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{trade.closeDate}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">P&L</span>
                    <span className={`font-semibold ${trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'}`}>
                      {formatSignedCurrency(trade.realizedPnL)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Return</span>
                    <span className={`font-semibold ${trade.isWin ? 'text-rh-green' : trade.isLoss ? 'text-rh-red' : 'text-zinc-500'}`}>
                      {formatPercent(trade.returnPercent ?? calculatePnLPercent(trade))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Result</span>
                    <Badge variant={trade.isWin ? 'profit' : trade.isLoss ? 'loss' : 'warning'}>
                      {trade.isWin ? 'Win' : trade.isLoss ? 'Loss' : 'Break Even'}
                    </Badge>
                  </div>
                </>
              )}
              {isOption && trade.expiration && (
                <div className="flex justify-between py-2">
                  <span className="text-zinc-500">Expiration</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatExpiration(trade.expiration)}
                  </span>
                </div>
              )}
            </div>

            {policyReview}

            {/* Actions */}
            <div className="space-y-3">
              {isOpen && (
                <Button
                  onClick={handleViewTimeline}
                  className="w-full gap-2 py-6 bg-blue-500 hover:bg-blue-600"
                >
                  <List className="h-4 w-4" />
                  <span>View All Entries</span>
                </Button>
              )}
              {isOpen ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleEdit}
                    variant="outline"
                    className="gap-2 py-6"
                    disabled={!trade.ledgerEventId}
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Edit Entry</span>
                  </Button>
                  <Button
                    onClick={handleCloseTrade}
                    className="gap-2 py-6 bg-orange-500 hover:bg-orange-600"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Close Position</span>
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  className="w-full gap-2 py-6"
                  disabled={!trade.ledgerEventId}
                >
                  <Edit3 className="h-4 w-4" />
                  <span>Edit Trade</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface RecentTradesProps {
  accountId?: string | null;
}

export function RecentTrades({ accountId }: RecentTradesProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [timelinePositionId, setTimelinePositionId] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboardTrades', statusFilter, typeFilter, searchQuery, displayLimit, accountId],
    queryFn: () => fetchTrades(statusFilter, typeFilter, searchQuery, displayLimit, accountId),
  });

  // Reset display limit when filters change
  const handleFilterChange = (newStatus?: StatusFilter, newType?: TypeFilter) => {
    setDisplayLimit(INITIAL_LIMIT);
    if (newStatus !== undefined) setStatusFilter(newStatus);
    if (newType !== undefined) setTypeFilter(newType);
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setDisplayLimit(prev => prev + LOAD_MORE_INCREMENT);
    // refetch will happen automatically due to queryKey change
    setIsLoadingMore(false);
  };

  const handleRowClick = (trade: Trade) => {
    // Allow clicking on both open and closed positions
    setSelectedTrade(trade);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-5 w-5 text-zinc-500" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Recent Trades
          </h2>
        </div>
        <p className="text-red-500 text-center py-8">Failed to load trades</p>
      </div>
    );
  }

  const trades = data?.data || [];
  const pagination = data?.pagination;
  const hasFutures = trades.some(trade => trade.type === 'future');
  const typeOptions: TypeFilter[] = ['all', 'stock', 'option'];
  if (hasFutures || typeFilter === 'future') {
    typeOptions.push('future');
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Recent Trades
            </h2>
            <HelpTooltip
              title="Recent Trades"
              description="Shows your trading history including both open positions and closed trades. Use filters to narrow down by status (open/closed), type (stocks/options/futures), or search by ticker symbol. Click on open positions to edit or close them."
            />
          </div>
          <div className="flex items-center gap-2">
            {pagination && (
              <span className="text-sm text-zinc-500">
                {pagination.totalOpen} open | {pagination.totalClosed} closed
              </span>
            )}
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters || statusFilter !== 'all' || typeFilter !== 'all' || searchQuery ? 'secondary' : 'ghost'}
              size="icon"
              className={showFilters || statusFilter !== 'all' || typeFilter !== 'all' || searchQuery
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                : ''
              }
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {/* Status Filters */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {(['all', 'open', 'closed'] as StatusFilter[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleFilterChange(status, undefined)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              {/* Type Filters */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {typeOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => handleFilterChange(undefined, type)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      typeFilter === type
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {type === 'all'
                      ? 'All Types'
                      : type === 'future'
                        ? 'Futures'
                        : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
                  </button>
                ))}
              </div>

              {/* Clear Filters */}
              {(statusFilter !== 'all' || typeFilter !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setDisplayLimit(INITIAL_LIMIT);
                    setStatusFilter('all');
                    setTypeFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && trades.length === 0 && (
          <p className="text-zinc-500 text-center py-8">
            {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'No trades match your filters.'
              : 'No trades yet. Start trading to see your history.'}
          </p>
        )}

        {/* Trades Table */}
        {!isLoading && trades.length > 0 && (
          <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-3 px-2 font-medium text-zinc-500">Symbol</th>
                  <th className="text-left py-3 px-2 font-medium text-zinc-500">Type</th>
                  <th className="text-center py-3 px-2 font-medium text-zinc-500">Status</th>
                  <th className="text-center py-3 px-2 font-medium text-zinc-500">Result</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">Qty</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">Entry</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">Exit</th>
                  <th className="text-left py-3 px-2 font-medium text-zinc-500">Date</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">Size</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">%</th>
                  <th className="text-right py-3 px-2 font-medium text-zinc-500">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    onClick={() => handleRowClick(trade)}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${
                      trade.status === 'open'
                        ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer'
                    }`}
                  >
                    <td className="py-3 px-2">
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">
                          {trade.symbol}
                        </span>
                        {trade.type === 'option' && trade.strike && (
                          <span className="text-xs text-zinc-500 ml-1">
                            ${trade.strike} {trade.optionType?.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.type === 'stock'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : trade.type === 'future'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {trade.type}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.status === 'open'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      {trade.status === 'closed' ? (
                        <Badge variant={trade.isWin ? 'profit' : trade.isLoss ? 'loss' : 'warning'}>
                          {trade.isWin ? 'Win' : trade.isLoss ? 'Loss' : 'B/E'}
                        </Badge>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                      {trade.quantity}
                    </td>
                    <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                      ${trade.openPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                      {trade.closePrice !== null ? `$${trade.closePrice.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-2 text-zinc-600 dark:text-zinc-400">
                      {trade.closeDate || trade.openDate}
                    </td>
                    <td className="py-3 px-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatCompactCurrency(calculatePositionSize(trade))}
                    </td>
                    <td className={`py-3 px-2 text-right font-medium ${
                      trade.status === 'open'
                        ? 'text-zinc-400'
                        : trade.isWin
                          ? 'text-rh-green'
                          : trade.isLoss
                            ? 'text-rh-red'
                            : 'text-zinc-500'
                    }`}>
                      {trade.status === 'open' ? '-' : formatPercent(calculatePnLPercent(trade))}
                    </td>
                    <td className={`py-3 px-2 text-right font-semibold ${
                      trade.status === 'open'
                        ? 'text-zinc-400'
                        : trade.isWin
                          ? 'text-rh-green'
                          : trade.isLoss
                            ? 'text-rh-red'
                            : 'text-zinc-500'
                    }`}>
                      {trade.status === 'open' ? '-' : formatSignedCurrency(trade.realizedPnL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer: Combined count + load more */}
            {pagination && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
                {pagination.hasMore ? (
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-400">{trades.length} of {pagination.total}</span>
                        <span className="text-zinc-300 dark:text-zinc-600">|</span>
                        <span className="font-medium text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                          Load more
                        </span>
                        <ChevronDown className="h-4 w-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-sm text-zinc-400">
                    {pagination.total} {pagination.total === 1 ? 'trade' : 'trades'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trade Modal for open and closed positions */}
      {selectedTrade && (
        <TradeModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onViewTimeline={() => setTimelinePositionId(selectedTrade.id)}
        />
      )}

      {/* Trade View Modal (Timeline) */}
      {timelinePositionId && (
        <TradeViewModal
          positionId={timelinePositionId}
          open={!!timelinePositionId}
          onOpenChange={(open) => {
            if (!open) setTimelinePositionId(null);
          }}
        />
      )}
    </>
  );
}
