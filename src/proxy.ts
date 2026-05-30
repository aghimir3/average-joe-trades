/**
 * Next.js 16 proxy for authentication and request processing.
 *
 * This proxy runs on every request matching the configured paths.
 * Used for: demo subdomain rewrites, NextAuth session handling,
 * cookie clearing, cache control, and security headers.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { DEMO_HOSTNAMES } from '@/lib/demo/utils';

/**
 * Security headers to apply to all responses.
 * These help protect against common web vulnerabilities.
 */
function buildSecurityHeaders(): Record<string, string> {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    // Prevent clickjacking by disabling iframe embedding
    'X-Frame-Options': 'DENY',
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    // Control referrer information sent with requests
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Disable unnecessary browser features
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Content Security Policy - restrict resource loading
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com https://*.googleapis.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  };
}

/**
 * Cookie names used by NextAuth.
 * The exact names depend on environment (secure vs non-secure).
 */
const AUTH_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'authjs.callback-url',
  '__Secure-authjs.callback-url',
  'authjs.csrf-token',
  '__Secure-authjs.csrf-token',
];

/**
 * Public routes that don't require authentication.
 */
const PUBLIC_ROUTES = [
  '/',
  '/api/auth',
  '/privacy',
  '/terms',
  '/contact',
  '/demo',
  // Metadata and crawler endpoints must stay public for social/link previews and SEO.
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
];

/**
 * Check if a path is a public route.
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/** Check if request is from a demo subdomain. */
function isDemoHost(req: NextRequest): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return DEMO_HOSTNAMES.some((dh) => host === dh);
}

function setDemoCookie(response: NextResponse): void {
  response.cookies.set('x-demo-mode', 'true', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Auth-wrapped proxy handler.
 *
 * NextAuth v5 auth() adds req.auth (session) to the request.
 * We add: demo subdomain rewrites, auth redirects, security headers.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const securityHeaders = buildSecurityHeaders();

  // Demo subdomain: rewrite /dashboard → /demo/dashboard, etc.
  // Requests already on /demo/* pass through unchanged.
  if (isDemoHost(req) && !pathname.startsWith('/demo')) {
    // Allow root, static assets, and public pages to pass through
    if (pathname === '/' || isPublicRoute(pathname)) {
      // Rewrite root to demo dashboard
      if (pathname === '/') {
        const demoUrl = new URL('/demo/dashboard', req.nextUrl.origin);
        const response = NextResponse.rewrite(demoUrl);
        setDemoCookie(response);
        for (const [key, value] of Object.entries(securityHeaders)) {
          response.headers.set(key, value);
        }
        return response;
      }
    }

    // Rewrite all other paths to /demo/* equivalent
    const demoUrl = new URL(`/demo${pathname}`, req.nextUrl.origin);
    demoUrl.search = req.nextUrl.search;
    const response = NextResponse.rewrite(demoUrl);
    setDemoCookie(response);
    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // If user is not authenticated and accessing a protected route
  if (!req.auth && !isPublicRoute(pathname)) {
    // Redirect to login
    const loginUrl = new URL('/', req.nextUrl.origin);
    const response = NextResponse.redirect(loginUrl);

    // Clear any stale auth cookies
    for (const cookieName of AUTH_COOKIES) {
      response.cookies.delete(cookieName);
    }

    // Add security headers to redirect response
    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  }

  // For all other requests, continue with cache control headers
  const response = NextResponse.next();

  // Add cache control headers to prevent stale content
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  // Add security headers
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // Add HSTS in production (enforce HTTPS)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
});

/**
 * Proxy configuration.
 *
 * Defines which routes the proxy should run on.
 * Uses negative lookahead to exclude static files and API routes
 * that are authenticated at the route layer with checkAuthApi().
 */
export const config = {
  /**
   * Match all routes except:
   * - API routes (handled separately)
   * - Static files (_next/static, _next/image)
   * - Favicon and other root files
   * - PWA manifest and service worker
   */
  matcher: [
    {
      /*
       * Match all request paths except:
       * - api (API routes)
       * - _next/static (static files)
       * - _next/image (image optimization files)
       * - favicon.ico (favicon file)
       * - public files (public folder)
       * - manifest.webmanifest (PWA manifest)
       * - sw.js (service worker)
       */
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      // Skip prefetch requests to avoid unnecessary proxy work.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
