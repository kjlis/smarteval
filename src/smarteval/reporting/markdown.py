from __future__ import annotations

from pathlib import Path

from smarteval.core.models import BakeoffSummary


def write_summary_markdown(path: str | Path, summary: BakeoffSummary) -> None:
    lines = [
        f"# Bakeoff {summary.bakeoff_id}",
        "",
        (
            f"Baseline: `{summary.baseline}` · Evaluator fingerprint: "
            f"`{summary.evaluator_fingerprint}` · Golden hash: `{summary.golden_hash}`"
        ),
        "",
        "## Aggregate",
        "",
        "| Variant | Runs | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]

    for variant in summary.variants:
        delta = "ref" if variant.delta_vs_baseline is None else f"{variant.delta_vs_baseline:+.3f}"
        mean_score = "n/a" if variant.mean_score is None else f"{variant.mean_score:.3f}"
        lines.append(
            "| "
            f"{variant.variant_id} | {variant.run_count} | {variant.pass_rate:.2%} | "
            f"{mean_score} | {delta} | {variant.mean_duration_ms:.1f} | ${variant.mean_cost_usd:.4f} |"
        )

    lines.extend(["", "## Regressions", ""])
    if summary.regressions:
        lines.extend(f"- {item}" for item in summary.regressions)
    else:
        lines.append("- None")

    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
