from __future__ import annotations

from smarteval.core.models import Artifact, Case


def answer_case(*, case: Case, params: dict) -> Artifact:
    question = str(case.input.get("question", ""))
    if "2+2" in question:
        return Artifact(kind="text", payload="4")
    return Artifact(kind="text", payload=str(params.get("default_answer", "unknown")))
