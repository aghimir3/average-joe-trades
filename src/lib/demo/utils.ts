/**
 * Demo mode detection utilities.
 *
 * Demo mode is activated by hostname detection in proxy.ts.
 * When a configured demo hostname is detected,
 * the proxy sets an x-demo-mode cookie and rewrites routes to /demo/*.
 */

import { APP_URL, DEMO_HOSTNAMES as CONFIGURED_DEMO_HOSTNAMES } from '@/lib/public-config';

/** Hostname patterns that activate demo mode */
export const DEMO_HOSTNAMES = CONFIGURED_DEMO_HOSTNAMES;

const DEMO_HOSTNAME_SET = new Set<string>(DEMO_HOSTNAMES);

/**
 * Normalize and validate whether a hostname is demo-enabled.
 * Accepts values with or without ports.
 */
export function isDemoHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().split(':')[0];
  return DEMO_HOSTNAME_SET.has(normalized);
}

/** Check demo mode from cookie (client-side) */
export function isDemoModeCookie(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDemoHostname(window.location.hostname)) return true;
  if (typeof document === 'undefined') return false;
  return document.cookie.includes('x-demo-mode=true');
}

/** Force demo mode via env var (local development) */
export function isDemoForced(): boolean {
  return process.env.NEXT_PUBLIC_FORCE_DEMO === 'true';
}

/**
 * Canonical main-app URL for escaping demo mode.
 */
export function getMainAppUrl(): string {
  return APP_URL;
}
