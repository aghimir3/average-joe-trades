/**
 * Vitest configuration for smoke tests.
 *
 * Smoke tests run against a real database and test integration
 * between components. They are slower but more realistic.
 *
 * Run with: npm run test:smoke
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use node environment (no DOM needed for API tests)
    environment: 'node',

    // Setup files for smoke tests
    setupFiles: ['./src/test/smoke-setup.ts'],

    // Only include smoke test files
    include: ['src/**/*.smoke.test.ts'],

    // Exclude regular tests
    exclude: ['node_modules', '.next'],

    // Longer timeout for database operations
    testTimeout: 30000,

    // Run tests sequentially to avoid database conflicts
    sequence: {
      concurrent: false,
    },

    // Allow globals
    globals: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
