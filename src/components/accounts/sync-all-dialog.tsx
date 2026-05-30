'use client';

import { useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SyncAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedAccountCount: number;
  disconnectedAccountCount: number;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onSync: () => void;
}

export function SyncAllDialog({
  open,
  onOpenChange,
  linkedAccountCount,
  disconnectedAccountCount,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSync,
}: SyncAllDialogProps) {
  const [preset, setPreset] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Sync All Accounts
          </DialogTitle>
          <DialogDescription>
            Force refresh {linkedAccountCount} connected linked account{linkedAccountCount !== 1 ? 's' : ''} and import transactions within the selected date range.
            {disconnectedAccountCount > 0
              ? ` Disconnected accounts (${disconnectedAccountCount}) are skipped automatically.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sync-start-date">Start Date</Label>
              <Input
                id="sync-start-date"
                type="date"
                value={startDate}
                onChange={(e) => { onStartDateChange(e.target.value); setPreset(null); }}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-end-date">End Date</Label>
              <Input
                id="sync-end-date"
                type="date"
                value={endDate}
                onChange={(e) => { onEndDateChange(e.target.value); setPreset(null); }}
                className="w-full"
              />
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-500">Quick Select</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Today', days: 0, special: 'today' },
                { label: 'This Week', days: 0, special: 'week' },
                { label: 'Last 7 days', days: 7, special: null },
                { label: 'Last 30 days', days: 30, special: null },
                { label: 'Last 90 days', days: 90, special: null },
                { label: 'YTD', days: 0, special: 'ytd' },
                { label: 'Last 6 months', days: 180, special: null },
                { label: 'Last year', days: 365, special: null },
                { label: 'Last 2 years', days: 730, special: null },
                { label: 'All time', days: 0, special: 'all' },
              ].map(({ label, days, special }) => (
                <Button
                  key={label}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'text-xs h-7',
                    preset === label
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:border-green-600 dark:text-green-400'
                      : ''
                  )}
                  onClick={() => {
                    const end = new Date();
                    let start: Date;
                    if (special === 'today') {
                      start = new Date(end);
                    } else if (special === 'week') {
                      start = new Date(end);
                      start.setDate(end.getDate() - end.getDay());
                    } else if (special === 'ytd') {
                      start = new Date(end.getFullYear(), 0, 1);
                    } else if (special === 'all') {
                      start = new Date(end.getFullYear() - 5, 0, 1);
                    } else {
                      start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
                    }
                    onStartDateChange(start.toISOString().split('T')[0]);
                    onEndDateChange(end.toISOString().split('T')[0]);
                    setPreset(label);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Info message */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                This will force refresh data from connected brokers first, then import any new transactions within the date range. Duplicate transactions are skipped.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSync}
            disabled={!startDate || !endDate}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Accounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
