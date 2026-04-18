from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from smarteval.core.paths import ledger_root
from smarteval.core.models import BakeoffConfig, LedgerVariantRecord, LedgerVerdictRecord, ProposalAttemptRecord, Variant, VariantProposal, Verdict
from smarteval.ledger.reader import read_jsonl
from smarteval.proposer.dedup import ProposalReview


def ensure_ledger_layout(project_root: str | Path) -> Path:
    ledger_dir = ledger_root(project_root)
    (ledger_dir / "notes").mkdir(parents=True, exist_ok=True)
    (ledger_dir / "proposals.jsonl").touch(exist_ok=True)
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
            rationale=variant.description,
            diff=variant.params,
        )
        lines.append(record.model_dump_json())
    if lines:
        with variants_path.open("a", encoding="utf-8") as handle:
            for line in lines:
                handle.write(line + "\n")


def append_verdict(project_root: str | Path, verdict: Verdict) -> None:
    ledger_dir = ensure_ledger_layout(project_root)
    variant_info = _variant_record_for_id(ledger_dir, _variant_id_from_run_id(verdict.run_id))
    record = LedgerVerdictRecord(
        variant_id=_variant_id_from_run_id(verdict.run_id),
        parent_variant_id=variant_info.get("parent_id"),
        run_id=verdict.run_id,
        status=verdict.status,
        promotion_level=verdict.promotion_level,
        rationale=verdict.rationale,
        diff=variant_info.get("diff") or {},
        killed_by=verdict.killed_by,
        follow_up_variant_id=verdict.follow_up_variant_id,
        author=verdict.author,
        timestamp=verdict.timestamp,
    )
    with (ledger_dir / "verdicts.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(record.model_dump_json() + "\n")


def append_materialized_proposals(
    project_root: str | Path,
    variants: list[Variant],
    proposals: list[VariantProposal],
    *,
    author: str = "proposer",
) -> None:
    ledger_dir = ensure_ledger_layout(project_root)
    variants_path = ledger_dir / "variants.jsonl"
    with variants_path.open("a", encoding="utf-8") as handle:
        for variant, proposal in zip(variants, proposals, strict=False):
            record = LedgerVariantRecord(
                id=variant.id,
                parent_id=variant.parent_id,
                author=author,
                hypothesis=proposal.expected_slice,
                rationale=proposal.rationale,
                diff=proposal.diff,
                created_at=datetime.now(timezone.utc),
            )
            handle.write(record.model_dump_json() + "\n")


def append_proposal_attempts(
    project_root: str | Path,
    reviews: list[ProposalReview],
    *,
    source_run_dir: str | None = None,
    materialized_variants: list[Variant] | None = None,
) -> None:
    ledger_dir = ensure_ledger_layout(project_root)
    proposals_path = ledger_dir / "proposals.jsonl"
    accepted_variants = iter(materialized_variants or [])
    created_at = datetime.now(timezone.utc)
    with proposals_path.open("a", encoding="utf-8") as handle:
        for index, review in enumerate(reviews, start=1):
            materialized_variant = next(accepted_variants, None) if review.status == "accepted" else None
            record = ProposalAttemptRecord(
                proposal_id=f"proposal-{created_at.strftime('%Y%m%d%H%M%S%f')}-{index}",
                source_run_dir=source_run_dir,
                parent_variant_id=review.proposal.parent_variant_id,
                materialized_variant_id=materialized_variant.id if materialized_variant is not None else None,
                status=review.status,
                rationale=review.proposal.rationale,
                expected_slice=review.proposal.expected_slice,
                diff=review.proposal.diff,
                duplicate_of_variant_id=review.duplicate_of_variant_id,
                similarity=review.similarity,
                created_at=created_at,
            )
            handle.write(record.model_dump_json() + "\n")


def _variant_id_from_run_id(run_id: str) -> str:
    parts = run_id.split("/")
    if len(parts) < 4:
        return run_id
    return parts[2]


def _variant_record_for_id(ledger_dir: Path, variant_id: str) -> dict:
    records = read_jsonl(ledger_dir / "variants.jsonl")
    for record in reversed(records):
        if record.get("id") == variant_id:
            return record
    return {}
