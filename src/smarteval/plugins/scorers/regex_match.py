from __future__ import annotations

import re

from smarteval.core.models import Artifact, Case, ContractResult, Score
from smarteval.plugins.base import Scorer


class RegexMatchScorer(Scorer):
    kind = "regex_match"

    def score(
        self,
        case: Case,
        artifact: Artifact,
        contract: ContractResult,
        prior_scores: list[Score],
    ) -> Score:
        pattern = self.settings["pattern"]
        passed = re.search(pattern, artifact.to_prompt_text(), flags=re.MULTILINE) is not None
        return Score(name=self.kind, value=1.0 if passed else 0.0, passed=passed, raw={"pattern": pattern})
