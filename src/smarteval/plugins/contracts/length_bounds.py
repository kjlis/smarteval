from __future__ import annotations

from smarteval.core.models import Artifact, Case, ContractResult
from smarteval.plugins.base import ContractValidator


class LengthBoundsValidator(ContractValidator):
    kind = "length_bounds"

    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        text = artifact.to_prompt_text()
        min_length = int(self.settings.get("min_length", 0))
        max_length = self.settings.get("max_length")
        violations: list[str] = []
        if len(text) < min_length:
            violations.append(f"artifact length {len(text)} below minimum {min_length}")
        if max_length is not None and len(text) > int(max_length):
            violations.append(f"artifact length {len(text)} above maximum {max_length}")
        return ContractResult(passed=not violations, violations=violations)
