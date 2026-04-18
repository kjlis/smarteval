from __future__ import annotations

from pathlib import Path

import yaml

from smarteval.core.models import Rubric


def load_rubric(path: str | Path) -> Rubric:
    rubric_path = Path(path)
    with rubric_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    return Rubric.model_validate(raw)
