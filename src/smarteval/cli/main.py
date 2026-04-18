from __future__ import annotations

import json
from pathlib import Path

import typer

from smarteval.core.config import load_config
from smarteval.core.runner import estimate_bakeoff, run_bakeoff

app = typer.Typer(help="smarteval command line interface.")


@app.callback()
def main() -> None:
    """smarteval command line interface."""


@app.command("validate-config")
def validate_config(path: Path = Path("smarteval.yaml")) -> None:
    config = load_config(path)
    typer.echo(
        f"Config OK: {len(config.variants)} variants, "
        f"primary_output={config.artifact_selection.primary_output!r}"
    )


@app.command("estimate")
def estimate(path: Path = Path("smarteval.yaml")) -> None:
    config = load_config(path)
    payload = estimate_bakeoff(config)
    typer.echo(json.dumps(payload, indent=2))


@app.command("run")
def run(path: Path = Path("smarteval.yaml"), output_root: Path = Path("runs")) -> None:
    config = load_config(path)
    run_dir, summary = run_bakeoff(config, output_root=output_root)
    typer.echo(
        f"Completed bakeoff {summary.bakeoff_id} in {run_dir}. "
        f"Baseline={summary.baseline}, variants={len(summary.variants)}"
    )


@app.command("init")
def init(
    path: Path = Path("smarteval.yaml"),
    golden_set: Path = Path("golden.jsonl"),
    prompt_path: Path = Path("prompts/baseline.txt"),
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    if not golden_set.exists():
        golden_set.write_text(
            (
                '{"id":"q1","input":{"question":"What is 2+2?"},"expected":{"answer":"4"},'
                '"tags":["arithmetic"],"added_at":"2026-04-17"}\n'
            ),
            encoding="utf-8",
        )
    if not prompt_path.exists():
        prompt_path.write_text("Answer the question.\n{input_json}\n", encoding="utf-8")
    if not path.exists():
        path.write_text(
            (
                "version: 1\n"
                f"golden_set: {golden_set}\n"
                "baseline: baseline\n"
                "evaluator:\n"
                "  model: gpt-5-mini\n"
                "variants:\n"
                "  - id: baseline\n"
                "    generator:\n"
                "      kind: openai\n"
                "      model: gpt-5-mini\n"
                "    params:\n"
                f"      prompt: {prompt_path}\n"
                "pipeline:\n"
                "  - id: quality\n"
                "    kind: exact_match\n"
            ),
            encoding="utf-8",
        )
    typer.echo(f"Initialized config at {path}")


if __name__ == "__main__":
    app()
