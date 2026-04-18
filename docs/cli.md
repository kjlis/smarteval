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
smarteval propose --path smarteval.yaml <run_dir>
smarteval try-new-model <model_id> --path smarteval.yaml
smarteval rebaseline --path smarteval.yaml <run_dir> --from OLD --to NEW
smarteval doctor --path smarteval.yaml
```

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
smarteval rebaseline --path smarteval.yaml <run_dir> --from gpt-5-mini --to gpt-5.2
```

for evaluator changes.

## `rebaseline`

Produces a comparison report under `.smarteval/rebaseline-reports/` and may update the project lock when `--approve` is supplied.
