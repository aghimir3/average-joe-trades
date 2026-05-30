/**
 * Sign out button component.
 *
 * Client Component that handles user sign-out using NextAuth.
 * Displays a button that triggers the sign-out flow when clicked.
 *
 * @example
 * <SignOutButton />
 */

'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createChildLogger } from '@/lib/logger';

/**
 * Logger for sign-out events.
 */
const signOutLogger = createChildLogger({ module: 'sign-out' });

/**
 * Sign out button with loading state.
 *
 * Features:
 * - Loading state while sign-out is processing
 * - Redirects to home page after sign-out
 * - Logging for sign-out events
 */
export function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handles sign-out button click.
   * Initiates NextAuth sign-out flow.
   */
  const handleSignOut = async () => {
    try {
      setIsLoading(true);
      signOutLogger.debug('User initiating sign-out');

      await signOut({
        callbackUrl: '/',
      });
    } catch (error) {
      signOutLogger.error({ error }, 'Sign-out failed');
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Signing out...</span>
        </>
      ) : (
        <>
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </>
      )}
    </Button>
  );
}
