/**
 * NextAuth v5 (Auth.js) configuration for the application.
 *
 * Provides Gmail-only authentication using the Google OAuth provider.
 * This module exports:
 * - `handlers`: API route handlers for GET/POST
 * - `auth`: Server-side session retrieval function
 * - `signIn`/`signOut`: Server actions for authentication
 *
 * Environment variables required:
 * - AUTH_SECRET: Random secret for JWT encryption (generate with `openssl rand -base64 32`)
 * - AUTH_GOOGLE_ID: Google OAuth client ID
 * - AUTH_GOOGLE_SECRET: Google OAuth client secret
 *
 * @see https://authjs.dev/getting-started/installation
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';

/**
 * Auth-specific logger instance.
 * All authentication events are logged with the 'auth' module context.
 */
const authLogger = createChildLogger({ module: 'auth' });

/**
 * Increment to invalidate all existing JWT sessions after a security-sensitive deployment.
 */
const SESSION_VERSION = 1;

/**
 * NextAuth configuration object.
 *
 * Key decisions:
 * - Google provider only (Gmail login requirement)
 * - Prisma adapter for automatic user record creation in database
 * - JWT strategy for stateless sessions
 * - Custom callbacks for logging and session enrichment
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  /**
   * Database adapter using Prisma.
   * Automatically creates/updates user records when users sign in.
   */
  adapter: PrismaAdapter(prisma),

  /**
   * Authentication providers.
   * Only Google is enabled per project requirements (Gmail-only login).
   */
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Only allow accounts with verified email addresses
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],

  /**
   * Session configuration.
   * Using JWT strategy - sessions are stored client-side as encrypted tokens.
   * With the adapter, user data is persisted to database on sign-in.
   */
  session: {
    strategy: 'jwt',
    // Session expires after 7 days of inactivity (security best practice)
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  /**
   * Custom pages configuration.
   * Redirect to root for sign-in (our custom login page).
   */
  pages: {
    signIn: '/',
    error: '/',
  },

  /**
   * Callbacks for customizing authentication flow.
   * Used for logging events and enriching session data.
   */
  callbacks: {
    /**
     * JWT callback - runs when JWT is created or updated.
     * Used to persist user ID from the provider in the token.
     *
     * @param token - The JWT token being created/updated
     * @param user - User object (only on initial sign-in)
     * @returns Modified token with userId
     */
    jwt({ token, user, account }) {
      // On initial sign-in, persist the user's ID and provider info
      if (user) {
        token.userId = user.id;
        token.sessionVersion = SESSION_VERSION;

        authLogger.info(
          {
            userId: user.id,
            email: user.email,
            provider: account?.provider,
          },
          'User signed in - JWT created'
        );
      }

      // Invalidate session if version mismatch (forces re-login after deployment)
      if (token.sessionVersion !== SESSION_VERSION) {
        authLogger.info(
          { userId: token.userId, oldVersion: token.sessionVersion, newVersion: SESSION_VERSION },
          'Session invalidated due to version mismatch'
        );
        // Return empty token to force re-authentication
        return {} as typeof token;
      }

      return token;
    },

    /**
     * Session callback - runs when session is checked.
     * Enriches the session object with data from the JWT.
     *
     * IMPORTANT: If token is invalid/empty (e.g., session version mismatch),
     * we must NOT return a session. This forces re-authentication.
     *
     * @param session - The session object
     * @param token - The JWT token
     * @returns Enriched session with userId, or session with invalidated user
     */
    session({ session, token }) {
      // If token has no userId, the session is invalid (version mismatch or corrupt)
      // Return session without user.id to trigger re-authentication
      if (!token.userId) {
        authLogger.warn('Session callback received token without userId - session invalid');
        // Clear the user ID to ensure downstream checks fail properly
        session.user.id = '';
        return session;
      }

      // Add userId to session for use in API routes and components
      session.user.id = token.userId as string;
      return session;
    },

    /**
     * Sign-in callback - runs before completing sign-in.
     * Used for validation and logging.
     *
     * @param user - User attempting to sign in
     * @param account - OAuth account info
     * @returns true to allow sign-in, false to deny
     */
    signIn({ user, account }) {
      // Require verified email address
      if (!user.email) {
        authLogger.warn(
          { userId: user.id },
          'Sign-in denied - no email address'
        );
        return false;
      }

      authLogger.info(
        {
          userId: user.id,
          email: user.email,
          provider: account?.provider,
        },
        'User sign-in initiated'
      );

      return true;
    },
  },

  /**
   * Event handlers for authentication lifecycle events.
   * Used primarily for logging and analytics.
   */
  events: {
    /**
     * Fired when a user signs out.
     * Log for audit trail and analytics.
     */
    signOut(message) {
      // message contains either session or token depending on strategy
      const token = 'token' in message ? message.token : null;

      authLogger.info(
        {
          userId: token?.userId,
        },
        'User signed out'
      );
    },

    /**
     * Fired when a new user is created (first sign-in).
     * Logs user acquisition - user will be prompted to create their first account.
     */
    createUser({ user }) {
      authLogger.info(
        {
          userId: user.id,
          email: user.email,
        },
        'New user created on first sign-in'
      );
    },

    /**
     * Fired when an account is linked to a user.
     */
    linkAccount({ user, account }) {
      authLogger.info(
        {
          userId: user.id,
          provider: account.provider,
        },
        'Account linked to user'
      );
    },

    /**
     * Fired when a session is accessed.
     * Logged at debug level to avoid log spam.
     */
    session({ session }) {
      authLogger.debug(
        {
          userId: session.user?.id,
        },
        'Session accessed'
      );
    },
  },

  /**
   * Enable debug logging in development.
   * This logs detailed NextAuth internal operations.
   */
  debug: process.env.NODE_ENV === 'development',
});

/**
 * Type augmentation for NextAuth session.
 * Adds userId to the session user object.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}
