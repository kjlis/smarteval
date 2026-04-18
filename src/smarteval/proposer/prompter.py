from __future__ import annotations

import json
from typing import Any

from smarteval.core.codex_client import build_codex_client
from smarteval.core.models import VariantProposal
from smarteval.core.openai_client import build_openai_client
from smarteval.proposer.dedup import ProposalReview, review_proposals


def propose_variants(
    *,
    model: str,
    context: dict[str, Any],
    n: int = 3,
    api_key: str | None = None,
    base_url: str | None = None,
    backend: str = "codex_local",
    codex_bin: str | None = None,
    client: Any | None = None,
    verdicts: list[dict] | None = None,
) -> list[VariantProposal]:
    proposals, _ = propose_variants_with_reviews(
        model=model,
        context=context,
        n=n,
        api_key=api_key,
        base_url=base_url,
        backend=backend,
        codex_bin=codex_bin,
        client=client,
        verdicts=verdicts,
    )
    return proposals


def propose_variants_with_reviews(
    *,
    model: str,
    context: dict[str, Any],
    n: int = 3,
    api_key: str | None = None,
    base_url: str | None = None,
    backend: str = "codex_local",
    codex_bin: str | None = None,
    client: Any | None = None,
    verdicts: list[dict] | None = None,
) -> tuple[list[VariantProposal], list[ProposalReview]]:
    prompt = _proposal_prompt(context=context, n=n)
    payload = _request_payload(
        model=model,
        prompt=prompt,
        backend=backend,
        api_key=api_key,
        base_url=base_url,
        codex_bin=codex_bin,
        client=client,
    )
    proposals = [VariantProposal.model_validate(_normalize_proposal_item(item)) for item in payload.get("proposals", [])[:n]]
    reviews = review_proposals(proposals, verdicts or [])
    accepted = [item.proposal for item in reviews if item.status == "accepted"]
    return accepted, reviews


def _proposal_prompt(*, context: dict[str, Any], n: int) -> str:
    return (
        "You are proposing new eval variants. Return valid JSON with a top-level key "
        "`proposals`, containing a list of objects with keys: parent_variant_id, rationale, diff, expected_slice.\n"
        "Use a short string or null for expected_slice.\n"
        "Each diff must be either a flat object using keys like params.prompt_text, "
        "params.pipeline_config, generator.model, description, or a nested object under params/generator.\n\n"
        f"Need up to {n} proposals.\n\n"
        f"Context:\n{json.dumps(context, indent=2, sort_keys=True)}"
    )


def _normalize_proposal_item(item: Any) -> Any:
    if not isinstance(item, dict):
        return item
    normalized = dict(item)
    expected_slice = normalized.get("expected_slice")
    if expected_slice is not None and not isinstance(expected_slice, str):
        normalized["expected_slice"] = json.dumps(expected_slice, sort_keys=True)
    return normalized


def _request_payload(
    *,
    model: str,
    prompt: str,
    backend: str,
    api_key: str | None,
    base_url: str | None,
    codex_bin: str | None,
    client: Any | None,
) -> dict[str, Any]:
    if backend == "openai":
        return _request_with_openai(model=model, prompt=prompt, api_key=api_key, base_url=base_url, client=client)
    return _request_with_codex(model=model, prompt=prompt, codex_bin=codex_bin, client=client)


def _request_with_openai(
    *,
    model: str,
    prompt: str,
    api_key: str | None,
    base_url: str | None,
    client: Any | None,
) -> dict[str, Any]:
    openai_client = client or build_openai_client(api_key=api_key, base_url=base_url)
    response = openai_client.responses.create(
        model=model,
        input=prompt,
        text={"format": {"type": "json_object"}},
    )
    return json.loads(response.output_text)


def _request_with_codex(
    *,
    model: str,
    prompt: str,
    codex_bin: str | None,
    client: Any | None,
) -> dict[str, Any]:
    codex_client = client or build_codex_client(codex_bin=codex_bin)
    with codex_client as codex:
        thread = codex.thread_start(model=model)
        result = thread.run(prompt)
    return json.loads(result.final_response)
