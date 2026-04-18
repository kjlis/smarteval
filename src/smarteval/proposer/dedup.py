from __future__ import annotations

from smarteval.core.models import VariantProposal
from smarteval.core.similarity import similarity_from_diff


def filter_duplicate_proposals(
    proposals: list[VariantProposal],
    verdicts: list[dict],
    *,
    similarity_threshold: float = 0.92,
) -> list[VariantProposal]:
    rejected = [
        _candidate_from_verdict(item)
        for item in verdicts
        if item.get("status") in {"loss", "noisy"} or item.get("promotion_level") == "dead"
    ]
    accepted: list[VariantProposal] = []
    for proposal in proposals:
        proposal_fp = _fingerprint_from_proposal(proposal)
        if any(candidate["fingerprint"] == proposal_fp for candidate in rejected):
            continue
        if any(_is_semantic_match(proposal, candidate, similarity_threshold) for candidate in rejected):
            continue
        accepted.append(proposal)
    return accepted


def _fingerprint_from_proposal(proposal: VariantProposal) -> tuple[str, tuple[tuple[str, str], ...]]:
    normalized = tuple(sorted((str(key), repr(value)) for key, value in proposal.diff.items()))
    return proposal.parent_variant_id, normalized


def _fingerprint_from_verdict(verdict: dict) -> tuple[str, tuple[tuple[str, str], ...]]:
    diff = verdict.get("diff") or {}
    parent = verdict.get("parent_variant_id") or verdict.get("variant_id") or ""
    normalized = tuple(sorted((str(key), repr(value)) for key, value in diff.items()))
    return parent, normalized


def _candidate_from_verdict(verdict: dict) -> dict:
    return {
        "fingerprint": _fingerprint_from_verdict(verdict),
        "parent_variant_id": verdict.get("parent_variant_id") or verdict.get("variant_id") or "",
        "diff": verdict.get("diff") or {},
    }


def _is_semantic_match(
    proposal: VariantProposal,
    candidate: dict,
    similarity_threshold: float,
) -> bool:
    if proposal.parent_variant_id != candidate["parent_variant_id"]:
        return False
    return similarity_from_diff(proposal.diff, candidate["diff"]) >= similarity_threshold
