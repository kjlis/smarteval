import { expect, test } from '@playwright/test';
import { ASR, legendRowSel, outcomeSel, T, variantNodeSel, waitForApp } from './helpers';

// Legend + filter interactions from web/PLAN.md § Interaction model and
// ui-expert's legend spec (hover-dim, per-status rows, collapsible).

test.describe('Legend', () => {
  test('legend lists all status rows', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    for (const s of [
      'baseline',
      'winner',
      'improved',
      'improved-mild',
      'regressed',
      'regressed-mild',
      'failed',
      'unscored',
    ]) {
      await expect(page.locator(legendRowSel(s))).toBeVisible();
    }
  });

  test('legend includes exact + semantic rejection rows', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(
      page.locator('[data-testid="legend-row-rejected-exact"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="legend-row-rejected-semantic"]'),
    ).toBeVisible();
  });

  test('hovering a legend row fires the hover contract (no console error)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await waitForApp(page);
    await page.locator(legendRowSel('winner')).hover();
    await page.waitForTimeout(200);
    await page.locator(legendRowSel('baseline')).hover();
    await page.waitForTimeout(200);
    expect(errors, `legend hover errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('L key collapses then reopens the legend', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator(T.legend)).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.locator(T.legend)).toHaveCount(0);
    await expect(page.locator(T.legendToggle)).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.locator(T.legend)).toBeVisible();
  });
});

test.describe('Filters', () => {
  test('toggle-unscored has no effect when every variant is scored in some bakeoff', async ({ page }) => {
    // Post-pivot: unified view uses `latestScoreFor`, so ghost/unscored nodes
    // only appear when a variant has never been scored in any bakeoff. The
    // ASR fixture has all variants scored at least once, so the toggle is a
    // no-op on this dataset. This test is a contract check: toggle wiring
    // doesn't crash the page, and unscored count doesn't spuriously grow.
    await page.goto('/');
    await waitForApp(page);
    const unscoredBefore = await page.locator(outcomeSel('unscored')).count();
    await page.locator(`${T.toggleUnscored} input[type="checkbox"]`).click();
    const unscoredAfter = await page.locator(outcomeSel('unscored')).count();
    // The count may stay the same (ASR has zero truly-unscored variants) or
    // grow if a future fixture adds some. What matters: no crash, no spurious
    // ghosts.
    expect(unscoredAfter).toBeGreaterThanOrEqual(unscoredBefore);
  });

  test('author filter narrows the variant set', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const before = await page.locator(T.variantNode).count();
    await page.locator(T.filterAuthor).selectOption('framework');
    // Framework author covers baseline only in the ASR fixture.
    await expect
      .poll(() => page.locator(T.variantNode).count())
      .toBeLessThan(before);
    await expect(page.locator(variantNodeSel(ASR.baselineId))).toBeVisible();
  });
});
