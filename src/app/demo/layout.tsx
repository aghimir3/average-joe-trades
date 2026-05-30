/**
 * Demo route group layout.
 *
 * Wraps all /demo/* pages with:
 * - DemoQueryProvider (pre-populated TanStack Query cache, no API calls)
 * - DemoBanner (fixed banner + CSS offsets that push the header down)
 *
 * No authentication required — this layout bypasses requireAuth().
 * ThemeProvider and SessionProvider are already in the root layout.
 */

import { DemoQueryProvider } from '@/components/providers/demo-query-provider';
import { DemoBanner } from '@/components/demo/demo-banner';
import type { Metadata } from 'next';

/** Prevent static prerendering — demo pages rely on client-side hooks (useSearchParams). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoQueryProvider>
      <DemoBanner>
        {children}
      </DemoBanner>
    </DemoQueryProvider>
  );
}
