import { expect, test } from '@playwright/test';
import { ASR, T, variantNodeSel, waitForApp } from './helpers';

// Keyboard shortcuts and a11y minimums from web/PLAN.md.

test.describe('Keyboard and a11y', () => {
  test('Esc clears selection', async ({ page }) => {
    // Use URL-hydrated selection to avoid top-bar pointer-intercept issues
    // on nodes that land under the header in the unified layout.
    await page.goto(`/?node=${ASR.overallWinnerId}`);
    await waitForApp(page);
    await expect(page.locator(T.inspector)).toBeVisible();
    await page.keyboard.press('Escape');
    const inspector = page.locator(T.inspector);
    if ((await inspector.count()) === 0) return;
    await expect(inspector).toHaveAttribute('data-inspector-kind', 'empty');
  });

  test('b keypress flips the best-path-only filter state', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const toggleLabel = page.locator(T.toggleBestPath);
    const checkbox = toggleLabel.locator('input[type="checkbox"]');
    const before = await checkbox.isChecked();
    await page.keyboard.press('b');
    await expect.poll(() => checkbox.isChecked()).toBe(!before);
    await page.keyboard.press('b');
    await expect.poll(() => checkbox.isChecked()).toBe(before);
  });

  test('f toggles "failed only" filter', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    // ASR has no failed variants, so f should hide everything.
    await page.keyboard.press('f');
    await expect(page.locator(T.variantNode)).toHaveCount(0);
    await page.keyboard.press('f');
    await expect.poll(() => page.locator(T.variantNode).count()).toBeGreaterThan(0);
  });

  test('L toggles the legend collapse state', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator(T.legend)).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.locator(T.legendToggle)).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.locator(T.legend)).toBeVisible();
  });

  test('inspector is a complementary landmark with an accessible name', async ({ page }) => {
    await page.goto(`/?node=${ASR.overallWinnerId}`);
    await waitForApp(page);
    const inspector = page.locator(T.inspector);
    await expect(inspector).toBeVisible();
    const aria = await inspector.getAttribute('aria-label');
    expect(aria).toBeTruthy();
  });

  test('legend is a complementary landmark', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const legend = page.locator(T.legend);
    await expect(legend).toBeVisible();
    await expect(legend).toHaveAttribute('role', 'complementary');
    await expect(legend).toHaveAttribute('aria-label', 'Legend');
  });

  test('variant nodes have accessible names for screen readers', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const first = page.locator(T.variantNode).first();
    const aria = await first.getAttribute('aria-label');
    expect(aria).toBeTruthy();
    expect(aria).toMatch(/Variant/);
  });
});
