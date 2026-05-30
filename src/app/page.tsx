/**
 * Login page - the entry point for unauthenticated users.
 *
 * Displays a beautiful landing page with login functionality.
 * If the user is already authenticated, redirects to /dashboard.
 *
 * This is a Server Component that checks authentication status
 * server-side before rendering, avoiding flash of unauthenticated content.
 *
 * @see /src/auth.ts for authentication configuration
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LandingPage } from '@/components/landing';
import { SITE_URL, SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL } from '@/lib/seo';

/**
 * SEO metadata for the landing page.
 * This is the primary entry point for organic search traffic.
 */
export const metadata: Metadata = {
  title: 'Average Joe Trades - Free Stock & Options Trading Journal',
  description:
    'Free stock and options trading journal with AI Insights. Track trades with immutable FIFO P&L, sync Robinhood, Schwab, Fidelity, and Interactive Brokers via SnapTrade, and get clear next actions from Actions, Alpha Lab, and Risk dashboards.',
  keywords: [
    'trading journal',
    'options trading journal',
    'stock trading journal',
    'free trading journal',
    'P&L tracker',
    'portfolio tracker',
    'wheel strategy',
    'covered calls',
    'cash secured puts',
    'AI trading insights',
    'alpha lab backtesting',
    'portfolio risk dashboard',
    'ticker advisor',
    'Robinhood trading',
    'Schwab trading',
    'Fidelity trading',
    'Interactive Brokers trading',
    'IBKR trading journal',
    'FIFO P&L',
    'trade analytics',
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Average Joe Trades - Free Stock & Options Trading Journal',
    description:
      'Track trades with immutable FIFO P&L, sync multiple brokers, and get AI-powered next actions with Alpha Lab and Risk insights.',
    url: SITE_URL,
    type: 'website',
    images: [
      {
        url: SOCIAL_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
};

/**
 * Root page component.
 *
 * Authentication flow:
 * 1. Check session server-side using auth()
 * 2. If authenticated, redirect to dashboard
 * 3. If not authenticated, render landing page
 *
 * This prevents showing the login page to authenticated users
 * and avoids client-side redirect flicker.
 */
export default async function LoginPage() {
  // Check authentication status server-side
  const session = await auth();

  // Redirect authenticated users to dashboard
  // Note: We check user.id because an invalidated session may have user object
  // but with empty id (set by session callback on version mismatch)
  if (session?.user?.id) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
