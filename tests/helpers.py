from __future__ import annotations

from pydantic import BaseModel

from smarteval.core.models import Artifact, Case


def echo_expected(*, case: Case, params: dict) -> Artifact:
    answer = case.expected["answer"] if case.expected else ""
    return Artifact(kind="text", payload=answer)


def always_wrong(*, case: Case, params: dict) -> Artifact:
    return Artifact(kind="text", payload="wrong")


class DemoModel(BaseModel):
    summary: str
