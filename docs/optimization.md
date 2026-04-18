# Optimization

`smarteval` includes a simple proposer flow for iterative variant search.

## Proposer Context

The proposer sees:

- current best variant
- recent failure cases
- low-scoring dimensions
- recent rejected variants
- output selection and baseline constraints

## Proposal Format

Each proposal is a typed diff:

```json
{
  "parent_variant_id": "baseline",
  "rationale": "tighten the instruction",
  "diff": {"params.prompt_text": "answer carefully"},
  "expected_slice": "math"
}
```

Supported diff keys:

- `params.<name>`
- `generator.<name>`
- `description`

## Materialization

Queued proposals are converted into child variants with generated ids like:

```text
baseline-proposal-20260417123045-1
```

The materialized variants inherit the parent generator and params, then apply the diff.

## Dedup

Before proposals are accepted, the framework compares them against rejected ledger history using:

- exact structural diff matching
- semantic diff similarity

This prevents obviously repeated dead variants from being re-queued.

## Ledger Files

- `ledger/variants.jsonl`
- `ledger/verdicts.jsonl`
- `ledger/notes/`

The ledger is the durable memory for optimization decisions.

## Current Limits

- proposer execution is single-call, not agentic
- proposal similarity uses local hashed-text semantics, not a hosted embedding service
- promotion remains manual in v1
