from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from smarteval.core.models import BakeoffConfig, LedgerVariantRecord, LedgerVerdictRecord, Verdict


def ensure_ledger_layout(project_root: str | Path) -> Path:
    root = Path(project_root)
    ledger_dir = root / "ledger"
    (ledger_dir / "notes").mkdir(parents=True, exist_ok=True)
    (ledger_dir / "variants.jsonl").touch(exist_ok=True)
    (ledger_dir / "verdicts.jsonl").touch(exist_ok=True)
    return ledger_dir


def append_variant_records(config: BakeoffConfig) -> None:
    ledger_dir = ensure_ledger_layout(config.project_root or Path.cwd())
    variants_path = ledger_dir / "variants.jsonl"
    existing = {line.split('"id":"', 1)[1].split('"', 1)[0] for line in variants_path.read_text(encoding="utf-8").splitlines() if '"id":"' in line}
    lines = []
    for variant in config.variants:
        if variant.id in existing:
            continue
        record = LedgerVariantRecord(
            id=variant.id,
            parent_id=variant.parent_id,
            created_at=datetime.now(timezone.utc),
            diff=variant.params,
        )
        lines.append(record.model_dump_json())
    if lines:
        with variants_path.open("a", encoding="utf-8") as handle:
            for line in lines:
                handle.write(line + "\n")


def append_verdict(project_root: str | Path, verdict: Verdict) -> None:
    ledger_dir = ensure_ledger_layout(project_root)
    record = LedgerVerdictRecord(
        variant_id=_variant_id_from_run_id(verdict.run_id),
        run_id=verdict.run_id,
        status=verdict.status,
        promotion_level=verdict.promotion_level,
        rationale=verdict.rationale,
        killed_by=verdict.killed_by,
        follow_up_variant_id=verdict.follow_up_variant_id,
        author=verdict.author,
        timestamp=verdict.timestamp,
    )
    with (ledger_dir / "verdicts.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(record.model_dump_json() + "\n")


def _variant_id_from_run_id(run_id: str) -> str:
    parts = run_id.split("/")
    if len(parts) < 4:
        return run_id
    return parts[2]
