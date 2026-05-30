/**
 * Edit Stock Trade Form Component
 *
 * Allows users to edit existing stock trade entries.
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
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Hash,
  FileText,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { createChildLogger } from '@/lib/logger';
import { utcToLocalDateString } from '@/lib/utils';

const formLogger = createChildLogger({ module: 'edit-stock-trade-form' });

/**
 * Schema for editing a stock trade.
 */
const editStockTradeSchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker too long')
    .toUpperCase()
    .regex(/^[A-Z]+$/, 'Ticker must contain only letters'),
  entryDate: z.string().min(1, 'Entry date is required'),
  quantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  entryPrice: z
    .coerce.number()
    .positive('Entry price must be positive'),
  notes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

/**
 * Schema for editing a close trade.
 */
const editCloseTradeSchema = z.object({
  exitDate: z.string().min(1, 'Exit date is required'),
  exitQuantity: z
    .coerce.number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  exitPrice: z
    .coerce.number()
    .positive('Exit price must be positive'),
  exitNotes: z.string().max(5000, 'Notes too long').optional().nullable(),
});

type EditStockTradeInput = z.infer<typeof editStockTradeSchema>;
type EditCloseTradeInput = z.infer<typeof editCloseTradeSchema>;

interface StockTradeData {
  id: string;
  symbol: string;
  quantity: number;
  price: number | null;
  activityDate: string;
  notes: string | null;
  transCode: string;
}

interface EditStockTradeFormProps {
  initialData: StockTradeData;
  closeData?: StockTradeData | null;
}

/**
 * Update a stock trade via API.
 */
async function updateStockTrade(id: string, data: Partial<EditStockTradeInput>) {
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
 * Delete a stock trade via API.
 */
async function deleteStockTrade(id: string) {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to delete trade'));
  }

  return apiData(await parseApiJson(response));
}

export function EditStockTradeForm({ initialData, closeData }: EditStockTradeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'open' | 'close'>('open');

  const isClosed = !!closeData;
  const isBuy = initialData.transCode === 'BUY';

  // Format initial date for input (preserve UTC date, don't convert to local)
  const initialDate = initialData.activityDate
    ? utcToLocalDateString(initialData.activityDate)
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
  } = useForm<EditStockTradeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editStockTradeSchema) as any,
    defaultValues: {
      ticker: initialData.symbol,
      entryDate: initialDate,
      quantity: initialData.quantity,
      entryPrice: initialData.price || 0,
      notes: initialData.notes || '',
    },
  });

  // Close form (only used if closeData exists)
  const {
    register: registerClose,
    handleSubmit: handleSubmitClose,
    watch: watchClose,
    control: controlClose,
    formState: { errors: closeErrors, isSubmitting: isSubmittingClose, isDirty: isCloseDirty },
  } = useForm<EditCloseTradeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(editCloseTradeSchema) as any,
    defaultValues: {
      exitDate: closeInitialDate,
      exitQuantity: closeData?.quantity || 0,
      exitPrice: closeData?.price || 0,
      exitNotes: closeData?.notes || '',
    },
  });

  // Watch values for P&L calculation
  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch is needed for live P&L calculation
  const entryPrice = watchEntry('entryPrice');
  const entryQuantity = watchEntry('quantity');
  const exitPrice = watchClose('exitPrice');

  // Calculate P&L for closed trades
  const calculatedPnL = useMemo(() => {
    if (!isClosed || !entryPrice || !exitPrice) return null;
    const entry = entryPrice * entryQuantity;
    const exit = exitPrice * entryQuantity;
    return isBuy ? exit - entry : entry - exit;
  }, [isClosed, entryPrice, exitPrice, entryQuantity, isBuy]);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardTrades'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const entryMutation = useMutation({
    mutationFn: (data: Partial<EditStockTradeInput>) =>
      updateStockTrade(initialData.id, data),
    onSuccess: () => {
      formLogger.info({ id: initialData.id }, 'Stock entry updated successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to update stock entry');
      setError(err.message);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (data: Partial<EditCloseTradeInput>) => {
      if (!closeData) throw new Error('No close data');
      // Map close form fields to API fields
      return updateStockTrade(closeData.id, {
        entryDate: data.exitDate,
        quantity: data.exitQuantity,
        entryPrice: data.exitPrice,
        notes: data.exitNotes,
      });
    },
    onSuccess: () => {
      formLogger.info({ id: closeData?.id }, 'Stock exit updated successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to update stock exit');
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStockTrade(id),
    onSuccess: () => {
      formLogger.info({ id: deleteTarget === 'open' ? initialData.id : closeData?.id }, 'Stock trade deleted successfully');
      invalidateQueries();
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to delete stock trade');
      setError(err.message);
      setShowDeleteConfirm(false);
    },
  });

  const onSubmitEntry = (data: EditStockTradeInput) => {
    setError(null);
    formLogger.debug({ id: initialData.id, ticker: data.ticker }, 'Submitting stock entry update');
    entryMutation.mutate(data);
  };

  const onSubmitClose = (data: EditCloseTradeInput) => {
    setError(null);
    formLogger.debug({ id: closeData?.id }, 'Submitting stock exit update');
    closeMutation.mutate(data);
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
      ? `${initialData.symbol} ${isBuy ? 'buy' : 'sell'} order`
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
          <div className={`p-3 rounded-xl ${isBuy ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
            {isBuy ? (
              <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {initialData.symbol}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isClosed ? 'Closed Trade' : 'Open Position'} · {isBuy ? 'Long' : 'Short'}
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
        <div className={`grid grid-cols-2 ${isClosed ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Shares</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {initialData.quantity.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Entry</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${(initialData.price || 0).toFixed(2)}
            </p>
          </div>
          {isClosed && closeData && (
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Exit</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                ${(closeData.price || 0).toFixed(2)}
              </p>
            </div>
          )}
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              {isClosed ? 'P&L' : 'Cost Basis'}
            </p>
            {isClosed && calculatedPnL !== null ? (
              <p className={`font-semibold ${calculatedPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                {calculatedPnL >= 0 ? '+' : ''}${calculatedPnL.toFixed(2)}
              </p>
            ) : (
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                ${((initialData.price || 0) * initialData.quantity).toFixed(2)}
              </p>
            )}
          </div>
        </div>
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
                {isClosed ? 'Entry Details' : `${isBuy ? 'Buy' : 'Sell'} Order`}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isClosed ? 'Opening trade information' : 'Update your trade details'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmitEntry(onSubmitEntry)} className="p-6 space-y-5">
          {/* Ticker */}
          <div className="space-y-2">
            <Label htmlFor="ticker" className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-zinc-400" />
              Ticker Symbol
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

          {/* Date and Quantity Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryDate" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-zinc-400" />
                {isBuy ? 'Buy' : 'Sell'} Date
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
              <Label htmlFor="quantity" className="flex items-center gap-2 text-sm font-medium">
                <Hash className="h-4 w-4 text-zinc-400" />
                Shares
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                placeholder="100"
                {...registerEntry('quantity', { valueAsNumber: true })}
                className={`h-11 ${entryErrors.quantity ? 'border-rh-red' : ''}`}
              />
              {entryErrors.quantity && (
                <p className="text-sm text-rh-red">{entryErrors.quantity.message}</p>
              )}
            </div>
          </div>

          {/* Entry Price */}
          <div className="space-y-2">
            <Label htmlFor="entryPrice" className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-zinc-400" />
              {isBuy ? 'Buy' : 'Sell'} Price
            </Label>
            <Input
              id="entryPrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="150.00"
              {...registerEntry('entryPrice', { valueAsNumber: true })}
              className={`h-11 ${entryErrors.entryPrice ? 'border-rh-red' : ''}`}
            />
            {entryErrors.entryPrice && (
              <p className="text-sm text-rh-red">{entryErrors.entryPrice.message}</p>
            )}
          </div>

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

          <form onSubmit={handleSubmitClose(onSubmitClose)} className="p-6 space-y-5">
            {/* Date and Quantity Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exitDate" className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  Exit Date
                </Label>
                <Controller
                  name="exitDate"
                  control={controlClose}
                  render={({ field }) => (
                    <DatePicker
                      id="exitDate"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select date"
                      className={`h-11 ${closeErrors.exitDate ? 'border-rh-red' : ''}`}
                    />
                  )}
                />
                {closeErrors.exitDate && (
                  <p className="text-sm text-rh-red">{closeErrors.exitDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="exitQuantity" className="flex items-center gap-2 text-sm font-medium">
                  <Hash className="h-4 w-4 text-zinc-400" />
                  Shares
                </Label>
                <Input
                  id="exitQuantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="100"
                  {...registerClose('exitQuantity', { valueAsNumber: true })}
                  className={`h-11 ${closeErrors.exitQuantity ? 'border-rh-red' : ''}`}
                />
                {closeErrors.exitQuantity && (
                  <p className="text-sm text-rh-red">{closeErrors.exitQuantity.message}</p>
                )}
              </div>
            </div>

            {/* Exit Price */}
            <div className="space-y-2">
              <Label htmlFor="exitPrice" className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-zinc-400" />
                Exit Price
              </Label>
              <Input
                id="exitPrice"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="160.00"
                {...registerClose('exitPrice', { valueAsNumber: true })}
                className={`h-11 ${closeErrors.exitPrice ? 'border-rh-red' : ''}`}
              />
              {closeErrors.exitPrice && (
                <p className="text-sm text-rh-red">{closeErrors.exitPrice.message}</p>
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
                {...registerClose('exitNotes')}
                className="min-h-20 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-12 bg-rh-green hover:bg-rh-green-hover text-white font-semibold"
                disabled={isSubmittingClose || closeMutation.isPending || !isCloseDirty}
              >
                {closeMutation.isPending ? (
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
