from __future__ import annotations

import json
from typing import Any

from smarteval.core.models import VariantProposal
from smarteval.core.openai_client import build_openai_client


def propose_variants(
    *,
    model: str,
    context: dict[str, Any],
    n: int = 3,
    api_key: str | None = None,
    base_url: str | None = None,
    client: Any | None = None,
) -> list[VariantProposal]:
    openai_client = client or build_openai_client(api_key=api_key, base_url=base_url)
    prompt = (
        "You are proposing new eval variants. Return valid JSON with a top-level key "
        "`proposals`, containing a list of objects with keys: parent_variant_id, rationale, diff, expected_slice.\n\n"
        f"Need up to {n} proposals.\n\n"
        f"Context:\n{json.dumps(context, indent=2, sort_keys=True)}"
    )
    response = openai_client.responses.create(
        model=model,
        input=prompt,
        text={"format": {"type": "json_object"}},
    )
    payload = json.loads(response.output_text)
    return [VariantProposal.model_validate(item) for item in payload.get("proposals", [])[:n]]
