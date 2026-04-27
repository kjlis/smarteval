# Smarteval Implementation Tasks

Working checklist for implementation. Keep this file practical and update it as tasks move.

## Phase 0: Project Skeleton

- [ ] Create TypeScript package structure.
- [ ] Add CLI entrypoint.
- [ ] Add test runner and lint/typecheck commands.
- [ ] Add config/schema validation dependency, likely Zod.
- [ ] Add fixtures directory for sample evals.
- [ ] Add minimal README usage path.

## Phase 1: Artifact Schemas

- [ ] Define `eval.yaml` schema.
- [ ] Define dataset JSONL row schema.
- [ ] Define candidate schema.
- [ ] Define run manifest schema.
- [ ] Define per-example result schema.
- [ ] Define aggregate score schema.
- [ ] Define report input model.
- [ ] Implement `smarteval validate`.
- [ ] Add schema tests with valid and invalid fixtures.

## Phase 2: Core Runner

- [ ] Implement repo root / `.smarteval` discovery.
- [ ] Implement eval loader.
- [ ] Implement JSONL dataset loader.
- [ ] Implement command target adapter first.
- [ ] Add process timeout handling.
- [ ] Capture stdout/stderr/error status per example.
- [ ] Write run artifacts under `.smarteval/evals/<name>/runs/<run_id>/`.
- [ ] Add baseline run support.
- [ ] Add candidate run support.

## Phase 3: Evaluators

- [ ] Implement evaluator interface.
- [ ] Implement deterministic JSON validity check.
- [ ] Implement JSON schema / required field check.
- [ ] Implement regex / contains / not-contains checks.
- [ ] Implement word/character length checks.
- [ ] Implement runtime metrics: latency, error rate, timeout count.
- [ ] Implement reference-based exact/field match.
- [ ] Add evaluator tests.

## Phase 4: Judge Providers

- [ ] Define `JudgeProvider` interface.
- [ ] Define structured judge output contract.
- [ ] Implement OpenRouter judge provider first.
- [ ] Add structured-output parsing and repair/failure handling.
- [ ] Store judge model/provider/rubric/raw response metadata.
- [ ] Implement Codex SDK judge provider.
- [ ] Implement Claude Agent SDK judge provider using V2 preview behind adapter.
- [ ] Add `command` judge provider.
- [ ] Add local-agent reproducibility warnings in run metadata/report.

## Phase 5: Scoring and Comparison

- [ ] Implement metric weighting.
- [ ] Preserve per-metric scores separately from aggregate.
- [ ] Compare baseline vs candidate.
- [ ] Detect regressions by metric.
- [ ] Detect cost/latency regressions.
- [ ] Add simple failure clustering by evaluator failure/tag.
- [ ] Add comparison tests.

## Phase 6: Reports

- [ ] Generate markdown report.
- [ ] Include target, dataset, candidate, run metadata.
- [ ] Include baseline score and candidate score.
- [ ] Include per-metric movement.
- [ ] Include regressions and limitations.
- [ ] Warn on weak datasets.
- [ ] Warn on judge-heavy wins.
- [ ] Include recommended next action.

## Phase 7: Planning and Candidate UX

- [ ] Implement `smarteval init`.
- [ ] Implement `smarteval plan`.
- [ ] Implement `smarteval dataset add`.
- [ ] Implement `smarteval propose`.
- [ ] Implement `smarteval apply <candidate> --dry-run`.
- [ ] Keep all generated plans/candidates human-editable.

## Phase 8: Agent Pack

- [ ] Add `AGENTS.md` snippet template.
- [ ] Add `CLAUDE.md` snippet template.
- [ ] Add Claude skill template.
- [ ] Add Codex skill template.
- [ ] Add rubric/report template references.
- [ ] Add install/copy command for agent pack.

## Phase 9: Hardening

- [ ] Add cost caps for judge providers.
- [ ] Add concurrency controls.
- [ ] Add credential checks and actionable errors.
- [ ] Add `smarteval doctor`.
- [ ] Add dirty-worktree / git commit metadata.
- [ ] Add CI smoke command.
- [ ] Add fixture-based end-to-end test.

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
