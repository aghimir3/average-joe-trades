/**
 * Demo mode banner + layout offset wrapper.
 *
 * Shows a fixed banner at the top of all demo pages and pushes
 * the fixed AppHeader / sidebar down via Tailwind child selectors
 * so nothing overlaps.
 *
 * Also wraps children - the demo layout renders:
 *   <DemoBanner>{children}</DemoBanner>
 */

'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { X, Eye, Compass } from 'lucide-react';
import { getMainAppUrl } from '@/lib/demo/utils';
import { startDemoTour } from './use-demo-tour';

interface DemoBannerProps {
  children: React.ReactNode;
}

/**
 * CSS offset classes applied when the banner is visible.
 *
 * - header: push fixed AppHeader down by banner height (36px = top-9)
 * - main:   increase pt to clear pushed-down header (pt-10 -> pt-19)
 * - aside:  push sidebar from top-16 (64px) to top-25 (100px)
 *           and shrink height accordingly
 */
const OFFSET_CLASSES = [
  '[&_header]:top-9!',
  '[&_main]:pt-19!',
  '[&_aside]:top-25!',
  '[&_aside]:h-[calc(100vh-100px)]!',
].join(' ');

export function DemoBanner({ children }: DemoBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { setTheme } = useTheme();
  const mainAppUrl = getMainAppUrl();

  // Default demo to dark mode for best visual impression
  useEffect(() => { setTheme('dark'); }, [setTheme]);

  return (
    <>
      {!dismissed && (
        <div className="fixed top-0 left-0 right-0 z-60 flex items-center justify-center gap-2 bg-linear-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm text-white shadow-lg">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            Demo mode — features are limited.
          </span>
          <a
            href={mainAppUrl}
            className="ml-1 underline underline-offset-2 font-semibold hover:text-emerald-100 transition-colors"
          >
            Sign up free
          </a>
          <span className="hidden sm:inline text-emerald-200">
            for the full experience.
          </span>
          <button
            onClick={() => startDemoTour()}
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium hover:bg-white/30 transition-colors"
          >
            <Compass className="h-3 w-3" />
            <span className="hidden sm:inline">Take a Tour</span>
            <span className="sm:hidden">Tour</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-emerald-700/50 transition-colors"
            aria-label="Dismiss demo banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={!dismissed ? OFFSET_CLASSES : ''}>{children}</div>
    </>
  );
}
