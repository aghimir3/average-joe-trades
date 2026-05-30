/**
 * Option trade entry form component.
 *
 * Supports single-leg strategies (MVP) with the ability to extend
 * to multi-leg strategies in the future. Follows Robinhood's
 * options order entry UX.
 *
 * Features:
 * - Strategy-aware form fields
 * - Dynamic leg entry for multi-leg strategies
 * - Real-time P&L preview
 * - Mobile-optimized layout
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { format, parse } from 'date-fns';
import { Plus, Trash2, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect as Select } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { createOptionTradeSchema, type CreateOptionTradeInput } from '@/lib/validations/trade';
import { createChildLogger } from '@/lib/logger';
import { getLocalDateString } from '@/lib/utils';
import type { OptionStrategy, LegType, LegAction } from '@/db/constants';

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

const formLogger = createChildLogger({ module: 'option-trade-form' });

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
 * Default leg configuration based on strategy.
 * MVP strategies are single-leg for simplicity.
 */
const STRATEGY_DEFAULT_LEGS: Record<string, { legType: LegType; action: LegAction }[]> = {
  long_call: [{ legType: 'call', action: 'buy' }],
  long_put: [{ legType: 'put', action: 'buy' }],
  covered_call: [{ legType: 'call', action: 'sell' }],
  cash_secured_put: [{ legType: 'put', action: 'sell' }],
  // Multi-leg strategies (future)
  call_debit_spread: [
    { legType: 'call', action: 'buy' },
    { legType: 'call', action: 'sell' },
  ],
  put_debit_spread: [
    { legType: 'put', action: 'buy' },
    { legType: 'put', action: 'sell' },
  ],
};

interface OptionTradeFormProps {
  strategy: OptionStrategy;
}

/**
 * Create a new option trade via API.
 * Posts to /api/entries which creates LedgerEvent records.
 */
async function createOptionTrade(data: CreateOptionTradeInput) {
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

export function OptionTradeForm({ strategy }: OptionTradeFormProps) {
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

  // Get default legs for this strategy
  const defaultLegs = STRATEGY_DEFAULT_LEGS[strategy] || [{ legType: 'call' as const, action: 'buy' as const }];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOptionTradeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createOptionTradeSchema) as any,
    defaultValues: {
      type: 'option',
      strategy,
      ticker: prefilledSymbol?.toUpperCase() || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entryDate: today as any,
      quantity: 1,
      entryPrice: 0,
      optionLegs: defaultLegs.map((leg) => ({
        ...leg,
        strike: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiration: today as any,
        premium: 0,
        quantity: 1,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'optionLegs',
  });

  const mutation = useMutation({
    mutationFn: createOptionTrade,
    onSuccess: () => {
      formLogger.info({ strategy }, 'Option trade created successfully');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      formLogger.error({ error: err, strategy }, 'Failed to create option trade');
      setError(err.message);
    },
  });

  const onSubmit = (data: CreateOptionTradeInput) => {
    setError(null);
    formLogger.debug({ ticker: data.ticker, strategy: data.strategy }, 'Submitting option trade');

    // Calculate total quantity from all legs (use max for spreads, sum for others)
    const totalQuantity = Math.max(...data.optionLegs.map(leg => leg.quantity));

    // Calculate total entry price from legs (net debit/credit)
    let netPremium = 0;
    for (const leg of data.optionLegs) {
      if (leg.action === 'buy') {
        netPremium -= leg.premium * leg.quantity;
      } else {
        netPremium += leg.premium * leg.quantity;
      }
    }

    // Use absolute value for entry price (debit is positive cost)
    const submitData = {
      ...data,
      quantity: totalQuantity,
      entryPrice: Math.abs(netPremium),
    };

    mutation.mutate(submitData);
  };

  const strategyLabel = STRATEGY_LABELS[strategy] || strategy;
  const isSingleLeg = defaultLegs.length === 1;

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-xl text-center">
          {isScaleIn ? 'Scale In' : strategyLabel}
        </CardTitle>
        {isScaleIn ? (
          <div className="flex items-center justify-center gap-2 mt-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <ArrowDownToLine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Adding to <span className="font-semibold">{prefilledSymbol}</span> {strategyLabel.toLowerCase()} position
            </span>
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-500">
            Enter your option trade details
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Hidden fields */}
          <input type="hidden" {...register('type')} value="option" />
          <input type="hidden" {...register('strategy')} value={strategy} />

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-rh-red/10 text-rh-red text-sm">
              {error}
            </div>
          )}

          {/* Ticker */}
          <div className="space-y-2">
            <Label htmlFor="ticker">Underlying Symbol</Label>
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

          {/* Underlying Stock Price */}
          <div className="space-y-2">
            <Label htmlFor="underlyingPrice">Stock Price at Entry (Optional)</Label>
            <Input
              id="underlyingPrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="150.00"
              {...register('underlyingPrice', { valueAsNumber: true })}
            />
            <p className="text-xs text-zinc-500">The underlying stock price when you entered this trade</p>
          </div>

          {/* Option Legs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Option Legs</Label>
              {!isSingleLeg && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    append({
                      legType: 'call',
                      action: 'buy',
                      strike: 0,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      expiration: today as any,
                      premium: 0,
                      quantity: 1,
                    })
                  }
                  className="text-rh-green"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Leg
                </Button>
              )}
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border border-zinc-200 rounded-lg space-y-4 dark:border-zinc-700"
              >
                {fields.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-500">
                      Leg {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      className="text-rh-red h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Leg Type and Action */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      {...register(`optionLegs.${index}.legType`)}
                      options={[
                        { value: 'call', label: 'Call' },
                        { value: 'put', label: 'Put' },
                      ]}
                      disabled={isSingleLeg}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select
                      {...register(`optionLegs.${index}.action`)}
                      options={[
                        { value: 'buy', label: 'Buy' },
                        { value: 'sell', label: 'Sell' },
                      ]}
                      disabled={isSingleLeg}
                    />
                  </div>
                </div>

                {/* Strike and Expiration */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Strike Price</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="150"
                      {...register(`optionLegs.${index}.strike`, { valueAsNumber: true })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Expiration</Label>
                    <Controller
                      name={`optionLegs.${index}.expiration`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          value={dateToString(field.value)}
                          onChange={(str) => field.onChange(stringToDate(str))}
                          minDate={today}
                          placeholder="Select exp"
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Premium and Quantity */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Premium</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="5.00"
                      {...register(`optionLegs.${index}.premium`, { valueAsNumber: true })}
                    />
                    <p className="text-xs text-zinc-500">Per contract</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Contracts</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="1"
                      {...register(`optionLegs.${index}.quantity`, { valueAsNumber: true })}
                    />
                  </div>
                </div>
              </div>
            ))}
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
          <div className="pt-2 pb-4">
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
                `Add ${strategyLabel}`
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
