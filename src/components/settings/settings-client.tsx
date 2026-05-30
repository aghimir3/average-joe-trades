/**
 * Settings Client Component
 *
 * User preferences including auto-sync settings.
 * Preferences are stored in the database via API.
 */

'use client';

import { parseApiJson, apiData } from '@/lib/api/client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  RefreshCw,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Loader2,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
} from 'lucide-react';
import { ScreenLockSettings } from '@/components/screen-lock/screen-lock-settings';
import { ApiKeysSection } from '@/components/settings/api-keys-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTheme } from 'next-themes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LinkedAccount {
  id: string;
  name: string;
  broker: string;
  transactionCount: number;
}

interface SnapTradeStatus {
  isConnected: boolean;
  lastSyncAt: string | null;
  syncStatus: string | null;
  syncError: string | null;
  connectedSince: string | null;
  linkedAccounts: LinkedAccount[];
}

interface UserSettings {
  autoSyncEnabled: boolean;
  snaptrade: SnapTradeStatus;
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "Yesterday")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// Fetch user settings from API
async function fetchSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) {
    throw new Error('Failed to fetch settings');
  }
  const data = await parseApiJson(res);
  return apiData(data);
}

// Update user settings via API
async function updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to update settings');
  }
  const data = await parseApiJson(res);
  return apiData(data);
}

export function SettingsClient() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  // Fetch settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchSettings,
    staleTime: 60000, // 1 minute
  });

  // Mutation to update settings
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['userSettings'], data);
    },
  });

  const handleAutoSyncToggle = (enabled: boolean) => {
    mutation.mutate({ autoSyncEnabled: enabled });
  };

  // Show skeleton while loading
  if (!resolvedTheme || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your preferences and account settings
          </p>
        </div>
        <div className="space-y-4">
          <Card className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-12 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your preferences and account settings
        </p>
      </div>

      {/* Sync Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Sync Settings</CardTitle>
          </div>
          <CardDescription>
            Configure how your brokerage accounts sync
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto-Sync Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm font-medium">
                Daily Auto-Sync
              </Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Automatically sync your SnapTrade accounts when you first open the dashboard each day
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              )}
              <Switch
                id="auto-sync"
                checked={settings?.autoSyncEnabled ?? false}
                onCheckedChange={handleAutoSyncToggle}
                disabled={mutation.isPending}
                className="data-[state=checked]:bg-green-500 dark:data-[state=checked]:bg-green-500"
              />
            </div>
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500 pb-2">
            You can always manually sync from the{' '}
            <Link href="/accounts" className="text-blue-500 hover:underline">
              Accounts page
            </Link>{' '}
            using the &quot;Sync All&quot; button.
          </p>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Appearance</CardTitle>
          </div>
          <CardDescription>
            Customize the look and feel of the app
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="space-y-0.5">
              <Label htmlFor="theme" className="text-sm font-medium">
                Theme
              </Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Choose your preferred color scheme
              </p>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    Light
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    Dark
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    System
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Screen Lock Settings */}
      <ScreenLockSettings />

      {/* API Keys (MCP Server) */}
      <ApiKeysSection />

      {/* Brokerage Connections */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-violet-500" />
            <CardTitle className="text-lg">Brokerage Connections</CardTitle>
          </div>
          <CardDescription>
            SnapTrade integration status and linked accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-3">
              {settings?.snaptrade?.isConnected ? (
                <div className="p-2 rounded-full bg-green-100 dark:bg-green-500/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-700">
                  <XCircle className="h-5 w-5 text-zinc-400" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {settings?.snaptrade?.isConnected ? 'Connected' : 'Not Connected'}
                </p>
                {settings?.snaptrade?.isConnected && settings?.snaptrade?.connectedSince && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Since {new Date(settings.snaptrade.connectedSince).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            {settings?.snaptrade?.isConnected && (
              <Link
                href="/accounts"
                className="text-xs text-blue-500 hover:underline"
              >
                Manage
              </Link>
            )}
          </div>

          {/* Last Sync Time */}
          {settings?.snaptrade?.isConnected && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <Clock className="h-4 w-4 text-zinc-400" />
              <div className="flex-1">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Last Sync</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {settings.snaptrade.lastSyncAt
                    ? formatRelativeTime(new Date(settings.snaptrade.lastSyncAt))
                    : 'Never synced'}
                </p>
              </div>
              {settings.snaptrade.syncStatus && (
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    settings.snaptrade.syncStatus === 'success'
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : settings.snaptrade.syncStatus === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {settings.snaptrade.syncStatus}
                </span>
              )}
            </div>
          )}

          {/* Linked Accounts */}
          {settings?.snaptrade?.linkedAccounts && settings.snaptrade.linkedAccounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                Linked Accounts ({settings.snaptrade.linkedAccounts.length})
              </p>
              <div className="space-y-2">
                {settings.snaptrade.linkedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700">
                        <Building2 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {account.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                          {account.broker}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {account.transactionCount.toLocaleString()} trades
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not Connected State */}
          {!settings?.snaptrade?.isConnected && (
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                Connect your brokerage accounts to sync trades automatically
              </p>
              <Link
                href="/accounts"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Connect Brokerage
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-zinc-500" />
            <CardTitle className="text-lg">More Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <Link
            href="/accounts"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Manage Accounts
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
          <Link
            href="/policy"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Portfolio Policy & Trading Rules
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Privacy Policy
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
          <Link
            href="/terms"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Terms of Service
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
