/**
 * Server-side authentication utilities for protected routes.
 *
 * Provides helper functions to:
 * - Get the current session in Server Components
 * - Require authentication (redirect if not signed in)
 * - Get the current user ID
 * - Protect API routes
 *
 * These utilities wrap NextAuth's auth() function with common patterns
 * to reduce boilerplate in protected pages and API routes.
 *
 * @example
 * // In a Server Component
 * const user = await requireAuth();
 * console.log(user.email);
 *
 * @example
 * // In an API route
 * export async function GET() {
 *   const session = await requireAuthApi();
 *   // session is guaranteed to exist here
 * }
 */

import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createChildLogger } from '@/lib/logger';
import { apiUnauthorized } from '@/lib/api/response';
import type { Session } from 'next-auth';

/**
 * Logger for auth utility functions.
 */
const authLogger = createChildLogger({ module: 'auth-utils' });

/**
 * Gets the current session, returning null if not authenticated.
 *
 * Use this when you need to check authentication status without
 * automatically redirecting unauthenticated users.
 *
 * @returns The session object or null if not authenticated
 *
 * @example
 * const session = await getSession();
 * if (session) {
 *   // User is authenticated
 * }
 */
export async function getSession() {
  return auth();
}

/**
 * Requires authentication, redirecting to login if not authenticated.
 *
 * Use this in Server Components that should only be accessible to
 * authenticated users. Automatically redirects to the login page
 * if the user is not signed in.
 *
 * @param redirectTo - Optional URL to redirect to after login
 * @returns The authenticated user object (never null)
 * @throws Redirects to login page if not authenticated
 *
 * @example
 * // In a protected page
 * export default async function DashboardPage() {
 *   const user = await requireAuth();
 *   return <div>Welcome, {user.name}</div>;
 * }
 */
export async function requireAuth(redirectTo?: string) {
  const session = await auth();

  // Check for both session.user AND session.user.id
  // An empty/missing id means the session is invalid (e.g., version mismatch)
  if (!session?.user?.id) {
    authLogger.debug({ redirectTo }, 'Unauthenticated or invalid session, redirecting to login');

    // Build redirect URL with optional return path
    const loginUrl = redirectTo ? `/?callbackUrl=${encodeURIComponent(redirectTo)}` : '/';
    redirect(loginUrl);
  }

  authLogger.debug({ userId: session.user.id }, 'Authenticated user accessed protected route');

  return session.user;
}

/**
 * Gets the current user ID, throwing if not authenticated.
 *
 * Convenience function when you only need the user ID.
 *
 * @returns The authenticated user's ID
 * @throws Redirects to login if not authenticated
 *
 * @example
 * const userId = await getCurrentUserId();
 * const trades = await db.select().from(trades).where(eq(trades.userId, userId));
 */
export async function getCurrentUserId() {
  const user = await requireAuth();
  return user.id;
}

/**
 * Return type for checkAuthApi - discriminated union for type safety.
 */
type CheckAuthResult =
  | { session: null; response: NextResponse }
  | { session: Session; response: null };

/**
 * Authentication check for API routes.
 *
 * Returns the session if authenticated, or a 401 response if not.
 * Use this at the start of protected API route handlers.
 *
 * @returns Object with either session (success) or response (unauthorized)
 *
 * @example
 * export async function GET() {
 *   const { session, response } = await checkAuthApi();
 *   if (response) return response; // Return 401 if unauthorized
 *
 *   // Proceed with authenticated session
 *   return NextResponse.json({ userId: session.user.id });
 * }
 */
export async function checkAuthApi(): Promise<CheckAuthResult> {
  const session = await auth();

  // Check for both session.user AND session.user.id
  // An empty/missing id means the session is invalid (e.g., version mismatch)
  if (!session?.user?.id) {
    authLogger.warn('Unauthorized API access attempt or invalid session');

    return {
      session: null,
      response: apiUnauthorized('Authentication required'),
    };
  }

  return { session, response: null };
}

/**
 * Requires authentication for API routes.
 *
 * Similar to requireAuth but for API routes - returns the session
 * or throws a response that should be returned to the client.
 *
 * @returns The authenticated session
 * @throws Error with 401 response if not authenticated
 *
 * @example
 * export async function POST(request: Request) {
 *   try {
 *     const session = await requireAuthApi();
 *     // Handle authenticated request
 *   } catch (error) {
 *     if (error instanceof Response) return error;
 *     throw error;
 *   }
 * }
 */
export async function requireAuthApi() {
  const { session, response } = await checkAuthApi();

  if (response) {
    throw response;
  }

  return session as Session;
}

/**
 * Type representing an authenticated user from the session.
 */
export type AuthenticatedUser = NonNullable<Session['user']>;
