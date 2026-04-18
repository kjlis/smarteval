from __future__ import annotations

import hashlib
import json
from fnmatch import fnmatch
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from time import perf_counter

from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.golden import load_golden_set
from smarteval.core.improvement_trace import build_improvement_traces
from smarteval.core.models import (
    Artifact,
    BakeoffConfig,
    BakeoffSummary,
    ContractResult,
    RunRecord,
    SliceSummary,
    SpecialistCandidate,
    VariantSummary,
)
from smarteval.core.pipeline import execute_scoring_pipeline
from smarteval.core.router import load_router_spec, route_case
from smarteval.core.rubric import load_rubric
from smarteval.core.stats import bootstrap_ci, mean_or_none
from smarteval.ledger.writer import append_variant_records, ensure_ledger_layout
from smarteval.plugins.registry import create_generator
from smarteval.reporting.json_report import write_ci_json, write_summary_json
from smarteval.reporting.markdown import write_summary_markdown


def run_bakeoff(
    config: BakeoffConfig,
    *,
    output_root: str | Path = "runs",
    bakeoff_id: str | None = None,
    resume: bool = False,
    case_tags: list[str] | None = None,
    case_pattern: str | None = None,
) -> tuple[Path, BakeoffSummary]:
    cases, golden_hash = load_golden_set(config.golden_set)
    cases = _filter_cases(cases, tags=case_tags, case_pattern=case_pattern)
    bakeoff_id = bakeoff_id or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    run_dir = Path(output_root) / f"{bakeoff_id}__{bakeoff_id[:6]}"
    by_case_dir = run_dir / "by_case"
    artifacts_dir = run_dir / "artifacts"
    attachments_dir = run_dir / "attachments"
    logs_dir = run_dir / "logs"
    by_case_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    attachments_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    append_variant_records(config)

    evaluator_fingerprint = compute_evaluator_fingerprint(
        config.evaluator,
        _first_rubric_for_fingerprint(config),
        backend=_first_llm_rubric_backend(config),
    )
    _check_project_lock(config, evaluator_fingerprint)
    _write_lock_file(run_dir / "lock.json", config, evaluator_fingerprint, golden_hash)

    existing = load_run_records(run_dir) if resume else {}
    run_records: list[RunRecord] = list(existing.values())
    router_spec = load_router_spec(config.router) if config.router else None
    completed_since_summary = 0
    summary_interval = max(1, config.reporting.incremental_summary_every_n_runs)

    for variant in config.variants:
        if variant.generator.kind == "router":
            generator = None
            params = {}
        else:
            generator, params = create_generator(variant, config=config)
        for case in cases:
            for iteration in range(1, config.execution.runs_per_variant + 1):
                run_id = f"{bakeoff_id}/{case.id}/{variant.id}/{iteration}"
                if run_id in existing:
                    continue

                started = perf_counter()
                timestamp = datetime.now(timezone.utc)
                try:
                    if variant.generator.kind == "router":
                        artifact = _run_router_variant(config, router_spec, case, iteration)
                    else:
                        assert generator is not None
                        artifact = generator.generate(case, params)
                    contract, scores = execute_scoring_pipeline(
                        case,
                        artifact,
                        config.pipeline,
                        evaluator=config.evaluator,
                    )
                    status = "success"
                    error = None
                except Exception as exc:  # noqa: BLE001
                    artifact = None
                    contract = None
                    scores = []
                    status = "failed"
                    error = str(exc)

                duration_ms = int((perf_counter() - started) * 1000)
                record = RunRecord(
                    run_id=run_id,
                    case_id=case.id,
                    case_input=case.input,
                    case_expected=case.expected,
                    variant_id=variant.id,
                    generator=variant.generator.kind,
                    iteration=iteration,
                    artifact=artifact or _failed_artifact(),
                    contract=contract or _failed_contract(error),
                    scores=scores,
                    cost_usd=_extract_cost(artifact.metadata if artifact else {}),
                    duration_ms=duration_ms,
                    timestamp=timestamp,
                    evaluator_fingerprint=evaluator_fingerprint,
                    golden_hash=golden_hash,
                    status=status,
                    error=error,
                    tags=case.tags,
                    difficulty=case.difficulty,
                )
                run_records.append(record)
                _write_run_record(by_case_dir, record)
                _write_artifact(artifacts_dir, case.id, variant.id, iteration, record.artifact)
                if config.artifact_selection.copy_attachments:
                    _write_attachments(attachments_dir, case.id, variant.id, iteration, record.artifact)
                completed_since_summary += 1
                if completed_since_summary % summary_interval == 0:
                    partial = summarize_runs(
                        run_records,
                        config=config,
                        baseline=config.baseline,
                        bakeoff_id=bakeoff_id,
                        golden_hash=golden_hash,
                        evaluator_fingerprint=evaluator_fingerprint,
                        gates=config.gates,
                    )
                    _write_summary_files(run_dir, config, partial)

    summary = summarize_runs(
        run_records,
        config=config,
        baseline=config.baseline,
        bakeoff_id=bakeoff_id,
        golden_hash=golden_hash,
        evaluator_fingerprint=evaluator_fingerprint,
        gates=config.gates,
    )
    _write_summary_files(run_dir, config, summary)
    _write_log(logs_dir / "run.log", summary)
    return run_dir, summary


def resume_bakeoff(config: BakeoffConfig, *, run_dir: str | Path) -> tuple[Path, BakeoffSummary]:
    target = Path(run_dir)
    bakeoff_id = target.name.split("__", 1)[0]
    return run_bakeoff(config, output_root=target.parent, bakeoff_id=bakeoff_id, resume=True)


def estimate_bakeoff(config: BakeoffConfig) -> dict[str, int]:
    cases, _ = load_golden_set(config.golden_set)
    return {
        "cases": len(cases),
        "variants": len(config.variants),
        "runs_per_variant": config.execution.runs_per_variant,
        "total_runs": len(cases) * len(config.variants) * config.execution.runs_per_variant,
    }


def summarize_runs(
    run_records: list[RunRecord],
    *,
    config: BakeoffConfig,
    baseline: str,
    bakeoff_id: str,
    golden_hash: str,
    evaluator_fingerprint: str,
    gates,
) -> BakeoffSummary:
    grouped: dict[str, list[RunRecord]] = defaultdict(list)
    for record in run_records:
        grouped[record.variant_id].append(record)

    baseline_mean = _mean_run_score(grouped.get(baseline, []))
    variant_summaries: list[VariantSummary] = []
    regressions: list[str] = []
    per_slice = _slice_summaries(run_records, baseline)
    specialists = _find_specialists(per_slice, gates)

    for variant_id, records in grouped.items():
        pass_values = [1.0 if record.status == "success" and _record_passed(record) else 0.0 for record in records]
        score_values = [score.value for record in records for score in record.scores if score.value is not None]
        failed_records = [record for record in records if record.status == "failed"]
        pass_rate = mean(pass_values)
        pass_rate_ci = bootstrap_ci(pass_values)
        mean_score = mean_or_none(score_values)
        mean_score_ci = bootstrap_ci(score_values) if score_values else (None, None)
        delta = None if variant_id == baseline or mean_score is None or baseline_mean is None else mean_score - baseline_mean
        delta_ci = _paired_delta_ci(grouped.get(baseline, []), records) if variant_id != baseline else (None, None)

        summary = VariantSummary(
            variant_id=variant_id,
            run_count=len(records),
            pass_rate=pass_rate,
            pass_rate_ci_low=pass_rate_ci[0],
            pass_rate_ci_high=pass_rate_ci[1],
            mean_score=mean_score,
            mean_score_ci_low=mean_score_ci[0],
            mean_score_ci_high=mean_score_ci[1],
            mean_cost_usd=mean(record.cost_usd for record in records),
            mean_duration_ms=mean(record.duration_ms for record in records),
            failed_run_count=len(failed_records),
            sample_errors=_sample_errors(failed_records),
            delta_vs_baseline=delta,
            delta_ci_low=delta_ci[0],
            delta_ci_high=delta_ci[1],
        )
        variant_summaries.append(summary)

        if delta is not None and delta < -gates.slice_regression_threshold:
            regressions.append(f"{variant_id} regressed vs baseline by {delta:+.3f}")

    variant_summaries.sort(key=lambda item: item.variant_id)
    improvement_traces = build_improvement_traces(config, variant_summaries, run_records)
    return BakeoffSummary(
        bakeoff_id=bakeoff_id,
        baseline=baseline,
        evaluator_fingerprint=evaluator_fingerprint,
        golden_hash=golden_hash,
        generated_at=datetime.now(timezone.utc),
        variants=variant_summaries,
        per_slice=per_slice,
        specialists=specialists,
        improvement_traces=improvement_traces,
        regressions=regressions,
        total_cost_usd=sum(record.cost_usd for record in run_records),
        total_duration_ms=sum(record.duration_ms for record in run_records),
    )


def load_run_records(run_dir: str | Path) -> dict[str, RunRecord]:
    by_case_dir = Path(run_dir) / "by_case"
    if not by_case_dir.exists():
        return {}
    records: dict[str, RunRecord] = {}
    for path in sorted(by_case_dir.glob("*.jsonl")):
        records_obj = RunRecord.model_validate_json(path.read_text(encoding="utf-8"))
        records[records_obj.run_id] = records_obj
    return records


def read_summary(run_dir: str | Path) -> BakeoffSummary:
    path = Path(run_dir) / "summary.json"
    return BakeoffSummary.model_validate_json(path.read_text(encoding="utf-8"))


def compare_summaries(run_dir_a: str | Path, run_dir_b: str | Path) -> dict[str, dict[str, float | None]]:
    a = read_summary(run_dir_a)
    b = read_summary(run_dir_b)
    variants_a = {item.variant_id: item for item in a.variants}
    variants_b = {item.variant_id: item for item in b.variants}
    all_variant_ids = sorted(set(variants_a) | set(variants_b))
    diff: dict[str, dict[str, float | None]] = {}
    for variant_id in all_variant_ids:
        item_a = variants_a.get(variant_id)
        item_b = variants_b.get(variant_id)
        diff[variant_id] = {
            "mean_score_a": item_a.mean_score if item_a else None,
            "mean_score_b": item_b.mean_score if item_b else None,
            "delta": (
                None
                if item_a is None or item_b is None or item_a.mean_score is None or item_b.mean_score is None
                else item_b.mean_score - item_a.mean_score
            ),
        }
    return diff


def doctor(config: BakeoffConfig | None = None) -> dict[str, bool | str]:
    import os

    result: dict[str, bool | str] = {
        "python": True,
        "openai_api_key": bool(os.getenv("OPENAI_API_KEY")),
    }
    if config is not None:
        result["config_loadable"] = True
        result["golden_set_exists"] = config.golden_set.exists()
    return result


def write_verdict_note_stub(project_root: str | Path, run_id: str) -> Path:
    ledger_dir = ensure_ledger_layout(project_root)
    note_path = ledger_dir / "notes" / f"{run_id.replace('/', '__')}.md"
    if not note_path.exists():
        note_path.write_text(f"# Notes for {run_id}\n\n", encoding="utf-8")
    return note_path


def _slice_summaries(run_records: list[RunRecord], baseline: str) -> list[SliceSummary]:
    grouped: dict[tuple[str, str], list[RunRecord]] = defaultdict(list)
    for record in run_records:
        for tag in record.tags:
            grouped[(tag, record.variant_id)].append(record)

    baseline_means = {
        tag: _mean_run_score(records)
        for (tag, variant_id), records in grouped.items()
        if variant_id == baseline
    }

    results: list[SliceSummary] = []
    for (tag, variant_id), records in sorted(grouped.items()):
        mean_score = _mean_run_score(records)
        baseline_mean = baseline_means.get(tag)
        delta = None if variant_id == baseline or mean_score is None or baseline_mean is None else mean_score - baseline_mean
        results.append(
            SliceSummary(
                slice_name=tag,
                variant_id=variant_id,
                run_count=len(records),
                mean_score=mean_score,
                delta_vs_baseline=delta,
            )
        )
    return results


def _find_specialists(per_slice: list[SliceSummary], gates) -> list[SpecialistCandidate]:
    by_variant: dict[str, list[SliceSummary]] = defaultdict(list)
    for item in per_slice:
        if item.delta_vs_baseline is not None:
            by_variant[item.variant_id].append(item)

    candidates: list[SpecialistCandidate] = []
    for variant_id, slices in by_variant.items():
        winners = [item for item in slices if item.delta_vs_baseline is not None and item.delta_vs_baseline >= gates.specialist_lift_threshold and item.run_count >= gates.specialist_min_n]
        if not winners:
            continue
        if any((item.delta_vs_baseline or 0.0) < -gates.slice_regression_threshold for item in slices):
            continue
        best = max(winners, key=lambda item: item.delta_vs_baseline or 0.0)
        candidates.append(
            SpecialistCandidate(
                variant_id=variant_id,
                slice_name=best.slice_name,
                lift_vs_baseline=best.delta_vs_baseline or 0.0,
                n_runs=best.run_count,
            )
        )
    return sorted(candidates, key=lambda item: (item.variant_id, item.slice_name))


def _record_passed(record: RunRecord) -> bool:
    return all(score.passed for score in record.scores) if record.scores else record.contract.passed


def _mean_run_score(records: list[RunRecord]) -> float | None:
    values = [score.value for record in records for score in record.scores if score.value is not None]
    return mean_or_none(values)


def _paired_delta_ci(
    baseline_records: list[RunRecord],
    candidate_records: list[RunRecord],
) -> tuple[float | None, float | None]:
    from smarteval.core.stats import paired_bootstrap_delta_ci

    baseline_by_case = _per_case_scores(baseline_records)
    candidate_by_case = _per_case_scores(candidate_records)
    shared_case_ids = sorted(set(baseline_by_case) & set(candidate_by_case))
    baseline_values = [baseline_by_case[case_id] for case_id in shared_case_ids]
    candidate_values = [candidate_by_case[case_id] for case_id in shared_case_ids]
    return paired_bootstrap_delta_ci(baseline_values, candidate_values)


def _per_case_scores(records: list[RunRecord]) -> dict[str, float]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for record in records:
        values = [score.value for score in record.scores if score.value is not None]
        if values:
            grouped[record.case_id].append(mean(values))
    return {case_id: mean(values) for case_id, values in grouped.items()}


def _sample_errors(records: list[RunRecord], *, limit: int = 3) -> list[str]:
    samples: list[str] = []
    for record in records:
        if not record.error or record.error in samples:
            continue
        samples.append(record.error)
        if len(samples) >= limit:
            break
    return samples


def _write_run_record(by_case_dir: Path, record: RunRecord) -> None:
    filename = f"case-{record.case_id}__variant-{record.variant_id}__iter-{record.iteration}.jsonl"
    (by_case_dir / filename).write_text(record.model_dump_json(indent=2), encoding="utf-8")


def _write_artifact(artifacts_dir: Path, case_id: str, variant_id: str, iteration: int, artifact: Artifact) -> None:
    filename = f"case-{case_id}__variant-{variant_id}__iter-{iteration}"
    if artifact.kind == "json":
        (artifacts_dir / f"{filename}.json").write_text(json.dumps(artifact.payload, indent=2), encoding="utf-8")
        return
    if artifact.kind == "text":
        (artifacts_dir / f"{filename}.txt").write_text(str(artifact.payload), encoding="utf-8")
        return
    (artifacts_dir / f"{filename}.path.txt").write_text(str(artifact.payload), encoding="utf-8")


def _write_attachments(
    attachments_dir: Path,
    case_id: str,
    variant_id: str,
    iteration: int,
    artifact: Artifact,
) -> None:
    for name, attachment in artifact.attachments.items():
        source_path = _resolve_attachment_path(artifact, attachment.uri)
        if source_path is None or not source_path.exists():
            continue
        filename = f"case-{case_id}__variant-{variant_id}__iter-{iteration}__{name}"
        if attachment.kind == "json":
            payload = json.loads(source_path.read_text(encoding="utf-8"))
            (attachments_dir / f"{filename}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
            continue
        if attachment.kind == "text":
            (attachments_dir / f"{filename}.txt").write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")
            continue
        (attachments_dir / f"{filename}.path.txt").write_text(str(source_path), encoding="utf-8")


def _write_summary_files(run_dir: Path, config: BakeoffConfig, summary: BakeoffSummary) -> None:
    if "markdown" in config.reporting.formats:
        write_summary_markdown(run_dir / "summary.md", summary)
    if "json" in config.reporting.formats:
        write_summary_json(run_dir / "summary.json", summary)
    if config.reporting.ci_summary:
        write_ci_json(run_dir / "ci.json", summary, gates=config.gates)


def _write_lock_file(path: Path, config: BakeoffConfig, evaluator_fingerprint: str, golden_hash: str) -> None:
    payload = {
        "evaluator_fingerprint": evaluator_fingerprint,
        "golden_hash": golden_hash,
        "config_hash": _config_hash(config),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_log(path: Path, summary: BakeoffSummary) -> None:
    path.write_text(
        f"bakeoff={summary.bakeoff_id} baseline={summary.baseline} variants={len(summary.variants)} cost={summary.total_cost_usd:.4f}\n",
        encoding="utf-8",
    )


def _config_hash(config: BakeoffConfig) -> str:
    payload = config.model_dump_json(exclude={"project_root", "config_path"}, exclude_none=True, indent=None)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def _extract_cost(metadata: dict) -> float:
    value = metadata.get("cost_usd") if metadata else None
    return float(value) if isinstance(value, (int, float)) else 0.0


def _failed_artifact() -> Artifact:
    return Artifact(kind="text", payload="")


def _failed_contract(error: str | None) -> ContractResult:
    return ContractResult(passed=False, violations=[error or "generation failed"])


def _first_rubric_for_fingerprint(config: BakeoffConfig):
    for stage in config.pipeline:
        rubric_value = getattr(stage, "rubric", None)
        if stage.kind == "llm_rubric" and rubric_value:
            return load_rubric(rubric_value)
    return None


def _first_llm_rubric_backend(config: BakeoffConfig) -> str | None:
    for stage in config.pipeline:
        if stage.kind == "llm_rubric":
            return getattr(stage, "backend", None) or "codex_local"
    return None


def _run_router_variant(config: BakeoffConfig, router_spec, case, iteration: int) -> Artifact:
    if router_spec is None:
        raise ValueError("router variant requested but no router spec configured")
    chosen_variant_id = route_case(case, router_spec)
    variant = config.get_variant(chosen_variant_id)
    generator, params = create_generator(variant, config=config)
    artifact = generator.generate(case, params)
    artifact.metadata["routed_variant_id"] = chosen_variant_id
    artifact.metadata["router_iteration"] = iteration
    return artifact


def _resolve_attachment_path(artifact: Artifact, uri: str) -> Path | None:
    path = Path(uri)
    if path.is_absolute():
        return path
    if artifact.source_manifest:
        return (Path(artifact.source_manifest).parent / path).resolve()
    if artifact.source_run_dir:
        return (Path(artifact.source_run_dir) / path).resolve()
    return None


def _filter_cases(cases, *, tags: list[str] | None, case_pattern: str | None):
    selected = list(cases)
    if tags:
        required = set(tags)
        selected = [case for case in selected if required.issubset(set(case.tags))]
    if case_pattern:
        selected = [case for case in selected if fnmatch(case.id, case_pattern)]
    return selected


def _check_project_lock(config: BakeoffConfig, evaluator_fingerprint: str) -> None:
    project_lock = Path(config.project_root or Path.cwd()) / ".smarteval" / "lock.json"
    if not project_lock.exists():
        return
    payload = json.loads(project_lock.read_text(encoding="utf-8"))
    locked_fingerprint = payload.get("new_fingerprint") or payload.get("evaluator_fingerprint")
    if not locked_fingerprint or locked_fingerprint == evaluator_fingerprint:
        return
    if config.gates.evaluator_fingerprint_change == "refuse":
        raise ValueError(
            "evaluator fingerprint changed from the project lock; use `smarteval rebaseline` before running"
        )
