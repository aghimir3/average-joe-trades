/**
 * Vitest configuration for the application.
 *
 * Configures test environment, path aliases, and coverage settings.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use jsdom for DOM testing
    environment: 'jsdom',

    // Setup files to run before tests
    setupFiles: ['./src/test/setup.ts'],

    // Include test files (unit tests only)
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Exclude node_modules, build output, and smoke tests (which need DATABASE_URL)
    exclude: ['node_modules', '.next', 'drizzle', 'src/**/*.smoke.test.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
      ],
    },

    // Global test timeout
    testTimeout: 10000,

    // Allow globals like describe, it, expect
    globals: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    conditions: ['node', 'default'],
  },

  // Handle server-side packages
  ssr: {
    noExternal: ['drizzle-orm'],
  },
});
