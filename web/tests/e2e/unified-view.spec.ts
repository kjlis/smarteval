import { expect, test } from '@playwright/test';
import { ASR, outcomeSel, T, variantNodeSel, waitForApp } from './helpers';

// Pivot smoke suite: the default view must render the whole graph across all
// rounds with the overall winning path highlighted. Team-lead exit criterion.

test.describe('Unified cross-round view', () => {
  test('page loads and renders every variant across all rounds simultaneously', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    // The ASR fixture has 16 variants across 6 bakeoffs (5 optimization
    // rounds). The unified default shows them all at once — no bakeoff is
    // preselected.
    await expect
      .poll(() => page.locator(T.variantNode).count())
      .toBeGreaterThanOrEqual(ASR.totalVariantCount);
    await expect(page.locator(variantNodeSel(ASR.baselineId))).toBeVisible();
  });

  test('overall winner is visibly marked and is on the best path', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const winner = page.locator(variantNodeSel(ASR.overallWinnerId));
    await expect(winner).toBeVisible();
    await expect(winner).toHaveAttribute('data-is-winner', 'true');
    await expect(winner).toHaveAttribute('data-on-best-path', 'true');
    // Redundant encoding: the card renders the word "Winner" (not color-only).
    await expect(winner).toContainText(/winner/i);
    // Baseline and the best-path parent chain are on the path too.
    await expect(page.locator(variantNodeSel(ASR.baselineId))).toHaveAttribute(
      'data-on-best-path',
      'true',
    );
    await expect(page.locator(variantNodeSel(ASR.bestPathR1Id))).toHaveAttribute(
      'data-on-best-path',
      'true',
    );
  });

  test('clicking the overall winner opens inspector showing cumulative Δ vs baseline', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.locator(variantNodeSel(ASR.overallWinnerId)).click();
    const inspector = page.locator(T.inspector);
    await expect(inspector).toBeVisible();
    await expect(inspector).toHaveAttribute('data-inspector-kind', 'variant');
    await expect(inspector).toContainText(ASR.overallWinnerId);
    // Cumulative Δ vs baseline = +0.40 (0.76 − 0.36). The delta badge/row
    // must render this, signed and to at least 2 decimals.
    const delta = page.locator(T.inspectorDelta);
    await expect(delta).toBeVisible();
    await expect(delta).toHaveText(/\+0\.40/);
  });

  test('best-path overlay is on by default and covers baseline + winner', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const onPath = page.locator(
      '[data-testid="variant-node"][data-on-best-path="true"]',
    );
    // Best path must be at least baseline + winner + one intermediate.
    await expect.poll(() => onPath.count()).toBeGreaterThanOrEqual(3);
    // Unscored/ghost nodes may still render; they just shouldn't dominate.
    // The key unified-view check: the winner IS on the path, not merely the
    // top variant of some isolated round.
    await expect(
      page.locator(`${variantNodeSel(ASR.overallWinnerId)}[data-on-best-path="true"]`),
    ).toBeVisible();
  });
});
