export type NodeStatus =
  | 'baseline'
  | 'winner'
  | 'improved'
  | 'improved-mild'
  | 'regressed'
  | 'regressed-mild'
  | 'failed'
  | 'unscored';

export type ProposalStatus =
  | 'rejected-exact-duplicate'
  | 'rejected-semantic-duplicate'
  | 'accepted-not-materialized';

export interface VariantStatusInput {
  readonly isBaseline: boolean;
  readonly isWinner: boolean;
  readonly meanScore: number | null;
  readonly deltaVsBaseline: number | null;
  readonly failedRunCount: number;
  readonly runCount: number;
}

export const MILD_DELTA_THRESHOLD = 0.05;

/**
 * Classify a variant's visual status for the selected bakeoff.
 *
 * Precedence (ux-expert sign-off, team-lead locked):
 *   baseline > winner > failed > regressed > regressed-mild
 *            > improved-mild > improved > unscored
 *
 * `failed` takes over whenever `failedRunCount > 0` — the hatched overlay +
 * purple stripe dominate over score-driven bands because a partially failing
 * variant should never visually pass for an improvement. The variant card
 * still renders the numeric score beneath so the researcher can see how far
 * the surviving runs got.
 */
export function classifyVariant(input: VariantStatusInput): NodeStatus {
  if (input.isBaseline) return 'baseline';
  if (input.runCount === 0 || input.meanScore === null) return 'unscored';
  if (input.isWinner) return 'winner';
  if (input.failedRunCount > 0) return 'failed';

  const delta = input.deltaVsBaseline;
  if (delta === null) return 'unscored';

  // Regressions win over improvements in the precedence chain, but since a
  // given delta is either positive or negative (or zero), the chain reduces
  // to "negative side first, then positive, then tie".
  if (delta < -MILD_DELTA_THRESHOLD) return 'regressed';
  if (delta < 0) return 'regressed-mild';
  if (delta > MILD_DELTA_THRESHOLD) return 'improved';
  if (delta > 0) return 'improved-mild';

  // Exactly 0 delta — a tied non-baseline variant. Treat as improved-mild
  // so it visually sits in the "near-baseline" band rather than confusing
  // with an unscored ghost.
  return 'improved-mild';
}

/**
 * CSS var name for a status's primary color. Matches tokens.css.
 * Used inline by node renderers so theme switches are free.
 */
export function statusVar(status: NodeStatus): string {
  switch (status) {
    case 'baseline':
      return 'var(--status-baseline)';
    case 'winner':
      return 'var(--status-winner)';
    case 'improved':
      return 'var(--status-improved)';
    case 'improved-mild':
      return 'var(--status-improved-mild)';
    case 'regressed':
      return 'var(--status-regressed)';
    case 'regressed-mild':
      return 'var(--status-regressed-mild)';
    case 'failed':
      return 'var(--status-failed)';
    case 'unscored':
      return 'var(--status-unscored)';
  }
}

export function proposalStatusVar(status: ProposalStatus): string {
  switch (status) {
    case 'rejected-exact-duplicate':
      return 'var(--status-rejected-exact)';
    case 'rejected-semantic-duplicate':
      return 'var(--status-rejected-semantic)';
    case 'accepted-not-materialized':
      return 'var(--border-strong)';
  }
}

/**
 * Human-readable label used in legend and inspector.
 */
export function statusLabel(status: NodeStatus): string {
  switch (status) {
    case 'baseline':
      return 'Baseline';
    case 'winner':
      return 'Winner';
    case 'improved':
      return 'Improved';
    case 'improved-mild':
      return 'Improved (mild)';
    case 'regressed':
      return 'Regressed';
    case 'regressed-mild':
      return 'Regressed (mild)';
    case 'failed':
      return 'Failed';
    case 'unscored':
      return 'Unscored';
  }
}

export function proposalStatusLabel(status: ProposalStatus): string {
  switch (status) {
    case 'rejected-exact-duplicate':
      return 'Rejected (exact duplicate)';
    case 'rejected-semantic-duplicate':
      return 'Rejected (semantic duplicate)';
    case 'accepted-not-materialized':
      return 'Accepted (not materialized)';
  }
}

/**
 * Format a delta with leading sign, fixed to 2 decimals. Returns '—' for
 * null. Uses ASCII hyphen-minus so the sign is machine-checkable (tests and
 * screen readers prefer the canonical form).
 */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(2)}`;
}

/**
 * Format a mean score in [0, 1] as two-decimal tabular text.
 */
export function formatScore(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(2);
}

/**
 * Middle-truncate a long variant id so the distinctive suffix (e.g.
 * `-proposal-20260418133421-1`) remains visible. Used for node titles.
 */
export function shortId(id: string, max = 22): string {
  if (id.length <= max) return id;
  const half = Math.floor((max - 1) / 2);
  return `${id.slice(0, half)}…${id.slice(id.length - half)}`;
}
