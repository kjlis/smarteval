from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from smarteval.core.codex_client import build_codex_client
from smarteval.core.models import Artifact, Case, ContractResult, Rubric, Score
from smarteval.core.openai_client import build_openai_client
from smarteval.core.rate_limit import get_bucket
from smarteval.core.render import render_template
from smarteval.core.rubric import load_rubric
from smarteval.plugins.base import Scorer


class LLMRubricScorer(Scorer):
    kind = "llm_rubric"

    def __init__(self, **settings: Any) -> None:
        super().__init__(**settings)
        self._backend = settings.get("backend", "codex_local")
        self._client = settings.get("_client")
        self._rubric = _coerce_rubric(settings["rubric"])

    def score(
        self,
        case: Case,
        artifact: Artifact,
        contract: ContractResult,
        prior_scores: list[Score],
    ) -> Score:
        prompt = render_template(
            self._prompt_template(),
            case=case,
            artifact=artifact,
            contract=contract,
            prior_scores=prior_scores,
            extra_context={"rubric_json": self._rubric_json()},
        )

        payload, usage_payload = self._grade_prompt(prompt)
        value = _normalize_rubric_score(payload, self._rubric)
        passed = value >= (self._rubric.pass_threshold / self._rubric.scale)
        return Score(
            name=self.kind,
            value=value,
            passed=passed,
            raw={"rubric": payload, "usage": usage_payload},
        )

    def _grade_prompt(self, prompt: str) -> tuple[dict[str, Any], dict[str, Any]]:
        if self._backend == "codex_local":
            return self._grade_with_codex_local(prompt)
        return self._grade_with_openai(prompt)

    def _grade_with_openai(self, prompt: str) -> tuple[dict[str, Any], dict[str, Any]]:
        client = self._client or build_openai_client(
            api_key=self.settings.get("api_key"),
            base_url=self.settings.get("base_url"),
        )
        response_kwargs: dict[str, Any] = {
            "model": self.settings["model"],
            "input": prompt,
            "text": {"format": {"type": "json_object"}},
        }
        reasoning_effort = self.settings.get("reasoning_effort")
        if reasoning_effort:
            response_kwargs["reasoning"] = {"effort": reasoning_effort}

        rpm = self.settings.get("rpm")
        if isinstance(rpm, int) and rpm > 0:
            get_bucket(f"evaluator:{response_kwargs['model']}", rpm).acquire()

        response = client.responses.create(**response_kwargs)
        payload = json.loads(response.output_text)
        usage = getattr(response, "usage", None)
        usage_payload = usage.model_dump() if hasattr(usage, "model_dump") else usage or {}
        return payload, usage_payload

    def _grade_with_codex_local(self, prompt: str) -> tuple[dict[str, Any], dict[str, Any]]:
        client = self._client or build_codex_client(codex_bin=self.settings.get("codex_bin"))
        with client as codex:
            thread = codex.thread_start(model=self.settings["model"])
            result = thread.run(prompt)
        payload = json.loads(result.final_response)
        usage = getattr(result, "usage", None)
        usage_payload = usage.model_dump() if hasattr(usage, "model_dump") else usage or {}
        return payload, usage_payload

    def _prompt_template(self) -> str:
        return (
            "You are grading an evaluation artifact.\n"
            "Return valid JSON with keys: dimensions, overall_justification.\n"
            "Each dimensions entry must contain: id, score, justification, failure_mode.\n\n"
            "Rubric:\n"
            "{rubric_json}\n\n"
            "Case:\n{input_json}\n\n"
            "Expected:\n{expected_json}\n\n"
            "Artifact:\n{artifact_text}\n\n"
            "Contract:\n{contract_json}\n\n"
            "Prior scores:\n{prior_scores_json}\n"
        )

    def _rubric_json(self) -> str:
        dimensions = []
        for dimension in self._rubric.dimensions:
            dimensions.append(
                {
                    "id": dimension.id,
                    "weight": dimension.weight,
                    "prompt": dimension.prompt,
                    "failure_mode_enum": dimension.failure_mode_enum,
                }
            )
        return json.dumps(dimensions, indent=2)


def _coerce_rubric(value: Rubric | str | Path) -> Rubric:
    if isinstance(value, Rubric):
        return value
    return load_rubric(value)


def _normalize_rubric_score(payload: dict[str, Any], rubric: Rubric) -> float:
    dimensions_by_id = {dimension.id: dimension for dimension in rubric.dimensions}
    total = 0.0
    for item in payload.get("dimensions", []):
        dimension = dimensions_by_id.get(item["id"])
        if dimension is None:
            continue
        total += (float(item["score"]) / rubric.scale) * dimension.weight
    return total
