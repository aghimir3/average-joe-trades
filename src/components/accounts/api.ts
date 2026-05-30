import { apiData, apiDataOr, apiMessage, parseApiJson } from '@/lib/api/client';

import type {
  BrokerageAccount,
  BulkDeletePreview,
  BulkDeleteResult,
  CreateAccountData,
  ImportPreview,
  ImportResult,
  SnapTradeStatus,
  SyncResult,
  UpdateAccountData,
} from './types';

export async function fetchAccounts(): Promise<BrokerageAccount[]> {
  const res = await fetch('/api/accounts?includeInactive=false');
  if (!res.ok) throw new Error('Failed to fetch accounts');
  const data = await parseApiJson(res);
  return apiDataOr(data, []);
}

export async function createAccount(data: CreateAccountData): Promise<BrokerageAccount> {
  const res = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to create account'));
  }
  return apiData(await parseApiJson(res));
}

export async function updateAccount(
  id: string,
  data: UpdateAccountData
): Promise<BrokerageAccount> {
  const res = await fetch(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to update account'));
  }
  return apiData(await parseApiJson(res));
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to delete account'));
  }
}

export async function fetchSnapTradeStatus(options?: { refresh?: boolean }): Promise<SnapTradeStatus> {
  const params = options?.refresh ? '?refresh=true' : '';
  const res = await fetch(`/api/sync/connect${params}`);
  if (!res.ok) {
    if (res.status === 503) {
      return {
        configured: false,
        isConnected: false,
        connections: [],
        accounts: [],
        syncedAccounts: [],
        orphanedAccounts: [],
      };
    }
    throw new Error('Failed to fetch sync status');
  }
  const data = apiData(await parseApiJson(res)) as Partial<SnapTradeStatus>;
  return {
    configured: data.configured ?? false,
    isConnected: data.isConnected ?? false,
    hasCredentials: data.hasCredentials,
    recentConnectionAttempts: data.recentConnectionAttempts ?? {},
    connections: data.connections ?? [],
    accounts: data.accounts ?? [],
    syncedAccounts: data.syncedAccounts ?? [],
    orphanedAccounts: data.orphanedAccounts ?? [],
  };
}

export async function fetchLoginNicknames(): Promise<Record<string, string>> {
  const res = await fetch('/api/sync/login-nicknames');
  if (!res.ok) {
    return {};
  }
  return apiData(await parseApiJson(res));
}

export async function setLoginNickname(
  brokerageAuthorizationId: string,
  nickname: string
): Promise<void> {
  const res = await fetch('/api/sync/login-nicknames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brokerageAuthorizationId, nickname }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to set nickname'));
  }
}

export async function connectSnapTrade(broker?: string): Promise<string> {
  const res = await fetch('/api/sync/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to generate connection link'));
  }
  return apiData<{ connectionLink: string }>(await parseApiJson(res)).connectionLink;
}

export async function syncTransactions(options: {
  snaptradeAccountIds: string[];
  refresh?: boolean;
  forceDerivation?: boolean;
  startDate?: string;
  endDate?: string;
}): Promise<SyncResult> {
  const res = await fetch('/api/sync/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to sync transactions'));
  }
  return apiData(await parseApiJson(res));
}

export async function previewFile(file: File, broker: string): Promise<ImportPreview> {
  const content = await file.text();
  const res = await fetch('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, content, skipDuplicates: true, broker }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to preview file'));
  }
  return apiData(await parseApiJson(res));
}

export async function importFile(
  file: File,
  brokerageAccountId: string,
  broker: string
): Promise<ImportResult> {
  const content = await file.text();
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, content, brokerageAccountId, broker }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to import file'));
  }
  return apiData(await parseApiJson(res));
}

export async function previewBulkDelete(
  brokerageAccountId: string,
  startDate: string,
  endDate: string
): Promise<BulkDeletePreview> {
  const res = await fetch('/api/entries/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brokerageAccountId, startDate, endDate }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to preview deletion'));
  }
  return apiData(await parseApiJson(res));
}

export async function executeBulkDelete(
  brokerageAccountId: string,
  startDate: string,
  endDate: string
): Promise<BulkDeleteResult> {
  const res = await fetch('/api/entries/bulk-delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brokerageAccountId, startDate, endDate, confirmDelete: true }),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to delete trades'));
  }
  return apiData(await parseApiJson(res));
}
