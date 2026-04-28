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
- [x] Add `smarteval config defaults` and provider presets for Codex/Claude/OpenRouter defaults.
- [x] Make subscription-backed Codex the default planner/judge provider after `smarteval init`.
- [x] Resolve unqualified `llm_judge` metrics through configured judge defaults before API fallback.
- [x] Implement `smarteval dataset add`.
- [x] Implement `smarteval propose`.
- [x] Implement `smarteval apply <candidate> --dry-run`.
- [x] Keep all generated plans/candidates human-editable.

## Phase 8: Agent Pack

- [x] Add `AGENTS.md` snippet template.
- [x] Add `CLAUDE.md` snippet template.
- [x] Add Claude skill template.
- [x] Add Codex skill template.
- [x] Add Claude Code slash-command templates for planning and reporting workflows.
- [x] Add rubric/report template references.
- [x] Add install/copy command for full agent pack templates.

## Phase 9: Hardening

- [x] Add cost caps for judge providers.
- [x] Add concurrency controls.
- [x] Add credential checks and actionable errors.
- [x] Add SDK package checks for configured Codex and Claude Agent SDK providers.
- [x] Add `smarteval doctor`.
- [x] Add dirty-worktree / git commit metadata.
- [x] Add CI smoke command.
- [x] Add fixture-based end-to-end test.

## Phase 10: Image Eval Foundation

- [x] Define image artifact schema with `image_path`, `mime_type`, `width`, `height`, `file_size_bytes`, `sha256`, and optional generation metadata.
- [x] Extend command target output contract to support JSON image artifacts.
- [x] Preserve text output compatibility for existing command targets.
- [x] Store image artifacts in per-example result rows.
- [x] Copy or reference generated image files under each run directory in a stable, reportable location.
- [x] Add artifact path normalization and path traversal protection.
- [x] Add image fixture target that writes a tiny deterministic PNG.
- [x] Add fixture-based e2e test for image artifact runs.

## Phase 11: Deterministic Image Evaluators

- [x] Implement `image_exists` evaluator.
- [x] Implement `image_mime_type` evaluator.
- [x] Implement `image_dimensions` evaluator with width/height/aspect-ratio bounds.
- [x] Implement `image_file_size` evaluator.
- [x] Implement `image_not_blank` evaluator using basic pixel statistics.
- [x] Implement duplicate image detection by hash within a run.
- [x] Add evaluator tests with valid, missing, invalid, blank, and wrong-dimension image fixtures.
- [x] Add image evaluator examples to README.

## Phase 12: Image Reports

- [x] Include image artifact metadata in markdown reports.
- [x] Render generated image links/thumbnails in reports using relative paths.
- [ ] Add per-example image gallery/contact sheet section.
- [x] Include failure clusters for image-specific metrics.
- [x] Add warnings for missing reference images, tiny datasets, and judge-only visual scoring.
- [x] Add report tests for image links, thumbnails, and artifact metadata.

## Phase 13: Multimodal Image Judging

- [x] Extend `JudgeInput` to accept image artifacts and optional reference image artifacts.
- [x] Add multimodal `command_judge` contract that passes image paths and rubrics to a local judge command.
- [x] Add image quality/content rubric templates for prompt adherence, subject correctness, composition, style match, visual defects, text rendering, safety, and reference similarity.
- [x] Store multimodal judge provider/model/rubric/raw response metadata per image metric.
- [x] Add cost cap handling for multimodal judge metrics.
- [x] Add multimodal judge tests using a local command stub.
- [x] Add report warnings when image wins are mostly judge-backed.

## Phase 14: Pairwise Image Comparison

- [x] Define pairwise image judge input for baseline image vs candidate image.
- [x] Implement pairwise metric aggregation with win/loss/tie counts.
- [ ] Add per-criterion pairwise scoring.
- [x] Show pairwise comparison tables in reports.
- [ ] Add tests for candidate wins, losses, ties, and conflicting criteria.

## Phase 15: Native Multimodal Providers

- [x] Research current OpenRouter multimodal image input support and structured-output behavior.
- [x] Implement OpenRouter multimodal image judge provider.
- [x] Research current Claude Agent SDK image/file input support.
- [x] Implement Claude multimodal image judge provider if SDK support is stable enough.
- [x] Research current OpenAI/Codex image input support for local agent/API judging.
- [x] Implement Codex/OpenAI multimodal image judge provider if support is stable enough.
- [x] Add provider-specific credential checks to `smarteval doctor`.
- [x] Add provider-specific cost metadata and reproducibility warnings.

## Phase 16: Human Image Review

- [x] Generate human-review gallery artifact for image eval runs.
- [x] Define manual rating JSON/CSV import format.
- [x] Implement `smarteval review import` for human image scores.
- [x] Merge human scores into aggregate comparison.
- [x] Add report section for human-reviewed image decisions.
- [x] Add tests for rating import validation and score aggregation.

## Deferred

- [ ] MCP server.
- [ ] Audio-generation / voice evals.
- [ ] Multimodal judge rubrics.
- [ ] Trace import from existing observability/eval tools.
- [ ] Human review queue.
- [ ] CI regression gates.
- [ ] Hosted dashboard.
- [ ] Production monitoring.
- [ ] Advanced optimization/search.
