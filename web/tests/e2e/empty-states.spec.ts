import { expect, test } from '@playwright/test';
import { T } from './helpers';

// Empty states from web/PLAN.md § Empty states and edge cases.
//
// The app imports graph.json at build time, so synthesizing a no-data run at
// runtime isn't possible yet. These tests assert the contract when the empty
// state is shown, and otherwise verify the app hydrated to the graph path.
// When a runtime loader lands, promote to hard assertions with fixture
// injection.

test.describe('Empty states', () => {
  test('no-data empty state carries explanatory copy when visible', async ({ page }) => {
    await page.goto('/');
    await page.locator(T.appRoot).waitFor({ state: 'visible', timeout: 15_000 });
    const empty = page.locator(T.emptyState);
    if ((await empty.count()) === 0) return;
    await expect(empty).toContainText(/smarteval/i);
    await expect(empty).toContainText(/run/i);
  });

  test('app hydrates to either the graph canvas or an empty state, never nothing', async ({ page }) => {
    await page.goto('/');
    await page.locator(T.appRoot).waitFor({ state: 'visible', timeout: 15_000 });
    const canvas = await page.locator(T.graphCanvas).count();
    const empty = await page.locator(T.emptyState).count();
    expect(canvas + empty).toBeGreaterThan(0);
  });
});
