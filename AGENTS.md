# AGENTS.md

This repository is a Python eval framework with a CLI-first workflow. Keep changes small, typed, and easy to review.

## Working Rules

- Use `apply_patch` for manual edits.
- Prefer `rg` and `rg --files` for search.
- Do not overwrite or revert unrelated user changes.
- Run tests with `.venv/bin/python -m pytest -q`.
- Keep new files ASCII unless an existing file requires otherwise.
- When making commits, use semantic prefixes such as `feat:`, `fix:`, `refactor:`, `docs:`, or `chore:`.

## Project Shape

- `src/smarteval/core`: config loading, runner, rescore, router, stats, evaluator fingerprinting
- `src/smarteval/plugins`: generator, contract, and scorer implementations plus registry loading
- `src/smarteval/ledger`: persisted variant and verdict history
- `src/smarteval/proposer`: proposer context, dedup, and proposal materialization
- `src/smarteval/reporting`: markdown and JSON run summaries
- `src/smarteval/cli`: Typer CLI entrypoints
- `examples/`: minimal runnable examples, including manifest-backed ASR
- `tests/`: unit and CLI coverage

## Expected Workflow

1. Read `README.md` and the relevant file under `docs/` before changing behavior.
2. If the change affects run semantics, check `DESIGN.md` for the intended contract.
3. Update tests with code changes.
4. Run `.venv/bin/python -m pytest -q` before finishing.

## Important Contracts

- One run evaluates one primary artifact.
- Manifest-backed generators may keep sibling outputs as attachments.
- `rescore` must reuse stored artifacts and must not rerun generators.
- Evaluator changes should go through `smarteval rebaseline`, not `try-new-model`.
- Verdict and proposal history belongs in `ledger/`.
- Optimization summaries should preserve an explainable lineage from baseline through proposal rationale, changed fields, and observed score deltas.

## Docs To Keep In Sync

- `README.md` for quick start and common commands
- `docs/configuration.md` for config schema and defaults
- `docs/cli.md` for command behavior
- `docs/scoring-and-gates.md` for summary outputs and evaluator behavior
- `docs/pipelines-and-asr.md` for manifest-backed pipeline behavior
- `docs/optimization.md` for proposer and ledger behavior
