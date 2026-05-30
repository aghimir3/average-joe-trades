/**
 * Close Option Trade Form Component
 *
 * Allows users to close an open option position by entering exit details.
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

import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { format, parse } from 'date-fns';
import { DollarSign, Calendar, FileText, X, Zap, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { closeOptionTradeSchema, type CloseOptionTradeInput } from '@/lib/validations/close-trade';
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

const formLogger = createChildLogger({ module: 'close-option-trade-form' });

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  side: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
  strategy: string | null;
  firstEntryDate: string;
}

interface CloseOptionTradeFormProps {
  position: Position;
  onCancel?: () => void;
}

/**
 * Close an open option position via API.
 */
async function closeOptionTrade(positionId: string, data: CloseOptionTradeInput) {
  const response = await fetch('/api/entries/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      positionId,
      type: 'option',
      ...data,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to close trade'));
  }

  return apiData(await parseApiJson(response));
}

/**
 * Format strategy name for display.
 */
function formatStrategy(strategy: string | null): string {
  if (!strategy) return 'Option';
  return strategy
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format expiration date.
 */
function formatExpiration(expiration: string | null): string {
  if (!expiration) return 'N/A';
  const date = new Date(expiration);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CloseOptionTradeForm({ position, onCancel }: CloseOptionTradeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Get today's date in YYYY-MM-DD format using local timezone
  const today = getLocalDateString();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CloseOptionTradeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(closeOptionTradeSchema) as any,
    defaultValues: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exitDate: today as any,
      optionLegs: [{ id: position.id, exitPremium: 0 }],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'optionLegs',
  });

  // Watch exit premium for P&L calculation
  // eslint-disable-next-line react-hooks/incompatible-library
  const optionLegs = watch('optionLegs');
  const exitPremium = optionLegs?.[0]?.exitPremium;

  // Calculate estimated P&L
  const estimatedPnL = useMemo(() => {
    if (!exitPremium || isNaN(exitPremium)) return null;
    const entryPremium = position.avgPrice;
    const quantity = position.quantity;

    if (position.side === 'long') {
      // Long option: profit when exit > entry
      return (exitPremium - entryPremium) * quantity * 100;
    } else {
      // Short option: profit when entry > exit
      return (entryPremium - exitPremium) * quantity * 100;
    }
  }, [exitPremium, position]);

  const mutation = useMutation({
    mutationFn: (data: CloseOptionTradeInput) => closeOptionTrade(position.id, data),
    onSuccess: () => {
      formLogger.info({ symbol: position.symbol }, 'Option trade closed successfully');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to close option trade');
      setError(err.message);
    },
  });

  const onSubmit = (data: CloseOptionTradeInput) => {
    setError(null);
    formLogger.debug({ symbol: position.symbol }, 'Submitting option trade close');
    mutation.mutate(data);
  };

  const isCall = position.optionType === 'call';

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Position Summary Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isCall ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
              <Zap className={`h-5 w-5 ${isCall ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {position.symbol}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatStrategy(position.strategy)}
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

        {/* Option Details */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${position.side === 'long' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
            {position.side === 'long' ? 'Long' : 'Short'}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${isCall ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
            {position.optionType?.toUpperCase()}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            ${position.strike?.toFixed(2)} Strike
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Exp: {formatExpiration(position.expiration)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Contracts</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {position.quantity}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Avg Premium</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${position.avgPrice.toFixed(2)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              {position.side === 'long' ? 'Cost' : 'Credit'}
            </p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              ${(position.quantity * position.avgPrice * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          {/* Exit Premium */}
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-2">
              <input type="hidden" {...register(`optionLegs.${index}.id`)} />
              <Label htmlFor={`exitPremium-${index}`} className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-zinc-400" />
                Exit Premium (per contract)
              </Label>
              <Input
                id={`exitPremium-${index}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                {...register(`optionLegs.${index}.exitPremium`, { valueAsNumber: true })}
                className={`h-11 ${errors.optionLegs?.[index]?.exitPremium ? 'border-rh-red' : ''}`}
              />
              {errors.optionLegs?.[index]?.exitPremium && (
                <p className="text-sm text-rh-red">{errors.optionLegs[index].exitPremium?.message}</p>
              )}
              <p className="text-xs text-zinc-400">
                {position.side === 'long' ? 'Enter the premium you received when selling to close.' : 'Enter the premium you paid to buy back the option.'}
              </p>
            </div>
          ))}

          {/* Stock Price at Exit */}
          <div className="space-y-2">
            <Label htmlFor="exitUnderlyingPrice" className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-zinc-400" />
              Stock Price at Exit (Optional)
            </Label>
            <Input
              id="exitUnderlyingPrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder={position.strike ? position.strike.toFixed(2) : '0.00'}
              {...register('exitUnderlyingPrice', { valueAsNumber: true })}
              className={`h-11 ${errors.exitUnderlyingPrice ? 'border-rh-red' : ''}`}
            />
            {errors.exitUnderlyingPrice && (
              <p className="text-sm text-rh-red">{errors.exitUnderlyingPrice.message}</p>
            )}
            <p className="text-xs text-zinc-400">
              Record the underlying {position.symbol} stock price when you closed this option.
            </p>
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
                {position.side === 'long'
                  ? `Exit value: $${((exitPremium || 0) * position.quantity * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `Buyback cost: $${((exitPremium || 0) * position.quantity * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
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
