'use client';

/**
 * Service Worker Provider
 *
 * Registers the service worker for PWA functionality.
 * This enables:
 * - App installation on mobile devices
 * - Caching of static assets
 */

import { useEffect } from 'react';

export function ServiceWorkerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    }
  }, []);

  return <>{children}</>;
}
