# Optimization

`smarteval` supports two optimization entry points:

- `smarteval propose` for one-shot proposal generation from an existing run
- `python scripts/optimize_loop.py` for multi-round propose-and-rerun optimization

The proposer backend now defaults to local Codex. Explicit `backend="openai"` support is still
available when you want the previous OpenAI Responses path.

## Proposer Context

The proposer sees:

- current best variant
- recent failure cases
- low-scoring dimensions
- recent rejected variants
- output selection and baseline constraints

By default, proposal generation uses local Codex through
`src/smarteval/proposer/prompter.py`. The same entry point still supports `backend="openai"` as an
explicit fallback.

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

When proposals are persisted, they are appended to `ledger/variants.jsonl` so later proposer rounds
and verdict review can reuse that history.

## Dedup

Before proposals are accepted, the framework compares them against rejected ledger history using:

- exact structural diff matching
- semantic diff similarity

This prevents obviously repeated dead variants from being re-queued.

## Ledger Files

- `ledger/variants.jsonl`
- `ledger/proposals.jsonl`
- `ledger/verdicts.jsonl`
- `ledger/notes/`

The ledger is the durable memory for optimization decisions.

## `smarteval propose`

`smarteval propose` builds proposer context from a prior run and requests proposals from the default
local Codex backend.

Typical usage:

```bash
smarteval propose --path smarteval.yaml runs/<bakeoff-dir>
smarteval propose --path smarteval.yaml runs/<bakeoff-dir> --backend openai
smarteval propose --path smarteval.yaml runs/<bakeoff-dir> --codex-bin /opt/homebrew/bin/codex
```

Supported controls:

- `--backend`: proposer backend, default `codex_local`
- `--codex-bin`: explicit Codex binary path when needed
- `--write`: persist proposals even if autonomy is suggest-only
- `--run-now`: run a focused bakeoff with baseline plus the materialized proposals

## Multi-Round Optimizer

The optimizer implementation lives in `src/smarteval/optimization/loop.py`, with a runnable wrapper
at `scripts/optimize_loop.py`.

Each optimization session:

1. Loads the config.
2. Runs the initial bakeoff.
3. Builds proposer context from the latest run summary and records.
4. Proposes improvements.
5. Materializes and persists accepted child variants into `ledger/variants.jsonl`.
6. Runs the next focused bakeoff with baseline plus the proposed variants.
7. Repeats for `N` rounds, or stops early when no accepted proposals remain.

Run it from the repo root like this:

```bash
python scripts/optimize_loop.py \
  --path /path/to/smarteval.yaml \
  --rounds 5 \
  --proposals-per-round 3 \
  --codex-bin /opt/homebrew/bin/codex
```

To force the previous proposer backend:

```bash
python scripts/optimize_loop.py --path /path/to/smarteval.yaml --backend openai
```

Key options:

- `--path`: required config path
- `--rounds`: round count, default `5`
- `--proposals-per-round`: maximum proposals requested each round, default `3`
- `--backend`: proposer backend, default `codex_local`
- `--codex-bin`: explicit path to the local Codex binary
- `--model`: optional proposer model override
- `--output-root`: root directory for run outputs, default `runs`

Each optimization session also writes a machine-readable trace under
`.smarteval/optimization-runs/`.

The resulting `summary.json` and `summary.md` for each focused bakeoff also include
`improvement_traces`, which reconstruct the winning path from baseline using ledger ancestry.
Each step records:

- the proposal rationale or justification
- the concrete changed fields
- the observed delta vs the immediate parent
- the cumulative delta vs baseline
- the evaluator's overall justification when available from `llm_rubric`

Rejected proposal attempts are written to `ledger/proposals.jsonl` with a rejection status,
duplicate target, and similarity score when applicable. This makes it possible to graph failed
branches alongside accepted variants later.

## Current Limits

- proposal generation itself is still single-call, not agentic
- proposal similarity uses local hashed-text semantics, not a hosted embedding service
- promotion remains manual in v1
