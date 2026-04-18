from __future__ import annotations

from smarteval.core.models import BakeoffConfig, BakeoffSummary, RunRecord
from smarteval.ledger.reader import read_ledger


def build_proposer_context(
    config: BakeoffConfig,
    summary: BakeoffSummary,
    run_records: list[RunRecord],
) -> dict:
    variants_by_id = {variant.id: variant for variant in config.variants}
    failures = [
        {
            "case_id": record.case_id,
            "variant_id": record.variant_id,
            "scores": [score.model_dump() for score in record.scores],
            "artifact": record.artifact.to_prompt_text(),
            "tags": record.tags,
            "error": record.error,
        }
        for record in run_records
        if record.status != "success" or any(not score.passed for score in record.scores)
    ][:10]
    ledger = read_ledger(config.project_root or ".")
    lowest_scoring_dimensions = _lowest_scoring_dimensions(run_records)
    current_best = max(
        summary.variants,
        key=lambda item: item.mean_score if item.mean_score is not None else -1.0,
    )
    current_best_variant = (
        variants_by_id[current_best.variant_id].model_dump()
        if current_best.variant_id in variants_by_id
        else {"id": current_best.variant_id}
    )
    return {
        "current_best_variant": current_best_variant,
        "failure_cases": failures,
        "lowest_scoring_dimensions": lowest_scoring_dimensions,
        "rejected_variants": _recent_rejections(ledger["verdicts"]),
        "constraints": {
            "primary_output": config.artifact_selection.primary_output,
            "baseline": config.baseline,
        },
    }


def _lowest_scoring_dimensions(run_records: list[RunRecord]) -> list[dict]:
    totals: dict[str, list[float]] = {}
    for record in run_records:
        for score in record.scores:
            if score.value is None:
                continue
            totals.setdefault(score.name, []).append(score.value)
    ranked = sorted(
        (
            {"id": name, "mean_score": sum(values) / len(values), "n": len(values)}
            for name, values in totals.items()
            if values
        ),
        key=lambda item: item["mean_score"],
    )
    return ranked[:5]


def _recent_rejections(verdicts: list[dict]) -> list[dict]:
    rejected = [
        item
        for item in verdicts
        if item.get("promotion_level") == "dead" or item.get("status") in {"loss", "noisy"}
    ]
    return rejected[-10:]
