from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import typer

from smarteval.core.config import load_config
from smarteval.core.model_swap import select_variants_for_model_try
from smarteval.core.models import Verdict
from smarteval.core.rebaseline import rebaseline_evaluator
from smarteval.core.rescore import rescore_bakeoff
from smarteval.core.runner import (
    compare_summaries,
    doctor as doctor_check,
    estimate_bakeoff,
    load_run_records,
    read_summary,
    resume_bakeoff,
    run_bakeoff,
    write_verdict_note_stub,
)
from smarteval.ledger.reader import read_ledger
from smarteval.ledger.writer import append_verdict, ensure_ledger_layout
from smarteval.proposer.context import build_proposer_context
from smarteval.proposer.prompter import propose_variants

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
    typer.echo(json.dumps(estimate_bakeoff(config), indent=2))


@app.command("run")
def run(path: Path = Path("smarteval.yaml"), output_root: Path = Path("runs")) -> None:
    config = load_config(path)
    run_dir, summary = run_bakeoff(config, output_root=output_root)
    typer.echo(
        f"Completed bakeoff {summary.bakeoff_id} in {run_dir}. "
        f"Baseline={summary.baseline}, variants={len(summary.variants)}"
    )


@app.command("resume")
def resume(path: Path = Path("smarteval.yaml"), run_dir: Path = typer.Argument(...)) -> None:
    config = load_config(path)
    final_run_dir, summary = resume_bakeoff(config, run_dir=run_dir)
    typer.echo(f"Resumed bakeoff {summary.bakeoff_id} in {final_run_dir}")


@app.command("rescore")
def rescore(
    path: Path = Path("smarteval.yaml"),
    run_dir: Path = typer.Argument(...),
    rubric: Path | None = typer.Option(None),
) -> None:
    config = load_config(path)
    summary = rescore_bakeoff(config, run_dir=run_dir, rubric_path=rubric)
    typer.echo(f"Rescored {summary.bakeoff_id}")


@app.command("diff")
def diff(run_dir_a: Path = typer.Argument(...), run_dir_b: Path = typer.Argument(...)) -> None:
    typer.echo(json.dumps(compare_summaries(run_dir_a, run_dir_b), indent=2))


@app.command("log")
def log(path: Path = Path("smarteval.yaml"), tail: int = 20, status: str | None = None) -> None:
    config = load_config(path)
    ledger = read_ledger(config.project_root or Path.cwd())
    verdicts = ledger["verdicts"]
    if status is not None:
        verdicts = [item for item in verdicts if item.get("status") == status]
    verdicts = verdicts[-tail:]
    typer.echo(json.dumps({"variants": ledger["variants"][-tail:], "verdicts": verdicts}, indent=2))


@app.command("verdict")
def verdict(
    path: Path = Path("smarteval.yaml"),
    run_id: str = typer.Argument(...),
    status: str = typer.Option(...),
    promotion_level: str = typer.Option(...),
    rationale: str = typer.Option(...),
    author: str = typer.Option("human"),
    killed_by: str | None = typer.Option(None),
    follow_up_variant_id: str | None = typer.Option(None),
) -> None:
    config = load_config(path)
    ensure_ledger_layout(config.project_root or Path.cwd())
    verdict_obj = Verdict(
        run_id=run_id,
        status=status,
        promotion_level=promotion_level,
        rationale=rationale,
        killed_by=killed_by,
        follow_up_variant_id=follow_up_variant_id,
        author=author,
        timestamp=datetime.now(timezone.utc),
    )
    append_verdict(config.project_root or Path.cwd(), verdict_obj)
    note_path = write_verdict_note_stub(config.project_root or Path.cwd(), run_id)
    typer.echo(f"Recorded verdict for {run_id}. Note stub: {note_path}")


@app.command("doctor")
def doctor(path: Path = Path("smarteval.yaml")) -> None:
    config = load_config(path) if path.exists() else None
    typer.echo(json.dumps(doctor_check(config), indent=2))


@app.command("rebaseline")
def rebaseline(
    path: Path = Path("smarteval.yaml"),
    run_dir: Path = typer.Argument(...),
    from_model: str = typer.Option(..., "--from"),
    to_model: str = typer.Option(..., "--to"),
    approve: bool = typer.Option(False),
) -> None:
    payload = rebaseline_evaluator(
        path,
        run_dir=run_dir,
        from_model=from_model,
        to_model=to_model,
        approve=approve,
    )
    typer.echo(json.dumps(payload, indent=2))


@app.command("try-new-model")
def try_new_model(
    model_id: str = typer.Argument(...),
    path: Path = Path("smarteval.yaml"),
    variants: str = typer.Option("all"),
    output_root: Path = Path("runs"),
) -> None:
    config = load_config(path)
    ledger = read_ledger(config.project_root or Path.cwd())
    target_ids = select_variants_for_model_try(config, ledger, variants)
    for variant in config.variants:
        if variant.id in target_ids and variant.generator.kind in {"openai", "codex"}:
            variant.generator.model = model_id
    run_dir, summary = run_bakeoff(config, output_root=output_root)
    typer.echo(f"Tried model {model_id} in {run_dir} ({summary.bakeoff_id})")


@app.command("propose")
def propose(
    path: Path = Path("smarteval.yaml"),
    run_dir: Path = typer.Argument(...),
    n: int = 3,
    model: str | None = typer.Option(None),
) -> None:
    config = load_config(path)
    summary = read_summary(run_dir)
    records = list(load_run_records(run_dir).values())
    context = build_proposer_context(config, summary, records)
    ledger = read_ledger(config.project_root or Path.cwd())
    proposals = propose_variants(
        model=model or config.evaluator.model,
        context=context,
        n=n,
        verdicts=ledger["verdicts"],
    )
    typer.echo(json.dumps([item.model_dump() for item in proposals], indent=2))


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
