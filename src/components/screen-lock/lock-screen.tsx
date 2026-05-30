'use client';

import { parseApiJson, apiData, apiMessage } from '@/lib/api/client';


/**
 * Lock Screen Component
 *
 * Full-screen overlay that appears when the app is locked due to inactivity.
 * Supports:
 * - Biometric/passkey authentication (primary, auto-triggered)
 * - PIN fallback
 * - Error handling with attempt limits
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Fingerprint, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { motion, AnimatePresence } from 'motion/react';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { useScreenLock } from '@/components/providers/screen-lock-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type AuthMode = 'passkey' | 'pin';

interface LockScreenState {
  mode: AuthMode;
  pin: string;
  error: string | null;
  isVerifying: boolean;
  attemptsRemaining: number;
  lockedOut: boolean;
  lockedOutSeconds: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LockScreen() {
  const { isLocked, isEnabled, settings, unlock } = useScreenLock();

  const [state, setState] = useState<LockScreenState>({
    mode: 'passkey',
    pin: '',
    error: null,
    isVerifying: false,
    attemptsRemaining: 5,
    lockedOut: false,
    lockedOutSeconds: 0,
  });

  const pinInputRef = useRef<HTMLInputElement>(null);
  const hasPasskeys = (settings?.passkeys?.length ?? 0) > 0;
  const hasPin = settings?.hasPinConfigured ?? false;

  // Auto-trigger passkey auth on mount
  useEffect(() => {
    if (isLocked && hasPasskeys && state.mode === 'passkey' && !state.isVerifying) {
      // Small delay to let the animation complete
      const timer = setTimeout(() => {
        handlePasskeyAuth();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, hasPasskeys, state.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus PIN input when switching to PIN mode
  useEffect(() => {
    if (state.mode === 'pin' && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [state.mode]);

  // Countdown timer for lockout
  useEffect(() => {
    if (state.lockedOut && state.lockedOutSeconds > 0) {
      const timer = setInterval(() => {
        setState((prev) => {
          const newSeconds = prev.lockedOutSeconds - 1;
          if (newSeconds <= 0) {
            return { ...prev, lockedOut: false, lockedOutSeconds: 0 };
          }
          return { ...prev, lockedOutSeconds: newSeconds };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [state.lockedOut, state.lockedOutSeconds]);

  // Handle passkey authentication
  const handlePasskeyAuth = useCallback(async () => {
    if (state.isVerifying) return;

    setState((prev) => ({ ...prev, isVerifying: true, error: null }));

    try {
      // Get auth options
      const optionsResponse = await fetch('/api/screen-lock/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!optionsResponse.ok) {
        throw new Error('Failed to get authentication options');
      }

      const { options } = await parseApiJson(optionsResponse) as {
        options: PublicKeyCredentialRequestOptionsJSON;
      };

      // Start authentication
      const authResult = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const verifyResponse = await fetch('/api/screen-lock/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResult }),
      });

      if (verifyResponse.ok) {
        unlock();
      } else {
        const data = await parseApiJson(verifyResponse);
        throw new Error(apiMessage(data, 'Authentication failed'));
      }
    } catch (error) {
      console.error('Passkey auth failed:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Authentication failed',
        isVerifying: false,
      }));
    }
  }, [state.isVerifying, unlock]);

  // Handle PIN input
  const handlePinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setState((prev) => ({ ...prev, pin: value, error: null }));
  }, []);

  // Handle PIN submission
  const handlePinSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (state.pin.length < 4 || state.isVerifying || state.lockedOut) return;

    setState((prev) => ({ ...prev, isVerifying: true, error: null }));

    try {
      const response = await fetch('/api/screen-lock/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: state.pin }),
      });

      const data = apiData<{
        verified?: boolean;
        message?: string;
        attemptsRemaining?: number;
        remainingSeconds?: number;
      }>(await parseApiJson(response));

      if (response.ok && data.verified) {
        unlock();
      } else if (response.status === 429) {
        // Locked out
        setState((prev) => ({
          ...prev,
          error: data.message ?? 'Too many failed attempts. Please wait before trying again.',
          isVerifying: false,
          lockedOut: true,
          lockedOutSeconds: data.remainingSeconds ?? 900,
          pin: '',
        }));
      } else {
        setState((prev) => ({
          ...prev,
          error: apiMessage(data, 'Incorrect PIN'),
          isVerifying: false,
          attemptsRemaining: data.attemptsRemaining ?? prev.attemptsRemaining - 1,
          pin: '',
        }));
      }
    } catch (error) {
      console.error('PIN verification failed:', error);
      setState((prev) => ({
        ...prev,
        error: 'Failed to verify PIN',
        isVerifying: false,
        pin: '',
      }));
    }
  }, [state.pin, state.isVerifying, state.lockedOut, unlock]);

  // Don't render if not locked or not enabled
  if (!isLocked || !isEnabled) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-9999 flex items-center justify-center bg-background/95 backdrop-blur-md"
      >
        <div className="w-full max-w-sm px-6">
          {/* Lock Icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center mb-8"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Screen Locked</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verify your identity to continue
            </p>
          </motion.div>

          {/* Auth Methods */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            {/* Error Message */}
            {state.error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            {/* Passkey Auth */}
            {hasPasskeys && state.mode === 'passkey' && (
              <div className="space-y-4">
                <Button
                  onClick={handlePasskeyAuth}
                  disabled={state.isVerifying}
                  className="w-full h-14 text-base"
                  size="lg"
                >
                  {state.isVerifying ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5 mr-2" />
                  )}
                  {state.isVerifying ? 'Verifying...' : 'Use Passkey'}
                </Button>

                {hasPin && (
                  <button
                    onClick={() => setState((prev) => ({ ...prev, mode: 'pin', error: null }))}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use PIN instead
                  </button>
                )}
              </div>
            )}

            {/* PIN Auth */}
            {(state.mode === 'pin' || !hasPasskeys) && hasPin && (
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pin" className="sr-only">
                    Enter PIN
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      ref={pinInputRef}
                      id="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={8}
                      value={state.pin}
                      onChange={handlePinChange}
                      disabled={state.isVerifying || state.lockedOut}
                      placeholder="Enter PIN"
                      className={cn(
                        'w-full h-14 pl-10 pr-4 text-center text-2xl tracking-[0.5em]',
                        'bg-muted border border-input rounded-lg',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'placeholder:text-muted-foreground placeholder:text-base placeholder:tracking-normal'
                      )}
                    />
                  </div>
                  {state.attemptsRemaining < 5 && state.attemptsRemaining > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {state.attemptsRemaining} attempt{state.attemptsRemaining !== 1 ? 's' : ''} remaining
                    </p>
                  )}
                  {state.lockedOut && (
                    <p className="text-xs text-destructive text-center">
                      Try again in {Math.floor(state.lockedOutSeconds / 60)}:{String(state.lockedOutSeconds % 60).padStart(2, '0')}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={state.pin.length < 4 || state.isVerifying || state.lockedOut}
                  className="w-full h-12"
                  size="lg"
                >
                  {state.isVerifying ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : null}
                  {state.isVerifying ? 'Verifying...' : 'Unlock'}
                </Button>

                {hasPasskeys && (
                  <button
                    type="button"
                    onClick={() => setState((prev) => ({ ...prev, mode: 'passkey', error: null, pin: '' }))}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use Passkey instead
                  </button>
                )}
              </form>
            )}

            {/* No auth methods */}
            {!hasPasskeys && !hasPin && (
              <div className="text-center text-sm text-muted-foreground">
                <p>No authentication method configured.</p>
                <p className="mt-2">Please contact support or sign out and back in.</p>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
