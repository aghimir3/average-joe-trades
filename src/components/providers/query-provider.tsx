/**
 * TanStack Query provider for the application.
 *
 * Provides React Query context for server state management.
 * Configured with sensible defaults for the trading app.
 */

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * Query provider with client-side QueryClient instance.
 *
 * Creates a new QueryClient per request to avoid sharing
 * state between users in server-side rendering scenarios.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: 30 seconds (trades don't update frequently)
            staleTime: 30 * 1000,
            // Retry failed requests once
            retry: 1,
            // Refetch on window focus for fresh data
            refetchOnWindowFocus: true,
          },
          mutations: {
            // Retry mutations once on failure
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
