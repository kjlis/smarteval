import { expect, test } from '@playwright/test';
import { T, waitForApp } from './helpers';

test.describe('Scaffold sanity', () => {
  test('app page loads and renders the root container', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator(T.appRoot)).toBeVisible();
  });

  test('page title references smarteval', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/smarteval/i);
  });

  test('no uncaught console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await waitForApp(page);
    await page.waitForLoadState('networkidle');
    expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
