/**
 * API Keys Section
 *
 * Settings card for managing personal API keys used with the MCP server.
 * Users can generate, view, and revoke keys. Full key shown once at creation.
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseApiJson, apiData } from '@/lib/api/client';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ============================================================================
// Types
// ============================================================================

interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CreateResult {
  id: string;
  key: string;
  prefix: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await fetch('/api/settings/api-keys');
  if (!res.ok) throw new Error('Failed to fetch API keys');
  const json = await parseApiJson(res);
  return apiData(json);
}

async function createKey(name: string): Promise<CreateResult> {
  const res = await fetch('/api/settings/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const json = await parseApiJson(res).catch(() => ({ message: 'Failed' }));
    throw new Error((json as { message?: string }).message ?? 'Failed to create key');
  }
  const json = await parseApiJson(res);
  return apiData(json);
}

async function revokeKey(id: string): Promise<void> {
  const res = await fetch('/api/settings/api-keys', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error('Failed to revoke key');
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Component
// ============================================================================

export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createKey(name),
    onSuccess: (result) => {
      setNewKey(result.key);
      setKeyName('');
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeKey(id),
    onSuccess: () => {
      setRevokeId(null);
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  const handleCreate = () => {
    if (!keyName.trim()) return;
    createMutation.mutate(keyName.trim());
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setNewKey(null);
    setKeyName('');
    createMutation.reset();
  };

  const activeKeys = keys.filter((k) => k.isActive);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">API Keys</CardTitle>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => {
            if (!open) handleCloseCreate();
            else setCreateOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={activeKeys.length >= 5}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Generate Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              {!newKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Generate API Key</DialogTitle>
                    <DialogDescription>
                      Create a personal key to connect LLM tools (like Claude Desktop) to your trading data via MCP.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div>
                      <Label htmlFor="key-name">Key Name</Label>
                      <Input
                        id="key-name"
                        placeholder="e.g. Claude Desktop, My Agent"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        maxLength={100}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreate();
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreate}
                      disabled={!keyName.trim() || createMutation.isPending}
                    >
                      {createMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Generate
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                      Copy this key now. It won&apos;t be shown again.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm font-mono break-all select-all">
                        {newKey}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-rh-green" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Store this key securely. You won&apos;t be able to see it again after closing this dialog.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseCreate}>Done</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Connect LLM tools to your trading data via the MCP server. Keys are read-only and scoped to your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-6">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}

        {!isLoading && keys.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
            No API keys yet. Generate one to get started.
          </p>
        )}

        {!isLoading && keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  key.isActive
                    ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                    : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {key.name}
                    </span>
                    {!key.isActive && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <code className="text-xs text-zinc-400 font-mono">
                      {key.keyPrefix}...
                    </code>
                    <span className="text-xs text-zinc-400">
                      Created {formatDate(key.createdAt)}
                    </span>
                    {key.lastUsedAt && (
                      <span className="text-xs text-zinc-400">
                        Last used {formatDate(key.lastUsedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {key.isActive && (
                  <Dialog
                    open={revokeId === key.id}
                    onOpenChange={(open) => setRevokeId(open ? key.id : null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Revoke API Key</DialogTitle>
                        <DialogDescription>
                          Revoke &ldquo;{key.name}&rdquo; ({key.keyPrefix}...)? Any MCP clients using this key will lose access immediately.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setRevokeId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => revokeMutation.mutate(key.id)}
                          disabled={revokeMutation.isPending}
                        >
                          {revokeMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          )}
                          Revoke Key
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ))}
          </div>
        )}

        {activeKeys.length >= 5 && (
          <p className="text-xs text-zinc-400 mt-2 text-center">
            Maximum 5 active keys. Revoke an existing key to create a new one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
