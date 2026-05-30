/**
 * Demo-specific QueryClient provider.
 *
 * Creates a QueryClient with all demo data pre-populated in the cache
 * and staleTime: Infinity so no API calls are ever made.
 *
 * Clears the persisted account selection so demo always starts with
 * the "All Accounts" view (avoids cache key mismatches when the user
 * has a real account ID stored in localStorage).
 */

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { populateDemoCache } from '@/lib/demo/seed-data';

const ACCOUNT_STORAGE_KEY = 'selectedBrokerageAccountId';
const SECTION_STORAGE_KEY = 'dashboardSectionStates';

// Module-level variables to save/restore user state across demo entry/exit.
let previousAccountId: string | null = null;
let previousSectionStates: string | null = null;

/**
 * Demo-friendly section defaults: only Charts & Calendar open.
 * Progressive disclosure — users see a clean overview first,
 * then expand the sections they care about.
 */
const DEMO_SECTION_STATES = JSON.stringify({
  'live-portfolio': false,
  'charts-calendar': true,
  'goals-streaks': false,
  'positions-trades': false,
  'performance': false,
  'wheel-strategy': false,
  'options-analytics': false,
  'market-scanner': false,
});

interface DemoQueryProviderProps {
  children: React.ReactNode;
}

export function DemoQueryProvider({ children }: DemoQueryProviderProps) {
  const [queryClient] = useState(() => {
    // Save and override localStorage values before first render so
    // downstream hooks read demo-friendly defaults.
    if (typeof window !== 'undefined') {
      try {
        // Account: clear stored ID so demo starts with "All Accounts"
        previousAccountId = localStorage.getItem(ACCOUNT_STORAGE_KEY);
        localStorage.removeItem(ACCOUNT_STORAGE_KEY);

        // Sections: pre-seed collapsed states for progressive disclosure
        previousSectionStates = localStorage.getItem(SECTION_STORAGE_KEY);
        localStorage.setItem(SECTION_STORAGE_KEY, DEMO_SECTION_STATES);
      } catch {
        // localStorage unavailable
      }
    }

    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // Never refetch — all data is static
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchOnMount: false,
        },
        mutations: {
          // Mutations are no-ops in demo
          retry: false,
        },
      },
    });

    // Pre-populate every query key with demo data
    populateDemoCache(client);

    return client;
  });

  // Restore original localStorage values when leaving demo mode
  useEffect(() => {
    return () => {
      try {
        if (previousAccountId) {
          localStorage.setItem(ACCOUNT_STORAGE_KEY, previousAccountId);
          previousAccountId = null;
        }
        if (previousSectionStates) {
          localStorage.setItem(SECTION_STORAGE_KEY, previousSectionStates);
        } else {
          localStorage.removeItem(SECTION_STORAGE_KEY);
        }
        previousSectionStates = null;
      } catch {
        // localStorage unavailable
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
