'use client';

import { AlertTriangle, Link2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getBrokerInfo } from './broker';

interface OrphanedAccount {
  brokerageAccountId: string;
  brokerageAccountName: string;
  broker: string;
  transactionCount: number;
}

interface OrphanedAccountsBannerProps {
  orphanedAccounts: OrphanedAccount[];
  onRelinkBroker: (broker: string) => void;
  isRelinking: boolean;
}

export function OrphanedAccountsBanner({
  orphanedAccounts,
  onRelinkBroker,
  isRelinking,
}: OrphanedAccountsBannerProps) {
  if (orphanedAccounts.length === 0) return null;

  const byBroker = orphanedAccounts.reduce<
    Record<string, { count: number; transactionCount: number; accountNames: string[] }>
  >((acc, account) => {
    const brokerKey = account.broker;
    if (!acc[brokerKey]) {
      acc[brokerKey] = { count: 0, transactionCount: 0, accountNames: [] };
    }
    acc[brokerKey].count += 1;
    acc[brokerKey].transactionCount += account.transactionCount;
    acc[brokerKey].accountNames.push(account.brokerageAccountName);
    return acc;
  }, {});
  const brokerEntries = Object.entries(byBroker);

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20">
      <CardContent className="pt-4 pb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-3 flex-1">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {orphanedAccounts.length} linked account{orphanedAccounts.length === 1 ? '' : 's'} are disconnected
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/90 mt-1">
                Trades remain in your journal. Relink the missing brokerage login to restore live sync.
              </p>
            </div>

            <div className="space-y-2">
              {brokerEntries.map(([broker, summary]) => {
                const brokerLabel = getBrokerInfo(broker).label;
                const previewNames = summary.accountNames.slice(0, 2).join(', ');
                const remaining = summary.accountNames.length - 2;

                return (
                  <div
                    key={broker}
                    className="rounded-lg border border-amber-200/80 dark:border-amber-800/70 bg-white/70 dark:bg-zinc-950/30 px-3 py-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          {brokerLabel}: {summary.count} account{summary.count === 1 ? '' : 's'} disconnected
                        </p>
                        <p className="text-xs text-amber-700/90 dark:text-amber-300/90">
                          {previewNames}
                          {remaining > 0 ? ` (+${remaining} more)` : ''} - {summary.transactionCount} imported transaction{summary.transactionCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRelinkBroker(broker)}
                        disabled={isRelinking}
                        className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                      >
                        {isRelinking ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-3.5 w-3.5 mr-1.5" />
                            Relink {brokerLabel}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
