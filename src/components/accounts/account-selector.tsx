/**
 * Account Selector Component
 *
 * A Robinhood-style dropdown to select which brokerage account to view.
 * Mobile-friendly with full-width design and clear visual hierarchy.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Check, Plus, Settings, Wallet } from 'lucide-react';
import Link from 'next/link';
import { cn, formatSignedCurrency } from '@/lib/utils';
import { fetchAccounts } from './api';
import { getBrokerInfo } from './broker';

interface AccountSelectorProps {
  selectedAccountId: string | null;
  onAccountChange: (accountId: string | null) => void;
  className?: string;
  /** Compact mode for inline use - shows shorter text */
  compact?: boolean;
}

export function AccountSelector({
  selectedAccountId,
  onAccountChange,
  className,
  compact = false,
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['brokerage-accounts'],
    queryFn: fetchAccounts,
  });

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)
    : null;

  // In compact mode, show shorter labels
  const displayName = selectedAccount
    ? selectedAccount.name
    : compact
      ? 'All'
      : 'All Accounts';
  const brokerInfo = selectedAccount
    ? getBrokerInfo(selectedAccount.broker)
    : null;

  // Calculate total P&L across all accounts for "All Accounts" view
  const totalPnL = accounts.reduce((sum, acc) => sum + (acc.stats?.totalRealizedPnL || 0), 0);
  const displayPnL = selectedAccount?.stats?.totalRealizedPnL ?? totalPnL;

  // Don't show selector if there are no accounts
  if (!isLoading && accounts.length === 0) {
    return null;
  }

  const handleSelect = (accountId: string | null) => {
    onAccountChange(accountId);
    setIsOpen(false);
  };

  // Single account - show a simple display card (no dropdown needed)
  if (accounts.length === 1) {
    const account = accounts[0];
    const info = getBrokerInfo(account.broker);
    const pnl = account.stats?.totalRealizedPnL || 0;

    return (
      <div className={cn('relative', className)}>
        <div
          className={cn(
            'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl',
            'bg-white dark:bg-zinc-900 border',
            'border-zinc-200 dark:border-zinc-800'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            <div
              className={cn(
                'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                info.color
              )}
            >
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col items-start min-w-0 flex-1">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate w-full leading-tight">
                {account.name}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight truncate w-full">
                {info.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                'text-sm font-semibold',
                pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {formatSignedCurrency(pnl)}
            </span>
            <Link
              href="/accounts"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Manage accounts"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Trigger Button - Compact style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'flex items-center justify-between gap-2.5 rounded-xl transition-all',
          'bg-white dark:bg-zinc-900 border',
          isOpen
            ? 'border-emerald-500 shadow-md shadow-emerald-500/10'
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700',
          'active:scale-[0.99]',
          compact ? 'px-2.5 py-1.5 w-auto' : 'px-3 py-2 w-full'
        )}
      >
        <div className={cn(
          'flex items-center min-w-0 overflow-hidden',
          compact ? 'gap-2' : 'gap-2.5 flex-1'
        )}>
          {/* Account Icon */}
          <div
            className={cn(
              'shrink-0 rounded-full flex items-center justify-center',
              selectedAccount
                ? brokerInfo?.color
                : 'bg-linear-to-br from-emerald-500 to-blue-500',
              compact ? 'w-6 h-6' : 'w-8 h-8'
            )}
          >
            <Wallet className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', 'text-white')} />
          </div>

          {/* Account Info */}
          {compact ? (
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
              {isLoading ? '...' : displayName}
            </span>
          ) : (
            <div className="flex flex-col items-start min-w-0 flex-1">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate w-full leading-tight">
                {isLoading ? 'Loading...' : displayName}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight truncate w-full">
                {selectedAccount ? brokerInfo?.label : `${accounts.length} accounts`}
              </span>
            </div>
          )}
        </div>

        {/* P&L and Chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!compact && (
            <span
              className={cn(
                'text-sm font-semibold',
                displayPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {formatSignedCurrency(displayPnL)}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-zinc-400 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Dropdown Sheet */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Content */}
          <div
            className={cn(
              'absolute left-0 right-0 z-50 mt-1.5',
              'bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800',
              'shadow-lg shadow-black/10 dark:shadow-black/30',
              'overflow-hidden',
              // Desktop: auto-width to fit content
              'md:left-0 md:right-auto md:min-w-70 md:w-auto md:max-w-100'
            )}
          >
            {/* All Accounts Option */}
            <button
              onClick={() => handleSelect(null)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors',
                'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                !selectedAccountId && 'bg-emerald-50 dark:bg-emerald-950/30'
              )}
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-emerald-500 to-blue-500 flex items-center justify-center shrink-0">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  All Accounts
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {accounts.length} accounts combined
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-xs font-medium',
                    totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatSignedCurrency(totalPnL)}
                </span>
                {!selectedAccountId && (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
              </div>
            </button>

            {/* Divider */}
            <div className="h-px bg-zinc-200 dark:bg-zinc-800 mx-3" />

            {/* Individual Accounts */}
            <div className="max-h-56 overflow-y-auto">
              {accounts.map((account) => {
                const info = getBrokerInfo(account.broker);
                const isSelected = selectedAccountId === account.id;
                const pnl = account.stats?.totalRealizedPnL || 0;

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelect(account.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors',
                      'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                      isSelected && 'bg-emerald-50 dark:bg-emerald-950/30'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        info.color
                      )}
                    >
                      <Wallet className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex flex-col items-start flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {account.name}
                        </span>
                        {account.isDefault && (
                          <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-medium shrink-0">
                            Default
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {info.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {formatSignedCurrency(pnl)}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="h-px bg-zinc-200 dark:bg-zinc-800 mx-3" />
            <div className="p-1.5 flex gap-1.5">
              <Link
                href="/accounts"
                onClick={() => setIsOpen(false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Manage
              </Link>
              <Link
                href="/accounts"
                onClick={() => setIsOpen(false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Account
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
