/**
 * useSelectedAccount Hook
 *
 * Persists the selected brokerage account across page navigation.
 * Uses localStorage to remember the user's selection.
 */

'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const STORAGE_KEY = 'selectedBrokerageAccountId';

interface UseSelectedAccountOptions {
  /** If true, sync with URL params (for pages that support URL-based filtering) */
  syncWithUrl?: boolean;
}

interface UseSelectedAccountReturn {
  /** The currently selected account ID, or null for "All Accounts" */
  selectedAccountId: string | null;
  /** Update the selected account (persists to localStorage and optionally URL) */
  setSelectedAccountId: (accountId: string | null) => void;
  /** Whether the initial value has been loaded from storage */
  isInitialized: boolean;
}

// Storage subscription for useSyncExternalStore
let listeners: (() => void)[] = [];

function subscribeToStorage(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

function getStorageSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function setStorageValue(value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Notify all listeners
    listeners.forEach(l => l());
  } catch {
    // localStorage might not be available
  }
}

/**
 * Hook for managing persistent brokerage account selection.
 *
 * @param options.syncWithUrl - If true, updates URL params when selection changes
 * @returns Selected account state and setter
 */
export function useSelectedAccount(
  options: UseSelectedAccountOptions = {}
): UseSelectedAccountReturn {
  const { syncWithUrl = true } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Use useSyncExternalStore for localStorage to avoid setState in useEffect
  const storedValue = useSyncExternalStore(
    subscribeToStorage,
    getStorageSnapshot,
    getServerSnapshot
  );

  // Get URL param
  const urlAccountId = searchParams.get('account');

  // Priority: URL param > localStorage
  // Use URL param if present, otherwise use stored value
  const selectedAccountId = urlAccountId ?? storedValue;

  // Track if we need to sync URL with storage on first render
  const [hasInitialized, setHasInitialized] = useState(false);

  // Sync URL with storage if needed (only once, and only if no URL param)
  if (!hasInitialized && typeof window !== 'undefined') {
    setHasInitialized(true);
    if (!urlAccountId && storedValue && syncWithUrl) {
      // Update URL to match stored value (non-blocking)
      setTimeout(() => {
        router.replace(`${pathname}?account=${storedValue}`, { scroll: false });
      }, 0);
    } else if (urlAccountId && urlAccountId !== storedValue) {
      // URL has a value that's different from storage - save it
      setStorageValue(urlAccountId);
    }
  }

  const setSelectedAccountId = useCallback((accountId: string | null) => {
    // Update localStorage
    setStorageValue(accountId);

    // Update URL if sync is enabled
    if (syncWithUrl) {
      if (accountId) {
        router.push(`${pathname}?account=${accountId}`, { scroll: false });
      } else {
        router.push(pathname, { scroll: false });
      }
    }
  }, [syncWithUrl, router, pathname]);

  return {
    selectedAccountId,
    setSelectedAccountId,
    isInitialized: hasInitialized || typeof window === 'undefined',
  };
}

/**
 * Get the stored account ID without React hooks (for server components or initial loads)
 */
export function getStoredAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
