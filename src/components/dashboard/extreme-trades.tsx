'use client';

/**
 * Extreme Trades Component
 *
 * Displays biggest wins and biggest losses.
 */

import { Trophy, AlertTriangle } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { formatSignedCurrency } from '@/lib/utils';

interface ExtremeTrade {
  id: string;
  symbol: string;
  type: string;
  pnl: number;
  date: string;
}

interface ExtremeTradesProps {
  biggestWins: ExtremeTrade[];
  biggestLosses: ExtremeTrade[];
}


export function ExtremeTrades({ biggestWins, biggestLosses }: ExtremeTradesProps) {
  const hasData = biggestWins.length > 0 || biggestLosses.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Extreme Trades
          </h2>
          <HelpTooltip
            title="Extreme Trades"
            description="Your biggest winning and losing trades. Use this to understand your best and worst performances."
          />
        </div>
        <p className="text-zinc-500 text-center py-8">
          No closed trades yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Biggest Wins */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-rh-green" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Biggest Wins
          </h2>
          <HelpTooltip
            title="Biggest Wins"
            description="Your most profitable closed trades. Analyze what made these trades successful to replicate the strategy."
          />
        </div>

        {biggestWins.length === 0 ? (
          <p className="text-zinc-500 text-center py-4">No winning trades yet</p>
        ) : (
          <div className="space-y-2">
            {biggestWins.map((trade, index) => (
              <div
                key={trade.id}
                className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rh-green text-white text-xs font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {trade.symbol}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {trade.type} · {trade.date}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-rh-green">
                  {formatSignedCurrency(trade.pnl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Biggest Losses */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-rh-red" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Biggest Losses
          </h2>
          <HelpTooltip
            title="Biggest Losses"
            description="Your largest losing trades. Study these to understand what went wrong and avoid similar mistakes."
          />
        </div>

        {biggestLosses.length === 0 ? (
          <p className="text-zinc-500 text-center py-4">No losing trades yet</p>
        ) : (
          <div className="space-y-2">
            {biggestLosses.map((trade, index) => (
              <div
                key={trade.id}
                className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-rh-red text-white text-xs font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {trade.symbol}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {trade.type} · {trade.date}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-rh-red">
                  {formatSignedCurrency(trade.pnl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
