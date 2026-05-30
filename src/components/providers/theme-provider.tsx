/**
 * Theme Provider Component
 *
 * Provides dark/light/system mode support using next-themes.
 * Wraps the app to enable theme switching throughout.
 */

'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme provider that wraps the application.
 *
 * Features:
 * - System preference detection (auto mode)
 * - Persistent theme selection via localStorage
 * - Class-based dark mode for Tailwind CSS
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
