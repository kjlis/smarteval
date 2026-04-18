from __future__ import annotations

import json
from pathlib import Path

from smarteval.core.paths import ledger_root


def read_jsonl(path: str | Path) -> list[dict]:
    file_path = Path(path)
    if not file_path.exists():
        return []
    rows = []
    for line in file_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def read_ledger(project_root: str | Path) -> dict[str, list[dict]]:
    root = ledger_root(project_root)
    return {
        "variants": read_jsonl(root / "variants.jsonl"),
        "proposals": read_jsonl(root / "proposals.jsonl"),
        "verdicts": read_jsonl(root / "verdicts.jsonl"),
    }
