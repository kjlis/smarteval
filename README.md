# smarteval

`smarteval` is a Python-first framework for evaluating non-deterministic systems with reproducible bakeoffs, manifest-backed pipeline support, and pluggable scorers.

## What It Does

- Runs `case × variant × iteration` bakeoffs and writes incremental results to `runs/`
  By default these now live under `.smarteval/runs/` next to the config, so each eval keeps its
  own history root.
- Supports script generators, OpenAI/Codex generators, and manifest-backed external pipelines
- Scores one primary artifact per run while retaining sibling outputs as attachments/context
- Persists variant and verdict history in `ledger/`
  By default this now lives under `.smarteval/ledger/` next to the config.
- Supports `resume`, `rescore`, `propose`, `rebaseline`, and `try-new-model`
- Defaults proposer calls to local Codex, with explicit OpenAI fallback support
- Lets each eval config define proposer search-space constraints and required diversity probes

## Quick Start

Install in editable mode:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

If you want to use the default local Codex-backed `llm_rubric` scorer, also install the
experimental Codex Python SDK from a local `openai/codex` checkout:

```bash
/path/to/smarteval/.venv/bin/pip install -e /path/to/openai-codex/sdk/python
```

Initialize a project:

```bash
smarteval init
smarteval validate-config --path smarteval.yaml
smarteval run --path smarteval.yaml
```

Inspect a run:

```bash
cat runs/*/summary.md
smarteval log
```

## Example Configs

- [examples/basic_text/smarteval.yaml](examples/basic_text/smarteval.yaml)
- [examples/asr_manifest/smarteval.yaml](examples/asr_manifest/smarteval.yaml)

## Docs

- [docs/README.md](docs/README.md)
- [docs/configuration.md](docs/configuration.md)
- [docs/cli.md](docs/cli.md)
- [docs/pipelines-and-asr.md](docs/pipelines-and-asr.md)
- [docs/optimization.md](docs/optimization.md)
- [docs/graph.md](docs/graph.md)

The ASR example shows the intended v1 pattern:

- a full external pipeline run is one generator invocation
- the pipeline returns a manifest with stable logical output keys
- `artifact_selection.primary_output` picks the evaluated output
- sibling outputs are copied into `runs/.../attachments/` when enabled

To score deterministic ASR note outputs with the default local Codex evaluator, add an
`llm_rubric` stage to your config:

```yaml
pipeline:
  - id: note_quality
    kind: llm_rubric
    rubric: rubrics/note_quality.yaml
    # Optional if `codex` is not on PATH:
    # codex_bin: /opt/homebrew/bin/codex
```

Then run:

```bash
smarteval validate-config --path examples/asr_manifest/smarteval.yaml
smarteval estimate --path examples/asr_manifest/smarteval.yaml
smarteval run --path examples/asr_manifest/smarteval.yaml --output-root runs
```

## CLI

```bash
smarteval validate-config --path smarteval.yaml
smarteval estimate --path smarteval.yaml
smarteval run --path smarteval.yaml [--variant ID] [--tag TAG] [--case-pattern GLOB] [--dry-run]
smarteval resume --path smarteval.yaml <run_dir>
smarteval rescore --path smarteval.yaml <run_dir>
smarteval diff <run_dir_a> <run_dir_b>
smarteval propose --path smarteval.yaml <run_dir> [--backend codex_local|openai] [--codex-bin /path/to/codex]
smarteval verdict --path smarteval.yaml <run_id>
smarteval try-new-model <model_id> --path smarteval.yaml
smarteval rebaseline --path smarteval.yaml <run_dir> --from OLD --to NEW
smarteval doctor --path smarteval.yaml
python scripts/optimize_loop.py --path smarteval.yaml [--rounds 5] [--proposals-per-round 3]
```

## Notes

- `smarteval propose` now uses the local Codex proposer backend by default. Pass `--backend openai` to force the previous OpenAI Responses path.
- `python scripts/optimize_loop.py` runs an initial bakeoff, proposes improvements, persists materialized variants into `ledger/variants.jsonl`, and reruns focused bakeoffs for multiple rounds.
- Run summaries now include `improvement_traces`, which tie score deltas back to the recorded proposal rationale, changed fields, and parent-to-child lift for the best path from baseline.
- Proposal attempts are also tracked in `ledger/proposals.jsonl`, including rejected duplicates, so later graphing can show failed branches instead of only accepted variants.
- `try-new-model` is for generator swaps only. Evaluator changes must go through `rebaseline`.
- `rescore` reuses stored artifacts instead of rerunning generators.
- Project-level evaluator locks live under `.smarteval/lock.json`.
- The default per-eval data root is `.smarteval/`, with `runs/`, `ledger/`, and `optimization-runs/`
  grouped under it for easier tracking and visualization.
- A successful `llm_rubric` run is: golden case loaded -> generator produces artifact -> Codex scores the selected artifact.
