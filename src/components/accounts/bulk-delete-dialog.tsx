'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Eye,
  Loader2,
  Trash2,
} from 'lucide-react';
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
import { executeBulkDelete, previewBulkDelete } from './api';
import { getBrokerInfo } from './broker';
import type { BrokerageAccount, BulkDeletePreview } from './types';

interface BulkDeleteDialogProps {
  open: boolean;
  account: BrokerageAccount | null;
  onClose: () => void;
}

export function BulkDeleteDialog({ open, account, onClose }: BulkDeleteDialogProps) {
  const queryClient = useQueryClient();
  const [deleteStep, setDeleteStep] = useState<'select' | 'preview' | 'confirm' | 'success'>('select');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [preview, setPreview] = useState<BulkDeletePreview | null>(null);

  const reset = () => {
    setDeleteStep('select');
    setStartDate('');
    setEndDate('');
    setPreview(null);
    previewMutation.reset();
    deleteMutation.reset();
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const previewMutation = useMutation({
    mutationFn: ({ accountId, startDate: s, endDate: e }: { accountId: string; startDate: string; endDate: string }) =>
      previewBulkDelete(accountId, s, e),
    onSuccess: (data) => {
      setPreview(data);
      setDeleteStep('preview');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ accountId, startDate: s, endDate: e }: { accountId: string; startDate: string; endDate: string }) =>
      executeBulkDelete(accountId, s, e),
    onSuccess: () => {
      setDeleteStep('success');
      queryClient.invalidateQueries({ queryKey: ['brokerage-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* Step 1: Select Date Range */}
        {deleteStep === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-red-500" />
                Delete Trades by Date Range
              </DialogTitle>
              <DialogDescription>
                Remove trades from <span className="font-semibold">{account?.name}</span> within a specific date range.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Account Info Card */}
              <div className={cn(
                'p-3 rounded-lg border flex items-center gap-3',
                getBrokerInfo(account?.broker || '').bgColor,
                getBrokerInfo(account?.broker || '').borderColor
              )}>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', getBrokerInfo(account?.broker || '').color)}>
                  <Briefcase className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{account?.name}</p>
                  <p className="text-xs text-zinc-500">
                    {account?.stats.ledgerEventCount || 0} total trades
                  </p>
                </div>
              </div>

              {/* Date Range Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-start-date">Start Date</Label>
                  <Input
                    id="delete-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-end-date">End Date</Label>
                  <Input
                    id="delete-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-500">Quick Select</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Last 7 days', days: 7 },
                    { label: 'Last 30 days', days: 30 },
                    { label: 'Last 90 days', days: 90 },
                    { label: 'This year', days: -1 },
                    { label: 'Last year', days: -3 },
                    { label: 'All time', days: -2 },
                  ].map(({ label, days }) => (
                    <Button
                      key={label}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        const now = new Date();
                        let start: Date;
                        let end: Date = now;
                        if (days === -1) {
                          start = new Date(now.getFullYear(), 0, 1);
                        } else if (days === -3) {
                          start = new Date(now.getFullYear() - 1, 0, 1);
                          end = new Date(now.getFullYear() - 1, 11, 31);
                        } else if (days === -2) {
                          start = new Date(now.getFullYear() - 10, 0, 1);
                        } else {
                          start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                        }
                        setStartDate(start.toISOString().split('T')[0]);
                        setEndDate(end.toISOString().split('T')[0]);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {previewMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {previewMutation.error.message}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (account && startDate && endDate) {
                    previewMutation.mutate({
                      accountId: account.id,
                      startDate,
                      endDate,
                    });
                  }
                }}
                disabled={!startDate || !endDate || previewMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Deletion
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Preview */}
        {deleteStep === 'preview' && preview && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Review Deletion
              </DialogTitle>
              <DialogDescription>
                The following trades will be permanently deleted. Please review carefully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.counts.total}</p>
                  <p className="text-xs text-zinc-500">Total Trades</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{preview.counts.stocks}</p>
                  <p className="text-xs text-zinc-500">Stocks</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-600">{preview.counts.options}</p>
                  <p className="text-xs text-zinc-500">Options</p>
                </div>
              </div>

              {/* Date Range Info */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Date Range:</span>
                  <span className="font-medium">
                    {preview.dateRange.actual.start || preview.dateRange.requested.start} to {preview.dateRange.actual.end || preview.dateRange.requested.end}
                  </span>
                </div>
              </div>

              {/* Sample Trades */}
              {preview.sampleEvents.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Sample of trades to be deleted:</Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {preview.sampleEvents.map((event) => (
                      <div
                        key={event.id}
                        className="text-xs p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-100 dark:border-zinc-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{event.symbol}</span>
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            event.type === 'option' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          )}>
                            {event.type}
                          </span>
                        </div>
                        <div className="text-zinc-500">
                          {event.transCode} · {event.quantity} @ ${event.price?.toFixed(2) || '-'} · {event.date}
                        </div>
                      </div>
                    ))}
                  </div>
                  {preview.counts.total > 5 && (
                    <p className="text-xs text-zinc-400 text-center">
                      ...and {preview.counts.total - 5} more trades
                    </p>
                  )}
                </div>
              )}

              {/* Warning */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      This action is permanent
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      These trades will be permanently removed from your account. Your positions and P&L will be recalculated after deletion.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteStep('select')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => setDeleteStep('confirm')}
                disabled={preview.counts.total === 0}
                className="bg-red-600 hover:bg-red-700"
              >
                Continue to Delete
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Final Confirmation */}
        {deleteStep === 'confirm' && preview && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Confirm Deletion
              </DialogTitle>
            </DialogHeader>

            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Delete {preview.counts.total} trades?
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  From {account?.name}
                </p>
                <p className="text-xs text-zinc-400 mt-2">
                  {preview.dateRange.requested.start} to {preview.dateRange.requested.end}
                </p>
              </div>

              {/* Error Message */}
              {deleteMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-left">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {deleteMutation.error.message}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteStep('preview')} disabled={deleteMutation.isPending}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => {
                  if (account && startDate && endDate) {
                    deleteMutation.mutate({
                      accountId: account.id,
                      startDate,
                      endDate,
                    });
                  }
                }}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Yes, Delete {preview.counts.total} Trades
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 4: Success */}
        {deleteStep === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
                Trades Deleted Successfully
              </DialogTitle>
            </DialogHeader>

            <div className="py-6 text-center space-y-4">
              <p className="text-sm text-zinc-500">
                {preview?.counts.total || 0} trades have been removed from {account?.name}.
                Your positions and P&L have been recalculated.
              </p>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Your dashboard will reflect the updated data.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleClose}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
