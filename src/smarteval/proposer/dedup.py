from __future__ import annotations

from dataclasses import dataclass

from smarteval.core.models import VariantProposal
from smarteval.core.similarity import similarity_from_diff


@dataclass(frozen=True)
class ProposalReview:
    proposal: VariantProposal
    status: str
    duplicate_of_variant_id: str | None = None
    similarity: float | None = None


def filter_duplicate_proposals(
    proposals: list[VariantProposal],
    verdicts: list[dict],
    *,
    similarity_threshold: float = 0.92,
) -> list[VariantProposal]:
    return [item.proposal for item in review_proposals(proposals, verdicts, similarity_threshold=similarity_threshold) if item.status == "accepted"]


def review_proposals(
    proposals: list[VariantProposal],
    verdicts: list[dict],
    *,
    similarity_threshold: float = 0.92,
) -> list[ProposalReview]:
    rejected = [
        _candidate_from_verdict(item)
        for item in verdicts
        if item.get("status") in {"loss", "noisy"} or item.get("promotion_level") == "dead"
    ]
    decisions: list[ProposalReview] = []
    for proposal in proposals:
        proposal_fp = _fingerprint_from_proposal(proposal)
        exact_match = next((candidate for candidate in rejected if candidate["fingerprint"] == proposal_fp), None)
        if exact_match is not None:
            decisions.append(
                ProposalReview(
                    proposal=proposal,
                    status="rejected_exact_duplicate",
                    duplicate_of_variant_id=exact_match["variant_id"],
                )
            )
            continue

        semantic_match = _best_semantic_match(proposal, rejected, similarity_threshold)
        if semantic_match is not None:
            decisions.append(
                ProposalReview(
                    proposal=proposal,
                    status="rejected_semantic_duplicate",
                    duplicate_of_variant_id=semantic_match["variant_id"],
                    similarity=semantic_match["similarity"],
                )
            )
            continue
        decisions.append(ProposalReview(proposal=proposal, status="accepted"))
    return decisions


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
        "variant_id": verdict.get("variant_id"),
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


def _best_semantic_match(
    proposal: VariantProposal,
    candidates: list[dict],
    similarity_threshold: float,
) -> dict | None:
    best: dict | None = None
    for candidate in candidates:
        similarity = _semantic_similarity(proposal, candidate)
        if similarity < similarity_threshold:
            continue
        if best is None or similarity > best["similarity"]:
            best = {**candidate, "similarity": similarity}
    return best


def _semantic_similarity(
    proposal: VariantProposal,
    candidate: dict,
) -> float:
    if proposal.parent_variant_id != candidate["parent_variant_id"]:
        return 0.0
    return similarity_from_diff(proposal.diff, candidate["diff"])
