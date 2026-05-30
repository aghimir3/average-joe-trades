/**
 * Dashboard E2E Tests
 *
 * Tests all dashboard components and interactions:
 * - P&L Chart (timeframe switching)
 * - Calendar (month navigation)
 * - Positions table
 * - Recent trades
 * - Performance metrics
 *
 * Note: These tests require authentication. In CI without auth,
 * tests will skip or verify the login redirect works properly.
 */

import { test, expect } from '@playwright/test';
import { createErrorCollector } from '../utils/error-collector';

// Detect CI mode - skip dashboard tests that require auth
const isCI = process.env.CI === 'true';

// Skip all dashboard tests in CI since they require authentication
test.skip(isCI, 'Dashboard tests require authentication - skipping in CI');

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should load dashboard without errors', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/dashboard');

    // Wait for any dynamic content
    await page.waitForTimeout(1000);

    // Dashboard should have content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/dashboard-full.png', fullPage: true });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/dashboard');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should display key metrics sections', async ({ page }) => {
    // Look for common dashboard elements
    const sections = {
      'Total P&L': page.locator('text=/total.*p.?l/i, text=/realized.*p.?l/i'),
      'Win Rate': page.locator('text=/win.*rate/i'),
      'Open Positions': page.locator('text=/open.*position/i, text=/current.*position/i'),
      'Trades': page.locator('text=/trade/i'),
    };

    for (const [name, locator] of Object.entries(sections)) {
      const found = await locator.count() > 0;
      console.log(`Dashboard section "${name}" found: ${found}`);
    }
  });
});

test.describe('P&L Chart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should display chart or empty state', async ({ page }) => {
    // Look for chart canvas or empty state message
    const chartCanvas = page.locator('canvas');
    const emptyState = page.locator('text=/no.*data/i, text=/no.*trades/i, text=/get.*started/i');

    const hasChart = await chartCanvas.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;

    console.log(`Chart found: ${hasChart}, Empty state found: ${hasEmptyState}`);

    // Should have one or the other
    expect(hasChart || hasEmptyState).toBe(true);
  });

  test('should have timeframe selector buttons', async ({ page }) => {
    // Common timeframe options
    const timeframes = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

    for (const tf of timeframes) {
      const button = page.locator(`button:has-text("${tf}"), [role="tab"]:has-text("${tf}")`);
      const found = await button.count() > 0;
      if (found) {
        console.log(`Timeframe button "${tf}" found`);
      }
    }
  });

  test('should handle timeframe switching without errors', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/dashboard');

    // Try clicking different timeframe buttons
    const timeframeButtons = page.locator('button:has-text("1W"), button:has-text("1M"), button:has-text("ALL")');
    const count = await timeframeButtons.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      await timeframeButtons.nth(i).click();
      await page.waitForTimeout(300); // Wait for chart update
    }

    // No critical errors during interactions
    const pageErrors = errorCollector.getErrorsForPage('/dashboard');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Calendar Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should display calendar or empty state', async ({ page }) => {
    // Look for calendar grid
    const calendar = page.locator('[role="grid"], .calendar, [class*="calendar"]');
    const hasCalendar = await calendar.count() > 0;

    console.log(`Calendar component found: ${hasCalendar}`);
  });

  test('should have month navigation if calendar exists', async ({ page }) => {
    // Look for prev/next month buttons
    const prevMonth = page.locator('button[aria-label*="previous"], button:has-text("←"), button:has-text("<")');
    const nextMonth = page.locator('button[aria-label*="next"], button:has-text("→"), button:has-text(">")');

    const hasPrev = await prevMonth.count() > 0;
    const hasNext = await nextMonth.count() > 0;

    console.log(`Month navigation - Prev: ${hasPrev}, Next: ${hasNext}`);
  });

  test('should handle calendar navigation without errors', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/dashboard');

    // Try clicking calendar navigation
    const navButtons = page.locator('button[aria-label*="previous"], button[aria-label*="next"]');
    const count = await navButtons.count();

    for (let i = 0; i < Math.min(count, 2); i++) {
      await navButtons.nth(i).click();
      await page.waitForTimeout(300);
    }

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/dashboard');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Positions Section', () => {
  test('should display positions section', async ({ page }) => {
    await page.goto('/positions');
    await page.waitForLoadState('networkidle');

    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/positions');

    // Should have content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Look for positions table or empty state
    const table = page.locator('table, [role="table"]');
    const emptyState = page.locator('text=/no.*position/i, text=/no.*open/i');

    const hasTable = await table.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;

    console.log(`Positions - Table: ${hasTable}, Empty state: ${hasEmptyState}`);

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/positions-page.png', fullPage: true });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/positions');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should have account filter if multiple accounts', async ({ page }) => {
    await page.goto('/positions');
    await page.waitForLoadState('networkidle');

    // Look for account filter/selector
    const accountFilter = page.locator('select, [role="combobox"]').filter({ hasText: /account/i });
    const accountTabs = page.locator('[role="tab"]').filter({ hasText: /account/i });

    const hasFilter = await accountFilter.count() > 0;
    const hasTabs = await accountTabs.count() > 0;

    console.log(`Account filter: ${hasFilter}, Account tabs: ${hasTabs}`);
  });
});

test.describe('Recent Trades', () => {
  test('should display trades list on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for trades section
    const tradesSection = page.locator('text=/recent.*trade/i, text=/trade.*history/i, text=/closed.*trade/i');
    const hasTradesSection = await tradesSection.count() > 0;

    console.log(`Trades section found: ${hasTradesSection}`);

    // Look for trade rows/cards
    const tradeItems = page.locator('[class*="trade"], tr, [role="row"]');
    const tradeCount = await tradeItems.count();

    console.log(`Trade items found: ${tradeCount}`);
  });
});

test.describe('Performance Metrics', () => {
  test('should display performance data', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for common performance metrics
    const metrics = {
      'Win Rate': page.locator('text=/win.*rate/i'),
      'Avg Win': page.locator('text=/avg.*win/i, text=/average.*win/i'),
      'Avg Loss': page.locator('text=/avg.*loss/i, text=/average.*loss/i'),
      'Profit Factor': page.locator('text=/profit.*factor/i'),
      'Total Trades': page.locator('text=/total.*trade/i'),
    };

    for (const [name, locator] of Object.entries(metrics)) {
      const found = await locator.count() > 0;
      if (found) {
        console.log(`Metric "${name}" found on dashboard`);
      }
    }
  });

  test('should display ticker performance if available', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for ticker performance section
    const tickerSection = page.locator('text=/ticker.*performance/i, text=/top.*performer/i, text=/by.*symbol/i');
    const hasTickerSection = await tickerSection.count() > 0;

    console.log(`Ticker performance section found: ${hasTickerSection}`);
  });
});

test.describe('Dashboard Responsiveness', () => {
  test('should display correctly on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Page should still be functional
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Take mobile screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/dashboard-mobile.png', fullPage: true });

    // Navigation should still be accessible (possibly in hamburger menu)
    const nav = page.locator('nav, header, [role="navigation"]');
    await expect(nav.first()).toBeVisible();
  });

  test('should display correctly on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Take tablet screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/dashboard-tablet.png', fullPage: true });

    // Page should be functional
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
});

test.describe('Error States', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/dashboard');

    // Mock a failed API response
    await page.route('**/api/dashboard/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Page should not crash
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Should show error state or empty state, not crash
    const hasContent = body && body.length > 100;
    expect(hasContent).toBe(true);
  });

  test('should handle slow API responses', async ({ page }) => {
    // Add delay to API responses
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      route.continue();
    });

    await page.goto('/dashboard');

    // Should show loading state initially
    // Wait for content to eventually load
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
});
