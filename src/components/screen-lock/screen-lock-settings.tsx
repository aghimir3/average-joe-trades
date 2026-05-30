'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';


/**
 * Screen Lock Settings Component
 *
 * Provides UI for configuring screen lock:
 * - Enable/disable screen lock
 * - Set inactivity timeout
 * - Register/manage passkeys
 * - Set/change PIN
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';
import {
  Lock,
  Fingerprint,
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Smartphone,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useScreenLock } from '@/components/providers/screen-lock-provider';

// ============================================================================
// TYPES
// ============================================================================

interface ScreenLockSettingsData {
  screenLockEnabled: boolean;
  screenLockTimeout: number;
  hasPinConfigured: boolean;
  passkeys: Array<{
    id: string;
    deviceName: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchSettings(): Promise<ScreenLockSettingsData> {
  const res = await fetch('/api/screen-lock/settings');
  if (!res.ok) throw new Error('Failed to fetch settings');
  return apiData(await parseApiJson(res));
}

async function updateSettings(data: Partial<{
  screenLockEnabled: boolean;
  screenLockTimeout: number;
}>): Promise<ScreenLockSettingsData> {
  const res = await fetch('/api/screen-lock/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await parseApiJson(res);
    throw new Error(apiMessage(error, 'Failed to update settings'));
  }
  return apiData(await parseApiJson(res));
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ScreenLockSettings() {
  const queryClient = useQueryClient();
  const { refetchSettings } = useScreenLock();

  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showDeletePasskeyDialog, setShowDeletePasskeyDialog] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['screenLockSettings'],
    queryFn: fetchSettings,
    staleTime: 30000,
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenLockSettings'] });
      refetchSettings();
    },
  });

  // Set PIN mutation
  const setPinMutation = useMutation({
    mutationFn: async ({ pin, currentPin }: { pin: string; currentPin?: string }) => {
      const res = await fetch('/api/screen-lock/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, currentPin }),
      });
      if (!res.ok) {
        const error = await parseApiJson(res);
        throw new Error(apiMessage(error, 'Failed to set PIN'));
      }
      return apiData(await parseApiJson(res));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenLockSettings'] });
      refetchSettings();
      setShowPinDialog(false);
      setPinInput('');
      setConfirmPinInput('');
      setCurrentPinInput('');
      setPinError(null);
    },
    onError: (error: Error) => {
      setPinError(error.message);
    },
  });

  // Delete passkey mutation
  const deletePasskeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/screen-lock/passkey/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await parseApiJson(res);
        throw new Error(apiMessage(error, 'Failed to delete passkey'));
      }
      return apiData(await parseApiJson(res));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenLockSettings'] });
      refetchSettings();
      setShowDeletePasskeyDialog(null);
    },
  });

  // Handle toggle
  const handleToggle = useCallback((enabled: boolean) => {
    updateMutation.mutate({ screenLockEnabled: enabled });
  }, [updateMutation]);

  // Handle timeout change
  const handleTimeoutChange = useCallback((value: string) => {
    updateMutation.mutate({ screenLockTimeout: parseInt(value, 10) });
  }, [updateMutation]);

  // Handle passkey registration
  const handleRegisterPasskey = useCallback(async () => {
    setIsRegistering(true);
    setRegistrationError(null);

    try {
      // Get registration options
      const optionsRes = await fetch('/api/screen-lock/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!optionsRes.ok) {
        throw new Error('Failed to get registration options');
      }

      const { options } = await parseApiJson(optionsRes) as {
        options: PublicKeyCredentialCreationOptionsJSON;
      };

      // Start registration
      const regResult = await startRegistration({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch('/api/screen-lock/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: regResult,
          deviceName: getDeviceName(),
        }),
      });

      if (!verifyRes.ok) {
        const errorData = await parseApiJson(verifyRes);
        // Log detailed error for debugging
        console.error('Passkey verification error:', errorData);
        // Include details in error message if available
        const errorMsg = errorData.details
          ? `${errorData.message} (${errorData.details})`
          : apiMessage(errorData, 'Registration failed');
        throw new Error(errorMsg);
      }

      // Refresh settings
      queryClient.invalidateQueries({ queryKey: ['screenLockSettings'] });
      refetchSettings();
    } catch (error) {
      console.error('Passkey registration failed:', error);
      setRegistrationError(
        error instanceof Error
          ? error.message
          : 'Failed to register passkey. Please try again.'
      );
    } finally {
      setIsRegistering(false);
    }
  }, [queryClient, refetchSettings]);

  // Handle PIN submit
  const handlePinSubmit = useCallback(() => {
    setPinError(null);

    if (pinInput.length < 4 || pinInput.length > 8) {
      setPinError('PIN must be 4-8 digits');
      return;
    }

    if (!/^\d+$/.test(pinInput)) {
      setPinError('PIN must contain only digits');
      return;
    }

    if (pinInput !== confirmPinInput) {
      setPinError('PINs do not match');
      return;
    }

    setPinMutation.mutate({
      pin: pinInput,
      currentPin: settings?.hasPinConfigured ? currentPinInput : undefined,
    });
  }, [pinInput, confirmPinInput, currentPinInput, settings?.hasPinConfigured, setPinMutation]);

  // Get device name
  function getDeviceName(): string {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Linux/.test(ua)) return 'Linux';
    return 'This Device';
  }

  // Format relative time
  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }

  // Check if can enable
  const canEnable = (settings?.passkeys?.length ?? 0) > 0 || settings?.hasPinConfigured;

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-12 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-green-500" />
            <CardTitle className="text-lg">Screen Lock</CardTitle>
          </div>
          <CardDescription>
            Protect your account with biometric or PIN authentication after inactivity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="space-y-0.5">
              <Label htmlFor="screen-lock" className="text-sm font-medium">
                Enable Screen Lock
              </Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Lock the app after a period of inactivity
              </p>
            </div>
            <div className="flex items-center gap-2">
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              )}
              <Switch
                id="screen-lock"
                checked={settings?.screenLockEnabled ?? false}
                onCheckedChange={handleToggle}
                disabled={updateMutation.isPending || !canEnable}
                className="data-[state=checked]:bg-green-500 dark:data-[state=checked]:bg-green-500"
              />
            </div>
          </div>

          {!canEnable && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Set up a passkey or PIN before enabling screen lock</span>
            </div>
          )}

          {/* Timeout Setting */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-zinc-400" />
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Lock After</Label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Time before screen locks
                </p>
              </div>
            </div>
            <Select
              value={String(settings?.screenLockTimeout ?? 300)}
              onValueChange={handleTimeoutChange}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="600">10 minutes</SelectItem>
                <SelectItem value="900">15 minutes</SelectItem>
                <SelectItem value="1800">30 minutes</SelectItem>
                <SelectItem value="3600">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Passkeys Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Passkeys
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegisterPasskey}
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add
              </Button>
            </div>

            {registrationError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{registrationError}</span>
              </div>
            )}

            {settings?.passkeys && settings.passkeys.length > 0 ? (
              <div className="space-y-2">
                {settings.passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-zinc-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {passkey.deviceName}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Added {formatRelativeTime(passkey.createdAt)}
                          {passkey.lastUsedAt && ` • Last used ${formatRelativeTime(passkey.lastUsedAt)}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-zinc-400 hover:text-red-500"
                      onClick={() => setShowDeletePasskeyDialog(passkey.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-3">
                No passkeys registered. Add one to use biometric authentication.
              </p>
            )}
          </div>

          {/* PIN Section */}
          <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  PIN (Fallback)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPinDialog(true)}
              >
                {settings?.hasPinConfigured ? 'Change' : 'Set Up'}
              </Button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              {settings?.hasPinConfigured ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">PIN configured</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">No PIN set</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {settings?.hasPinConfigured ? 'Change PIN' : 'Set Up PIN'}
            </DialogTitle>
            <DialogDescription>
              Enter a 4-8 digit PIN to use as a fallback unlock method.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {pinError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {settings?.hasPinConfigured && (
              <div className="space-y-2">
                <Label htmlFor="current-pin">Current PIN</Label>
                <input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter current PIN"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN</Label>
              <input
                id="new-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="4-8 digits"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
              <input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Re-enter PIN"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPinDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePinSubmit}
              disabled={setPinMutation.isPending}
            >
              {setPinMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {settings?.hasPinConfigured ? 'Update PIN' : 'Set PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Passkey Dialog */}
      <AlertDialog
        open={!!showDeletePasskeyDialog}
        onOpenChange={() => setShowDeletePasskeyDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              This passkey will be removed and can no longer be used to unlock the app.
              You can always add it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (showDeletePasskeyDialog) {
                  deletePasskeyMutation.mutate(showDeletePasskeyDialog);
                }
              }}
            >
              {deletePasskeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
