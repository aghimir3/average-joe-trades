/**
 * Import Report Client Component
 *
 * Displays detailed information about a specific import batch with:
 * - Full audit trail with pagination
 * - Filtering by symbol and type
 * - Mobile-friendly card layout for transactions
 * - Expandable warnings and errors with meaningful descriptions
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Building2,
  Hash,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  BarChart3,
  Calendar,
  DollarSign,
  Layers,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';


// Warning code descriptions for better UX
const warningDescriptions: Record<string, { title: string; explanation: string }> = {
  'Unknown transaction code': {
    title: 'Unknown Transaction Type',
    explanation: 'This transaction code was not recognized. The row was skipped to avoid incorrect data.',
  },
  'Could not determine option type': {
    title: 'Option Type Missing',
    explanation: 'Could not identify if this option is a call or put. Defaulted to call.',
  },
  'Could not determine strike price': {
    title: 'Strike Price Missing',
    explanation: 'The strike price could not be extracted from the option description.',
  },
  'Could not determine expiration date': {
    title: 'Expiration Missing',
    explanation: 'The expiration date could not be determined from the option description.',
  },
  'Price is missing': {
    title: 'No Price Data',
    explanation: 'This trade transaction has no price recorded. P&L calculations may be affected.',
  },
};

// Error code descriptions for better UX
const errorDescriptions: Record<string, { title: string; explanation: string }> = {
  'Missing activity date': {
    title: 'No Date',
    explanation: 'This row is missing a transaction date and cannot be imported.',
  },
  'Invalid quantity': {
    title: 'Bad Quantity',
    explanation: 'The quantity value is invalid (zero or negative).',
  },
  'Option is missing strike or expiration': {
    title: 'Incomplete Option',
    explanation: 'Option trades require both strike price and expiration date.',
  },
  'Missing symbol': {
    title: 'No Symbol',
    explanation: 'No ticker symbol found for this transaction.',
  },
};

function getWarningInfo(message: string): { title: string; explanation: string } {
  for (const [key, value] of Object.entries(warningDescriptions)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return { title: 'Warning', explanation: message };
}

function getErrorInfo(message: string): { title: string; explanation: string } {
  for (const [key, value] of Object.entries(errorDescriptions)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return { title: 'Error', explanation: message };
}

interface ImportBatchReport {
  batch: {
    id: string;
    fileName: string;
    broker: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    account: {
      id: string;
      name: string;
      broker: string;
    };
    dateRange: {
      start: string | null;
      end: string | null;
    };
    isArchived: boolean;
    errorMessage: string | null;
  };
  metrics: {
    totalRows: number;
    parsedRows: number;
    validatedRows: number;
    importedEvents: number;
    duplicateRows: number;
    skippedRows: number;
    eventCount: number;
  };
  breakdown: {
    byType: {
      stocks: number;
      options: number;
    };
    byStatus: {
      opening: number;
      closing: number;
    };
    topSymbols: Array<{ symbol: string; count: number }>;
    allSymbols: Array<{ symbol: string; count: number }>;
    transCodeBreakdown: Array<{ code: string; count: number }>;
  };
  transactions: Array<{
    id: string;
    activityDate: string;
    symbol: string;
    transCode: string;
    quantity: number;
    price: number | null;
    amount: number | null;
    isOption: boolean;
    optionType: string | null;
    strike: number | null;
    expiration: string | null;
    description: string | null;
    instrument: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {
    symbol: string | null;
    type: string | null;
  };
  warnings: Array<{ row?: number; message: string; symbol?: string }>;
  errors: Array<{ row?: number; message: string; symbol?: string }>;
}

interface ImportReportClientProps {
  batchId: string;
}

export function ImportReportClient({ batchId }: ImportReportClientProps) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'stock' | 'option' | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());
    if (symbolFilter) params.set('symbol', symbolFilter);
    if (typeFilter) params.set('type', typeFilter);
    return params.toString();
  };

  const { data, isLoading, error } = useQuery<ImportBatchReport>({
    queryKey: ['import-batch', batchId, page, limit, symbolFilter, typeFilter],
    queryFn: async () => {
      const response = await fetch(`/api/import/${batchId}?${buildQueryString()}`);
      if (!response.ok) {
        const errorData = await parseApiJson(response).catch(() => ({}));
        throw new Error(apiMessage(errorData, 'Failed to fetch import report'));
      }
      return apiData(await parseApiJson(response));
    },
  });

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: document.getElementById('transactions-section')?.offsetTop || 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSymbolFilter(null);
    setTypeFilter(null);
    setPage(1);
  };

  const hasActiveFilters = symbolFilter || typeFilter;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground">Loading import report...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-red-200 bg-linear-to-br from-red-50 to-red-100/50 p-8 text-center dark:border-red-800 dark:from-red-900/20 dark:to-red-950/30">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-red-800 dark:text-red-200">
              Failed to Load Report
            </h2>
            <p className="mb-6 text-red-600 dark:text-red-300">
              {error instanceof Error ? error.message : 'Import batch not found'}
            </p>
            <Link href="/import">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Import
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { batch, metrics, breakdown, transactions, pagination, warnings, errors: importErrors } = data;

  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      label: 'Completed',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
    },
    failed: {
      icon: XCircle,
      label: 'Failed',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      borderColor: 'border-red-200 dark:border-red-800',
    },
    processing: {
      icon: Clock,
      label: 'Processing',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      borderColor: 'border-amber-200 dark:border-amber-800',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      color: 'text-zinc-600 dark:text-zinc-400',
      bgColor: 'bg-zinc-100 dark:bg-zinc-800',
      borderColor: 'border-zinc-200 dark:border-zinc-700',
    },
  };

  const status = statusConfig[batch.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMobileDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const transCodeLabels: Record<string, string> = {
    BUY: 'Buy Stock',
    SELL: 'Sell Stock',
    BTO: 'Buy to Open',
    STO: 'Sell to Open',
    BTC: 'Buy to Close',
    STC: 'Sell to Close',
    OEXP: 'Option Expired',
    OASGN: 'Option Assigned',
  };

  // Group warnings and errors by type for better display
  const groupedWarnings = warnings.reduce((acc, w) => {
    const info = getWarningInfo(w.message);
    const key = info.title;
    if (!acc[key]) {
      acc[key] = { info, items: [] };
    }
    acc[key].items.push(w);
    return acc;
  }, {} as Record<string, { info: { title: string; explanation: string }; items: typeof warnings }>);

  const groupedErrors = importErrors.reduce((acc, e) => {
    const info = getErrorInfo(e.message);
    const key = info.title;
    if (!acc[key]) {
      acc[key] = { info, items: [] };
    }
    acc[key].items.push(e);
    return acc;
  }, {} as Record<string, { info: { title: string; explanation: string }; items: typeof importErrors }>);

  const warningsToShow = warningsExpanded ? warnings : warnings.slice(0, 5);
  const errorsToShow = errorsExpanded ? importErrors : importErrors.slice(0, 5);

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/import"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Import
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 sm:h-12 sm:w-12">
                  <FileSpreadsheet className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-bold sm:text-2xl">{batch.fileName}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      {batch.account.name}
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="capitalize">{batch.broker}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 sm:px-4 sm:py-2', status.bgColor, status.borderColor)}>
              <StatusIcon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', status.color)} />
              <span className={cn('text-xs font-medium sm:text-sm', status.color)}>{status.label}</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {batch.errorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-linear-to-r from-red-50 to-red-100/50 p-4 dark:border-red-800 dark:from-red-900/20 dark:to-red-950/30">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <h3 className="font-medium text-red-800 dark:text-red-200">Import Error</h3>
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">{batch.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards - Mobile 2x2, Desktop 4x1 */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-xl border bg-card p-3 transition-all hover:shadow-md sm:p-4">
            <div className="absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full bg-linear-to-br from-emerald-500/10 to-teal-500/10 sm:h-20 sm:w-20 sm:translate-x-6 sm:-translate-y-6" />
            <div className="relative">
              <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
                <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wide sm:text-xs">Total Rows</span>
              </div>
              <div className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">{metrics.totalRows.toLocaleString()}</div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-xl border bg-card p-3 transition-all hover:shadow-md sm:p-4">
            <div className="absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full bg-linear-to-br from-green-500/10 to-emerald-500/10 sm:h-20 sm:w-20 sm:translate-x-6 sm:-translate-y-6" />
            <div className="relative">
              <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 sm:h-4 sm:w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wide sm:text-xs">Imported</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400 sm:mt-2 sm:text-3xl">
                {metrics.importedEvents.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-xl border bg-card p-3 transition-all hover:shadow-md sm:p-4">
            <div className="absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full bg-linear-to-br from-amber-500/10 to-orange-500/10 sm:h-20 sm:w-20 sm:translate-x-6 sm:-translate-y-6" />
            <div className="relative">
              <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
                <Hash className="h-3.5 w-3.5 text-amber-500 sm:h-4 sm:w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wide sm:text-xs">Duplicates</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 sm:mt-2 sm:text-3xl">
                {metrics.duplicateRows.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-xl border bg-card p-3 transition-all hover:shadow-md sm:p-4">
            <div className="absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full bg-linear-to-br from-zinc-500/10 to-slate-500/10 sm:h-20 sm:w-20 sm:translate-x-6 sm:-translate-y-6" />
            <div className="relative">
              <div className="flex items-center gap-1.5 text-muted-foreground sm:gap-2">
                <Layers className="h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wide sm:text-xs">Skipped</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-muted-foreground sm:mt-2 sm:text-3xl">
                {metrics.skippedRows.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {/* Import Details */}
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 sm:mb-4">
              <Calendar className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
              <h2 className="text-base font-semibold sm:text-lg">Import Details</h2>
            </div>
            <dl className="space-y-2 text-xs sm:space-y-3 sm:text-sm">
              <div className="flex justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 sm:px-3">
                <dt className="text-muted-foreground">Imported At</dt>
                <dd className="font-medium text-right">{formatDate(batch.createdAt)}</dd>
              </div>
              {batch.completedAt && (
                <div className="flex justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 sm:px-3">
                  <dt className="text-muted-foreground">Completed At</dt>
                  <dd className="font-medium text-right">{formatDate(batch.completedAt)}</dd>
                </div>
              )}
              {batch.dateRange.start && (
                <div className="flex justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 sm:px-3">
                  <dt className="text-muted-foreground">Trade Dates</dt>
                  <dd className="font-medium text-right">
                    {formatShortDate(batch.dateRange.start)} - {formatShortDate(batch.dateRange.end)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 sm:px-3">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-medium text-right">{batch.account.name}</dd>
              </div>
            </dl>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 sm:mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
              <h2 className="text-base font-semibold sm:text-lg">Breakdown</h2>
            </div>
            <div className="space-y-4">
              {/* By Type */}
              <div>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">By Type</h3>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setTypeFilter(typeFilter === 'stock' ? null : 'stock');
                      setPage(1);
                    }}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-2 text-center transition-all hover:shadow-md sm:p-3',
                      typeFilter === 'stock'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-transparent bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-900/10 dark:hover:bg-blue-900/20'
                    )}
                  >
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400 sm:text-2xl">
                      {breakdown.byType.stocks}
                    </div>
                    <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 sm:text-xs">Stocks</div>
                  </button>
                  <button
                    onClick={() => {
                      setTypeFilter(typeFilter === 'option' ? null : 'option');
                      setPage(1);
                    }}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-2 text-center transition-all hover:shadow-md sm:p-3',
                      typeFilter === 'option'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-transparent bg-purple-50/50 hover:bg-purple-50 dark:bg-purple-900/10 dark:hover:bg-purple-900/20'
                    )}
                  >
                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400 sm:text-2xl">
                      {breakdown.byType.options}
                    </div>
                    <div className="text-[10px] text-purple-600/70 dark:text-purple-400/70 sm:text-xs">Options</div>
                  </button>
                </div>
              </div>

              {/* By Status */}
              <div>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">By Action</h3>
                <div className="flex gap-2 sm:gap-3">
                  <div className="flex-1 rounded-lg bg-emerald-50/50 p-2 text-center dark:bg-emerald-900/10 sm:p-3">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-500 sm:h-4 sm:w-4" />
                      <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">
                        {breakdown.byStatus.opening}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 sm:text-xs">Opening</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-red-50/50 p-2 text-center dark:bg-red-900/10 sm:p-3">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="h-3 w-3 text-red-500 sm:h-4 sm:w-4" />
                      <span className="text-xl font-bold text-red-600 dark:text-red-400 sm:text-2xl">
                        {breakdown.byStatus.closing}
                      </span>
                    </div>
                    <div className="text-[10px] text-red-600/70 dark:text-red-400/70 sm:text-xs">Closing</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Symbols */}
        {breakdown.topSymbols.length > 0 && (
          <div className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                <h2 className="text-base font-semibold sm:text-lg">Top Symbols</h2>
              </div>
              <span className="text-[10px] text-muted-foreground sm:text-xs">Tap to filter</span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {breakdown.topSymbols.map(({ symbol, count }) => (
                <button
                  key={symbol}
                  onClick={() => {
                    setSymbolFilter(symbolFilter === symbol ? null : symbol);
                    setPage(1);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm',
                    symbolFilter === symbol
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  <span>{symbol}</span>
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] sm:text-xs',
                    symbolFilter === symbol
                      ? 'bg-white/20 text-white'
                      : 'bg-background text-muted-foreground'
                  )}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Types */}
        {breakdown.transCodeBreakdown.length > 0 && (
          <div className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Transaction Types</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {breakdown.transCodeBreakdown.map(({ code, count }) => (
                <div key={code} className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5 sm:p-3">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-medium sm:text-sm">{code}</span>
                    <div className="truncate text-[10px] text-muted-foreground sm:text-xs">{transCodeLabels[code] || code}</div>
                  </div>
                  <span className="ml-2 text-base font-bold sm:text-lg">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings - Expandable with better descriptions */}
        {warnings.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-linear-to-r from-amber-50 to-amber-100/50 p-4 dark:border-amber-800 dark:from-amber-900/20 dark:to-amber-950/30 sm:p-5">
            <button
              onClick={() => setWarningsExpanded(!warningsExpanded)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="flex items-center gap-2 text-base font-semibold text-amber-800 dark:text-amber-200 sm:text-lg">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                Warnings ({warnings.length})
              </h2>
              {warnings.length > 5 && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  {warningsExpanded ? 'Show less' : `Show all ${warnings.length}`}
                  {warningsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              )}
            </button>

            {/* Grouped summary */}
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(groupedWarnings).map(([title, { items }]) => (
                <div key={title} className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs dark:bg-amber-900/30">
                  <Info className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium text-amber-700 dark:text-amber-300">{title}</span>
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                    {items.length}
                  </span>
                </div>
              ))}
            </div>

            {/* Individual warnings */}
            <ul className="mt-3 space-y-2 text-xs sm:text-sm">
              {warningsToShow.map((warning, idx) => {
                const info = getWarningInfo(warning.message);
                return (
                  <li key={idx} className="flex items-start gap-2 rounded-lg bg-amber-100/50 p-2 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 sm:p-2.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {warning.row !== undefined && (
                          <span className="rounded bg-amber-200/50 px-1.5 py-0.5 font-mono text-[10px] text-amber-600 dark:bg-amber-800/50 dark:text-amber-400">
                            Row {warning.row}
                          </span>
                        )}
                        {warning.symbol && (
                          <span className="font-semibold">{warning.symbol}</span>
                        )}
                        <span className="font-medium">{info.title}</span>
                      </div>
                      <p className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">{info.explanation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {warnings.length > 5 && !warningsExpanded && (
              <button
                onClick={() => setWarningsExpanded(true)}
                className="mt-3 w-full rounded-lg bg-amber-200/50 py-2 text-center text-xs font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-800/30 dark:text-amber-300 dark:hover:bg-amber-800/50"
              >
                Show all {warnings.length} warnings
              </button>
            )}
          </div>
        )}

        {/* Errors - Expandable with better descriptions */}
        {importErrors.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-linear-to-r from-red-50 to-red-100/50 p-4 dark:border-red-800 dark:from-red-900/20 dark:to-red-950/30 sm:p-5">
            <button
              onClick={() => setErrorsExpanded(!errorsExpanded)}
              className="flex w-full items-center justify-between"
            >
              <h2 className="flex items-center gap-2 text-base font-semibold text-red-800 dark:text-red-200 sm:text-lg">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                Errors ({importErrors.length})
              </h2>
              {importErrors.length > 5 && (
                <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  {errorsExpanded ? 'Show less' : `Show all ${importErrors.length}`}
                  {errorsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              )}
            </button>

            {/* Grouped summary */}
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(groupedErrors).map(([title, { items }]) => (
                <div key={title} className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs dark:bg-red-900/30">
                  <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                  <span className="font-medium text-red-700 dark:text-red-300">{title}</span>
                  <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-800 dark:text-red-200">
                    {items.length}
                  </span>
                </div>
              ))}
            </div>

            {/* Individual errors */}
            <ul className="mt-3 space-y-2 text-xs sm:text-sm">
              {errorsToShow.map((err, idx) => {
                const info = getErrorInfo(err.message);
                return (
                  <li key={idx} className="flex items-start gap-2 rounded-lg bg-red-100/50 p-2 text-red-700 dark:bg-red-900/20 dark:text-red-300 sm:p-2.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {err.row !== undefined && (
                          <span className="rounded bg-red-200/50 px-1.5 py-0.5 font-mono text-[10px] text-red-600 dark:bg-red-800/50 dark:text-red-400">
                            Row {err.row}
                          </span>
                        )}
                        {err.symbol && (
                          <span className="font-semibold">{err.symbol}</span>
                        )}
                        <span className="font-medium">{info.title}</span>
                      </div>
                      <p className="mt-0.5 text-red-600/80 dark:text-red-400/80">{info.explanation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {importErrors.length > 5 && !errorsExpanded && (
              <button
                onClick={() => setErrorsExpanded(true)}
                className="mt-3 w-full rounded-lg bg-red-200/50 py-2 text-center text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-800/50"
              >
                Show all {importErrors.length} errors
              </button>
            )}
          </div>
        )}

        {/* Transactions Section */}
        <div id="transactions-section" className="scroll-mt-4 rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
            <div>
              <h2 className="text-base font-semibold sm:text-lg">
                Imported Transactions
                <span className="ml-2 text-xs font-normal text-muted-foreground sm:text-sm">
                  ({pagination.totalItems.toLocaleString()} {hasActiveFilters ? 'filtered' : 'total'})
                </span>
              </h2>
              {hasActiveFilters && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground sm:text-xs">Filters:</span>
                  {symbolFilter && (
                    <button
                      onClick={() => { setSymbolFilter(null); setPage(1); }}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 sm:text-xs"
                    >
                      {symbolFilter}
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </button>
                  )}
                  {typeFilter && (
                    <button
                      onClick={() => { setTypeFilter(null); setPage(1); }}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 sm:text-xs"
                    >
                      {typeFilter}s
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </button>
                  )}
                  <button
                    onClick={clearFilters}
                    className="text-[10px] text-muted-foreground hover:text-foreground sm:text-xs"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                className="rounded-lg border bg-background px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm"
              >
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
          </div>

          {transactions.length > 0 ? (
            <>
              {/* Desktop Table - Hidden on mobile */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Date</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Symbol</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Action</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Qty</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Price</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactions.map((txn, idx) => (
                      <tr key={txn.id} className={cn(
                        'transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'
                      )}>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatShortDate(txn.activityDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">{txn.symbol}</span>
                            {txn.isOption && txn.strike && (
                              <span className="text-xs text-muted-foreground">
                                {txn.optionType?.charAt(0).toUpperCase()} ${txn.strike}{' '}
                                {txn.expiration}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              txn.isOption
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            )}
                          >
                            {txn.isOption ? 'Option' : 'Stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-medium">{txn.transCode}</span>
                            <span className="text-xs text-muted-foreground">
                              {transCodeLabels[txn.transCode] || txn.transCode}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                          {txn.quantity}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {txn.price !== null ? formatCurrency(txn.price) : '-'}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums',
                            txn.amount !== null && txn.amount < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {txn.amount !== null ? formatCurrency(txn.amount) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout */}
              <div className="divide-y md:hidden">
                {transactions.map((txn) => (
                  <div key={txn.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{txn.symbol}</span>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              txn.isOption
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            )}
                          >
                            {txn.isOption ? 'OPT' : 'STK'}
                          </span>
                        </div>
                        {txn.isOption && txn.strike && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {txn.optionType?.charAt(0).toUpperCase()} ${txn.strike} {txn.expiration}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{formatMobileDate(txn.activityDate)}</span>
                          <span>•</span>
                          <span className="font-mono">{txn.transCode}</span>
                          <span>•</span>
                          <span>Qty: {txn.quantity}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            txn.amount !== null && txn.amount < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {txn.amount !== null ? formatCurrency(txn.amount) : '-'}
                        </div>
                        {txn.price !== null && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            @ {formatCurrency(txn.price)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t p-3 sm:flex-row sm:gap-4 sm:p-4">
                  <div className="text-xs text-muted-foreground sm:text-sm">
                    {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.totalItems)} of {pagination.totalItems.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(1)}
                      disabled={!pagination.hasPrevPage}
                      className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={!pagination.hasPrevPage}
                      className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>

                    <div className="flex items-center gap-1 px-1 sm:px-2">
                      {/* Page number buttons - fewer on mobile */}
                      {Array.from({ length: Math.min(3, pagination.totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.totalPages <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 2) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 1) {
                          pageNum = pagination.totalPages - 2 + i;
                        } else {
                          pageNum = pagination.page - 1 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={pagination.page === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(pageNum)}
                            className="h-7 w-7 p-0 text-xs sm:h-8 sm:w-8 sm:text-sm"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={!pagination.hasNextPage}
                      className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                    >
                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.totalPages)}
                      disabled={!pagination.hasNextPage}
                      className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                    >
                      <ChevronsRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center sm:p-12">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted sm:h-16 sm:w-16">
                <Search className="h-6 w-6 text-muted-foreground sm:h-8 sm:w-8" />
              </div>
              <h3 className="mb-2 text-base font-medium sm:text-lg">No Transactions Found</h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {hasActiveFilters
                  ? 'No transactions match your filters.'
                  : 'This import batch has no transactions.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="mt-4" size="sm">
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-6 text-center sm:mt-8">
          <Link href="/import">
            <Button variant="outline" size="default" className="gap-2 sm:size-lg">
              <ArrowLeft className="h-4 w-4" />
              Back to Import
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
