'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  Loader2,
  ArrowRight,
  ArrowLeft,
  FileSpreadsheet,
  ChevronRight,
  Info,
  FileJson,
} from 'lucide-react';
import Link from 'next/link';
import { createChildLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { BROKER_CONFIG } from './lib/constants';
import type {
  BrokerKey,
  BrokerageAccount,
  ImportPreview,
  ImportResult,
} from './lib/types';
import {
  previewFile,
  importFile,
  deleteImport,
  fetchImportHistory,
} from './lib/api';

const logger = createChildLogger({ module: 'file-import-tab' });

interface FileImportTabProps {
  selectedBroker: BrokerKey;
  brokerConfig: typeof BROKER_CONFIG[BrokerKey];
  brokerAccounts: BrokerageAccount[];
  onBack: () => void;
}

export function FileImportTab({
  selectedBroker,
  brokerConfig,
  brokerAccounts,
  onBack,
}: FileImportTabProps) {
  const queryClient = useQueryClient();

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  // Queries
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['import-history'],
    queryFn: fetchImportHistory,
  });

  // Mutations
  const previewMutation = useMutation({
    mutationFn: ({ file, broker }: { file: File; broker: string }) => previewFile(file, broker),
    onSuccess: (data) => {
      logger.info({ toImport: data.summary.toImport }, 'Preview completed');
      setPreview(data);
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Preview failed');
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ file, accountId, broker }: { file: File; accountId: string; broker: string }) =>
      importFile(file, accountId, broker),
    onSuccess: (data) => {
      logger.info({ batchId: data.importBatchId, imported: data.inserted }, 'Import completed');
      setImportResult(data);
      setSelectedFile(null);
      setPreview(null);
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
    onError: (error: Error) => {
      logger.error({ error: error.message }, 'Import failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteImport,
    onSuccess: () => {
      logger.info({ batchId: deletingBatchId }, 'Import deleted');
      setDeletingBatchId(null);
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      window.dispatchEvent(new Event('trades-updated'));
    },
    onError: (error: Error) => {
      logger.error({ error }, 'Delete failed');
    },
  });

  // Computed values
  const defaultAccount = brokerAccounts.find((a) => a.isDefault) || brokerAccounts[0];
  const currentAccountId = selectedAccountId || defaultAccount?.id;
  const hasAccounts = brokerAccounts.length > 0;
  const isLoading = previewMutation.isPending || importMutation.isPending;

  // Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && brokerConfig.fileExtension) {
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = brokerConfig.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        alert(`Please select a ${brokerConfig.fileType} file for ${brokerConfig.name}`);
        return;
      }
      setSelectedFile(file);
      setPreview(null);
      setImportResult(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && brokerConfig.fileExtension) {
      const ext = file.name.toLowerCase().split('.').pop();
      const expectedExt = brokerConfig.fileExtension.replace('.', '');
      if (ext !== expectedExt) {
        alert(`Please select a ${brokerConfig.fileType} file for ${brokerConfig.name}`);
        return;
      }
      setSelectedFile(file);
      setPreview(null);
      setImportResult(null);
    }
  };

  const handlePreview = () => {
    if (selectedFile && selectedBroker) {
      previewMutation.mutate({ file: selectedFile, broker: selectedBroker });
    }
  };

  const handleImport = () => {
    if (selectedFile && currentAccountId && selectedBroker) {
      setImportResult(null);
      importMutation.mutate({
        file: selectedFile,
        accountId: currentAccountId,
        broker: selectedBroker,
      });
    }
  };

  const handleDelete = (batchId: string) => {
    setDeletingBatchId(batchId);
    deleteMutation.mutate(batchId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // If broker doesn't support sync and has no accounts, show warning
  if (!hasAccounts) {
    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Import from {brokerConfig.name}
            </h1>
          </div>
        </div>

        {/* No Account Warning */}
        <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                No {brokerConfig.name} Account Found
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Create a {brokerConfig.name} brokerage account first to import your trades.
              </p>
            </div>
            <Link href="/accounts">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                Create Account
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Import {brokerConfig.fileType} from {brokerConfig.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload your {brokerConfig.fileType} export file
          </p>
        </div>
      </div>

      {/* Upload Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {/* Account Selector */}
        {brokerAccounts.length > 1 && (
          <div className="px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Import to:
              </span>
              <select
                value={currentAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {brokerAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6">
          {/* Instructions Toggle */}
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 mb-4 group transition-colors hover:bg-blue-100 dark:hover:bg-blue-950/50"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                How to export from {brokerConfig.name}
              </span>
            </div>
            <ChevronRight
              className={cn(
                'h-4 w-4 text-blue-500 transition-transform',
                showInstructions && 'rotate-90'
              )}
            />
          </button>

          {/* Instructions Content */}
          {showInstructions && (
            <div className="mb-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
              <ol className="space-y-2">
                {brokerConfig.instructions.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Drop Zone */}
          <div
            className={cn(
              'relative border-2 border-dashed rounded-xl p-8 text-center transition-all',
              dragActive
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 scale-[1.01]'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600',
              !currentAccountId && 'opacity-50 pointer-events-none'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept={brokerConfig.fileExtension ?? undefined}
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                  dragActive
                    ? 'bg-emerald-100 dark:bg-emerald-900/50'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                )}
              >
                <Upload
                  className={cn(
                    'h-7 w-7 transition-colors',
                    dragActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedFile ? selectedFile.name : `Drop your ${brokerConfig.fileType} file here`}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  or click to browse
                </p>
              </div>
            </div>
          </div>

          {/* File Selected - Actions */}
          {selectedFile && !preview && !importResult && (
            <div className="mt-4 flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                {brokerConfig.fileType === 'JSON' ? (
                  <FileJson className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handlePreview}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1.5" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Preview Error */}
          {previewMutation.isError && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Preview Failed
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                    {previewMutation.error.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Result */}
          {preview && !importResult && (
            <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Import Preview
                  </h3>
                </div>
                {preview.summary.isLargeFile && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                    Large File ({preview.summary.totalRows.toLocaleString()} rows)
                  </span>
                )}
              </div>

              {/* Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {preview.summary.isApproximate ? '~' : ''}
                    {preview.summary.toImport.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">To Import</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-2xl font-bold text-orange-500">
                    {preview.summary.isApproximate ? '~' : ''}
                    {preview.summary.duplicates.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Duplicates</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {preview.summary.byType.stocks.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Stocks</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {preview.summary.byType.options.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Options</p>
                </div>
              </div>

              {/* Sample Trades */}
              {preview.sampleTrades.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    Sample trades:
                  </p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {preview.sampleTrades.slice(0, 4).map((trade, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 bg-white dark:bg-zinc-900 rounded flex items-center justify-between"
                      >
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {trade.ticker}
                        </span>
                        <span className="text-zinc-500">
                          {trade.type} · {trade.quantity} @ ${trade.entryPrice}
                        </span>
                        {trade.realizedPnL && (
                          <span
                            className={cn(
                              'font-medium',
                              parseFloat(trade.realizedPnL) >= 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            )}
                          >
                            ${parseFloat(trade.realizedPnL).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setSelectedFile(null);
                  }}
                  disabled={importMutation.isPending}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || preview.summary.toImport === 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${preview.summary.toImport} Trades`
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Import Error */}
          {importMutation.isError && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Import Failed
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                    {importMutation.error.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Import Success */}
          {importResult && (
            <div
              className={cn(
                'mt-4 p-4 rounded-xl border',
                importResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
              )}
            >
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2
                  className={cn(
                    'h-5 w-5',
                    importResult.success ? 'text-emerald-600' : 'text-red-600'
                  )}
                />
                <h3
                  className={cn(
                    'font-semibold',
                    importResult.success
                      ? 'text-emerald-800 dark:text-emerald-200'
                      : 'text-red-800 dark:text-red-200'
                  )}
                >
                  Import {importResult.success ? 'Complete' : 'Failed'}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-xl font-bold text-emerald-600">
                    {importResult.inserted}
                  </p>
                  <p className="text-xs text-zinc-500">Imported</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-xl font-bold text-orange-500">
                    {importResult.duplicates}
                  </p>
                  <p className="text-xs text-zinc-500">Duplicates</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg text-center">
                  <p className="text-xl font-bold text-zinc-500">{importResult.skippedRows}</p>
                  <p className="text-xs text-zinc-500">Skipped</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href={`/import/report/${importResult.importBatchId}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </Link>
                {importResult.inserted > 0 && (
                  <Link href="/dashboard" className="flex-1">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                      View Dashboard
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Recent Imports</h2>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {history.slice(0, 5).map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <Link
                  href={`/import/report/${batch.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {batch.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : batch.status === 'failed' ? (
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  ) : batch.status === 'processing' ? (
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-zinc-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {batch.fileName}
                    </p>
                    <p className="text-xs text-zinc-500">{formatDate(batch.createdAt)}</p>
                  </div>
                </Link>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden sm:flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-semibold text-emerald-600">{batch.importedTrades}</p>
                      <p className="text-[10px] text-zinc-500">imported</p>
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Import?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &quot;{batch.fileName}&quot; and all{' '}
                          <strong>{batch.importedTrades} associated trades</strong>. This cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(batch.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deletingBatchId === batch.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            'Delete Import'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
