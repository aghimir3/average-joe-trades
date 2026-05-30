/**
 * Root layout component for the application.
 *
 * This is the top-level layout that wraps all pages. It provides:
 * - Global font configuration (Geist Sans and Mono)
 * - SessionProvider for authentication context
 * - Global CSS styles
 *
 * All pages inherit this layout structure.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates
 */

import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SessionProvider } from '@/components/providers/session-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ScreenLockProvider } from '@/components/providers/screen-lock-provider';
import { ServiceWorkerProvider } from '@/components/providers/service-worker-provider';
import { LockScreen } from '@/components/screen-lock/lock-screen';
import { ChatWidget } from '@/components/chat/chat-widget';
import { SITE_NAME, SITE_URL, SOCIAL_IMAGE_ALT, SOCIAL_IMAGE_URL } from '@/lib/seo';
import { LEGAL_ENTITY_NAME } from '@/lib/public-config';
import './globals.css';

/**
 * Geist Sans font configuration.
 * Primary font for body text and UI elements.
 */
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

/**
 * Geist Mono font configuration.
 * Monospace font for code blocks and numeric data.
 */
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/**
 * Site-wide SEO constants for consistent metadata across pages.
 */
const SITE_DESCRIPTION =
  'Free stock and options trading journal with AI Insights. Track trades with immutable FIFO P&L, sync Robinhood, Schwab, Fidelity, and Interactive Brokers via SnapTrade, and get clear next actions from Actions, Alpha Lab, and Risk dashboards.';

/**
 * Application metadata for SEO and browser display.
 * Includes Open Graph, Twitter Cards, and comprehensive SEO tags.
 */
export const metadata: Metadata = {
  // Base metadata
  title: {
    default: 'Average Joe Trades - Free Stock & Options Trading Journal',
    template: '%s | Average Joe Trades',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'trading journal',
    'options trading',
    'stock trading',
    'P&L tracking',
    'portfolio tracker',
    'FIFO matching',
    'wheel strategy',
    'covered calls',
    'cash secured puts',
    'AI trading insights',
    'alpha lab backtesting',
    'portfolio risk dashboard',
    'ticker advisor',
    'trading analytics',
    'SnapTrade',
    'Robinhood',
    'Schwab',
    'Fidelity',
    'Interactive Brokers',
    'IBKR',
    'brokerage sync',
    'trade journal',
    'investment tracker',
  ],
  ...(LEGAL_ENTITY_NAME
    ? {
        authors: [{ name: LEGAL_ENTITY_NAME }],
        creator: LEGAL_ENTITY_NAME,
        publisher: LEGAL_ENTITY_NAME,
      }
    : {}),

  // Metadata base for relative URLs
  metadataBase: new URL(SITE_URL),

  // Alternate languages (primarily English)
  alternates: {
    canonical: SITE_URL,
  },

  // Open Graph metadata for social sharing
  // Use one canonical social preview image for all link shares.
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'Average Joe Trades - Free Stock & Options Trading Journal',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SOCIAL_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },

  // Twitter Card metadata
  // Reuse the canonical Open Graph image.
  twitter: {
    card: 'summary_large_image',
    title: 'Average Joe Trades - Free Stock & Options Trading Journal',
    description: SITE_DESCRIPTION,
    creator: '@AverageJoeTrades',
    site: '@AverageJoeTrades',
    images: [SOCIAL_IMAGE_URL],
  },

  // Robots directives (allow indexing of public pages)
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // PWA and app configuration
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AJ Trades',
  },
  formatDetection: {
    telephone: false,
  },

  // Category for app stores
  category: 'finance',

  // Icons configuration
  icons: {
    icon: [
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },

  // Verification for search consoles (add actual IDs when available)
  // verification: {
  //   google: 'your-google-verification-id',
  //   yandex: 'your-yandex-verification-id',
  // },
};

/**
 * Viewport configuration for PWA.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

/**
 * Root layout component.
 *
 * Wraps all pages with:
 * - HTML document structure
 * - Font CSS variables
 * - SessionProvider for auth context throughout the app
 *
 * @param props - Layout props
 * @param props.children - Child page components
 */
/**
 * JSON-LD structured data for SEO.
 * Helps search engines understand the app as a SoftwareApplication.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '50',
    bestRating: '5',
    worstRating: '1',
  },
  featureList: [
    'Stock and options trade journaling',
    'Immutable FIFO-based P&L calculation',
    'Multi-broker sync via SnapTrade (Robinhood, Schwab, Fidelity, Interactive Brokers)',
    'AI Insights Actions tab with simple and advanced recommendations',
    'Alpha Lab walk-forward backtesting',
    'Portfolio risk dashboard with risk flags',
    'Ticker advisor and community regime insights',
    'Tax center with wash sale detection',
    'Trading calendar and performance charts',
  ],
  ...(LEGAL_ENTITY_NAME
    ? {
        author: {
          '@type': 'Organization',
          name: LEGAL_ENTITY_NAME,
          url: SITE_URL,
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD structured data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 overflow-x-hidden`}
        suppressHydrationWarning
      >
        <ServiceWorkerProvider>
          <ThemeProvider>
            <SessionProvider>
              <QueryProvider>
                <ScreenLockProvider>
                  {children}
                  {/* Floating Joey chat widget (authenticated pages only) */}
                  <ChatWidget />
                  {/* Screen Lock Overlay */}
                  <LockScreen />
                </ScreenLockProvider>
              </QueryProvider>
            </SessionProvider>
          </ThemeProvider>
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
