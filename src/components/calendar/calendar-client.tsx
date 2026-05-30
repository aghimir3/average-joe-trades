'use client';

/**
 * CalendarClient — Main container for the Trading Calendar page.
 *
 * Combines month navigation, account selector, trade log table,
 * and monthly P&L calendar grid.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { useSelectedAccount } from '@/lib/hooks/use-selected-account';
import { AccountSelector } from '@/components/accounts/account-selector';
import { Button } from '@/components/ui/button';
import { CalendarTradeLog } from './calendar-trade-log';
import { CalendarMonthlyView } from './calendar-monthly-view';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarClient() {
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const goToPreviousMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="space-y-4 pb-8">
      {/* Header: Month nav + Account selector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousMonth}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 min-w-[160px] justify-center">
            <Calendar className="h-4 w-4 text-zinc-500" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {!isCurrentMonth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goToToday}
              className="text-xs ml-1"
            >
              Today
            </Button>
          )}
        </div>

        {/* Account selector */}
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onAccountChange={setSelectedAccountId}
          className="flex-1 min-w-50 max-w-md"
        />
      </motion.div>

      {/* Trade Log Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <CalendarTradeLog year={year} month={month} accountId={selectedAccountId} />
      </motion.div>

      {/* Monthly Calendar Grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <CalendarMonthlyView year={year} month={month} accountId={selectedAccountId} />
      </motion.div>
    </div>
  );
}
