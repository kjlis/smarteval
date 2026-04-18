from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from smarteval.core.config import load_config
from smarteval.core.models import Variant, VariantProposal
from smarteval.core.runner import load_run_records, read_summary, run_bakeoff
from smarteval.ledger.reader import read_ledger
from smarteval.ledger.writer import append_materialized_proposals, append_proposal_attempts
from smarteval.proposer.context import build_proposer_context
from smarteval.proposer.materialize import materialize_proposals
from smarteval.proposer.prompter import propose_variants_with_reviews


def run_optimization_loop(
    *,
    path: str | Path,
    rounds: int = 5,
    proposals_per_round: int = 3,
    output_root: str | Path = "runs",
    model: str | None = None,
    backend: str = "codex_local",
    codex_bin: str | None = None,
    propose_fn: Callable[..., tuple[list[VariantProposal], list[Any]]] = propose_variants_with_reviews,
    proposer_client: Any | None = None,
) -> dict[str, Any]:
    config = load_config(path)
    project_root = Path(config.project_root or Path.cwd())
    trace_path = _new_trace_path(project_root)

    initial_run_dir, initial_summary = run_bakeoff(config, output_root=output_root)
    current_run_dir = initial_run_dir
    current_variants = list(config.variants)

    trace: dict[str, Any] = {
        "config_path": str(Path(path).resolve()),
        "rounds_requested": rounds,
        "rounds_completed": 0,
        "proposals_per_round": proposals_per_round,
        "proposer_backend": backend,
        "proposer_model": model or config.evaluator.model,
        "initial_run_dir": str(initial_run_dir),
        "initial_best_variant_id": _best_variant_id(initial_summary),
        "initial_best_mean_score": _best_mean_score(initial_summary),
        "rounds": [],
        "final_run_dir": str(initial_run_dir),
    }
    _write_trace(trace_path, trace)

    for round_index in range(1, rounds + 1):
        round_config = deepcopy(config)
        round_config.variants = current_variants

        summary = read_summary(current_run_dir)
        records = list(load_run_records(current_run_dir).values())
        context = build_proposer_context(round_config, summary, records)
        ledger = read_ledger(project_root)

        proposal_result = propose_fn(
            model=model or config.evaluator.model,
            context=context,
            n=proposals_per_round,
            backend=backend,
            codex_bin=codex_bin,
            client=proposer_client,
            verdicts=ledger["verdicts"],
        )
        if isinstance(proposal_result, tuple):
            proposals, reviews = proposal_result
        else:
            proposals = proposal_result
            reviews = []
        round_entry: dict[str, Any] = {
            "round": round_index,
            "source_run_dir": str(current_run_dir),
            "proposal_count": len(proposals),
            "rejected_proposal_count": len([item for item in reviews if item.status != "accepted"]),
            "proposal_parent_ids": [proposal.parent_variant_id for proposal in proposals],
        }
        rejected_reviews = [item for item in reviews if item.status != "accepted"]
        if rejected_reviews:
            append_proposal_attempts(
                project_root,
                rejected_reviews,
                source_run_dir=str(current_run_dir),
            )
            round_entry["rejected_proposals"] = [
                {
                    "status": item.status,
                    "parent_variant_id": item.proposal.parent_variant_id,
                    "rationale": item.proposal.rationale,
                    "diff": item.proposal.diff,
                    "duplicate_of_variant_id": item.duplicate_of_variant_id,
                    "similarity": item.similarity,
                }
                for item in rejected_reviews
            ]
        if not proposals:
            round_entry["status"] = "stopped_no_proposals"
            trace["rounds"].append(round_entry)
            trace["final_run_dir"] = str(current_run_dir)
            _write_trace(trace_path, trace)
            break

        materialized = materialize_proposals(current_variants, proposals)
        append_materialized_proposals(project_root, materialized, proposals)
        append_proposal_attempts(
            project_root,
            [item for item in reviews if item.status == "accepted"],
            source_run_dir=str(current_run_dir),
            materialized_variants=materialized,
        )

        baseline_variant = _baseline_variant(current_variants, config.baseline)
        queued_config = deepcopy(config)
        queued_config.variants = [baseline_variant, *materialized]
        queued_run_dir, queued_summary = run_bakeoff(queued_config, output_root=output_root)

        round_entry["status"] = "completed"
        round_entry["queued_variant_ids"] = [variant.id for variant in materialized]
        round_entry["queued_run_dir"] = str(queued_run_dir)
        round_entry["best_variant_id"] = _best_variant_id(queued_summary)
        round_entry["best_mean_score"] = _best_mean_score(queued_summary)
        trace["rounds"].append(round_entry)
        trace["rounds_completed"] = round_index
        trace["final_run_dir"] = str(queued_run_dir)
        _write_trace(trace_path, trace)

        current_run_dir = queued_run_dir
        current_variants = [baseline_variant, *materialized]

    trace["trace_path"] = str(trace_path)
    _write_trace(trace_path, trace)
    return trace


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run multi-round smarteval optimization.")
    parser.add_argument("--path", required=True, help="Path to smarteval config.")
    parser.add_argument("--rounds", type=int, default=5, help="Number of propose/improve rounds to run.")
    parser.add_argument(
        "--proposals-per-round",
        type=int,
        default=3,
        help="Maximum number of proposals to request per round.",
    )
    parser.add_argument("--output-root", default="runs", help="Directory for bakeoff run outputs.")
    parser.add_argument("--model", default=None, help="Optional proposer model override.")
    parser.add_argument("--backend", default="codex_local", help="Proposer backend: codex_local or openai.")
    parser.add_argument("--codex-bin", default=None, help="Optional explicit path to the codex binary.")
    args = parser.parse_args(argv)

    trace = run_optimization_loop(
        path=args.path,
        rounds=args.rounds,
        proposals_per_round=args.proposals_per_round,
        output_root=args.output_root,
        model=args.model,
        backend=args.backend,
        codex_bin=args.codex_bin,
    )
    print(json.dumps(trace, indent=2))
    return 0


def _best_variant_id(summary) -> str | None:
    if not summary.variants:
        return None
    best = max(summary.variants, key=lambda item: item.mean_score if item.mean_score is not None else -1.0)
    return best.variant_id


def _best_mean_score(summary) -> float | None:
    if not summary.variants:
        return None
    best = max(summary.variants, key=lambda item: item.mean_score if item.mean_score is not None else -1.0)
    return best.mean_score


def _baseline_variant(variants: list[Variant], baseline_id: str) -> Variant:
    for variant in variants:
        if variant.id == baseline_id:
            return variant
    raise KeyError(f"baseline variant {baseline_id!r} was not available in the current round")


def _new_trace_path(project_root: Path) -> Path:
    trace_dir = project_root / ".smarteval" / "optimization-runs"
    trace_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    return trace_dir / f"{timestamp}.json"


def _write_trace(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
