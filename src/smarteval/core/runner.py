from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from time import perf_counter

from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.golden import load_golden_set
from smarteval.core.models import BakeoffConfig, BakeoffSummary, RunRecord, VariantSummary
from smarteval.core.pipeline import execute_scoring_pipeline
from smarteval.core.rubric import load_rubric
from smarteval.plugins.registry import create_generator
from smarteval.reporting.json_report import write_ci_json, write_summary_json
from smarteval.reporting.markdown import write_summary_markdown


def run_bakeoff(config: BakeoffConfig, *, output_root: str | Path = "runs") -> tuple[Path, BakeoffSummary]:
    cases, golden_hash = load_golden_set(config.golden_set)
    bakeoff_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    run_dir = Path(output_root) / bakeoff_id
    by_case_dir = run_dir / "by_case"
    artifacts_dir = run_dir / "artifacts"
    by_case_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    evaluator_fingerprint = compute_evaluator_fingerprint(
        config.evaluator,
        _first_rubric_for_fingerprint(config),
    )
    run_records: list[RunRecord] = []

    for variant in config.variants:
        generator, params = create_generator(variant, config=config)
        for case in cases:
            for iteration in range(1, config.execution.runs_per_variant + 1):
                started = perf_counter()
                timestamp = datetime.now(timezone.utc)
                run_id = f"{bakeoff_id}/{case.id}/{variant.id}/{iteration}"
                try:
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
                )
                run_records.append(record)
                _write_run_record(by_case_dir, record)
                _write_artifact(artifacts_dir, case.id, variant.id, iteration, record.artifact)

    summary = summarize_runs(
        run_records,
        baseline=config.baseline,
        bakeoff_id=bakeoff_id,
        golden_hash=golden_hash,
        evaluator_fingerprint=evaluator_fingerprint,
    )
    _write_summary_files(run_dir, config, summary)
    return run_dir, summary


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
    baseline: str,
    bakeoff_id: str,
    golden_hash: str,
    evaluator_fingerprint: str,
) -> BakeoffSummary:
    grouped: dict[str, list[RunRecord]] = defaultdict(list)
    for record in run_records:
        grouped[record.variant_id].append(record)

    variant_summaries: list[VariantSummary] = []
    baseline_mean = _mean_run_score(grouped[baseline])
    regressions: list[str] = []

    for variant_id, records in grouped.items():
        pass_rate = mean(1.0 if record.status == "success" and _record_passed(record) else 0.0 for record in records)
        mean_score = _mean_run_score(records)
        delta = None if variant_id == baseline or mean_score is None or baseline_mean is None else mean_score - baseline_mean
        summary = VariantSummary(
            variant_id=variant_id,
            run_count=len(records),
            pass_rate=pass_rate,
            mean_score=mean_score,
            mean_cost_usd=mean(record.cost_usd for record in records),
            mean_duration_ms=mean(record.duration_ms for record in records),
            delta_vs_baseline=delta,
        )
        variant_summaries.append(summary)

        if delta is not None and delta < 0:
            regressions.append(f"{variant_id} regressed vs baseline by {delta:+.3f}")

    variant_summaries.sort(key=lambda item: item.variant_id)
    return BakeoffSummary(
        bakeoff_id=bakeoff_id,
        baseline=baseline,
        evaluator_fingerprint=evaluator_fingerprint,
        golden_hash=golden_hash,
        generated_at=datetime.now(timezone.utc),
        variants=variant_summaries,
        regressions=regressions,
    )


def _record_passed(record: RunRecord) -> bool:
    return all(score.passed for score in record.scores) if record.scores else record.contract.passed


def _mean_run_score(records: list[RunRecord]) -> float | None:
    values = [score.value for record in records for score in record.scores if score.value is not None]
    return mean(values) if values else None


def _write_run_record(by_case_dir: Path, record: RunRecord) -> None:
    filename = f"case-{record.case_id}__variant-{record.variant_id}__iter-{record.iteration}.jsonl"
    (by_case_dir / filename).write_text(record.model_dump_json(indent=2), encoding="utf-8")


def _write_artifact(artifacts_dir: Path, case_id: str, variant_id: str, iteration: int, artifact) -> None:
    filename = f"case-{case_id}__variant-{variant_id}__iter-{iteration}"
    if artifact.kind == "json":
        path = artifacts_dir / f"{filename}.json"
        path.write_text(json.dumps(artifact.payload, indent=2), encoding="utf-8")
        return
    if artifact.kind == "text":
        path = artifacts_dir / f"{filename}.txt"
        path.write_text(str(artifact.payload), encoding="utf-8")
        return
    path = artifacts_dir / f"{filename}.path.txt"
    path.write_text(str(artifact.payload), encoding="utf-8")


def _write_summary_files(run_dir: Path, config: BakeoffConfig, summary: BakeoffSummary) -> None:
    if "markdown" in config.reporting.formats:
        write_summary_markdown(run_dir / "summary.md", summary)
    if "json" in config.reporting.formats:
        write_summary_json(run_dir / "summary.json", summary)
    if config.reporting.ci_summary:
        write_ci_json(run_dir / "ci.json", summary)


def _extract_cost(metadata: dict) -> float:
    if not metadata:
        return 0.0
    value = metadata.get("cost_usd")
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _failed_artifact():
    from smarteval.core.models import Artifact

    return Artifact(kind="text", payload="")


def _failed_contract(error: str | None):
    from smarteval.core.models import ContractResult

    return ContractResult(passed=False, violations=[error or "generation failed"])


def _first_rubric_for_fingerprint(config: BakeoffConfig):
    for stage in config.pipeline:
        if stage.kind == "llm_rubric" and "rubric" in stage.model_fields_set:
            return load_rubric(stage.rubric)
    return None
