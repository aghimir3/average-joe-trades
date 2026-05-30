'use client';

/**
 * Landing Footer
 *
 * Simple footer with links and copyright.
 */

import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { COPYRIGHT_NAME } from '@/lib/public-config';

export function LandingFooter() {
  return (
    <footer className="relative py-8 sm:py-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-emerald-400 to-emerald-600">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">
              Average Joe Trades
            </span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6 text-sm">
            <Link
              href="/terms"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/contact"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Contact
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} {COPYRIGHT_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
