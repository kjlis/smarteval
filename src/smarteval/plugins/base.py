from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from smarteval.core.models import Artifact, Case, ContractResult, Score


class Generator(ABC):
    name: str

    def __init__(self, **settings: Any) -> None:
        self.settings = settings

    @abstractmethod
    def generate(self, case: Case, params: dict[str, Any]) -> Artifact:
        raise NotImplementedError


class ContractValidator(ABC):
    kind: str

    def __init__(self, **settings: Any) -> None:
        self.settings = settings

    @abstractmethod
    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        raise NotImplementedError


class Scorer(ABC):
    kind: str

    def __init__(self, **settings: Any) -> None:
        self.settings = settings

    @abstractmethod
    def score(
        self,
        case: Case,
        artifact: Artifact,
        contract: ContractResult,
        prior_scores: list[Score],
    ) -> Score:
        raise NotImplementedError
