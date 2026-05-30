/**
 * Client-side SessionProvider wrapper for NextAuth.
 *
 * This component wraps the NextAuth SessionProvider to make session
 * data available throughout the React component tree via useSession hook.
 *
 * Must be used in a Client Component (hence "use client" directive).
 * Typically wrapped around the app in the root layout.
 *
 * @example
 * // In layout.tsx
 * <SessionProvider>
 *   {children}
 * </SessionProvider>
 *
 * @example
 * // In a component
 * const { data: session, status } = useSession();
 * if (status === 'authenticated') {
 *   console.log(session.user.email);
 * }
 */

'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

/**
 * Props for the SessionProvider component.
 */
interface SessionProviderProps {
  /** Child components that need access to session data */
  children: React.ReactNode;
}

/**
 * Provides session context to all child components.
 *
 * Wraps NextAuth's SessionProvider to enable:
 * - useSession() hook for accessing session data
 * - Automatic session refresh on window focus
 * - Session state management (loading, authenticated, unauthenticated)
 *
 * @param props - Component props
 * @param props.children - Child components to wrap
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
