from __future__ import annotations

from dataclasses import replace
from typing import Any

from smarteval.core.models import VariantProposal
from smarteval.proposer.dedup import ProposalReview


def apply_proposal_policy(
    proposals: list[VariantProposal],
    reviews: list[ProposalReview],
    *,
    context: dict[str, Any],
    n: int,
) -> tuple[list[VariantProposal], list[ProposalReview]]:
    policy = context.get("optimization") or {}
    allowed_values = ((policy.get("search_space") or {}).get("allowed_values") or {})
    required_paths = ((policy.get("diversity") or {}).get("require_one_of") or [])

    updated_reviews = _filter_invalid_value_proposals(reviews, allowed_values)
    accepted_reviews = [item for item in updated_reviews if item.status == "accepted"]

    if required_paths:
        synthetic_review = _build_diversity_review(
            accepted_reviews,
            context=context,
            required_paths=list(required_paths),
            allowed_values=allowed_values,
        )
        if synthetic_review is not None:
            if len(accepted_reviews) < n:
                accepted_reviews.append(synthetic_review)
            elif accepted_reviews:
                accepted_reviews[-1] = synthetic_review
            else:
                accepted_reviews = [synthetic_review]

    rejected_reviews = [item for item in updated_reviews if item.status != "accepted"]
    final_reviews = [*rejected_reviews, *accepted_reviews]
    accepted = [item.proposal for item in accepted_reviews[:n]]
    return accepted, final_reviews


def _filter_invalid_value_proposals(
    reviews: list[ProposalReview],
    allowed_values: dict[str, list[Any]],
) -> list[ProposalReview]:
    if not allowed_values:
        return reviews

    filtered: list[ProposalReview] = []
    for review in reviews:
        if review.status != "accepted":
            filtered.append(review)
            continue
        if _has_invalid_value(review.proposal, allowed_values):
            filtered.append(replace(review, status="rejected_invalid_value"))
            continue
        filtered.append(review)
    return filtered


def _has_invalid_value(proposal: VariantProposal, allowed_values: dict[str, list[Any]]) -> bool:
    assignments = flatten_diff_assignments(proposal.diff)
    for field_path, value in assignments.items():
        allowed = allowed_values.get(field_path)
        if allowed is None:
            continue
        if value not in allowed:
            return True
    return False


def _build_diversity_review(
    accepted_reviews: list[ProposalReview],
    *,
    context: dict[str, Any],
    required_paths: list[str],
    allowed_values: dict[str, list[Any]],
) -> ProposalReview | None:
    if any(_proposal_touches_any_path(item.proposal, required_paths) for item in accepted_reviews):
        return None

    current_best = context.get("current_best_variant") or {}
    parent_variant_id = current_best.get("id")
    if not parent_variant_id:
        return None

    for field_path in required_paths:
        candidate = _synthesize_exploration_proposal(
            parent_variant_id=parent_variant_id,
            current_best=current_best,
            field_path=field_path,
            allowed_values=allowed_values,
        )
        if candidate is None:
            continue
        if any(item.proposal.diff == candidate.diff for item in accepted_reviews):
            continue
        return ProposalReview(proposal=candidate, status="accepted")
    return None


def _synthesize_exploration_proposal(
    *,
    parent_variant_id: str,
    current_best: dict[str, Any],
    field_path: str,
    allowed_values: dict[str, list[Any]],
) -> VariantProposal | None:
    options = list(allowed_values.get(field_path) or [])
    if not options:
        return None
    current_value = _get_nested_value(current_best, field_path)
    next_value = next((item for item in options if item != current_value), None)
    if next_value is None:
        return None
    return VariantProposal(
        parent_variant_id=parent_variant_id,
        rationale=f"Forced diversity probe: explore `{field_path}` with another allowed value.",
        diff={field_path: next_value},
        expected_slice="exploration",
    )


def _proposal_touches_any_path(proposal: VariantProposal, field_paths: list[str]) -> bool:
    assignments = flatten_diff_assignments(proposal.diff)
    for path in field_paths:
        if path in assignments:
            return True
    return False


def flatten_diff_assignments(diff: dict[str, Any]) -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in diff.items():
        _flatten_value(flattened, key, value)
    return flattened


def _flatten_value(flattened: dict[str, Any], prefix: str, value: Any) -> None:
    if isinstance(value, dict):
        for nested_key, nested_value in value.items():
            _flatten_value(flattened, f"{prefix}.{nested_key}", nested_value)
        return
    flattened[prefix] = value


def _get_nested_value(payload: dict[str, Any], field_path: str) -> Any:
    current: Any = payload
    for segment in field_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current
