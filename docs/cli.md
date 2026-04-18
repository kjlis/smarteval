# CLI

## Common Commands

```bash
smarteval init
smarteval validate-config
smarteval estimate
smarteval run
smarteval resume <run_dir>
smarteval rescore <run_dir>
smarteval diff <run_dir_a> <run_dir_b>
smarteval log
smarteval verdict <run_id>
smarteval propose <run_dir>
smarteval try-new-model <model_id>
smarteval rebaseline <run_dir> --from OLD --to NEW
smarteval doctor
```

## `run`

```bash
smarteval run --variant baseline --tag math --case-pattern 'math-*'
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

If autonomy is set to auto-queue, proposals are materialized into child variants and may immediately run as a focused bakeoff.

## `try-new-model`

This command is for generator swaps only. It is not an evaluator migration path.

Use:

```bash
smarteval rebaseline <run_dir> --from gpt-5-mini --to gpt-5.2
```

for evaluator changes.

## `rebaseline`

Produces a comparison report under `.smarteval/rebaseline-reports/` and may update the project lock when `--approve` is supplied.
