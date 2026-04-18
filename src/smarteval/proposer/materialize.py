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
            _deep_merge_mapping(variant.params, value)
            continue
        if key == "generator":
            if not isinstance(value, dict):
                raise ValueError("proposal diff key 'generator' must map to an object")
            for nested_key, nested_value in value.items():
                _set_object_path(variant.generator, nested_key.split("."), nested_value)
            continue
        if key.startswith("params."):
            _set_mapping_path(variant.params, key.removeprefix("params.").split("."), value)
            continue
        if key.startswith("generator."):
            _set_object_path(variant.generator, key.removeprefix("generator.").split("."), value)
            continue
        if key == "description":
            variant.description = str(value)
            continue
        raise ValueError(f"unsupported proposal diff key {key!r}")


def _deep_merge_mapping(target: dict, incoming: dict) -> None:
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge_mapping(target[key], value)
            continue
        target[key] = deepcopy(value)


def _set_mapping_path(target: dict, segments: list[str], value) -> None:
    if not segments:
        raise ValueError("mapping path must not be empty")
    if len(segments) == 1:
        if isinstance(value, dict) and isinstance(target.get(segments[0]), dict):
            _deep_merge_mapping(target[segments[0]], value)
            return
        target[segments[0]] = deepcopy(value)
        return
    head, *tail = segments
    current = target.get(head)
    if not isinstance(current, dict):
        current = {}
        target[head] = current
    _set_mapping_path(current, tail, value)


def _set_object_path(target, segments: list[str], value) -> None:
    if not segments:
        raise ValueError("object path must not be empty")
    if len(segments) == 1:
        current = getattr(target, segments[0], None)
        if isinstance(value, dict) and isinstance(current, dict):
            _deep_merge_mapping(current, value)
            return
        setattr(target, segments[0], deepcopy(value))
        return
    head, *tail = segments
    current = getattr(target, head, None)
    if current is None:
        current = {}
        setattr(target, head, current)
    if isinstance(current, dict):
        _set_mapping_path(current, tail, value)
        return
    _set_object_path(current, tail, value)
