# Smarteval Implementation Tasks

Working checklist for implementation. Keep this file practical and update it as tasks move.

## Phase 0: Project Skeleton

- [x] Create TypeScript package structure.
- [x] Add CLI entrypoint.
- [x] Add test runner and lint/typecheck commands.
- [x] Add config/schema validation dependency, likely Zod.
- [x] Add fixtures directory for sample evals.
- [x] Add minimal README usage path.

## Phase 1: Artifact Schemas

- [x] Define `eval.yaml` schema.
- [x] Define dataset JSONL row schema.
- [x] Define candidate schema.
- [x] Define run manifest schema.
- [x] Define per-example result schema.
- [x] Define aggregate score schema.
- [x] Define report input model.
- [x] Implement `smarteval validate`.
- [x] Add schema tests with valid and invalid fixtures.

## Phase 2: Core Runner

- [x] Implement repo root / `.smarteval` discovery.
- [x] Implement eval loader.
- [x] Implement JSONL dataset loader.
- [x] Implement command target adapter first.
- [x] Add process timeout handling.
- [x] Capture stdout/stderr/error status per example.
- [x] Write run artifacts under `.smarteval/evals/<name>/runs/<run_id>/`.
- [x] Add baseline run support.
- [x] Add candidate run support.

## Phase 3: Evaluators

- [x] Implement evaluator interface.
- [x] Implement deterministic JSON validity check.
- [x] Implement JSON schema / required field check.
- [x] Implement regex / contains / not-contains checks.
- [x] Implement word/character length checks.
- [x] Implement runtime metrics: latency, error rate, timeout count.
- [x] Implement reference-based exact/field match.
- [x] Add evaluator tests.

## Phase 4: Judge Providers

- [x] Define `JudgeProvider` interface.
- [x] Define structured judge output contract.
- [x] Implement OpenRouter judge provider first.
- [x] Add structured-output parsing and repair/failure handling.
- [x] Store judge model/provider/rubric/raw response metadata.
- [x] Implement Codex SDK judge provider.
- [x] Implement Claude Agent SDK judge provider using V2 preview behind adapter.
- [x] Add `command` judge provider.
- [x] Add local-agent reproducibility warnings in run metadata/report.

Note: provider interfaces, OpenRouter, command judging, Codex SDK, and Claude Agent SDK judging are implemented. Codex and Claude use optional dynamic adapters so Smarteval does not force those SDK packages as hard dependencies.

## Phase 5: Scoring and Comparison

- [x] Implement metric weighting.
- [x] Preserve per-metric scores separately from aggregate.
- [x] Compare baseline vs candidate.
- [x] Detect regressions by metric.
- [x] Detect cost/latency regressions.
- [x] Add simple failure clustering by evaluator failure/tag.
- [x] Add comparison tests.

## Phase 6: Reports

- [x] Generate markdown report.
- [x] Include target, dataset, candidate, run metadata.
- [x] Include baseline score and candidate score.
- [x] Include per-metric movement.
- [x] Include regressions and limitations.
- [x] Warn on weak datasets.
- [x] Warn on judge-heavy wins.
- [x] Include recommended next action.

## Phase 7: Planning and Candidate UX

- [x] Implement `smarteval init`.
- [x] Implement `smarteval plan`.
- [x] Make `smarteval plan` assisted-first with explicit `--manual` fallback.
- [x] Add command planner provider contract for assisted planning.
- [x] Add Codex SDK planner provider.
- [x] Add Claude Agent SDK planner provider using V2 preview behind adapter.
- [x] Add OpenRouter API planner provider.
- [x] Add `.smarteval/config.yaml` defaults for planner, judge, cost, and concurrency.
- [x] Implement `smarteval dataset add`.
- [x] Implement `smarteval propose`.
- [x] Implement `smarteval apply <candidate> --dry-run`.
- [x] Keep all generated plans/candidates human-editable.

## Phase 8: Agent Pack

- [x] Add `AGENTS.md` snippet template.
- [x] Add `CLAUDE.md` snippet template.
- [x] Add Claude skill template.
- [x] Add Codex skill template.
- [x] Add rubric/report template references.
- [x] Add install/copy command for agent pack.

## Phase 9: Hardening

- [x] Add cost caps for judge providers.
- [x] Add concurrency controls.
- [x] Add credential checks and actionable errors.
- [x] Add `smarteval doctor`.
- [x] Add dirty-worktree / git commit metadata.
- [x] Add CI smoke command.
- [x] Add fixture-based end-to-end test.

## Deferred

- [ ] MCP server.
- [ ] Image-generation evals.
- [ ] Audio-generation / voice evals.
- [ ] Multimodal judge rubrics.
- [ ] Trace import from existing observability/eval tools.
- [ ] Human review queue.
- [ ] CI regression gates.
- [ ] Hosted dashboard.
- [ ] Production monitoring.
- [ ] Advanced optimization/search.
