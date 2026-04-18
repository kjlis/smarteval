from __future__ import annotations

import hashlib

from smarteval.core.models import EvaluatorPolicy, Rubric


def compute_evaluator_fingerprint(
    policy: EvaluatorPolicy,
    rubric: Rubric | None = None,
    *,
    backend: str | None = None,
) -> str:
    rubric_hash = rubric.model_dump_json() if rubric is not None else ""
    payload = "|".join(
        [
            policy.model,
            str(policy.temperature),
            str(policy.top_p),
            str(policy.n_averaging),
            policy.reasoning_effort or "",
            policy.version_hint or "",
            backend or "",
            rubric_hash,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
