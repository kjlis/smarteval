from __future__ import annotations

from copy import deepcopy
from typing import Any

from smarteval.core.models import BakeoffConfig, ImprovementStep, ImprovementTrace, RunRecord, Variant, VariantChange, VariantSummary
from smarteval.ledger.reader import read_ledger
from smarteval.proposer.materialize import apply_variant_diff


def build_improvement_traces(
    config: BakeoffConfig,
    variants: list[VariantSummary],
    run_records: list[RunRecord],
) -> list[ImprovementTrace]:
    baseline_id = config.baseline
    summary_by_id = {item.variant_id: item for item in variants}
    if baseline_id not in summary_by_id:
        return []

    ledger_variants = {
        record["id"]: record
        for record in read_ledger(config.project_root or ".").get("variants", [])
        if record.get("id")
    }
    state_cache = {variant.id: deepcopy(variant) for variant in config.variants}
    justifications = _collect_judge_justifications(run_records)
    traces: list[ImprovementTrace] = []

    ranked = sorted(
        (item for item in variants if item.variant_id != baseline_id),
        key=lambda item: (item.delta_vs_baseline is not None, item.delta_vs_baseline or float("-inf"), item.variant_id),
        reverse=True,
    )
    for summary in ranked:
        trace = _build_trace(
            config=config,
            target_variant_id=summary.variant_id,
            summary_by_id=summary_by_id,
            ledger_variants=ledger_variants,
            state_cache=state_cache,
            justifications=justifications,
        )
        if trace is not None and trace.steps:
            traces.append(trace)
    return traces


def _build_trace(
    *,
    config: BakeoffConfig,
    target_variant_id: str,
    summary_by_id: dict[str, VariantSummary],
    ledger_variants: dict[str, dict[str, Any]],
    state_cache: dict[str, Variant],
    justifications: dict[str, str],
) -> ImprovementTrace | None:
    baseline_id = config.baseline
    lineage_ids = _lineage_from_baseline(target_variant_id, baseline_id, ledger_variants)
    if lineage_ids:
        steps = [
            _step_from_record(
                config=config,
                variant_id=variant_id,
                summary_by_id=summary_by_id,
                ledger_variants=ledger_variants,
                state_cache=state_cache,
                justifications=justifications,
            )
            for variant_id in lineage_ids
        ]
        final_summary = summary_by_id.get(target_variant_id)
        return ImprovementTrace(
            variant_id=target_variant_id,
            baseline_variant_id=baseline_id,
            total_delta_vs_baseline=final_summary.delta_vs_baseline if final_summary else None,
            steps=[step for step in steps if step is not None],
        )

    baseline = _resolve_variant(baseline_id, config=config, ledger_variants=ledger_variants, state_cache=state_cache)
    candidate = _resolve_variant(target_variant_id, config=config, ledger_variants=ledger_variants, state_cache=state_cache)
    if baseline is None or candidate is None:
        return None
    changes = _state_changes(baseline, candidate)
    summary = summary_by_id.get(target_variant_id)
    return ImprovementTrace(
        variant_id=target_variant_id,
        baseline_variant_id=baseline_id,
        total_delta_vs_baseline=summary.delta_vs_baseline if summary else None,
        steps=[
            ImprovementStep(
                variant_id=target_variant_id,
                parent_variant_id=baseline_id,
                rationale=candidate.description,
                judge_justification=justifications.get(target_variant_id),
                delta_vs_parent=summary.delta_vs_baseline if summary else None,
                delta_vs_baseline=summary.delta_vs_baseline if summary else None,
                changes=changes,
            )
        ],
    )


def _lineage_from_baseline(
    target_variant_id: str,
    baseline_id: str,
    ledger_variants: dict[str, dict[str, Any]],
) -> list[str]:
    lineage: list[str] = []
    seen: set[str] = set()
    current_id = target_variant_id
    while current_id != baseline_id:
        record = ledger_variants.get(current_id)
        if record is None:
            return []
        parent_id = record.get("parent_id")
        if not parent_id or current_id in seen:
            return []
        seen.add(current_id)
        lineage.append(current_id)
        current_id = parent_id
    lineage.reverse()
    return lineage


def _step_from_record(
    *,
    config: BakeoffConfig,
    variant_id: str,
    summary_by_id: dict[str, VariantSummary],
    ledger_variants: dict[str, dict[str, Any]],
    state_cache: dict[str, Variant],
    justifications: dict[str, str],
) -> ImprovementStep | None:
    record = ledger_variants.get(variant_id)
    if record is None:
        return None
    parent_id = record.get("parent_id")
    if not parent_id:
        return None
    parent = _resolve_variant(parent_id, config=config, ledger_variants=ledger_variants, state_cache=state_cache)
    child = _resolve_variant(variant_id, config=config, ledger_variants=ledger_variants, state_cache=state_cache)
    if parent is None or child is None:
        return None
    summary = summary_by_id.get(variant_id)
    parent_summary = summary_by_id.get(parent_id)
    delta_vs_parent = None
    if summary and parent_summary and summary.mean_score is not None and parent_summary.mean_score is not None:
        delta_vs_parent = summary.mean_score - parent_summary.mean_score
    return ImprovementStep(
        variant_id=variant_id,
        parent_variant_id=parent_id,
        rationale=record.get("rationale"),
        hypothesis=record.get("hypothesis"),
        judge_justification=justifications.get(variant_id),
        delta_vs_parent=delta_vs_parent,
        delta_vs_baseline=summary.delta_vs_baseline if summary else None,
        changes=_changes_from_record(record.get("diff") or {}, parent, child),
    )


def _resolve_variant(
    variant_id: str,
    *,
    config: BakeoffConfig,
    ledger_variants: dict[str, dict[str, Any]],
    state_cache: dict[str, Variant],
) -> Variant | None:
    cached = state_cache.get(variant_id)
    if cached is not None:
        return cached

    record = ledger_variants.get(variant_id)
    if record is None:
        return None
    parent_id = record.get("parent_id")
    if not parent_id:
        return None
    parent = _resolve_variant(parent_id, config=config, ledger_variants=ledger_variants, state_cache=state_cache)
    if parent is None:
        return None

    child = deepcopy(parent)
    child.id = variant_id
    child.parent_id = parent_id
    apply_variant_diff(child, record.get("diff") or {})
    state_cache[variant_id] = child
    return child


def _changes_from_record(diff: dict[str, Any], parent: Variant, child: Variant) -> list[VariantChange]:
    if not diff:
        return _state_changes(parent, child)

    parent_state = _flatten_variant(parent)
    child_state = _flatten_variant(child)
    changes: list[VariantChange] = []
    for field_path in _diff_field_paths(diff):
        changes.append(
            VariantChange(
                field_path=field_path,
                before=parent_state.get(field_path),
                after=child_state.get(field_path),
                summary=_describe_change(field_path, parent_state.get(field_path), child_state.get(field_path)),
            )
        )
    return changes


def _state_changes(parent: Variant, child: Variant) -> list[VariantChange]:
    parent_state = _flatten_variant(parent)
    child_state = _flatten_variant(child)
    field_paths = sorted(path for path in set(parent_state) | set(child_state) if parent_state.get(path) != child_state.get(path))
    return [
        VariantChange(
            field_path=field_path,
            before=parent_state.get(field_path),
            after=child_state.get(field_path),
            summary=_describe_change(field_path, parent_state.get(field_path), child_state.get(field_path)),
        )
        for field_path in field_paths
    ]


def _flatten_variant(variant: Variant) -> dict[str, Any]:
    flat: dict[str, Any] = {}
    payload = variant.model_dump(mode="python", exclude={"id", "parent_id"})
    _flatten_mapping(payload, flat)
    return flat


def _flatten_mapping(payload: dict[str, Any], flat: dict[str, Any], *, prefix: str = "") -> None:
    for key, value in payload.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            _flatten_mapping(value, flat, prefix=path)
            continue
        flat[path] = value


def _diff_field_paths(diff: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key, value in diff.items():
        if key in {"params", "generator"} and isinstance(value, dict):
            paths.extend(_prefixed_nested_paths(key, value))
            continue
        paths.append(key)
    return sorted(dict.fromkeys(paths))


def _prefixed_nested_paths(prefix: str, payload: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key, value in payload.items():
        path = f"{prefix}.{key}"
        if isinstance(value, dict):
            paths.extend(_prefixed_nested_paths(path, value))
            continue
        paths.append(path)
    return paths


def _describe_change(field_path: str, before: Any, after: Any) -> str:
    label = field_path.replace("_", " ")
    label = label.replace(".", " -> ")
    if before is None:
        return f"{label} set to `{_format_value(after)}`"
    if after is None:
        return f"{label} cleared"
    return f"{label} changed from `{_format_value(before)}` to `{_format_value(after)}`"


def _format_value(value: Any) -> str:
    if isinstance(value, bool):
        return "on" if value else "off"
    return str(value)


def _collect_judge_justifications(run_records: list[RunRecord]) -> dict[str, str]:
    by_variant: dict[str, list[str]] = {}
    for record in run_records:
        for score in record.scores:
            raw = score.raw or {}
            rubric = raw.get("rubric") if isinstance(raw, dict) else None
            justification = rubric.get("overall_justification") if isinstance(rubric, dict) else None
            if not justification:
                continue
            existing = by_variant.setdefault(record.variant_id, [])
            if justification not in existing:
                existing.append(justification)
    return {variant_id: items[0] for variant_id, items in by_variant.items() if items}
