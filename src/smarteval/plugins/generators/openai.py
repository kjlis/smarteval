from __future__ import annotations

import json
from typing import Any

from smarteval.core.models import Artifact, Case
from smarteval.core.openai_client import build_openai_client
from smarteval.core.render import render_template
from smarteval.plugins.base import Generator


class OpenAIGenerator(Generator):
    name = "openai"

    def __init__(self, **settings: Any) -> None:
        super().__init__(**settings)
        self._client = settings.get("_client") or build_openai_client(
            api_key=settings.get("api_key"),
            base_url=settings.get("base_url"),
        )

    def generate(self, case: Case, params: dict[str, Any]) -> Artifact:
        prompt_template = _read_prompt_template(params)
        prompt = render_template(prompt_template, case=case)

        model = self.settings.get("model") or params.get("model")
        if model is None and self.name == "codex":
            model = "gpt-5.2-codex"
        if model is None:
            raise ValueError("openai generator requires a model")

        response_kwargs: dict[str, Any] = {
            "model": model,
            "input": prompt,
        }

        reasoning_effort = params.get("reasoning_effort", self.settings.get("reasoning_effort"))
        if reasoning_effort:
            response_kwargs["reasoning"] = {"effort": reasoning_effort}

        max_output_tokens = params.get("max_output_tokens", self.settings.get("max_output_tokens"))
        if max_output_tokens:
            response_kwargs["max_output_tokens"] = max_output_tokens

        temperature = params.get("temperature", self.settings.get("temperature"))
        if temperature is not None:
            response_kwargs["temperature"] = temperature

        top_p = params.get("top_p", self.settings.get("top_p"))
        if top_p is not None:
            response_kwargs["top_p"] = top_p

        response_format = params.get("response_format")
        if response_format == "json_object":
            response_kwargs["text"] = {"format": {"type": "json_object"}}

        response = self._client.responses.create(**response_kwargs)
        output_text = getattr(response, "output_text", "")
        usage = getattr(response, "usage", None)
        usage_payload = usage.model_dump() if hasattr(usage, "model_dump") else usage or {}

        artifact_kind = "text"
        payload: Any = output_text
        if response_format == "json_object":
            artifact_kind = "json"
            payload = json.loads(output_text)

        return Artifact(
            kind=artifact_kind,
            payload=payload,
            metadata={
                "model": response_kwargs["model"],
                "response_id": getattr(response, "id", None),
                "usage": usage_payload,
            },
        )


def _read_prompt_template(params: dict[str, Any]) -> str:
    prompt_text = params.get("prompt_text")
    if prompt_text is not None:
        return prompt_text

    prompt_path = params.get("prompt")
    if prompt_path is None:
        raise ValueError("openai generator requires either params['prompt'] or params['prompt_text']")

    with open(prompt_path, "r", encoding="utf-8") as handle:
        return handle.read()


class CodexGenerator(OpenAIGenerator):
    name = "codex"
