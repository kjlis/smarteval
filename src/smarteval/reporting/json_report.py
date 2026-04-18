from __future__ import annotations

import json
from pathlib import Path

from smarteval.core.models import BakeoffSummary


def write_summary_json(path: str | Path, summary: BakeoffSummary) -> None:
    Path(path).write_text(summary.model_dump_json(indent=2), encoding="utf-8")


def write_ci_json(path: str | Path, summary: BakeoffSummary) -> None:
    status = "pass" if not summary.regressions else "fail"
    payload = {
        "status": status,
        "reason": None if status == "pass" else "regressions detected",
        "regressions": summary.regressions,
        "schemaVersion": 1,
    }
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
