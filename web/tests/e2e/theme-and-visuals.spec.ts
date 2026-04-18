import { expect, test } from '@playwright/test';
import { ASR, outcomeSel, T, variantNodeSel, waitForApp } from './helpers';

// Theme, Δ badge format, status taxonomy precedence, and colorblind-safe
// redundant encodings (shape/glyph + text) per ui-expert's spec.
//
// Post-pivot: the unified view shows every variant across all rounds with
// `latestScoreFor` stats, so outcome tiers are computed against the latest
// scored bakeoff for each variant.

// Some well-known non-winner variants pulled from the unified ASR data.
// If exporter output shifts, update these — run
//   node -e "require('./public/data/graph.json').latestScoreByVariant"
// to inspect.
const IMPROVED_ID =
  'baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-3'; // Δ = +0.10
const REGRESSED_MILD_ID =
  'baseline-proposal-20260418132531-1-proposal-20260418132745-2-proposal-20260418133004-2-proposal-20260418133204-1-proposal-20260418133421-2'; // Δ = -0.04

test.describe('Theme and visual tokens', () => {
  test('dark theme is set by default on <html>', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('canvas uses the canvas background token', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const bg = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-root"]') as HTMLElement | null;
      if (!el) return null;
      return getComputedStyle(el).backgroundColor;
    });
    expect(bg).toBeTruthy();
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('Δ-badge regex', () => {
  // Spec: tooltips and badges always render Δ to 2 decimals with a signed
  // prefix ("+0.40", "-0.04", or "0.00"). Applies to non-baseline variants.
  const DELTA_RE = /^(?:\+|-)?\d+\.\d{2}$|^—$/;

  test('improved delta badge is signed "+" with 2 decimals', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const badge = page.locator(`[data-testid="node-variant-${IMPROVED_ID}-delta"]`);
    await expect(badge).toBeVisible();
    const text = (await badge.textContent())?.trim() ?? '';
    expect(text).toMatch(DELTA_RE);
    expect(text.startsWith('+')).toBe(true);
  });

  test('regressed-mild delta badge is signed with minus and 2 decimals', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const badge = page.locator(`[data-testid="node-variant-${REGRESSED_MILD_ID}-delta"]`);
    const text = (await badge.textContent())?.trim() ?? '';
    expect(text).toMatch(DELTA_RE);
    expect(text.startsWith('-')).toBe(true);
  });

  test('baseline node has no delta badge (baselines have null delta)', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const baseline = page.locator(variantNodeSel(ASR.baselineId));
    const delta = baseline.locator(
      `[data-testid="node-variant-${ASR.baselineId}-delta"]`,
    );
    const count = await delta.count();
    if (count > 0) {
      const text = (await delta.textContent())?.trim() ?? '';
      expect(text).toMatch(/^—$|^0\.00$/);
    }
  });
});

test.describe('Status taxonomy', () => {
  test('at least one regressed-mild variant renders (|Δ| ≤ 0.05)', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect
      .poll(() => page.locator(outcomeSel('regressed-mild')).count())
      .toBeGreaterThanOrEqual(1);
  });

  test('overall winner carries data-outcome="winner" (precedence)', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const winner = page.locator(variantNodeSel(ASR.overallWinnerId));
    await expect(winner).toHaveAttribute('data-outcome', 'winner');
  });
});

test.describe('Colorblind-safe redundant encoding', () => {
  test('winner node renders a "Winner" text label (not color-only)', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const winner = page.locator(variantNodeSel(ASR.overallWinnerId));
    await expect(winner).toContainText(/winner/i);
  });

  test('baseline node renders a "Baseline" text label', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const baseline = page.locator(variantNodeSel(ASR.baselineId));
    await expect(baseline).toContainText(/baseline/i);
  });

  test('rejected proposal nodes carry a textual rejection label', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const rejected = page.locator(T.proposalNode);
    const count = await rejected.count();
    if (count === 0) test.skip();
    const aria = await rejected.first().getAttribute('aria-label');
    expect(aria).toMatch(/rejected.*(exact|semantic)/i);
  });
});
