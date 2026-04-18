from __future__ import annotations

from pathlib import Path

from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.models import BakeoffConfig
from smarteval.core.pipeline import execute_scoring_pipeline
from smarteval.core.rubric import load_rubric
from smarteval.core.runner import load_run_records, summarize_runs
from smarteval.reporting.json_report import write_ci_json, write_summary_json
from smarteval.reporting.markdown import write_summary_markdown


def rescore_bakeoff(
    config: BakeoffConfig,
    *,
    run_dir: str | Path,
    rubric_path: str | Path | None = None,
    persist: bool = True,
):
    run_path = Path(run_dir)
    records = list(load_run_records(run_path).values())
    if rubric_path is not None:
        for stage in config.pipeline:
            if stage.kind == "llm_rubric":
                setattr(stage, "rubric", str(Path(rubric_path).resolve()))

    rubric = _first_rubric(config)
    evaluator_fingerprint = compute_evaluator_fingerprint(config.evaluator, rubric)
    for record in records:
        contract, scores = execute_scoring_pipeline(
            _case_from_record(record),
            record.artifact,
            config.pipeline,
            evaluator=config.evaluator,
        )
        record.contract = contract
        record.scores = scores
        record.evaluator_fingerprint = evaluator_fingerprint
        if persist:
            _rewrite_record(run_path / "by_case", record)

    summary = summarize_runs(
        records,
        baseline=config.baseline,
        bakeoff_id=run_path.name.split("__", 1)[0],
        golden_hash=records[0].golden_hash if records else "",
        evaluator_fingerprint=evaluator_fingerprint if records else "",
        gates=config.gates,
    )
    if persist:
        write_summary_json(run_path / "summary.json", summary)
        if "markdown" in config.reporting.formats:
            write_summary_markdown(run_path / "summary.md", summary)
        if config.reporting.ci_summary:
            write_ci_json(run_path / "ci.json", summary, gates=config.gates)
    return summary


def _case_from_record(record):
    from smarteval.core.models import Case

    return Case(
        id=record.case_id,
        input=record.case_input,
        expected=record.case_expected,
        tags=record.tags,
        difficulty=record.difficulty,
        added_at=record.timestamp.date(),
    )


def _rewrite_record(by_case_dir: Path, record) -> None:
    filename = f"case-{record.case_id}__variant-{record.variant_id}__iter-{record.iteration}.jsonl"
    (by_case_dir / filename).write_text(record.model_dump_json(indent=2), encoding="utf-8")


def _first_rubric(config: BakeoffConfig):
    for stage in config.pipeline:
        rubric_value = getattr(stage, "rubric", None)
        if stage.kind == "llm_rubric" and rubric_value:
            return load_rubric(rubric_value)
    return None
