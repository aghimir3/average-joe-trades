import { test as setup } from '@playwright/test';

/**
 * Authentication Setup
 *
 * In CI mode without a real database, we skip authentication setup
 * and only test public pages. Protected routes will redirect to login.
 *
 * For local development with a database, authentication can be set up
 * by running the dev server with proper DATABASE_URL.
 */
setup('authenticate', async ({ context }) => {
  // In CI without proper database/auth, just create empty auth state
  // This allows tests to run but protected routes will redirect to login
  const isCI = process.env.CI === 'true';

  if (isCI) {
    console.log('CI mode: Skipping authentication setup (no database available)');
    console.log('Protected route tests will be skipped or show login page');
  }

  // Save empty storage state - tests will check for auth and skip if needed
  await context.storageState({ path: 'e2e/.auth/user.json' });
});
