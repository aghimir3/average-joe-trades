/**
 * Edit Option Trade Form Component
 *
 * Allows users to edit existing option trade entries.
 * Pre-populates with existing data and updates via PATCH API.
 * Supports editing both entry and exit for closed trades.
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { z } from 'zod';
import {
  Trash2,
  Zap,
  Calendar,
  DollarSign,
  Hash,
  FileText,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect as Select } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { createChildLogger } from '@/lib/logger';
import { utcToLocalDateString } from '@/lib/utils';

const formLogger = createChildLogger({ module: 'edit-option-trade-form' });

/**
 * Strategy display names for UI.
 */
const STRATEGY_LABELS: Record<string, string> = {
  long_call: 'Long Call',
  long_put: 'Long Put',
  covered_call: 'Covered Call',
  cash_secured_put: 'Cash Secured Put',
  call_debit_spread: 'Call Debit Spread',
  put_debit_spread: 'Put Debit Spread',
  call_credit_spread: 'Call Credit Spread',
  put_credit_spread: 'Put Credit Spread',
  long_straddle: 'Long Straddle',
  long_strangle: 'Long Strangle',
  short_straddle: 'Short Straddle',
  short_strangle: 'Short Strangle',
  iron_condor: 'Iron Condor',
  iron_butterfly: 'Iron Butterfly',
  jade_lizard: 'Jade Lizard',
  calendar_spread: 'Calendar Spread',
  diagonal_spread: 'Diagonal Spread',
  custom: 'Custom',
};

/**
 * Schema for editing an option trade entry.
 */
const editOptionEntrySchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters'),
  entryDate: z.string().min(1, 'Entry date is required'),
  quantity: z
    .coerce.number()
    .int('Contracts must be a whole number')
    .positive('Contracts must be at least 1'),
  premium: z
    .coerce.number()
    .nonnegative('Premium cannot be negative'),
  strike: z
    .coerce.number()
    .positive('Strike price must be positive'),
  expiration: z.string().min(1, 'Expiration date is required'),
  optionType: z.enum(['call', 'put']),
  notes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

/**
 * Schema for editing an option trade exit.
 */
const editOptionExitSchema = z.object({
  exitDate: z.string().min(1, 'Exit date is required'),
  exitQuantity: z
    .coerce.number()
    .int('Contracts must be a whole number')
    .positive('Contracts must be at least 1'),
  exitPremium: z
    .coerce.number()
    .nonnegative('Premium cannot be negative'),
  exitNotes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

type EditOptionEntryInput = z.infer<typeof editOptionEntrySchema>;
type EditOptionExitInput = z.infer<typeof editOptionExitSchema>;

interface OptionTradeData {
  id: string;
  symbol: string;
  quantity: number;
  price: number | null;
  activityDate: string;
  notes: string | null;
  transCode: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
}

interface EditOptionTradeFormProps {
  initialData: OptionTradeData;
  closeData?: OptionTradeData | null;
}

/**
 * Update an option trade via API.
 */
async function updateOptionTrade(id: string, data: Record<string, unknown>) {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to update trade'));
  }

  return apiData(await parseApiJson(response));
}

/**
 * Delete an option trade via API.
 */
async function deleteOptionTrade(id: string) {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to delete trade'));
  }

  return apiData(await parseApiJson(response));
}

export function EditOptionTradeForm({ initialData, closeData }: EditOptionTradeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'open' | 'close'>('open');

  const isClosed = !!closeData;
  const isBuy = initialData.transCode === 'BTO';
  const isCredit = initialData.transCode === 'STO';
  const strategyLabel = initialData.strategy
    ? STRATEGY_LABELS[initialData.strategy] || initialData.strategy
    : isBuy ? 'Long Option' : 'Short Option';

  // Format initial dates for inputs (preserve UTC dates, don't convert to local)
  const initialDate = initialData.activityDate
    ? utcToLocalDateString(initialData.activityDate)
    : '';
  const initialExpiration = initialData.expiration
    ? utcToLocalDateString(initialData.expiration)
    : '';
  const closeInitialDate = closeData?.activityDate
    ? utcToLocalDateString(closeData.activityDate)
    : '';

  // Entry form
  const {
    register: registerEntry,
    handleSubmit: handleSubmitEntry,
    watch: watchEntry,
    control: controlEntry,
    formState: { errors: entryErrors, isSubmitting: isSubmittingEntry, isDirty: isEntryDirty },
  } = useForm<EditOptionEntryInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editOptionEntrySchema) as any,
    defaultValues: {
      ticker: initialData.symbol,
      entryDate: initialDate,
      quantity: initialData.quantity,
      premium: initialData.price || 0,
      strike: initialData.strike || 0,
      expiration: initialExpiration,
      optionType: (initialData.optionType as 'call' | 'put') || 'call',
      notes: initialData.notes || '',
    },
  });

  // Exit form (only used if closeData exists)
  const {
    register: registerExit,
    handleSubmit: handleSubmitExit,
    watch: watchExit,
    control: controlExit,
    formState: { errors: exitErrors, isSubmitting: isSubmittingExit, isDirty: isExitDirty },
  } = useForm<EditOptionExitInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editOptionExitSchema) as any,
    defaultValues: {
      exitDate: closeInitialDate,
      exitQuantity: closeData?.quantity || 0,
      exitPremium: closeData?.price || 0,
      exitNotes: closeData?.notes || '',
    },
  });

  // Watch values for P&L calculation
  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch is needed for live P&L calculation
  const entryPremium = watchEntry('premium');
  const entryQuantity = watchEntry('quantity');
  const exitPremium = watchExit('exitPremium');

  // Calculate P&L for closed trades (options: premium * 100 per contract)
  const calculatedPnL = useMemo(() => {
    if (!isClosed || entryPremium === undefined || exitPremium === undefined) return null;
    const entryValue = entryPremium * entryQuantity * 100;
    const exitValue = exitPremium * entryQuantity * 100;
    // For long positions (BTO): exit - entry
    // For short positions (STO): entry - exit
    return isBuy ? exitValue - entryValue : entryValue - exitValue;
  }, [isClosed, entryPremium, exitPremium, entryQuantity, isBuy]);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardTrades'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const entryMutation = useMutation({
    mutationFn: (data: Partial<EditOptionEntryInput>) =>
      updateOptionTrade(initialData.id, data),
    onSuccess: () => {
      formLogger.info({ id: initialData.id }, 'Option entry updated successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to update option entry');
      setError(err.message);
    },
  });

  const exitMutation = useMutation({
    mutationFn: (data: Partial<EditOptionExitInput>) => {
      if (!closeData) throw new Error('No close data');
      // Map exit form fields to API fields
      return updateOptionTrade(closeData.id, {
        entryDate: data.exitDate,
        quantity: data.exitQuantity,
        premium: data.exitPremium,
        notes: data.exitNotes,
      });
    },
    onSuccess: () => {
      formLogger.info({ id: closeData?.id }, 'Option exit updated successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to update option exit');
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOptionTrade(id),
    onSuccess: () => {
      formLogger.info({ id: deleteTarget === 'open' ? initialData.id : closeData?.id }, 'Option trade deleted successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to delete option trade');
      setError(err.message);
      setShowDeleteConfirm(false);
    },
  });

  const onSubmitEntry = (data: EditOptionEntryInput) => {
    setError(null);
    formLogger.debug({ id: initialData.id, ticker: data.ticker }, 'Submitting option entry update');
    entryMutation.mutate(data);
  };

  const onSubmitExit = (data: EditOptionExitInput) => {
    setError(null);
    formLogger.debug({ id: closeData?.id }, 'Submitting option exit update');
    exitMutation.mutate(data);
  };

  const handleDelete = (target: 'open' | 'close') => {
    setDeleteTarget(target);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    const id = deleteTarget === 'open' ? initialData.id : closeData?.id;
    if (id) {
      deleteMutation.mutate(id);
    }
  };

  // Delete confirmation dialog
  if (showDeleteConfirm) {
    const targetLabel = deleteTarget === 'open'
      ? `${initialData.symbol} ${initialData.optionType} ${strategyLabel.toLowerCase()}`
      : `${closeData?.symbol || initialData.symbol} exit order`;

    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Trash2 className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Delete {deleteTarget === 'open' ? 'Entry' : 'Exit'}?
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
              This will permanently delete the {targetLabel}.
              This action cannot be undone and will recalculate your positions.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 bg-rh-red hover:bg-rh-red/90 text-white"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full mx-auto space-y-6 ${isClosed ? 'max-w-4xl' : 'max-w-lg'}`}>
      {/* Trade Summary Header */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-xl ${initialData.optionType === 'call' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
            <Zap className={`h-6 w-6 ${initialData.optionType === 'call' ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}`} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {initialData.symbol}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isClosed ? 'Closed Trade' : 'Open Position'} · {strategyLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Type</p>
            <p className={`font-semibold ${initialData.optionType === 'call' ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}`}>
              {initialData.optionType?.toUpperCase()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Strike</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${initialData.strike || 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Contracts</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {initialData.quantity}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              {isCredit ? 'Credit' : 'Debit'}
            </p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${(initialData.price || 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* P&L for closed trades */}
        {isClosed && calculatedPnL !== null && (
          <div className={`p-3 rounded-xl ${calculatedPnL >= 0 ? 'bg-rh-green/10' : 'bg-rh-red/10'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-(--text-secondary)">Total P&L</span>
              <span className={`text-lg font-bold ${calculatedPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {calculatedPnL >= 0 ? '+' : ''}${calculatedPnL.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-xl bg-rh-red/10 text-rh-red text-sm border border-rh-red/30">
          {error}
        </div>
      )}

      {/* Forms Container - Side by side on desktop for closed trades */}
      <div className={`${isClosed ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
      {/* Entry Form */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                {isClosed ? 'Entry Details' : `Edit ${strategyLabel}`}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isClosed
                  ? 'Opening trade information'
                  : `${isCredit ? 'Credit received' : 'Debit paid'} - Update your option trade`
                }
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmitEntry(onSubmitEntry)} className="p-6 space-y-5">
          {/* Ticker */}
          <div className="space-y-2">
            <Label htmlFor="ticker" className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-zinc-400" />
              Underlying Symbol
            </Label>
            <Input
              id="ticker"
              placeholder="AAPL"
              {...registerEntry('ticker')}
              className={`h-11 ${entryErrors.ticker ? 'border-rh-red' : ''}`}
            />
            {entryErrors.ticker && (
              <p className="text-sm text-rh-red">{entryErrors.ticker.message}</p>
            )}
          </div>

          {/* Date and Option Type Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryDate" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-zinc-400" />
                Entry Date
              </Label>
              <Controller
                name="entryDate"
                control={controlEntry}
                render={({ field }) => (
                  <DatePicker
                    id="entryDate"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select date"
                    className={`h-11 ${entryErrors.entryDate ? 'border-rh-red' : ''}`}
                  />
                )}
              />
              {entryErrors.entryDate && (
                <p className="text-sm text-rh-red">{entryErrors.entryDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-zinc-400" />
                Option Type
              </Label>
              <Select
                {...registerEntry('optionType')}
                options={[
                  { value: 'call', label: 'Call' },
                  { value: 'put', label: 'Put' },
                ]}
                className="h-11"
              />
            </div>
          </div>

          {/* Strike and Expiration Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="strike" className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-zinc-400" />
                Strike Price
              </Label>
              <Input
                id="strike"
                type="number"
                min="0.01"
                step="any"
                placeholder="150"
                {...registerEntry('strike', { valueAsNumber: true })}
                className={`h-11 ${entryErrors.strike ? 'border-rh-red' : ''}`}
              />
              {entryErrors.strike && (
                <p className="text-sm text-rh-red">{entryErrors.strike.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-zinc-400" />
                Expiration
              </Label>
              <Controller
                name="expiration"
                control={controlEntry}
                render={({ field }) => (
                  <DatePicker
                    id="expiration"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select exp"
                    className={`h-11 ${entryErrors.expiration ? 'border-rh-red' : ''}`}
                  />
                )}
              />
              {entryErrors.expiration && (
                <p className="text-sm text-rh-red">{entryErrors.expiration.message}</p>
              )}
            </div>
          </div>

          {/* Contracts and Premium Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="flex items-center gap-2 text-sm font-medium">
                <Hash className="h-4 w-4 text-zinc-400" />
                Contracts
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                placeholder="1"
                {...registerEntry('quantity', { valueAsNumber: true })}
                className={`h-11 ${entryErrors.quantity ? 'border-rh-red' : ''}`}
              />
              {entryErrors.quantity && (
                <p className="text-sm text-rh-red">{entryErrors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="premium" className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-zinc-400" />
                Premium
              </Label>
              <Input
                id="premium"
                type="number"
                min="0"
                step="0.01"
                placeholder="5.00"
                {...registerEntry('premium', { valueAsNumber: true })}
                className={`h-11 ${entryErrors.premium ? 'border-rh-red' : ''}`}
              />
              {entryErrors.premium && (
                <p className="text-sm text-rh-red">{entryErrors.premium.message}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-zinc-500 -mt-3">
            {isCredit ? 'Credit received' : 'Debit paid'} per contract
          </p>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-zinc-400" />
              Notes
              <span className="text-zinc-400 font-normal">(Optional)</span>
            </Label>
            <Textarea
              id="notes"
              placeholder="Why did you enter this trade? What was your thesis?"
              {...registerEntry('notes')}
              className="min-h-20 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1 h-12"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 bg-rh-green hover:bg-rh-green-hover text-white font-semibold"
              disabled={isSubmittingEntry || entryMutation.isPending || !isEntryDirty}
            >
              {entryMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Save Entry
                </>
              )}
            </Button>
          </div>

          {/* Delete Button */}
          <Button
            type="button"
            variant="ghost"
            className="w-full h-10 text-rh-red hover:text-rh-red hover:bg-rh-red/10"
            onClick={() => handleDelete('open')}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Entry
          </Button>
        </form>
      </div>

      {/* Exit Form (only shown for closed trades) - Side by side with entry on desktop */}
      {isClosed && closeData && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                  Exit Details
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Closing trade information
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitExit(onSubmitExit)} className="p-6 space-y-5">
            {/* Date and Contracts Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exitDate" className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  Exit Date
                </Label>
                <Controller
                  name="exitDate"
                  control={controlExit}
                  render={({ field }) => (
                    <DatePicker
                      id="exitDate"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select date"
                      className={`h-11 ${exitErrors.exitDate ? 'border-rh-red' : ''}`}
                    />
                  )}
                />
                {exitErrors.exitDate && (
                  <p className="text-sm text-rh-red">{exitErrors.exitDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="exitQuantity" className="flex items-center gap-2 text-sm font-medium">
                  <Hash className="h-4 w-4 text-zinc-400" />
                  Contracts
                </Label>
                <Input
                  id="exitQuantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  {...registerExit('exitQuantity', { valueAsNumber: true })}
                  className={`h-11 ${exitErrors.exitQuantity ? 'border-rh-red' : ''}`}
                />
                {exitErrors.exitQuantity && (
                  <p className="text-sm text-rh-red">{exitErrors.exitQuantity.message}</p>
                )}
              </div>
            </div>

            {/* Exit Premium */}
            <div className="space-y-2">
              <Label htmlFor="exitPremium" className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-zinc-400" />
                Exit Premium
              </Label>
              <Input
                id="exitPremium"
                type="number"
                min="0"
                step="0.01"
                placeholder="2.50"
                {...registerExit('exitPremium', { valueAsNumber: true })}
                className={`h-11 ${exitErrors.exitPremium ? 'border-rh-red' : ''}`}
              />
              {exitErrors.exitPremium && (
                <p className="text-sm text-rh-red">{exitErrors.exitPremium.message}</p>
              )}
            </div>

            {/* P&L Preview */}
            {calculatedPnL !== null && (
              <div className={`p-4 rounded-xl ${calculatedPnL >= 0 ? 'bg-rh-green/10 border border-rh-green/30' : 'bg-rh-red/10 border border-rh-red/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-(--text-secondary)">
                    Calculated P&L
                  </span>
                  <span className={`text-xl font-bold ${calculatedPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                    {calculatedPnL >= 0 ? '+' : ''}${calculatedPnL.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="exitNotes" className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-zinc-400" />
                Exit Notes
                <span className="text-zinc-400 font-normal">(Optional)</span>
              </Label>
              <Textarea
                id="exitNotes"
                placeholder="Why did you exit? What did you learn?"
                {...registerExit('exitNotes')}
                className="min-h-20 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-12 bg-rh-green hover:bg-rh-green-hover text-white font-semibold"
                disabled={isSubmittingExit || exitMutation.isPending || !isExitDirty}
              >
                {exitMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Exit
                  </>
                )}
              </Button>
            </div>

            {/* Delete Button */}
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 text-rh-red hover:text-rh-red hover:bg-rh-red/10"
              onClick={() => handleDelete('close')}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Exit
            </Button>
          </form>
        </div>
      )}
      </div>
    </div>
  );
}
