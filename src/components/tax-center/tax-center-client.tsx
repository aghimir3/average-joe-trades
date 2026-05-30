'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';


/**
 * Tax Center Client Component
 *
 * Comprehensive tax insights dashboard showing:
 * - Realized gains/losses (short-term vs long-term)
 * - Tax-loss harvesting opportunities
 * - Wash sale alerts
 * - Cost basis information
 *
 * Modern 2026 design with glass morphism, gradients, and smooth animations
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Scissors,
  AlertCircle,
  CheckCircle,
  Building2,
  Sparkles,
  X,
  Check,
  Settings,
  Sliders,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';

// LocalStorage keys for tax rate settings
const TAX_RATE_STORAGE_KEY = 'tax-center-rates';

interface TaxRateSettings {
  shortTermRate: number;
  longTermRate: number;
}

const DEFAULT_TAX_RATES: TaxRateSettings = {
  shortTermRate: 24,
  longTermRate: 15,
};

function loadTaxRates(): TaxRateSettings {
  if (typeof window === 'undefined') return DEFAULT_TAX_RATES;
  try {
    const stored = localStorage.getItem(TAX_RATE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        shortTermRate: parsed.shortTermRate ?? DEFAULT_TAX_RATES.shortTermRate,
        longTermRate: parsed.longTermRate ?? DEFAULT_TAX_RATES.longTermRate,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_TAX_RATES;
}

function saveTaxRates(rates: TaxRateSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TAX_RATE_STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // Ignore storage errors
  }
}
import { cn, formatCurrency, formatCompactCurrency, formatPercent } from '@/lib/utils';

// Types
interface TaxLot {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  acquiredDate: string;
  soldDate?: string;
  proceeds?: number;
  gainLoss: number;
  gainLossPct: number;
  holdingPeriod: 'short-term' | 'long-term';
  daysHeld: number;
  isWashSale: boolean;
  washSaleDisallowed?: number;
  type: 'stock' | 'option';
  accountName: string;
  accountId: string;
}

interface TaxSummary {
  year: number;
  realizedShortTermGains: number;
  realizedShortTermLosses: number;
  realizedLongTermGains: number;
  realizedLongTermLosses: number;
  totalRealizedGains: number;
  totalRealizedLosses: number;
  netRealizedPnL: number;
  shortTermTradeCount: number;
  longTermTradeCount: number;
  totalTradeCount: number;
  potentialWashSales: number;
  washSaleDisallowed: number;
  unrealizedShortTermGains: number;
  unrealizedShortTermLosses: number;
  unrealizedLongTermGains: number;
  unrealizedLongTermLosses: number;
  totalUnrealizedGains: number;
  totalUnrealizedLosses: number;
  netUnrealizedPnL: number;
  estimatedShortTermTax: number;
  estimatedLongTermTax: number;
  totalEstimatedTax: number;
}

interface TaxLossHarvestingOpportunity {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  marketValue: number;
  unrealizedLoss: number;
  unrealizedLossPct: number;
  daysHeld: number;
  holdingPeriod: 'short-term' | 'long-term';
  potentialTaxSavings: number;
  hasWashSaleRisk: boolean;
  accountName: string;
  accountId: string;
}

interface WashSaleAlert {
  id: string;
  symbol: string;
  lossDate: string;
  lossAmount: number;
  repurchaseDate: string;
  repurchaseAmount: number;
  disallowedLoss: number;
  accountName: string;
}

interface TaxCenterData {
  summary: TaxSummary;
  taxLots: TaxLot[];
  taxLossHarvestingOpportunities: TaxLossHarvestingOpportunity[];
  washSaleAlerts: WashSaleAlert[];
  availableYears: number[];
  accounts: Array<{ id: string; name: string }>;
}

// Fetch function
async function fetchTaxCenterData(year: number, accountId?: string): Promise<TaxCenterData> {
  const params = new URLSearchParams({ year: year.toString() });
  if (accountId) params.append('accountId', accountId);

  const res = await fetch(`/api/tax-center?${params}`);
  if (!res.ok) throw new Error('Failed to fetch tax data');
  const json = await parseApiJson(res);
  return apiData(json);
}


// Format date
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Modern Pill Selector Component
function PillSelector<T extends string | number>({
  options,
  value,
  onChange,
  renderLabel,
  className,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  renderLabel: (value: T) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex p-1 gap-1 rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-white/5', className)}>
      {options.map((option) => (
        <button
          key={String(option)}
          onClick={() => onChange(option)}
          className={cn(
            'relative px-4 py-2 text-sm font-medium rounded-xl transition-all duration-300',
            value === option
              ? 'text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          {value === option && (
            <span className="absolute inset-0 rounded-xl bg-linear-to-r from-violet-600/90 to-indigo-600/90 shadow-lg shadow-violet-500/25" />
          )}
          <span className="relative z-10">{renderLabel(option)}</span>
        </button>
      ))}
    </div>
  );
}

// Modern Dropdown Component with Portal
function ModernDropdown<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  icon: Icon,
  renderOption,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  placeholder: string;
  icon?: React.ElementType;
  renderOption?: (option: { value: T; label: string }) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 200),
      });
    }
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
          'bg-zinc-900/80 backdrop-blur-xl border border-white/5',
          'hover:border-white/10 hover:bg-zinc-800/80',
          isOpen && 'border-violet-500/50 ring-2 ring-violet-500/20'
        )}
      >
        {Icon && <Icon className="h-4 w-4 text-zinc-400 group-hover:text-zinc-300 transition-colors" />}
        <span className={value ? 'text-white' : 'text-zinc-400'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 text-zinc-400 transition-transform duration-300',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
          }}
          className={cn(
            'z-100 rounded-xl overflow-hidden',
            'bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50',
            'animate-in fade-in slide-in-from-top-2 duration-200'
          )}
        >
          <div className="py-1">
            <button
              onClick={() => {
                onChange(undefined);
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors',
                !value ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              )}
            >
              <span>{placeholder}</span>
              {!value && <Check className="h-4 w-4" />}
            </button>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors',
                  value === option.value ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-300 hover:text-white hover:bg-white/5'
                )}
              >
                {renderOption ? renderOption(option) : <span>{option.label}</span>}
                {value === option.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Glass Card Component
function GlassCard({
  children,
  className,
  gradient,
  hover = true,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: 'emerald' | 'red' | 'amber' | 'violet' | 'blue';
  hover?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const gradientStyles = {
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/30',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20 hover:border-red-500/30',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 hover:border-amber-500/30',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/20 hover:border-violet-500/30',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20 hover:border-blue-500/30',
  };

  return (
    <div
      className={cn(
        'rounded-2xl border backdrop-blur-xl transition-all duration-300',
        gradient
          ? `bg-linear-to-br ${gradientStyles[gradient]}`
          : 'bg-zinc-900/50 border-white/5 hover:border-white/10',
        hover && 'hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

// Hero Stat Card Component
function HeroStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  gradient,
  tooltip,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  gradient: 'emerald' | 'red' | 'amber' | 'violet';
  tooltip?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const gradientBg = {
    emerald: 'from-emerald-600 to-emerald-400',
    red: 'from-red-600 to-red-400',
    amber: 'from-amber-600 to-amber-400',
    violet: 'from-violet-600 to-violet-400',
  };

  const iconBg = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    red: 'bg-red-500/20 text-red-400',
    amber: 'bg-amber-500/20 text-amber-400',
    violet: 'bg-violet-500/20 text-violet-400',
  };

  return (
    <GlassCard
      className="p-5 relative overflow-hidden group"
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Subtle gradient glow */}
      <div className={cn(
        'absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 transition-opacity duration-500 group-hover:opacity-30',
        `bg-linear-to-br ${gradientBg[gradient]}`
      )} />

      {/* Tooltip */}
      {tooltip && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-xs text-zinc-300 whitespace-nowrap z-50 shadow-xl">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
        </div>
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {title}
            </span>
            {tooltip && (
              <Info className="h-3 w-3 text-zinc-500" />
            )}
          </div>
          <div className={cn('p-2 rounded-xl', iconBg[gradient])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className={cn(
          'text-3xl font-bold bg-linear-to-r bg-clip-text text-transparent',
          gradientBg[gradient]
        )}>
          {formatCompactCurrency(value)}
        </div>

        {subtitle && (
          <p className="mt-2 text-sm text-zinc-500 flex items-center gap-1.5">
            {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
            {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
            {subtitle}
          </p>
        )}
      </div>
    </GlassCard>
  );
}

// Modern Tab Button
function ModernTab({
  active,
  onClick,
  children,
  badge,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
  icon?: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap',
        active
          ? 'text-white bg-linear-to-r from-violet-600/90 to-indigo-600/90 shadow-lg shadow-violet-500/25'
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          'ml-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full',
          active
            ? 'bg-white/20 text-white'
            : 'bg-violet-500/20 text-violet-400'
        )}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// Breakdown Row Component
function BreakdownRow({
  label,
  gains,
  losses,
  net,
  tradeCount,
  icon: Icon,
  iconColor,
}: {
  label: string;
  gains: number;
  losses: number;
  net: number;
  tradeCount: number;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-white/5 last:border-0 group">
      <div className="flex items-center gap-3 mb-2 sm:mb-0">
        <div className={cn('p-2 rounded-lg bg-zinc-800/50', iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          <span className="ml-2 text-xs text-zinc-500">({tradeCount} trades)</span>
        </div>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="text-right">
          <span className="text-xs text-zinc-500 block">Gains</span>
          <span className="text-emerald-400 font-medium">+{formatCurrency(gains)}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-zinc-500 block">Losses</span>
          <span className="text-red-400 font-medium">-{formatCurrency(losses)}</span>
        </div>
        <div className="text-right min-w-25">
          <span className="text-xs text-zinc-500 block">Net</span>
          <span className={cn(
            'font-bold',
            net >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {formatCurrency(net)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Tax Lot Row Component
function TaxLotRow({ lot, expanded, onToggle }: { lot: TaxLot; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-white/5 last:border-0">
      <div
        className={cn(
          'flex items-center justify-between py-4 px-4 cursor-pointer transition-all duration-200',
          'hover:bg-white/2',
          expanded && 'bg-white/2'
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={cn(
            'p-2 rounded-lg transition-colors',
            expanded ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800/50 text-zinc-500'
          )}>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-white">{lot.symbol}</span>
              {lot.isWashSale && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-linear-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/20">
                  WASH SALE
                </span>
              )}
              <span className={cn(
                'px-2 py-0.5 text-[10px] font-semibold rounded-full',
                lot.holdingPeriod === 'long-term'
                  ? 'bg-linear-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              )}>
                {lot.holdingPeriod === 'long-term' ? 'LONG-TERM' : 'SHORT-TERM'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {lot.quantity} shares @ {formatCurrency(lot.costPerShare)}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <div className={cn(
            'text-lg font-bold',
            lot.gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {lot.gainLoss >= 0 ? '+' : ''}{formatCurrency(lot.gainLoss)}
          </div>
          <div className={cn(
            'text-xs font-medium',
            lot.gainLoss >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'
          )}>
            {formatPercent(lot.gainLossPct)}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 ml-14 animate-in slide-in-from-top-2 duration-200">
          <div className="p-4 rounded-xl bg-zinc-800/30 border border-white/5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 block mb-1">Acquired</span>
                <p className="text-zinc-200 font-medium">{formatDate(lot.acquiredDate)}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Sold</span>
                <p className="text-zinc-200 font-medium">{lot.soldDate ? formatDate(lot.soldDate) : '—'}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Cost Basis</span>
                <p className="text-zinc-200 font-medium">{formatCurrency(lot.costBasis)}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Proceeds</span>
                <p className="text-zinc-200 font-medium">{lot.proceeds ? formatCurrency(lot.proceeds) : '—'}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Days Held</span>
                <p className="text-zinc-200 font-medium">{lot.daysHeld} days</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Type</span>
                <p className="text-zinc-200 font-medium capitalize">{lot.type}</p>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1">Account</span>
                <p className="text-zinc-200 font-medium truncate">{lot.accountName}</p>
              </div>
              {lot.isWashSale && lot.washSaleDisallowed && (
                <div>
                  <span className="text-amber-500 block mb-1">Disallowed Loss</span>
                  <p className="text-amber-400 font-bold">{formatCurrency(lot.washSaleDisallowed)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Harvesting Opportunity Card Component
function HarvestingOpportunityCard({ opportunity }: { opportunity: TaxLossHarvestingOpportunity }) {
  return (
    <GlassCard className="p-5 group" gradient="emerald">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-lg text-white">{opportunity.symbol}</span>
            {opportunity.hasWashSaleRisk && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-linear-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/20">
                <AlertCircle className="h-3 w-3" />
                WASH SALE RISK
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {opportunity.quantity} shares in {opportunity.accountName}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-red-400">
            -{formatCurrency(opportunity.unrealizedLoss)}
          </div>
          <div className="text-xs text-red-400/60 font-medium">
            {formatPercent(opportunity.unrealizedLossPct)}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-4">
        <div>
          <span className="text-xs text-zinc-500 block mb-1">Cost Basis</span>
          <p className="text-zinc-200 font-medium">{formatCurrency(opportunity.costBasis)}</p>
        </div>
        <div>
          <span className="text-xs text-zinc-500 block mb-1">Market Value</span>
          <p className="text-zinc-200 font-medium">{formatCurrency(opportunity.marketValue)}</p>
        </div>
        <div>
          <span className="text-xs text-zinc-500 block mb-1">Days Held</span>
          <p className="text-zinc-200 font-medium">{opportunity.daysHeld}</p>
        </div>
      </div>

      <div className="mt-4 p-3 rounded-xl bg-linear-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-emerald-400">Potential Tax Savings</span>
          </div>
          <span className="text-lg font-bold text-emerald-400">
            ~{formatCurrency(opportunity.potentialTaxSavings)}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

// Wash Sale Alert Card Component
function WashSaleAlertCard({ alert }: { alert: WashSaleAlert }) {
  return (
    <GlassCard className="p-5" gradient="amber">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-lg text-white">{alert.symbol}</span>
            <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">{alert.accountName}</span>
          </div>
          <p className="text-sm text-zinc-300 mt-2">
            Sold at a loss on <span className="text-white font-medium">{formatDate(alert.lossDate)}</span>,
            repurchased on <span className="text-white font-medium">{formatDate(alert.repurchaseDate)}</span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-zinc-500 block mb-1">Loss Amount</span>
              <p className="text-red-400 font-bold">{formatCurrency(alert.lossAmount)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500 block mb-1">Repurchase</span>
              <p className="text-zinc-200 font-medium">{formatCurrency(alert.repurchaseAmount)}</p>
            </div>
            <div>
              <span className="text-xs text-amber-500 block mb-1">Disallowed</span>
              <p className="text-amber-400 font-bold">{formatCurrency(alert.disallowedLoss)}</p>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// Segmented Control for Filters
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn(
      'inline-flex p-1 gap-0.5 rounded-xl bg-zinc-900/80 backdrop-blur-xl border border-white/5',
      className
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
            value === option.value
              ? 'bg-white/10 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Tax Rate Settings Panel with Portal
function TaxRateSettingsPanel({
  isOpen,
  onClose,
  rates,
  onRatesChange,
  triggerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  rates: TaxRateSettings;
  onRatesChange: (rates: TaxRateSettings) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Use rates prop as initial state - component remounts when panel opens via key prop
  const [localRates, setLocalRates] = useState(rates);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(event.target as Node) &&
        triggerRef?.current && !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSave = () => {
    onRatesChange(localRates);
    saveTaxRates(localRates);
    onClose();
  };

  const handleReset = () => {
    setLocalRates(DEFAULT_TAX_RATES);
  };

  const presetRates = [
    { label: '10%', value: 10 },
    { label: '12%', value: 12 },
    { label: '22%', value: 22 },
    { label: '24%', value: 24 },
    { label: '32%', value: 32 },
    { label: '35%', value: 35 },
    { label: '37%', value: 37 },
  ];

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: position.top,
        right: position.right,
      }}
      className={cn(
        'z-100 w-80 rounded-2xl overflow-hidden',
        'bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50',
        'animate-in fade-in slide-in-from-top-2 duration-200'
      )}
    >
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-violet-400" />
            <span className="font-semibold text-white">Tax Rate Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Customize rates to match your tax bracket
        </p>
      </div>

      <div className="p-4 space-y-5">
        {/* Short-Term Rate */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Short-Term Rate (ordinary income)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={localRates.shortTermRate}
              onChange={(e) => setLocalRates(prev => ({ ...prev, shortTermRate: Number(e.target.value) }))}
              className="flex-1 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-violet-500"
            />
            <div className="w-14 px-2 py-1.5 rounded-lg bg-zinc-800 border border-white/5 text-center">
              <span className="text-sm font-bold text-white">{localRates.shortTermRate}%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {presetRates.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setLocalRates(prev => ({ ...prev, shortTermRate: preset.value }))}
                className={cn(
                  'px-2 py-1 text-xs rounded-lg transition-colors',
                  localRates.shortTermRate === preset.value
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Long-Term Rate */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Long-Term Rate (capital gains)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={localRates.longTermRate}
              onChange={(e) => setLocalRates(prev => ({ ...prev, longTermRate: Number(e.target.value) }))}
              className="flex-1 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500"
            />
            <div className="w-14 px-2 py-1.5 rounded-lg bg-zinc-800 border border-white/5 text-center">
              <span className="text-sm font-bold text-white">{localRates.longTermRate}%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[0, 15, 20].map((rate) => (
              <button
                key={rate}
                onClick={() => setLocalRates(prev => ({ ...prev, longTermRate: rate }))}
                className={cn(
                  'px-2 py-1 text-xs rounded-lg transition-colors',
                  localRates.longTermRate === rate
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'
                )}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-white/5 flex items-center justify-between">
        <button
          onClick={handleReset}
          className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          Reset to defaults
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-500 hover:to-indigo-500 transition-all duration-300"
        >
          Save Changes
        </button>
      </div>
    </div>,
    document.body
  );
}

// Main Component
export function TaxCenterClient() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'overview' | 'lots' | 'harvesting' | 'washsales'>('overview');
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'gain' | 'symbol'>('date');
  const [filterHoldingPeriod, setFilterHoldingPeriod] = useState<'all' | 'short-term' | 'long-term'>('all');
  const [taxRates, setTaxRates] = useState<TaxRateSettings>(DEFAULT_TAX_RATES);
  const [showTaxSettings, setShowTaxSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Export tax data as Form 8949 compatible CSV for TurboTax
   */
  const handleExportTax = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ year: selectedYear.toString() });
      if (selectedAccountId) {
        params.append('brokerageAccountId', selectedAccountId);
      }

      const response = await fetch(`/api/export/tax?${params}`);

      if (!response.ok) {
        const error = await parseApiJson(response);
        throw new Error(apiMessage(error, 'Failed to export tax data'));
      }

      // Get the CSV content and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-8949-${selectedYear}${selectedAccountId ? '-account' : '-all-accounts'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      // Could add toast notification here
    } finally {
      setIsExporting(false);
    }
  };

  // Load tax rates from localStorage on mount
  useEffect(() => {
    setTaxRates(loadTaxRates());
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tax-center', selectedYear, selectedAccountId],
    queryFn: () => fetchTaxCenterData(selectedYear, selectedAccountId),
  });

  // Calculate estimated taxes using custom rates
  const customTaxEstimates = data ? {
    shortTermTax: Math.max(0, (data.summary.realizedShortTermGains - data.summary.realizedShortTermLosses) * (taxRates.shortTermRate / 100)),
    longTermTax: Math.max(0, (data.summary.realizedLongTermGains - data.summary.realizedLongTermLosses) * (taxRates.longTermRate / 100)),
    get totalTax() { return this.shortTermTax + this.longTermTax; },
  } : null;

  // Sorted and filtered tax lots
  const filteredTaxLots = (() => {
    if (!data?.taxLots) return [];

    let lots = [...data.taxLots];

    // Filter by holding period
    if (filterHoldingPeriod !== 'all') {
      lots = lots.filter(l => l.holdingPeriod === filterHoldingPeriod);
    }

    // Sort
    switch (sortBy) {
      case 'date':
        lots.sort((a, b) => new Date(b.soldDate || b.acquiredDate).getTime() - new Date(a.soldDate || a.acquiredDate).getTime());
        break;
      case 'gain':
        lots.sort((a, b) => b.gainLoss - a.gainLoss);
        break;
      case 'symbol':
        lots.sort((a, b) => a.symbol.localeCompare(b.symbol));
        break;
    }

    return lots;
  })();

  const toggleLotExpanded = (id: string) => {
    setExpandedLots(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (error) {
    return (
      <GlassCard className="p-8 text-center" gradient="red">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Tax Data</h3>
        <p className="text-zinc-400 mb-6">Something went wrong while fetching your tax information.</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-linear-to-r from-red-600 to-red-500 text-white font-medium hover:from-red-500 hover:to-red-400 transition-all duration-300"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </GlassCard>
    );
  }

  const availableYears = data?.availableYears || [currentYear];

  return (
    <div className="space-y-8">
      {/* Controls Header - no duplicate title */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900/50 border border-white/5 p-4 sm:p-5">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">

          <div className="flex flex-wrap items-center gap-3">
            {/* Year Pills */}
            <PillSelector
              options={availableYears}
              value={selectedYear}
              onChange={setSelectedYear}
              renderLabel={(year) => (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {year}
                </span>
              )}
            />

            {/* Account Dropdown */}
            {data?.accounts && data.accounts.length > 1 && (
              <ModernDropdown
                options={data.accounts.map(a => ({ value: a.id, label: a.name }))}
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                placeholder="All Accounts"
                icon={Building2}
              />
            )}

            {/* Export, Settings & Refresh Buttons */}
            <div className="flex items-center gap-2">
              {/* Export for TurboTax Button */}
              <button
                onClick={handleExportTax}
                disabled={isExporting || isLoading || !data?.taxLots.length}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300',
                  'bg-linear-to-r from-emerald-600/90 to-teal-600/90',
                  'text-white text-sm font-medium',
                  'hover:from-emerald-500 hover:to-teal-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700'
                )}
                title="Export Form 8949 CSV for TurboTax"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Export for TurboTax</span>
                <span className="sm:hidden">Export</span>
              </button>
              <button
                ref={settingsButtonRef}
                onClick={() => setShowTaxSettings(!showTaxSettings)}
                className={cn(
                  'p-2.5 rounded-xl transition-all duration-300',
                  'bg-zinc-900/80 backdrop-blur-xl border border-white/5',
                  'hover:border-white/10 hover:bg-zinc-800/80',
                  showTaxSettings && 'border-violet-500/50 ring-2 ring-violet-500/20'
                )}
              >
                <Settings className={cn('h-4 w-4 text-zinc-400', showTaxSettings && 'text-violet-400')} />
              </button>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className={cn(
                  'p-2.5 rounded-xl transition-all duration-300',
                  'bg-zinc-900/80 backdrop-blur-xl border border-white/5',
                  'hover:border-white/10 hover:bg-zinc-800/80',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('h-4 w-4 text-zinc-400', isFetching && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tax Rate Settings Panel - rendered via portal */}
      {showTaxSettings && (
        <TaxRateSettingsPanel
          isOpen={showTaxSettings}
          onClose={() => setShowTaxSettings(false)}
          rates={taxRates}
          onRatesChange={setTaxRates}
          triggerRef={settingsButtonRef}
        />
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-zinc-900/50 border border-white/5 animate-pulse" />
            ))}
          </div>
          <div className="h-80 rounded-2xl bg-zinc-900/50 border border-white/5 animate-pulse" />
        </div>
      ) : data ? (
        <>
          {/* Hero Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <HeroStatCard
              title="Net Realized P&L"
              value={data.summary.netRealizedPnL}
              subtitle={`${data.summary.totalTradeCount} closed trades`}
              icon={data.summary.netRealizedPnL >= 0 ? TrendingUp : TrendingDown}
              trend={data.summary.netRealizedPnL >= 0 ? 'up' : 'down'}
              gradient={data.summary.netRealizedPnL >= 0 ? 'emerald' : 'red'}
            />
            <HeroStatCard
              title="Est. Tax Liability"
              value={customTaxEstimates?.totalTax ?? 0}
              subtitle={`Based on ${taxRates.shortTermRate}% ST / ${taxRates.longTermRate}% LT`}
              icon={DollarSign}
              gradient="amber"
              tooltip={
                (customTaxEstimates?.totalTax ?? 0) === 0 && data.summary.netRealizedPnL < 0
                  ? `No tax owed on net losses. Your ${formatCurrency(Math.abs(data.summary.netRealizedPnL))} loss can offset future gains.`
                  : undefined
              }
            />
            <HeroStatCard
              title="Unrealized P&L"
              value={data.summary.netUnrealizedPnL}
              subtitle="Current open positions"
              icon={data.summary.netUnrealizedPnL >= 0 ? ArrowUpRight : ArrowDownRight}
              trend={data.summary.netUnrealizedPnL >= 0 ? 'up' : 'down'}
              gradient={data.summary.netUnrealizedPnL >= 0 ? 'emerald' : 'red'}
            />
            <HeroStatCard
              title="Wash Sale Risk"
              value={data.summary.washSaleDisallowed}
              subtitle={`${data.summary.potentialWashSales} potential violations`}
              icon={AlertTriangle}
              gradient={data.summary.potentialWashSales > 0 ? 'amber' : 'violet'}
            />
          </div>

          {/* Tax Summary Insights Card */}
          {data.summary.netRealizedPnL !== 0 && (
            <GlassCard className="p-5" gradient={data.summary.netRealizedPnL < 0 ? 'violet' : 'emerald'}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'p-3 rounded-xl shrink-0',
                    data.summary.netRealizedPnL < 0 ? 'bg-violet-500/20' : 'bg-emerald-500/20'
                  )}>
                    {data.summary.netRealizedPnL < 0 ? (
                      <Sparkles className="h-6 w-6 text-violet-400" />
                    ) : (
                      <DollarSign className="h-6 w-6 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <h3 className={cn(
                      'font-bold text-lg',
                      data.summary.netRealizedPnL < 0 ? 'text-violet-300' : 'text-emerald-300'
                    )}>
                      {data.summary.netRealizedPnL < 0
                        ? 'Tax-Loss Carryforward Available'
                        : 'Taxable Gains This Year'
                      }
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      {data.summary.netRealizedPnL < 0 ? (
                        <>
                          You have <span className="font-semibold text-white">{formatCurrency(Math.abs(data.summary.netRealizedPnL))}</span> in net losses
                          that can offset future capital gains or up to $3,000 of ordinary income.
                        </>
                      ) : (
                        <>
                          Your estimated tax on <span className="font-semibold text-white">{formatCurrency(data.summary.netRealizedPnL)}</span> in gains
                          is <span className="font-semibold text-amber-400">{formatCurrency(customTaxEstimates?.totalTax ?? 0)}</span>.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {data.summary.netRealizedPnL < 0 && data.taxLossHarvestingOpportunities.length > 0 && (
                  <button
                    onClick={() => setActiveTab('harvesting')}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/20 text-violet-400 text-sm font-medium hover:bg-violet-500/30 transition-colors"
                  >
                    Harvest More
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </GlassCard>
          )}

          {/* Disclaimer */}
          <GlassCard className="p-4" gradient="blue">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-blue-500/20 shrink-0">
                <Info className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-blue-200">Tax Information Disclaimer</p>
                <p className="text-sm text-blue-300/70 mt-1">
                  This is for informational purposes only and should not be considered tax advice.
                  Tax calculations use your configured rates ({taxRates.shortTermRate}% short-term, {taxRates.longTermRate}% long-term).
                  Click the <Settings className="inline h-3.5 w-3.5" /> button to adjust. Please consult a qualified tax professional.
                </p>
              </div>
              <button className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <X className="h-4 w-4 text-blue-400/60" />
              </button>
            </div>
          </GlassCard>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-hide">
            <ModernTab
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </ModernTab>
            <ModernTab
              active={activeTab === 'lots'}
              onClick={() => setActiveTab('lots')}
              badge={data.taxLots.length}
            >
              Tax Lots
            </ModernTab>
            <ModernTab
              active={activeTab === 'harvesting'}
              onClick={() => setActiveTab('harvesting')}
              badge={data.taxLossHarvestingOpportunities.length}
              icon={Scissors}
            >
              Tax-Loss Harvesting
            </ModernTab>
            <ModernTab
              active={activeTab === 'washsales'}
              onClick={() => setActiveTab('washsales')}
              badge={data.washSaleAlerts.length}
              icon={AlertTriangle}
            >
              Wash Sales
            </ModernTab>
          </div>

          {/* Tab Content */}
          <GlassCard className="overflow-hidden">
            {activeTab === 'overview' && (
              <div className="p-6 sm:p-8 space-y-8">
                {/* Visual Gains vs Losses Bar */}
                {(() => {
                  const totalGains = data.summary.realizedShortTermGains + data.summary.realizedLongTermGains;
                  const totalLosses = data.summary.realizedShortTermLosses + data.summary.realizedLongTermLosses;
                  const total = totalGains + totalLosses;
                  const gainsPercent = total > 0 ? (totalGains / total) * 100 : 50;
                  const lossesPercent = total > 0 ? (totalLosses / total) * 100 : 50;

                  return (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          <span className="text-sm text-zinc-400">Gains</span>
                          <span className="text-sm font-semibold text-emerald-400">
                            {formatCurrency(totalGains)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-red-400">
                            {formatCurrency(totalLosses)}
                          </span>
                          <span className="text-sm text-zinc-400">Losses</span>
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                        </div>
                      </div>
                      <div className="h-4 rounded-full overflow-hidden flex bg-zinc-800">
                        <div
                          className="h-full bg-linear-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                          style={{ width: `${gainsPercent}%` }}
                        />
                        <div
                          className="h-full bg-linear-to-r from-red-400 to-red-600 transition-all duration-500"
                          style={{ width: `${lossesPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                        <span>{gainsPercent.toFixed(0)}% of activity</span>
                        <span>{lossesPercent.toFixed(0)}% of activity</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Realized Gains/Losses Breakdown */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    Realized Gains & Losses
                  </h3>
                  <div className="space-y-1">
                    <BreakdownRow
                      label="Short-Term (< 1 year)"
                      gains={data.summary.realizedShortTermGains}
                      losses={data.summary.realizedShortTermLosses}
                      net={data.summary.realizedShortTermGains - data.summary.realizedShortTermLosses}
                      tradeCount={data.summary.shortTermTradeCount}
                      icon={Clock}
                      iconColor="text-zinc-400"
                    />
                    <BreakdownRow
                      label="Long-Term (> 1 year)"
                      gains={data.summary.realizedLongTermGains}
                      losses={data.summary.realizedLongTermLosses}
                      net={data.summary.realizedLongTermGains - data.summary.realizedLongTermLosses}
                      tradeCount={data.summary.longTermTradeCount}
                      icon={Clock}
                      iconColor="text-blue-400"
                    />
                  </div>
                </div>

                {/* Unrealized Breakdown */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <ArrowUpRight className="h-5 w-5 text-violet-400" />
                    Unrealized Gains & Losses
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <GlassCard className="p-4" hover={false}>
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-300">Short-Term Holdings</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Gains</span>
                          <span className="text-emerald-400 font-semibold">
                            +{formatCurrency(data.summary.unrealizedShortTermGains)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Losses</span>
                          <span className="text-red-400 font-semibold">
                            -{formatCurrency(data.summary.unrealizedShortTermLosses)}
                          </span>
                        </div>
                      </div>
                    </GlassCard>
                    <GlassCard className="p-4" gradient="blue" hover={false}>
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium text-zinc-300">Long-Term Holdings</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Gains</span>
                          <span className="text-emerald-400 font-semibold">
                            +{formatCurrency(data.summary.unrealizedLongTermGains)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">Losses</span>
                          <span className="text-red-400 font-semibold">
                            -{formatCurrency(data.summary.unrealizedLongTermLosses)}
                          </span>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                </div>

                {/* Tax Estimate Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-amber-400" />
                      Estimated Tax Liability
                    </h3>
                    <button
                      onClick={() => setShowTaxSettings(true)}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-400 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Edit rates
                    </button>
                  </div>
                  <GlassCard className="p-5" gradient="amber" hover={false}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-300">Short-Term Tax ({taxRates.shortTermRate}%)</span>
                        <span className="font-semibold text-zinc-100">
                          {formatCurrency(customTaxEstimates?.shortTermTax ?? 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-300">Long-Term Tax ({taxRates.longTermRate}%)</span>
                        <span className="font-semibold text-zinc-100">
                          {formatCurrency(customTaxEstimates?.longTermTax ?? 0)}
                        </span>
                      </div>
                      <div className="pt-4 border-t border-amber-500/20 flex items-center justify-between">
                        <span className="font-semibold text-amber-400">Total Estimated Tax</span>
                        <span className="text-2xl font-bold bg-linear-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                          {formatCurrency(customTaxEstimates?.totalTax ?? 0)}
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                </div>

                {/* Quick Insights with Action Buttons */}
                {(data.taxLossHarvestingOpportunities.length > 0 || data.washSaleAlerts.length > 0) && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {data.taxLossHarvestingOpportunities.length > 0 && (() => {
                      const totalUnrealizedLoss = data.taxLossHarvestingOpportunities.reduce((sum, o) => sum + o.unrealizedLoss, 0);
                      const estimatedSavings = Math.abs(totalUnrealizedLoss) * (taxRates.shortTermRate / 100);
                      return (
                        <GlassCard className="p-5" gradient="emerald" hover={false}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-emerald-500/20">
                                <Scissors className="h-5 w-5 text-emerald-400" />
                              </div>
                              <span className="font-semibold text-emerald-400">
                                Tax-Loss Harvesting
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-zinc-300 mb-4">
                            <span className="text-white font-semibold">{data.taxLossHarvestingOpportunities.length}</span> positions with unrealized losses
                            totaling{' '}
                            <span className="font-semibold text-red-400">
                              {formatCurrency(totalUnrealizedLoss)}
                            </span>
                          </p>

                          {/* Estimated Tax Savings Calculator */}
                          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles className="h-4 w-4 text-emerald-400" />
                              <span className="text-xs font-medium text-emerald-400">Potential Tax Savings</span>
                            </div>
                            <p className="text-lg font-bold text-emerald-400">
                              ~{formatCurrency(estimatedSavings)}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">
                              Based on {taxRates.shortTermRate}% tax rate if harvested
                            </p>
                          </div>

                          <button
                            onClick={() => setActiveTab('harvesting')}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                          >
                            View Opportunities
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </GlassCard>
                      );
                    })()}
                    {data.washSaleAlerts.length > 0 && (
                      <GlassCard className="p-5" gradient="amber" hover={false}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-amber-500/20">
                              <AlertTriangle className="h-5 w-5 text-amber-400" />
                            </div>
                            <span className="font-semibold text-amber-400">
                              Potential Wash Sales
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300 mb-4">
                          <span className="text-white font-semibold">{data.washSaleAlerts.length}</span> transactions may trigger wash sale rules
                          with{' '}
                          <span className="font-semibold text-amber-400">
                            {formatCurrency(data.summary.washSaleDisallowed)}
                          </span>
                          {' '}potentially disallowed
                        </p>

                        {/* Warning about impact */}
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertCircle className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-medium text-amber-400">Tax Impact</span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Wash sale losses are deferred, not lost. They&apos;re added to your cost basis.
                          </p>
                        </div>

                        <button
                          onClick={() => setActiveTab('washsales')}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                        >
                          Review Alerts
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </GlassCard>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'lots' && (
              <div>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-zinc-500" />
                    <SegmentedControl
                      options={[
                        { value: 'all' as const, label: 'All' },
                        { value: 'short-term' as const, label: 'Short-Term' },
                        { value: 'long-term' as const, label: 'Long-Term' },
                      ]}
                      value={filterHoldingPeriod}
                      onChange={setFilterHoldingPeriod}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">Sort by</span>
                    <SegmentedControl
                      options={[
                        { value: 'date' as const, label: 'Date' },
                        { value: 'gain' as const, label: 'Gain/Loss' },
                        { value: 'symbol' as const, label: 'Symbol' },
                      ]}
                      value={sortBy}
                      onChange={setSortBy}
                    />
                  </div>
                </div>

                {/* Tax Lots List */}
                <div className="max-h-150 overflow-y-auto">
                  {filteredTaxLots.length === 0 ? (
                    <div className="p-12 text-center">
                      <CheckCircle className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-zinc-300 mb-2">No Tax Lots Found</h3>
                      <p className="text-zinc-500">No tax lots match the selected filters.</p>
                    </div>
                  ) : (
                    filteredTaxLots.map(lot => (
                      <TaxLotRow
                        key={lot.id}
                        lot={lot}
                        expanded={expandedLots.has(lot.id)}
                        onToggle={() => toggleLotExpanded(lot.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'harvesting' && (
              <div className="p-6 sm:p-8">
                {data.taxLossHarvestingOpportunities.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 mb-4">
                      <CheckCircle className="h-12 w-12 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      No Harvesting Opportunities
                    </h3>
                    <p className="text-zinc-400 max-w-md mx-auto">
                      Great news! You don&apos;t have any significant unrealized losses in your portfolio
                      that could be harvested for tax benefits.
                    </p>
                  </div>
                ) : (
                  <>
                    <GlassCard className="p-5 mb-6" hover={false}>
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-xl bg-emerald-500/20 shrink-0">
                          <Scissors className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white">What is Tax-Loss Harvesting?</h3>
                          <p className="text-sm text-zinc-400 mt-1">
                            Tax-loss harvesting is a strategy to offset capital gains by selling investments
                            at a loss. The losses can offset gains and up to $3,000 of ordinary income per year.
                            Be aware of wash sale rules when repurchasing similar securities.
                          </p>
                        </div>
                      </div>
                    </GlassCard>

                    <div className="grid gap-4">
                      {data.taxLossHarvestingOpportunities.map(opportunity => (
                        <HarvestingOpportunityCard key={opportunity.id} opportunity={opportunity} />
                      ))}
                    </div>

                    <GlassCard className="mt-6 p-5" gradient="emerald" hover={false}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Sparkles className="h-5 w-5 text-emerald-400" />
                          <span className="font-semibold text-emerald-400">
                            Total Potential Tax Savings
                          </span>
                        </div>
                        <span className="text-2xl font-bold bg-linear-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                          ~{formatCurrency(
                            data.taxLossHarvestingOpportunities.reduce((sum, o) => sum + o.potentialTaxSavings, 0)
                          )}
                        </span>
                      </div>
                    </GlassCard>
                  </>
                )}
              </div>
            )}

            {activeTab === 'washsales' && (
              <div className="p-6 sm:p-8">
                {data.washSaleAlerts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 mb-4">
                      <CheckCircle className="h-12 w-12 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      No Wash Sales Detected
                    </h3>
                    <p className="text-zinc-400 max-w-md mx-auto">
                      Great news! We haven&apos;t detected any transactions that might trigger wash sale
                      rules in your trading history for {selectedYear}.
                    </p>
                  </div>
                ) : (
                  <>
                    <GlassCard className="p-5 mb-6" gradient="amber" hover={false}>
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-xl bg-amber-500/20 shrink-0">
                          <AlertTriangle className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="font-bold text-amber-400">What is a Wash Sale?</h3>
                          <p className="text-sm text-zinc-300 mt-1">
                            A wash sale occurs when you sell a security at a loss and purchase the same
                            or &quot;substantially identical&quot; security within 30 days before or after the sale.
                            The loss is disallowed for tax purposes and added to the cost basis of the
                            repurchased shares.
                          </p>
                        </div>
                      </div>
                    </GlassCard>

                    <div className="space-y-4">
                      {data.washSaleAlerts.map(alert => (
                        <WashSaleAlertCard key={alert.id} alert={alert} />
                      ))}
                    </div>

                    <GlassCard className="mt-6 p-5" gradient="amber" hover={false}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-400">
                          Total Potentially Disallowed Losses
                        </span>
                        <span className="text-2xl font-bold bg-linear-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                          {formatCurrency(data.summary.washSaleDisallowed)}
                        </span>
                      </div>
                    </GlassCard>
                  </>
                )}
              </div>
            )}
          </GlassCard>
        </>
      ) : null}
    </div>
  );
}
