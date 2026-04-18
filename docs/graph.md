# Graphing Results

`smarteval` does not ship a graph UI yet, but the repository now records enough data to build one
without guessing which changes were tried, accepted, rejected, or failed.

## What To Visualize

A practical graph has two node kinds:

- variant nodes: baseline and materialized child variants
- proposal-attempt nodes: rejected proposal ideas that never became variants

Useful edge types:

- parent variant -> accepted child variant
- parent variant -> rejected proposal attempt

Recommended node labels:

- variant id
- rationale / description
- mean score
- delta vs baseline
- failed run count

Recommended edge labels:

- changed fields
- proposal rationale
- delta vs parent when known
- rejection reason when rejected

## Source Files

Use these files together:

- `ledger/variants.jsonl`
  Accepted, materialized variants with `parent_id`, `rationale`, and `diff`.
- `ledger/proposals.jsonl`
  Proposal attempts, including accepted and rejected proposals, with:
  `status`, `parent_variant_id`, `materialized_variant_id`, `duplicate_of_variant_id`,
  `similarity`, `rationale`, and `diff`. Accepted suggestions that were not materialized keep
  `materialized_variant_id: null`.
- `runs/<bakeoff>/summary.json`
  Aggregate scores, deltas, failed-run counts, sample errors, and `improvement_traces`.
- `runs/<bakeoff>/by_case/*.jsonl`
  Per-run failures and raw scorer outputs when you need case-level detail.
- `.smarteval/optimization-runs/*.json`
  Round structure for multi-round optimization sessions, including source run, queued run, and
  rejected proposal counts.

## Suggested Mapping

### Variant nodes

Build one node per variant id from `ledger/variants.jsonl` and enrich it from `summary.json` when
that variant appears in the bakeoff you are rendering.

Suggested fields:

- `id`
- `parent_id`
- `rationale`
- `diff`
- `mean_score`
- `delta_vs_baseline`
- `failed_run_count`
- `sample_errors`

### Rejected proposal nodes

Build one node per rejected record in `ledger/proposals.jsonl`.

Suggested fields:

- `proposal_id`
- `parent_variant_id`
- `status`
- `rationale`
- `diff`
- `duplicate_of_variant_id`
- `similarity`

Use `status` to style nodes differently:

- `rejected_exact_duplicate`
- `rejected_semantic_duplicate`

### Accepted proposal edges

For accepted records in `ledger/proposals.jsonl`, draw an edge from `parent_variant_id` to
`materialized_variant_id`. Use the proposal rationale and diff summary as the edge label.

### Failed branches

Use `summary.json` to highlight variants that ran but failed:

- `failed_run_count > 0`
- `sample_errors` for tooltip or side panel detail

If you need the exact failing cases, load `by_case/*.jsonl` and filter records where
`status == "failed"`.

## Best Path

`summary.json` contains `improvement_traces`, which are useful for highlighting the currently best
known path from baseline to winner.

Each step includes:

- `parent_variant_id`
- `variant_id`
- `rationale`
- `changes`
- `delta_vs_parent`
- `delta_vs_baseline`
- `judge_justification` when available from `llm_rubric`

This is the easiest place to start if you want a "winner path" overlay on top of the broader graph.

## Minimal Rendering Plan

1. Load `summary.json` for the run you care about.
2. Load `ledger/variants.jsonl` and `ledger/proposals.jsonl`.
3. Build variant nodes from accepted variants.
4. Build rejected proposal nodes from `proposals.jsonl`.
5. Add accepted and rejected edges from each parent.
6. Color nodes by outcome:
   - baseline
   - winner
   - improved
   - regressed
   - failed
   - rejected
7. Use `improvement_traces` to highlight the current best path.

## Current Limits

- Historical ancestor variants may not have score metadata in the latest bakeoff summary if they
  were not rerun in that bakeoff.
- Rejected proposals are tracked once they reach the dedup/review step; proposals that never make it
  out of the model response are not represented.
- There is no built-in `graph.json` export yet. The intended input format today is the ledger plus
  run summaries.
