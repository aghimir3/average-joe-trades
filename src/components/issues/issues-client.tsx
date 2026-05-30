/**
 * Issues Client Component
 *
 * Displays import issues and provides resolution UI.
 * Handles unknown basis issues with form to provide missing open position data.
 * Mobile-first responsive design.
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Info,
  ArrowRight,
  DollarSign,
  Calendar,
  Hash,
  X,
  Filter,
  Trash2,
} from 'lucide-react';

interface ImportIssue {
  id: string;
  issueType: string;
  severity: string;
  symbol: string | null;
  message: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  ledgerEventId: string | null;
}

interface IssueDetail extends ImportIssue {
  details: Record<string, unknown>;
  relatedClose: {
    id: string;
    symbol: string;
    closeType: string;
    side: string;
    quantity: string;
    closeDate: string;
    closePrice: string;
    closeAmount: string;
    closeReason: string;
    optionType: string | null;
    strike: string | null;
    expiration: string | null;
  } | null;
  relatedEvent: {
    id: string;
    activityDate: string;
    symbol: string;
    transCode: string;
    quantity: string;
    price: string | null;
    amount: string | null;
    isOption: boolean;
    optionType: string | null;
    strike: string | null;
    expiration: string | null;
    instrument: string;
    description: string | null;
  } | null;
}

interface IssuesResponse {
  data: ImportIssue[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  summary: {
    total: number;
    unresolved: number;
    byType: Record<string, number>;
  };
}

/**
 * Fetch issues list.
 */
async function fetchIssues(isResolved?: boolean): Promise<IssuesResponse> {
  const params = new URLSearchParams();
  if (isResolved !== undefined) {
    params.set('isResolved', String(isResolved));
  }
  params.set('limit', '50');

  const response = await fetch(`/api/issues?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch issues');
  }
  return apiData(await parseApiJson(response));
}

/**
 * Fetch single issue detail.
 */
async function fetchIssueDetail(id: string): Promise<{ data: IssueDetail }> {
  const response = await fetch(`/api/issues/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch issue details');
  }
  return apiData(await parseApiJson(response));
}

/**
 * Resolve unknown basis issue.
 */
async function resolveUnknownBasis(
  id: string,
  data: { openDate: Date; openPrice: number; notes?: string }
): Promise<{ data: { resolved: boolean; newPnL: number; message: string } }> {
  const response = await fetch(`/api/issues/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'resolve_unknown_basis',
      openDate: data.openDate.toISOString(),
      openPrice: data.openPrice,
      notes: data.notes,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to resolve issue'));
  }
  return apiData(await parseApiJson(response));
}

/**
 * Dismiss an issue with a reason.
 */
async function dismissIssue(
  id: string,
  reason: string
): Promise<{ data: { dismissed: boolean; message: string } }> {
  const response = await fetch(`/api/issues/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'dismiss',
      reason,
    }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to dismiss issue'));
  }
  return apiData(await parseApiJson(response));
}

/**
 * Bulk dismiss all unresolved issues with a reason.
 */
async function bulkDismissIssues(
  reason: string
): Promise<{ data: { dismissedCount: number; message: string } }> {
  const response = await fetch('/api/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to dismiss issues'));
  }
  return apiData(await parseApiJson(response));
}

export function IssuesClient() {
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [resolutionForm, setResolutionForm] = useState<{
    openDate: string;
    openPrice: string;
    notes: string;
  }>({
    openDate: '',
    openPrice: '',
    notes: '',
  });

  // Dismiss dialog state
  const [issueToDismiss, setIssueToDismiss] = useState<ImportIssue | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  // Bulk dismiss dialog state
  const [showBulkDismiss, setShowBulkDismiss] = useState(false);
  const [bulkDismissReason, setBulkDismissReason] = useState('');

  // Fetch issues
  const { data: issuesResponse, isLoading } = useQuery({
    queryKey: ['issues', showResolved],
    queryFn: () => fetchIssues(showResolved ? undefined : false),
  });

  // Fetch selected issue detail
  const { data: issueDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['issue-detail', selectedIssue],
    queryFn: () => (selectedIssue ? fetchIssueDetail(selectedIssue) : null),
    enabled: !!selectedIssue,
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIssue || !resolutionForm.openDate || !resolutionForm.openPrice) {
        throw new Error('Please fill in all required fields');
      }
      // Convert YYYY-MM-DD string to Date for API call
      const openDate = new Date(resolutionForm.openDate + 'T12:00:00Z');
      return resolveUnknownBasis(selectedIssue, {
        openDate,
        openPrice: parseFloat(resolutionForm.openPrice),
        notes: resolutionForm.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSelectedIssue(null);
      setResolutionForm({ openDate: '', openPrice: '', notes: '' });
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!issueToDismiss || !dismissReason || dismissReason.length < 10) {
        throw new Error('Please provide a reason (at least 10 characters)');
      }
      return dismissIssue(issueToDismiss.id, dismissReason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      setIssueToDismiss(null);
      setDismissReason('');
    },
  });

  // Bulk dismiss mutation
  const bulkDismissMutation = useMutation({
    mutationFn: async () => {
      if (!bulkDismissReason || bulkDismissReason.length < 10) {
        throw new Error('Please provide a reason (at least 10 characters)');
      }
      return bulkDismissIssues(bulkDismissReason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      setShowBulkDismiss(false);
      setBulkDismissReason('');
    },
  });

  const issues = issuesResponse?.data || [];
  const summary = issuesResponse?.summary;

  const getSeverityIcon = (severity: string, size: 'sm' | 'md' = 'sm') => {
    const sizeClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
    switch (severity) {
      case 'error':
        return <AlertCircle className={`${sizeClass} text-red-500`} />;
      case 'warning':
        return <AlertTriangle className={`${sizeClass} text-amber-500`} />;
      default:
        return <Info className={`${sizeClass} text-blue-500`} />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'error':
        return <Badge variant="destructive" className="text-xs">Error</Badge>;
      case 'warning':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-xs">
            Warning
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-xs">Info</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (value: string | number | null) => {
    if (value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `$${num.toFixed(2)}`;
  };

  const detail = issueDetail?.data;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Stats - Mobile: 2x2 grid, Desktop: 4 columns */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {summary?.unresolved || 0}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">Unresolved</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-amber-600">
              {summary?.byType?.['unknown_basis'] || 0}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">Unknown Basis</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-red-600">
              {summary?.byType?.['parse_error'] || 0}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">Parse Errors</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-green-600">
              {(summary?.total || 0) - (summary?.unresolved || 0)}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">Resolved</p>
          </div>
        </Card>
      </div>

      {/* Issues List */}
      <Card>
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base sm:text-lg">
              {showResolved ? 'All Issues' : 'Unresolved Issues'}
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {(summary?.unresolved ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkDismiss(true)}
                  className="w-full sm:w-auto text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Dismiss All ({summary?.unresolved})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResolved(!showResolved)}
                className="w-full sm:w-auto"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showResolved ? 'Hide Resolved' : 'Show All'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : issues.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 sm:h-16 sm:w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                {showResolved ? 'No issues found' : 'All issues resolved!'}
              </p>
              <p className="text-sm text-zinc-500 mt-2">
                Your trade data is complete
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  getSeverityIcon={getSeverityIcon}
                  getSeverityBadge={getSeverityBadge}
                  formatDate={formatDate}
                  onResolve={() => setSelectedIssue(issue.id)}
                  onDismiss={() => setIssueToDismiss(issue)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolve Unknown Basis</DialogTitle>
            <DialogDescription>
              Provide the original purchase information for this position
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Close Event Info */}
              <div className="p-3 sm:p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Close Transaction Details
                </p>
                {detail.relatedEvent && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-zinc-500 text-xs">Symbol</span>
                      <p className="font-medium">{detail.relatedEvent.symbol}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Date</span>
                      <p className="font-medium">
                        {formatDate(detail.relatedEvent.activityDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Action</span>
                      <p className="font-medium">{detail.relatedEvent.transCode}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Quantity</span>
                      <p className="font-medium">{detail.relatedEvent.quantity}</p>
                    </div>
                    {detail.relatedEvent.price && (
                      <div>
                        <span className="text-zinc-500 text-xs">Close Price</span>
                        <p className="font-medium">
                          {formatCurrency(detail.relatedEvent.price)}
                        </p>
                      </div>
                    )}
                    {detail.relatedEvent.amount && (
                      <div>
                        <span className="text-zinc-500 text-xs">Close Amount</span>
                        <p className="font-medium">
                          {formatCurrency(detail.relatedEvent.amount)}
                        </p>
                      </div>
                    )}
                    {detail.relatedEvent.isOption && (
                      <>
                        <div>
                          <span className="text-zinc-500 text-xs">Option</span>
                          <p className="font-medium">
                            {detail.relatedEvent.optionType?.toUpperCase()}{' '}
                            {detail.relatedEvent.strike && `$${detail.relatedEvent.strike}`}
                          </p>
                        </div>
                        {detail.relatedEvent.expiration && (
                          <div>
                            <span className="text-zinc-500 text-xs">Expiration</span>
                            <p className="font-medium">
                              {formatDate(detail.relatedEvent.expiration)}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Resolution Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="openDate" className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    Original Purchase Date
                  </Label>
                  <DatePicker
                    value={resolutionForm.openDate}
                    onChange={(date) =>
                      setResolutionForm((prev) => ({ ...prev, openDate: date }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openPrice" className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4" />
                    Original Purchase Price (per share/contract)
                  </Label>
                  <Input
                    id="openPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={resolutionForm.openPrice}
                    onChange={(e) =>
                      setResolutionForm((prev) => ({ ...prev, openPrice: e.target.value }))
                    }
                  />
                  {detail.relatedEvent?.isOption && (
                    <p className="text-xs text-zinc-500">
                      For options, enter the premium per contract (e.g., 1.50 for $1.50)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4" />
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Any notes about this position..."
                    rows={2}
                    value={resolutionForm.notes}
                    onChange={(e) =>
                      setResolutionForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </div>

              {resolveMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {resolveMutation.error instanceof Error
                      ? resolveMutation.error.message
                      : 'Failed to resolve issue'}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedIssue(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => resolveMutation.mutate()}
              disabled={
                resolveMutation.isPending ||
                !resolutionForm.openDate ||
                !resolutionForm.openPrice
              }
              className="bg-rh-green hover:bg-rh-green-hover w-full sm:w-auto"
            >
              {resolveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                'Create Opening Position'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss Dialog */}
      <Dialog open={!!issueToDismiss} onOpenChange={(open) => !open && setIssueToDismiss(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss Issue</DialogTitle>
            <DialogDescription>
              This issue will be marked as dismissed and won&apos;t affect your statistics.
              Please provide a reason for dismissing.
            </DialogDescription>
          </DialogHeader>

          {issueToDismiss && (
            <div className="space-y-4">
              {/* Issue Info */}
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {getSeverityIcon(issueToDismiss.severity)}
                  {issueToDismiss.symbol && (
                    <span className="font-semibold">{issueToDismiss.symbol}</span>
                  )}
                  {getSeverityBadge(issueToDismiss.severity)}
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {issueToDismiss.message}
                </p>
              </div>

              {/* Reason Input */}
              <div className="space-y-2">
                <Label htmlFor="dismissReason">
                  Reason for dismissing <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="dismissReason"
                  placeholder="e.g., This is a transfer from another broker, data not available..."
                  rows={3}
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                />
                <p className="text-xs text-zinc-500">
                  Minimum 10 characters required
                </p>
              </div>

              {dismissMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {dismissMutation.error instanceof Error
                      ? dismissMutation.error.message
                      : 'Failed to dismiss issue'}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIssueToDismiss(null);
                setDismissReason('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending || dismissReason.length < 10}
              className="w-full sm:w-auto"
            >
              {dismissMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Dismissing...
                </>
              ) : (
                'Dismiss Issue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Dismiss Alert Dialog */}
      <AlertDialog open={showBulkDismiss} onOpenChange={(open) => {
        if (!open) {
          setShowBulkDismiss(false);
          setBulkDismissReason('');
        }
      }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <span>Dismiss All Issues</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              You&apos;re about to dismiss <span className="font-semibold text-zinc-700 dark:text-zinc-300">{summary?.unresolved || 0} unresolved issues</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            {/* Warning */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">What happens next:</p>
                  <ul className="mt-1.5 space-y-1 list-disc list-inside text-amber-700 dark:text-amber-300">
                    <li>All issues will be marked as dismissed</li>
                    <li>Unknown basis issues will keep P&L as $0</li>
                    <li>Your reason will be logged for audit</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Reason Input */}
            <div className="space-y-2">
              <Label htmlFor="bulkDismissReason" className="text-sm font-medium">
                Reason for dismissing <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="bulkDismissReason"
                placeholder="e.g., Historical data from broker migration, manual reconciliation not needed..."
                rows={3}
                value={bulkDismissReason}
                onChange={(e) => setBulkDismissReason(e.target.value)}
                className="resize-none"
              />
              <p className="text-xs text-zinc-500">
                {bulkDismissReason.length}/10 characters minimum
              </p>
            </div>

            {bulkDismissMutation.isError && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  {bulkDismissMutation.error instanceof Error
                    ? bulkDismissMutation.error.message
                    : 'Failed to dismiss issues'}
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDismissMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkDismissMutation.mutate();
              }}
              disabled={bulkDismissMutation.isPending || bulkDismissReason.length < 10}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDismissMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Dismissing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Dismiss All
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Individual Issue Card Component
 * Mobile-first layout with stacked actions on small screens
 */
interface IssueCardProps {
  issue: ImportIssue;
  getSeverityIcon: (severity: string, size?: 'sm' | 'md') => React.ReactNode;
  getSeverityBadge: (severity: string) => React.ReactNode;
  formatDate: (dateString: string) => string;
  onResolve: () => void;
  onDismiss: () => void;
}

function IssueCard({
  issue,
  getSeverityIcon,
  getSeverityBadge,
  formatDate,
  onResolve,
  onDismiss,
}: IssueCardProps) {
  return (
    <div
      className={`p-4 border rounded-lg transition-all ${
        issue.isResolved
          ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm'
      }`}
    >
      {/* Desktop: Side-by-side layout | Mobile: Stacked layout */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left side: Issue content */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="shrink-0 mt-0.5">
            {getSeverityIcon(issue.severity, 'md')}
          </div>
          <div className="flex-1 min-w-0">
            {/* Symbol + Badges row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {issue.symbol && (
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {issue.symbol}
                </span>
              )}
              {getSeverityBadge(issue.severity)}
              {issue.isResolved && (
                <Badge variant="outline" className="text-green-600 text-xs">
                  Resolved
                </Badge>
              )}
            </div>

            {/* Message */}
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {issue.message}
            </p>

            {/* Date */}
            <p className="text-xs text-zinc-500 mt-2">
              {formatDate(issue.createdAt)}
              {issue.resolvedAt && (
                <span className="ml-1">
                  · Resolved {formatDate(issue.resolvedAt)}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right side: Actions */}
        {!issue.isResolved && (
          <>
            {/* Mobile: Full-width stacked buttons with separator */}
            <div className="flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800 lg:hidden">
              {issue.issueType === 'unknown_basis' && (
                <Button
                  size="sm"
                  onClick={onResolve}
                  className="bg-rh-green hover:bg-rh-green-hover w-full"
                >
                  Resolve Issue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onDismiss}
                className="text-zinc-500 hover:text-red-600 hover:border-red-300 w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Dismiss
              </Button>
            </div>

            {/* Desktop: Compact inline buttons */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {issue.issueType === 'unknown_basis' && (
                <Button
                  size="sm"
                  onClick={onResolve}
                  className="bg-rh-green hover:bg-rh-green-hover"
                >
                  Resolve
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onDismiss}
                className="text-zinc-500 hover:text-red-600 hover:border-red-300"
              >
                <X className="h-4 w-4 mr-1" />
                Dismiss
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
