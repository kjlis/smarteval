# smarteval

`smarteval` is a Python-first framework for evaluating non-deterministic systems with reproducible bakeoffs, manifest-backed pipeline support, and pluggable scorers.

## What It Does

- Runs `case × variant × iteration` bakeoffs and writes incremental results to `runs/`
- Supports script generators, OpenAI/Codex generators, and manifest-backed external pipelines
- Scores one primary artifact per run while retaining sibling outputs as attachments/context
- Persists variant and verdict history in `ledger/`
- Supports `resume`, `rescore`, `propose`, `rebaseline`, and `try-new-model`

## Quick Start

Install in editable mode:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

Initialize a project:

```bash
smarteval init
smarteval validate-config
smarteval run
```

Inspect a run:

```bash
cat runs/*/summary.md
smarteval log
```

## Example Configs

- [examples/basic_text/smarteval.yaml](examples/basic_text/smarteval.yaml)
- [examples/asr_manifest/smarteval.yaml](examples/asr_manifest/smarteval.yaml)

The ASR example shows the intended v1 pattern:

- a full external pipeline run is one generator invocation
- the pipeline returns a manifest with stable logical output keys
- `artifact_selection.primary_output` picks the evaluated output
- sibling outputs are copied into `runs/.../attachments/` when enabled

## CLI

```bash
smarteval validate-config
smarteval estimate
smarteval run [--variant ID] [--tag TAG] [--case-pattern GLOB] [--dry-run]
smarteval resume <run_dir>
smarteval rescore <run_dir>
smarteval diff <run_dir_a> <run_dir_b>
smarteval propose <run_dir>
smarteval verdict <run_id>
smarteval try-new-model <model_id>
smarteval rebaseline <run_dir> --from OLD --to NEW
smarteval doctor
```

## Notes

- `try-new-model` is for generator swaps only. Evaluator changes must go through `rebaseline`.
- `rescore` reuses stored artifacts instead of rerunning generators.
- Project-level evaluator locks live under `.smarteval/lock.json`.
