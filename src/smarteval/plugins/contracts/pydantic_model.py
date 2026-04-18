from __future__ import annotations

from smarteval.core.models import Artifact, Case, ContractResult
from smarteval.plugins.base import ContractValidator
from smarteval.plugins.registry import load_callable


class PydanticModelValidator(ContractValidator):
    kind = "pydantic_model"

    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        model_cls = load_callable(self.settings["model"])
        try:
            model_cls.model_validate(artifact.payload)
            return ContractResult(passed=True)
        except Exception as exc:  # noqa: BLE001
            return ContractResult(passed=False, violations=[str(exc)])
