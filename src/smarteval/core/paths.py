from __future__ import annotations

from pathlib import Path


def smarteval_root(project_root: str | Path) -> Path:
    return Path(project_root) / ".smarteval"


def ledger_root(project_root: str | Path) -> Path:
    return smarteval_root(project_root) / "ledger"


def optimization_runs_root(project_root: str | Path) -> Path:
    return smarteval_root(project_root) / "optimization-runs"


def default_run_root(project_root: str | Path) -> Path:
    return smarteval_root(project_root) / "runs"


def resolve_output_root(project_root: str | Path, output_root: str | Path) -> Path:
    path = Path(output_root)
    if not path.is_absolute() and path == Path("runs"):
        return default_run_root(project_root)
    return path
