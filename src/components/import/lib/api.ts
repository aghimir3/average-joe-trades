/**
 * API functions for the Import page
 */

import { parseApiJson, apiData, apiDataOr, apiMessage } from '@/lib/api/client';
import type {
  ImportPreview,
  ImportResult,
  ImportBatch,
  BrokerageAccount,
  SnapTradeStatus,
  DisconnectResult,
  SyncResult,
} from './types';

export async function previewFile(file: File, broker: string): Promise<ImportPreview> {
  const content = await file.text();
  const response = await fetch('/api/import/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      content,
      skipDuplicates: true,
      broker,
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to preview file';
    try {
      const error = await parseApiJson(response);
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      errorMessage = `Preview failed: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return apiData(await parseApiJson(response));
}

export async function importFile(file: File, brokerageAccountId: string, broker: string): Promise<ImportResult> {
  const content = await file.text();
  const response = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      content,
      brokerageAccountId,
      broker,
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to import file';
    try {
      const error = await parseApiJson(response);
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      errorMessage = `Import failed: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return apiData(await parseApiJson(response));
}

export async function deleteImport(batchId: string): Promise<void> {
  const response = await fetch(`/api/import/${batchId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to delete import'));
  }
}

export async function fetchImportHistory(): Promise<ImportBatch[]> {
  const response = await fetch('/api/import?includeArchived=false');
  if (!response.ok) {
    throw new Error('Failed to fetch import history');
  }
  const data = apiData<{ batches?: ImportBatch[] }>(await parseApiJson(response));
  return data.batches ?? [];
}

export async function fetchBrokerageAccounts(): Promise<BrokerageAccount[]> {
  const response = await fetch('/api/accounts');
  if (!response.ok) {
    throw new Error('Failed to fetch brokerage accounts');
  }
  const data = await parseApiJson(response);
  return apiDataOr(data, []);
}

export async function fetchSnapTradeStatus(options?: { refresh?: boolean }): Promise<SnapTradeStatus> {
  const params = options?.refresh ? '?refresh=true' : '';
  const response = await fetch(`/api/sync/connect${params}`);
  if (!response.ok) {
    if (response.status === 503) {
      return { configured: false, isConnected: false, connections: [], accounts: [], syncedAccounts: [] };
    }
    throw new Error('Failed to fetch sync status');
  }
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function fetchLoginNicknames(): Promise<Record<string, string>> {
  const res = await fetch('/api/sync/login-nicknames');
  if (!res.ok) {
    return {};
  }
  return apiData(await parseApiJson(res));
}

export async function disconnectAccount(
  brokerageAccountId: string,
  deregisterFromSnapTrade: boolean = false
): Promise<DisconnectResult> {
  const response = await fetch('/api/sync/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brokerageAccountId, confirmDelete: true, deregisterFromSnapTrade }),
  });
  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to disconnect account'));
  }
  const data = await parseApiJson(response);
  return apiData(data);
}

export async function connectSnapTrade(broker?: string): Promise<string> {
  const response = await fetch('/api/sync/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker }),
  });
  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to generate connection link'));
  }
  const data = apiData<{ connectionLink: string }>(await parseApiJson(response));
  return data.connectionLink;
}

export async function syncTransactions(options: {
  brokerageAccountId?: string;
  snaptradeAccountIds?: string[];
  refresh?: boolean;
  forceDerivation?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<SyncResult> {
  const payload: Record<string, unknown> = {
    ...options,
    forceDerivation: options.forceDerivation ?? true,
  };
  if (!options.startDate) delete payload.startDate;
  if (!options.endDate) delete payload.endDate;

  const response = await fetch('/api/sync/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to sync transactions'));
  }
  const data = await parseApiJson(response);
  return apiData(data);
}
