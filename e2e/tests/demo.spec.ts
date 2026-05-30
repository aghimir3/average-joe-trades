/**
 * Demo Mode E2E Tests
 *
 * Tests the application in demo mode (/demo/* routes) which requires
 * no authentication and no database. All data is pre-seeded into
 * TanStack Query cache with staleTime: Infinity.
 *
 * These tests are designed to run in CI (GitHub Actions) where no
 * database or secrets are available.
 */

import { test, expect } from '@playwright/test';
import { ErrorCollector, createErrorCollector } from '../utils/error-collector';

/** All demo routes to crawl. */
const DEMO_ROUTES = [
  '/demo/dashboard',
  '/demo/positions',
  '/demo/accounts',
  '/demo/strategies',
  '/demo/ai-insights',
  '/demo/journal',
  '/demo/tax-center',
  '/demo/import',
  '/demo/issues',
  '/demo/settings',
  '/demo/features',
  '/demo/chat',
];

let errorCollector: ErrorCollector;

test.describe('Demo Mode', () => {
  test.beforeAll(() => {
    errorCollector = createErrorCollector();
  });

  test.afterAll(() => {
    const report = errorCollector.generateReport();
    console.log(report);

    const summary = errorCollector.getSummary();
    console.log('\n--- JSON SUMMARY ---');
    console.log(JSON.stringify(summary, null, 2));
  });

  test.describe('Page Crawl', () => {
    for (const route of DEMO_ROUTES) {
      test(`should load ${route} without critical errors`, async ({ page }) => {
        errorCollector.attachToPage(page, route);

        await page.goto(route);
        await page.waitForLoadState('networkidle');

        // Page should have content
        const body = await page.locator('body').textContent();
        expect(body).toBeTruthy();

        // No critical errors (page crashes, 5xx, uncaught exceptions)
        const pageErrors = errorCollector.getErrorsForPage(route);
        const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');

        if (criticalErrors.length > 0) {
          console.log(`Critical errors on ${route}:`, criticalErrors);
        }

        expect(criticalErrors).toHaveLength(0);
      });
    }
  });

  test.describe('Demo Banner', () => {
    test('should show demo banner on dashboard', async ({ page }) => {
      await page.goto('/demo/dashboard');
      await page.waitForLoadState('networkidle');

      // Demo banner should be visible with demo mode text
      const banner = page.locator('text=Demo mode').first();
      await expect(banner).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Dashboard Content', () => {
    test('should render dashboard with seeded data', async ({ page }) => {
      errorCollector.attachToPage(page, '/demo/dashboard');

      await page.goto('/demo/dashboard');
      await page.waitForLoadState('networkidle');

      // Should have header/navigation
      const header = page.locator('header');
      await expect(header).toBeVisible();

      // Should have tab navigation (dashboard uses tabbed layout)
      const tabs = page.locator('[role="tablist"]').first();
      await expect(tabs).toBeVisible({ timeout: 10000 });

      // No critical errors
      const pageErrors = errorCollector.getErrorsForPage('/demo/dashboard');
      const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });

    test('should allow switching dashboard tabs', async ({ page }) => {
      errorCollector.attachToPage(page, '/demo/dashboard');

      await page.goto('/demo/dashboard');
      await page.waitForLoadState('networkidle');

      // Find tab triggers and click through them
      const tabTriggers = page.locator('[role="tab"]');
      const count = await tabTriggers.count();

      // Dashboard should have multiple tabs
      expect(count).toBeGreaterThan(1);

      // Click each tab — verify no crash
      for (let i = 0; i < Math.min(count, 6); i++) {
        const tab = tabTriggers.nth(i);
        if (await tab.isVisible()) {
          await tab.click();
          await page.waitForTimeout(500);
        }
      }

      // No critical errors after tab switching
      const pageErrors = errorCollector.getErrorsForPage('/demo/dashboard');
      const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe('Navigation Flow', () => {
    test('should navigate through demo pages without errors', async ({ page }) => {
      const flow = [
        { url: '/demo/dashboard', name: 'Dashboard' },
        { url: '/demo/positions', name: 'Positions' },
        { url: '/demo/strategies', name: 'Strategies' },
        { url: '/demo/ai-insights', name: 'AI Insights' },
        { url: '/demo/journal', name: 'Journal' },
        { url: '/demo/accounts', name: 'Accounts' },
      ];

      for (const step of flow) {
        errorCollector.attachToPage(page, step.url);

        await page.goto(step.url);
        await page.waitForLoadState('networkidle');

        // Screenshot for debugging
        await page.screenshot({
          path: `e2e-report/screenshots/demo-${step.name.toLowerCase()}.png`,
          fullPage: true,
        });

        // No critical errors per page
        const pageErrors = errorCollector.getErrorsForPage(step.url);
        const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');

        expect(
          criticalErrors,
          `Critical errors found on ${step.name} (${step.url})`
        ).toHaveLength(0);
      }
    });
  });

  test.describe('Responsiveness', () => {
    test('should render on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      errorCollector.attachToPage(page, '/demo/dashboard-mobile');

      await page.goto('/demo/dashboard');
      await page.waitForLoadState('networkidle');

      // Page should render without crashing
      const body = await page.locator('body').textContent();
      expect(body).toBeTruthy();

      // Should have some navigation (mobile bottom nav or hamburger)
      const nav = page.locator('nav').first();
      await expect(nav).toBeVisible({ timeout: 10000 });

      await page.screenshot({
        path: 'e2e-report/screenshots/demo-mobile.png',
        fullPage: true,
      });

      const pageErrors = errorCollector.getErrorsForPage('/demo/dashboard-mobile');
      const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });

    test('should render on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      errorCollector.attachToPage(page, '/demo/dashboard-tablet');

      await page.goto('/demo/dashboard');
      await page.waitForLoadState('networkidle');

      const body = await page.locator('body').textContent();
      expect(body).toBeTruthy();

      await page.screenshot({
        path: 'e2e-report/screenshots/demo-tablet.png',
        fullPage: true,
      });

      const pageErrors = errorCollector.getErrorsForPage('/demo/dashboard-tablet');
      const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe('Error Boundaries', () => {
    test('should handle invalid demo routes gracefully', async ({ page }) => {
      const invalidRoutes = ['/demo/nonexistent', '/demo/trade/edit/invalid-id'];

      for (const route of invalidRoutes) {
        errorCollector.attachToPage(page, route);

        const response = await page.goto(route);

        // Should not crash (< 500)
        expect(response?.status()).toBeLessThan(500);

        const crashed = await page.evaluate(() => {
          return (
            document.body.innerHTML.includes('crashed') ||
            document.body.innerHTML.includes('Application error')
          );
        });

        expect(crashed, `Page crashed on ${route}`).toBe(false);
      }
    });
  });
});
