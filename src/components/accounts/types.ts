export interface BrokerageAccount {
  id: string;
  name: string;
  broker: string;
  externalAccountId?: string;
  brokerageAuthorizationId?: string; // Groups accounts from same OAuth connection
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  stats: {
    ledgerEventCount: number;
    importBatchCount: number;
    openPositionCount: number;
    totalRealizedPnL: number;
  };
}

export interface CreateAccountData {
  broker: string;
  name: string;
  externalAccountId?: string;
  currency?: string;
  isDefault?: boolean;
}

export interface UpdateAccountData {
  name?: string;
  externalAccountId?: string;
  isDefault?: boolean;
  isActive?: boolean;
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
  accounts: Array<{
    id: string;
    name: string;
    number: string;
    institutionName: string;
    brokerageAuthorizationId?: string; // Groups accounts from same OAuth connection
    isSynced: boolean;
    brokerageAccountId: string | null;
    transactionCount: number;
    // SnapTrade sync status (whether SnapTrade has fetched from the broker)
    snaptradeSync?: {
      isInitialSyncComplete: boolean;
      firstTransactionDate: string | null;
      lastSuccessfulSync: string | null;
      status: 'ready' | 'syncing' | 'limited';
    };
  }>;
  syncedAccounts: Array<{
    brokerageAccountId: string;
    broker: string;
    externalAccountId: string;
    transactionCount: number;
  }>;
  orphanedAccounts: Array<{
    brokerageAccountId: string;
    brokerageAccountName: string;
    broker: string;
    externalAccountId: string;
    brokerageAuthorizationId: string | null;
    transactionCount: number;
    reason: 'missing_connection' | 'missing_remote_account';
  }>;
}

export interface ImportPreview {
  summary: {
    totalRows: number;
    parsed: number;
    validated: number;
    duplicates: number;
    toImport: number;
    skipped: number;
    byType: { stocks: number; options: number };
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
  warnings: Array<{ row: number; message: string }>;
  errors: Array<{ row: number; message: string }>;
}

export interface ImportResult {
  success: boolean;
  importBatchId: string;
  totalRows: number;
  inserted: number;
  duplicates: number;
  skippedRows: number;
  warnings: Array<{ row?: number; message: string }>;
  errors: Array<{ row?: number; message: string }>;
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
    derivationRan?: boolean;
  };
  accounts: Array<{
    snaptradeAccountId: string;
    brokerageAccountId: string;
    importBatchId: string;
    name: string;
    broker: string;
    isNewAccount: boolean;
    imported: number;
  }>;
}

export interface BulkDeletePreview {
  preview: boolean;
  account: {
    id: string;
    name: string;
    broker: string;
  };
  dateRange: {
    requested: { start: string; end: string };
    actual: { start: string | null; end: string | null };
  };
  counts: {
    total: number;
    stocks: number;
    options: number;
    other: number;
  };
  sampleEvents: Array<{
    id: string;
    symbol: string;
    type: 'stock' | 'option';
    transCode: string;
    quantity: number;
    price: number | null;
    date: string;
    optionDetails: {
      optionType: string | null;
      strike: number | null;
      expiration: string | null;
    } | null;
    source: string;
  }>;
}

export interface BulkDeleteResult {
  success: boolean;
  message: string;
  deleted: { events: number };
}

export type WizardStep =
  | 'select-broker'
  | 'connection-method'
  | 'connect-snaptrade'
  | 'import-file'
  | 'manual-setup'
  | 'processing'
  | 'success';
