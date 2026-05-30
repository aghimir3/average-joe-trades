'use client';

import { parseApiJson, apiData } from '@/lib/api/client';


/**
 * Screen Lock Provider
 *
 * Provides screen lock functionality with inactivity detection.
 * Uses react-idle-timer for robust activity tracking that works
 * even when the browser tab is in the background.
 *
 * Features:
 * - Configurable timeout (default: 5 minutes)
 * - Automatic locking on inactivity
 * - Manual lock option
 * - Persists lock state across page navigation
 * - Does not interfere with unauthenticated users
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useIdleTimer } from 'react-idle-timer';

// ============================================================================
// TYPES
// ============================================================================

interface ScreenLockSettings {
  screenLockEnabled: boolean;
  screenLockTimeout: number; // seconds
  hasPinConfigured: boolean;
  passkeys: Array<{
    id: string;
    deviceName: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
}

interface ScreenLockContextType {
  isLocked: boolean;
  isEnabled: boolean;
  settings: ScreenLockSettings | null;
  isLoading: boolean;
  lock: () => void;
  unlock: () => void;
  refetchSettings: () => Promise<void>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ScreenLockContext = createContext<ScreenLockContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface ScreenLockProviderProps {
  children: React.ReactNode;
}

export function ScreenLockProvider({ children }: ScreenLockProviderProps) {
  const { data: session, status } = useSession();
  const [isLocked, setIsLocked] = useState(false);
  const [settings, setSettings] = useState<ScreenLockSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Determine if screen lock should be active
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;
  const isEnabled = isAuthenticated && (settings?.screenLockEnabled ?? false);

  // Fetch settings when authenticated
  const fetchSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/screen-lock/settings');
      if (response.ok) {
        const data = await parseApiJson(response);
        setSettings(apiData<ScreenLockSettings>(data));
      } else {
        setSettings(null);
      }
    } catch (error) {
      console.error('Failed to fetch screen lock settings:', error);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Check for persisted lock state on mount
  useEffect(() => {
    if (isEnabled) {
      const wasLocked = sessionStorage.getItem('screenLocked') === 'true';
      if (wasLocked) {
        setIsLocked(true);
      }
    }
  }, [isEnabled]);

  // Lock handler
  const lock = useCallback(() => {
    if (isEnabled) {
      setIsLocked(true);
      sessionStorage.setItem('screenLocked', 'true');
    }
  }, [isEnabled]);

  // Unlock handler
  const unlock = useCallback(() => {
    setIsLocked(false);
    sessionStorage.removeItem('screenLocked');
  }, []);

  // Inactivity handler
  const onIdle = useCallback(() => {
    if (isEnabled && !isLocked) {
      lock();
    }
  }, [isEnabled, isLocked, lock]);

  // Configure idle timer
  const timeout = (settings?.screenLockTimeout ?? 300) * 1000; // Convert to ms

  useIdleTimer({
    timeout,
    onIdle,
    throttle: 500,
    // Track these events for activity
    events: [
      'mousemove',
      'keydown',
      'wheel',
      'DOMMouseScroll',
      'mousewheel',
      'mousedown',
      'touchstart',
      'touchmove',
      'MSPointerDown',
      'MSPointerMove',
      'visibilitychange',
      'focus',
    ],
    // Start timer immediately if screen lock is enabled
    startOnMount: isEnabled,
    // Don't start manually - let it be controlled by isEnabled
    startManually: !isEnabled,
    // Cross-tab synchronization
    crossTab: true,
  });

  const contextValue: ScreenLockContextType = {
    isLocked,
    isEnabled,
    settings,
    isLoading,
    lock,
    unlock,
    refetchSettings: fetchSettings,
  };

  return (
    <ScreenLockContext.Provider value={contextValue}>
      {children}
    </ScreenLockContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useScreenLock(): ScreenLockContextType {
  const context = useContext(ScreenLockContext);
  if (context === undefined) {
    throw new Error('useScreenLock must be used within a ScreenLockProvider');
  }
  return context;
}
