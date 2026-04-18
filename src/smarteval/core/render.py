from __future__ import annotations

import json
from typing import Any

from smarteval.core.models import Artifact, Case, ContractResult, Score


class SafeDict(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render_template(
    template: str,
    *,
    case: Case,
    artifact: Artifact | None = None,
    contract: ContractResult | None = None,
    prior_scores: list[Score] | None = None,
    extra_context: dict[str, Any] | None = None,
) -> str:
    values = SafeDict(
        case_id=case.id,
        input_json=json.dumps(case.input, indent=2, sort_keys=True),
        expected_json=json.dumps(case.expected, indent=2, sort_keys=True) if case.expected is not None else "null",
        tags=", ".join(case.tags),
        difficulty=case.difficulty or "",
        notes=case.notes or "",
        artifact_text=artifact.to_prompt_text() if artifact is not None else "",
        artifact_json=json.dumps(artifact.payload, indent=2, sort_keys=True) if artifact and artifact.kind == "json" else "",
        contract_json=contract.model_dump_json(indent=2) if contract is not None else "{}",
        prior_scores_json=json.dumps([score.model_dump() for score in prior_scores or []], indent=2, sort_keys=True),
    )
    if extra_context:
        values.update(extra_context)
    return template.format_map(values)
