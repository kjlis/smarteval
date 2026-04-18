from __future__ import annotations

from smarteval.core.models import Artifact, Case, ContractResult
from smarteval.plugins.base import ContractValidator
from smarteval.plugins.registry import load_callable


class CustomPredicateValidator(ContractValidator):
    kind = "custom_predicate"

    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        predicate = load_callable(self.settings["callable"])
        result = predicate(case=case, artifact=artifact, settings=self.settings)
        if isinstance(result, ContractResult):
            return result
        if result is True:
            return ContractResult(passed=True)
        return ContractResult(passed=False, violations=[str(result)])
