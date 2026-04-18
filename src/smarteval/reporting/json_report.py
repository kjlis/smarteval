from __future__ import annotations

import json
from pathlib import Path

from smarteval.core.models import BakeoffSummary, Gates


def write_summary_json(path: str | Path, summary: BakeoffSummary) -> None:
    Path(path).write_text(summary.model_dump_json(indent=2), encoding="utf-8")


def write_ci_json(path: str | Path, summary: BakeoffSummary, *, gates: Gates) -> None:
    regressions = list(summary.regressions)
    status = "pass"
    if any(item.run_count < gates.min_runs_per_variant for item in summary.variants):
        status = "provisional"
    if regressions and gates.slice_regression_action == "fail":
        status = "fail"
    payload = {
        "status": status,
        "reason": None if status == "pass" else "gates not fully satisfied",
        "regressions": regressions,
        "specialists": [item.model_dump() for item in summary.specialists],
        "schemaVersion": summary.schema_version,
    }
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
