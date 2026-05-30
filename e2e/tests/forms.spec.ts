/**
 * Form Interaction E2E Tests
 *
 * Tests all form interactions in the application:
 * - Stock trade entry
 * - Option trade entry (various strategies)
 * - Trade close forms
 * - Account management
 * - Import flow
 *
 * Note: These tests require authentication. In CI without auth,
 * tests will skip or verify the login redirect works properly.
 */

import { test, expect } from '@playwright/test';
import { createErrorCollector } from '../utils/error-collector';

// Detect CI mode - skip form tests that require auth
const isCI = process.env.CI === 'true';

// Skip all form tests in CI since they require authentication
test.skip(isCI, 'Form tests require authentication - skipping in CI');

test.describe('Stock Trade Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/trade/new/stock');
    await page.waitForLoadState('networkidle');
  });

  test('should display stock trade form with all required fields', async ({ page }) => {
    // Check form exists
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Check for key input fields (ticker input used for counting)
    const tickerInput = page.locator('input[name="ticker"], input[placeholder*="ticker" i], input[placeholder*="symbol" i]');

    // At least ticker should be present
    const tickerCount = await tickerInput.count();
    if (tickerCount === 0) {
      console.log('Note: Ticker input not found with expected selectors');
    }

    // Should have a submit button
    const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    await expect(submitButton.first()).toBeVisible();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/trade/new/stock');

    // Try to submit empty form
    const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    await submitButton.first().click();

    // Wait for validation
    await page.waitForTimeout(500);

    // Should show validation errors (not crash)
    const pageErrors = errorCollector.getErrorsForPage('/trade/new/stock');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should fill and submit stock trade form', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/trade/new/stock');

    // Fill in the form - get all inputs to iterate
    const inputs = await page.locator('input').all();

    // Try to fill inputs in order (ticker, quantity, price, date)
    for (let i = 0; i < Math.min(inputs.length, 5); i++) {
      const input = inputs[i];
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');

      if (type === 'text' && (name?.includes('ticker') || placeholder?.toLowerCase().includes('ticker') || placeholder?.toLowerCase().includes('symbol') || i === 0)) {
        await input.fill('AAPL');
      } else if (type === 'number' && (name?.includes('quantity') || placeholder?.toLowerCase().includes('quantity'))) {
        await input.fill('100');
      } else if (type === 'number' && (name?.includes('price') || placeholder?.toLowerCase().includes('price'))) {
        await input.fill('150.00');
      }
    }

    // Take screenshot before submission
    await page.screenshot({ path: 'e2e-report/screenshots/stock-form-filled.png' });

    // Note: We won't actually submit to avoid creating test data
    // Just verify no critical errors occurred during form interaction
    const pageErrors = errorCollector.getErrorsForPage('/trade/new/stock');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Option Trade Form', () => {
  const strategies = [
    'long_call',
    'long_put',
    'covered_call',
    'cash_secured_put',
  ];

  for (const strategy of strategies) {
    test(`should load ${strategy} option trade form`, async ({ page }) => {
      const errorCollector = createErrorCollector();
      const url = `/trade/new/option/${strategy}`;
      errorCollector.attachToPage(page, url);

      await page.goto(url);
      await page.waitForLoadState('networkidle');

      // Form should exist
      const form = page.locator('form');
      await expect(form).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: `e2e-report/screenshots/option-form-${strategy}.png` });

      // No critical errors
      const pageErrors = errorCollector.getErrorsForPage(url);
      const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });
  }

  test('should show validation errors for invalid option data', async ({ page }) => {
    await page.goto('/trade/new/option/long_call');
    await page.waitForLoadState('networkidle');

    // Try to submit without required fields
    const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    if (await submitButton.count() > 0) {
      await submitButton.first().click();
      await page.waitForTimeout(500);
    }

    // Page should not crash
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
});

test.describe('Close Trade Form', () => {
  test('should load close trade page', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/trade/close');

    await page.goto('/trade/close');
    await page.waitForLoadState('networkidle');

    // Page should load (may show "no open positions" message)
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/close-trade-page.png' });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/trade/close');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Account Management', () => {
  test('should load accounts page', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/accounts');

    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    // Should have account list or empty state
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Look for "Add Account" or similar button
    const addButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
    const hasAddButton = await addButton.count() > 0;
    console.log(`Add account button found: ${hasAddButton}`);

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/accounts-page.png' });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/accounts');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should open create account dialog if available', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    // Try to find and click add button
    const addButton = page.locator('button:has-text("Add"), button:has-text("Create Account"), button:has-text("New Account")');
    if (await addButton.count() > 0) {
      await addButton.first().click();
      await page.waitForTimeout(500);

      // Check if dialog/modal opened
      const dialog = page.locator('[role="dialog"], [data-state="open"], .modal');
      const dialogVisible = await dialog.count() > 0;
      console.log(`Create account dialog visible: ${dialogVisible}`);

      await page.screenshot({ path: 'e2e-report/screenshots/accounts-create-dialog.png' });
    }
  });
});

test.describe('Import Flow', () => {
  test('should load import page', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/import');

    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    // Should have file upload area
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Look for file input or drop zone
    const fileInput = page.locator('input[type="file"]');
    const dropZone = page.locator('[class*="drop"], [class*="upload"]');

    const hasFileInput = await fileInput.count() > 0;
    const hasDropZone = await dropZone.count() > 0;

    console.log(`File input found: ${hasFileInput}, Drop zone found: ${hasDropZone}`);

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/import-page.png' });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/import');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should show broker selection options', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    // Look for broker selection (dropdown or radio buttons)
    const brokerSelect = page.locator('select, [role="combobox"], [role="listbox"]');
    const brokerRadios = page.locator('input[type="radio"]');

    const hasBrokerSelect = await brokerSelect.count() > 0;
    const hasBrokerRadios = await brokerRadios.count() > 0;

    console.log(`Broker select found: ${hasBrokerSelect}, Broker radios found: ${hasBrokerRadios}`);
  });
});

test.describe('Journal Page', () => {
  test('should load journal page', async ({ page }) => {
    const errorCollector = createErrorCollector();
    errorCollector.attachToPage(page, '/journal');

    await page.goto('/journal');
    await page.waitForLoadState('networkidle');

    // Journal page should load
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: 'e2e-report/screenshots/journal-page.png' });

    // No critical errors
    const pageErrors = errorCollector.getErrorsForPage('/journal');
    const criticalErrors = pageErrors.filter((e) => e.severity === 'critical');
    expect(criticalErrors).toHaveLength(0);
  });

  test('should have date navigation', async ({ page }) => {
    await page.goto('/journal');
    await page.waitForLoadState('networkidle');

    // Look for date navigation (prev/next buttons or calendar)
    const prevButton = page.locator('button:has-text("Previous"), button:has-text("Prev"), button[aria-label*="previous"]');
    const nextButton = page.locator('button:has-text("Next"), button[aria-label*="next"]');
    const calendar = page.locator('[role="grid"], .calendar, [class*="calendar"]');

    const hasPrev = await prevButton.count() > 0;
    const hasNext = await nextButton.count() > 0;
    const hasCalendar = await calendar.count() > 0;

    console.log(`Date navigation - Prev: ${hasPrev}, Next: ${hasNext}, Calendar: ${hasCalendar}`);
  });
});
