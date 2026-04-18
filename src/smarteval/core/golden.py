from __future__ import annotations

import hashlib
import json
from pathlib import Path

from smarteval.core.models import Case


def load_golden_set(path: str | Path) -> tuple[list[Case], str]:
    golden_path = Path(path)
    lines = [line for line in golden_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    cases = [Case.model_validate(json.loads(line)) for line in lines]
    golden_hash = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()[:12]
    return cases, golden_hash
