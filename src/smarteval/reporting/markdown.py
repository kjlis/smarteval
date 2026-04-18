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
        f"Total cost: ${summary.total_cost_usd:.4f} · Duration: {summary.total_duration_ms}ms",
        "",
        "## Aggregate",
        "",
        "| Variant | Pass rate | Mean score | Δ vs baseline | Mean duration ms | Mean cost |",
        "|---|---:|---:|---:|---:|---:|",
    ]

    for variant in summary.variants:
        delta = "ref" if variant.delta_vs_baseline is None else f"{variant.delta_vs_baseline:+.3f}"
        mean_score = "n/a" if variant.mean_score is None else f"{variant.mean_score:.3f}"
        pass_ci = (
            ""
            if variant.pass_rate_ci_low is None or variant.pass_rate_ci_high is None
            else f" ({variant.pass_rate_ci_low:.2%}-{variant.pass_rate_ci_high:.2%})"
        )
        lines.append(
            "| "
            f"{variant.variant_id} | {variant.pass_rate:.2%}{pass_ci} | "
            f"{mean_score} | {delta} | {variant.mean_duration_ms:.1f} | ${variant.mean_cost_usd:.4f} |"
        )

    lines.extend(["", "## Per-slice", ""])
    if summary.per_slice:
        lines.extend(
            f"- `{item.variant_id}` on `{item.slice_name}`: score={_fmt(item.mean_score)} delta={_fmt(item.delta_vs_baseline)} n={item.run_count}"
            for item in summary.per_slice
        )
    else:
        lines.append("- None")

    lines.extend(["", "## Specialist candidates", ""])
    if summary.specialists:
        lines.extend(
            f"- `{item.variant_id}` → `{item.slice_name}` lift {item.lift_vs_baseline:+.3f} (n={item.n_runs})"
            for item in summary.specialists
        )
    else:
        lines.append("- None")

    lines.extend(["", "## Regressions", ""])
    if summary.regressions:
        lines.extend(f"- {item}" for item in summary.regressions)
    else:
        lines.append("- None")

    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:+.3f}"
