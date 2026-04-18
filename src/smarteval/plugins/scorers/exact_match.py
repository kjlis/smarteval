from __future__ import annotations

from typing import Any

from smarteval.core.models import Artifact, Case, ContractResult, Score
from smarteval.plugins.base import Scorer


class ExactMatchScorer(Scorer):
    kind = "exact_match"

    def score(
        self,
        case: Case,
        artifact: Artifact,
        contract: ContractResult,
        prior_scores: list[Score],
    ) -> Score:
        fields = self.settings.get("fields")
        if fields:
            if not isinstance(case.expected, dict):
                return Score(name=self.kind, value=0.0, passed=False, raw={"reason": "expected missing"})
            candidate = artifact.payload if isinstance(artifact.payload, dict) else {}
            matches = [candidate.get(field) == case.expected.get(field) for field in fields]
            value = sum(1 for matched in matches if matched) / len(matches)
            return Score(name=self.kind, value=value, passed=value == 1.0, raw={"fields": fields})

        expected_value = _resolve_expected_value(case.expected)
        actual_value = artifact.payload if artifact.kind != "json" else artifact.payload
        passed = actual_value == expected_value
        return Score(name=self.kind, value=1.0 if passed else 0.0, passed=passed, raw={"expected": expected_value})


def _resolve_expected_value(expected: Any) -> Any:
    if isinstance(expected, dict) and "answer" in expected:
        return expected["answer"]
    return expected
