from __future__ import annotations

from smarteval.core.models import VariantProposal


def filter_duplicate_proposals(
    proposals: list[VariantProposal],
    verdicts: list[dict],
) -> list[VariantProposal]:
    rejected = {
        _fingerprint_from_verdict(item)
        for item in verdicts
        if item.get("status") in {"loss", "noisy"} or item.get("promotion_level") == "dead"
    }
    return [proposal for proposal in proposals if _fingerprint_from_proposal(proposal) not in rejected]


def _fingerprint_from_proposal(proposal: VariantProposal) -> tuple[str, tuple[tuple[str, str], ...]]:
    normalized = tuple(sorted((str(key), repr(value)) for key, value in proposal.diff.items()))
    return proposal.parent_variant_id, normalized


def _fingerprint_from_verdict(verdict: dict) -> tuple[str, tuple[tuple[str, str], ...]]:
    diff = verdict.get("diff") or {}
    parent = verdict.get("parent_variant_id") or verdict.get("variant_id") or ""
    normalized = tuple(sorted((str(key), repr(value)) for key, value in diff.items()))
    return parent, normalized
