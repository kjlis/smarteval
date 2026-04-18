from __future__ import annotations

from pathlib import Path

import yaml

from smarteval.core.models import Case, RouterSpec


def load_router_spec(path: str | Path) -> RouterSpec:
    router_path = Path(path)
    with router_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    return RouterSpec.model_validate(raw)


def route_case(case: Case, spec: RouterSpec) -> str:
    for rule in spec.rules:
        if _matches(case, rule.when):
            return rule.variant_id
    return spec.default_variant_id


def _matches(case: Case, predicate: dict) -> bool:
    for key, value in predicate.items():
        if key == "tag":
            if value not in case.tags:
                return False
        elif key == "difficulty":
            if case.difficulty != value:
                return False
        else:
            if case.input.get(key) != value:
                return False
    return True
