from __future__ import annotations

from typing import Any


def build_openai_client(**kwargs: Any) -> Any:
    from openai import OpenAI

    return OpenAI(**kwargs)
