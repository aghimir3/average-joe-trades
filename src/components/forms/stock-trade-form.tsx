/**
 * Stock trade entry form component.
 *
 * Allows users to enter stock trade details following Robinhood's
 * order entry UX - clean, minimal, focused on essential fields.
 *
 * Features:
 * - Real-time validation with zod
 * - Robinhood-green accent on focus
 * - Mobile-optimized touch targets
 * - Loading state during submission
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { format, parse } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { createStockTradeSchema, type CreateStockTradeInput } from '@/lib/validations/trade';
import { createChildLogger } from '@/lib/logger';
import { getLocalDateString } from '@/lib/utils';

/** Convert Date to YYYY-MM-DD string for DatePicker */
function dateToString(date: unknown): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') return date;
  if (date instanceof Date) return format(date, 'yyyy-MM-dd');
  return undefined;
}

/** Convert YYYY-MM-DD string to Date for form field */
function stringToDate(str: string): Date {
  return parse(str, 'yyyy-MM-dd', new Date());
}

const formLogger = createChildLogger({ module: 'stock-trade-form' });

/**
 * Create a new stock trade via API.
 * Posts to /api/entries which creates a LedgerEvent.
 */
async function createStockTrade(data: CreateStockTradeInput) {
  const response = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to create trade'));
  }

  return apiData(await parseApiJson(response));
}

export function StockTradeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Check if this is a Scale In operation
  const scaleInPositionId = searchParams.get('scaleIn');
  const prefilledSymbol = searchParams.get('symbol');
  const isScaleIn = !!scaleInPositionId && !!prefilledSymbol;

  // Get today's date in YYYY-MM-DD format using local timezone
  const today = getLocalDateString();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createStockTradeSchema),
    defaultValues: {
      type: 'stock' as const,
      ticker: prefilledSymbol?.toUpperCase() || '',
      entryDate: today,
      quantity: 1,
      entryPrice: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: createStockTrade,
    onSuccess: () => {
      formLogger.info('Stock trade created successfully');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err }, 'Failed to create stock trade');
      setError(err.message);
    },
  });

  const onSubmit = (data: CreateStockTradeInput) => {
    setError(null);
    formLogger.debug({ ticker: data.ticker }, 'Submitting stock trade');
    mutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-xl text-center">
          {isScaleIn ? 'Scale In' : 'New Stock Trade'}
        </CardTitle>
        {isScaleIn && (
          <div className="flex items-center justify-center gap-2 mt-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Adding to <span className="font-semibold">{prefilledSymbol}</span> position
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Hidden type field */}
          <input type="hidden" {...register('type')} value="stock" />

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-rh-red/10 text-rh-red text-sm">
              {error}
            </div>
          )}

          {/* Ticker */}
          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker Symbol</Label>
            <Input
              id="ticker"
              placeholder="AAPL"
              {...register('ticker')}
              className={errors.ticker ? 'border-rh-red' : isScaleIn ? 'bg-zinc-100 dark:bg-zinc-800' : ''}
              readOnly={isScaleIn}
            />
            {errors.ticker && (
              <p className="text-sm text-rh-red">{errors.ticker.message}</p>
            )}
          </div>

          {/* Entry Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryDate">Entry Date</Label>
              <Controller
                name="entryDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="entryDate"
                    value={dateToString(field.value)}
                    onChange={(str) => field.onChange(stringToDate(str))}
                    maxDate={today}
                    placeholder="Select date"
                    className={errors.entryDate ? 'border-rh-red' : ''}
                  />
                )}
              />
              {errors.entryDate && (
                <p className="text-sm text-rh-red">{errors.entryDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="entryTime">Time (Optional)</Label>
              <Input
                id="entryTime"
                type="time"
                {...register('entryTime')}
                placeholder="09:30"
              />
            </div>
          </div>

          {/* Quantity and Price Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Shares</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                placeholder="100"
                {...register('quantity', { valueAsNumber: true })}
                className={errors.quantity ? 'border-rh-red' : ''}
              />
              {errors.quantity && (
                <p className="text-sm text-rh-red">{errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryPrice">Entry Price</Label>
              <Input
                id="entryPrice"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="150.00"
                {...register('entryPrice', { valueAsNumber: true })}
                className={errors.entryPrice ? 'border-rh-red' : ''}
              />
              {errors.entryPrice && (
                <p className="text-sm text-rh-red">{errors.entryPrice.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="openingNotes">Notes (Optional)</Label>
            <Textarea
              id="openingNotes"
              placeholder="Why did you enter this trade?"
              {...register('openingNotes')}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-12 bg-rh-green hover:bg-rh-green-hover text-white font-semibold"
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
                Saving...
              </span>
            ) : isScaleIn ? (
              'Add Entry'
            ) : (
              'Add Stock Trade'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
