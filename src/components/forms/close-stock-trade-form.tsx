/**
 * Close Stock Trade Form Component
 *
 * Allows users to close an open stock position by entering exit details.
 * Calculates and displays estimated P&L before submission.
 *
 * Features:
 * - Real-time validation with zod
 * - P&L preview calculation
 * - Mobile-optimized design
 * - Loading state during submission
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { format, parse } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, Calendar, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { closeStockTradeSchema, type CloseStockTradeInput } from '@/lib/validations/close-trade';
import { createChildLogger } from '@/lib/logger';
import { getLocalDateString } from '@/lib/utils';

/** Convert Date to YYYY-MM-DD string for DatePicker */
function dateToString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') return date;
  return format(date, 'yyyy-MM-dd');
}

/** Convert YYYY-MM-DD string to Date for form field */
function stringToDate(str: string): Date {
  return parse(str, 'yyyy-MM-dd', new Date());
}

const formLogger = createChildLogger({ module: 'close-stock-trade-form' });

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  side: string;
  firstEntryDate: string;
}

interface CloseStockTradeFormProps {
  position: Position;
  onCancel?: () => void;
}

/**
 * Close an open stock position via API.
 */
async function closeStockTrade(positionId: string, data: CloseStockTradeInput) {
  const response = await fetch('/api/entries/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      positionId,
      type: 'stock',
      ...data,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to close trade'));
  }

  return apiData(await parseApiJson(response));
}

export function CloseStockTradeForm({ position, onCancel }: CloseStockTradeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Get today's date in YYYY-MM-DD format using local timezone
  const today = getLocalDateString();

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CloseStockTradeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(closeStockTradeSchema) as any,
    defaultValues: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exitDate: today as any,
    },
  });

  // Watch exit price for P&L calculation
  // eslint-disable-next-line react-hooks/incompatible-library
  const exitPrice = watch('exitPrice');

  // Calculate estimated P&L
  const estimatedPnL = useMemo(() => {
    if (!exitPrice || isNaN(exitPrice)) return null;
    const entryValue = position.quantity * position.avgPrice;
    const exitValue = position.quantity * exitPrice;
    return position.side === 'long' ? exitValue - entryValue : entryValue - exitValue;
  }, [exitPrice, position]);

  const mutation = useMutation({
    mutationFn: (data: CloseStockTradeInput) => closeStockTrade(position.id, data),
    onSuccess: () => {
      formLogger.info({ symbol: position.symbol }, 'Stock trade closed successfully');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to close stock trade');
      setError(err.message);
    },
  });

  const onSubmit = (data: CloseStockTradeInput) => {
    setError(null);
    formLogger.debug({ symbol: position.symbol }, 'Submitting stock trade close');
    mutation.mutate(data);
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Position Summary Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${position.side === 'long' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
              {position.side === 'long' ? (
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {position.symbol}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {position.side.charAt(0).toUpperCase() + position.side.slice(1)} Stock Position
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-5 w-5 text-zinc-400" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Shares</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {position.quantity.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Avg Cost</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${position.avgPrice.toFixed(2)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Cost Basis</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${(position.quantity * position.avgPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Close Trade Form */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
          Close Position
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Error display */}
          {error && (
            <div className="p-3 rounded-xl bg-rh-red/10 text-rh-red text-sm border border-rh-red/30">
              {error}
            </div>
          )}

          {/* Exit Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exitDate" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-zinc-400" />
                Exit Date
              </Label>
              <Controller
                name="exitDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="exitDate"
                    value={dateToString(field.value)}
                    onChange={(str) => field.onChange(stringToDate(str))}
                    maxDate={today}
                    placeholder="Select date"
                    className={`h-11 ${errors.exitDate ? 'border-rh-red' : ''}`}
                  />
                )}
              />
              {errors.exitDate && (
                <p className="text-sm text-rh-red">{errors.exitDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="exitTime" className="flex items-center gap-2 text-sm font-medium">
                Exit Time
              </Label>
              <Input
                id="exitTime"
                type="time"
                {...register('exitTime')}
                className="h-11"
                placeholder="09:30"
              />
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
              placeholder="0.00"
              {...register('exitPrice', { valueAsNumber: true })}
              className={`h-11 ${errors.exitPrice ? 'border-rh-red' : ''}`}
            />
            {errors.exitPrice && (
              <p className="text-sm text-rh-red">{errors.exitPrice.message}</p>
            )}
          </div>

          {/* P&L Preview */}
          {estimatedPnL !== null && (
            <div className={`p-4 rounded-xl ${estimatedPnL >= 0 ? 'bg-rh-green/10 border border-rh-green/30' : 'bg-rh-red/10 border border-rh-red/30'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-(--text-secondary)">
                  Estimated P&L
                </span>
                <span className={`text-xl font-bold ${estimatedPnL >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                  {estimatedPnL >= 0 ? '+' : ''}${estimatedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-xs text-(--text-muted) mt-1">
                Exit value: ${((exitPrice || 0) * position.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}

          {/* Closing Notes */}
          <div className="space-y-2">
            <Label htmlFor="closingNotes" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-zinc-400" />
              Closing Notes (Optional)
            </Label>
            <Textarea
              id="closingNotes"
              placeholder="Why did you close this trade? What did you learn?"
              {...register('closingNotes')}
              className="min-h-25 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1 h-12"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              className={`flex-1 h-12 font-semibold ${estimatedPnL !== null && estimatedPnL >= 0 ? 'bg-rh-green hover:bg-rh-green-hover' : 'bg-rh-red hover:bg-rh-red/90'} text-white`}
              disabled={isSubmitting || mutation.isPending}
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Closing...
                </span>
              ) : (
                'Close Position'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
