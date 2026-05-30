/**
 * Login card component for the authentication page.
 *
 * Displays the app branding and Google sign-in button.
 * This is a Client Component because it uses the signIn function
 * from next-auth/react which requires client-side JavaScript.
 *
 * Modern glassmorphism design with gradient accents.
 */

'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GoogleIcon } from '@/components/icons/google';
import { Logo } from '@/components/icons/logo';
import { createChildLogger } from '@/lib/logger';
import { Check, Loader2, Lock, CreditCard } from 'lucide-react';

/**
 * Client-side logger for login events.
 * Note: In production, sensitive logging should be server-side only.
 */
const loginLogger = createChildLogger({ module: 'login-card' });

function resolveSafeCallbackUrl(rawCallbackUrl: string | null): string {
  if (!rawCallbackUrl) return '/dashboard';
  if (rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')) {
    return rawCallbackUrl;
  }
  return '/dashboard';
}

/**
 * Login card with Google OAuth sign-in.
 *
 * Features:
 * - App branding and welcome message
 * - Google sign-in button with loading state
 * - Error handling with user feedback
 * - Modern glassmorphism design
 *
 * Sign-in flow:
 * 1. User clicks "Continue with Google"
 * 2. Loading state shown, button disabled
 * 3. Redirect to Google OAuth consent screen
 * 4. On success, redirect to /dashboard (handled by NextAuth)
 * 5. On error, display error message
 */
export function LoginCard() {
  const searchParams = useSearchParams();
  const callbackUrl = resolveSafeCallbackUrl(searchParams.get('callbackUrl'));

  /** Loading state while OAuth redirect is in progress */
  const [isLoading, setIsLoading] = useState(false);
  /** Error message to display if sign-in fails */
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles the Google sign-in button click.
   *
   * Initiates OAuth flow with Google provider.
   * Sets loading state and handles errors.
   */
  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      loginLogger.debug('Initiating Google sign-in');

      // Redirect to Google OAuth
      // callbackUrl determines where to go after successful auth
      await signIn('google', {
        callbackUrl,
      });
    } catch (err) {
      loginLogger.error({ err }, 'Google sign-in failed');
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  const benefits = [
    'Track all your trades in one place',
    'Powerful analytics and insights',
    'Sync with your favorite brokers',
  ];

  return (
    <div className="w-full max-w-md">
      {/* Main card with glassmorphism effect */}
      <div className="relative">
        {/* Glow effect behind card - more visible */}
        <div className="absolute -inset-2 bg-linear-to-r from-emerald-500/30 via-teal-500/30 to-emerald-500/30 rounded-3xl blur-2xl" />

        <div className="relative bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-8 shadow-2xl shadow-black/50">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/40 mb-5">
              <Logo className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Welcome to Average Joe Trades
            </h2>
            <p className="text-zinc-400">
              Sign in with Google to access your journal and guided setup
            </p>
          </div>

          {/* Benefits list */}
          <div className="space-y-3 mb-8">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <div className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-400" strokeWidth={3} />
                </div>
                <span className="text-sm text-zinc-300">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Error message display */}
          {error && (
            <div
              className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 mb-6"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Google sign-in button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-xl shadow-lg shadow-black/20 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ backgroundColor: '#ffffff', color: '#111827' }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#374151' }} />
                <span className="font-semibold" style={{ color: '#111827' }}>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-5 w-5" />
                <span className="font-semibold" style={{ color: '#111827' }}>Continue with Google</span>
              </>
            )}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-500">
            New users get a quick 3-step setup after sign-in.
          </p>

          {/* Spacing + Terms notice */}
          <p className="text-center text-xs text-zinc-500 leading-relaxed mt-6">
            By signing in, you agree to our{' '}
            <Link
              href="/terms"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Terms & Conditions
            </Link>
            {' '}and{' '}
            <Link
              href="/privacy"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>

      {/* Trust indicators */}
      <div className="mt-6 flex items-center justify-center gap-8 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-500" />
          <span>256-bit encryption</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
          <span>No credit card required</span>
        </div>
      </div>
    </div>
  );
}
