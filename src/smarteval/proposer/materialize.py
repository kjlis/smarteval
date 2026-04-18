from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from smarteval.core.models import Variant, VariantProposal


def materialize_proposals(
    variants: list[Variant],
    proposals: list[VariantProposal],
) -> list[Variant]:
    by_id = {variant.id: variant for variant in variants}
    created: list[Variant] = []
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    for index, proposal in enumerate(proposals, start=1):
        parent = by_id[proposal.parent_variant_id]
        variant = deepcopy(parent)
        variant.parent_id = parent.id
        variant.id = f"{parent.id}-proposal-{timestamp}-{index}"
        if not variant.description:
            variant.description = proposal.rationale
        apply_variant_diff(variant, proposal.diff)
        created.append(variant)
    return created


def apply_variant_diff(variant: Variant, diff: dict) -> None:
    for key, value in diff.items():
        if key == "params":
            if not isinstance(value, dict):
                raise ValueError("proposal diff key 'params' must map to an object")
            for nested_key, nested_value in value.items():
                variant.params[nested_key] = nested_value
            continue
        if key == "generator":
            if not isinstance(value, dict):
                raise ValueError("proposal diff key 'generator' must map to an object")
            for nested_key, nested_value in value.items():
                setattr(variant.generator, nested_key, nested_value)
            continue
        if key.startswith("params."):
            variant.params[key.removeprefix("params.")] = value
            continue
        if key.startswith("generator."):
            setattr(variant.generator, key.removeprefix("generator."), value)
            continue
        if key == "description":
            variant.description = str(value)
            continue
        raise ValueError(f"unsupported proposal diff key {key!r}")
