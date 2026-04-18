# Configuration

`smarteval` reads `smarteval.yaml` from the current working directory by default. Paths are resolved relative to the config file.

## Minimal Config

```yaml
version: 1
golden_set: golden.jsonl
baseline: baseline
evaluator:
  model: gpt-5-mini
variants:
  - id: baseline
    generator:
      kind: script
    params:
      callable: examples.basic_text.generator:answer_case
pipeline:
  - id: exact
    kind: exact_match
```

## Top-Level Fields

- `version`: schema version, currently `1`
- `golden_set`: path to the JSONL golden set
- `baseline`: variant id used for delta and regression comparisons
- `artifact_selection`: selects the evaluated output for pipeline-backed generators
- `evaluator`: canonical judge policy used by evaluator-backed scorers
- `variants`: generator variants to compare
- `pipeline`: ordered contract/scoring stages
- `execution`: run count, concurrency, and budget settings
- `reporting`: summary output policy
- `gates`: post-run gate behavior
- `router`: optional router spec for specialist dispatch
- `autonomy`: proposer and queued-run behavior

## Artifact Selection

```yaml
artifact_selection:
  primary_output: note_txt
  copy_attachments: true
```

- `primary_output` is the logical output key evaluated for the run.
- `copy_attachments` copies sibling outputs into `runs/<id>/attachments/`.

## Evaluator Policy

```yaml
evaluator:
  model: gpt-5-mini
  temperature: 0.0
  top_p: 0.1
  rpm: 60
  reasoning_effort: low
  max_output_tokens: 800
```

This policy is used by evaluator-backed scorers such as `llm_rubric`.

For `llm_rubric`, the default backend is the local Codex app-server. You can optionally set
`codex_bin` on the stage, or override the backend with `backend: openai` if you want to use
the OpenAI Responses API instead. The default Codex path requires the experimental Codex
Python SDK installed from a local `openai/codex` checkout as documented at
https://developers.openai.com/codex/sdk#python-library .

## Execution

```yaml
execution:
  runs_per_variant: 3
  concurrency: 1
  evaluator_rpm: 60
  budget_usd: 10
  max_duration_min: 20
  on_budget_exceeded: warn
```

Current implementation focuses on deterministic local orchestration. Concurrency is intentionally conservative.

## Reporting

```yaml
reporting:
  formats: [markdown, json]
  ci_summary: true
  incremental_summary_every_n_runs: 5
```

- `summary.md` and `summary.json` are written into the run directory.
- `ci.json` is written when `ci_summary: true`.
- Summaries are re-rendered incrementally every `N` completed runs.
- `summary.json` now includes `improvement_traces` for non-baseline variants when lineage can be reconstructed from the config and ledger.
- `summary.md` shows the best improvement path, including the recorded rationale, concrete changed fields, and delta vs parent / baseline.
- When you use the default output root, runs are written under `.smarteval/runs/` next to the config so each eval config keeps its own history root.

## Gates

```yaml
gates:
  min_runs_per_variant: 5
  slice_regression_threshold: 0.10
  slice_regression_action: warn
  require_baseline: true
  evaluator_fingerprint_change: refuse
```

- `require_baseline` rejects filtered runs that omit the baseline.
- `evaluator_fingerprint_change: refuse` blocks runs when the project lock indicates a rebaseline is required.

## Golden Set Format

Each line is a JSON object:

```json
{"id":"q1","input":{"question":"What is 2+2?"},"expected":{"answer":"4"},"tags":["arithmetic"],"added_at":"2026-04-17"}
```

Supported fields:

- `id`
- `input`
- `expected`
- `tags`
- `difficulty`
- `notes`
- `added_at`
- `added_by`
