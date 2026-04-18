from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from smarteval.core.config import load_config
from smarteval.core.fingerprint import compute_evaluator_fingerprint
from smarteval.core.rescore import rescore_bakeoff
from smarteval.core.runner import read_summary


def rebaseline_evaluator(
    config_path: str | Path,
    *,
    run_dir: str | Path,
    from_model: str,
    to_model: str,
    approve: bool = False,
) -> dict:
    config = load_config(config_path)
    original_summary = read_summary(run_dir)
    original_fp = compute_evaluator_fingerprint(config.evaluator)

    new_config = deepcopy(config)
    new_config.evaluator.model = to_model
    rescored_summary = rescore_bakeoff(new_config, run_dir=run_dir, persist=False)
    new_fp = compute_evaluator_fingerprint(new_config.evaluator)

    original_variants = {item.variant_id: item for item in original_summary.variants}
    comparison = {}
    for variant in rescored_summary.variants:
        previous = original_variants.get(variant.variant_id)
        comparison[variant.variant_id] = {
            "mean_score_before": previous.mean_score if previous else None,
            "mean_score_after": variant.mean_score,
            "delta": (
                None
                if previous is None or previous.mean_score is None or variant.mean_score is None
                else variant.mean_score - previous.mean_score
            ),
        }

    payload = {
        "from_model": from_model,
        "to_model": to_model,
        "old_fingerprint": original_fp,
        "new_fingerprint": new_fp,
        "comparison": comparison,
        "approved": approve,
    }

    if approve:
        lock_path = (config.project_root or Path.cwd()) / ".smarteval" / "lock.json"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
