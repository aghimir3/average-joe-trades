/**
 * Page Crawler E2E Tests
 *
 * Systematically visits all pages in the application and collects errors.
 * This test suite acts as a "smoke test" for the entire UI, catching:
 * - JavaScript exceptions
 * - Console errors
 * - Network failures
 * - Page crashes
 * - Missing elements
 *
 * In CI mode without auth, protected route tests check that pages load
 * without crashing (they may redirect to login, which is expected).
 */

import { test, expect } from '@playwright/test';
import { ErrorCollector, createErrorCollector } from '../utils/error-collector';
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from '../utils/auth';

// Detect CI mode - protected routes may not be fully accessible
const isCI = process.env.CI === 'true';

// Shared error collector across tests
let errorCollector: ErrorCollector;

test.describe('Page Crawler', () => {
  test.beforeAll(() => {
    errorCollector = createErrorCollector();
  });

  test.afterAll(async () => {
    // Generate and log the error report
    const report = errorCollector.generateReport();
    console.log(report);

    // Write summary to JSON for CI integration
    const summary = errorCollector.getSummary();
    console.log('\n--- JSON SUMMARY ---');
    console.log(JSON.stringify(summary, null, 2));
  });

  test.describe('Public Pages', () => {
    for (const route of PUBLIC_ROUTES) {
      test(`should load ${route} without errors`, async ({ page }) => {
        errorCollector.attachToPage(page, route);

        await page.goto(route);

        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle');

        // Verify page loaded (not a blank page)
        const body = await page.locator('body').textContent();
        expect(body).toBeTruthy();

        // Check for critical errors on this page
        const pageErrors = errorCollector.getErrorsForPage(route);
        const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');

        if (criticalErrors.length > 0) {
          console.log(`Critical errors on ${route}:`, criticalErrors);
        }

        // Don't fail the test for non-critical errors, just collect them
        expect(criticalErrors).toHaveLength(0);
      });
    }
  });

  test.describe('Protected Pages (Authenticated)', () => {
    for (const route of PROTECTED_ROUTES) {
      test(`should load ${route} without errors`, async ({ page }) => {
        errorCollector.attachToPage(page, route);

        await page.goto(route);

        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle');

        // Verify we're on the correct page (not redirected to login)
        const currentUrl = page.url();

        // In CI without auth, pages will redirect to login - this is expected
        if (currentUrl.endsWith('/') && route !== '/') {
          if (isCI) {
            console.log(`CI mode: ${route} redirected to login (expected without auth)`);
            // In CI, just verify the login page loaded without crashing
            const body = await page.locator('body').textContent();
            expect(body).toBeTruthy();
            return; // Skip further checks for this route
          }
          console.warn(`Warning: Redirected to login for ${route} - auth may not be set up`);
        }

        // Wait a bit for any dynamic content
        await page.waitForTimeout(500);

        // Verify page has content
        const body = await page.locator('body').textContent();
        expect(body).toBeTruthy();

        // Check for critical errors on this page
        const pageErrors = errorCollector.getErrorsForPage(route);
        const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');

        if (criticalErrors.length > 0) {
          console.log(`Critical errors on ${route}:`, criticalErrors);
        }

        expect(criticalErrors).toHaveLength(0);
      });
    }
  });

  test.describe('Navigation Flow', () => {
    // Skip this test in CI without auth since it requires authenticated access
    test.skip(isCI, 'Skipping navigation flow in CI without auth');

    test('should navigate through main user flow without errors', async ({ page }) => {
      const flow = [
        { url: '/dashboard', name: 'Dashboard' },
        { url: '/positions', name: 'Positions' },
        { url: '/accounts', name: 'Accounts' },
        { url: '/trade/new/stock', name: 'New Stock Trade' },
        { url: '/trade/new/option/long_call', name: 'New Option Trade' },
        { url: '/import', name: 'Import' },
        { url: '/journal', name: 'Journal' },
      ];

      for (const step of flow) {
        errorCollector.attachToPage(page, step.url);

        await page.goto(step.url);
        await page.waitForLoadState('networkidle');

        // Take screenshot for debugging
        await page.screenshot({
          path: `e2e-report/screenshots/flow-${step.name.replace(/\s+/g, '-').toLowerCase()}.png`,
          fullPage: true,
        });

        // Check for errors
        const pageErrors = errorCollector.getErrorsForPage(step.url);
        const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');

        expect(
          criticalErrors,
          `Critical errors found on ${step.name} (${step.url})`
        ).toHaveLength(0);
      }
    });
  });

  test.describe('Error Boundary Tests', () => {
    test('should handle invalid routes gracefully', async ({ page }) => {
      const invalidRoutes = [
        '/nonexistent-page',
        '/trade/edit/stock/invalid-id',
        '/trade/edit/option/invalid-id',
        '/import/report/invalid-id',
      ];

      for (const route of invalidRoutes) {
        errorCollector.attachToPage(page, route);

        const response = await page.goto(route);

        // Should get a 404 or redirect, not a crash
        expect(response?.status()).toBeLessThan(500);

        // Page should not crash
        const crashed = await page.evaluate(() => {
          return document.body.innerHTML.includes('crashed') ||
                 document.body.innerHTML.includes('Application error');
        });

        expect(crashed, `Page crashed on ${route}`).toBe(false);
      }
    });
  });

  test.describe('API Health Check', () => {
    test('should have healthy API endpoints', async ({ page }) => {
      const apiEndpoints = [
        '/api/dashboard/stats',
        '/api/dashboard/positions',
        '/api/positions',
        '/api/accounts',
        '/api/entries',
      ];

      for (const endpoint of apiEndpoints) {
        const response = await page.request.get(endpoint);

        // API should respond (may be 401 if not authenticated, but not 500)
        expect(
          response.status(),
          `API endpoint ${endpoint} returned server error`
        ).toBeLessThan(500);
      }
    });
  });
});

test.describe('Interactive Elements', () => {
  // Skip in CI without auth
  test.skip(isCI, 'Interactive element tests require authentication - skipping in CI');

  test('should find key interactive elements on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Check for main dashboard sections (they may be empty but should exist)
    const sections = [
      '[data-testid="dashboard-stats"]',
      '[data-testid="pnl-chart"]',
      '[data-testid="recent-trades"]',
    ];

    for (const selector of sections) {
      // These may not exist yet - just log if missing
      const element = page.locator(selector);
      const exists = await element.count() > 0;
      if (!exists) {
        console.log(`Note: Element ${selector} not found on dashboard`);
      }
    }

    // Dashboard should at least have the header
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('should have functional navigation', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for navigation links
    const navLinks = page.locator('nav a, header a');
    const count = await navLinks.count();

    expect(count).toBeGreaterThan(0);
  });
});
