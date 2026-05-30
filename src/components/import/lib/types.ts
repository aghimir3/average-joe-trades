/**
 * Shared types for the Import page components
 */

import type { BROKER_CONFIG } from './constants';

export type BrokerKey = keyof typeof BROKER_CONFIG;

export interface ImportBatch {
  id: string;
  fileName: string;
  source: string;
  status: string;
  totalRows: number;
  importedTrades: number;
  duplicateRows: number;
  skippedRows: number;
  isArchived: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface ImportPreview {
  summary: {
    totalRows: number;
    parsed: number;
    validated: number;
    duplicates: number;
    toImport: number;
    skipped: number;
    byType: {
      stocks: number;
      options: number;
    };
    byStatus: {
      open: number;
      partial: number;
      closed: number;
    };
    isApproximate?: boolean;
    isLargeFile?: boolean;
  };
  sampleTrades: Array<{
    ticker: string;
    type: string;
    status: string;
    strategy: string | null;
    entryDate: string;
    quantity: number;
    entryPrice: string;
    realizedPnL: string | null;
  }>;
  warnings: Array<{ row: number; message: string; ticker?: string }>;
  errors: Array<{ row: number; message: string; ticker?: string }>;
}

export interface ImportResult {
  success: boolean;
  importBatchId: string;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  inserted: number;
  duplicates: number;
  dateRange?: {
    start: string;
    end: string;
  };
  warnings: Array<{ row?: number; index?: number; message: string; ticker?: string; symbol?: string }>;
  errors: Array<{ row?: number; index?: number; message: string; ticker?: string; symbol?: string }>;
  errorMessage?: string;
}

export interface BrokerageAccount {
  id: string;
  name: string;
  broker: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface SnapTradeAccount {
  id: string;
  name: string;
  number: string;
  institutionName: string;
  brokerageAuthorizationId: string;
  isSynced: boolean;
  brokerageAccountId: string | null;
  brokerageAccountName: string | null;
  transactionCount: number;
  snaptradeSync?: {
    isInitialSyncComplete: boolean;
    firstTransactionDate: string | null;
    lastSuccessfulSync: string | null;
    status: 'ready' | 'syncing' | 'limited';
  };
}

export interface SyncedAccount {
  brokerageAccountId: string;
  brokerageAccountName: string;
  broker: string;
  externalAccountId: string;
  transactionCount: number;
}

export interface SnapTradeStatus {
  configured: boolean;
  isConnected: boolean;
  hasCredentials?: boolean;
  recentConnectionAttempts?: Record<string, { lastAttemptAt: string; count: number }>;
  connections?: Array<{
    id: string;
    brokerageName: string;
    brokerageSlug?: string;
    brokerageDisplayName?: string;
    connectionName?: string;
    createdDate?: string | null;
    disabled?: boolean;
    type?: string;
  }>;
  accounts: SnapTradeAccount[];
  syncedAccounts: SyncedAccount[];
  orphanedAccounts?: Array<{
    brokerageAccountId: string;
    brokerageAccountName: string;
    broker: string;
    externalAccountId: string | null;
    brokerageAuthorizationId: string | null;
    transactionCount: number;
    reason: 'missing_connection' | 'missing_remote_account';
  }>;
  lastSyncAt?: string;
  syncStatus?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  stats: {
    accountsSynced: number;
    newAccountsCreated: number;
    totalImported: number;
    totalDuplicates: number;
    totalErrors: number;
  };
  accounts: Array<{
    snaptradeAccountId: string;
    brokerageAccountId: string;
    importBatchId: string;
    name: string;
    broker: string;
    isNewAccount: boolean;
    imported: number;
    duplicates: number;
    errors: number;
  }>;
}

export interface DisconnectResult {
  success: boolean;
  message: string;
  snaptradeDeregistered?: boolean;
  deleted: {
    account: string;
    externalAccountId: string;
    ledgerEvents: number;
    positions: number;
    closedTrades: number;
    dailyAggregates: number;
    importBatches: number;
  };
}

export type DateRangePreset = 'today' | 'this_week' | '7d' | 'last_week' | 'everything' | '1y' | '6m' | '3m' | '1m' | 'ytd' | 'custom';

export interface DateRangeOption {
  label: string;
  value: DateRangePreset;
  getRange: () => { startDate: string | null; endDate: string | null };
  forceRefresh?: boolean;
}
