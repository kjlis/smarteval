from __future__ import annotations

from smarteval.core.models import BakeoffConfig, BakeoffSummary, RunRecord
from smarteval.ledger.reader import read_ledger


def build_proposer_context(
    config: BakeoffConfig,
    summary: BakeoffSummary,
    run_records: list[RunRecord],
) -> dict:
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
    return {
        "current_best_variant": max(
            summary.variants,
            key=lambda item: item.mean_score if item.mean_score is not None else -1.0,
        ).variant_id,
        "failure_cases": failures,
        "rejected_variants": ledger["verdicts"][-10:],
        "constraints": {
            "primary_output": config.artifact_selection.primary_output,
            "baseline": config.baseline,
        },
    }
