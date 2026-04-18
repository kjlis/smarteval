from __future__ import annotations

from collections.abc import Callable
from importlib import import_module
from typing import Any

from smarteval.core.models import BakeoffConfig, PipelineStage, Variant
from smarteval.plugins.base import ContractValidator, Generator, Scorer


class UnsupportedGenerator(Generator):
    name = "unsupported"

    def generate(self, case, params):  # type: ignore[override]
        kind = self.settings.get("kind", self.name)
        raise NotImplementedError(f"generator kind {kind!r} is not implemented yet")


def load_callable(target: str | Callable[..., Any]) -> Callable[..., Any]:
    if callable(target):
        return target
    if ":" not in target:
        raise ValueError(
            f"callable reference {target!r} must use the format 'module.submodule:function'"
        )
    module_name, attr_name = target.split(":", 1)
    module = import_module(module_name)
    value = getattr(module, attr_name)
    if not callable(value):
        raise TypeError(f"resolved target {target!r} is not callable")
    return value


def _generator_map() -> dict[str, type[Generator]]:
    from smarteval.plugins.generators.openai import CodexGenerator, OpenAIGenerator
    from smarteval.plugins.generators.pipeline import PipelineGenerator
    from smarteval.plugins.generators.script import ScriptGenerator

    return {
        "script": ScriptGenerator,
        "pipeline": PipelineGenerator,
        "openai": OpenAIGenerator,
        "codex": CodexGenerator,
        "anthropic": UnsupportedGenerator,
        "gemini": UnsupportedGenerator,
    }


def _contract_map() -> dict[str, type[ContractValidator]]:
    from smarteval.plugins.contracts.custom_predicate import CustomPredicateValidator
    from smarteval.plugins.contracts.json_schema import JSONSchemaValidator
    from smarteval.plugins.contracts.length_bounds import LengthBoundsValidator
    from smarteval.plugins.contracts.pydantic_model import PydanticModelValidator
    from smarteval.plugins.contracts.regex import RegexValidator

    return {
        "json_schema": JSONSchemaValidator,
        "pydantic_model": PydanticModelValidator,
        "regex": RegexValidator,
        "regex_match": RegexValidator,
        "length_bounds": LengthBoundsValidator,
        "custom_predicate": CustomPredicateValidator,
    }


def _scorer_map() -> dict[str, type[Scorer]]:
    from smarteval.plugins.scorers.exact_match import ExactMatchScorer
    from smarteval.plugins.scorers.llm_rubric import LLMRubricScorer
    from smarteval.plugins.scorers.regex_match import RegexMatchScorer

    return {
        "exact_match": ExactMatchScorer,
        "regex_match": RegexMatchScorer,
        "llm_rubric": LLMRubricScorer,
    }


def create_generator(
    variant: Variant,
    *,
    config: BakeoffConfig | None = None,
) -> tuple[Generator, dict[str, Any]]:
    settings = variant.generator.model_dump()
    kind = settings.pop("kind")
    generator_cls = _generator_map().get(kind)
    if generator_cls is None:
        raise KeyError(f"unknown generator kind {kind!r}")

    if generator_cls is UnsupportedGenerator:
        settings["kind"] = kind

    params = dict(variant.params)
    if config is not None:
        params.setdefault("primary_output", config.artifact_selection.primary_output)
        params.setdefault("copy_attachments", config.artifact_selection.copy_attachments)
    return generator_cls(**settings), params


def create_contract(stage: PipelineStage) -> ContractValidator:
    stage_settings = stage.model_dump()
    kind = stage_settings.pop("kind")
    stage_settings.pop("id", None)
    stage_settings.pop("gated_by", None)
    stage_settings.pop("gates_downstream", None)
    validator_cls = _contract_map().get(kind)
    if validator_cls is None:
        raise KeyError(f"unknown contract kind {kind!r}")
    return validator_cls(**stage_settings)


def create_scorer(stage: PipelineStage, *, evaluator: Any | None = None) -> Scorer:
    stage_settings = stage.model_dump()
    kind = stage_settings.pop("kind")
    stage_settings.pop("id", None)
    stage_settings.pop("gated_by", None)
    stage_settings.pop("gates_downstream", None)
    if evaluator is not None:
        stage_settings.setdefault("model", evaluator.model)
        stage_settings.setdefault("reasoning_effort", evaluator.reasoning_effort)
        stage_settings.setdefault("temperature", evaluator.temperature)
        stage_settings.setdefault("top_p", evaluator.top_p)
    scorer_cls = _scorer_map().get(kind)
    if scorer_cls is None:
        raise KeyError(f"unknown scorer kind {kind!r}")
    return scorer_cls(**stage_settings)


def is_contract_stage(kind: str) -> bool:
    return kind in _contract_map()


def is_scorer_stage(kind: str) -> bool:
    return kind in _scorer_map()
