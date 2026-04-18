from __future__ import annotations

import re

from smarteval.core.models import Artifact, Case, ContractResult
from smarteval.plugins.base import ContractValidator


class RegexValidator(ContractValidator):
    kind = "regex"

    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        pattern = self.settings["pattern"]
        if re.search(pattern, artifact.to_prompt_text(), flags=re.MULTILINE):
            return ContractResult(passed=True)
        return ContractResult(passed=False, violations=[f"artifact does not match regex {pattern!r}"])
