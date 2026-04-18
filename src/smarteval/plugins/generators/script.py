from __future__ import annotations

from collections.abc import Callable
from typing import Any

from smarteval.core.models import Artifact, Case
from smarteval.plugins.base import Generator
from smarteval.plugins.registry import load_callable


class ScriptGenerator(Generator):
    name = "script"

    def generate(self, case: Case, params: dict[str, Any]) -> Artifact:
        target = params.get("callable", self.settings.get("callable"))
        if target is None:
            raise ValueError("script generator requires a callable")

        func = load_callable(target)
        result = func(case=case, params=params)
        if isinstance(result, Artifact):
            return result
        return Artifact(kind="text", payload=str(result))
