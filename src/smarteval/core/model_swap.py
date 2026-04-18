from __future__ import annotations

from smarteval.core.models import BakeoffConfig


def select_variants_for_model_try(config: BakeoffConfig, ledger: dict[str, list[dict]], selector: str) -> set[str]:
    if selector == "all":
        return {variant.id for variant in config.variants}
    if selector == "broad":
        dead = {item.get("variant_id") for item in ledger.get("verdicts", []) if item.get("promotion_level") == "dead"}
        return {variant.id for variant in config.variants if variant.id not in dead}
    if selector == "specialists":
        return {
            item.get("variant_id")
            for item in ledger.get("verdicts", [])
            if item.get("promotion_level") == "specialist" and item.get("variant_id")
        }
    return {item.strip() for item in selector.split(",") if item.strip()}
