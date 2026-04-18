import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

export type FixtureName = 'asr' | 'synthetic';

const FIXTURE_FILES: Record<FixtureName, string> = {
  asr: 'asr-graph.json',
  synthetic: 'synthetic-graph.json',
};

export function loadFixture(name: FixtureName): any {
  const path = resolve(fixturesDir, FIXTURE_FILES[name]);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// The app currently imports graph.json statically at Astro build time, so we
// cannot swap fixtures at runtime. Tests below operate on the baked-in ASR
// fixture (examples/asr_manifest/.smarteval). The synthetic fixture is kept
// for future runtime-loader work and unit-style data inspections.
export const T = {
  appRoot: '[data-testid="app-root"]',
  graphCanvas: '[data-testid="graph-canvas"]',
  topBar: '[data-testid="top-bar"]',
  runSelector: '[data-testid="run-selector"]',
  variantNode: '[data-testid="variant-node"]',
  proposalNode: '[data-testid="proposal-node"]',
  inspector: '[data-testid="inspector"]',
  inspectorTitle: '[data-testid="inspector-title"]',
  inspectorCopyId: '[data-testid="inspector-copy-id"]',
  inspectorClose: '[data-testid="inspector-close"]',
  inspectorRationale: '[data-testid="inspector-rationale"]',
  inspectorMeanScore: '[data-testid="inspector-mean-score"]',
  inspectorDelta: '[data-testid="inspector-delta"]',
  inspectorDiff: '[data-testid="inspector-diff"]',
  inspectorSampleErrors: '[data-testid="inspector-sample-errors"]',
  legend: '[data-testid="legend"]',
  legendToggle: '[data-testid="legend-toggle"]',
  toggleRejected: '[data-testid="toggle-rejected"]',
  toggleBestPath: '[data-testid="toggle-best-path"]',
  toggleUnscored: '[data-testid="toggle-unscored"]',
  toggleFailedOnly: '[data-testid="toggle-failed-only"]',
  filterAuthor: '[data-testid="filter-author"]',
  filterFocusedRound: '[data-testid="filter-focused-round"]',
  emptyState: '[data-testid="empty-state"]',
} as const;

export function variantNodeSel(id: string): string {
  return `[data-testid="variant-node"][data-variant-id="${id}"]`;
}

export function proposalNodeSel(proposalId: string): string {
  return `[data-testid="proposal-node"][data-proposal-id="${proposalId}"]`;
}

export function legendRowSel(status: string): string {
  return `[data-testid="legend-row-${status}"]`;
}

export function outcomeSel(outcome: string): string {
  return `[data-testid="variant-node"][data-outcome="${outcome}"]`;
}

/**
 * Wait for the app to finish initial hydration and render the graph canvas
 * and at least one variant node. Throws if the app never hydrates.
 */
export async function waitForApp(page: Page): Promise<void> {
  await page.locator(T.appRoot).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page
    .locator(T.variantNode)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}

// Well-known IDs from the baked-in ASR fixture (asr_manifest/.smarteval
// export). Derived from the ledger + per-bakeoff scores — if the fixture is
// regenerated and these shift, update here.
export const ASR = {
  baselineId: 'baseline',
  // The overall-best variant across all bakeoffs (max meanScore, earliest
  // appearance wins ties). Per dev-ops's `overallBestPath.winnerVariantId`.
  overallWinnerId:
    'baseline-proposal-20260418132531-1-proposal-20260418132745-2',
  overallWinnerMeanScore: 0.76,
  overallWinnerDeltaVsBaseline: 0.4,
  // Round 1 parent in the best path.
  bestPathR1Id: 'baseline-proposal-20260418132531-1',
  // Total variants in the ASR fixture (union across all bakeoffs).
  totalVariantCount: 16,
  // Number of bakeoffs the optimization session produced.
  totalBakeoffs: 6,
} as const;
