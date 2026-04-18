from __future__ import annotations

from pathlib import Path

import yaml

from smarteval.core.models import BakeoffConfig


def load_config(path: str | Path) -> BakeoffConfig:
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    raw = _resolve_known_paths(raw, config_path.parent.resolve())
    raw["project_root"] = str(config_path.parent.resolve())
    raw["config_path"] = str(config_path.resolve())
    return BakeoffConfig.model_validate(raw)


def _resolve_known_paths(raw: dict, root: Path) -> dict:
    resolved = dict(raw)

    if "golden_set" in resolved:
        resolved["golden_set"] = str(_resolve_path_like(resolved["golden_set"], root))

    if "router" in resolved and resolved["router"] is not None:
        resolved["router"] = str(_resolve_path_like(resolved["router"], root))

    variants = []
    for variant in resolved.get("variants", []):
        item = dict(variant)
        params = dict(item.get("params", {}))
        for key in ("prompt", "pipeline_config"):
            if key in params and isinstance(params[key], str):
                params[key] = str(_resolve_path_like(params[key], root))
        item["params"] = params
        variants.append(item)
    if variants:
        resolved["variants"] = variants

    stages = []
    for stage in resolved.get("pipeline", []):
        item = dict(stage)
        for key in ("schema", "rubric"):
            if key in item:
                item[key] = str(_resolve_path_like(item[key], root))
        stages.append(item)
    if stages:
        resolved["pipeline"] = stages

    return resolved


def _resolve_path_like(value: str, root: Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (root / path).resolve()
