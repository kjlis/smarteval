import { expect, test } from '@playwright/test';

test('app loads with dark theme token', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/smarteval/i);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('dark');
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim(),
  );
  expect(bg.toLowerCase()).toBe('#0d1117');
  await expect(page.getByTestId('app-root')).toBeVisible();
});
