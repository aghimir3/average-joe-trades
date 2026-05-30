/**
 * NextAuth API route handler.
 *
 * This catch-all route handles all authentication-related endpoints:
 * - GET /api/auth/signin - Sign-in page (redirects to our custom page)
 * - POST /api/auth/signin/:provider - Initiate OAuth sign-in
 * - GET /api/auth/callback/:provider - OAuth callback handler
 * - GET /api/auth/signout - Sign-out page
 * - POST /api/auth/signout - Process sign-out
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/csrf - Get CSRF token
 * - GET /api/auth/providers - List available providers
 *
 * All authentication logic is defined in @/auth.ts.
 * This file simply re-exports the handlers.
 *
 * @see https://authjs.dev/getting-started/installation#configure
 */

import { handlers } from '@/auth';

/**
 * Export GET and POST handlers for NextAuth routes.
 * NextAuth v5 uses the App Router's route handlers.
 */
export const { GET, POST } = handlers;
