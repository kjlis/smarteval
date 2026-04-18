from __future__ import annotations

from typing import Any


def build_codex_client(*, codex_bin: str | None = None) -> Any:
    try:
        from codex_app_server import AppServerConfig, Codex
    except ImportError as exc:  # pragma: no cover - depends on optional local SDK install
        raise RuntimeError(
            "codex_local evaluator backend requires the experimental Codex Python SDK. "
            "Install it from a local openai/codex checkout as documented at "
            "https://developers.openai.com/codex/sdk#python-library ."
        ) from exc

    if codex_bin is None:
        return Codex()

    config = AppServerConfig(codex_bin=codex_bin)

    try:
        return Codex(app_server_config=config)
    except TypeError:
        return Codex(config)
