from __future__ import annotations

from smarteval.core.models import Artifact, Case, ContractResult, Score
from smarteval.core.similarity import expected_text, similarity_from_text
from smarteval.plugins.base import Scorer


class EmbeddingSimScorer(Scorer):
    kind = "embedding_sim"

    def score(
        self,
        case: Case,
        artifact: Artifact,
        contract: ContractResult,
        prior_scores: list[Score],
    ) -> Score:
        threshold = float(self.settings.get("threshold", 0.8))
        similarity = similarity_from_text(artifact.to_prompt_text(), expected_text(case.expected))
        return Score(
            name=self.kind,
            value=similarity,
            passed=similarity >= threshold,
            raw={"threshold": threshold},
        )
