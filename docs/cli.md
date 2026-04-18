# CLI

## Common Commands

```bash
smarteval init --path smarteval.yaml
smarteval validate-config --path smarteval.yaml
smarteval estimate --path smarteval.yaml
smarteval run --path smarteval.yaml
smarteval resume --path smarteval.yaml <run_dir>
smarteval rescore --path smarteval.yaml <run_dir>
smarteval diff <run_dir_a> <run_dir_b>
smarteval log --path smarteval.yaml
smarteval verdict --path smarteval.yaml <run_id>
smarteval propose --path smarteval.yaml <run_dir> [--backend codex_local|openai] [--codex-bin /path/to/codex]
smarteval try-new-model <model_id> --path smarteval.yaml
smarteval rebaseline --path smarteval.yaml <run_dir> --from OLD --to NEW
smarteval doctor --path smarteval.yaml
python scripts/optimize_loop.py --path smarteval.yaml [--rounds 5] [--proposals-per-round 3]
```

Unless you override `--output-root`, bakeoff outputs now live under `.smarteval/runs/` beside the
config. Ledger and optimization traces live under the same `.smarteval/` root.

## `run`

```bash
smarteval run --path examples/basic_text/smarteval.yaml --variant baseline --tag math --case-pattern 'math-*'
```

Behavior:

- prints a preflight payload before execution
- supports filtering by variant id, case tag, and case id glob
- refuses filtered runs that omit the baseline when `gates.require_baseline` is true
- `--dry-run` prints preflight only

## `resume`

Reads `runs/<bakeoff>/by_case/`, finds missing cells, and runs only those.

## `rescore`

Re-executes only the scoring pipeline against stored artifacts. Useful for rubric changes and evaluator rotation checks.

Typical usage:

```bash
smarteval rescore --path smarteval.yaml runs/<bakeoff-dir>
```

If your pipeline contains `llm_rubric`, the default evaluator backend is the local Codex app-server.
Override a stage with `backend: openai` only when you explicitly want the OpenAI Responses API.

`rescore` also re-renders `summary.md` and `summary.json`, including any `improvement_traces`
that can be rebuilt from the current config plus `ledger/variants.jsonl`.

## `verdict`

Interactive by default. If `status`, `promotion_level`, or `rationale` are omitted, the CLI prompts for them.

Verdicts are written to:

- `ledger/verdicts.jsonl`
- `ledger/notes/<run_id>.md`

## `propose`

Builds a proposer context from:

- the selected run summary
- failing runs
- recent rejected variants
- current framework constraints

The proposer backend now defaults to local Codex. Use `--backend openai` only when you explicitly
want the previous OpenAI Responses-based proposer.

Typical usage:

```bash
smarteval propose --path smarteval.yaml runs/<bakeoff-dir>
smarteval propose --path smarteval.yaml runs/<bakeoff-dir> --backend openai
smarteval propose --path smarteval.yaml runs/<bakeoff-dir> --codex-bin /opt/homebrew/bin/codex
```

Behavior:

- `--backend` defaults to `codex_local`
- `--codex-bin` lets you point at a specific local Codex binary when it is not on `PATH`
- `--write` persists proposals even when `autonomy.propose` is `suggest_only`
- `--run-now` queues a focused bakeoff with baseline plus the newly materialized proposals
- rejected proposal attempts are tracked in `ledger/proposals.jsonl` when dedup filters them out

If autonomy is set to auto-queue, proposals are materialized into child variants and may immediately run as a focused bakeoff.

## `scripts/optimize_loop.py`

This wrapper runs the multi-round optimizer implemented in `src/smarteval/optimization/loop.py`.
It starts from a config, runs the initial bakeoff, proposes improvements, persists the materialized
variants into `ledger/variants.jsonl`, runs the next focused bakeoff, and repeats for `N` rounds.

Typical usage from the repo root:

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
- `--rounds`: number of propose-and-rerun rounds, default `5`
- `--proposals-per-round`: maximum proposals requested each round, default `3`
- `--backend`: proposer backend, default `codex_local`
- `--codex-bin`: explicit path to the local Codex binary
- `--model`: optional proposer model override
- `--output-root`: run directory root, default `runs`

Each focused run summary includes the normal aggregate metrics plus the best reconstructed
improvement path from baseline, so you can see which recorded proposal changes produced the lift.

## `try-new-model`

This command is for generator swaps only. It is not an evaluator migration path.

Use:

```bash
smarteval rebaseline --path smarteval.yaml <run_dir> --from gpt-5-mini --to gpt-5.2
```

for evaluator changes.

## `rebaseline`

Produces a comparison report under `.smarteval/rebaseline-reports/` and may update the project lock when `--approve` is supplied.
