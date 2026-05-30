/**
 * Portfolio Policy Client Component
 *
 * Comprehensive form for managing trading rules, risk management,
 * and investment policy. Mobile-friendly with collapsible sections.
 */

'use client';

import { parseApiJson, apiData, apiDataOr, apiMessage } from '@/lib/api/client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Target,
  AlertTriangle,
  PieChart,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  Check,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PolicyData {
  id?: string;
  brokerageAccountId: string | null;

  // Trading Rules
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

  // Risk Management
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

  // Investment Policy
  targetStockPercent: number | null;
  targetOptionsPercent: number | null;
  targetCashPercent: number | null;
  rebalanceFrequency: string | null;
  rebalanceThreshold: number | null;
  investmentTimeHorizon: string | null;
  riskTolerance: string | null;
  minPositions: number | null;
  maxCorrelatedPositions: number | null;

  // Personal Notes
  personalTradingRules: string | null;
  preTradeChecklist: string | null;
  emotionalRules: string | null;
  marketConditionRules: string | null;
}

interface BrokerageAccount {
  id: string;
  name: string;
  broker: string;
}

const defaultPolicy: PolicyData = {
  brokerageAccountId: null,
  maxPositionSizePercent: null,
  maxPositionSizeDollars: null,
  defaultPositionSize: null,
  entryRules: null,
  exitRules: null,
  maxOpenPositions: null,
  maxDailyTrades: null,
  maxDailyLoss: null,
  tradingHoursStart: null,
  tradingHoursEnd: null,
  tradingDays: null,
  defaultStopLossPercent: null,
  maxStopLossPercent: null,
  useTrailingStops: null,
  trailingStopPercent: null,
  maxDrawdownPercent: null,
  maxWeeklyLossPercent: null,
  maxMonthlyLossPercent: null,
  maxSectorExposurePercent: null,
  maxSingleStockPercent: null,
  maxOptionsPercent: null,
  maxNakedPutsPercent: null,
  maxCoveredCallsPercent: null,
  minDaysToExpiration: null,
  targetStockPercent: null,
  targetOptionsPercent: null,
  targetCashPercent: null,
  rebalanceFrequency: null,
  rebalanceThreshold: null,
  investmentTimeHorizon: null,
  riskTolerance: null,
  minPositions: null,
  maxCorrelatedPositions: null,
  personalTradingRules: null,
  preTradeChecklist: null,
  emotionalRules: null,
  marketConditionRules: null,
};

async function fetchPolicy(accountId: string | null): Promise<{ policy: PolicyData | null; account: BrokerageAccount | null }> {
  const params = accountId ? `?brokerageAccountId=${accountId}` : '';
  const response = await fetch(`/api/policy${params}`);
  if (!response.ok) throw new Error('Failed to fetch policy');
  const json = await parseApiJson(response);
  return apiData(json);
}

async function fetchAccounts(): Promise<BrokerageAccount[]> {
  const response = await fetch('/api/accounts');
  if (!response.ok) throw new Error('Failed to fetch accounts');
  const json = await parseApiJson(response);
  return apiDataOr(json, []);
}

async function savePolicy(data: PolicyData): Promise<PolicyData> {
  const response = await fetch('/api/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to save policy'));
  }
  const json = await parseApiJson(response);
  return apiData(json);
}

type SectionKey = 'trading' | 'risk' | 'investment' | 'notes';

export function PolicyClient() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PolicyData>(defaultPolicy);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['trading', 'risk', 'investment', 'notes'])
  );

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['brokerageAccounts'],
    queryFn: fetchAccounts,
  });

  // Fetch policy for selected account
  const { data: policyData, isLoading } = useQuery({
    queryKey: ['policy', selectedAccountId],
    queryFn: () => fetchPolicy(selectedAccountId),
  });

  // Sync form data when policy changes - this is a legitimate use case for
  // initializing form state from server data
  useEffect(() => {
    if (policyData?.policy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({ ...defaultPolicy, ...policyData.policy });
      setIsDirty(false);
    } else if (policyData && !policyData.policy) {
      setFormData({ ...defaultPolicy, brokerageAccountId: selectedAccountId });
      setIsDirty(false);
    }
  }, [policyData, selectedAccountId]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: savePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', selectedAccountId] });
      setIsDirty(false);
    },
  });

  const handleFieldChange = <K extends keyof PolicyData>(field: K, value: PolicyData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ ...formData, brokerageAccountId: selectedAccountId });
  };

  const toggleSection = (section: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleAccountChange = (value: string) => {
    setSelectedAccountId(value === 'default' ? null : value);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Portfolio Policy
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Define your trading rules, risk management, and investment guidelines
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty}
          className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveMutation.isSuccess && !isDirty ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Policy
            </>
          )}
        </Button>
      </div>

      {/* Account Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <Building2 className="h-4 w-4" />
              <span>Policy for:</span>
            </div>
            <Select
              value={selectedAccountId || 'default'}
              onValueChange={handleAccountChange}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (All Accounts)</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.broker})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          {/* Trading Rules Section */}
          <CollapsibleSection
            title="Trading Rules"
            description="Position sizing, entry/exit criteria, and trading schedule"
            icon={Target}
            iconColor="text-blue-500"
            isExpanded={expandedSections.has('trading')}
            onToggle={() => toggleSection('trading')}
          >
            <div className="space-y-6">
              {/* Position Sizing */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Position Sizing
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Position Size (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="e.g., 10"
                      value={formData.maxPositionSizePercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxPositionSizePercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Max % of portfolio per position</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Position Size ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="e.g., 5000"
                      value={formData.maxPositionSizeDollars ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxPositionSizeDollars',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Max dollars per position</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Position Size ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="e.g., 2500"
                      value={formData.defaultPositionSize ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'defaultPositionSize',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Your standard position size</p>
                  </div>
                </div>
              </div>

              {/* Trade Limits */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Trade Limits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Open Positions</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g., 10"
                      value={formData.maxOpenPositions ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxOpenPositions',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Daily Trades</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g., 5"
                      value={formData.maxDailyTrades ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxDailyTrades',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Daily Loss ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="50"
                      placeholder="e.g., 500"
                      value={formData.maxDailyLoss ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxDailyLoss',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Stop trading if hit</p>
                  </div>
                </div>
              </div>

              {/* Trading Schedule */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Trading Schedule
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Trading Hours Start</Label>
                    <Input
                      type="time"
                      value={formData.tradingHoursStart ?? ''}
                      onChange={(e) => handleFieldChange('tradingHoursStart', e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trading Hours End</Label>
                    <Input
                      type="time"
                      value={formData.tradingHoursEnd ?? ''}
                      onChange={(e) => handleFieldChange('tradingHoursEnd', e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trading Days</Label>
                    <Input
                      placeholder="mon,tue,wed,thu,fri"
                      value={formData.tradingDays ?? ''}
                      onChange={(e) => handleFieldChange('tradingDays', e.target.value || null)}
                    />
                  </div>
                </div>
              </div>

              {/* Entry/Exit Rules */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entry Rules</Label>
                  <Textarea
                    placeholder="Your criteria for entering trades..."
                    value={formData.entryRules ?? ''}
                    onChange={(e) => handleFieldChange('entryRules', e.target.value || null)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Exit Rules</Label>
                  <Textarea
                    placeholder="Your criteria for exiting trades..."
                    value={formData.exitRules ?? ''}
                    onChange={(e) => handleFieldChange('exitRules', e.target.value || null)}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Risk Management Section */}
          <CollapsibleSection
            title="Risk Management"
            description="Stop-loss rules, drawdown limits, and exposure limits"
            icon={Shield}
            iconColor="text-red-500"
            isExpanded={expandedSections.has('risk')}
            onToggle={() => toggleSection('risk')}
          >
            <div className="space-y-6">
              {/* Stop-Loss Rules */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Stop-Loss Rules
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Default Stop-Loss (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="e.g., 5"
                      value={formData.defaultStopLossPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'defaultStopLossPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Stop-Loss (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="e.g., 10"
                      value={formData.maxStopLossPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxStopLossPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Never risk more than this</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Use Trailing Stops</Label>
                    <div className="flex h-10 items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formData.useTrailingStops ? 'Yes' : 'No'}
                      </span>
                      <Switch
                        checked={formData.useTrailingStops ?? false}
                        onCheckedChange={(v) => handleFieldChange('useTrailingStops', v)}
                      />
                    </div>
                  </div>
                </div>
                {formData.useTrailingStops && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Trailing Stop (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="e.g., 3"
                        value={formData.trailingStopPercent ?? ''}
                        onChange={(e) =>
                          handleFieldChange(
                            'trailingStopPercent',
                            e.target.value ? parseFloat(e.target.value) : null
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Drawdown Limits */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Drawdown Limits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Portfolio Drawdown (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="e.g., 20"
                      value={formData.maxDrawdownPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxDrawdownPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Weekly Loss (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="e.g., 5"
                      value={formData.maxWeeklyLossPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxWeeklyLossPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Monthly Loss (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="e.g., 10"
                      value={formData.maxMonthlyLossPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxMonthlyLossPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Concentration Limits */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Concentration Limits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Max Sector Exposure (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 30"
                      value={formData.maxSectorExposurePercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxSectorExposurePercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Single Stock (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 15"
                      value={formData.maxSingleStockPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxSingleStockPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Options Risk */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Options Risk Limits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Max Options (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 25"
                      value={formData.maxOptionsPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxOptionsPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Cash-Secured Puts (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 20"
                      value={formData.maxNakedPutsPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxNakedPutsPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Covered Calls (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 30"
                      value={formData.maxCoveredCallsPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxCoveredCallsPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Days to Expiration</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g., 30"
                      value={formData.minDaysToExpiration ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'minDaysToExpiration',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Investment Policy Section */}
          <CollapsibleSection
            title="Investment Policy"
            description="Asset allocation, rebalancing, and diversification rules"
            icon={PieChart}
            iconColor="text-purple-500"
            isExpanded={expandedSections.has('investment')}
            onToggle={() => toggleSection('investment')}
          >
            <div className="space-y-6">
              {/* Asset Allocation */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Target Asset Allocation
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Stocks (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 60"
                      value={formData.targetStockPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'targetStockPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Options (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 20"
                      value={formData.targetOptionsPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'targetOptionsPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cash (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      placeholder="e.g., 20"
                      value={formData.targetCashPercent ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'targetCashPercent',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                  </div>
                </div>
                {/* Allocation total indicator */}
                {(formData.targetStockPercent || formData.targetOptionsPercent || formData.targetCashPercent) && (
                  <div className="mt-3 text-sm">
                    <span className="text-zinc-500">Total: </span>
                    <span
                      className={
                        (formData.targetStockPercent ?? 0) +
                          (formData.targetOptionsPercent ?? 0) +
                          (formData.targetCashPercent ?? 0) ===
                        100
                          ? 'text-emerald-600 font-medium'
                          : 'text-amber-600 font-medium'
                      }
                    >
                      {(formData.targetStockPercent ?? 0) +
                        (formData.targetOptionsPercent ?? 0) +
                        (formData.targetCashPercent ?? 0)}
                      %
                    </span>
                    {(formData.targetStockPercent ?? 0) +
                      (formData.targetOptionsPercent ?? 0) +
                      (formData.targetCashPercent ?? 0) !==
                      100 && <span className="text-amber-600 ml-2">(should equal 100%)</span>}
                  </div>
                )}
              </div>

              {/* Rebalancing */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Rebalancing
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rebalance Frequency</Label>
                    <Select
                      value={formData.rebalanceFrequency ?? ''}
                      onValueChange={(v) => handleFieldChange('rebalanceFrequency', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rebalance Threshold (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="e.g., 5"
                      value={formData.rebalanceThreshold ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'rebalanceThreshold',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Rebalance when off target by this %</p>
                  </div>
                </div>
              </div>

              {/* Investment Style */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Investment Style
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Time Horizon</Label>
                    <Select
                      value={formData.investmentTimeHorizon ?? ''}
                      onValueChange={(v) => handleFieldChange('investmentTimeHorizon', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time horizon" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day Trading</SelectItem>
                        <SelectItem value="swing">Swing Trading (days-weeks)</SelectItem>
                        <SelectItem value="position">Position Trading (weeks-months)</SelectItem>
                        <SelectItem value="long-term">Long-term Investing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Tolerance</Label>
                    <Select
                      value={formData.riskTolerance ?? ''}
                      onValueChange={(v) => handleFieldChange('riskTolerance', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk tolerance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">Conservative</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Diversification */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  Diversification Rules
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Positions</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g., 5"
                      value={formData.minPositions ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'minPositions',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Minimum for diversification</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Correlated Positions</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g., 3"
                      value={formData.maxCorrelatedPositions ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'maxCorrelatedPositions',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    />
                    <p className="text-xs text-zinc-500">Max positions in correlated assets</p>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Personal Notes Section */}
          <CollapsibleSection
            title="Personal Notes & Rules"
            description="Your personal trading rules, checklists, and reminders"
            icon={FileText}
            iconColor="text-amber-500"
            isExpanded={expandedSections.has('notes')}
            onToggle={() => toggleSection('notes')}
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Personal Trading Rules</Label>
                <Textarea
                  placeholder="Your personal rules to follow (e.g., Never trade during FOMC, Don't revenge trade)..."
                  value={formData.personalTradingRules ?? ''}
                  onChange={(e) => handleFieldChange('personalTradingRules', e.target.value || null)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label>Pre-Trade Checklist</Label>
                <Textarea
                  placeholder="Things to check before entering a trade (e.g., Check earnings date, Verify volume)..."
                  value={formData.preTradeChecklist ?? ''}
                  onChange={(e) => handleFieldChange('preTradeChecklist', e.target.value || null)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label>Emotional Rules</Label>
                <Textarea
                  placeholder="Rules for managing emotions (e.g., Take a break after 2 losses, No trading when angry)..."
                  value={formData.emotionalRules ?? ''}
                  onChange={(e) => handleFieldChange('emotionalRules', e.target.value || null)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label>Market Condition Rules</Label>
                <Textarea
                  placeholder="Rules for different market conditions (e.g., Reduce size in high VIX, Avoid longs in downtrend)..."
                  value={formData.marketConditionRules ?? ''}
                  onChange={(e) => handleFieldChange('marketConditionRules', e.target.value || null)}
                  rows={5}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Bottom Save Button (Mobile) */}
          <div className="sticky bottom-4 sm:hidden">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
              className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Policy
                </>
              )}
            </Button>
          </div>

          {/* Error Display */}
          {saveMutation.isError && (
            <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm">
                  {saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : 'Failed to save policy'}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  iconColor,
  isExpanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-zinc-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-zinc-400" />
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && <CardContent className="pt-0 pb-6">{children}</CardContent>}
    </Card>
  );
}
